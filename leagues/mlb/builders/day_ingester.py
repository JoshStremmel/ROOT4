"""
day_ingester.py (MLB)
─────────────────────
Ingests MLB games day-by-day from the ESPN API into the holonic RDF dataset.
Baseball has no weekly cadence, so — unlike the NFL SeasonIngester — this walks
a range of calendar dates, fetching one daily scoreboard per date.

Usage
─────
    from day_ingester import DayIngester
    from rdf_builder import MLBGraphBuilder

    builder = MLBGraphBuilder()
    ing = DayIngester(builder, season=2026, cache_dir=".cache/espn")
    ing.ingest(days=14)          # today and the previous 14 days
    ing.ingest_standings()       # current standings snapshot
    ing.print_summary()
"""

from __future__ import annotations

import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from espn_fetcher import (
    fetch_scoreboard_date,
    fetch_standings,
    parse_scoreboard,
    parse_standings,
)
from rdf_builder import MLBGraphBuilder

logger = logging.getLogger(__name__)

DEFAULT_REQUEST_DELAY = 1.2   # seconds between ESPN API calls


class DayIngester:
    """Orchestrates day-range ingestion into an MLBGraphBuilder dataset."""

    def __init__(
        self,
        builder:       MLBGraphBuilder,
        season:        int,
        cache_dir:     str | Path = ".cache/espn",
        request_delay: float = DEFAULT_REQUEST_DELAY,
        force_refresh: bool  = False,
    ) -> None:
        self.builder       = builder
        self.season        = season
        self.cache_dir     = Path(cache_dir)
        self.request_delay = request_delay
        self.force_refresh = force_refresh
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self._days_loaded: list[str]  = []
        self._all_games:   list[dict] = []

    # ── Public API ─────────────────────────────────────────────────────────────
    def ingest(self, days: int = 14, end: date | None = None) -> None:
        """Fetch and load the `days` calendar days ending on `end` (default: today)."""
        end = end or date.today()
        dates = [end - timedelta(days=i) for i in range(days, -1, -1)]
        logger.info("Ingesting MLB games for %d days ending %s …", days, end.isoformat())

        for d in dates:
            parsed, fetched = self._load_day(d)
            if parsed is None:
                continue
            games = parsed.get("games", [])
            if not games:
                continue

            self.builder.add_teams_from_scoreboard(parsed)
            self.builder.add_games(parsed)
            self._all_games.extend(games)
            self._days_loaded.append(d.isoformat())
            logger.info("%s: loaded %d games (total: %d)", d.isoformat(), len(games), len(self._all_games))

            if fetched:
                time.sleep(self.request_delay)

        logger.info("Ingestion complete: %d days, %d games", len(self._days_loaded), len(self._all_games))

    def ingest_standings(self) -> list[dict]:
        """Fetch current standings, add to dataset, return parsed list."""
        cache_path = self.cache_dir / f"standings_{self.season}.json"
        if not self.force_refresh and cache_path.exists():
            logger.info("Standings: loading from cache %s", cache_path)
            raw = json.loads(cache_path.read_text())
        else:
            logger.info("Standings: fetching from ESPN …")
            raw = fetch_standings()
            cache_path.write_text(json.dumps(raw, indent=2))
            time.sleep(self.request_delay)

        parsed = parse_standings(raw)
        self.builder.add_standings(parsed)
        self.builder.add_teams_from_standings(parsed)
        return parsed

    def all_games(self) -> list[dict]:
        return list(self._all_games)

    def print_summary(self) -> None:
        total    = len(self._all_games)
        complete = sum(1 for g in self._all_games if g.get("status") == "post")
        upcoming = sum(1 for g in self._all_games if g.get("status") == "pre")
        live     = sum(1 for g in self._all_games if g.get("status") == "in")
        print(f"\n{'='*55}")
        print(f"  Season {self.season} — MLB Ingestion Summary")
        print(f"{'='*55}")
        print(f"  Days loaded  : {self._days_loaded[0] if self._days_loaded else '—'}"
              f" … {self._days_loaded[-1] if self._days_loaded else '—'}"
              f"  ({len(self._days_loaded)} days)")
        print(f"  Total games  : {total}")
        print(f"    Completed  : {complete}")
        print(f"    Upcoming   : {upcoming}")
        print(f"    Live       : {live}")
        print()

    # ── Cache helpers ──────────────────────────────────────────────────────────
    def _cache_path(self, d: date) -> Path:
        return self.cache_dir / f"scoreboard_mlb_{d.strftime('%Y%m%d')}.json"

    def _load_day(self, d: date) -> tuple[dict[str, Any] | None, bool]:
        path = self._cache_path(d)
        network_fetched = False
        if not self.force_refresh and path.exists():
            raw = json.loads(path.read_text())
        else:
            try:
                raw = fetch_scoreboard_date(d.strftime("%Y%m%d"))
            except Exception as exc:
                logger.warning("%s: fetch failed (%s)", d.isoformat(), exc)
                return None, False
            path.write_text(json.dumps(raw, indent=2))
            network_fetched = True

        parsed = parse_scoreboard(raw)
        if not parsed.get("games"):
            return None, network_fetched
        return parsed, network_fetched
