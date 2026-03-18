"""
L3-Specific Physics Parameters

Constants for the Universe Graph (L3 scope).
All rates, thresholds, and intervals that differ from L1 defaults.

These parameters govern:
- Energy propagation and decay at universe scale
- Macro-crystallization thresholds
- Access link defaults
- Space hierarchy limits

DOCS: docs/universe/ALGORITHM_Universe_Graph.md (ALG-3, ALG-6)
"""

# =============================================================================
# ENERGY MODEL (ALG-6)
# =============================================================================

# L3 propagation threshold -- node must exceed this energy to propagate
L3_PROPAGATION_THRESHOLD: float = 1.0

# L3 decay rate per tick (slower than L1's 0.02)
L3_DECAY_RATE: float = 0.01

# L3 recency decay per tick
L3_RECENCY_DECAY: float = 0.005

# Energy split ratios when injecting energy from L1 actions
L3_ENERGY_SPLIT_SPACE: float = 0.6    # 60% to the Space
L3_ENERGY_SPLIT_ACTOR: float = 0.3    # 30% to the Actor
L3_ENERGY_SPLIT_RELATED: float = 0.1  # 10% to linked Things/Narratives

# Consolidation alpha (Law 6)
L3_CONSOLIDATION_ALPHA: float = 0.1

# =============================================================================
# MACRO-CRYSTALLIZATION (ALG-3)
# =============================================================================

# Minimum cluster size to consider for crystallization
L3_CRYSTALLIZATION_MIN_SIZE: int = 50

# Minimum density (internal_links / max_possible) for crystallization
L3_CRYSTALLIZATION_DENSITY: float = 0.15

# Minimum average co-activation weight for crystallization
L3_CRYSTALLIZATION_WEIGHT: float = 3.0

# How often to check for crystallization (in ticks)
L3_CRYSTALLIZATION_CHECK_INTERVAL: int = 500

# Damping factor: hub weight = sum(constituent weights) * DAMPING
L3_CRYSTALLIZATION_DAMPING_FACTOR: float = 0.7

# =============================================================================
# SPACE HIERARCHY
# =============================================================================

# Maximum depth for sub-Space traversal (prevents runaway queries)
SPACE_HIERARCHY_MAX_DEPTH: int = 10

# =============================================================================
# HAS_ACCESS LINK DEFAULTS
# =============================================================================

# Default link properties for HAS_ACCESS links
HAS_ACCESS_OWNER_HIERARCHY: float = -1.0    # Owner contains the Space
HAS_ACCESS_OWNER_PERMANENCE: float = 1.0    # Ownership is permanent
HAS_ACCESS_OWNER_TRUST: float = 1.0         # Full trust

HAS_ACCESS_MEMBER_HIERARCHY: float = 0.0    # Member, not owner
HAS_ACCESS_MEMBER_PERMANENCE: float = 0.7   # Can decay if unused
HAS_ACCESS_MEMBER_TRUST: float = 0.3        # Initial trust, grows via L5/L6

HAS_ACCESS_ADMIN_HIERARCHY: float = 0.0
HAS_ACCESS_ADMIN_PERMANENCE: float = 0.9
HAS_ACCESS_ADMIN_TRUST: float = 0.7

# =============================================================================
# CONTAINMENT LINK DEFAULTS
# =============================================================================

CONTAINMENT_HIERARCHY: float = -1.0       # Parent contains child
CONTAINMENT_PERMANENCE: float = 0.9
CONTAINMENT_DEFAULT_WEIGHT: float = 1.0

# =============================================================================
# ROLE HIERARCHY
# =============================================================================

# Role ordering for permission checks (higher index = more power)
ROLE_HIERARCHY = {
    "member": 0,
    "admin": 1,
    "owner": 2,
}

VALID_ROLES = frozenset(ROLE_HIERARCHY.keys())
