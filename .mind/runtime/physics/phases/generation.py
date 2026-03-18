"""
Phase 1: Generation — Actors generate energy (proximity-gated).

Formula: actor.energy += weight × GENERATION_RATE × proximity
Proximity = 1 / (1 + path_resistance(player, actor))

DOCS: docs/physics/IMPLEMENTATION_Physics.md
"""

import logging
from typing import Tuple
from runtime.physics.graph import GraphQueries, GraphOps
from runtime.physics.constants import GENERATION_RATE

logger = logging.getLogger(__name__)


def phase_generation(
    read: GraphQueries,
    write: GraphOps,
    player_id: str,
    calculate_proximity_func: callable
) -> Tuple[float, int]:
    """
    Run Phase 1: Generation.

    Args:
        read: Graph read interface
        write: Graph write interface
        player_id: Player actor ID
        calculate_proximity_func: Function to calculate proximity to player

    Returns:
        (total_generated, actors_updated)
    """
    total_generated = 0.0
    actors_updated = 0

    try:
        # Get all actors sorted by weight descending
        actors = read.query("""
        MATCH (a:Actor)
        WHERE a.alive = true OR a.alive IS NULL
        RETURN a.id AS id, a.weight AS weight, a.energy AS energy
        ORDER BY a.weight DESC
        """)

        for actor in actors:
            actor_id = actor.get('id')
            weight = actor.get('weight', 1.0) or 1.0
            current_energy = actor.get('energy', 0.0) or 0.0

            # Calculate proximity to player
            if actor_id == player_id:
                proximity = 1.0
            else:
                proximity = calculate_proximity_func(player_id, actor_id)

            # Generate energy
            generated = weight * GENERATION_RATE * proximity
            new_energy = current_energy + generated
            total_generated += generated

            # Update actor
            write._query(f"""
            MATCH (a:Actor {{id: '{actor_id}'}})
            SET a.energy = {new_energy}
            """)
            actors_updated += 1

    except Exception as e:
        logger.warning(f"[Phase 1] Generation error: {e}")

    return total_generated, actors_updated
