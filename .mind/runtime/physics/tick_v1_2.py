"""
Schema v1.2 — Energy Physics Tick

8-phase tick algorithm with NO DECAY.
Refactored into modular phases.

DOCS: docs/physics/algorithms/ALGORITHM_Physics_Schema_v1.2_Energy_Physics.md
"""

import logging
from typing import List, Dict, Any, Tuple
from runtime.physics.graph import GraphQueries, GraphOps
from runtime.physics.tick_v1_2_types import TickResultV1_2
from runtime.physics.tick_v1_2_queries import TickQueries
from runtime.physics.graph.graph_query_utils import dijkstra_with_resistance, dijkstra_single_source
from runtime.physics.constants import BLOCKED_PATH_RESISTANCE, MAX_PATH_HOPS

# Import phases
from runtime.physics.phases.generation import phase_generation
from runtime.physics.phases.moment_draw import phase_moment_draw
from runtime.physics.phases.moment_flow import phase_moment_flow
from runtime.physics.phases.moment_interaction import phase_moment_interaction
from runtime.physics.phases.narrative_backflow import phase_narrative_backflow
from runtime.physics.phases.link_cooling import phase_link_cooling
from runtime.physics.phases.completion import phase_completion
from runtime.physics.phases.rejection import phase_rejection

logger = logging.getLogger(__name__)


class GraphTickV1_2:
    """
    Schema v1.2 Energy Physics Tick Engine.

    NO DECAY. Energy flows through links and cools naturally.
    """

    def __init__(
        self,
        graph_name: str = "graph",
        host: str = "localhost",
        port: int = 6379,
        read: GraphQueries = None,
        write: GraphOps = None
    ):
        self.read = read or GraphQueries(graph_name=graph_name, host=host, port=port)
        self.write = write or GraphOps(graph_name=graph_name, host=host, port=port)
        self.queries = TickQueries(self.read)
        self.graph_name = graph_name
        self._tick_count = 0
        self._proximity_cache: Dict[str, float] = {}  # node_id -> resistance from player

        logger.info(f"[GraphTick v1.2] Initialized for {graph_name}")

    def run(self, current_tick: int = 0, player_id: str = "player", elapsed_minutes: float = None) -> TickResultV1_2:
        """
        Run a v1.2 graph tick with 8 phases.

        Args:
            current_tick: Current world tick number
            player_id: Player actor ID for proximity calculations
            elapsed_minutes: (Optional) If provided, run multiple ticks to cover elapsed time

        Returns:
            TickResultV1_2 with phase stats
        """
        if elapsed_minutes is not None:
            # Map elapsed minutes to multiple ticks
            # v1.2 tick = 5 seconds, so 1 minute = 12 ticks
            num_ticks = max(1, int(elapsed_minutes * 12))
            logger.info(f"[GraphTick v1.2] Running {num_ticks} ticks for {elapsed_minutes} minutes")
            
            combined_result = TickResultV1_2()
            for i in range(num_ticks):
                res = self._run_single_tick(current_tick + i, player_id)
                # Combine results
                combined_result.energy_generated += res.energy_generated
                combined_result.energy_drawn += res.energy_drawn
                combined_result.energy_flowed += res.energy_flowed
                combined_result.energy_interacted += res.energy_interacted
                combined_result.energy_backflowed += res.energy_backflowed
                combined_result.energy_cooled += res.energy_cooled
                combined_result.actors_updated = max(combined_result.actors_updated, res.actors_updated)
                combined_result.moments_active = res.moments_active
                combined_result.moments_possible = res.moments_possible
                combined_result.moments_completed += res.moments_completed
                combined_result.moments_rejected += res.moments_rejected
                combined_result.links_cooled += res.links_cooled
                combined_result.links_crystallized += res.links_crystallized
                combined_result.completions.extend(res.completions)
                combined_result.rejections.extend(res.rejections)
                combined_result.hot_links = res.hot_links
                combined_result.cold_links = res.cold_links
            
            # Add legacy fields for Orchestrator compatibility
            setattr(combined_result, 'energy_total', combined_result.energy_generated) # Simplified
            setattr(combined_result, 'moments_decayed', combined_result.moments_completed)
            setattr(combined_result, 'avg_pressure', 0.0) # v1.2 doesn't track pressure yet
            setattr(combined_result, 'flips', combined_result.completions)
            
            return combined_result

        return self._run_single_tick(current_tick, player_id)

    def _run_single_tick(self, current_tick: int, player_id: str) -> TickResultV1_2:
        """Internal single tick execution."""
        self._tick_count += 1
        logger.info(f"[GraphTick v1.2] Running single tick #{current_tick}")
        result = TickResultV1_2()

        # Pre-compute all proximities in ONE Dijkstra pass
        self._compute_all_proximities(player_id)

        # Phase 1: Generation (proximity-gated)
        result.energy_generated, result.actors_updated = phase_generation(
            self.read, self.write, player_id, self._calculate_proximity
        )

        # Phase 2: Moment Draw (possible + active)
        possible_moments = self.queries.get_moments_by_status('possible')
        active_moments = self.queries.get_moments_by_status('active')
        result.moments_possible = len(possible_moments)
        result.moments_active = len(active_moments)

        all_draw_moments = possible_moments + active_moments
        result.energy_drawn = phase_moment_draw(
            self.write, all_draw_moments, self.queries, self._energy_flows_through
        )

        # Phase 3: Moment Flow (active only, duration-based)
        result.energy_flowed = phase_moment_flow(
            self.read, self.write, active_moments, self.queries, self._energy_flows_through
        )

        # Phase 4: Moment Interaction (support/contradict)
        result.energy_interacted = phase_moment_interaction(
            self.write, active_moments, self.queries
        )

        # Phase 5: Narrative Backflow (link.energy gated)
        result.energy_backflowed = phase_narrative_backflow(
            self.read, self.write, self.queries, self._energy_flows_through
        )

        # Phase 6: Link Cooling (drain)
        result.energy_cooled, result.links_cooled = phase_link_cooling(
            self.read, self.write
        )

        # Count hot/cold links
        result.hot_links, result.cold_links = self.queries.count_hot_cold_links()

        # Phase 7: Completion Processing
        completions, crystallized = phase_completion(
            self.read, self.write, active_moments, current_tick, self._crystallize_actor_links
        )
        result.completions = completions
        result.moments_completed = len(completions)
        result.links_crystallized = crystallized

        # Phase 8: Rejection Processing
        rejections = phase_rejection(
            self.read, self.write, possible_moments, player_id, current_tick
        )
        result.rejections = rejections
        result.moments_rejected = len(rejections)

        # Add legacy fields for single tick too
        setattr(result, 'energy_total', result.energy_generated)
        setattr(result, 'moments_decayed', result.moments_completed)
        setattr(result, 'avg_pressure', 0.0)
        setattr(result, 'flips', result.completions)

        return result

    def _compute_all_proximities(self, player_id: str) -> None:
        """
        Compute resistance from player to ALL nodes in ONE Dijkstra pass.

        This replaces 23 separate Dijkstra calls with 1 single-source Dijkstra.
        Results cached in self._proximity_cache for the tick.
        """
        self._proximity_cache = {player_id: 0.0}  # Player has 0 resistance to self

        try:
            # Fetch ALL edges with L3 relational physics dimensions
            edges_result = self.read.query("""
            MATCH (a)-[r]-(b)
            WHERE a.id IS NOT NULL AND b.id IS NOT NULL
            RETURN DISTINCT a.id AS node_a, b.id AS node_b,
                   coalesce(r.weight, 1.0) AS weight,
                   coalesce(r.trust, 0.0) AS trust,
                   coalesce(r.friction, 0.0) AS friction,
                   coalesce(r.affinity, 0.0) AS affinity,
                   coalesce(r.aversion, 0.0) AS aversion
            LIMIT 5000
            """)

            if not edges_result:
                logger.debug("[Proximity] No edges found, using fallback")
                return

            # Build edge list for Dijkstra — resistance from L3 topological physics
            edges = []
            for edge in edges_result:
                trust = edge.get('trust', 0.0) or 0.0
                friction = edge.get('friction', 0.0) or 0.0
                affinity = edge.get('affinity', 0.0) or 0.0
                aversion = edge.get('aversion', 0.0) or 0.0
                # Resistance: high friction/aversion = hard to traverse
                # High trust/affinity = easier flow
                edge_factor = (1.0 + affinity + trust) / (1.0 + friction + aversion)

                edges.append({
                    'node_a': edge.get('node_a'),
                    'node_b': edge.get('node_b'),
                    'weight': edge.get('weight', 1.0) or 1.0,
                    'emotion_factor': max(0.1, edge_factor)
                })

            # Single-source Dijkstra from player
            self._proximity_cache = dijkstra_single_source(edges, player_id, MAX_PATH_HOPS)
            logger.debug(f"[Proximity] Computed {len(self._proximity_cache)} reachable nodes")

        except Exception as e:
            logger.warning(f"[Proximity] Failed to compute: {e}")
            self._proximity_cache = {player_id: 0.0}

    def _calculate_proximity(self, from_id: str, to_id: str) -> float:
        """Calculate proximity using cached resistance values."""
        # from_id is always player, to_id is the target actor
        resistance = self._proximity_cache.get(to_id, BLOCKED_PATH_RESISTANCE)
        return 1.0 / (1.0 + resistance)

    def _crystallize_actor_links(self, moment_id: str) -> int:
        """Create relates links between actors sharing a completed moment."""
        crystallized = 0
        try:
            actors = self.read.query(f"""
            MATCH (a:Actor)-[]->(m:Moment {{id: '{moment_id}'}})
            RETURN DISTINCT a.id AS actor_id
            """)

            if len(actors) < 2:
                return 0

            actor_ids = [a.get('actor_id') for a in actors if a.get('actor_id')]
            moment_emotions = self.queries.get_moment_emotions(moment_id)
            emotions_str = str(moment_emotions).replace("'", '"') if moment_emotions else "[]"

            from runtime.physics.constants import CRYSTALLIZATION_WEIGHT

            for i, actor_a in enumerate(actor_ids):
                for actor_b in actor_ids[i+1:]:
                    existing = self.read.query(f"""
                    MATCH (a:Actor {{id: '{actor_a}'}})-[r:RELATES]-(b:Actor {{id: '{actor_b}'}})
                    RETURN count(r) AS cnt
                    """)

                    if existing and existing[0].get('cnt', 0) == 0:
                        self.write._query(f"""
                        MATCH (a:Actor {{id: '{actor_a}'}}), (b:Actor {{id: '{actor_b}'}})
                        CREATE (a)-[:RELATES {{
                            weight: {CRYSTALLIZATION_WEIGHT},
                            energy: 0.0,
                            emotions: {emotions_str},
                            created_from: '{moment_id}'
                        }}]->(b)
                        """)
                        crystallized += 1
        except Exception as e:
            logger.warning(f"[Crystallize] Error for {moment_id}: {e}")
        return crystallized

    def _energy_flows_through(
        self, link: Dict, amount: float, flow_emotions: List[List],
        origin_id: str, origin_energy: float, target_id: str, target_energy: float
    ):
        """Unified traversal recording using flow.py primitive."""
        from runtime.physics.flow import energy_flows_through

        origin_weight = link.get('origin_weight', 1.0) or 1.0
        target_weight = link.get('target_weight', 1.0) or 1.0
        updated_link = energy_flows_through(link, amount, flow_emotions, origin_weight, target_weight)

        # Link update not persisted: queries don't return relationship IDs,
        # so we can't uniquely match the relationship for update. Cooling handles cleanup.
        logger.debug(f"[Traversal] {origin_id} -> {target_id}: amount {amount:.2f}, new link energy {updated_link.get('energy'):.2f}")