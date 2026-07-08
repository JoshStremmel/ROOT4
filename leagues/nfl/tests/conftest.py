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
