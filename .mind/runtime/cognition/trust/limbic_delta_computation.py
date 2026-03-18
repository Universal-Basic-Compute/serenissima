"""
Limbic Delta Computation — Phase T2

Spec: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md section 1

The Limbic Delta is the primary signal that drives trust changes on links.
It measures the net change in limbic state during/after an interaction.

    limbic_delta = satisfaction_delta - frustration_delta - 0.5 * anxiety_delta

Positive delta = user benefited (satisfaction up, frustration down).
Negative delta = user was harmed (frustration up, satisfaction down).
Zero = neutral interaction.

Bounds: [-2.5, +2.5] theoretical; [-0.3, +0.3] typical.
"""

from __future__ import annotations

from ..models import DriveSnapshot

# Theoretical bounds for clamping. The algorithm doc says [-2.0, +2.0]
# based on (sat 0->1, frust 1->0, anx 1->0) but the actual formula
# satisfaction_delta - frustration_delta - 0.5 * anxiety_delta can reach
# +2.5 in extreme cases (+1 - (-1) - 0.5*(-1)). We clamp to [-2.5, +2.5]
# to be safe while preserving the full signal range.
LIMBIC_DELTA_MIN = -2.5
LIMBIC_DELTA_MAX = 2.5


def compute_limbic_delta(
    before: DriveSnapshot,
    after: DriveSnapshot,
) -> float:
    """Compute the net limbic change between two drive snapshots.

    Parameters
    ----------
    before:
        Drive snapshot captured at stimulus injection (start of tick).
    after:
        Drive snapshot captured after limbic update (end of tick or
        start of next tick).

    Returns
    -------
    float
        Signed scalar in [-2.5, +2.5]. Positive = beneficial interaction,
        negative = harmful interaction.
    """
    satisfaction_delta = after.satisfaction - before.satisfaction
    frustration_delta = after.frustration - before.frustration
    anxiety_delta = after.anxiety - before.anxiety

    # Primary signal: satisfaction gain minus frustration gain.
    # Anxiety reduction is a secondary positive signal (weighted lower).
    delta = satisfaction_delta - frustration_delta - 0.5 * anxiety_delta

    # Clamp to theoretical bounds.
    return max(LIMBIC_DELTA_MIN, min(LIMBIC_DELTA_MAX, delta))
