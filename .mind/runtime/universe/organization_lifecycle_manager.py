"""
Organization Lifecycle Manager

Org creation (Narrative + hall Space), membership, dissolution check.
Implements ALG-7 (Organization Lifecycle) from the Universe Graph design.

Key responsibilities:
- Create organizations as Narrative nodes with hall Spaces
- Manage membership (join via HAS_ACCESS + BELIEVES link)
- Compute on-demand org reputation (ALG-8)
- Detect dissolution conditions (all links decayed)

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-7, ALG-8)
      docs/universe/IMPLEMENTATION_Universe_Graph.md (Phase U4)
"""

import json
import logging
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from runtime.infrastructure.database.adapter import DatabaseAdapter

from .access_resolution_and_link_manager import AccessResolver, AccessError
from .space_and_hierarchy_manager import SpaceManager, SpaceError

logger = logging.getLogger(__name__)


# Thresholds for dissolution detection
DISSOLUTION_ACCESS_THRESHOLD: float = 0.05
DISSOLUTION_BELIEVES_THRESHOLD: float = 0.05


@dataclass
class OrganizationInfo:
    """Information about an organization."""
    narrative_id: str
    hall_space_id: str
    founder_id: str
    name: str
    mission: str


class OrgManager:
    """
    Manages organization lifecycle.

    An organization is:
    - A Narrative node (type='organization')
    - A hall Space (where org activity happens)
    - BELIEVES links from members to the Narrative
    - HAS_ACCESS links from members to the hall Space
    """

    def __init__(
        self,
        adapter: DatabaseAdapter,
        space_manager: SpaceManager,
        access_resolver: AccessResolver,
    ):
        self._adapter = adapter
        self._space_mgr = space_manager
        self._access = access_resolver

    def create_organization(
        self,
        founder_id: str,
        name: str,
        mission_statement: str,
    ) -> OrganizationInfo:
        """
        ALG-7: Create org.
        1. Create hall Space via SpaceManager (founder = owner).
        2. Create Narrative node (type='organization').
        3. Link Narrative to hall Space (hierarchy=-1, permanence=0.9).
        4. Link founder to Narrative (BELIEVES: trust=0.8, affinity=0.7).

        Implements: B5 (Organization Creation).

        Args:
            founder_id: The Actor creating the organization.
            name: Organization name.
            mission_statement: The org's mission (goes into Narrative synthesis).

        Returns:
            OrganizationInfo with all created IDs.
        """
        # Step 1: Create hall Space
        hall_space_id = self._space_mgr.create_space(
            creator_actor_id=founder_id,
            name=f"{name}_hall",
            space_type="org_hall",
        )

        now_s = int(time.time())
        narrative_id = f"narrative_{uuid.uuid4().hex[:12]}"

        # Step 2: Create Narrative node
        create_narrative_cypher = """
        CREATE (n:Narrative {
            id: $narrative_id,
            name: $name,
            node_type: 'narrative',
            type: 'organization',
            weight: 1.0,
            energy: 0.0,
            stability: 0.5,
            recency: 1.0,
            content: $content,
            synthesis: $synthesis,
            created_at_s: $now_s,
            updated_at_s: $now_s
        })
        """
        content = json.dumps({
            "mission": mission_statement,
            "founder": founder_id,
            "hall_space": hall_space_id,
        })
        synthesis = f"Organization: {name}. {mission_statement}"

        self._adapter.execute(create_narrative_cypher, {
            "narrative_id": narrative_id,
            "name": name,
            "content": content,
            "synthesis": synthesis,
            "now_s": now_s,
        })

        # Step 3: Link Narrative -> hall Space (Narrative defines the Space)
        narrative_hall_link_id = f"link_{uuid.uuid4().hex[:12]}"
        narrative_hall_cypher = """
        MATCH (n:Narrative {id: $narrative_id})
        MATCH (s:Space {id: $hall_space_id})
        CREATE (n)-[:link {
            id: $link_id,
            node_a: $narrative_id,
            node_b: $hall_space_id,
            type: NULL,
            hierarchy: -1,
            permanence: 0.9,
            weight: 1.0,
            energy: 0.0,
            stability: 0.5,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.5,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(s)
        """
        self._adapter.execute(narrative_hall_cypher, {
            "link_id": narrative_hall_link_id,
            "narrative_id": narrative_id,
            "hall_space_id": hall_space_id,
            "now_s": now_s,
        })

        # Step 4: Link founder -> Narrative (BELIEVES)
        believes_link_id = f"link_{uuid.uuid4().hex[:12]}"
        believes_cypher = """
        MATCH (a:Actor {id: $founder_id})
        MATCH (n:Narrative {id: $narrative_id})
        CREATE (a)-[:link {
            id: $link_id,
            node_a: $founder_id,
            node_b: $narrative_id,
            type: 'believes',
            hierarchy: 0,
            permanence: 0.8,
            trust: 0.8,
            weight: 1.0,
            energy: 0.0,
            stability: 0.5,
            recency: 1.0,
            polarity: '[0.7, 0.3]',
            valence: 0.5,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(n)
        """
        self._adapter.execute(believes_cypher, {
            "link_id": believes_link_id,
            "founder_id": founder_id,
            "narrative_id": narrative_id,
            "now_s": now_s,
        })

        logger.info(
            f"[OrgManager] Created organization '{name}' "
            f"(narrative={narrative_id}, hall={hall_space_id}) "
            f"founded by {founder_id}"
        )

        return OrganizationInfo(
            narrative_id=narrative_id,
            hall_space_id=hall_space_id,
            founder_id=founder_id,
            name=name,
            mission=mission_statement,
        )

    def join_organization(
        self,
        actor_id: str,
        org_narrative_id: str,
        grantor_id: str,
    ) -> None:
        """
        Grant HAS_ACCESS (member) to hall Space + create BELIEVES link.

        Implements: B6 (Organization Membership).

        Args:
            actor_id: The Actor joining the organization.
            org_narrative_id: The Narrative node ID for the organization.
            grantor_id: An existing member with admin/owner role who approves.

        Raises:
            OrgError: If org not found, grantor lacks permission, or actor
                      already a member.
        """
        # Find the hall Space for this org
        hall_space_id = self._find_hall_space(org_narrative_id)
        if hall_space_id is None:
            raise OrgError(
                f"Organization {org_narrative_id} has no hall Space"
            )

        # Grant HAS_ACCESS (member) via AccessResolver
        # This validates grantor has admin/owner role
        try:
            self._access.grant_access(
                grantor_id=grantor_id,
                target_actor_id=actor_id,
                space_id=hall_space_id,
                role="member",
            )
        except AccessError as e:
            raise OrgError(f"Cannot join organization: {e}") from e

        # Check if BELIEVES link already exists
        existing = self._find_believes_link(actor_id, org_narrative_id)
        if existing:
            return  # Already believes

        # Create BELIEVES link
        now_s = int(time.time())
        link_id = f"link_{uuid.uuid4().hex[:12]}"
        believes_cypher = """
        MATCH (a:Actor {id: $actor_id})
        MATCH (n:Narrative {id: $narrative_id})
        CREATE (a)-[:link {
            id: $link_id,
            node_a: $actor_id,
            node_b: $narrative_id,
            type: 'believes',
            hierarchy: 0,
            permanence: 0.6,
            trust: 0.5,
            weight: 0.5,
            energy: 0.0,
            stability: 0.3,
            recency: 1.0,
            polarity: '[0.5, 0.5]',
            valence: 0.3,
            relation_kind: NULL,
            created_at_s: $now_s,
            updated_at_s: $now_s
        }]->(n)
        """
        self._adapter.execute(believes_cypher, {
            "link_id": link_id,
            "actor_id": actor_id,
            "narrative_id": org_narrative_id,
            "now_s": now_s,
        })

        logger.info(
            f"[OrgManager] Actor {actor_id} joined org {org_narrative_id} "
            f"(granted by {grantor_id})"
        )

    def compute_org_reputation(self, org_narrative_id: str) -> float:
        """
        ALG-8: Compute on-demand reputation for an organization Narrative.

        reputation = sum(link.trust * link.weight) / sum(link.weight)
        for all inbound links with trust > 0.

        Returns 0.0 if no qualifying links exist.
        """
        cypher = """
        MATCH ()-[r:link]->(n:Narrative {id: $narrative_id})
        WHERE r.trust IS NOT NULL AND r.trust > 0
        RETURN r.trust, r.weight
        """
        rows = self._adapter.query(cypher, {"narrative_id": org_narrative_id})

        if not rows:
            return 0.0

        weighted_trust_sum = 0.0
        weight_sum = 0.0

        for row in rows:
            trust = float(row[0]) if row[0] is not None else 0.0
            weight = float(row[1]) if row[1] is not None else 0.0
            if trust > 0 and weight > 0:
                weighted_trust_sum += trust * weight
                weight_sum += weight

        if weight_sum == 0.0:
            return 0.0

        return weighted_trust_sum / weight_sum

    def check_dissolution(self, org_narrative_id: str) -> bool:
        """
        Check if org should dissolve.

        All HAS_ACCESS links to hall Space below threshold AND
        all BELIEVES links below threshold.

        Returns True if dissolution conditions are met.
        """
        hall_space_id = self._find_hall_space(org_narrative_id)
        if hall_space_id is None:
            # No hall space means org is already effectively dissolved
            return True

        # Check HAS_ACCESS links to hall Space
        access_cypher = """
        MATCH (a:Actor)-[r:link]->(s:Space {id: $hall_space_id})
        WHERE r.type = 'has_access'
        RETURN r.weight
        """
        access_rows = self._adapter.query(
            access_cypher, {"hall_space_id": hall_space_id}
        )

        has_active_access = False
        for row in access_rows:
            weight = float(row[0]) if row[0] is not None else 0.0
            if weight >= DISSOLUTION_ACCESS_THRESHOLD:
                has_active_access = True
                break

        if has_active_access:
            return False

        # Check BELIEVES links to Narrative
        believes_cypher = """
        MATCH (a:Actor)-[r:link]->(n:Narrative {id: $narrative_id})
        WHERE r.type = 'believes'
        RETURN r.weight
        """
        believes_rows = self._adapter.query(
            believes_cypher, {"narrative_id": org_narrative_id}
        )

        for row in believes_rows:
            weight = float(row[0]) if row[0] is not None else 0.0
            if weight >= DISSOLUTION_BELIEVES_THRESHOLD:
                return False

        # All links below threshold -- dissolution
        return True

    def get_organization(self, org_narrative_id: str) -> Optional[OrganizationInfo]:
        """
        Retrieve organization info, or None if not found.
        """
        cypher = """
        MATCH (n:Narrative {id: $narrative_id})
        WHERE n.type = 'organization'
        RETURN n.id, n.name, n.content, n.synthesis
        """
        rows = self._adapter.query(cypher, {"narrative_id": org_narrative_id})
        if not rows:
            return None

        row = rows[0]
        narrative_id = row[0]
        name = row[1]

        # Parse content for founder and hall
        content = {}
        try:
            if row[2]:
                content = json.loads(row[2]) if isinstance(row[2], str) else row[2]
        except (json.JSONDecodeError, TypeError):
            pass

        hall_space_id = self._find_hall_space(narrative_id)
        founder_id = content.get("founder", "unknown")
        mission = content.get("mission", "")

        return OrganizationInfo(
            narrative_id=narrative_id,
            hall_space_id=hall_space_id or "",
            founder_id=founder_id,
            name=name,
            mission=mission,
        )

    # =========================================================================
    # INTERNAL HELPERS
    # =========================================================================

    def _find_hall_space(self, org_narrative_id: str) -> Optional[str]:
        """Find the hall Space linked from an organization Narrative."""
        cypher = """
        MATCH (n:Narrative {id: $narrative_id})-[r:link]->(s:Space)
        WHERE r.hierarchy = -1
          AND s.node_type = 'space'
        RETURN s.id
        LIMIT 1
        """
        rows = self._adapter.query(
            cypher, {"narrative_id": org_narrative_id}
        )
        if not rows:
            return None
        return rows[0][0]

    def _find_believes_link(
        self, actor_id: str, narrative_id: str
    ) -> bool:
        """Check if a BELIEVES link exists from actor to narrative."""
        cypher = """
        MATCH (a:Actor {id: $actor_id})-[r:link]->(n:Narrative {id: $narrative_id})
        WHERE r.type = 'believes'
        RETURN r.id
        LIMIT 1
        """
        rows = self._adapter.query(cypher, {
            "actor_id": actor_id,
            "narrative_id": narrative_id,
        })
        return len(rows) > 0


class OrgError(Exception):
    """Raised when an organization operation fails."""
    pass
