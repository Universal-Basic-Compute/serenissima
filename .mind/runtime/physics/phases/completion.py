"""
Phase 7: Completion — Complete moments that meet criteria.

Just set status. Links cool naturally.
Crystallize actor↔actor links.

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
from typing import List, Dict, Tuple
from runtime.physics.graph import GraphQueries, GraphOps

logger = logging.getLogger(__name__)


def phase_completion(
    read: GraphQueries,
    write: GraphOps,
    active_moments: List[Dict],
    current_tick: int,
    crystallize_actor_links_func: callable
) -> Tuple[List[Dict], int]:
    """
    Run Phase 7: Completion.

    Args:
        read: Graph read interface
        write: Graph write interface
        active_moments: List of active moments
        current_tick: Current tick number
        crystallize_actor_links_func: Function to create links between sharing actors

    Returns:
        (completions, links_crystallized)
    """
    completions = []
    links_crystallized = 0

    # Completion criteria (simplified: energy threshold)
    COMPLETION_THRESHOLD = 0.8

    for moment in active_moments:
        moment_id = moment.get('id')

        try:
            # Get current state
            m = read.query(f"""
            MATCH (m:Moment {{id: '{moment_id}'}})
            RETURN m.energy AS energy, m.status AS status
            """)
            if not m:
                continue

            energy = m[0].get('energy', 0.0) or 0.0

            if energy >= COMPLETION_THRESHOLD:
                # Complete the moment
                write._query(f"""
                MATCH (m:Moment {{id: '{moment_id}'}})
                SET m.status = 'completed',
                    m.tick_resolved = {current_tick}
                """)

                # Crystallize links between actors
                crystallized = crystallize_actor_links_func(moment_id)
                links_crystallized += crystallized

                completions.append({
                    'moment_id': moment_id,
                    'energy': energy,
                    'tick': current_tick,
                    'links_crystallized': crystallized
                })

                logger.info(f"[Phase 7] Completed {moment_id}")

        except Exception as e:
            logger.warning(f"[Phase 7] Completion error for {moment_id}: {e}")

    return completions, links_crystallized
