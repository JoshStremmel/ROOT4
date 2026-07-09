"""
espn_fetcher.py (MLB)
─────────────────────
MLB configuration for the generic ESPN client (engine/espn_client.py).

Mirrors leagues/nfl/builders/espn_fetcher.py: all HTTP fetching and ESPN
JSON parsing is league-agnostic and lives in engine/espn_client.py — this
module supplies MLB's specifics (URL path, the two leagues = "conferences",
division groupings, postseason round labels) and re-exports the bound
fetch_*/parse_* functions so the rest of leagues/mlb/ can import them by bare
name, e.g. `from espn_fetcher import fetch_scoreboard, parse_scoreboard`.

Baseball has no "week" — the daily scoreboard is fetched by date. Use
`fetch_scoreboard_date("YYYYMMDD")` (a thin wrapper over the client's `dates`
param) for a single day.

Endpoints
─────────
Daily scoreboard:  https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=YYYYMMDD
Standings:         https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/standings
"""

from __future__ import annotations

from engine.espn_client import (
    EspnClient,
    LeagueConfig,
    _get,
    SEASON_TYPE_PRESEASON,
    SEASON_TYPE_REGULAR,
    SEASON_TYPE_POSTSEASON,
)

# MLB standings live on the apis/v2 host path (the site/v2 path used for
# scoreboards returns only a "fullViewLink" stub for baseball).
MLB_STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings"

# MLB has no fixed weekly cadence; this nominal value keeps the shared config
# happy (the day-based ingester fetches by date, not week).
REGULAR_SEASON_WEEKS   = 27
POSTSEASON_WEEKS_COUNT = 4

# Postseason round labels (ESPN "week" numbers within seasontype=3).
POSTSEASON_WEEKS = {
    1: "Wild Card Series",
    2: "Division Series",
    3: "League Championship Series",
    4: "World Series",
}

# Divisional mapping for all 30 teams (ESPN abbreviation → division key).
DIVISION_MAP: dict[str, str] = {
    # American League
    "BAL": "ALEast",    "BOS": "ALEast",    "NYY": "ALEast",  "TB":  "ALEast",    "TOR": "ALEast",
    "CHW": "ALCentral", "CLE": "ALCentral", "DET": "ALCentral", "KC": "ALCentral", "MIN": "ALCentral",
    "HOU": "ALWest",    "LAA": "ALWest",    "ATH": "ALWest",  "SEA": "ALWest",    "TEX": "ALWest",
    # National League
    "ATL": "NLEast",    "MIA": "NLEast",    "NYM": "NLEast",  "PHI": "NLEast",    "WSH": "NLEast",
    "CHC": "NLCentral", "CIN": "NLCentral", "MIL": "NLCentral", "PIT": "NLCentral", "STL": "NLCentral",
    "ARI": "NLWest",    "COL": "NLWest",    "LAD": "NLWest",  "SD":  "NLWest",    "SF":  "NLWest",
}

CONFERENCE_MAP: dict[str, str] = {
    **{k: "AL" for k in ["BAL","BOS","NYY","TB","TOR","CHW","CLE","DET","KC","MIN",
                          "HOU","LAA","ATH","SEA","TEX"]},
    **{k: "NL" for k in ["ATL","MIA","NYM","PHI","WSH","CHC","CIN","MIL","PIT","STL",
                          "ARI","COL","LAD","SD","SF"]},
}

# Division rivals (5 teams per division).
DIVISION_RIVALS: dict[str, list[str]] = {
    "ALEast":    ["BAL","BOS","NYY","TB","TOR"],
    "ALCentral": ["CHW","CLE","DET","KC","MIN"],
    "ALWest":    ["HOU","LAA","ATH","SEA","TEX"],
    "NLEast":    ["ATL","MIA","NYM","PHI","WSH"],
    "NLCentral": ["CHC","CIN","MIL","PIT","STL"],
    "NLWest":    ["ARI","COL","LAD","SD","SF"],
}


def _normalize_conference(name: str) -> str:
    """Map an ESPN conference name ('American League' / 'National League') to AL / NL."""
    return "AL" if "American" in name else "NL"


_CONFIG = LeagueConfig(
    sport="baseball",
    league="mlb",
    division_map=DIVISION_MAP,
    conference_map=CONFERENCE_MAP,
    postseason_week_labels=POSTSEASON_WEEKS,
    postseason_rounds=POSTSEASON_WEEKS_COUNT,
    regular_season_weeks=REGULAR_SEASON_WEEKS,
    normalize_conference=_normalize_conference,
)
_client = EspnClient(_CONFIG)

# ── Re-exported bare API ──────────────────────────────────────────────────────
fetch_scoreboard            = _client.fetch_scoreboard
fetch_postseason_scoreboard = _client.fetch_postseason_scoreboard
fetch_full_postseason       = _client.fetch_full_postseason
fetch_team                  = _client.fetch_team
parse_scoreboard            = _client.parse_scoreboard


def fetch_standings() -> dict:
    """Fetch current MLB standings (division level) from the apis/v2 endpoint."""
    return _get(MLB_STANDINGS_URL, params={"level": 3})


def fetch_standings_season(season_year: int) -> dict:
    """Fetch MLB standings for a specific season year."""
    return _get(MLB_STANDINGS_URL, params={"level": 3, "season": season_year})


# ── MLB-specific standings parsing ────────────────────────────────────────────
# The generic client's parse_standings assumes the NFL shape
# (children[league] → children[division] → standings.entries). ESPN's MLB
# standings nest differently, so walk the tree recursively and map each team's
# division/league from the (reliable) abbreviation instead of ESPN's group name.
def _collect_entries(node, out: list) -> None:
    if isinstance(node, dict):
        if "team" in node and "stats" in node:
            out.append(node)
        standings = node.get("standings")
        if isinstance(standings, dict):
            _collect_entries(standings, out)
        for entry in node.get("entries", []) or []:
            _collect_entries(entry, out)
        for child in node.get("children", []) or []:
            _collect_entries(child, out)
    elif isinstance(node, list):
        for item in node:
            _collect_entries(item, out)


def parse_standings(data: dict) -> list[dict]:
    """Recursively extract per-team standing rows from the ESPN MLB payload."""
    raw_entries: list = []
    _collect_entries(data, raw_entries)

    by_abbr: dict[str, dict] = {}
    for entry in raw_entries:
        team = entry.get("team", {})
        abbr = (team.get("abbreviation") or "").upper()
        if not abbr:
            continue
        stats = {s.get("name"): s.get("value") for s in entry.get("stats", []) if s.get("name")}
        wins   = int(stats.get("wins", 0) or 0)
        losses = int(stats.get("losses", 0) or 0)
        total  = wins + losses
        by_abbr[abbr] = {
            "abbr"          : abbr,
            "name"          : team.get("displayName", ""),
            "wins"          : wins,
            "losses"        : losses,
            "ties"          : 0,
            "win_pct"       : float(stats.get("winPercent", (wins / total if total else 0.0)) or 0.0),
            "points_for"    : int(stats.get("pointsFor", 0) or 0),
            "points_against": int(stats.get("pointsAgainst", 0) or 0),
            "division"      : DIVISION_MAP.get(abbr, ""),
            "conference"    : CONFERENCE_MAP.get(abbr, ""),
        }
    return list(by_abbr.values())


def fetch_scoreboard_date(yyyymmdd: str | int) -> dict:
    """
    Fetch a single day's MLB scoreboard.

    ESPN accepts a `dates=YYYYMMDD` query param on the scoreboard endpoint;
    the shared client exposes that param as `season`, so we forward the date
    through it (baseball ignores week numbers).
    """
    return _client.fetch_scoreboard(season=int(yyyymmdd), season_type=SEASON_TYPE_REGULAR)
