"""
engine/sparql_utils.py
───────────────────────
League-agnostic SPARQL execution helpers. Every league's query module
(leagues/<league>/queries/sparql_queries.py) defines its own PREFIX block
and query strings, but runs them through the same run_query()/print_results()
pair — there is nothing NFL-specific (or league-specific at all) about
executing a SPARQL SELECT against an rdflib Dataset and printing rows.
"""

from __future__ import annotations

from typing import Any

from rdflib import Dataset


def run_query(
    dataset: Dataset,
    query_str: str,
    bindings: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """
    Execute a SPARQL SELECT query on the dataset.

    Parameters
    ----------
    dataset  : rdflib Dataset
    query_str: SPARQL SELECT string (use {placeholder} for IRI substitution)
    bindings : dict of str placeholder → IRI string (substituted before parse)

    Returns
    -------
    List of row dicts  {var_name: value}
    """
    q = query_str
    if bindings:
        for key, val in bindings.items():
            q = q.replace(f"{{{key}}}", val)

    rows = []
    for row in dataset.query(q):
        rows.append({str(var): str(val) if val is not None else None
                     for var, val in zip(row.labels, row)})
    return rows


def print_results(rows: list[dict], title: str = "") -> None:
    """Pretty-print query results to stdout."""
    if title:
        print(f"\n{'='*60}")
        print(f"  {title}")
        print(f"{'='*60}")
    if not rows:
        print("  (no results)")
        return
    headers = list(rows[0].keys())
    col_w   = {h: max(len(h), max((len(str(r[h] or "")) for r in rows), default=0))
               for h in headers}
    header_line = "  " + "  ".join(h.ljust(col_w[h]) for h in headers)
    print(header_line)
    print("  " + "-" * (sum(col_w.values()) + 2 * len(headers)))
    for row in rows:
        print("  " + "  ".join(str(row.get(h, "") or "").ljust(col_w[h]) for h in headers))
