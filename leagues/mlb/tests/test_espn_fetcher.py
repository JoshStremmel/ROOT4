"""
tests/test_espn_fetcher.py (MLB)
────────────────────────────────
Verifies the MLB LeagueConfig + the shared parser produce the expected
normalized shapes (offline — uses fixtures, no network).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "builders"))
sys.path.insert(0, str(Path(__file__).parent))

from fixtures import REGULAR_SCOREBOARD, STANDINGS
from espn_fetcher import (
    parse_scoreboard, DIVISION_MAP, CONFERENCE_MAP, DIVISION_RIVALS,
)


class TestMaps:
    def test_thirty_teams(self):
        assert len(DIVISION_MAP) == 30
        assert len(CONFERENCE_MAP) == 30

    def test_six_divisions_five_each(self):
        assert len(DIVISION_RIVALS) == 6
        assert all(len(v) == 5 for v in DIVISION_RIVALS.values())

    def test_leagues_are_al_nl(self):
        assert set(CONFERENCE_MAP.values()) == {"AL", "NL"}
        assert CONFERENCE_MAP["BAL"] == "AL"
        assert CONFERENCE_MAP["LAD"] == "NL"


class TestParseScoreboard:
    def test_season_and_games(self):
        parsed = parse_scoreboard(REGULAR_SCOREBOARD)
        assert parsed["season"] == 2026
        assert len(parsed["games"]) == 2

    def test_completed_game_winner(self):
        parsed = parse_scoreboard(REGULAR_SCOREBOARD)
        completed = next(g for g in parsed["games"] if g["status"] == "post")
        assert completed["winner_abbr"] == "BAL"
        assert completed["loser_abbr"] == "NYY"
        assert completed["home_score"] == 5
        assert completed["away_score"] == 3

    def test_upcoming_game_has_odds(self):
        parsed = parse_scoreboard(REGULAR_SCOREBOARD)
        upcoming = next(g for g in parsed["games"] if g["status"] == "pre")
        assert upcoming["odds"] is not None
        assert upcoming["odds"]["spread"] == -1.5


class TestStandingsFixture:
    def test_division_keys_valid(self):
        for row in STANDINGS:
            assert row["division"] in DIVISION_RIVALS
            assert row["conference"] in ("AL", "NL")
