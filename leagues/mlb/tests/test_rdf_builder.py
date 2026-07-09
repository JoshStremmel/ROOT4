"""
tests/test_rdf_builder.py (MLB)
───────────────────────────────
Unit tests for MLBGraphBuilder — team/game holons, competition + impact edges,
and 6-per-league playoff assignment. Offline (fixtures, no network).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "builders"))
sys.path.insert(0, str(Path(__file__).parent))

import pytest
from rdflib import URIRef
from fixtures import REGULAR_SCOREBOARD, STANDINGS
from espn_fetcher import parse_scoreboard
from rdf_builder import (
    MLBGraphBuilder, MLB, IMPACT, PLAYOFF,
    _team_iri, _game_iri,
)


@pytest.fixture
def loaded_builder():
    b = MLBGraphBuilder()
    parsed = parse_scoreboard(REGULAR_SCOREBOARD)
    b.add_teams_from_scoreboard(parsed)
    b.add_games(parsed)
    b.add_standings(STANDINGS)
    b.add_teams_from_standings(STANDINGS)
    b.add_competition_edges()
    b.add_impact_edges()
    b.add_playoff_spot_assignments()
    return b


class TestTeamHolons:
    def test_team_interior_graph_exists(self, loaded_builder):
        g = loaded_builder.dataset.graph(URIRef("urn:mlb:graph:team:BAL"))
        assert len(g) > 0

    def test_team_has_name(self, loaded_builder):
        g = loaded_builder.dataset.graph(URIRef("urn:mlb:graph:team:BAL"))
        names = list(g.objects(_team_iri("BAL"), MLB.name))
        assert str(names[0]) == "Baltimore Orioles"

    def test_team_has_wins(self, loaded_builder):
        g = loaded_builder.dataset.graph(URIRef("urn:mlb:graph:team:BAL"))
        wins = list(g.objects(_team_iri("BAL"), MLB.wins))
        assert int(wins[0]) == 55

    def test_team_has_league(self, loaded_builder):
        g = loaded_builder.dataset.graph(URIRef("urn:mlb:graph:team:BAL"))
        leagues = list(g.objects(_team_iri("BAL"), MLB.league))
        assert any("AL" in str(x) for x in leagues)


class TestGameHolons:
    def test_completed_game_has_winner(self, loaded_builder):
        parsed = parse_scoreboard(REGULAR_SCOREBOARD)
        completed = next(g for g in parsed["games"] if g["status"] == "post")
        game_iri = _game_iri(completed)
        winner = None
        for g in loaded_builder.dataset.graphs():
            got = list(g.objects(game_iri, MLB.winner))
            if got:
                winner = str(got[0]); break
        assert winner is not None and "BAL" in winner

    def test_games_graph_named_per_season(self, loaded_builder):
        g = loaded_builder.dataset.graph(URIRef("urn:mlb:graph:games:2026:reg"))
        assert len(g) > 0


class TestCompetitionEdges:
    def test_divisional_rivals(self, loaded_builder):
        g = loaded_builder._g_competition
        rivals = [str(r).split(":")[-1] for r in g.objects(_team_iri("BAL"), MLB.divisionalRival)]
        assert set(rivals) == {"BOS", "NYY", "TB", "TOR"}

    def test_division_leader(self, loaded_builder):
        g = loaded_builder._g_competition
        leaders = list(g.objects(MLB.ALEast, MLB.divisionLeader))
        assert len(leaders) == 1 and "BAL" in str(leaders[0])


class TestImpactEdges:
    def test_divisional_game_scores_one(self, loaded_builder):
        g = loaded_builder._g_outcomes
        scores = [float(s) for s in g.objects(None, IMPACT.score)]
        assert 1.0 in scores  # BAL vs NYY is intra-division

    def test_winner_improves_odds(self, loaded_builder):
        g = loaded_builder._g_outcomes
        assert len(list(g.subjects(IMPACT.improvesOdds, _team_iri("BAL")))) >= 1


class TestPlayoffAssignments:
    def test_spots_assigned(self, loaded_builder):
        g = loaded_builder._g_standings
        holders = list(g.subjects(MLB.currentlyHolds, None))
        assert len(holders) > 0

    def test_al_has_six_berths(self, loaded_builder):
        g = loaded_builder._g_standings
        al_spots = [s for s in g.objects(None, MLB.currentlyHolds) if "AL" in str(s)]
        # 3 division winners + 3 wildcards = 6 AL berths from the fixture.
        assert len(al_spots) == 6

    def test_two_bye_seeds_exist(self, loaded_builder):
        g = loaded_builder._g_standings
        seed1 = list(g.subjects(MLB.currentlyHolds, PLAYOFF["ALSeed1"]))
        seed2 = list(g.subjects(MLB.currentlyHolds, PLAYOFF["ALSeed2"]))
        assert len(seed1) == 1 and len(seed2) == 1


class TestSerialization:
    def test_serialize_trig(self, loaded_builder, tmp_path):
        out = tmp_path / "mlb.trig"
        loaded_builder.serialize(out, fmt="trig")
        assert out.exists() and out.stat().st_size > 0
