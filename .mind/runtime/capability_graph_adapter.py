"""
Graph adapter for capability runtime.

Provides the interface expected by capability runtime (create_node, get_node, etc.)
using the proper typed GraphOps methods with embeddings and physics.

This adapter translates the generic capability runtime calls to the
proper typed methods (add_narrative, add_link, etc.) that include:
- Embedding computation via EmbeddingService
- Physics fields (weight, energy)
- Proper synthesis generation via doctor_graph patterns
"""

import logging
from typing import Any, Dict, List, Optional

from runtime.physics.graph import GraphOps
from runtime.infrastructure.embeddings.service import get_embedding_service

logger = logging.getLogger(__name__)


class CapabilityGraphAdapter:
    """
    Adapter that provides capability runtime interface over GraphOps.

    Maps generic create_node/get_node/update_node calls to proper
    typed methods with embeddings and physics.
    """

    def __init__(self, graph_ops: GraphOps):
        self._graph = graph_ops

    def execute(self, cypher: str, params: Dict[str, Any] = None) -> None:
        """Execute a Cypher write query."""
        self._graph._adapter.execute(cypher, params or {})

    def query(self, cypher: str, params: Dict[str, Any] = None) -> List:
        """Execute a Cypher read query."""
        return self._graph._adapter.query(cypher, params or {})

    def _compute_embedding(self, text: str) -> Optional[List[float]]:
        """Compute embedding for text using the embedding service."""
        try:
            service = get_embedding_service()
            if service:
                return service.embed(text)
        except Exception as e:
            logger.warning(f"Embedding failed: {e}")
        return None

    def _generate_task_run_synthesis(self, problem: str, signal_level: str) -> str:
        """Generate synthesis for a task_run narrative node."""
        # Follow the pattern from doctor_graph.generate_task_synthesis
        return f"task_run: fix {problem} ({signal_level})"

    def _auto_assign_task(self, task_id: str, problem: str) -> Optional[str]:
        """
        Auto-assign a task to an appropriate idle agent.

        Returns actor_id if assigned, None if no agent available.
        """
        try:
            from runtime.agents import AgentGraph

            # Use graph physics to select agent based on task synthesis
            agent_graph = AgentGraph(graph_name=self._graph.graph_name)
            task_synthesis = f"fix {problem}"
            actor_id = agent_graph.select_agent_for_task(task_synthesis)
            if not actor_id:
                actor_id = "AGENT_Fixer"

            # Check if agent is idle/ready (not already working on max tasks)
            result = self._graph._query(
                """
                MATCH (a {id: $actor_id})
                WHERE a.status IN ['idle', 'ready', null]
                OPTIONAL MATCH (a)<-[:LINK {verb: 'claimed_by'}]-(t)
                WHERE t.status = 'claimed'
                WITH a, count(t) as active_tasks
                WHERE active_tasks < 3
                RETURN a.id
                """,
                {"actor_id": actor_id}
            )

            if result and result[0] and result[0][0]:
                # Create claimed_by link
                self._graph._query(
                    """
                    MATCH (t {id: $task_id})
                    MATCH (a {id: $actor_id})
                    MERGE (t)-[:LINK {verb: 'claimed_by'}]->(a)
                    """,
                    {"task_id": task_id, "actor_id": actor_id}
                )
                return actor_id

            return None

        except Exception as e:
            logger.warning(f"Auto-assign failed: {e}")
            return None

    def create_node(
        self,
        id: str,
        node_type: str,
        type: str = None,
        content: str = None,
        synthesis: str = None,
        **props
    ) -> bool:
        """
        Create a node using proper typed methods.

        For narrative nodes (task_run, etc.), uses add_narrative()
        which handles physics fields properly.
        """
        # Generate synthesis if not provided (for task_run nodes)
        if not synthesis and type == "task_run":
            # Extract problem/signal from content if available
            problem = props.get('on_problem', 'unknown')
            signal = props.get('signal', 'degraded')
            synthesis = self._generate_task_run_synthesis(problem, signal)
        elif not synthesis:
            synthesis = content[:100] if content else id

        # Compute embedding from synthesis (schema: embedding = embed(synthesis))
        embedding = self._compute_embedding(synthesis)

        # Default physics for task_run nodes (from doctor_graph patterns)
        weight = props.get('weight', 2.0)  # Tasks matter
        energy = props.get('energy', 3.0)  # Active problems

        if node_type == "narrative":
            # Use add_narrative for proper handling
            self._graph.add_narrative(
                id=id,
                name=synthesis,  # Name is the display label, use synthesis
                content=content or "",
                type=type or "task_run",
                weight=weight,
                embedding=embedding,
            )
            # Set synthesis field (add_narrative doesn't have synthesis param)
            self._graph._query(
                "MATCH (n {id: $id}) SET n.synthesis = $synthesis",
                {"id": id, "synthesis": synthesis}
            )
            # Set status field for task_run nodes (required for claim workflow)
            if type == "task_run":
                problem = props.get('on_problem', 'unknown')
                # Auto-assign to matching agent
                actor_id = self._auto_assign_task(id, problem)
                if actor_id:
                    self._graph._query(
                        "MATCH (n {id: $id}) SET n.status = 'claimed', n.claimed_by = $agent",
                        {"id": id, "agent": actor_id}
                    )
                    logger.info(f"Auto-assigned {id} to {actor_id}")
                else:
                    self._graph._query(
                        "MATCH (n {id: $id}) SET n.status = 'pending'",
                        {"id": id}
                    )
            return True

        elif node_type == "actor":
            self._graph.add_character(
                id=id,
                name=props.get('name', id),
                type=type or "agent",
                weight=weight,
                energy=energy,
                embedding=embedding,
            )
            return True

        else:
            # Fallback to narrative for unknown types
            logger.warning(f"Unknown node_type {node_type}, using narrative")
            self._graph.add_narrative(
                id=id,
                name=synthesis,
                content=content or "",
                type=type or node_type,
                weight=weight,
                embedding=embedding,
            )
            return True

    def get_node(self, node_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a node by ID.

        Uses GraphQueries to fetch node data.
        """
        try:
            # Use the adapter's query method
            result = self._graph._query(
                "MATCH (n {id: $id}) "
                "RETURN n.id, n.name, n.content, n.type, n.status, n.weight, n.energy",
                {"id": node_id}
            )
            if result and result[0] and result[0][0]:
                row = result[0]
                return {
                    "id": row[0],
                    "name": row[1],
                    "content": row[2],
                    "type": row[3],
                    "status": row[4],
                    "weight": row[5],
                    "energy": row[6],
                }
        except Exception as e:
            logger.warning(f"get_node failed: {e}")
        return None

    def update_node(self, node_id: str, **props) -> bool:
        """
        Update node properties.
        """
        if not props:
            return False

        try:
            # Build SET clause dynamically
            set_parts = []
            params = {"id": node_id}
            for key, value in props.items():
                param_name = f"p_{key}"
                set_parts.append(f"n.{key} = ${param_name}")
                params[param_name] = value

            set_clause = ", ".join(set_parts)
            result = self._graph._query(
                f"MATCH (n {{id: $id}}) SET {set_clause} RETURN n.id",
                params
            )
            return bool(result and result[0])
        except Exception as e:
            logger.warning(f"update_node failed: {e}")
            return False

    def create_link(
        self,
        source: str,
        target: str,
        nature: str = "relates",
        **props
    ) -> bool:
        """
        Create a link using add_relates or typed link method.
        """
        try:
            # Use generic link creation
            # Compute embedding for link synthesis
            synthesis = props.get('synthesis', f"{source} {nature} {target}")
            embedding = self._compute_embedding(synthesis)

            self._graph._query(
                """
                MATCH (s {id: $source})
                MATCH (t {id: $target})
                MERGE (s)-[r:LINK]->(t)
                SET r.verb = $nature,
                    r.synthesis = $synthesis,
                    r.embedding = $embedding,
                    r.weight = $weight,
                    r.energy = $energy
                """,
                {
                    "source": source,
                    "target": target,
                    "nature": nature,
                    "synthesis": synthesis,
                    "embedding": embedding,
                    "weight": props.get('weight', 1.0),
                    "energy": props.get('energy', 1.0),
                }
            )
            return True
        except Exception as e:
            logger.warning(f"create_link failed: {e}")
            return False

    def delete_links(
        self,
        source: str,
        target: str = None,
        nature: str = None
    ) -> int:
        """
        Delete links from a source node.
        """
        try:
            if target and nature:
                query = """
                MATCH (s {id: $source})-[r:LINK {verb: $nature}]->(t {id: $target})
                DELETE r
                RETURN count(r)
                """
                params = {"source": source, "target": target, "nature": nature}
            elif target:
                query = """
                MATCH (s {id: $source})-[r:LINK]->(t {id: $target})
                DELETE r
                RETURN count(r)
                """
                params = {"source": source, "target": target}
            elif nature:
                query = """
                MATCH (s {id: $source})-[r:LINK {verb: $nature}]->()
                DELETE r
                RETURN count(r)
                """
                params = {"source": source, "nature": nature}
            else:
                query = """
                MATCH (s {id: $source})-[r:LINK]->()
                DELETE r
                RETURN count(r)
                """
                params = {"source": source}

            result = self._graph._query(query, params)
            return result[0][0] if result and result[0] else 0
        except Exception as e:
            logger.warning(f"delete_links failed: {e}")
            return 0

    def query(self, cypher: str, params: Dict[str, Any] = None) -> List:
        """
        Execute a query (for compatibility).
        """
        return self._graph._query(cypher, params)


def get_capability_graph(graph_ops: GraphOps = None) -> CapabilityGraphAdapter:
    """
    Get a capability graph adapter.

    If graph_ops not provided, creates a new GraphOps instance.
    """
    if graph_ops is None:
        graph_ops = GraphOps()
    return CapabilityGraphAdapter(graph_ops)
