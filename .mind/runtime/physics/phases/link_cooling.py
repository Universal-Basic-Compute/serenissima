"""
Phase 6: Link Cooling — Links cool by draining to nodes and growing weight.

- Drain 30% to connected nodes (50/50 split)
- Convert 10% to permanent weight growth

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
from typing import Tuple, Dict
from runtime.physics.graph import GraphQueries, GraphOps
from runtime.physics.constants import (
    COLD_THRESHOLD, LINK_DRAIN_RATE, LINK_TO_WEIGHT_RATE
)

logger = logging.getLogger(__name__)

# Minimum energy to process - links below this are too cold to bother cooling
MIN_COOLING_ENERGY = 0.02


def phase_link_cooling(
    read: GraphQueries,
    write: GraphOps
) -> Tuple[float, int]:
    """
    Run Phase 6: Link Cooling.

    Uses batched updates to avoid O(N) individual queries.

    Args:
        read: Graph read interface
        write: Graph write interface

    Returns:
        (total_cooled, links_cooled)
    """
    total_cooled = 0.0
    links_cooled = 0

    try:
        # Count hot links first
        count_result = read.query(f"""
        MATCH ()-[r]->()
        WHERE r.energy IS NOT NULL AND r.energy > {MIN_COOLING_ENERGY}
        RETURN count(r) AS cnt, sum(r.energy) AS total_energy
        """)

        if not count_result or count_result[0].get('cnt', 0) == 0:
            return 0.0, 0

        links_cooled = count_result[0].get('cnt', 0)
        total_energy = count_result[0].get('total_energy', 0.0) or 0.0
        total_cooled = total_energy * LINK_DRAIN_RATE

        # Single batch update: cool all hot links at once
        # Energy decays, weight grows (simplified - no node distribution)
        decay_factor = 1.0 - LINK_DRAIN_RATE - LINK_TO_WEIGHT_RATE
        write._query(f"""
        MATCH ()-[r]->()
        WHERE r.energy > {MIN_COOLING_ENERGY}
        SET r.energy = r.energy * {decay_factor},
            r.weight = coalesce(r.weight, 1.0) + r.energy * {LINK_TO_WEIGHT_RATE}
        """)

    except Exception as e:
        logger.warning(f"[Phase 6] Cooling error: {e}")

    return total_cooled, links_cooled
