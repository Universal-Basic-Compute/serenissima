"""
Search Query Methods — Physics-Based Activation Search

Mixin class providing semantic search methods for GraphQueries.

DOCS: docs/physics/IMPLEMENTATION_Physics.md

## Search Model (v1.2)

Search is moment creation + energy propagation. Everything is physics.

### Algorithm

    1. CREATE     query moment (embedding, energy=10.0)
    2. BRIDGE     link moment → top-k similar nodes (weight=similarity)
    3. CONTEXT    link moment → actor (EXPRESSES), task/space (ABOUT)
    4. TICK(5)    local energy diffusion from actor
    5. FILTER     activated moments connected to actor (max 3 hops)

    For each activated moment (top 10):
        6. CREATE   expansion moment → activated + actor
        7. TICK(3)  physics propagates from expansion
        8. COLLECT  activated nodes around root = cluster

    9. RETURN     clusters ordered by root energy

### Why Physics-Based

- Unified: no scoring formula, just energy flow
- Contextual: actor perspective shapes results
- Coherent: clusters emerge from energy, not static traversal
- Persistent: queries become moments in graph history
- Learning: repeated queries strengthen paths

### Energy Flow (Complete Formula)

    flow = source.energy × link.weight × semantic_sim × (1 + emotional_sim) × FLOW_RATE

Where:
- semantic_sim = cos(query_embedding, target.embedding)
- emotional_sim = Σ cos(query_embedding, embed(emotion_name)) × intensity

This makes search truly semantic: energy flows preferentially toward nodes
that are semantically related to the query.

Activated = energy > threshold after ticks.

## Usage

    from runtime.physics.graph.graph_queries import GraphQueries

    graph = GraphQueries()

    results = graph.search(
        query="Who broke the oath?",
        actor_id="actor_claude",
        embed_fn=get_embedding
    )

    for cluster in results['clusters']:
        print(f"Moment: {cluster['root']['id']} (energy: {cluster['root']['energy']})")
        for node in cluster['nodes']:
            print(f"  - {node['name']} ({node['type']}, energy: {node.get('energy', 0)})")
"""

import json
import logging
import time
from typing import Dict, Any, List, Callable, Optional, Tuple

import numpy as np

from runtime.physics.graph.graph_query_utils import (
    SEARCH_EXCLUDE_FIELDS,
    extract_node_props,
    extract_link_props,
)

logger = logging.getLogger(__name__)

# =============================================================================
# CONSTANTS
# =============================================================================

# Search parameters
DEFAULT_TICKS = 5
DEFAULT_TOP_K_BRIDGES = 10
DEFAULT_ENERGY_THRESHOLD = 0.1
DEFAULT_INITIAL_ENERGY = 10.0
MAX_CLUSTER_SIZE = 40
FLOW_RATE = 0.3  # Fraction of energy that flows per tick

# Standard emotion names for embedding lookup
EMOTION_NAMES = [
    'joy', 'sadness', 'anger', 'fear', 'surprise',
    'disgust', 'trust', 'anticipation', 'love', 'guilt',
    'shame', 'pride', 'hope', 'despair', 'curiosity'
]

# Moment statuses to exclude from search
EXCLUDED_MOMENT_STATUSES = {'possible', 'archived'}

# Output formats
FORMAT_JSON = 'json'
FORMAT_MARKDOWN = 'md'


class SearchQueryMixin:
    """
    Mixin class providing physics-based search methods.

    Search creates a query moment, propagates energy through the graph,
    and returns clusters around activated moments.

    Prerequisites:
        - self._query(cypher, params) method
        - self.graph_name for moment ID generation
    """

    # =========================================================================
    # MAIN SEARCH API
    # =========================================================================

    def search(
        self,
        query: str,
        embed_fn: Callable[[str], List[float]],
        actor_id: str = None,
        task_id: str = None,
        space_id: str = None,
        top_k_bridges: int = DEFAULT_TOP_K_BRIDGES,
        ticks: int = DEFAULT_TICKS,
        energy_threshold: float = DEFAULT_ENERGY_THRESHOLD,
        initial_energy: float = DEFAULT_INITIAL_ENERGY,
        format: str = FORMAT_JSON
    ) -> Any:
        """
        Search the graph using physics-based activation.

        Creates a query moment, propagates energy through the graph,
        and returns clusters around activated moments.

        Args:
            query: Natural language query
            embed_fn: Function to convert text to embedding
            actor_id: Actor performing the search (for context)
            task_id: Current task/protocol context (optional)
            space_id: Current space context (optional)
            top_k_bridges: Number of semantic bridges to create
            ticks: Number of energy propagation ticks
            energy_threshold: Minimum energy to consider a moment activated
            initial_energy: Energy to inject into query moment
            format: Output format - 'json' (default) or 'md'

        Returns:
            Dict with:
                - query: original query
                - moment_id: created query moment ID
                - clusters: list of clusters around activated moments
                - activated_count: number of moments that activated
        """
        # 1. CREATE query moment
        moment_id = self._create_query_moment(
            query=query,
            embed_fn=embed_fn,
            initial_energy=initial_energy
        )

        # 2. BRIDGE to semantically similar nodes
        query_embedding = embed_fn(query)
        bridges = self._create_semantic_bridges(
            moment_id=moment_id,
            query_embedding=query_embedding,
            top_k=top_k_bridges
        )

        # 3. CONTEXT links
        if actor_id:
            self._link_actor_to_moment(actor_id, moment_id)
        if task_id:
            self._link_moment_about(moment_id, task_id)
        if space_id:
            self._link_moment_about(moment_id, space_id)

        # 4. TICK - propagate energy with semantic + emotional flow
        start_node = actor_id or moment_id
        for _ in range(ticks):
            self._tick_local(
                start_node,
                query_embedding=query_embedding,
                embed_fn=embed_fn
            )

        # 5. EXPAND - physics-based expansion around activated moments
        activated = self._get_activated_moments(energy_threshold, actor_id)
        clusters = []
        for moment in activated[:10]:  # Top 10 activated moments
            cluster = self._expand_cluster(
                moment_id=moment['id'],
                moment_props=moment,
                actor_id=actor_id,
                query_embedding=query_embedding,
                embed_fn=embed_fn
            )
            if cluster['nodes']:
                clusters.append(cluster)

        result = {
            'query': query,
            'moment_id': moment_id,
            'clusters': clusters,
            'activated_count': len(activated),
            'bridges_created': len(bridges)
        }

        # 6. FORMAT output
        if format == FORMAT_MARKDOWN:
            return self._to_markdown(result)

        return result

    # =========================================================================
    # STEP 1: CREATE QUERY MOMENT
    # =========================================================================

    def _create_query_moment(
        self,
        query: str,
        embed_fn: Callable[[str], List[float]],
        initial_energy: float
    ) -> str:
        """Create a moment node representing the query."""
        timestamp = int(time.time())
        moment_id = f"moment_query_{timestamp}"

        embedding = embed_fn(query)
        # Store embedding as native list, not JSON string
        # FalkorDB handles arrays natively

        cypher = """
        CREATE (m:Moment {
            id: $id,
            node_type: 'moment',
            type: 'query',
            status: 'active',
            content: $content,
            embedding: $embedding,
            energy: $energy,
            weight: 1.0,
            created_at_s: $timestamp
        })
        RETURN m.id
        """

        self._query(cypher, {
            'id': moment_id,
            'content': query,
            'embedding': embedding,  # Pass raw list, not JSON string
            'energy': initial_energy,
            'timestamp': timestamp
        })

        logger.info(f"[Search] Created query moment: {moment_id}")
        return moment_id

    # =========================================================================
    # STEP 2: CREATE SEMANTIC BRIDGES
    # =========================================================================

    def _create_semantic_bridges(
        self,
        moment_id: str,
        query_embedding: List[float],
        top_k: int
    ) -> List[Dict[str, Any]]:
        """
        Find semantically similar nodes and create bridge links.

        Searches all embedded nodes (Actor, Space, Thing, Narrative, Moment)
        and creates RELATES links weighted by similarity.
        """
        bridges = []

        # Search all node types with embeddings
        for label in ['Actor', 'Space', 'Thing', 'Narrative', 'Moment']:
            similar = self._find_similar_nodes(label, query_embedding, top_k)

            for node in similar:
                # Skip the query moment itself
                if node.get('id') == moment_id:
                    continue

                # Skip archived/possible moments
                if label == 'Moment' and node.get('status') in EXCLUDED_MOMENT_STATUSES:
                    continue

                # Create bridge link with weight = similarity
                self._create_bridge_link(
                    from_id=moment_id,
                    to_id=node['id'],
                    weight=node.get('similarity', 0.5)
                )
                bridges.append(node)

        logger.info(f"[Search] Created {len(bridges)} semantic bridges")
        return bridges[:top_k]  # Limit total bridges

    def _find_similar_nodes(
        self,
        label: str,
        embedding: List[float],
        top_k: int
    ) -> List[Dict[str, Any]]:
        """Find nodes similar to the given embedding."""
        cypher = f"""
        MATCH (n:{label})
        WHERE n.embedding IS NOT NULL
        RETURN n
        """

        try:
            rows = self._query(cypher)
            if not rows:
                return []

            results = []
            for row in rows:
                node = row[0] if isinstance(row, list) else row

                # Extract properties
                if hasattr(node, 'properties'):
                    props = dict(node.properties)
                elif isinstance(node, dict):
                    props = node
                # Handle Neo4j v6 nodes (have get() and items() but not properties)
                elif hasattr(node, 'get') and hasattr(node, 'items'):
                    props = dict(node.items())
                else:
                    continue

                node_embedding = props.get('embedding')
                if node_embedding:
                    if isinstance(node_embedding, str):
                        node_embedding = json.loads(node_embedding)

                    sim = self._cosine_similarity(embedding, node_embedding)

                    # Keep relevant properties
                    clean = {
                        'id': props.get('id'),
                        'name': props.get('name', props.get('id')),
                        'type': label.lower(),
                        'similarity': sim,
                        'energy': props.get('energy', 0),
                        'weight': props.get('weight', 1.0),
                        'status': props.get('status'),
                    }
                    results.append(clean)

            results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            return results[:top_k]

        except Exception as e:
            logger.warning(f"[Search] Error finding similar {label}: {e}")
            return []

    def _create_bridge_link(
        self,
        from_id: str,
        to_id: str,
        weight: float
    ) -> None:
        """Create a RELATES link between query moment and similar node."""
        cypher = """
        MATCH (a {id: $from_id})
        MATCH (b {id: $to_id})
        MERGE (a)-[r:RELATES]->(b)
        SET r.weight = $weight,
            r.direction = 'answers',
            r.energy = 0,
            r.created_at_s = timestamp() / 1000
        """
        try:
            self._query(cypher, {
                'from_id': from_id,
                'to_id': to_id,
                'weight': weight
            })
        except Exception as e:
            logger.debug(f"[Search] Failed to create bridge {from_id}->{to_id}: {e}")

    # =========================================================================
    # STEP 3: CONTEXT LINKS
    # =========================================================================

    def _link_actor_to_moment(self, actor_id: str, moment_id: str) -> None:
        """Create EXPRESSES link from actor to query moment."""
        cypher = """
        MATCH (a:Actor {id: $actor_id})
        MATCH (m:Moment {id: $moment_id})
        MERGE (a)-[r:EXPRESSES]->(m)
        SET r.role = 'asker',
            r.weight = 1.0,
            r.energy = 0
        """
        try:
            self._query(cypher, {'actor_id': actor_id, 'moment_id': moment_id})
        except Exception as e:
            logger.debug(f"[Search] Failed to link actor {actor_id}: {e}")

    def _link_moment_about(self, moment_id: str, target_id: str) -> None:
        """Create ABOUT link from moment to task/space context."""
        cypher = """
        MATCH (m:Moment {id: $moment_id})
        MATCH (t {id: $target_id})
        MERGE (m)-[r:ABOUT]->(t)
        SET r.weight = 1.0,
            r.energy = 0
        """
        try:
            self._query(cypher, {'moment_id': moment_id, 'target_id': target_id})
        except Exception as e:
            logger.debug(f"[Search] Failed to link moment to {target_id}: {e}")

    # =========================================================================
    # STEP 4: LOCAL ENERGY DIFFUSION (Semantic + Emotional Flow)
    # =========================================================================

    def _tick_local(
        self,
        start_id: str,
        query_embedding: List[float] = None,
        embed_fn: Callable[[str], List[float]] = None,
        max_hops: int = 3
    ) -> None:
        """
        Propagate energy locally from start node with semantic + emotional flow.

        Energy flows through links based on the complete formula:
            flow = source.energy × link.weight × semantic_sim × (1 + emotional_sim) × FLOW_RATE

        Where:
            - semantic_sim = cos(query_embedding, target.embedding)
            - emotional_sim = Σ cos(query_embedding, embed(emotion_name)) × intensity

        Args:
            start_id: Node to start propagation from
            query_embedding: Embedding of the search query (for semantic flow)
            embed_fn: Function to embed emotion names (for emotional similarity)
            max_hops: Maximum distance from start to propagate
        """
        # If no query embedding, fall back to simple weight-based flow
        if query_embedding is None:
            self._tick_local_simple(start_id, max_hops)
            return

        # 1. Fetch nodes with energy and their neighbors
        fetch_cypher = f"""
        MATCH path = (start {{id: $start_id}})-[*1..{max_hops}]-(source)
        WHERE source.energy IS NOT NULL AND source.energy > 0
        WITH DISTINCT source
        MATCH (source)-[r]-(target)
        WHERE target.embedding IS NOT NULL
        RETURN source.id AS source_id,
               source.energy AS source_energy,
               target.id AS target_id,
               target.embedding AS target_embedding,
               coalesce(r.weight, 1.0) AS link_weight,
               r.emotions AS link_emotions
        """

        try:
            rows = self._query(fetch_cypher, {'start_id': start_id})
            if not rows:
                return

            # 2. Compute flows in Python (where we can do semantic math)
            energy_deltas = {}  # node_id -> energy change
            energy_drains = {}  # source_id -> total drained

            # Cache emotion embeddings for efficiency
            emotion_embeddings = {}
            if embed_fn:
                for emotion in EMOTION_NAMES:
                    try:
                        emotion_embeddings[emotion] = embed_fn(emotion)
                    except Exception:
                        pass

            for row in rows:
                source_id = row[0]
                source_energy = row[1]
                target_id = row[2]
                target_embedding = row[3]
                link_weight = row[4]
                link_emotions = row[5]

                # Skip if already processed this source
                if source_id in energy_drains:
                    continue

                # Parse target embedding
                if isinstance(target_embedding, str):
                    try:
                        target_embedding = json.loads(target_embedding)
                    except:
                        continue

                # Compute semantic similarity
                semantic_sim = self._cosine_similarity(query_embedding, target_embedding)
                semantic_sim = max(0.0, semantic_sim)  # Floor at 0

                # Compute emotional similarity
                emotional_sim = self._emotional_similarity(
                    query_embedding,
                    link_emotions,
                    emotion_embeddings
                )

                # Complete flow formula
                flow = (
                    source_energy *
                    link_weight *
                    semantic_sim *
                    (1.0 + emotional_sim) *
                    FLOW_RATE
                )

                # Accumulate energy changes
                if target_id not in energy_deltas:
                    energy_deltas[target_id] = 0.0
                energy_deltas[target_id] += flow

                # Track drain from source
                if source_id not in energy_drains:
                    energy_drains[source_id] = 0.0
                energy_drains[source_id] += flow

            # 3. Apply energy updates via Cypher
            if energy_deltas:
                for target_id, delta in energy_deltas.items():
                    if delta > 0.001:  # Skip tiny updates
                        self._update_energy(target_id, delta)

            if energy_drains:
                for source_id, drain in energy_drains.items():
                    if drain > 0.001:
                        self._drain_energy(source_id, drain)

        except Exception as e:
            logger.debug(f"[Search] Tick error: {e}")

    def _tick_local_simple(self, start_id: str, max_hops: int = 3) -> None:
        """Fallback tick without semantic flow (pure weight-based)."""
        cypher = f"""
        MATCH path = (start {{id: $start_id}})-[*1..{max_hops}]-(n)
        WHERE n.energy IS NOT NULL AND n.energy > 0
        WITH DISTINCT n
        MATCH (n)-[r]-(neighbor)
        WHERE neighbor.energy IS NOT NULL
        WITH n, r, neighbor,
             n.energy * coalesce(r.weight, 1.0) * {FLOW_RATE} AS flow
        SET neighbor.energy = coalesce(neighbor.energy, 0) + flow,
            n.energy = n.energy * (1 - {FLOW_RATE})
        """
        try:
            self._query(cypher, {'start_id': start_id})
        except Exception as e:
            logger.debug(f"[Search] Simple tick error: {e}")

    def _emotional_similarity(
        self,
        query_embedding: List[float],
        link_emotions: Any,
        emotion_embeddings: Dict[str, List[float]]
    ) -> float:
        """
        Compute emotional similarity between query and link emotions.

        Formula: Σ cos(query_embedding, embed(emotion_name)) × intensity

        Args:
            query_embedding: Embedding of the search query
            link_emotions: Link emotion data (JSON string or dict)
            emotion_embeddings: Pre-computed embeddings for emotion names

        Returns:
            Emotional similarity score (0 to ~1.5)
        """
        if not link_emotions or not emotion_embeddings:
            return 0.0

        # Parse emotions if string
        if isinstance(link_emotions, str):
            try:
                link_emotions = json.loads(link_emotions)
            except:
                return 0.0

        if not isinstance(link_emotions, dict):
            return 0.0

        total_sim = 0.0
        for emotion_name, intensity in link_emotions.items():
            emotion_name = emotion_name.lower()
            if emotion_name in emotion_embeddings:
                sim = self._cosine_similarity(
                    query_embedding,
                    emotion_embeddings[emotion_name]
                )
                # Only positive contributions
                if sim > 0:
                    total_sim += sim * float(intensity)

        return total_sim

    def _update_energy(self, node_id: str, delta: float) -> None:
        """Add energy to a node."""
        cypher = """
        MATCH (n {id: $node_id})
        SET n.energy = coalesce(n.energy, 0) + $delta
        """
        try:
            self._query(cypher, {'node_id': node_id, 'delta': delta})
        except Exception as e:
            logger.debug(f"[Search] Failed to update energy for {node_id}: {e}")

    def _drain_energy(self, node_id: str, drain: float) -> None:
        """Drain energy from a node (energy that flowed out)."""
        cypher = """
        MATCH (n {id: $node_id})
        SET n.energy = CASE
            WHEN n.energy > $drain THEN n.energy - $drain
            ELSE 0
        END
        """
        try:
            self._query(cypher, {'node_id': node_id, 'drain': drain})
        except Exception as e:
            logger.debug(f"[Search] Failed to drain energy from {node_id}: {e}")

    # =========================================================================
    # STEP 5: GET ACTIVATED MOMENTS
    # =========================================================================

    def _get_activated_moments(
        self,
        threshold: float,
        actor_id: str = None
    ) -> List[Dict[str, Any]]:
        """
        Get moments with energy above threshold, ordered by energy.

        If actor_id provided, only returns moments connected to actor (max 3 hops).
        This ensures results are in actor's "perspective" — their reachable subgraph.
        """
        if actor_id:
            # Only moments connected to actor
            cypher = """
            MATCH (a:Actor {id: $actor_id})-[*1..3]-(m:Moment)
            WHERE m.energy > $threshold
              AND m.status <> 'possible'
              AND m.status <> 'archived'
            RETURN DISTINCT m
            ORDER BY m.energy DESC
            LIMIT 50
            """
            params = {'actor_id': actor_id, 'threshold': threshold}
        else:
            # All activated moments (fallback)
            cypher = """
            MATCH (m:Moment)
            WHERE m.energy > $threshold
              AND m.status <> 'possible'
              AND m.status <> 'archived'
            RETURN m
            ORDER BY m.energy DESC
            LIMIT 50
            """
            params = {'threshold': threshold}

        try:
            rows = self._query(cypher, params)
            moments = []
            for row in rows:
                node = row[0] if isinstance(row, list) else row
                props = extract_node_props(node)
                if props:
                    moments.append(props)
            return moments
        except Exception as e:
            logger.warning(f"[Search] Error getting activated moments: {e}")
            return []

    # =========================================================================
    # STEP 6: EXPAND CLUSTERS (Physics-Based)
    # =========================================================================

    def _expand_cluster(
        self,
        moment_id: str,
        moment_props: Dict[str, Any],
        actor_id: str = None,
        query_embedding: List[float] = None,
        embed_fn: Callable[[str], List[float]] = None,
        expansion_energy: float = 5.0,
        expansion_ticks: int = 3,
        max_nodes: int = MAX_CLUSTER_SIZE
    ) -> Dict[str, Any]:
        """
        Expand cluster around an activated moment using physics.

        Algorithm:
            1. CREATE expansion moment linked to activated moment
            2. LINK expansion moment to actor (context)
            3. TICK(3) physics propagates from expansion moment
            4. COLLECT nodes that activated around root

        This is physics-based expansion, not static traversal.
        The cluster emerges from energy flow, not graph topology.
        Uses semantic + emotional flow if query_embedding provided.

        Returns:
            {
                'root': moment_props,      # The activated moment
                'nodes': [                 # Nodes activated by expansion
                    {'id': ..., 'type': 'actor', 'energy': 0.5, ...},
                    {'id': ..., 'type': 'narrative', 'energy': 0.3, ...},
                ],
                'expansion_id': '...'      # ID of expansion moment
            }
        """
        # 1. CREATE expansion moment
        timestamp = int(time.time() * 1000)  # ms precision for uniqueness
        expansion_id = f"moment_expand_{moment_id}_{timestamp}"

        create_cypher = """
        CREATE (e:Moment {
            id: $id,
            node_type: 'moment',
            type: 'expansion',
            status: 'active',
            content: $content,
            energy: $energy,
            weight: 0.5,
            created_at_s: $timestamp
        })
        """
        try:
            self._query(create_cypher, {
                'id': expansion_id,
                'content': f"Expanding: {moment_props.get('content', moment_id)[:50]}",
                'energy': expansion_energy,
                'timestamp': int(timestamp / 1000)
            })
        except Exception as e:
            logger.warning(f"[Search] Failed to create expansion moment: {e}")
            return {'root': moment_props, 'nodes': [], 'expansion_id': None}

        # 2. LINK expansion to activated moment and actor
        link_cypher = """
        MATCH (e:Moment {id: $expansion_id})
        MATCH (m {id: $moment_id})
        MERGE (e)-[r:RELATES]->(m)
        SET r.direction = 'expands', r.weight = 1.0, r.energy = 0
        """
        try:
            self._query(link_cypher, {
                'expansion_id': expansion_id,
                'moment_id': moment_id
            })
        except Exception as e:
            logger.debug(f"[Search] Failed to link expansion to moment: {e}")

        if actor_id:
            actor_link_cypher = """
            MATCH (a:Actor {id: $actor_id})
            MATCH (e:Moment {id: $expansion_id})
            MERGE (a)-[r:EXPRESSES]->(e)
            SET r.role = 'expander', r.weight = 1.0, r.energy = 0
            """
            try:
                self._query(actor_link_cypher, {
                    'actor_id': actor_id,
                    'expansion_id': expansion_id
                })
            except Exception as e:
                logger.debug(f"[Search] Failed to link actor to expansion: {e}")

        # 3. TICK - propagate energy from expansion moment with semantic flow
        for _ in range(expansion_ticks):
            self._tick_local(
                expansion_id,
                query_embedding=query_embedding,
                embed_fn=embed_fn
            )

        # 4. COLLECT activated nodes around the root moment
        collect_cypher = """
        MATCH (m {id: $moment_id})-[*1..2]-(n)
        WHERE n.energy > 0.05
          AND n.id <> $moment_id
          AND n.id <> $expansion_id
        RETURN DISTINCT n
        ORDER BY n.energy DESC
        LIMIT $max_nodes
        """

        nodes = []
        try:
            rows = self._query(collect_cypher, {
                'moment_id': moment_id,
                'expansion_id': expansion_id,
                'max_nodes': max_nodes
            })
            for row in rows:
                node = row[0] if isinstance(row, list) else row
                props = extract_node_props(node)
                if props:
                    nodes.append(props)
        except Exception as e:
            logger.warning(f"[Search] Failed to collect expansion results: {e}")

        logger.debug(f"[Search] Expansion {expansion_id}: {len(nodes)} nodes activated")

        return {
            'root': moment_props,
            'nodes': nodes,
            'expansion_id': expansion_id
        }

    # =========================================================================
    # OUTPUT FORMATTING
    # =========================================================================

    def _to_markdown(self, result: Dict[str, Any]) -> str:
        """Convert search results to markdown for LLM consumption."""
        lines = []
        query = result.get('query', '')
        clusters = result.get('clusters', [])

        lines.append(f"# Search: \"{query}\"\n")
        lines.append(f"Activated: {result.get('activated_count', 0)} moments")
        lines.append(f"Bridges: {result.get('bridges_created', 0)} links\n")

        if not clusters:
            lines.append("*No results found.*")
            return '\n'.join(lines)

        for i, cluster in enumerate(clusters, 1):
            root = cluster.get('root', {})
            nodes = cluster.get('nodes', [])

            root_name = root.get('name', root.get('id', 'Unknown'))
            root_energy = root.get('energy', 0)

            lines.append(f"## {i}. {root_name} (energy: {root_energy:.2f})\n")

            # Root content
            if root.get('content'):
                lines.append(f"> {root.get('content')}\n")

            # Connected nodes
            if nodes:
                lines.append("**Connected:**")
                for node in nodes:
                    node_name = node.get('name', node.get('id', 'Unknown'))
                    node_type = node.get('type', 'unknown')
                    distance = node.get('distance', 0)
                    lines.append(f"- {node_name} ({node_type}, hop={distance})")

            lines.append("")

        return '\n'.join(lines)

    # =========================================================================
    # UTILITIES
    # =========================================================================

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        a = np.array(a)
        b = np.array(b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
