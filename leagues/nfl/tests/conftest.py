"""
conftest.py
───────────
Pytest configuration for the leagues/nfl test suite.
Adds builders/ and queries/ to sys.path so all test files
can import project modules without relative import hacks.
"""

import sys
from pathlib import Path

# Make builders/ and queries/ importable from any test file
ROOT = Path(__file__).parent.parent          # leagues/nfl
REPO_ROOT = ROOT.parent.parent                # ROOT4 repo root, so `engine` resolves
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(ROOT / "builders"))
sys.path.insert(0, str(ROOT / "queries"))
sys.path.insert(0, str(ROOT / "tests"))

# A second league (leagues/mlb) exposes identically-named bare modules
# (espn_fetcher, rdf_builder, fixtures, …). When `pytest leagues` collects both
# suites in one process, drop any cached copies so this league's tests re-import
# from the dirs prepended above rather than the other league's stale modules.
for _m in ("espn_fetcher", "rdf_builder", "team_strength", "fixtures",
           "season_ingester", "day_ingester", "recommendation_engine",
           "scenario_builder", "sparql_queries"):
    sys.modules.pop(_m, None)
