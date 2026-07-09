"""
team_strength.py (MLB)
──────────────────────
MLB wrapper around the league-agnostic team-strength scorer in
engine/team_strength.py. Only the "group" signal (division) is league-specific,
so that's the one thing this wrapper supplies — everything else (run diff, SOS,
recent form, win-margin consistency) is generic.
"""

from __future__ import annotations

from engine.team_strength import compute_all_team_strengths, print_strength_table
from espn_fetcher import DIVISION_MAP


def computeAllTeamStrengths(
    all_games: list[dict],
    standings: list[dict] | None = None,
) -> dict[str, dict]:
    """Compute MLB team strength scores (division used as the group-bonus signal)."""
    return compute_all_team_strengths(
        all_games, group_key_fn=DIVISION_MAP.get, standings=standings,
    )


__all__ = ["computeAllTeamStrengths", "print_strength_table"]
