"""
Universe Graph Module

Implements the L3 universe graph: Spaces, HAS_ACCESS resolution,
organizations (Narratives), moment perception routing, and universe bootstrap.

Architecture:
- SpaceManager: Space CRUD, containment hierarchy (ALG-4)
- AccessResolver: HAS_ACCESS resolution with hierarchy inheritance (ALG-1)
- OrgManager: Organization lifecycle as Narrative + hall Space (ALG-7)
- MomentPerceptionRouter: Route moments to accessing actors (ALG-5)
- UniverseBootstrap: Universe initialization and migration

All classes depend on DatabaseAdapter (runtime/infrastructure/database/).
No direct database calls -- everything goes through the adapter.

DOCS: docs/universe/IMPLEMENTATION_Universe_Graph.md
"""

from .space_and_hierarchy_manager import (
    SpaceManager,
    SpaceChild,
    SpaceInfo,
    SpaceError,
)
from .access_resolution_and_link_manager import (
    AccessResolver,
    AccessResult,
    SpaceMember,
    ActorSpace,
    AccessError,
)
from .organization_lifecycle_manager import (
    OrgManager,
    OrganizationInfo,
    OrgError,
)
from .moment_perception_router import (
    MomentPerceptionRouter,
)
from .universe_bootstrap_and_metadata import (
    UniverseBootstrap,
    UniverseMetadata,
    BootstrapError,
)
from .constants_l3_physics import (
    L3_PROPAGATION_THRESHOLD,
    L3_DECAY_RATE,
    L3_RECENCY_DECAY,
    L3_CRYSTALLIZATION_MIN_SIZE,
    L3_CRYSTALLIZATION_DENSITY,
    L3_CRYSTALLIZATION_WEIGHT,
    L3_CRYSTALLIZATION_CHECK_INTERVAL,
    L3_CRYSTALLIZATION_DAMPING_FACTOR,
    SPACE_HIERARCHY_MAX_DEPTH,
    ROLE_HIERARCHY,
    VALID_ROLES,
)

__all__ = [
    # Space management
    "SpaceManager",
    "SpaceChild",
    "SpaceInfo",
    "SpaceError",
    # Access resolution
    "AccessResolver",
    "AccessResult",
    "SpaceMember",
    "ActorSpace",
    "AccessError",
    # Organization management
    "OrgManager",
    "OrganizationInfo",
    "OrgError",
    # Moment perception
    "MomentPerceptionRouter",
    # Universe bootstrap
    "UniverseBootstrap",
    "UniverseMetadata",
    "BootstrapError",
    # Constants
    "L3_PROPAGATION_THRESHOLD",
    "L3_DECAY_RATE",
    "L3_RECENCY_DECAY",
    "L3_CRYSTALLIZATION_MIN_SIZE",
    "L3_CRYSTALLIZATION_DENSITY",
    "L3_CRYSTALLIZATION_WEIGHT",
    "L3_CRYSTALLIZATION_CHECK_INTERVAL",
    "L3_CRYSTALLIZATION_DAMPING_FACTOR",
    "SPACE_HIERARCHY_MAX_DEPTH",
    "ROLE_HIERARCHY",
    "VALID_ROLES",
]
