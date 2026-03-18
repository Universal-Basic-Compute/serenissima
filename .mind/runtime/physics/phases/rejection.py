"""
Phase 8: Rejection — Reject incoherent possible moments.

Return 80% energy to player.
Links to speaker stay warm (cool naturally).

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
from typing import List, Dict
from runtime.physics.graph import GraphQueries, GraphOps
from runtime.physics.constants import REJECTION_RETURN_RATE

logger = logging.getLogger(__name__)


def phase_rejection(
    read: GraphQueries,
    write: GraphOps,
    possible_moments: List[Dict],
    player_id: str,
    current_tick: int
) -> List[Dict]:
    """
    Run Phase 8: Rejection.

    Args:
        read: Graph read interface
        write: Graph write interface
        possible_moments: List of possible moments
        player_id: Player actor ID
        current_tick: Current tick number

    Returns:
        rejections
    """
    rejections = []

    try:
        # Get moments marked for rejection
        rejected = read.query("""
        MATCH (m:Moment)
        WHERE m.status = "failed" AND m.energy > 0
        RETURN m.id AS id, m.energy AS energy
        """)

        for moment in rejected:
            moment_id = moment.get('id')
            energy = moment.get('energy', 0.0) or 0.0

            # Return energy to player
            return_energy = energy * REJECTION_RETURN_RATE

            # Get player's current energy
            player = read.query(f"""
            MATCH (p:Actor {{id: '{player_id}'}})
            RETURN p.energy AS energy
            """)

            if player:
                player_energy = player[0].get('energy', 0.0) or 0.0
                new_energy = player_energy + return_energy

                write._query(f"""
                MATCH (p:Actor {{id: '{player_id}'}})
                SET p.energy = {new_energy}
                """)

            # Clear moment energy
            write._query(f"""
            MATCH (m:Moment {{id: '{moment_id}'}})
            SET m.energy = 0, m.tick_resolved = {current_tick}
            """)

            rejections.append({
                'moment_id': moment_id,
                'energy_returned': return_energy,
                'tick': current_tick
            })

            logger.info(f"[Phase 8] Rejected {moment_id}, returned {return_energy:.2f} to player")

    except Exception as e:
        logger.warning(f"[Phase 8] Rejection error: {e}")

    return rejections
