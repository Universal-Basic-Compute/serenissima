"""
Phase 3: Moment Flow — Active moments radiate energy based on duration.

Radiation rate = 1 / (duration_minutes x 12)
Flow = energy x radiation_rate x share x weight
Received = flow x sqrt(target.weight)

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
import math
from typing import List, Dict
from runtime.physics.graph import GraphQueries, GraphOps
from runtime.physics.constants import (
    TICKS_PER_MINUTE, TOP_N_LINKS
)

logger = logging.getLogger(__name__)


def phase_moment_flow(
    read: GraphQueries,
    write: GraphOps,
    active_moments: List[Dict],
    queries: any,  # TickQueries
    energy_flows_through_func: callable
) -> float:
    """
    Run Phase 3: Moment Flow.

    Args:
        read: Graph read interface
        write: Graph write interface
        active_moments: List of active moments
        queries: TickQueries instance
        energy_flows_through_func: Function to record energy flow through link

    Returns:
        total_flowed
    """
    total_flowed = 0.0

    # Sort by energy x weight
    sorted_moments = sorted(
        active_moments,
        key=lambda m: (m.get('energy', 0.0) or 0.0) * (m.get('weight', 1.0) or 1.0),
        reverse=True
    )

    for moment in sorted_moments:
        moment_id = moment.get('id')

        try:
            # Get current state
            m = read.query(f"""
            MATCH (m:Moment {{id: '{moment_id}'}})
            RETURN m.energy AS energy, m.duration_minutes AS duration, m.weight AS weight
            """)
            if not m:
                continue

            moment_energy = m[0].get('energy', 0.0) or 0.0
            duration = m[0].get('duration', 1.0) or 1.0  # Default 1 minute
            moment_weight = m[0].get('weight', 1.0) or 1.0

            if moment_energy <= 0.01:
                continue

            # Calculate radiation rate based on duration
            radiation_rate = 1.0 / (duration * TICKS_PER_MINUTE)
            radiation = moment_energy * radiation_rate

            # Get top 20 outgoing links
            links = queries.get_hot_links_from_moment(moment_id, TOP_N_LINKS)

            if not links:
                continue

            # Calculate total weight for distribution
            total_weight = sum(l.get('weight', 1.0) or 1.0 for l in links)
            if total_weight <= 0:
                continue

            for link in links:
                target_id = link.get('target_id')
                target_weight = link.get('target_weight', 1.0) or 1.0
                target_energy = link.get('target_energy', 0.0) or 0.0
                link_weight = link.get('weight', 1.0) or 1.0

                # Calculate share and flow
                share = link_weight / total_weight

                flow = radiation * share * link_weight
                received = flow * math.sqrt(target_weight)

                if flow > 0.001:
                    # Deduct from moment
                    moment_energy -= flow
                    target_energy += received
                    total_flowed += flow

                    # Apply unified traversal
                    energy_flows_through_func(
                        link, flow, None,
                        moment_id, moment_energy,
                        target_id, target_energy
                    )

                    # Update target
                    write._query(f"""
                    MATCH (n {{id: '{target_id}'}})
                    SET n.energy = {target_energy}
                    """)

            # Update moment energy
            write._query(f"""
            MATCH (m:Moment {{id: '{moment_id}'}})
            SET m.energy = {max(0, moment_energy)}
            """)

        except Exception as e:
            logger.warning(f"[Phase 3] Flow error for {moment_id}: {e}")

    return total_flowed
