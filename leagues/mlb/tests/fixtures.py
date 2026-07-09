"""
fixtures.py (MLB)
─────────────────
Minimal ESPN-shaped MLB sample payloads so the test suite runs offline.
"""

# A one-day scoreboard: one completed divisional game (NYY @ BAL, BAL wins)
# and one upcoming intra-league game (BOS @ TOR) with odds.
REGULAR_SCOREBOARD = {
    "season": {"year": 2026, "type": {"id": 2, "name": "Regular Season"}},
    "week": {"number": 0},
    "events": [
        {
            "id": "401600001",
            "name": "New York Yankees at Baltimore Orioles",
            "date": "2026-07-09T23:05Z",
            "status": {"type": {"state": "post", "detail": "Final", "completed": True}},
            "competitions": [{
                "venue": {"fullName": "Oriole Park at Camden Yards"},
                "competitors": [
                    {"homeAway": "home", "score": "5",
                     "records": [{"summary": "55-40"}],
                     "team": {"id": "1", "abbreviation": "BAL", "displayName": "Baltimore Orioles",
                              "shortDisplayName": "Orioles", "location": "Baltimore", "color": "df4601"}},
                    {"homeAway": "away", "score": "3",
                     "records": [{"summary": "52-43"}],
                     "team": {"id": "2", "abbreviation": "NYY", "displayName": "New York Yankees",
                              "shortDisplayName": "Yankees", "location": "New York", "color": "0c2340"}},
                ],
                "status": {"type": {"state": "post", "detail": "Final", "completed": True}},
            }],
        },
        {
            "id": "401600002",
            "name": "Boston Red Sox at Toronto Blue Jays",
            "date": "2026-07-10T23:07Z",
            "status": {"type": {"state": "pre", "detail": "Scheduled", "completed": False}},
            "competitions": [{
                "venue": {"fullName": "Rogers Centre"},
                "competitors": [
                    {"homeAway": "home", "score": None,
                     "records": [{"summary": "50-45"}],
                     "team": {"id": "3", "abbreviation": "TOR", "displayName": "Toronto Blue Jays",
                              "shortDisplayName": "Blue Jays", "location": "Toronto", "color": "134a8e"}},
                    {"homeAway": "away", "score": None,
                     "records": [{"summary": "48-47"}],
                     "team": {"id": "4", "abbreviation": "BOS", "displayName": "Boston Red Sox",
                              "shortDisplayName": "Red Sox", "location": "Boston", "color": "bd3039"}},
                ],
                "status": {"type": {"state": "pre", "detail": "Scheduled", "completed": False}},
                "odds": [{"spread": -1.5, "details": "TOR -1.5",
                          "homeTeamOdds": {"moneyLine": -130}, "awayTeamOdds": {"moneyLine": 110}}],
            }],
        },
    ],
}

# Parsed-standings list (the shape add_standings/add_teams_from_standings expect).
def _row(abbr, name, w, l, rf, ra, division, conference):
    total = w + l
    return {
        "abbr": abbr, "name": name, "wins": w, "losses": l, "ties": 0,
        "win_pct": round(w / total, 4) if total else 0.0,
        "points_for": rf, "points_against": ra,
        "division": division, "conference": conference,
    }

STANDINGS = [
    _row("BAL", "Baltimore Orioles", 55, 40, 470, 400, "ALEast", "AL"),
    _row("NYY", "New York Yankees",  52, 43, 460, 420, "ALEast", "AL"),
    _row("BOS", "Boston Red Sox",    48, 47, 440, 440, "ALEast", "AL"),
    _row("TB",  "Tampa Bay Rays",    47, 48, 420, 430, "ALEast", "AL"),
    _row("TOR", "Toronto Blue Jays", 50, 45, 450, 435, "ALEast", "AL"),
    _row("CLE", "Cleveland Guardians", 56, 39, 465, 390, "ALCentral", "AL"),
    _row("DET", "Detroit Tigers",    49, 46, 430, 430, "ALCentral", "AL"),
    _row("HOU", "Houston Astros",    54, 41, 460, 405, "ALWest", "AL"),
    _row("SEA", "Seattle Mariners",  51, 44, 445, 420, "ALWest", "AL"),
    _row("ATL", "Atlanta Braves",    57, 38, 480, 385, "NLEast", "NL"),
    _row("PHI", "Philadelphia Phillies", 53, 42, 455, 410, "NLEast", "NL"),
    _row("CHC", "Chicago Cubs",      52, 43, 450, 415, "NLCentral", "NL"),
    _row("LAD", "Los Angeles Dodgers", 60, 35, 500, 370, "NLWest", "NL"),
    _row("SD",  "San Diego Padres",  54, 41, 460, 415, "NLWest", "NL"),
]
