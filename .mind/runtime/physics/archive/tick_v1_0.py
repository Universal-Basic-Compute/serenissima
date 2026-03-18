"""
Graph Tick

The per-tick algorithm that runs the living world.
No LLM - pure math. Fast enough to run frequently.

DOCS: docs/physics/algorithms/ALGORITHM_Physics_Schema_v1.1_Energy_Physics.md

Schema v1.1 Algorithm (6 phases):
1. Generation — Actors generate energy based on weight
2. Moment Draw — Active moments draw from connected actors
3. Moment Flow — Active moments flow to connected nodes
4. Narrative Backflow — Narratives radiate to connected actors
5. Decay — Links fast (40%), nodes weight-based
6. Completion — Liquidate completed moments

Legacy Algorithm (pre-v1.1):
1. Compute character energies
2. Flow energy from characters to narratives
3. Propagate energy between narratives
4. Decay energy
5. Adjust for criticality

TESTS:
    engine/tests/test_implementation.py::TestEnergyFlowImplementation (stubs)
    engine/tests/test_implementation.py::TestDecayImplementation (stubs)

STATUS: v1.1 implementation in progress
    - run_v1_1() implements new 6-phase tick
    - run() is legacy, kept for transition

SEE ALSO:
    engine/physics/constants.py — All physics constants
    docs/physics/algorithms/ALGORITHM_Physics_Schema_v1.1_Energy_Physics.md
"""

import logging
from typing import List, Dict, Any, Set, Tuple, Optional
from dataclasses import dataclass, field

from runtime.physics.graph import GraphQueries, GraphOps
from runtime.health import get_activity_logger
from .constants import *

logger = logging.getLogger(__name__)


@dataclass
class TickResult:
    """Result of a graph tick (legacy)."""
    flips: List[Dict[str, Any]] = field(default_factory=list)
    energy_total: float = 0.0
    decay_rate_used: float = DECAY_RATE
    narratives_updated: int = 0
    moments_decayed: int = 0


@dataclass
class TickResultV1_1:
    """Result of a v1.1 graph tick."""
    # Phase stats
    energy_generated: float = 0.0
    energy_drawn: float = 0.0
    energy_flowed: float = 0.0
    energy_backflowed: float = 0.0
    energy_decayed: float = 0.0

    # Counts
    actors_updated: int = 0
    moments_active: int = 0
    moments_completed: int = 0
    links_updated: int = 0
    links_crystallized: int = 0

    # Completions
    completions: List[Dict[str, Any]] = field(default_factory=list)

    # Legacy compatibility
    flips: List[Dict[str, Any]] = field(default_factory=list)
    energy_total: float = 0.0


class GraphTick:
    """
    Graph tick engine - the living world simulation.
    """

    def __init__(
        self,
        graph_name: str = "blood_ledger",
        host: str = "localhost",
        port: int = 6379
    ):
        self.read = GraphQueries(graph_name=graph_name, host=host, port=port)
        self.write = GraphOps(graph_name=graph_name, host=host, port=port)
        self.graph_name = graph_name

        # Current decay rate (adjusted for criticality)
        self.decay_rate = DECAY_RATE

        # Activity logger for detailed tracking
        self._activity = get_activity_logger()
        self._tick_count = 0

        logger.info("[GraphTick] Initialized")

    def run(
        self,
        elapsed_minutes: float,
        player_id: str = "char_player",
        player_location: str = None
    ) -> TickResult:
        """
        Run a graph tick.

        Args:
            elapsed_minutes: Time elapsed since last tick
            player_id: Player character ID (for proximity calculations)
            player_location: Player's current location

        Returns:
            TickResult with flips and stats
        """
        if elapsed_minutes < MIN_TICK_MINUTES:
            logger.debug(f"[GraphTick] Skipping tick ({elapsed_minutes} < {MIN_TICK_MINUTES} min)")
            return TickResult()

        self._tick_count += 1
        self._activity.tick_start(self._tick_count, self.graph_name)

        logger.info(f"[GraphTick] Running tick for {elapsed_minutes} minutes")
        result = TickResult()

        # Capture initial state for summary
        initial_energy = self._calculate_total_energy()

        # 1. Compute character energies
        self._activity.phase_start(1, "Compute character energies")
        char_energies = self._compute_character_energies(player_id, player_location)
        for char_id, energy in list(char_energies.items())[:10]:  # Log first 10
            self._activity.energy_generation(char_id, energy, 1.0)

        # 2. Flow energy from characters to narratives
        self._activity.phase_start(2, "Flow energy to narratives")
        narrative_energies = self._flow_energy_to_narratives(char_energies)

        # 3. Propagate energy between narratives
        self._activity.phase_start(3, "Propagate energy between narratives")
        narrative_energies = self._propagate_energy(narrative_energies)

        # 4. Decay energy
        self._activity.phase_start(4, "Decay energy")
        narrative_energies = self._decay_energy(narrative_energies)

        # 5. Update narrative weights
        self._activity.phase_start(5, "Update narrative weights")
        result.narratives_updated = self._update_narrative_weights(narrative_energies)
        result.energy_total = sum(narrative_energies.values())

        # 6. Adjust criticality
        self._activity.phase_start(6, "Adjust criticality")
        self._adjust_criticality()
        result.decay_rate_used = self.decay_rate

        # 7. Process moment lifecycle (decay, cleanup)
        self._activity.phase_start(7, "Process moment lifecycle")
        moment_stats = self._process_moment_tick(elapsed_minutes)
        result.moments_decayed = moment_stats.get('decayed_count', 0)

        # Log tick summary
        self._activity.tick_summary(
            tick=self._tick_count,
            energy_before=initial_energy,
            energy_after=result.energy_total,
            narratives_updated=result.narratives_updated,
            moments_decayed=result.moments_decayed,
            flips=len(result.flips)
        )

        logger.info(
            f"[GraphTick] Complete: "
            f"energy={result.energy_total:.2f}, "
            f"moments_decayed={result.moments_decayed}"
        )

        return result

    # =========================================================================
    # SCHEMA v1.1 — 6-PHASE TICK
    # =========================================================================

    def run_v1_1(self, current_tick: int = 0) -> TickResultV1_1:
        """
        Run a v1.1 graph tick with 6 phases.

        Schema v1.1 changes the energy model:
        - Actors generate energy (not compute from proximity)
        - Active moments draw and flow energy
        - Unified flow formula: flow = source.energy × rate × conductivity × weight × emotion_factor
        - Path resistance via Dijkstra

        Args:
            current_tick: The current world tick number

        Returns:
            TickResultV1_1 with phase stats and completions
        """
        logger.info(f"[GraphTick] Running v1.1 tick #{current_tick}")
        result = TickResultV1_1()

        # Phase 1: Generation — actors generate energy based on weight
        result.energy_generated = self._phase_generation()
        result.actors_updated = self._count_actors()

        # Phase 2: Moment Draw — active moments draw from connected actors
        active_moments = self._get_active_moments()
        result.moments_active = len(active_moments)
        result.energy_drawn = self._phase_moment_draw(active_moments)

        # Phase 3: Moment Flow — active moments flow to connected nodes
        result.energy_flowed = self._phase_moment_flow(active_moments)

        # Phase 4: Narrative Backflow — narratives radiate to connected actors
        result.energy_backflowed = self._phase_narrative_backflow()

        # Phase 5: Decay — links fast (40%), nodes weight-based
        result.energy_decayed, result.links_updated = self._phase_decay()

        # Phase 6: Completion — check and liquidate completed moments
        completions, crystallized = self._phase_completion(active_moments, current_tick)
        result.completions = completions
        result.moments_completed = len(completions)
        result.links_crystallized = crystallized

        # Calculate total energy in system
        result.energy_total = self._calculate_total_energy()

        logger.info(
            f"[GraphTick v1.1] Complete: "
            f"generated={result.energy_generated:.2f}, "
            f"drawn={result.energy_drawn:.2f}, "
            f"flowed={result.energy_flowed:.2f}, "
            f"completed={result.moments_completed}"
        )

        return result

    def _phase_generation(self) -> float:
        """
        Phase 1: Actors generate energy based on weight.

        Formula: actor.energy += GENERATION_RATE × actor.weight
        """
        total_generated = 0.0

        try:
            # Get all actors
            cypher = """
            MATCH (a:Actor)
            WHERE a.alive = true OR a.alive IS NULL
            RETURN a.id AS id, a.weight AS weight, a.energy AS energy
            """
            actors = self.read.query(cypher)

            for actor in actors:
                actor_id = actor.get('id')
                weight = actor.get('weight', 1.0) or 1.0
                current_energy = actor.get('energy', 0.0) or 0.0

                # Generate energy
                generated = GENERATION_RATE * weight
                new_energy = current_energy + generated
                total_generated += generated

                # Update actor energy
                update_cypher = f"""
                MATCH (a:Actor {{id: '{actor_id}'}})
                SET a.energy = {new_energy}
                """
                self.write._query(update_cypher)

        except Exception as e:
            logger.warning(f"[Phase 1] Generation error: {e}")

        return total_generated

    def _phase_moment_draw(self, active_moments: List[Dict]) -> float:
        """
        Phase 2: Active moments draw energy from connected actors.

        Formula: flow = actor.energy × MOMENT_DRAW_RATE × link.conductivity × link.weight × emotion_factor
        """
        total_drawn = 0.0

        for moment in active_moments:
            moment_id = moment.get('id')
            moment_energy = moment.get('energy', 0.0) or 0.0

            try:
                # Get actors connected to this moment (via EXPRESSES or CAN_SPEAK links)
                cypher = f"""
                MATCH (a:Actor)-[r]->(m:Moment {{id: '{moment_id}'}})
                WHERE type(r) IN ['EXPRESSES', 'CAN_SPEAK', 'SAID']
                RETURN a.id AS actor_id, a.energy AS actor_energy,
                       r.conductivity AS conductivity, r.weight AS weight
                """
                connections = self.read.query(cypher)

                for conn in connections:
                    actor_id = conn.get('actor_id')
                    actor_energy = conn.get('actor_energy', 0.0) or 0.0
                    conductivity = conn.get('conductivity', 1.0) or 1.0
                    weight = conn.get('weight', 1.0) or 1.0

                    # Calculate flow (simplified, no emotion factor for now)
                    flow = actor_energy * MOMENT_DRAW_RATE * conductivity * weight

                    if flow > 0:
                        # Transfer energy
                        moment_energy += flow
                        actor_energy -= flow
                        total_drawn += flow

                        # Update actor energy
                        self.write._query(f"""
                        MATCH (a:Actor {{id: '{actor_id}'}})
                        SET a.energy = {max(0, actor_energy)}
                        """)

                # Update moment energy
                self.write._query(f"""
                MATCH (m:Moment {{id: '{moment_id}'}})
                SET m.energy = {moment_energy}
                """)

            except Exception as e:
                logger.warning(f"[Phase 2] Draw error for {moment_id}: {e}")

        return total_drawn

    def _phase_moment_flow(self, active_moments: List[Dict]) -> float:
        """
        Phase 3: Active moments flow energy to connected nodes.

        Energy flows from moments to connected narratives, spaces, things.
        Formula: flow = moment.energy × FLOW_RATE × link.conductivity × link.weight
        """
        total_flowed = 0.0

        for moment in active_moments:
            moment_id = moment.get('id')

            try:
                # Get moment's current energy
                m = self.read.query(f"MATCH (m:Moment {{id: '{moment_id}'}}) RETURN m.energy AS energy")
                if not m:
                    continue
                moment_energy = m[0].get('energy', 0.0) or 0.0

                if moment_energy <= 0:
                    continue

                # Get connected nodes (narratives, spaces, etc.)
                cypher = f"""
                MATCH (m:Moment {{id: '{moment_id}'}})-[r]->(n)
                WHERE NOT n:Actor
                RETURN n.id AS node_id, labels(n)[0] AS node_type,
                       r.conductivity AS conductivity, r.weight AS weight,
                       n.energy AS node_energy
                """
                connections = self.read.query(cypher)

                if not connections:
                    continue

                # Calculate total flow out
                for conn in connections:
                    node_id = conn.get('node_id')
                    node_type = conn.get('node_type')
                    conductivity = conn.get('conductivity', 1.0) or 1.0
                    weight = conn.get('weight', 1.0) or 1.0
                    node_energy = conn.get('node_energy', 0.0) or 0.0

                    flow = moment_energy * FLOW_RATE * conductivity * weight

                    if flow > 0:
                        new_node_energy = node_energy + flow
                        total_flowed += flow

                        # Update target node energy
                        self.write._query(f"""
                        MATCH (n {{id: '{node_id}'}})
                        SET n.energy = {new_node_energy}
                        """)

            except Exception as e:
                logger.warning(f"[Phase 3] Flow error for {moment_id}: {e}")

        return total_flowed

    def _phase_narrative_backflow(self) -> float:
        """
        Phase 4: Narratives above threshold radiate to connected actors.

        Formula: flow = narrative.energy × FLOW_RATE × link.conductivity × emotion_factor
        """
        total_backflow = 0.0
        BACKFLOW_THRESHOLD = 0.5  # Only narratives above this radiate

        try:
            # Get narratives above threshold
            cypher = f"""
            MATCH (n:Narrative)
            WHERE n.energy > {BACKFLOW_THRESHOLD}
            RETURN n.id AS id, n.energy AS energy
            """
            narratives = self.read.query(cypher)

            for narr in narratives:
                narr_id = narr.get('id')
                narr_energy = narr.get('energy', 0.0) or 0.0

                # Get connected actors (via BELIEVES links)
                conn_cypher = f"""
                MATCH (a:Actor)-[r:BELIEVES]->(n:Narrative {{id: '{narr_id}'}})
                RETURN a.id AS actor_id, a.energy AS actor_energy,
                       r.conductivity AS conductivity, r.believes AS believes
                """
                connections = self.read.query(conn_cypher)

                for conn in connections:
                    actor_id = conn.get('actor_id')
                    actor_energy = conn.get('actor_energy', 0.0) or 0.0
                    conductivity = conn.get('conductivity', 0.5) or 0.5
                    believes = conn.get('believes', 0.5) or 0.5

                    # Backflow based on belief strength
                    flow = narr_energy * FLOW_RATE * conductivity * believes * 0.5  # 50% backflow rate

                    if flow > 0:
                        new_actor_energy = actor_energy + flow
                        total_backflow += flow

                        self.write._query(f"""
                        MATCH (a:Actor {{id: '{actor_id}'}})
                        SET a.energy = {new_actor_energy}
                        """)

        except Exception as e:
            logger.warning(f"[Phase 4] Backflow error: {e}")

        return total_backflow

    def _phase_decay(self) -> Tuple[float, int]:
        """
        Phase 5: Apply decay to links and nodes.

        - Link energy: decays 40% per tick (LINK_ENERGY_DECAY_RATE)
        - Link strength: decays 10% per tick (LINK_STRENGTH_DECAY_RATE)
        - Node energy: decays based on weight (NODE_ENERGY_DECAY_RATE / weight)
        """
        total_decayed = 0.0
        links_updated = 0

        try:
            # Decay link energy and strength
            # Note: This assumes links have energy/strength fields (v1.1 schema)
            link_cypher = """
            MATCH ()-[r]->()
            WHERE r.energy IS NOT NULL AND r.energy > 0
            RETURN id(r) AS rid, r.energy AS energy, r.strength AS strength
            """
            links = self.read.query(link_cypher)

            for link in links:
                rid = link.get('rid')
                energy = link.get('energy', 0.0) or 0.0
                strength = link.get('strength', 0.0) or 0.0

                new_energy = energy * (1 - LINK_ENERGY_DECAY_RATE)
                new_strength = strength * (1 - LINK_STRENGTH_DECAY_RATE)
                total_decayed += energy - new_energy

                # Update link
                # Note: Updating by relationship ID requires different syntax
                # For now, skip link updates as FalkorDB syntax varies
                links_updated += 1

            # Decay node energy
            node_cypher = """
            MATCH (n)
            WHERE n.energy IS NOT NULL AND n.energy > 0
            RETURN n.id AS id, n.energy AS energy, n.weight AS weight, labels(n)[0] AS type
            """
            nodes = self.read.query(node_cypher)

            for node in nodes:
                node_id = node.get('id')
                energy = node.get('energy', 0.0) or 0.0
                weight = node.get('weight', 1.0) or 1.0
                node_type = node.get('type', 'Node')

                # Weight-based decay (heavier nodes decay slower)
                effective_decay = NODE_ENERGY_DECAY_RATE / max(0.1, weight)
                new_energy = max(0, energy * (1 - effective_decay))
                total_decayed += energy - new_energy

                self.write._query(f"""
                MATCH (n {{id: '{node_id}'}})
                SET n.energy = {new_energy}
                """)

        except Exception as e:
            logger.warning(f"[Phase 5] Decay error: {e}")

        return total_decayed, links_updated

    def _phase_completion(
        self,
        active_moments: List[Dict],
        current_tick: int
    ) -> Tuple[List[Dict], int]:
        """
        Phase 6: Check and liquidate completed moments.

        A moment completes when:
        - energy >= MOMENT_COMPLETION_THRESHOLD
        - Canon holder approves (simplified: auto-approve for now)

        On completion:
        - Distribute moment.energy to connected nodes by weight share
        - Set moment.energy = 0
        - Set moment.status = 'completed'
        - Set moment.tick_resolved = current_tick
        - Crystallize links between actors
        """
        completions = []
        links_crystallized = 0

        for moment in active_moments:
            moment_id = moment.get('id')

            try:
                # Get current moment state
                m = self.read.query(f"""
                MATCH (m:Moment {{id: '{moment_id}'}})
                RETURN m.energy AS energy, m.status AS status
                """)
                if not m:
                    continue

                energy = m[0].get('energy', 0.0) or 0.0
                status = m[0].get('status', 'active')

                # Check completion threshold
                if energy >= MOMENT_COMPLETION_THRESHOLD and status == 'active':
                    # Liquidate: distribute energy to connected nodes
                    self._liquidate_moment(moment_id, energy)

                    # Update moment status
                    self.write._query(f"""
                    MATCH (m:Moment {{id: '{moment_id}'}})
                    SET m.status = 'completed',
                        m.energy = 0,
                        m.tick_resolved = {current_tick}
                    """)

                    # Crystallize links between actors
                    crystallized = self._crystallize_actor_links(moment_id)
                    links_crystallized += crystallized

                    completions.append({
                        'moment_id': moment_id,
                        'energy_liquidated': energy,
                        'tick': current_tick,
                        'links_crystallized': crystallized
                    })

                    logger.info(f"[Phase 6] Completed moment {moment_id} (energy={energy:.2f})")

            except Exception as e:
                logger.warning(f"[Phase 6] Completion error for {moment_id}: {e}")

        return completions, links_crystallized

    def _liquidate_moment(self, moment_id: str, energy: float):
        """Distribute moment's energy to connected nodes by weight share."""
        try:
            # Get connected nodes with weights
            cypher = f"""
            MATCH (m:Moment {{id: '{moment_id}'}})-[r]->(n)
            RETURN n.id AS node_id, r.weight AS weight, n.energy AS node_energy
            """
            connections = self.read.query(cypher)

            if not connections:
                return

            # Calculate total weight
            total_weight = sum(c.get('weight', 1.0) or 1.0 for c in connections)
            if total_weight <= 0:
                return

            # Distribute energy by weight share
            for conn in connections:
                node_id = conn.get('node_id')
                weight = conn.get('weight', 1.0) or 1.0
                node_energy = conn.get('node_energy', 0.0) or 0.0

                share = (weight / total_weight) * energy * 0.9  # 90% efficiency
                new_energy = node_energy + share

                self.write._query(f"""
                MATCH (n {{id: '{node_id}'}})
                SET n.energy = {new_energy}
                """)

        except Exception as e:
            logger.warning(f"[Liquidate] Error for {moment_id}: {e}")

    def _crystallize_actor_links(self, moment_id: str) -> int:
        """
        Create 'relates' links between actors connected to a completed moment.

        This implements v1.1 link crystallization: shared moments create weak links.
        """
        crystallized = 0

        try:
            # Get all actors connected to this moment
            cypher = f"""
            MATCH (a:Actor)-[]->(m:Moment {{id: '{moment_id}'}})
            RETURN DISTINCT a.id AS actor_id
            """
            actors = self.read.query(cypher)

            if len(actors) < 2:
                return 0

            actor_ids = [a.get('actor_id') for a in actors if a.get('actor_id')]

            # For each pair, check if relates link exists, if not create it
            for i, actor_a in enumerate(actor_ids):
                for actor_b in actor_ids[i+1:]:
                    # Check existing link
                    check = self.read.query(f"""
                    MATCH (a:Actor {{id: '{actor_a}'}})-[r:RELATES]-(b:Actor {{id: '{actor_b}'}})
                    RETURN count(r) AS cnt
                    """)

                    if check and check[0].get('cnt', 0) == 0:
                        # Create new relates link with initial strength
                        self.write._query(f"""
                        MATCH (a:Actor {{id: '{actor_a}'}}), (b:Actor {{id: '{actor_b}'}})
                        CREATE (a)-[:RELATES {{
                            strength: {CRYSTALLIZATION_INITIAL_STRENGTH},
                            conductivity: 0.5,
                            weight: 1.0,
                            energy: 0.0,
                            created_from: '{moment_id}'
                        }}]->(b)
                        """)
                        crystallized += 1

        except Exception as e:
            logger.warning(f"[Crystallize] Error for {moment_id}: {e}")

        return crystallized

    def _get_active_moments(self) -> List[Dict]:
        """Get all moments with status='active'."""
        try:
            cypher = """
            MATCH (m:Moment)
            WHERE m.status = 'active'
            RETURN m.id AS id, m.energy AS energy, m.weight AS weight
            """
            return self.read.query(cypher)
        except:
            return []

    def _count_actors(self) -> int:
        """Count active actors."""
        try:
            result = self.read.query("MATCH (a:Actor) WHERE a.alive = true OR a.alive IS NULL RETURN count(a) AS cnt")
            return result[0].get('cnt', 0) if result else 0
        except:
            return 0

    def _calculate_total_energy(self) -> float:
        """Calculate total energy in the system."""
        try:
            result = self.read.query("""
            MATCH (n)
            WHERE n.energy IS NOT NULL
            RETURN sum(n.energy) AS total
            """)
            return result[0].get('total', 0.0) if result else 0.0
        except:
            return 0.0

    # =========================================================================
    # LEGACY METHODS (pre-v1.1)
    # =========================================================================

    def _process_moment_tick(self, elapsed_minutes: float) -> Dict[str, Any]:
        """
        Process moment lifecycle on each tick.

        Applies weight decay to possible moments.
        Called every tick (5+ minutes).

        Args:
            elapsed_minutes: Time elapsed since last tick

        Returns:
            Dict with moment lifecycle stats

        Ref: docs/engine/moments/ALGORITHM_Lifecycle.md
        """
        # Calculate number of decay iterations based on elapsed time
        # One decay per 5 minutes
        iterations = max(1, int(elapsed_minutes / 5))

        total_decayed = 0
        total_updated = 0

        for _ in range(iterations):
            result = self.write.decay_moments(
                decay_rate=0.99,      # 1% decay per iteration
                decay_threshold=0.1   # Below 0.1 = decayed
            )
            total_decayed += result.get('decayed_count', 0)
            total_updated += result.get('updated_count', 0)

        return {
            'iterations': iterations,
            'updated_count': total_updated,
            'decayed_count': total_decayed
        }

    def _compute_character_energies(
        self,
        player_id: str,
        player_location: str = None
    ) -> Dict[str, float]:
        """
        Compute energy for each character.

        Energy = relationship_intensity × geographical_proximity
        """
        char_energies = {}

        # Get player location for proximity
        if not player_location:
            player_loc = self._get_character_location(player_id)
            player_location = player_loc

        # Get all characters
        characters = self.read.get_all_characters()

        for char in characters:
            char_id = char.get('id')
            if not char_id:
                continue

            # Relationship intensity: sum of beliefs about this character
            intensity = self._compute_relationship_intensity(char_id)

            # Geographical proximity to player
            proximity = self._compute_proximity(char_id, player_id, player_location)

            char_energies[char_id] = intensity * proximity

        return char_energies

    def _compute_relationship_intensity(self, char_id: str) -> float:
        """
        Compute how intensely narratives involve this character.
        """
        # Get narratives about this character
        narratives = self.read.get_narratives_about(character_id=char_id)

        if not narratives:
            return 0.1  # Base intensity

        # Sum weights of narratives about this character
        total_weight = sum(n.get('weight', 0.5) for n in narratives)
        return min(1.0, total_weight)

    def _compute_proximity(
        self,
        char_id: str,
        player_id: str,
        player_location: str
    ) -> float:
        """
        Compute geographical proximity to player.
        """
        if char_id == player_id:
            return 1.0

        # Get character location
        char_location = self._get_character_location(char_id)
        if not char_location or not player_location:
            return 0.1

        if char_location == player_location:
            return 1.0

        # Get travel distance
        path = self.read.get_path_between(player_location, char_location)
        if not path:
            return 0.05  # Far away

        # Parse distance
        distance_str = path.get('path_distance', '3 days')
        days = self._parse_distance(distance_str)

        return distance_to_proximity(days)

    def _get_character_location(self, char_id: str) -> str:
        """Get actor's current location."""
        cypher = f"""
        MATCH (c:Actor {{id: '{char_id}'}})-[r:AT]->(p:Space)
        WHERE r.present > 0.5
        RETURN p.id
        """
        try:
            results = self.read.query(cypher)
            return results[0].get('p.id') if results else None
        except:
            return None

    def _parse_distance(self, distance_str: str) -> float:
        """Parse distance string to days."""
        if not distance_str:
            return 1.0

        dist = distance_str.lower()
        if 'adjacent' in dist or 'same' in dist:
            return 0.0
        elif 'hour' in dist:
            import re
            match = re.search(r'(\d+)', dist)
            if match:
                return float(match.group(1)) / 24.0
            return 0.1
        elif 'day' in dist:
            import re
            match = re.search(r'(\d+)', dist)
            if match:
                return float(match.group(1))
            return 1.0
        else:
            return 1.0

    def _flow_energy_to_narratives(
        self,
        char_energies: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Flow energy from characters to narratives they believe.
        """
        # Start with current weights of all narratives to allow decay/accumulation
        narrative_energies: Dict[str, float] = {
            n['id']: n.get('weight', MIN_WEIGHT)
            for n in self.read.get_narratives_about()
        }
        flow_count = 0
        for char_id, char_energy in char_energies.items():
            # Get character's beliefs
            beliefs = self.read.get_character_beliefs(char_id)
            if not beliefs:
                continue

            total_strength = 0.0
            for belief in beliefs:
                total_strength += belief.get('believes', 0) * belief.get('heard', 0)

            if total_strength <= 0:
                continue

            for belief in beliefs:
                narr_id = belief.get('id')
                if not narr_id:
                    continue

                # Energy flow = char_energy × belief_strength × flow_rate
                belief_strength = belief.get('believes', 0) * belief.get('heard', 0)
                if belief_strength <= 0:
                    continue

                energy_flow = (
                    char_energy
                    * (belief_strength / total_strength)
                    * BELIEF_FLOW_RATE
                )

                narrative_energies[narr_id] = narrative_energies.get(narr_id, 0) + energy_flow

                # Log the transfer (limit to avoid spam)
                if flow_count < 20:
                    self._activity.energy_transfer(
                        char_id, narr_id, energy_flow,
                        f"belief flow (str={belief_strength:.2f})",
                        "actor", "narrative"
                    )
                flow_count += 1

        if flow_count > 20:
            self._activity.custom(f"  ... and {flow_count - 20} more energy transfers")

        return narrative_energies

    def _propagate_energy(
        self,
        narrative_energies: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Propagate energy between connected narratives.
        """
        # Get narrative links
        for hop in range(MAX_PROPAGATION_HOPS):
            new_energies = dict(narrative_energies)

            for narr_id, energy in narrative_energies.items():
                if energy <= MIN_WEIGHT:
                    continue

                # Get linked narratives
                links = self._get_narrative_links(narr_id)

                for link in links:
                    target_id = link.get('target_id')
                    if not target_id:
                        continue

                    # Determine link type and factor
                    for link_type, factor in LINK_FACTORS.items():
                        link_strength = link.get(link_type, 0)
                        if link_strength > 0:
                            transfer = energy * link_strength * factor

                            new_energies[narr_id] = new_energies.get(narr_id, energy) - transfer

                            # Supersession drains source
                            if link_type == 'supersedes':
                                new_energies[narr_id] -= transfer * 0.5

                            new_energies[target_id] = new_energies.get(target_id, 0) + transfer

            for narr_id, energy in new_energies.items():
                new_energies[narr_id] = max(MIN_WEIGHT, energy)

            narrative_energies = new_energies

        return narrative_energies

    def _get_narrative_links(self, narr_id: str) -> List[Dict[str, Any]]:
        """Get links from a narrative."""
        cypher = f"""
        MATCH (n:Narrative {{id: '{narr_id}'}})-[r:RELATES_TO]->(target:Narrative)
        RETURN target.id AS target_id,
               r.contradicts AS contradicts,
               r.supports AS supports,
               r.elaborates AS elaborates,
               r.subsumes AS subsumes,
               r.supersedes AS supersedes
        """
        try:
            return self.read.query(cypher)
        except:
            return []

    def _decay_energy(
        self,
        narrative_energies: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Apply decay to narrative energies.
        """
        decayed = {}
        decay_count = 0
        total_decayed = 0.0

        for narr_id, energy in narrative_energies.items():
            # Get narrative type for decay rate
            narr = self.read.get_narrative(narr_id)
            narr_type = narr.get('type', '') if narr else ''
            focus = narr.get('focus', 1.0) if narr else 1.0

            # Core types decay slower
            if narr_type in CORE_TYPES:
                decay_mult = CORE_DECAY_MULTIPLIER
            else:
                decay_mult = 1.0

            # Higher focus = slower decay
            focus_mult = 1.0 / focus if focus > 0 else 1.0

            # Apply decay
            effective_decay = self.decay_rate * decay_mult * focus_mult
            new_energy = max(MIN_WEIGHT, energy * (1 - effective_decay))

            # Log decay (limit to first 15)
            if decay_count < 15 and energy > MIN_WEIGHT:
                self._activity.decay(narr_id, energy, new_energy, effective_decay, "narrative")
            decay_count += 1
            total_decayed += (energy - new_energy)

            decayed[narr_id] = new_energy

        if decay_count > 15:
            self._activity.custom(f"  ... decayed {decay_count} narratives, total energy lost: {total_decayed:.2f}")

        return decayed

    def _update_narrative_weights(
        self,
        narrative_energies: Dict[str, float]
    ) -> int:
        """
        Update narrative weights in the graph.
        """
        updated = 0

        for narr_id, energy in narrative_energies.items():
            # Clamp to 0-1
            weight = max(MIN_WEIGHT, min(1.0, energy))

            cypher = f"""
            MATCH (n:Narrative {{id: '{narr_id}'}})
            SET n.weight = {weight}
            """
            try:
                self.write._query(cypher)
                updated += 1
            except:
                pass

        return updated
