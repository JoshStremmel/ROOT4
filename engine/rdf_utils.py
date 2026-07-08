"""
engine/rdf_utils.py
────────────────────
Small league-agnostic helpers for coercing rdflib SPARQL result values
(which come back as Literal/str-like objects) into plain Python types.
Used by any league's recommendation/scoring code that reads SPARQL rows.
"""

from __future__ import annotations

from typing import Any


def safe_float(val: Any) -> float | None:
    try:
        return float(str(val))
    except (TypeError, ValueError):
        return None


def safe_int(val: Any) -> int | None:
    try:
        return int(str(val))
    except (TypeError, ValueError):
        return None


def safe_bool(val: Any) -> bool | None:
    if val is None:
        return None
    s = str(val).lower()
    if s == "true":
        return True
    if s == "false":
        return False
    return None
