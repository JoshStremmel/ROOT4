"""
conftest.py (MLB)
─────────────────
Pytest configuration for the leagues/mlb test suite. Adds builders/ and the
repo root to sys.path so tests can import project modules by bare name.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent          # leagues/mlb
REPO_ROOT = ROOT.parent.parent               # ROOT4 repo root, so `engine` resolves
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(ROOT / "builders"))
sys.path.insert(0, str(ROOT / "tests"))

# Both leagues expose identically-named bare modules (espn_fetcher, rdf_builder,
# fixtures, …). When `pytest leagues` collects both suites in one process, drop
# any cached copies so this league's tests re-import from the dirs prepended
# above rather than the other league's stale modules.
for _m in ("espn_fetcher", "rdf_builder", "team_strength", "fixtures",
           "season_ingester", "day_ingester"):
    sys.modules.pop(_m, None)
