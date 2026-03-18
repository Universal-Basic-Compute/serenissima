"""
Phase 5: Narrative Backflow — Narratives radiate to actors, gated by link.energy.

No threshold (just computational minimum 0.01).
Gated by link.energy in formula: unfocused = no backflow.

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
import math
from runtime.physics.graph import GraphQueries, GraphOps
from runtime.physics.constants import (
    BACKFLOW_RATE, COLD_THRESHOLD, TOP_N_LINKS
)

logger = logging.getLogger(__name__)

# Limit narratives per tick to prevent O(N) query explosion
# Only the hottest narratives backflow each tick
MAX_NARRATIVES_PER_TICK = 50


def phase_narrative_backflow(
    read: GraphQueries,
    write: GraphOps,
    queries: any,  # TickQueries
    energy_flows_through_func: callable
) -> float:
    """
    Run Phase 5: Narrative Backflow.

    Args:
        read: Graph read interface
        write: Graph write interface
        queries: TickQueries instance
        energy_flows_through_func: Function to record energy flow through link

    Returns:
        total_backflow
    """
    total_backflow = 0.0

    try:
        # Get TOP N narratives by energy (not all 1600+)
        # This prevents O(N) query explosion while prioritizing hot narratives
        narratives = read.query(f"""
        MATCH (n:Narrative)
        WHERE n.energy > 0.01
        RETURN n.id AS id, n.energy AS energy
        ORDER BY n.energy DESC
        LIMIT {MAX_NARRATIVES_PER_TICK}
        """)

        for narr in narratives:
            narr_id = narr.get('id')
            narr_energy = narr.get('energy', 0.0) or 0.0

            # Get top 20 actor links
            links = queries.get_hot_links_to_actors(narr_id, TOP_N_LINKS)

            for link in links:
                link_energy = link.get('link_energy', 0.0) or 0.0

                # Gate by link.energy
                if link_energy < COLD_THRESHOLD:
                    continue

                actor_id = link.get('actor_id')
                actor_energy = link.get('actor_energy', 0.0) or 0.0
                actor_weight = link.get('actor_weight', 1.0) or 1.0
                link_weight = link.get('weight', 1.0) or 1.0

                # Backflow formula (v1.2: no conductivity)
                backflow = narr_energy * BACKFLOW_RATE * link_weight * link_energy
                received = backflow * math.sqrt(actor_weight)

                if backflow > 0.001:
                    narr_energy -= backflow
                    actor_energy += received
                    total_backflow += backflow

                    # Apply traversal
                    energy_flows_through_func(
                        link, backflow, None,
                        narr_id, narr_energy,
                        actor_id, actor_energy
                    )

                    # Update actor
                    write._query(f"""
                    MATCH (a:Actor {{id: '{actor_id}'}})
                    SET a.energy = {actor_energy}
                    """)

            # Update narrative
            write._query(f"""
            MATCH (n:Narrative {{id: '{narr_id}'}})
            SET n.energy = {max(0, narr_energy)}
            """)

    except Exception as e:
        logger.warning(f"[Phase 5] Backflow error: {e}")

    return total_backflow
