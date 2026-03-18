"""
Physics Constants

All constants for the graph physics engine.
Based on Schema v1.2 Energy Physics.

v1.2 CHANGES:
    - NO DECAY — energy flows through links, cooling handles lifecycle
    - Added COLD_THRESHOLD, TOP_N_LINKS for hot/cold filtering
    - Added LINK_DRAIN_RATE, LINK_TO_STRENGTH_RATE for link cooling
    - Added SUPPORT_THRESHOLD, CONTRADICT_THRESHOLD for moment interaction
    - Added REJECTION_RETURN_RATE

v1.1 CHANGES:
    - Added GENERATION_RATE, MOMENT_DRAW_RATE, FLOW_RATE
    - Added moment completion thresholds

TESTS:
    engine/tests/test_behaviors.py::TestEnergyFlow
    engine/tests/test_behaviors.py::TestWeightComputation
    engine/tests/test_behaviors.py::TestDecaySystem
    engine/tests/test_behaviors.py::TestCriticality
    engine/tests/test_behaviors.py::TestProximity
    engine/tests/test_spec_consistency.py::TestConstantsConsistency

VALIDATES:
    V4.2: Energy flow (BELIEF_FLOW_RATE, MAX_PROPAGATION_HOPS, LINK_FACTORS)
    V4.3: Weight computation (MIN_WEIGHT)
    V4.4: Decay system (DECAY_RATE, CORE_TYPES, CORE_DECAY_MULTIPLIER)
    V4.6: Criticality (CRITICALITY_TARGET_*, distance_to_proximity)

SEE ALSO:
    docs/physics/algorithms/ALGORITHM_Physics_Schema_v1.1_Energy_Physics.md
    docs/engine/VALIDATION_Complete_Spec.md
"""

# =============================================================================
# ENERGY FLOW
# =============================================================================

# Rate at which characters pump energy into narratives they believe
BELIEF_FLOW_RATE = 0.1

# Maximum hops for energy propagation between narratives
MAX_PROPAGATION_HOPS = 3

# Link-type propagation factors (how energy flows between narratives)
LINK_FACTORS = {
    'contradicts': 0.30,  # Both heat up
    'supports': 0.20,     # Flows one way
    'elaborates': 0.15,   # Detail flows to general
    'subsumes': 0.10,     # Specific to general
    'supersedes': 0.25,   # Drains source by 50% of transfer
}

# =============================================================================
# DECAY
# =============================================================================

# Base decay rate per tick (dynamic, adjusted for criticality)
DECAY_RATE = 0.02

# Decay rate bounds
DECAY_RATE_MIN = 0.005
DECAY_RATE_MAX = 0.1

# Minimum weight (narratives never decay to zero)
MIN_WEIGHT = 0.01

# Core narrative types that decay slower (0.25x rate)
CORE_TYPES = ['oath', 'blood', 'debt']
CORE_DECAY_MULTIPLIER = 0.25

# =============================================================================
# PRESSURE
# =============================================================================

# Base pressure accumulation rate (per minute)
BASE_PRESSURE_RATE = 0.001

# Default breaking point
DEFAULT_BREAKING_POINT = 0.9

# Maximum cascade depth (prevent infinite loops)
MAX_CASCADE_DEPTH = 5

# =============================================================================
# CRITICALITY
# =============================================================================

# Target average pressure range
CRITICALITY_TARGET_MIN = 0.4
CRITICALITY_TARGET_MAX = 0.6

# At least one narrative should be "hot"
CRITICALITY_HOT_THRESHOLD = 0.7

# =============================================================================
# PROXIMITY
# =============================================================================

# Distance-to-proximity conversion
# Same location = 1.0, 1 day = 0.5, 2 days = 0.25, 3+ days = 0.05
def distance_to_proximity(days: float) -> float:
    """Convert travel days to proximity factor."""
    if days <= 0:
        return 1.0
    elif days <= 1:
        return 0.5
    elif days <= 2:
        return 0.25
    else:
        return 0.05

# =============================================================================
# TICK
# =============================================================================

# Minimum time elapsed to trigger a tick
MIN_TICK_MINUTES = 5

# Tick interval in minutes (for scheduled pressure)
TICK_INTERVAL_MINUTES = 5

# =============================================================================
# SCHEMA v1.2 — ENERGY PHYSICS (NO DECAY)
# =============================================================================

# --- Generation Phase ---
# Rate at which actors generate energy per tick (proximity-gated)
GENERATION_RATE = 0.5

# --- Moment Draw Phase ---
# Rate at which moments draw energy from connected actors
# Both POSSIBLE and ACTIVE draw (POSSIBLE at reduced effective rate via formula)
DRAW_RATE = 0.3

# --- Backflow Phase ---
# Rate at which narratives backflow to connected actors
BACKFLOW_RATE = 0.1

# Unified flow formula: flow = source.energy × rate × weight
# received = flow × sqrt(target.weight)

# --- Hot/Cold Link Filter (v1.2) ---
# Links below this threshold are "cold" and excluded from physics
COLD_THRESHOLD = 0.01

# Maximum links to process per node (top-N by energy × weight)
TOP_N_LINKS = 20

# --- Link Cooling (v1.2, replaces decay) ---
# Percentage of link energy that drains to connected nodes per tick
LINK_DRAIN_RATE = 0.3

# Percentage of link energy that converts to permanent weight per tick
LINK_TO_WEIGHT_RATE = 0.1

# --- Moment Interaction (v1.2) ---
# Threshold for support (>0.7 = support)
SUPPORT_THRESHOLD = 0.7

# Threshold for contradict (<0.3 = contradict)
CONTRADICT_THRESHOLD = 0.3

# Rate of support/contradict energy transfer
INTERACTION_RATE = 0.05

# --- Rejection ---
# Percentage of moment energy returned to player on rejection
REJECTION_RETURN_RATE = 0.8

# --- Tick Timing ---
# Tick duration in seconds
TICK_DURATION_SECONDS = 5

# Ticks per minute (for radiation rate calculation)
TICKS_PER_MINUTE = 12


# --- Link Crystallization ---
# Initial weight for crystallized links (controls flow rate)
CRYSTALLIZATION_WEIGHT = 0.2

# --- Path Resistance ---
# Maximum hops for path finding (Dijkstra)
MAX_PATH_HOPS = 5

# Default resistance for blocked paths
BLOCKED_PATH_RESISTANCE = 100.0

# Resistance formula: resistance = 1 / (weight)
# If weight is 0, resistance is BLOCKED_PATH_RESISTANCE


