"""
espn_fetcher.py
───────────────
NFL configuration for the generic ESPN client (engine/espn_client.py).

All the actual HTTP fetching and ESPN JSON-shape parsing is
league-agnostic and lives in engine/espn_client.py — this module only
supplies NFL's specifics (URL path, divisions/conferences, postseason
round labels, season length) and re-exports the bound fetch_*/parse_*
functions so the rest of leagues/nfl/ can keep importing them by bare name,
e.g. `from espn_fetcher import fetch_scoreboard, parse_scoreboard`.

Endpoints used
──────────────
Scoreboard (current week):
  https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard

Scoreboard (specific week):
  https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
  ?seasontype=<TYPE>&week=<WEEK>&dates=<SEASON_YEAR>

Season types
────────────
  1 = Preseason   (weeks 1–4)
  2 = Regular Season (weeks 1–18)
  3 = Postseason  (weeks 1–5: Wild Card, Divisional, Conference, Pro Bowl, Super Bowl)

Standings:
  https://site.api.espn.com/apis/site/v2/sports/football/nfl/standings

Team detail:
  https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/<TEAM_ID>
"""

from __future__ import annotations

from engine.espn_client import (
    EspnClient,
    LeagueConfig,
    SEASON_TYPE_PRESEASON,
    SEASON_TYPE_REGULAR,
    SEASON_TYPE_POSTSEASON,
)

# Total weeks per season type
REGULAR_SEASON_WEEKS   = 18
POSTSEASON_WEEKS_COUNT = 5

# Postseason week labels (ESPN week numbers within seasontype=3)
POSTSEASON_WEEKS = {
    1: "Wild Card",
    2: "Divisional",
    3: "Conference Championship",
    4: "Pro Bowl",
    5: "Super Bowl",
}

# Divisional mapping for all 32 teams (ESPN abbreviation → division key)
DIVISION_MAP: dict[str, str] = {
    # AFC North
    "BAL": "AFCNorth", "CIN": "AFCNorth", "CLE": "AFCNorth", "PIT": "AFCNorth",
    # AFC South
    "HOU": "AFCSouth", "IND": "AFCSouth", "JAX": "AFCSouth", "TEN": "AFCSouth",
    # AFC East
    "BUF": "AFCEast",  "MIA": "AFCEast",  "NE":  "AFCEast",  "NYJ": "AFCEast",
    # AFC West
    "DEN": "AFCWest",  "KC":  "AFCWest",  "LV":  "AFCWest",  "LAC": "AFCWest",
    # NFC North
    "CHI": "NFCNorth", "DET": "NFCNorth", "GB":  "NFCNorth", "MIN": "NFCNorth",
    # NFC South
    "ATL": "NFCSouth", "CAR": "NFCSouth", "NO":  "NFCSouth",  "TB":  "NFCSouth",
    # NFC East
    "DAL": "NFCEast",  "NYG": "NFCEast",  "PHI": "NFCEast",  "WAS": "NFCEast",
    # NFC West
    "ARI": "NFCWest",  "LAR": "NFCWest",  "SF":  "NFCWest",  "SEA": "NFCWest",
}

CONFERENCE_MAP: dict[str, str] = {
    **{k: "AFC" for k in ["BAL","CIN","CLE","PIT","HOU","IND","JAX","TEN",
                           "BUF","MIA","NE","NYJ","DEN","KC","LV","LAC"]},
    **{k: "NFC" for k in ["CHI","DET","GB","MIN","ATL","CAR","NO","TB",
                           "DAL","NYG","PHI","WAS","ARI","LAR","SF","SEA"]},
}

# Known divisional rivals (auto-populated from division map at runtime too)
DIVISION_RIVALS: dict[str, list[str]] = {
    "AFCNorth": ["BAL","CIN","CLE","PIT"],
    "AFCSouth": ["HOU","IND","JAX","TEN"],
    "AFCEast":  ["BUF","MIA","NE","NYJ"],
    "AFCWest":  ["DEN","KC","LV","LAC"],
    "NFCNorth": ["CHI","DET","GB","MIN"],
    "NFCSouth": ["ATL","CAR","NO","TB"],
    "NFCEast":  ["DAL","NYG","PHI","WAS"],
    "NFCWest":  ["ARI","LAR","SF","SEA"],
}

_CONFIG = LeagueConfig(
    sport="football",
    league="nfl",
    division_map=DIVISION_MAP,
    conference_map=CONFERENCE_MAP,
    postseason_week_labels=POSTSEASON_WEEKS,
    postseason_rounds=POSTSEASON_WEEKS_COUNT,
    regular_season_weeks=REGULAR_SEASON_WEEKS,
    normalize_conference=lambda name: "AFC" if "AFC" in name else "NFC",
)
_client = EspnClient(_CONFIG)

# ── Re-exported bare API (unchanged from before the engine/ split) ────────────
fetch_scoreboard            = _client.fetch_scoreboard
fetch_postseason_scoreboard = _client.fetch_postseason_scoreboard
fetch_full_postseason       = _client.fetch_full_postseason
fetch_standings             = _client.fetch_standings
fetch_standings_season      = _client.fetch_standings_season
fetch_team                  = _client.fetch_team
parse_scoreboard            = _client.parse_scoreboard
parse_standings             = _client.parse_standings
