"""
engine/espn_client.py
──────────────────────
League-agnostic client for ESPN's public "site API" (the same
`site.api.espn.com/apis/site/v2/sports/<sport>/<league>/...` shape is used
for NFL, NBA, MLB, NHL, college football, etc.) — HTTP fetching with retry,
and parsing of the common scoreboard/standings/odds JSON shape.

What's genuinely shared across leagues lives here: request/retry mechanics,
the season-type convention (1=pre, 2=regular, 3=post), and the
scoreboard/standings/odds field layout.

What differs per league is supplied by a LeagueConfig, built once in each
leagues/<league>/builders/espn_fetcher.py: the URL path segments, the
division/conference groupings, postseason round labels/count, and how a
raw conference name string maps to that league's short conference codes.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

import requests

logger = logging.getLogger(__name__)

# ESPN season type codes — consistent across every ESPN site-API sport.
SEASON_TYPE_PRESEASON  = 1
SEASON_TYPE_REGULAR    = 2
SEASON_TYPE_POSTSEASON = 3


@dataclass(frozen=True)
class LeagueConfig:
    """League-specific parameters the generic ESPN client needs."""
    sport:                   str                    # e.g. "football"
    league:                  str                    # e.g. "nfl"
    division_map:            dict[str, str]         # abbr → division key
    conference_map:          dict[str, str]         # abbr → conference key
    postseason_week_labels:  dict[int, str]         # round number → label
    postseason_rounds:       int                    # total postseason rounds
    regular_season_weeks:    int                    # weeks in a regular season
    normalize_conference:    Callable[[str], str]    # raw ESPN conf name → this league's code

    @property
    def base_url(self) -> str:
        return f"https://site.api.espn.com/apis/site/v2/sports/{self.sport}/{self.league}"


def _get(url: str, params: dict | None = None, retries: int = 3) -> dict[str, Any]:
    """HTTP GET with simple retry logic."""
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.warning("Attempt %d failed for %s: %s", attempt + 1, url, exc)
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise


def safe_int(val: Any) -> int | None:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def parse_odds(comp: dict) -> dict[str, Any] | None:
    """
    Extract betting odds from a competition object.

    ESPN returns odds inside competitions[0].odds[] (sorted by provider priority).
    Returns None when the game has no odds data.

    Returned dict:
      spread          : float   — negative = home favored (e.g. -7.5)
      home_moneyline  : int     — negative = favorite (e.g. -325)
      away_moneyline  : int     — positive = underdog  (e.g. +260)
      home_is_favorite: bool
      home_is_underdog: bool
      details         : str     — e.g. "KC -7.5"
    """
    odds_list = comp.get("odds", [])
    if not odds_list:
        return None

    # Use first entry (highest-priority provider, usually ESPN BET)
    o = odds_list[0]
    spread = o.get("spread")
    if spread is None:
        return None

    home_o = o.get("homeTeamOdds", {})
    away_o = o.get("awayTeamOdds", {})

    home_ml = safe_int(home_o.get("moneyLine"))
    away_ml = safe_int(away_o.get("moneyLine"))

    # ESPN sometimes omits the favorite/underdog booleans; infer from moneyline if needed
    if home_ml is not None and away_ml is not None:
        home_is_fav = home_ml < away_ml
    else:
        home_is_fav = bool(home_o.get("favorite", False))

    return {
        "spread"          : float(spread),
        "home_moneyline"  : home_ml,
        "away_moneyline"  : away_ml,
        "home_is_favorite": home_is_fav,
        "home_is_underdog": not home_is_fav,
        "details"         : o.get("details", ""),
    }


class EspnClient:
    """Fetch + parse ESPN site-API data for one league, per `config`."""

    def __init__(self, config: LeagueConfig) -> None:
        self.config = config

    # ── Fetching ──────────────────────────────────────────────────────────────

    def fetch_scoreboard(
        self,
        week: int | None = None,
        season: int | None = None,
        season_type: int = SEASON_TYPE_REGULAR,
    ) -> dict[str, Any]:
        """
        Fetch the scoreboard.

        Parameters
        ----------
        week        : specific week number. None = current week.
        season      : 4-digit season year. None = current season.
        season_type : 1=Preseason, 2=Regular (default), 3=Postseason.
        """
        params: dict[str, Any] = {"seasontype": season_type}
        if week is not None:
            params["week"] = week
        if season is not None:
            params["dates"] = season
        logger.info("Fetching scoreboard: %s", params)
        return _get(f"{self.config.base_url}/scoreboard", params=params)

    def fetch_postseason_scoreboard(
        self,
        week: int,
        season: int | None = None,
    ) -> dict[str, Any]:
        """Fetch a specific postseason round (round numbers per config.postseason_week_labels)."""
        return self.fetch_scoreboard(week=week, season=season,
                                      season_type=SEASON_TYPE_POSTSEASON)

    def fetch_full_postseason(self, season: int | None = None) -> list[dict[str, Any]]:
        """Fetch all postseason rounds for a season. Returns one raw payload per round with games."""
        results = []
        for week in range(1, self.config.postseason_rounds + 1):
            try:
                data = self.fetch_postseason_scoreboard(week=week, season=season)
                if data.get("events"):
                    results.append(data)
                    logger.info("Postseason week %d (%s): %d games",
                                week, self.config.postseason_week_labels.get(week, "?"),
                                len(data["events"]))
                else:
                    logger.debug("Postseason week %d: no events", week)
            except Exception as exc:
                logger.warning("Postseason week %d fetch failed: %s", week, exc)
        return results

    def fetch_standings(self) -> dict[str, Any]:
        """Fetch current standings."""
        logger.info("Fetching standings")
        return _get(f"{self.config.base_url}/standings")

    def fetch_standings_season(self, season_year: int) -> dict[str, Any]:
        """Fetch standings for a specific season year (e.g. for prev-season fallback)."""
        logger.info("Fetching standings for season %d", season_year)
        return _get(f"{self.config.base_url}/standings", params={"dates": season_year})

    def fetch_team(self, team_id: str) -> dict[str, Any]:
        """Fetch detail for a single team."""
        return _get(f"{self.config.base_url}/teams/{team_id}")

    # ── Parsing ───────────────────────────────────────────────────────────────

    def parse_scoreboard(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Extract a clean, normalised representation from the raw ESPN scoreboard JSON.

        Returns
        -------
        {
            "season"     : int,
            "season_type": str,   # "Regular Season" | "Postseason" | "Preseason"
            "season_type_id": int, # 1 | 2 | 3
            "week"       : int,
            "week_label" : str,   # "Week 14" | this league's postseason label
            "is_postseason": bool,
            "games"      : [<game_dict>, ...]
        }
        """
        season_data   = data.get("season", {})
        week_data     = data.get("week", {})
        events        = data.get("events", [])

        season_year     = season_data.get("year", 0)
        season_type_obj = season_data.get("type", {})

        # ESPN returns season.type as either a dict {"id":2,"name":"Regular Season"}
        # or a bare integer during the offseason
        if isinstance(season_type_obj, dict):
            season_type_str = season_type_obj.get("name", "Unknown")
            season_type_id  = season_type_obj.get("id", 2)
        else:
            season_type_id  = int(season_type_obj) if season_type_obj else 2
            season_type_str = {
                1: "Preseason",
                2: "Regular Season",
                3: "Postseason",
            }.get(season_type_id, "Unknown")

        try:
            season_type_id = int(season_type_id)
        except (TypeError, ValueError):
            season_type_id = 2

        week_number  = week_data.get("number", 0)
        is_postseason = season_type_id == SEASON_TYPE_POSTSEASON

        # Human-readable week label
        if is_postseason:
            week_label = self.config.postseason_week_labels.get(
                week_number, f"Postseason Week {week_number}")
        else:
            week_label = f"Week {week_number}"

        games = []
        for event in events:
            competitions = event.get("competitions", [])
            if not competitions:
                continue
            comp = competitions[0]

            competitors = {
                c["homeAway"]: c
                for c in comp.get("competitors", [])
            }
            home_comp = competitors.get("home", {})
            away_comp = competitors.get("away", {})

            status      = event.get("status", {})
            status_type = status.get("type", {})

            home_score = safe_int(home_comp.get("score"))
            away_score = safe_int(away_comp.get("score"))
            status_val = status_type.get("state", "pre")

            winner_abbr: str | None = None
            loser_abbr:  str | None = None
            if status_val == "post" and home_score is not None and away_score is not None:
                if home_score > away_score:
                    winner_abbr = self._team_abbr(home_comp)
                    loser_abbr  = self._team_abbr(away_comp)
                elif away_score > home_score:
                    winner_abbr = self._team_abbr(away_comp)
                    loser_abbr  = self._team_abbr(home_comp)

            game = {
                "id"            : event.get("id", ""),
                "name"          : event.get("name", ""),
                "week"          : week_number,
                "season"        : season_year,
                "season_type"   : season_type_str,
                "season_type_id": season_type_id,
                "is_postseason" : is_postseason,
                "week_label"    : week_label,
                "start_time"    : event.get("date", ""),
                "status"        : status_val,
                "status_detail" : status_type.get("detail", ""),
                "venue"         : comp.get("venue", {}).get("fullName", ""),
                "home"          : self._parse_competitor(home_comp),
                "away"          : self._parse_competitor(away_comp),
                "home_score"    : home_score,
                "away_score"    : away_score,
                "winner_abbr"   : winner_abbr,
                "loser_abbr"    : loser_abbr,
                "odds"          : parse_odds(comp),
            }
            games.append(game)

        return {
            "season"        : season_year,
            "season_type"   : season_type_str,
            "season_type_id": season_type_id,
            "week"          : week_number,
            "week_label"    : week_label,
            "is_postseason" : is_postseason,
            "games"         : games,
        }

    def parse_standings(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Extract per-team standing records from the ESPN standings payload.

        Returns a flat list of dicts:
        {
            "abbr"      : str,
            "name"      : str,
            "wins"      : int,
            "losses"    : int,
            "ties"      : int,
            "win_pct"   : float,
            "points_for": int,
            "points_against": int,
            "division"  : str,
            "conference": str,
        }
        """
        results = []
        for child in data.get("children", []):          # conference
            conf_name = child.get("name", "")
            for division in child.get("children", []):  # division
                div_name = division.get("name", "")
                div_key  = div_name.replace(" ", "")
                for entry in division.get("standings", {}).get("entries", []):
                    team_ref = entry.get("team", {})
                    abbr     = team_ref.get("abbreviation", "")
                    stats    = {s["name"]: s["value"] for s in entry.get("stats", [])}
                    results.append({
                        "abbr"          : abbr,
                        "name"          : team_ref.get("displayName", ""),
                        "wins"          : int(stats.get("wins", 0)),
                        "losses"        : int(stats.get("losses", 0)),
                        "ties"          : int(stats.get("ties", 0)),
                        "win_pct"       : float(stats.get("winPercent", 0.0)),
                        "points_for"    : int(stats.get("pointsFor", 0)),
                        "points_against": int(stats.get("pointsAgainst", 0)),
                        "division"      : div_key,
                        "conference"    : self.config.normalize_conference(conf_name),
                    })
        return results

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _parse_competitor(self, comp: dict) -> dict[str, Any]:
        team = comp.get("team", {})
        abbr = team.get("abbreviation", "").upper()
        record_summary = comp.get("records", [{}])[0].get("summary", "0-0-0") if comp.get("records") else "0-0-0"
        parts = (record_summary + "-0").split("-")
        wins   = safe_int(parts[0]) or 0
        losses = safe_int(parts[1]) or 0
        ties   = safe_int(parts[2]) or 0
        return {
            "id"        : team.get("id", ""),
            "uid"       : team.get("uid", ""),
            "abbr"      : abbr,
            "name"      : team.get("displayName", ""),
            "short_name": team.get("shortDisplayName", ""),
            "location"  : team.get("location", ""),
            "logo"      : (team.get("logos") or [{}])[0].get("href", ""),
            "color"     : team.get("color", ""),
            "record"    : record_summary,
            "wins"      : wins,
            "losses"    : losses,
            "ties"      : ties,
            "conference": self.config.conference_map.get(abbr, ""),
            "division"  : self.config.division_map.get(abbr, ""),
        }

    @staticmethod
    def _team_abbr(comp: dict) -> str:
        return comp.get("team", {}).get("abbreviation", "").upper()
