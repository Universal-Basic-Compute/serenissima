"""
Phase 4: Moment Interaction — Active moments support or contradict each other.

Only between moments sharing narratives.
Uses weight-based proximity instead of emotion proximity.

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
import math
from typing import List, Dict
from runtime.physics.graph import GraphOps
from runtime.physics.constants import (
    SUPPORT_THRESHOLD, CONTRADICT_THRESHOLD, INTERACTION_RATE
)

logger = logging.getLogger(__name__)


def phase_moment_interaction(
    write: GraphOps,
    active_moments: List[Dict],
    queries: any  # TickQueries
) -> float:
    """
    Run Phase 4: Moment Interaction.

    Args:
        write: Graph write interface
        active_moments: List of active moments
        queries: TickQueries instance

    Returns:
        total_interacted
    """
    total_interacted = 0.0

    if len(active_moments) < 2:
        return 0.0

    for i, m1 in enumerate(active_moments):
        m1_id = m1.get('id')
        m1_energy = m1.get('energy', 0.0) or 0.0

        if m1_energy <= 0.01:
            continue

        for m2 in active_moments[i+1:]:
            m2_id = m2.get('id')
            m2_energy = m2.get('energy', 0.0) or 0.0

            try:
                # Check for shared narratives
                shared = queries.get_shared_narratives(m1_id, m2_id)
                if not shared:
                    continue

                # Use weight-based proximity: shared narrative count as a factor
                proximity = min(1.0, len(shared) * 0.3)

                if proximity > SUPPORT_THRESHOLD:
                    # Support: m1 feeds m2
                    support = m1_energy * INTERACTION_RATE * proximity
                    m2_weight = m2.get('weight', 1.0) or 1.0
                    received = support * math.sqrt(m2_weight)
                    m2_energy += received
                    total_interacted += support

                    write._query(f"""
                    MATCH (m:Moment {{id: '{m2_id}'}})
                    SET m.energy = {m2_energy}
                    """)

                elif proximity < CONTRADICT_THRESHOLD:
                    # Contradict: m1 drains m2
                    suppress = m1_energy * INTERACTION_RATE * (1 - proximity)
                    m2_energy = max(0, m2_energy - suppress)
                    total_interacted += suppress

                    write._query(f"""
                    MATCH (m:Moment {{id: '{m2_id}'}})
                    SET m.energy = {m2_energy}
                    """)

            except Exception as e:
                logger.warning(f"[Phase 4] Interaction error {m1_id} <-> {m2_id}: {e}")

    return total_interacted
