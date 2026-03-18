"""
Access Resolution and Link Manager

HAS_ACCESS link creation, ALG-1 access resolution, role checks.
Implements ALG-1 (HAS_ACCESS Resolution) from the Universe Graph design.

Key responsibilities:
- Resolve access: direct link check, then hierarchical traversal (ALG-1)
- Grant access: create HAS_ACCESS link with role (ALG-2 simplified, no crypto)
- Revoke access: remove HAS_ACCESS link
- List members of a Space
- List Spaces an Actor can access

All access checking goes through HAS_ACCESS links (INV-2).
No property-based access control anywhere.

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-1, ALG-2)
      docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U2)
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Dict, Any, List, Optional

from runtime.infrastructure.database.adapter import DatabaseAdapter

from .constants_l3_physics import (
    HAS_ACCESS_MEMBER_HIERARCHY,
    HAS_ACCESS_MEMBER_PERMANENCE,
    HAS_ACCESS_MEMBER_TRUST,
    HAS_ACCESS_ADMIN_HIERARCHY,
    HAS_ACCESS_ADMIN_PERMANENCE,
    HAS_ACCESS_ADMIN_TRUST,
    ROLE_HIERARCHY,
    VALID_ROLES,
)
from .space_and_hierarchy_manager import SpaceManager, SpaceError

logger = logging.getLogger(__name__)


@dataclass
class AccessResult:
    """Result of an access check (ALG-1)."""
    granted: bool
    role: Optional[str] = None           # "owner", "admin", "member"
    inherited_from: Optional[str] = None  # ancestor Space ID if inherited


@dataclass
class SpaceMember:
    """An actor with direct HAS_ACCESS to a Space."""
    actor_id: str
    role: str
    trust: float


@dataclass
class ActorSpace:
    """A Space that an actor has direct HAS_ACCESS to."""
    space_id: str
    space_name: str
    role: str


class AccessResolver:
    """
    Resolves access to Spaces via HAS_ACCESS links.

    All access determination goes through links (INV-2).
    No property-based access checking.

    Access resolution (ALG-1):
    1. Check for direct HAS_ACCESS link from Actor to Space.
    2. Walk up the containment hierarchy looking for HAS_ACCESS.
    3. Inherited access downgrades role to max("member").
    """

    def __init__(self, adapter: DatabaseAdapter, space_manager: SpaceManager):
        self._adapter = adapter
        self._space_mgr = space_manager

    # =========================================================================
    # ACCESS RESOLUTION (ALG-1)
    # =========================================================================

    def has_access(self, actor_id: str, space_id: str) -> AccessResult:
        """
        ALG-1: Check if actor can access space.

        Step 1: Direct HAS_ACCESS link check.
        Step 2: Hierarchical traversal up containment chain.
        Step 3: Return AccessResult(granted=False) if no path found.

        Validates: INV-2 (all access via links), INV-8 (link structure).
        """
        # Step 1: Direct link check
        direct = self._find_direct_access(actor_id, space_id)
        if direct is not None:
            return AccessResult(
                granted=True,
                role=direct,
            )

        # Step 2: Walk up the containment hierarchy
        try:
            ancestors = self._space_mgr.get_ancestor_chain(space_id)
        except SpaceError:
            # Cycle in hierarchy -- treat as no access
            return AccessResult(granted=False)

        for ancestor_id in ancestors:
            ancestor_role = self._find_direct_access(actor_id, ancestor_id)
            if ancestor_role is not None:
                # Inherited access: role is downgraded to at most "member"
                inherited_role = self._min_role(ancestor_role, "member")
                return AccessResult(
                    granted=True,
                    role=inherited_role,
                    inherited_from=ancestor_id,
                )

        # Step 3: No access found
        return AccessResult(granted=False)

    # =========================================================================
    # GRANT / REVOKE ACCESS
    # =========================================================================

    def grant_access(
        self,
        grantor_id: str,
        target_actor_id: str,
        space_id: str,
        role: str = "member",
    ) -> None:
        """
        Grant access to a Space by creating a HAS_ACCESS link.

        Implements: B2 (Access Granting), ALG-2 (simplified without crypto).
        Validates: INV-8 (link structure: actor -> space, role in content).

        Requirements:
        - Grantor must have owner or admin role on the Space.
        - Target actor must exist.
        - Role must be one of: owner, admin, member.
        - Cannot grant a role higher than grantor's own role.

        Raises:
            AccessError: If grantor lacks permission or target doesn't exist.
        """
        if role not in VALID_ROLES:
            raise AccessError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")

        # Validate actors exist
        self._assert_actor_exists(target_actor_id)

        # Verify grantor has admin/owner access
        grantor_access = self.has_access(grantor_id, space_id)
        if not grantor_access.granted:
            raise AccessError(
                f"Actor {grantor_id} has no access to Space {space_id}, "
                f"cannot grant access"
            )
        if grantor_access.role not in ("owner", "admin"):
            raise AccessError(
                f"Actor {grantor_id} has role '{grantor_access.role}' on "
                f"Space {space_id}; only owner/admin can grant access"
            )

        # Cannot grant a higher role than your own
        if ROLE_HIERARCHY.get(role, 0) > ROLE_HIERARCHY.get(grantor_access.role, 0):
            raise AccessError(
                f"Cannot grant role '{role}': grantor only has "
                f"'{grantor_access.role}'"
            )

        # Check if target already has direct access
        existing_role = self._find_direct_access(target_actor_id, space_id)
        if existing_role is not None:
            # Update the role if different
            if existing_role == role:
                return  # Already has this exact access
            self._update_access_role(target_actor_id, space_id, role)
            return

        # Create HAS_ACCESS link
        now_s = int(time.time())
        link_id = f"link_{uuid.uuid4().hex[:12]}"
        access_content = json.dumps({"role": role})

        # Determine link properties based on role
        if role == "admin":
            hierarchy = HAS_ACCESS_ADMIN_HIERARCHY
            permanence = HAS_ACCESS_ADMIN_PERMANENCE
            trust = HAS_ACCESS_ADMIN_TRUST
        else:  # member
            hierarchy = HAS_ACCESS_MEMBER_HIERARCHY
            permanence = HAS_ACCESS_MEMBER_PERMANENCE
            trust = HAS_ACCESS_MEMBER_TRUST

        create_cypher = """
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
            stability: 0.0,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.0,
            content: $content,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(s)
        """
        self._adapter.execute(create_cypher, {
            "link_id": link_id,
            "actor_id": target_actor_id,
            "space_id": space_id,
            "hierarchy": hierarchy,
            "permanence": permanence,
            "trust": trust,
            "content": access_content,
            "now_s": now_s,
        })

        logger.info(
            f"[AccessResolver] Granted {role} access to "
            f"Actor {target_actor_id} on Space {space_id} "
            f"(by {grantor_id})"
        )

    def revoke_access(
        self,
        revoker_id: str,
        target_actor_id: str,
        space_id: str,
    ) -> None:
        """
        Remove HAS_ACCESS link from target actor to space.

        Implements: B3 (Access Revocation).

        Requirements:
        - Revoker must have owner or admin role.
        - Cannot revoke the last owner (INV-1: no orphan Spaces).

        Raises:
            AccessError: If revoker lacks permission, or this would
                        create an orphan Space.
        """
        # Verify revoker has admin/owner access
        revoker_access = self.has_access(revoker_id, space_id)
        if not revoker_access.granted:
            raise AccessError(
                f"Actor {revoker_id} has no access to Space {space_id}"
            )
        if revoker_access.role not in ("owner", "admin"):
            raise AccessError(
                f"Actor {revoker_id} has role '{revoker_access.role}'; "
                f"only owner/admin can revoke access"
            )

        # Check target has direct access
        target_role = self._find_direct_access(target_actor_id, space_id)
        if target_role is None:
            raise AccessError(
                f"Actor {target_actor_id} has no direct access to "
                f"Space {space_id}"
            )

        # Prevent revoking the last owner (INV-1)
        if target_role == "owner":
            owners = self._count_owners(space_id)
            if owners <= 1:
                raise AccessError(
                    f"Cannot revoke last owner of Space {space_id} (INV-1)"
                )

        # Admin cannot revoke an owner
        if target_role == "owner" and revoker_access.role == "admin":
            raise AccessError(
                "Admin cannot revoke owner access"
            )

        # Delete the HAS_ACCESS link
        delete_cypher = """
        MATCH (a:Actor {id: $actor_id})-[r:link]->(s:Space {id: $space_id})
        WHERE r.type = 'has_access'
        DELETE r
        """
        self._adapter.execute(delete_cypher, {
            "actor_id": target_actor_id,
            "space_id": space_id,
        })

        logger.info(
            f"[AccessResolver] Revoked access for Actor {target_actor_id} "
            f"from Space {space_id} (by {revoker_id})"
        )

    # =========================================================================
    # MEMBERSHIP QUERIES
    # =========================================================================

    def list_space_members(self, space_id: str) -> List[SpaceMember]:
        """
        Return all actors with direct HAS_ACCESS to this Space, with roles.
        """
        cypher = """
        MATCH (a:Actor)-[r:link]->(s:Space {id: $space_id})
        WHERE r.type = 'has_access'
        RETURN a.id, r.content, r.trust
        """
        rows = self._adapter.query(cypher, {"space_id": space_id})
        result = []
        for row in rows:
            actor_id = row[0]
            content = self._parse_link_content(row[1])
            role = content.get("role", "member")
            trust = float(row[2]) if row[2] is not None else 0.0
            result.append(SpaceMember(
                actor_id=actor_id,
                role=role,
                trust=trust,
            ))
        return result

    def list_actor_spaces(self, actor_id: str) -> List[ActorSpace]:
        """
        Return all Spaces this actor has direct HAS_ACCESS to.
        """
        cypher = """
        MATCH (a:Actor {id: $actor_id})-[r:link]->(s:Space)
        WHERE r.type = 'has_access'
        RETURN s.id, s.name, r.content
        """
        rows = self._adapter.query(cypher, {"actor_id": actor_id})
        result = []
        for row in rows:
            content = self._parse_link_content(row[2])
            role = content.get("role", "member")
            result.append(ActorSpace(
                space_id=row[0],
                space_name=row[1],
                role=role,
            ))
        return result

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    def _find_direct_access(
        self, actor_id: str, space_id: str
    ) -> Optional[str]:
        """
        Check for a direct HAS_ACCESS link from actor to space.

        Returns the role string if found, None otherwise.
        """
        cypher = """
        MATCH (a:Actor {id: $actor_id})-[r:link]->(s:Space {id: $space_id})
        WHERE r.type = 'has_access'
        RETURN r.content
        """
        rows = self._adapter.query(cypher, {
            "actor_id": actor_id,
            "space_id": space_id,
        })
        if not rows:
            return None
        content = self._parse_link_content(rows[0][0])
        return content.get("role", "member")

    def _update_access_role(
        self, actor_id: str, space_id: str, new_role: str
    ) -> None:
        """Update the role on an existing HAS_ACCESS link."""
        new_content = json.dumps({"role": new_role})
        now_s = int(time.time())
        cypher = """
        MATCH (a:Actor {id: $actor_id})-[r:link]->(s:Space {id: $space_id})
        WHERE r.type = 'has_access'
        SET r.content = $content, r.updated_at_s = $now_s
        """
        self._adapter.execute(cypher, {
            "actor_id": actor_id,
            "space_id": space_id,
            "content": new_content,
            "now_s": now_s,
        })

    def _count_owners(self, space_id: str) -> int:
        """Count the number of owners for a Space."""
        cypher = """
        MATCH (a:Actor)-[r:link]->(s:Space {id: $space_id})
        WHERE r.type = 'has_access'
        RETURN r.content
        """
        rows = self._adapter.query(cypher, {"space_id": space_id})
        count = 0
        for row in rows:
            content = self._parse_link_content(row[0])
            if content.get("role") == "owner":
                count += 1
        return count

    def _min_role(self, role_a: str, role_b: str) -> str:
        """Return the lesser of two roles."""
        rank_a = ROLE_HIERARCHY.get(role_a, 0)
        rank_b = ROLE_HIERARCHY.get(role_b, 0)
        if rank_a <= rank_b:
            return role_a
        return role_b

    def _assert_actor_exists(self, actor_id: str) -> None:
        """Raise AccessError if actor does not exist in the graph."""
        cypher = "MATCH (a:Actor {id: $actor_id}) RETURN a.id"
        rows = self._adapter.query(cypher, {"actor_id": actor_id})
        if not rows:
            raise AccessError(f"Actor {actor_id} not found in graph")

    @staticmethod
    def _parse_link_content(content_raw) -> Dict[str, Any]:
        """Parse the JSON content field from a link."""
        if content_raw is None:
            return {}
        if isinstance(content_raw, dict):
            return content_raw
        try:
            return json.loads(content_raw)
        except (json.JSONDecodeError, TypeError):
            return {}


class AccessError(Exception):
    """Raised when an access operation fails."""
    pass
