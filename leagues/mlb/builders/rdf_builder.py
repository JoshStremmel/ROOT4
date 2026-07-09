"""
rdf_builder.py (MLB)
────────────────────
Converts parsed ESPN MLB data into a holonic RDF dataset using rdflib.
Mirrors leagues/nfl/builders/rdf_builder.py; the four-layer holonic plumbing
is inherited from engine.graph_builder.HolonicDatasetBuilder.

Graph layout (named graphs)
───────────────────────────
  urn:mlb:graph:teams                 – Team holons
  urn:mlb:graph:games:<season>:<type> – Game holons (baseball is day-based, so
                                        games are scoped per season, not week)
  urn:mlb:graph:outcomes              – Completed game outcomes
  urn:mlb:graph:competition           – Structural & competitive edges
  urn:mlb:graph:standings             – Current standings snapshot
  urn:mlb:graph:holarchy              – Registry: which holons exist
"""

from __future__ import annotations

import logging
import re
from typing import Any

from rdflib import RDF, XSD, Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDFS

from engine.graph_builder import HolonicDatasetBuilder
from espn_fetcher import CONFERENCE_MAP, DIVISION_MAP, DIVISION_RIVALS

logger = logging.getLogger(__name__)

# Number of playoff berths per league.
DIVISION_WINNERS_PER_LEAGUE = 3
WILDCARDS_PER_LEAGUE        = 3

# ── Namespaces ────────────────────────────────────────────────────────────────
MLB     = Namespace("urn:mlb:")
TEAM    = Namespace("urn:mlb:team:")
GAME    = Namespace("urn:mlb:game:")
OUTCOME = Namespace("urn:mlb:outcome:")
PLAYOFF = Namespace("urn:mlb:playoff:")
IMPACT  = Namespace("urn:mlb:impact:")
REC     = Namespace("urn:mlb:recommendation:")
USER    = Namespace("urn:mlb:user:")
GRAPH   = Namespace("urn:mlb:graph:")


# ── Helpers ───────────────────────────────────────────────────────────────────
def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", s)


def _team_iri(abbr: str) -> URIRef:
    return TEAM[abbr.upper()]


def _game_iri(game: dict) -> URIRef:
    # Baseball plays many games per day; the ESPN event id keeps IRIs unique.
    return GAME[f"{game['season']}_{_slug(str(game['id']))}"]


def _outcome_iri(game: dict, winner_abbr: str) -> URIRef:
    return OUTCOME[f"{game['season']}_{_slug(str(game['id']))}_{winner_abbr}Win"]


def _games_graph_iri(season: int, season_type_id: int = 2) -> URIRef:
    suffix = "post" if season_type_id == 3 else "reg"
    return GRAPH[f"games:{season}:{suffix}"]


# ── Core Builder ──────────────────────────────────────────────────────────────
class MLBGraphBuilder(HolonicDatasetBuilder):
    """Builds a holonic RDF Dataset from parsed ESPN MLB data."""

    def __init__(self) -> None:
        super().__init__(namespaces={
            "mlb": MLB, "team": TEAM, "game": GAME, "outcome": OUTCOME,
            "playoff": PLAYOFF, "impact": IMPACT, "rec": REC, "user": USER,
            "graph": GRAPH,
        })

        self._g_teams       = self.dataset.graph(GRAPH["teams"])
        self._g_outcomes    = self.dataset.graph(GRAPH["outcomes"])
        self._g_competition = self.dataset.graph(GRAPH["competition"])
        self._g_standings   = self.dataset.graph(GRAPH["standings"])
        self._g_holarchy    = self.dataset.graph(GRAPH["holarchy"])

        self._team_abbrs:        set[str]          = set()
        self._game_iris:         dict[str, URIRef] = {}
        self._game_data:         list[dict]        = []
        self._standings:         list[dict]        = []
        self._team_graph_cache:  dict[str, Graph]  = {}

    # ── Public API ────────────────────────────────────────────────────────────
    def add_teams_from_scoreboard(self, parsed: dict[str, Any]) -> None:
        seen: set[str] = set()
        for game in parsed.get("games", []):
            for side in ("home", "away"):
                td = game[side]
                abbr = td["abbr"]
                if abbr in seen or not abbr:
                    continue
                seen.add(abbr)
                self._upsert_team(td)
        logger.info("Added/updated %d team holons", len(seen))

    def add_teams_from_standings(self, standings: list[dict]) -> None:
        for sd in standings:
            abbr = sd["abbr"]
            t_iri = _team_iri(abbr)
            g = self._team_interior_graph(abbr)
            g.set((t_iri, MLB.wins,          Literal(sd["wins"],          datatype=XSD.integer)))
            g.set((t_iri, MLB.losses,        Literal(sd["losses"],        datatype=XSD.integer)))
            g.set((t_iri, MLB.winPct,        Literal(sd["win_pct"],       datatype=XSD.float)))
            g.set((t_iri, MLB.runsFor,       Literal(sd["points_for"],    datatype=XSD.integer)))
            g.set((t_iri, MLB.runsAgainst,   Literal(sd["points_against"], datatype=XSD.integer)))
            self._team_abbrs.add(abbr)
        logger.info("Enriched %d teams from standings", len(standings))

    def add_games(self, parsed: dict[str, Any]) -> None:
        season         = parsed["season"]
        season_type_id = parsed.get("season_type_id", 2)
        g_games = self.dataset.graph(_games_graph_iri(season, season_type_id))
        self._bind_namespaces(g_games)

        for game in parsed.get("games", []):
            self._insert_game(game, g_games)

        self._game_data.extend(parsed.get("games", []))
        logger.info("Added %d games for season %d", len(parsed.get("games", [])), season)

    def add_standings(self, standings: list[dict]) -> None:
        self._standings = standings
        for sd in standings:
            abbr  = sd["abbr"]
            t_iri = _team_iri(abbr)
            self._g_standings.add((t_iri, RDF.type, MLB.Team))
            self._g_standings.set((t_iri, MLB.wins,        Literal(sd["wins"],   datatype=XSD.integer)))
            self._g_standings.set((t_iri, MLB.losses,      Literal(sd["losses"], datatype=XSD.integer)))
            self._g_standings.set((t_iri, MLB.winPct,      Literal(sd["win_pct"], datatype=XSD.float)))
            self._g_standings.set((t_iri, MLB.runsFor,     Literal(sd["points_for"],     datatype=XSD.integer)))
            self._g_standings.set((t_iri, MLB.runsAgainst, Literal(sd["points_against"], datatype=XSD.integer)))
            div_key  = sd.get("division", DIVISION_MAP.get(abbr, ""))
            conf_key = sd.get("conference", CONFERENCE_MAP.get(abbr, ""))
            if div_key:
                self._g_standings.add((t_iri, MLB.division, MLB[div_key]))
            if conf_key:
                self._g_standings.add((t_iri, MLB.league,   MLB[conf_key]))
        logger.info("Standings graph updated for %d teams", len(standings))

    def add_competition_edges(self, tiebreaker_order: dict[str, list[str]] | None = None) -> None:
        g = self._g_competition

        for div_key, members in DIVISION_RIVALS.items():
            div_iri = MLB[div_key]
            for abbr in members:
                t_iri = _team_iri(abbr)
                g.add((t_iri, MLB.division, div_iri))
                for rival_abbr in members:
                    if rival_abbr != abbr:
                        g.add((t_iri, MLB.divisionalRival, _team_iri(rival_abbr)))

        if self._standings:
            by_div: dict[str, list[dict]] = {}
            for sd in self._standings:
                div = sd.get("division", DIVISION_MAP.get(sd["abbr"], ""))
                by_div.setdefault(div, []).append(sd)

            for div_key, teams in by_div.items():
                if tiebreaker_order and div_key in tiebreaker_order:
                    tb_order = tiebreaker_order[div_key]
                    sorted_teams = sorted(
                        teams, key=lambda t: tb_order.index(t["abbr"]) if t["abbr"] in tb_order else 999)
                else:
                    sorted_teams = sorted(teams, key=lambda t: t["win_pct"], reverse=True)
                leader = sorted_teams[0]
                leader_wins, leader_losses = leader["wins"], leader["losses"]
                g.add((MLB[div_key], MLB.divisionLeader, _team_iri(leader["abbr"])))
                for team in sorted_teams:
                    games_back = ((leader_wins - team["wins"]) + (team["losses"] - leader_losses)) / 2.0
                    g.add((_team_iri(team["abbr"]), MLB.gamesBack, Literal(games_back, datatype=XSD.float)))

            conf_teams: dict[str, list[str]] = {}
            for sd in self._standings:
                conf = sd.get("conference", CONFERENCE_MAP.get(sd["abbr"], ""))
                conf_teams.setdefault(conf, []).append(sd["abbr"])
            for conf, abbrs in conf_teams.items():
                for i, a in enumerate(abbrs):
                    for b in abbrs[i+1:]:
                        if a != b:
                            g.add((_team_iri(a), MLB.competesWith, _team_iri(b)))
                            g.add((_team_iri(b), MLB.competesWith, _team_iri(a)))

        logger.info("Competition edges written to %s", GRAPH["competition"])

    def add_impact_edges(self, strength_map: dict | None = None) -> None:
        g = self._g_outcomes
        for game in self._game_data:
            if game["status"] != "post":
                continue
            winner_abbr = game.get("winner_abbr")
            loser_abbr  = game.get("loser_abbr")
            if not winner_abbr or not loser_abbr:
                continue

            out_iri = _outcome_iri(game, winner_abbr)
            home_div  = DIVISION_MAP.get(game["home"]["abbr"], "")
            away_div  = DIVISION_MAP.get(game["away"]["abbr"], "")
            home_conf = CONFERENCE_MAP.get(game["home"]["abbr"], "")
            away_conf = CONFERENCE_MAP.get(game["away"]["abbr"], "")

            if home_div == away_div and home_div:
                base_score = 1.0    # divisional
            elif home_conf == away_conf and home_conf:
                base_score = 0.75   # intraleague
            else:
                base_score = 0.5    # interleague

            if strength_map:
                home_str = strength_map.get(game["home"]["abbr"], {}).get("strengthScore", 0.5)
                away_str = strength_map.get(game["away"]["abbr"], {}).get("strengthScore", 0.5)
                importance = min(base_score + 0.05 * ((home_str + away_str) / 2), 1.0)
            else:
                importance = base_score

            g.add((out_iri, IMPACT.improvesOdds, _team_iri(winner_abbr)))
            g.add((out_iri, IMPACT.reducesOdds,  _team_iri(loser_abbr)))
            g.add((out_iri, IMPACT.score, Literal(round(importance, 4), datatype=XSD.float)))

            g_game_iri = _game_iri(game)
            g.add((g_game_iri, IMPACT.affects, _team_iri(game["home"]["abbr"])))
            g.add((g_game_iri, IMPACT.affects, _team_iri(game["away"]["abbr"])))

        logger.info("Impact edges added for completed games")

    def add_team_strengths(self, strength_map: dict) -> None:
        for abbr, data in strength_map.items():
            t_iri = _team_iri(abbr)
            g = self._team_interior_graph(abbr)
            g.add((t_iri, MLB.strengthScore, Literal(data["strengthScore"], datatype=XSD.float)))
        logger.info("Team strength scores written for %d teams", len(strength_map))

    def add_playoff_spot_assignments(self, tiebreaker_order: dict[str, list[str]] | None = None) -> None:
        """
        Assign mlb:currentlyHolds triples: 3 division winners (seeds 1–3) +
        3 wild cards per league (6 berths total; top-2 seeds carry a bye).
        """
        if not self._standings:
            logger.warning("No standings loaded; skipping playoff assignment")
            return

        g = self._g_standings
        conf_division_leaders: dict[str, list[dict]] = {"AL": [], "NL": []}
        conf_non_leaders:      dict[str, list[dict]] = {"AL": [], "NL": []}

        by_div: dict[str, list[dict]] = {}
        for sd in self._standings:
            div = sd.get("division", DIVISION_MAP.get(sd["abbr"], ""))
            by_div.setdefault(div, []).append(sd)

        def _sort_div(teams: list[dict], div_key: str) -> list[dict]:
            if tiebreaker_order and div_key in tiebreaker_order:
                tb = tiebreaker_order[div_key]
                return sorted(teams, key=lambda t: tb.index(t["abbr"]) if t["abbr"] in tb else 999)
            return sorted(teams, key=lambda t: t["win_pct"], reverse=True)

        for div_key, teams in by_div.items():
            conf = CONFERENCE_MAP.get(teams[0]["abbr"], "AL" if div_key.startswith("AL") else "NL")
            sorted_t = _sort_div(teams, div_key)
            conf_division_leaders[conf].append(sorted_t[0])
            conf_non_leaders[conf].extend(sorted_t[1:])

        seed_iris = {
            conf: [PLAYOFF[f"{conf}Seed{i}"] for i in range(1, DIVISION_WINNERS_PER_LEAGUE + 1)] +
                  [PLAYOFF[f"{conf}Wildcard{i}"] for i in range(1, WILDCARDS_PER_LEAGUE + 1)]
            for conf in ("AL", "NL")
        }

        for conf in ("AL", "NL"):
            leaders   = sorted(conf_division_leaders[conf], key=lambda t: t["win_pct"], reverse=True)
            wildcards = sorted(conf_non_leaders[conf], key=lambda t: t["win_pct"], reverse=True)[:WILDCARDS_PER_LEAGUE]
            playoff_teams = leaders + wildcards
            for i, team in enumerate(playoff_teams):
                if i < len(seed_iris[conf]):
                    g.add((_team_iri(team["abbr"]), MLB.currentlyHolds, seed_iris[conf][i]))
                    g.add((_team_iri(team["abbr"]), MLB.competesFor,    seed_iris[conf][i]))

        logger.info("Playoff spot assignments written")

    # ── Private helpers ───────────────────────────────────────────────────────
    def _team_interior_graph(self, abbr: str) -> Graph:
        return self._cached_graph(self._team_graph_cache, GRAPH[f"team:{abbr}"])

    def _upsert_team(self, td: dict) -> None:
        abbr  = td["abbr"]
        t_iri = _team_iri(abbr)
        g     = self._team_interior_graph(abbr)

        if abbr not in self._team_abbrs:
            g.add((t_iri, RDF.type,         MLB.Team))
            g.add((t_iri, MLB.name,         Literal(td["name"])))
            g.add((t_iri, MLB.abbreviation, Literal(abbr)))
            if td.get("location"):
                g.add((t_iri, MLB.location, Literal(td["location"])))
            if td.get("short_name"):
                g.add((t_iri, RDFS.label,   Literal(td["short_name"])))
            div_key  = td.get("division",   DIVISION_MAP.get(abbr, ""))
            conf_key = td.get("conference", CONFERENCE_MAP.get(abbr, ""))
            if div_key:
                g.add((t_iri, MLB.division, MLB[div_key]))
            if conf_key:
                g.add((t_iri, MLB.league,   MLB[conf_key]))
            self._g_holarchy.add((t_iri, RDF.type, MLB.Team))
            self._g_holarchy.add((t_iri, MLB.hasInteriorGraph, GRAPH[f"team:{abbr}"]))
            self._g_teams.add((t_iri, RDF.type, MLB.Team))
            self._team_abbrs.add(abbr)

        if td.get("wins") is not None:
            g.set((t_iri, MLB.wins,   Literal(td["wins"],   datatype=XSD.integer)))
            g.set((t_iri, MLB.losses, Literal(td["losses"], datatype=XSD.integer)))

    def _insert_game(self, game: dict, g_games: Graph) -> None:
        g_iri = _game_iri(game)
        self._game_iris[game["id"]] = g_iri

        g_games.add((g_iri, RDF.type,       MLB.Game))
        g_games.add((g_iri, MLB.espnId,     Literal(game["id"])))
        g_games.add((g_iri, MLB.season,     Literal(game["season"], datatype=XSD.integer)))
        g_games.add((g_iri, MLB.seasonType, Literal(game["season_type"])))
        g_games.add((g_iri, MLB.status,     Literal(game["status"])))
        g_games.add((g_iri, MLB.statusDetail, Literal(game["status_detail"])))
        if game.get("venue"):
            g_games.add((g_iri, MLB.venue,  Literal(game["venue"])))
        if game.get("start_time"):
            g_games.add((g_iri, MLB.startTime, Literal(game["start_time"], datatype=XSD.dateTime)))

        home_iri = _team_iri(game["home"]["abbr"])
        away_iri = _team_iri(game["away"]["abbr"])
        g_games.add((g_iri, MLB.homeTeam, home_iri))
        g_games.add((g_iri, MLB.awayTeam, away_iri))
        g_games.add((g_iri, IMPACT.affects, home_iri))
        g_games.add((g_iri, IMPACT.affects, away_iri))

        if game["home_score"] is not None:
            g_games.add((g_iri, MLB.homeScore, Literal(game["home_score"], datatype=XSD.integer)))
        if game["away_score"] is not None:
            g_games.add((g_iri, MLB.awayScore, Literal(game["away_score"], datatype=XSD.integer)))

        odds = game.get("odds")
        if odds:
            g_games.add((g_iri, MLB.spread, Literal(odds["spread"], datatype=XSD.float)))
            g_games.add((g_iri, MLB.homeFavorite, Literal(odds["home_is_favorite"], datatype=XSD.boolean)))
            if odds["home_moneyline"] is not None:
                g_games.add((g_iri, MLB.homeMoneyLine, Literal(odds["home_moneyline"], datatype=XSD.integer)))
            if odds["away_moneyline"] is not None:
                g_games.add((g_iri, MLB.awayMoneyLine, Literal(odds["away_moneyline"], datatype=XSD.integer)))
            if odds.get("details"):
                g_games.add((g_iri, MLB.oddsDetails, Literal(odds["details"])))

        if game["status"] == "post" and game.get("winner_abbr"):
            self._insert_outcome(game, g_iri, g_games)

        self._g_holarchy.add((g_iri, RDF.type, MLB.Game))
        self._g_holarchy.add((g_iri, MLB.hasInteriorGraph,
                              _games_graph_iri(game["season"], game.get("season_type_id", 2))))

    def _insert_outcome(self, game: dict, game_iri: URIRef, g_games: Graph) -> None:
        winner_abbr = game["winner_abbr"]
        loser_abbr  = game["loser_abbr"]
        out_iri     = _outcome_iri(game, winner_abbr)

        winner_iri = _team_iri(winner_abbr)
        loser_iri  = _team_iri(loser_abbr) if loser_abbr else None

        self._g_outcomes.add((out_iri, RDF.type,   MLB.Outcome))
        self._g_outcomes.add((out_iri, MLB.forGame, game_iri))
        self._g_outcomes.add((out_iri, MLB.winner,  winner_iri))
        if loser_iri:
            self._g_outcomes.add((out_iri, MLB.loser, loser_iri))
        self._g_outcomes.add((out_iri, MLB.homeScore, Literal(game["home_score"], datatype=XSD.integer)))
        self._g_outcomes.add((out_iri, MLB.awayScore, Literal(game["away_score"], datatype=XSD.integer)))

        g_games.add((game_iri, MLB.winner,     winner_iri))
        g_games.add((game_iri, MLB.hasOutcome, out_iri))
        if loser_iri:
            g_games.add((game_iri, MLB.loser, loser_iri))
