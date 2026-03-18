"""
Space and Hierarchy Manager

Space CRUD operations, containment hierarchy, sub-Space traversal.
Implements ALG-4 (Space Hierarchy Traversal) from the Universe Graph design.

Key responsibilities:
- Create Space nodes with owner HAS_ACCESS links (INV-1: no orphan Spaces)
- Create sub-Spaces with containment links
- Traverse hierarchy up (parent_space) and down (get_sub_spaces)
- Validate acyclicity on containment creation (INV-9)
- Place Moments into Spaces

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-4)
      docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U1)
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Dict, Any, List, Optional

from runtime.infrastructure.database.adapter import DatabaseAdapter

from .constants_l3_physics import (
    CONTAINMENT_HIERARCHY,
    CONTAINMENT_PERMANENCE,
    CONTAINMENT_DEFAULT_WEIGHT,
    HAS_ACCESS_OWNER_HIERARCHY,
    HAS_ACCESS_OWNER_PERMANENCE,
    HAS_ACCESS_OWNER_TRUST,
    SPACE_HIERARCHY_MAX_DEPTH,
    VALID_ROLES,
)

logger = logging.getLogger(__name__)


@dataclass
class SpaceChild:
    """Result from hierarchy traversal: a descendant Space."""
    space_id: str
    name: str
    depth: int
    containment_weight: float


@dataclass
class SpaceInfo:
    """Basic information about a Space node."""
    space_id: str
    name: str
    space_type: Optional[str]
    weight: float
    energy: float
    created_at_s: int


class SpaceManager:
    """
    Manages Space nodes and their containment hierarchy.

    All Space creation guarantees INV-1 (no orphan Spaces) by always
    creating an owner HAS_ACCESS link atomically with the Space node.

    Uses the existing DatabaseAdapter interface for all graph operations.
    """

    def __init__(self, adapter: DatabaseAdapter):
        self._adapter = adapter

    # =========================================================================
    # SPACE CREATION
    # =========================================================================

    def create_space(
        self,
        creator_actor_id: str,
        name: str,
        parent_space_id: Optional[str] = None,
        space_type: Optional[str] = None,
    ) -> str:
        """
        Create a Space node with an owner HAS_ACCESS link.

        Implements: B1 (Space Creation), INV-1 (no orphan Spaces).

        Args:
            creator_actor_id: Actor who will own the Space.
            name: Human-readable name for the Space.
            parent_space_id: If provided, creates containment link from parent.
            space_type: Free-form type field (no branching on this, INV-11).

        Returns:
            The new Space node ID.

        Raises:
            SpaceError: If creator actor not found, parent space not found,
                        or containment would create a cycle.
        """
        # Validate creator actor exists
        self._assert_actor_exists(creator_actor_id)

        # Validate parent space exists and check for cycles
        if parent_space_id is not None:
            self._assert_space_exists(parent_space_id)

        space_id = f"space_{uuid.uuid4().hex[:12]}"
        now_s = int(time.time())

        # Create Space node
        create_space_cypher = """
        CREATE (s:Space {
            id: $space_id,
            name: $name,
            node_type: 'space',
            type: $space_type,
            weight: 1.0,
            energy: 0.0,
            stability: 0.0,
            recency: 1.0,
            synthesis: $synthesis,
            created_at_s: $now_s,
            updated_at_s: $now_s
        })
        """
        synthesis = f"Space: {name}"
        if space_type:
            synthesis += f" (type: {space_type})"

        self._adapter.execute(create_space_cypher, {
            "space_id": space_id,
            "name": name,
            "space_type": space_type,
            "synthesis": synthesis,
            "now_s": now_s,
        })

        # Create owner HAS_ACCESS link (INV-1: always created with the Space)
        access_content = json.dumps({"role": "owner"})
        link_id = f"link_{uuid.uuid4().hex[:12]}"
        create_access_cypher = """
        MATCH (a:Actor {id: $actor_id})
        MATCH (s:Space {id: $space_id})
        CREATE (a)-[:link {
            id: $link_id,
            node_a: $actor_id,
            node_b: $space_id,
            type: 'has_access',
            hierarchy: $hierarchy,
            permanence: $permanence,
            trust: $trust,
            weight: 1.0,
            energy: 0.0,
            stability: 0.5,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.0,
            content: $content,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(s)
        """
        self._adapter.execute(create_access_cypher, {
            "link_id": link_id,
            "actor_id": creator_actor_id,
            "space_id": space_id,
            "hierarchy": HAS_ACCESS_OWNER_HIERARCHY,
            "permanence": HAS_ACCESS_OWNER_PERMANENCE,
            "trust": HAS_ACCESS_OWNER_TRUST,
            "content": access_content,
            "now_s": now_s,
        })

        # Create containment link if parent specified
        if parent_space_id is not None:
            self._create_containment_link(parent_space_id, space_id, now_s)

        logger.info(
            f"[SpaceManager] Created Space {space_id} '{name}' "
            f"owned by {creator_actor_id}"
            + (f" under parent {parent_space_id}" if parent_space_id else "")
        )

        return space_id

    # =========================================================================
    # SPACE RETRIEVAL
    # =========================================================================

    def get_space(self, space_id: str) -> Optional[SpaceInfo]:
        """
        Get basic info about a Space node.

        Returns None if the Space does not exist.
        """
        cypher = """
        MATCH (s:Space {id: $space_id})
        RETURN s.id, s.name, s.type, s.weight, s.energy, s.created_at_s
        """
        rows = self._adapter.query(cypher, {"space_id": space_id})
        if not rows:
            return None
        row = rows[0]
        return SpaceInfo(
            space_id=row[0],
            name=row[1],
            space_type=row[2],
            weight=float(row[3]) if row[3] is not None else 1.0,
            energy=float(row[4]) if row[4] is not None else 0.0,
            created_at_s=int(row[5]) if row[5] is not None else 0,
        )

    def list_all_spaces(self) -> List[SpaceInfo]:
        """Return all Space nodes in the graph."""
        cypher = """
        MATCH (s:Space)
        WHERE s.node_type = 'space'
        RETURN s.id, s.name, s.type, s.weight, s.energy, s.created_at_s
        ORDER BY s.created_at_s
        """
        rows = self._adapter.query(cypher)
        return [
            SpaceInfo(
                space_id=row[0],
                name=row[1],
                space_type=row[2],
                weight=float(row[3]) if row[3] is not None else 1.0,
                energy=float(row[4]) if row[4] is not None else 0.0,
                created_at_s=int(row[5]) if row[5] is not None else 0,
            )
            for row in rows
        ]

    # =========================================================================
    # HIERARCHY TRAVERSAL (ALG-4)
    # =========================================================================

    def get_sub_spaces(
        self, space_id: str, max_depth: int = SPACE_HIERARCHY_MAX_DEPTH
    ) -> List[SpaceChild]:
        """
        ALG-4 downward traversal: returns all descendant Spaces.

        BFS through containment links (hierarchy = -1) from parent to child.

        Args:
            space_id: Root Space to traverse from.
            max_depth: Maximum traversal depth.

        Returns:
            List of SpaceChild for all descendants.
        """
        result: List[SpaceChild] = []
        queue: List[tuple] = [(space_id, 0)]
        visited: set = {space_id}

        while queue:
            current_id, depth = queue.pop(0)
            if depth >= max_depth:
                continue

            # Find children: containment links FROM current TO child spaces
            # where hierarchy = -1 (parent contains child)
            cypher = """
            MATCH (parent:Space {id: $parent_id})-[r:link]->(child:Space)
            WHERE r.hierarchy = -1
              AND child.node_type = 'space'
              AND (r.type IS NULL OR r.type <> 'has_access')
            RETURN child.id, child.name, r.weight
            """
            rows = self._adapter.query(cypher, {"parent_id": current_id})

            for row in rows:
                child_id = row[0]
                if child_id in visited:
                    continue
                visited.add(child_id)
                child_name = row[1]
                link_weight = float(row[2]) if row[2] is not None else 1.0
                result.append(SpaceChild(
                    space_id=child_id,
                    name=child_name,
                    depth=depth + 1,
                    containment_weight=link_weight,
                ))
                queue.append((child_id, depth + 1))

        return result

    def parent_space(self, space_id: str) -> Optional[str]:
        """
        ALG-4 upward traversal: returns parent Space ID or None.

        Finds containment link pointing TO this space with hierarchy = -1
        where the source is also a Space node.

        If multiple parent links exist (shouldn't happen in well-formed data),
        returns the highest-weight one.
        """
        cypher = """
        MATCH (parent:Space)-[r:link]->(child:Space {id: $space_id})
        WHERE r.hierarchy = -1
          AND parent.node_type = 'space'
          AND (r.type IS NULL OR r.type <> 'has_access')
        RETURN parent.id, r.weight
        ORDER BY r.weight DESC
        LIMIT 1
        """
        rows = self._adapter.query(cypher, {"space_id": space_id})
        if not rows:
            return None
        return rows[0][0]

    def get_ancestor_chain(self, space_id: str) -> List[str]:
        """
        Walk up the containment hierarchy from a Space to the root.

        Returns list of ancestor Space IDs, starting from the direct parent
        and ending at the root. Empty list if space_id has no parent.

        Also serves as cycle detection: raises SpaceError if a cycle is found.
        """
        ancestors: List[str] = []
        visited: set = {space_id}
        current = space_id

        while True:
            parent_id = self.parent_space(current)
            if parent_id is None:
                break
            if parent_id in visited:
                raise SpaceError(
                    f"Cycle detected in Space hierarchy: "
                    f"{parent_id} is both ancestor and descendant of {space_id}"
                )
            visited.add(parent_id)
            ancestors.append(parent_id)
            current = parent_id

        return ancestors

    # =========================================================================
    # MOMENT PLACEMENT
    # =========================================================================

    def create_moment_in_space(
        self,
        actor_id: str,
        space_id: str,
        moment_name: str,
        content: Optional[str] = None,
        synthesis: Optional[str] = None,
        moment_type: Optional[str] = None,
    ) -> str:
        """
        Create a Moment node and link it to a Space.

        The Moment is placed inside the Space via a containment link
        (Space -> Moment, hierarchy = -1). The Actor is linked to the
        Moment as well (Actor -> Moment).

        Args:
            actor_id: The Actor creating the Moment.
            space_id: The Space where the Moment occurs.
            moment_name: Name/title of the Moment.
            content: Full text content.
            synthesis: Summary for embedding.
            moment_type: Optional free-form type.

        Returns:
            The new Moment node ID.
        """
        self._assert_actor_exists(actor_id)
        self._assert_space_exists(space_id)

        moment_id = f"moment_{uuid.uuid4().hex[:12]}"
        now_s = int(time.time())

        if synthesis is None:
            synthesis = f"Moment: {moment_name}"

        # Create Moment node
        create_moment_cypher = """
        CREATE (m:Moment {
            id: $moment_id,
            name: $moment_name,
            node_type: 'moment',
            type: $moment_type,
            weight: 1.0,
            energy: 0.0,
            stability: 0.0,
            recency: 1.0,
            content: $content,
            synthesis: $synthesis,
            status: 'active',
            created_at_s: $now_s,
            updated_at_s: $now_s,
            started_at_s: $now_s
        })
        """
        self._adapter.execute(create_moment_cypher, {
            "moment_id": moment_id,
            "moment_name": moment_name,
            "moment_type": moment_type,
            "content": content,
            "synthesis": synthesis,
            "now_s": now_s,
        })

        # Link Space -> Moment (containment: Space contains Moment)
        space_moment_link_id = f"link_{uuid.uuid4().hex[:12]}"
        space_moment_cypher = """
        MATCH (s:Space {id: $space_id})
        MATCH (m:Moment {id: $moment_id})
        CREATE (s)-[:link {
            id: $link_id,
            node_a: $space_id,
            node_b: $moment_id,
            type: NULL,
            hierarchy: -1,
            permanence: 0.5,
            weight: 1.0,
            energy: 0.0,
            stability: 0.0,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.0,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(m)
        """
        self._adapter.execute(space_moment_cypher, {
            "link_id": space_moment_link_id,
            "space_id": space_id,
            "moment_id": moment_id,
            "now_s": now_s,
        })

        # Link Actor -> Moment (actor participated)
        actor_moment_link_id = f"link_{uuid.uuid4().hex[:12]}"
        actor_moment_cypher = """
        MATCH (a:Actor {id: $actor_id})
        MATCH (m:Moment {id: $moment_id})
        CREATE (a)-[:link {
            id: $link_id,
            node_a: $actor_id,
            node_b: $moment_id,
            type: NULL,
            hierarchy: 0,
            permanence: 0.5,
            weight: 1.0,
            energy: 0.0,
            stability: 0.0,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.0,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(m)
        """
        self._adapter.execute(actor_moment_cypher, {
            "link_id": actor_moment_link_id,
            "actor_id": actor_id,
            "moment_id": moment_id,
            "now_s": now_s,
        })

        logger.info(
            f"[SpaceManager] Created Moment {moment_id} '{moment_name}' "
            f"in Space {space_id} by Actor {actor_id}"
        )

        return moment_id

    # =========================================================================
    # SPACE DELETION
    # =========================================================================

    def delete_space(self, space_id: str) -> None:
        """
        Delete a Space node and all its links.

        WARNING: This does not check ownership. The caller (AccessResolver
        or higher-level code) must verify that the requesting actor has
        owner role before calling this.

        Deletes:
        - All links TO the Space (HAS_ACCESS links)
        - All links FROM the Space (containment of children, moments)
        - The Space node itself
        """
        self._assert_space_exists(space_id)

        # Delete all relationships first, then the node
        delete_cypher = """
        MATCH (s:Space {id: $space_id})
        OPTIONAL MATCH (s)-[r]-()
        DELETE r, s
        """
        self._adapter.execute(delete_cypher, {"space_id": space_id})

        logger.info(f"[SpaceManager] Deleted Space {space_id}")

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    def _assert_actor_exists(self, actor_id: str) -> None:
        """Raise SpaceError if actor does not exist in the graph."""
        cypher = "MATCH (a:Actor {id: $actor_id}) RETURN a.id"
        rows = self._adapter.query(cypher, {"actor_id": actor_id})
        if not rows:
            raise SpaceError(f"Actor {actor_id} not found in graph")

    def _assert_space_exists(self, space_id: str) -> None:
        """Raise SpaceError if space does not exist in the graph."""
        cypher = "MATCH (s:Space {id: $space_id}) RETURN s.id"
        rows = self._adapter.query(cypher, {"space_id": space_id})
        if not rows:
            raise SpaceError(f"Space {space_id} not found in graph")

    def _create_containment_link(
        self, parent_id: str, child_id: str, now_s: int
    ) -> None:
        """
        Create a containment link from parent Space to child Space.

        Validates INV-9 (acyclicity) before creating the link:
        the child must not be an ancestor of the parent.
        """
        # Check that adding this link would not create a cycle.
        # Walk ancestors of the parent. If any ancestor is the child, reject.
        ancestors_of_parent = set()
        current = parent_id
        while current is not None:
            if current == child_id:
                raise SpaceError(
                    f"Cannot create containment: {child_id} is an ancestor "
                    f"of {parent_id}. This would create a cycle (INV-9)."
                )
            ancestors_of_parent.add(current)
            current = self.parent_space(current)

        link_id = f"link_{uuid.uuid4().hex[:12]}"
        containment_cypher = """
        MATCH (parent:Space {id: $parent_id})
        MATCH (child:Space {id: $child_id})
        CREATE (parent)-[:link {
            id: $link_id,
            node_a: $parent_id,
            node_b: $child_id,
            type: NULL,
            hierarchy: $hierarchy,
            permanence: $permanence,
            weight: $weight,
            energy: 0.0,
            stability: 0.0,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.0,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(child)
        """
        self._adapter.execute(containment_cypher, {
            "link_id": link_id,
            "parent_id": parent_id,
            "child_id": child_id,
            "hierarchy": CONTAINMENT_HIERARCHY,
            "permanence": CONTAINMENT_PERMANENCE,
            "weight": CONTAINMENT_DEFAULT_WEIGHT,
            "now_s": now_s,
        })

        logger.info(
            f"[SpaceManager] Created containment link "
            f"{parent_id} -> {child_id}"
        )


class SpaceError(Exception):
    """Raised when a Space operation fails."""
    pass
