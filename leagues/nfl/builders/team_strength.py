"""
team_strength.py
────────────────
NFL wrapper around the league-agnostic team-strength scorer in
engine/team_strength.py. The scoring algorithm itself (point diff, SOS,
group-standing bonus, recent form, win-margin consistency) has no NFL
content — only the "group" for signal 3 is NFL-specific (division), so
that's the one thing this wrapper supplies.

Usage
─────
    from team_strength import computeAllTeamStrengths, print_strength_table
    strengths = computeAllTeamStrengths(all_games, standings)
"""

from __future__ import annotations

from engine.team_strength import compute_all_team_strengths, print_strength_table
from espn_fetcher import DIVISION_MAP


def computeAllTeamStrengths(
    all_games: list[dict],
    standings: list[dict] | None = None,
) -> dict[str, dict]:
    """Compute NFL team strength scores (division used as the group-bonus signal)."""
    return compute_all_team_strengths(
        all_games, group_key_fn=DIVISION_MAP.get, standings=standings,
    )


__all__ = ["computeAllTeamStrengths", "print_strength_table"]
