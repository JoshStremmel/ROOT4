"""
pipeline.py
───────────
Fetches ESPN scoreboard/standings JSON for a season and caches it to
.cache/espn/, and builds the holonic RDF dataset. Two leagues are supported:

  • NFL — week-based; fetches weeks 1–18 (+ optional postseason).
  • MLB — day-based (baseball has no weeks); fetches a range of daily
    scoreboards plus the current standings snapshot.

All web-app calculations are handled client-side by ROOT4/root4.js — this
script fetches/caches data and builds the parallel RDF graph.

Quick start
──────────
    python pipeline.py                          # NFL, current season
    python pipeline.py --league mlb             # MLB, last 14 days + standings
    python pipeline.py --league mlb --days 21   # MLB, last 21 days
    python pipeline.py --season 2025 --through-week 14
    python pipeline.py --postseason             # NFL postseason rounds
    python pipeline.py --force-refresh
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

# engine/ holds the league-agnostic plumbing (HTTP, RDF/graph, SPARQL, scoring).
# Each league lives in leagues/<league>/{builders,ontology,queries,tests}/.
sys.path.insert(0, str(Path(__file__).parent))  # repo root, so `engine` resolves

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def _current_season() -> int:
    today = date.today()
    return today.year if today.month >= 7 else today.year - 1


def _add_league_to_path(league: str) -> None:
    """Insert the chosen league's dir + builders/ so bare-name imports resolve."""
    league_dir = Path(__file__).parent / "leagues" / league
    sys.path.insert(0, str(league_dir))
    sys.path.insert(0, str(league_dir / "builders"))


def _run_nfl(args, season: int) -> None:
    from builders.rdf_builder import NFLGraphBuilder
    from builders.season_ingester import SeasonIngester

    builder = NFLGraphBuilder()
    ingester = SeasonIngester(
        builder=builder, season=season,
        cache_dir=args.cache_dir, force_refresh=args.force_refresh,
    )
    ingester.ingest(through_week=args.through_week)
    if args.postseason:
        ingester.ingest_postseason()


def _run_mlb(args, season: int) -> None:
    from builders.rdf_builder import MLBGraphBuilder
    from builders.day_ingester import DayIngester

    builder = MLBGraphBuilder()
    ingester = DayIngester(
        builder=builder, season=season,
        cache_dir=args.cache_dir, force_refresh=args.force_refresh,
    )
    ingester.ingest(days=args.days)
    ingester.ingest_standings()
    ingester.print_summary()


def main() -> None:
    args = _parse_args()
    season = args.season or _current_season()
    _add_league_to_path(args.league)

    logger.info("Fetching ESPN %s data for %d → %s", args.league.upper(), season, args.cache_dir)
    if args.league == "mlb":
        _run_mlb(args, season)
    else:
        _run_nfl(args, season)
    logger.info("Done — cached to %s", args.cache_dir)


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Who2Root4 — ESPN data fetcher")
    p.add_argument("--league",        choices=["nfl", "mlb"], default="nfl",
                   help="League to fetch (default: nfl)")
    p.add_argument("--season",        type=int,
                   help="Season year (default: auto-detected)")
    p.add_argument("--through-week",  type=int,
                   help="[NFL] Cache only up to this week number (default: all available)")
    p.add_argument("--postseason",    action="store_true",
                   help="[NFL] Also cache postseason rounds")
    p.add_argument("--days",          type=int, default=14,
                   help="[MLB] Number of past days of daily scoreboards to fetch (default: 14)")
    p.add_argument("--cache-dir",     metavar="PATH", default=".cache/espn",
                   help="Directory for ESPN JSON cache (default: .cache/espn)")
    p.add_argument("--force-refresh", action="store_true",
                   help="Re-fetch from ESPN even if cache already exists")
    return p.parse_args()


if __name__ == "__main__":
    main()
