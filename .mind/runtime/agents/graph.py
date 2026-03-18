"""
Agent Graph Operations

Query and manage work agents in the mind graph.
Agents are Actor nodes with name-based selection.

The 10 agents (by name):
- witness: evidence-first, traces what actually happened
- groundwork: foundation-first, builds scaffolding
- keeper: verification-first, checks before declaring done
- weaver: connection-first, patterns across modules
- voice: naming-first, finds right words for concepts
- scout: exploration-first, navigates and surveys
- architect: structure-first, shapes systems
- fixer: work-first, resolves without breaking
- herald: communication-first, broadcasts changes
- steward: coordination-first, prioritizes and assigns

Status lifecycle:
- ready: Agent available for work
- running: Agent currently executing

DOCS: docs/agents/PATTERNS_Agent_System.md
"""

import logging
import re
import time
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

from .mapping import NAME_TO_AGENT_ID, DEFAULT_NAME

logger = logging.getLogger(__name__)


def _extract_salient_terms(
    content: str,
    graph_name: Optional[str] = None,
    top_k: int = 3,
) -> List[str]:
    """
    Extract salient terms from content using embedding similarity against graph vocabulary.

    Args:
        content: Text to extract salient terms from
        graph_name: Graph to search in
        top_k: Number of terms to extract

    Returns:
        List of salient term strings (CamelCase)
    """
    if not content or len(content.strip()) < 10:
        return []

    try:
        from runtime.infrastructure.embeddings import get_embedding
        from runtime.infrastructure.database import get_database_adapter

        # Embed the content
        embedding = get_embedding(content[:2000])  # Truncate for embedding
        if not embedding:
            return []

        adapter = get_database_adapter(graph_name=graph_name)

        # Vector search against all nodes with embeddings
        # Look for Space, Narrative, Thing nodes that have names
        results = adapter.query("""
            MATCH (n)
            WHERE n.embedding IS NOT NULL
            AND n.name IS NOT NULL
            AND n.name <> ''
            RETURN n.name, n.type, n.id
            LIMIT 500
        """)

        if not results:
            return []

        # Compute similarities
        from runtime.infrastructure.embeddings import cosine_similarity

        scored: List[Tuple[float, str]] = []
        seen_names = set()

        for row in results:
            name = row[0]
            if not name or name in seen_names:
                continue
            seen_names.add(name)

            # Get node embedding for comparison
            node_result = adapter.query(f"""
                MATCH (n {{name: $name}})
                WHERE n.embedding IS NOT NULL
                RETURN n.embedding
                LIMIT 1
            """, {"name": name})

            if node_result and node_result[0][0]:
                node_embedding = node_result[0][0]
                sim = cosine_similarity(embedding, node_embedding)
                scored.append((sim, name))

        # Sort by similarity, take top_k
        scored.sort(reverse=True, key=lambda x: x[0])
        top_terms = [name for _, name in scored[:top_k]]

        # Clean terms: split on separators, capitalize each part
        clean_terms = []
        for term in top_terms:
            # Split on common separators: space, underscore, dot, slash, hyphen
            parts = re.split(r'[\s_./\-]+', term)
            # Take meaningful parts, capitalize
            meaningful = [p.capitalize() for p in parts if p and len(p) > 1]
            if meaningful:
                # Join with nothing for CamelCase, take first 2 parts max
                clean = ''.join(meaningful[:2])
                if clean and len(clean) <= 15:
                    clean_terms.append(clean)

        return clean_terms[:top_k]

    except Exception as e:
        logger.warning(f"[AgentGraph] Failed to extract salient terms: {e}")
        return []


def _infer_action_verb(tools_used: List[str], content: str) -> str:
    """
    Infer action verb from tools used and content.

    Returns a verb like "Exploring", "Fixing", "Debugging", etc.
    """
    content_lower = content.lower() if content else ""

    # Check content for emotion/intent signals
    if any(w in content_lower for w in ["bug", "error", "fix", "broken"]):
        return "Debugging"
    if any(w in content_lower for w in ["confused", "unclear", "struggling"]):
        return "Struggling"
    if any(w in content_lower for w in ["found", "discovered", "located"]):
        return "Discovering"
    if any(w in content_lower for w in ["refactor", "clean", "reorganize"]):
        return "Refactoring"

    # Infer from tool patterns
    if not tools_used:
        return "Working"

    tool_counts = {}
    for t in tools_used:
        tool_counts[t] = tool_counts.get(t, 0) + 1

    read_heavy = tool_counts.get("Read", 0) + tool_counts.get("Glob", 0) + tool_counts.get("Grep", 0)
    write_heavy = tool_counts.get("Edit", 0) + tool_counts.get("Write", 0)

    if read_heavy > write_heavy * 2:
        return "Exploring"
    if write_heavy > read_heavy:
        return "Building"
    if "Grep" in tool_counts and tool_counts["Grep"] >= 2:
        return "Searching"

    return "Working"


def _get_link_physics(nature: str) -> Dict[str, Any]:
    """
    Get physics properties for a link from nature string.
    Uses canonical implementation from runtime/inject.py
    """
    from runtime.inject import _nature_to_physics
    return _nature_to_physics(nature)


def _build_link_props(nature: str, timestamp: int) -> Dict[str, Any]:
    """Build link properties from nature string."""
    physics = _get_link_physics(nature)

    props = {"nature": nature, "updated_at_s": timestamp}

    # Copy physics floats
    for key in ["hierarchy", "permanence", "trust", "surprise", "energy", "weight"]:
        if key in physics and physics[key] is not None:
            props[key] = physics[key]

    # Handle polarity array
    if "polarity" in physics and physics["polarity"]:
        props["polarity_source"] = physics["polarity"][0]
        props["polarity_target"] = physics["polarity"][1]

    return props


def _link_set_clause(props: Dict[str, Any]) -> str:
    """Build SET clause for link properties."""
    return ", ".join(f"r.{k} = ${k}" for k in props.keys())


@dataclass
class AgentInfo:
    """Information about an agent from the graph."""
    id: str
    name: str  # The agent's name (e.g., "witness")
    status: str   # ready, running, or paused
    energy: float = 0.0
    weight: float = 1.0


class AgentGraph:
    """
    Query and manage work agents from the mind graph.

    Agents are Actor nodes with:
    - id: AGENT_{Name} (e.g., AGENT_Witness)
    - name: The agent name (e.g., witness)
    - type: AGENT
    - status: ready | running | paused
    """

    def __init__(
        self,
        graph_name: str = None,
        host: str = "localhost",
        port: int = 6379,
    ):
        self.graph_name = graph_name
        self.host = host
        self.port = port
        self._graph_ops = None
        self._graph_queries = None
        self._connected = False

    def _connect(self) -> bool:
        """Lazy connect to graph database."""
        if self._connected:
            return True

        try:
            from runtime.physics.graph.graph_ops import GraphOps
            from runtime.physics.graph.graph_queries import GraphQueries

            self._graph_ops = GraphOps(graph_name=self.graph_name)
            self._graph_queries = GraphQueries(graph_name=self.graph_name)
            self._connected = True
            self.graph_name = self._graph_ops.graph_name
            logger.info(f"[AgentGraph] Connected to {self.graph_name}")
            return True
        except Exception as e:
            logger.warning(f"[AgentGraph] No graph connection: {e}")
            return False

    def ensure_agents_exist(self) -> bool:
        """
        Ensure all 10 agents exist in the graph.
        Creates them if they don't exist.
        """
        if not self._connect():
            return False

        try:
            timestamp = int(time.time())

            for name, actor_id in NAME_TO_AGENT_ID.items():
                cypher = f"""
                MATCH (a:Actor {{id: '{actor_id}'}})
                RETURN a.id
                """
                result = self._graph_ops._query(cypher)

                if not result:
                    props = {
                        "id": actor_id,
                        "name": name,
                        "node_type": "actor",
                        "type": "agent",
                        "status": "ready",
                        "description": f"Work agent with {name} name",
                        "weight": 1.0,
                        "energy": 0.0,
                        "created_at_s": timestamp,
                        "updated_at_s": timestamp,
                    }

                    create_cypher = """
                    MERGE (a:Actor {id: $id})
                    SET a += $props
                    """
                    self._graph_ops._query(create_cypher, {"id": actor_id, "props": props})
                    logger.info(f"[AgentGraph] Created agent: {actor_id}")

            return True
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to ensure agents exist: {e}")
            return False

    def get_all_agents(self) -> List[AgentInfo]:
        """Get all agents from the graph."""
        if not self._connect():
            return self._get_fallback_agents()

        try:
            cypher = """
            MATCH (a:Actor)
            WHERE a.type = 'agent'
            RETURN a.id, a.name, a.status, a.energy, a.weight
            ORDER BY a.name
            """
            rows = self._graph_ops._query(cypher)

            agents = []
            for row in rows:
                if len(row) >= 3:
                    actor_id = row[0]
                    name = row[1]
                    status = row[2] or "ready"
                    energy = row[3] if len(row) > 3 else 0.0
                    weight = row[4] if len(row) > 4 else 1.0

                    agents.append(AgentInfo(
                        id=actor_id,
                        name=name,
                        status=status,
                        energy=energy or 0.0,
                        weight=weight or 1.0,
                    ))

            return agents if agents else self._get_fallback_agents()
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to get agents: {e}")
            return self._get_fallback_agents()

    def _get_fallback_agents(self) -> List[AgentInfo]:
        """Return fallback agent list when graph unavailable."""
        return [
            AgentInfo(id=actor_id, name=name, status="ready")
            for name, actor_id in NAME_TO_AGENT_ID.items()
        ]

    def get_available_agents(self) -> List[AgentInfo]:
        """Get agents that are available (status=ready)."""
        all_agents = self.get_all_agents()
        return [a for a in all_agents if a.status == "ready"]

    def get_running_agents(self) -> List[AgentInfo]:
        """Get agents that are currently running."""
        all_agents = self.get_all_agents()
        return [a for a in all_agents if a.status == "running"]

    def select_agent_for_task(self, task_synthesis: str) -> Optional[str]:
        """
        Select the best agent for a task using graph physics.

        Score = similarity * weight * energy

        Args:
            task_synthesis: The task's synthesis text for embedding comparison

        Returns:
            Actor ID of best matching available agent, or None if all busy
        """
        available = self.get_available_agents()
        if not available:
            logger.warning("[AgentGraph] All agents are busy")
            return None

        if not self._connect():
            # Fallback: highest energy agent
            available.sort(key=lambda a: a.energy, reverse=True)
            return available[0].id

        try:
            from runtime.infrastructure.embeddings import get_embedding, cosine_similarity

            task_embedding = get_embedding(task_synthesis)
            if not task_embedding:
                available.sort(key=lambda a: a.energy, reverse=True)
                return available[0].id

            # Get agent embeddings and compute scores
            available_ids = [a.id for a in available]
            cypher = """
            MATCH (a:Actor)
            WHERE a.id IN $ids AND a.embedding IS NOT NULL
            RETURN a.id, a.embedding, a.weight, a.energy
            """
            rows = self._graph_ops._query(cypher, {"ids": available_ids})

            best_agent = None
            best_score = -1.0

            for row in rows:
                agent_id = row[0]
                agent_embedding = row[1]
                agent_weight = row[2] or 1.0
                agent_energy = row[3] or 0.0

                if agent_embedding:
                    similarity = cosine_similarity(task_embedding, agent_embedding)
                    # Score = similarity * weight * energy
                    score = similarity * agent_weight * max(agent_energy, 0.1)

                    if score > best_score:
                        best_score = score
                        best_agent = agent_id

            if best_agent:
                logger.info(f"[AgentGraph] Selected {best_agent} (score={best_score:.3f})")
                return best_agent

            # Fallback: highest energy
            available.sort(key=lambda a: a.energy, reverse=True)
            return available[0].id

        except Exception as e:
            logger.warning(f"[AgentGraph] Embedding selection failed: {e}")
            available.sort(key=lambda a: a.energy, reverse=True)
            return available[0].id

    def get_agent_name(self, actor_id: str) -> str:
        """Get the name for an agent ID."""
        if actor_id.startswith("AGENT_"):
            return actor_id[6:].lower()
        return DEFAULT_NAME

    def set_agent_running(self, actor_id: str) -> bool:
        """Mark an agent as running."""
        if not self._connect():
            logger.warning(f"[AgentGraph] No graph connection, cannot set {actor_id} running")
            return False

        try:
            cypher = """
            MATCH (a:Actor {id: $id})
            SET a.status = 'running', a.updated_at_s = $timestamp
            RETURN a.id
            """
            result = self._graph_ops._query(cypher, {
                "id": actor_id,
                "timestamp": int(time.time()),
            })

            if result:
                logger.info(f"[AgentGraph] Agent {actor_id} now running")
                return True
            else:
                logger.warning(f"[AgentGraph] Agent {actor_id} not found")
                return False
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to set {actor_id} running: {e}")
            return False

    def set_agent_ready(self, actor_id: str) -> bool:
        """Mark an agent as ready (available)."""
        if not self._connect():
            logger.warning(f"[AgentGraph] No graph connection, cannot set {actor_id} ready")
            return False

        try:
            cypher = """
            MATCH (a:Actor {id: $id})
            SET a.status = 'ready', a.updated_at_s = $timestamp
            RETURN a.id
            """
            result = self._graph_ops._query(cypher, {
                "id": actor_id,
                "timestamp": int(time.time()),
            })

            if result:
                logger.info(f"[AgentGraph] Agent {actor_id} now ready")
                return True
            else:
                logger.warning(f"[AgentGraph] Agent {actor_id} not found")
                return False
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to set {actor_id} ready: {e}")
            return False

    def boost_agent_energy(self, actor_id: str, amount: float = 0.1) -> bool:
        """Boost an agent's energy (used for prioritization)."""
        if not self._connect():
            return False

        try:
            cypher = """
            MATCH (a:Actor {id: $id})
            SET a.energy = coalesce(a.energy, 0) + $amount
            RETURN a.id
            """
            self._graph_ops._query(cypher, {"id": actor_id, "amount": amount})
            return True
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to boost {actor_id} energy: {e}")
            return False

    def set_agent_space(self, actor_id: str, space_id: str) -> bool:
        """Set the agent's current active space and link them."""
        if not self._connect():
            return False

        try:
            timestamp = int(time.time())
            link_props = _build_link_props("occupies", timestamp)
            link_props["created_at_s"] = timestamp
            link_set = _link_set_clause(link_props)

            # Update agent's current_space and link to space
            cypher = f"""
            MATCH (a:Actor {{id: $actor_id}})
            MERGE (s:Space {{id: $space_id}})
            SET s.node_type = 'space',
                s.name = $space_name,
                s.updated_at_s = $timestamp,
                s.created_at_s = coalesce(s.created_at_s, $timestamp)
            SET a.current_space = $space_id, a.updated_at_s = $timestamp
            MERGE (a)-[r:link]->(s)
            SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                {link_set}
            RETURN a.id
            """
            params = {
                "actor_id": actor_id,
                "space_id": space_id,
                "space_name": space_id.replace("space_", "").replace("_", "/"),
                "timestamp": timestamp,
                **link_props,
            }
            self._graph_ops._query(cypher, params)
            logger.info(f"[AgentGraph] Set {actor_id} active in {space_id}")
            return True
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to set agent space: {e}")
            return False

    def link_task_to_space(self, task_id: str, space_id: str) -> bool:
        """Link a task narrative to its space."""
        if not self._connect():
            return False

        try:
            timestamp = int(time.time())
            # Get physics from nature - space includes task
            link_props = _build_link_props("includes", timestamp)
            link_props["created_at_s"] = timestamp

            # Build SET clause for link properties
            link_set = _link_set_clause(link_props)

            cypher = f"""
            MATCH (t:Narrative {{id: $task_id}})
            MERGE (s:Space {{id: $space_id}})
            SET s.node_type = 'space',
                s.name = $space_name,
                s.updated_at_s = $timestamp,
                s.created_at_s = coalesce(s.created_at_s, $timestamp)
            MERGE (s)-[r:link]->(t)
            SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                {link_set}
            RETURN t.id
            """
            params = {
                "task_id": task_id,
                "space_id": space_id,
                "space_name": space_id.replace("space_", "").replace("_", "/"),
                "timestamp": timestamp,
                **link_props,
            }
            self._graph_ops._query(cypher, params)
            logger.info(f"[AgentGraph] Linked task {task_id} to {space_id}")
            return True
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to link task to space: {e}")
            return False

    def get_task_space(self, task_id: str) -> Optional[str]:
        """
        Get the space (module) for a task by following link relations:
        1. task → link (nature: implements) → narrative → link (nature: includes) ← space
        2. task.path or task.module as fallback
        """
        if not self._connect():
            return None

        try:
            # Follow links through narratives to find space
            cypher = """
            MATCH (t:Narrative {id: $task_id})
            OPTIONAL MATCH (t)-[:link {nature: 'implements'}]->(n:Narrative)<-[:link {nature: 'includes'}]-(s:Space)
            OPTIONAL MATCH (t)-[:link {nature: 'implements'}]->(n2:Narrative)
            RETURN s.id as space_id,
                   n2.path as impl_path,
                   t.path as task_path,
                   t.module as task_module
            """
            result = self._graph_ops._query(cypher, {"task_id": task_id})
            if result and result[0]:
                # Priority: direct space link > impl path > task path > module
                space_id = result[0][0]
                if space_id:
                    return space_id

                impl_path = result[0][1]
                task_path = result[0][2]
                task_module = result[0][3]

                # Derive space from best available path
                path = impl_path or task_path or task_module
                if path:
                    from pathlib import Path as P
                    path_parts = P(str(path)).parts[:2]
                    if path_parts:
                        return f"space_{'_'.join(path_parts)}"
            return None
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to get task space: {e}")
            return None

    def get_agent_space(self, actor_id: str) -> Optional[str]:
        """Get the agent's current active space."""
        if not self._connect():
            return None

        try:
            cypher = """
            MATCH (a:Actor {id: $actor_id})
            RETURN a.current_space
            """
            result = self._graph_ops._query(cypher, {"actor_id": actor_id})
            if result and result[0]:
                return result[0][0]
            return None
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to get agent space: {e}")
            return None

    def link_agent_to_task(self, actor_id: str, task_id: str) -> bool:
        """Create claims link between agent and task narrative."""
        if not self._connect():
            return False

        try:
            timestamp = int(time.time())
            # Agent claims task (ownership semantics)
            link_props = _build_link_props("claims", timestamp)
            link_props["created_at_s"] = timestamp
            link_set = _link_set_clause(link_props)

            cypher = f"""
            MATCH (a:Actor {{id: $actor_id}})
            MATCH (t:Narrative {{id: $task_id}})
            MERGE (a)-[r:link]->(t)
            SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                {link_set}
            RETURN type(r)
            """
            result = self._graph_ops._query(cypher, {
                "actor_id": actor_id,
                "task_id": task_id,
                "timestamp": timestamp,
                **link_props,
            })
            if result:
                logger.info(f"[AgentGraph] Linked {actor_id} claims {task_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to link agent to task: {e}")
            return False

    def link_agent_to_problem(self, actor_id: str, problem_id: str) -> bool:
        """Create resolves link between agent and problem narrative."""
        if not self._connect():
            return False

        try:
            timestamp = int(time.time())
            # Agent resolves problem (action semantics)
            link_props = _build_link_props("resolves", timestamp)
            link_props["created_at_s"] = timestamp
            link_set = _link_set_clause(link_props)

            cypher = f"""
            MATCH (a:Actor {{id: $actor_id}})
            MATCH (p:Narrative {{id: $problem_id}})
            MERGE (a)-[r:link]->(p)
            SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                {link_set}
            RETURN type(r)
            """
            result = self._graph_ops._query(cypher, {
                "actor_id": actor_id,
                "problem_id": problem_id,
                "timestamp": timestamp,
                **link_props,
            })
            if result:
                logger.info(f"[AgentGraph] Linked {actor_id} resolves {problem_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to link agent to problem: {e}")
            return False

    def get_task_task_type(self, task_id: str) -> Optional[str]:
        """Get the problem type associated with a task."""
        if not self._connect():
            return None

        try:
            cypher = """
            MATCH (t:Narrative {id: $task_id})
            RETURN t.task_type as task_type
            """
            result = self._graph_ops._query(cypher, {"task_id": task_id})
            if result:
                row = result[0]
                return row.get("task_type")
            return None
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to get task problem type: {e}")
            return None

    def create_assignment_moment(
        self,
        actor_id: str,
        task_id: str,
        problem_ids: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Create a moment recording agent assignment to task/problems.
        """
        if not self._connect():
            return None

        try:
            # Get task synthesis for readable moment
            task_synth = None
            try:
                synth_result = self._graph_ops._query(
                    "MATCH (t:Narrative {id: $tid}) RETURN t.synthesis",
                    {"tid": task_id}
                )
                if synth_result and synth_result[0]:
                    task_synth = synth_result[0][0]
            except Exception:
                pass

            timestamp = int(time.time())
            ts_hash = hashlib.sha256(str(timestamp).encode()).hexdigest()[:4]
            agent_name = actor_id.replace("AGENT_", "").lower() if actor_id.startswith("AGENT_") else actor_id
            moment_id = f"ASSIGNMENT_{agent_name}_{ts_hash}"

            # Use synthesis if available, else task_id
            task_desc = task_synth or task_id
            prose = f"Agent {agent_name} assigned to: {task_desc}"

            create_cypher = """
            MERGE (m:Moment {id: $id})
            SET m.node_type = 'moment',
                m.type = 'ASSIGNMENT',
                m.prose = $prose,
                m.status = 'completed',
                m.actor_id = $actor_id,
                m.task_id = $task_id,
                m.created_at_s = $timestamp,
                m.updated_at_s = $timestamp
            RETURN m.id
            """
            self._graph_ops._query(create_cypher, {
                "id": moment_id,
                "prose": prose,
                "actor_id": actor_id,
                "task_id": task_id,
                "timestamp": timestamp,
            })

            # Link: agent expresses moment (with physics)
            expresses_props = _build_link_props("expresses", timestamp)
            expresses_props["created_at_s"] = timestamp
            expresses_set = _link_set_clause(expresses_props)
            self._graph_ops._query(f"""
            MATCH (a:Actor {{id: $actor_id}})
            MATCH (m:Moment {{id: $moment_id}})
            MERGE (a)-[r:link]->(m)
            SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                {expresses_set}
            """, {
                "actor_id": actor_id,
                "moment_id": moment_id,
                "timestamp": timestamp,
                **expresses_props,
            })

            # Link: moment about task (with physics)
            concerns_props = _build_link_props("concerns", timestamp)
            concerns_props["created_at_s"] = timestamp
            concerns_set = _link_set_clause(concerns_props)
            self._graph_ops._query(f"""
            MATCH (m:Moment {{id: $moment_id}})
            MATCH (t:Narrative {{id: $task_id}})
            MERGE (m)-[r:link]->(t)
            SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                {concerns_set}
            """, {
                "moment_id": moment_id,
                "task_id": task_id,
                "timestamp": timestamp,
                **concerns_props,
            })

            # Link: moment about each problem (with physics)
            if problem_ids:
                for problem_id in problem_ids:
                    self._graph_ops._query(f"""
                    MATCH (m:Moment {{id: $moment_id}})
                    MATCH (p:Narrative {{id: $problem_id}})
                    MERGE (m)-[r:link]->(p)
                    SET r.created_at_s = coalesce(r.created_at_s, $timestamp),
                        {concerns_set}
                    """, {
                        "moment_id": moment_id,
                        "problem_id": problem_id,
                        "timestamp": timestamp,
                        **concerns_props,
                    })

            logger.info(f"[AgentGraph] Created assignment moment: {moment_id}")
            return moment_id

        except Exception as e:
            logger.error(f"[AgentGraph] Failed to create assignment moment: {e}")
            return None

    def get_actor_last_moment(self, actor_id: str) -> Optional[str]:
        """Get the most recent moment expressed by an actor."""
        if not self._connect():
            return None

        try:
            cypher = """
            MATCH (a:Actor {id: $actor_id})-[:expresses]->(m:Moment)
            RETURN m.id
            ORDER BY m.created_at_s DESC
            LIMIT 1
            """
            result = self._graph_ops._query(cypher, {"actor_id": actor_id})
            if result and result[0]:
                return result[0][0]
            return None
        except Exception as e:
            logger.warning(f"[AgentGraph] Failed to get last moment: {e}")
            return None

    def create_moment(
        self,
        actor_id: str,
        moment_type: str,
        prose: str,
        about_ids: Optional[List[str]] = None,
        space_id: Optional[str] = None,
        extra_props: Optional[Dict] = None,
        tools_used: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Create a moment node using inject().

        Moment naming uses embedding-based salience extraction:
        - ID: WORK_{Agent}_{Verb}{SalientTerms}_{hash}
        - Example: WORK_Witness_ExploringAuthPatterns_aa4c

        Args:
            actor_id: Actor creating this moment
            moment_type: Type of moment (e.g., 'COMPLETION', 'CONVERSATION')
            prose: Human-readable description (becomes synthesis)
            about_ids: Node IDs this moment is about
            space_id: Space (module/project) where this moment occurs
            extra_props: Additional properties for the moment
            tools_used: List of tools used (for verb inference)

        Returns:
            Moment ID if created, None on failure
        """
        from runtime.inject import inject, set_actor, inject_link
        from runtime.infrastructure.database import get_database_adapter

        try:
            timestamp = int(time.time())
            ts_hash = hashlib.sha256(str(timestamp).encode()).hexdigest()[:4]

            # Extract agent name
            if actor_id.startswith("AGENT_"):
                agent_name = actor_id[6:]  # Keep original case: "Witness"
            else:
                agent_name = actor_id.capitalize()

            # Extract salient terms from prose using embedding similarity
            salient_terms = _extract_salient_terms(prose, self.graph_name, top_k=4)

            # Infer action verb from tools and content
            verb = _infer_action_verb(tools_used or [], prose)

            # Build name: Verb_Term1_Term2
            if salient_terms:
                terms_part = '_'.join(salient_terms)
                moment_name = f"{verb}_{terms_part}"
            else:
                moment_name = f"{verb}_{moment_type.capitalize()}"

            # Build ID: WORK_{Agent}_{Name}_{hash}
            moment_id = f"WORK_{agent_name}_{moment_name}_{ts_hash}"

            # Set actor for inject context
            set_actor(actor_id)

            # Build moment data
            moment_data = {
                "id": moment_id,
                "label": "Moment",
                "name": moment_name,
                "type": moment_type,
                "synthesis": prose,
                "timestamp": timestamp,
            }
            if extra_props:
                moment_data.update(extra_props)

            # Inject creates moment, links to actor, chains to previous
            adapter = get_database_adapter(graph_name=self.graph_name)
            inject(adapter, moment_data, with_context=True)

            # Link to about nodes if provided
            if about_ids:
                for about_id in about_ids:
                    if about_id:
                        inject_link(adapter, moment_id, about_id, nature="about")

            # Link: space includes moment
            if space_id:
                inject_link(adapter, space_id, moment_id, nature="includes")

            logger.info(f"[AgentGraph] Created moment: {moment_id}")
            return moment_id

        except Exception as e:
            logger.error(f"[AgentGraph] Failed to create moment: {e}")
            return None

    def link_moments(
        self,
        from_moment_id: str,
        to_moment_id: str,
        nature: str = "precedes",
    ) -> bool:
        """
        Link two moments using inject.

        Args:
            from_moment_id: Source moment ID
            to_moment_id: Target moment ID
            nature: Link nature (default: "precedes")

        Returns:
            True if link created
        """
        from runtime.inject import inject_link
        from runtime.infrastructure.database import get_database_adapter

        try:
            adapter = get_database_adapter(graph_name=self.graph_name)
            inject_link(adapter, from_moment_id, to_moment_id, nature=nature)
            return True
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to link moments: {e}")
            return False

    def update_agent_cwd(self, actor_id: str, new_cwd: str) -> bool:
        """
        Update agent's current working directory.

        - Removes old works_in links to folder spaces
        - Links to existing folder space if found
        - Stores cwd as property on agent

        Args:
            actor_id: Agent actor ID
            new_cwd: New working directory path

        Returns:
            True if updated
        """
        if not self._connect():
            return False

        try:
            ts = int(time.time())

            # Remove existing "works_in" links to folder spaces
            self._graph_ops._query("""
                MATCH (a {id: $actor_id})-[r:LINK {verb: 'works_in'}]->(s)
                WHERE s.type = 'FOLDER'
                DELETE r
            """, {"actor_id": actor_id})

            # Store cwd as property
            self._graph_ops._query("""
                MATCH (a {id: $actor_id})
                SET a.cwd = $cwd, a.updated_at_s = $ts
            """, {"actor_id": actor_id, "cwd": new_cwd, "ts": ts})

            # Link to existing folder space if one exists
            self._graph_ops._query("""
                MATCH (a {id: $actor_id})
                MATCH (s:Space {location: $cwd})
                MERGE (a)-[r:LINK]->(s)
                SET r.verb = 'works_in', r.created_at_s = coalesce(r.created_at_s, $ts)
            """, {"actor_id": actor_id, "cwd": new_cwd, "ts": ts})

            logger.info(f"[AgentGraph] Updated {actor_id} cwd to {new_cwd}")
            return True

        except Exception as e:
            logger.error(f"[AgentGraph] Failed to update cwd: {e}")
            return False

    def assign_agent_to_work(
        self,
        actor_id: str,
        task_id: str,
        problem_ids: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Full assignment: link agent to task/problems and create moment.
        """
        if task_id:
            self.link_agent_to_task(actor_id, task_id)

        if problem_ids:
            for problem_id in problem_ids:
                self.link_agent_to_problem(actor_id, problem_id)

        # Get task synthesis for readable moment
        task_synth = None
        try:
            synth_result = self._graph_ops._query(
                "MATCH (t:Narrative {id: $tid}) RETURN t.synthesis",
                {"tid": task_id}
            )
            if synth_result and synth_result[0]:
                task_synth = synth_result[0][0]
        except Exception:
            pass

        # Use new create_moment with chaining
        about_ids = [task_id] if task_id else []
        if problem_ids:
            about_ids.extend(problem_ids)

        agent_name = actor_id.replace("AGENT_", "")
        task_desc = task_synth or task_id
        prose = f"Agent {agent_name} assigned to: {task_desc}"

        moment_id = self.create_moment(
            actor_id=actor_id,
            moment_type="ASSIGNMENT",
            prose=prose,
            about_ids=about_ids,
            extra_props={"task_id": task_id, "status": "completed"},
        )
        return moment_id

    def upsert_problem_narrative(
        self,
        task_type: str,
        path: str,
        message: str,
        severity: str = "warning",
    ) -> Optional[str]:
        """Create or update a problem narrative node."""
        if not self._connect():
            return None

        try:
            timestamp = int(time.time())
            path_hash = hashlib.sha256(path.encode()).hexdigest()[:6]
            narrative_id = f"narrative_issue_{task_type}_{path_hash}"

            cypher = """
            MERGE (n:Narrative {id: $id})
            SET n.node_type = 'narrative',
                n.type = 'problem',
                n.task_type = $task_type,
                n.path = $path,
                n.message = $message,
                n.severity = $severity,
                n.status = 'open',
                n.updated_at_s = $timestamp,
                n.created_at_s = coalesce(n.created_at_s, $timestamp)
            RETURN n.id
            """
            result = self._graph_ops._query(cypher, {
                "id": narrative_id,
                "task_type": task_type,
                "path": path,
                "message": message[:500],
                "severity": severity,
                "timestamp": timestamp,
            })

            if result:
                logger.info(f"[AgentGraph] Upserted problem narrative: {narrative_id}")
                return narrative_id
            return None
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to upsert problem narrative: {e}")
            return None

    def upsert_task_narrative(
        self,
        task_type: str,
        content: str,
        name: Optional[str] = None,
    ) -> Optional[str]:
        """Create or update a task narrative node."""
        if not self._connect():
            return None

        try:
            timestamp = int(time.time())
            content_hash = hashlib.sha256(content.encode()).hexdigest()[:6]
            narrative_id = f"narrative_TASK_{task_type}_{content_hash}"

            cypher = """
            MERGE (n:Narrative {id: $id})
            SET n.node_type = 'narrative',
                n.type = 'task',
                n.task_type = $task_type,
                n.content = $content,
                n.name = $name,
                n.status = 'pending',
                n.updated_at_s = $timestamp,
                n.created_at_s = coalesce(n.created_at_s, $timestamp)
            RETURN n.id
            """
            result = self._graph_ops._query(cypher, {
                "id": narrative_id,
                "task_type": task_type,
                "content": content[:1000],
                "name": name or f"{task_type} task",
                "timestamp": timestamp,
            })

            if result:
                logger.info(f"[AgentGraph] Upserted task narrative: {narrative_id}")
                return narrative_id
            return None
        except Exception as e:
            logger.error(f"[AgentGraph] Failed to upsert task narrative: {e}")
            return None


def get_agent_template_path(name: str, target_dir: Path, provider: str = "claude") -> Optional[Path]:
    """
    Get the path to an agent's template file.

    Structure: .mind/actors/{name}/{PROVIDER}.md
    - CLAUDE.md for Claude
    - GEMINI.md for Gemini
    - AGENTS.md as fallback
    """
    provider_files = {
        "claude": "CLAUDE.md",
        "gemini": "GEMINI.md",
    }

    actor_dir = target_dir / ".mind" / "actors" / name.lower()
    if not actor_dir.exists():
        return None

    # Try provider-specific file first
    provider_file = provider_files.get(provider.lower(), "AGENTS.md")
    actor_path = actor_dir / provider_file
    if actor_path.exists():
        return actor_path

    # Fallback to AGENTS.md
    fallback_path = actor_dir / "AGENTS.md"
    if fallback_path.exists():
        return fallback_path

    return None


def load_agent_prompt(name: str, target_dir: Path, provider: str = "claude") -> Optional[str]:
    """Load the agent's base prompt/system prompt from template."""
    template_path = get_agent_template_path(name, target_dir, provider)

    if template_path and template_path.exists():
        return template_path.read_text()

    return None
