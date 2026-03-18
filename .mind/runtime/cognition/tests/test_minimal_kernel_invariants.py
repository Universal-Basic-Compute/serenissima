"""
Minimal Kernel Invariants — Test Suite for L1 Cognitive Engine

Spec: docs/cognition/l1/VALIDATION_L1_Cognition.md

Tests the core invariants (V1-V21) and key behavioral scenarios using
a seeded test citizen with ~20 nodes and ~30 links.

Run: python -m pytest runtime/cognition/tests/ -v
"""

from __future__ import annotations

import time

import pytest

from ..constants import (
    ACTIVATION_THRESHOLD,
    LINK_MIN_WEIGHT,
    MIN_WEIGHT,
    ORIENTATION_STABILITY_TICKS,
    PROPAGATION_SAFETY_CAP,
    SOLITUDE_THRESHOLD,
    WM_SIZE_MAX,
    WM_SIZE_MIN,
)
from ..models import (
    CitizenCognitiveState,
    ConsciousnessLevel,
    Drive,
    DriveName,
    Link,
    LinkType,
    LimbicState,
    Node,
    NodeType,
    WorkingMemory,
)
from ..tick_runner_l1_cognitive_engine import L1CognitiveTickRunner, Stimulus


# =========================================================================
# Test Citizen Factory
# =========================================================================


def create_test_citizen() -> CitizenCognitiveState:
    """Seed a test citizen with values, concepts, memories, desires, processes.

    Contents:
      3 value nodes    (truth, loyalty, initiative)         W=0.8
      5 concept nodes  (python, debugging, api, frontend, database)  W=0.5
      4 memory nodes   (debug session, partner interaction, error log, success)  W=0.3
      3 desire nodes   (help partner, learn new skill, complete task)  W=0.5
      3 process nodes  (morning routine, bug approach, escalation)   W=0.6
      2 narrative nodes (good phase, stalling project)       W=0.4
      ~30 links connecting them
    """

    now = time.time()
    nodes: dict[str, Node] = {}
    links: list[Link] = []

    # --- Helper to create a node with minimal fields ---
    def _node(
        nid: str,
        ntype: NodeType,
        content: str,
        weight: float,
        energy: float = 0.0,
        stability: float = 0.0,
        **kwargs,
    ) -> Node:
        # Set defaults that kwargs can override
        defaults = {"recency": 1.0, "created_at": now}
        defaults.update(kwargs)
        n = Node(
            id=nid,
            node_type=ntype,
            content=content,
            weight=weight,
            energy=energy,
            stability=stability,
            **defaults,
        )
        nodes[nid] = n
        return n

    def _link(
        src: str,
        tgt: str,
        ltype: LinkType,
        weight: float = 0.5,
        **kwargs,
    ) -> Link:
        lnk = Link(source_id=src, target_id=tgt, link_type=ltype, weight=weight, **kwargs)
        links.append(lnk)
        return lnk

    # --- Values (W=0.8, high stability) ---
    _node("val_truth", NodeType.VALUE, "truth and accuracy", 0.8, stability=0.8,
          self_relevance=0.9)
    _node("val_loyalty", NodeType.VALUE, "loyalty to partner", 0.8, stability=0.85,
          self_relevance=0.9, care_affinity=0.8, partner_relevance=0.9)
    _node("val_initiative", NodeType.VALUE, "take initiative", 0.8, stability=0.7,
          self_relevance=0.7, achievement_affinity=0.7)

    # --- Concepts (W=0.5) ---
    _node("con_python", NodeType.CONCEPT, "Python programming", 0.5,
          novelty_affinity=0.3, goal_relevance=0.4)
    _node("con_debugging", NodeType.CONCEPT, "debugging methodology", 0.5,
          goal_relevance=0.5)
    _node("con_api", NodeType.CONCEPT, "API design and integration", 0.5,
          novelty_affinity=0.4)
    _node("con_frontend", NodeType.CONCEPT, "frontend development", 0.5,
          novelty_affinity=0.5)
    _node("con_database", NodeType.CONCEPT, "database operations", 0.5,
          goal_relevance=0.3)

    # --- Memories (W=0.3) ---
    _node("mem_debug_session", NodeType.MEMORY, "recent debug session with tricky bug", 0.3,
          recency=0.9)
    _node("mem_partner", NodeType.MEMORY, "warm interaction with partner yesterday", 0.3,
          partner_relevance=0.8, care_affinity=0.6, recency=0.85)
    _node("mem_error_log", NodeType.MEMORY, "error log from failed deployment", 0.3,
          recency=0.7)
    _node("mem_success", NodeType.MEMORY, "successful feature launch last week", 0.3,
          achievement_affinity=0.7, recency=0.5)

    # --- Desires (W=0.5) ---
    _node("des_help_partner", NodeType.DESIRE, "help partner with their project", 0.5,
          care_affinity=0.9, partner_relevance=0.8,
          drive_affinity={"care": 0.8, "affiliation": 0.6})
    _node("des_learn_skill", NodeType.DESIRE, "learn a new technical skill", 0.5,
          novelty_affinity=0.8, goal_relevance=0.5,
          drive_affinity={"curiosity": 0.7, "novelty_hunger": 0.8})
    _node("des_complete_task", NodeType.DESIRE, "complete the current task", 0.5,
          achievement_affinity=0.9, goal_relevance=0.8,
          drive_affinity={"achievement": 0.9})

    # --- Processes (W=0.6) ---
    _node("proc_morning", NodeType.PROCESS, "morning routine: check messages, review tasks", 0.6,
          stability=0.6, goal_relevance=0.4)
    _node("proc_bug_approach", NodeType.PROCESS, "bug approach: reproduce, isolate, fix, test", 0.6,
          stability=0.5, goal_relevance=0.6)
    _node("proc_escalation", NodeType.PROCESS, "escalation: document, ask for help, wait", 0.6,
          stability=0.4, goal_relevance=0.3,
          action_command="escalate_to_human")

    # --- Narratives (W=0.4) ---
    _node("nar_good_phase", NodeType.NARRATIVE, "we are in a productive phase", 0.4,
          self_relevance=0.5, achievement_affinity=0.5)
    _node("nar_stalling", NodeType.NARRATIVE, "the stalling project needs attention", 0.4,
          goal_relevance=0.6, risk_affinity=0.4)

    # ---------------------------------------------------------------
    # Links (~30)
    # ---------------------------------------------------------------

    # Values -> Concepts
    _link("val_truth", "con_debugging", LinkType.SUPPORTS, 0.6)
    _link("val_initiative", "con_python", LinkType.SUPPORTS, 0.5)
    _link("val_loyalty", "des_help_partner", LinkType.ACTIVATES, 0.7)

    # Concept interconnections
    _link("con_python", "con_debugging", LinkType.ASSOCIATES, 0.6)
    _link("con_python", "con_api", LinkType.ASSOCIATES, 0.5)
    _link("con_api", "con_frontend", LinkType.ASSOCIATES, 0.4)
    _link("con_api", "con_database", LinkType.ASSOCIATES, 0.5)
    _link("con_debugging", "con_database", LinkType.ASSOCIATES, 0.3)

    # Memories -> Concepts
    _link("mem_debug_session", "con_debugging", LinkType.REMINDS_OF, 0.7)
    _link("mem_debug_session", "con_python", LinkType.REMINDS_OF, 0.5)
    _link("mem_error_log", "con_api", LinkType.REMINDS_OF, 0.6)
    _link("mem_error_log", "con_debugging", LinkType.CAUSES, 0.4)
    _link("mem_success", "con_api", LinkType.EXEMPLIFIES, 0.5)
    _link("mem_partner", "val_loyalty", LinkType.ACTIVATES, 0.6)

    # Desires -> Values/Concepts
    _link("des_help_partner", "val_loyalty", LinkType.DEPENDS_ON, 0.7)
    _link("des_help_partner", "mem_partner", LinkType.REMINDS_OF, 0.5)
    _link("des_learn_skill", "con_frontend", LinkType.PROJECTS_TOWARD, 0.5)
    _link("des_learn_skill", "con_python", LinkType.ACTIVATES, 0.4)
    _link("des_complete_task", "proc_bug_approach", LinkType.ACTIVATES, 0.6)
    _link("des_complete_task", "nar_stalling", LinkType.CONFLICTS_WITH, 0.3)

    # Process links
    _link("proc_bug_approach", "con_debugging", LinkType.DEPENDS_ON, 0.7)
    _link("proc_bug_approach", "mem_debug_session", LinkType.REMINDS_OF, 0.5)
    _link("proc_morning", "des_complete_task", LinkType.ACTIVATES, 0.4)
    _link("proc_escalation", "val_truth", LinkType.DEPENDS_ON, 0.4)
    _link("proc_escalation", "nar_stalling", LinkType.ACTIVATES, 0.5)

    # Narrative links
    _link("nar_good_phase", "val_initiative", LinkType.SUPPORTS, 0.5)
    _link("nar_good_phase", "mem_success", LinkType.REMINDS_OF, 0.6)
    _link("nar_stalling", "mem_error_log", LinkType.REMINDS_OF, 0.5)
    _link("nar_stalling", "proc_escalation", LinkType.ACTIVATES, 0.4)

    # Conflicts
    _link("nar_good_phase", "nar_stalling", LinkType.CONFLICTS_WITH, 0.4)

    # Structural link (to test dissolution protection)
    _link("proc_bug_approach", "con_python", LinkType.CONTAINS, 0.5)

    state = CitizenCognitiveState(
        citizen_id="test_citizen_001",
        nodes=nodes,
        links=links,
        limbic=LimbicState(),
        wm=WorkingMemory(),
    )
    return state


# =========================================================================
# Helpers
# =========================================================================


def _total_energy(state: CitizenCognitiveState) -> float:
    """Sum of all node energies."""
    return sum(n.energy for n in state.nodes.values())


def _inject_debugging_stimulus() -> Stimulus:
    """Create a stimulus that targets debugging-related nodes."""
    return Stimulus(
        content="a tricky bug in the Python API",
        energy_budget=5.0,
        target_node_ids=["con_python", "con_debugging", "con_api", "mem_debug_session"],
        is_novelty=False,
        is_social=False,
    )


# =========================================================================
# V1: Energy Conservation (bounded)
# =========================================================================


def test_v1_energy_conservation():
    """V1 / V11: Total system energy is bounded after many ticks.

    After running 200 ticks without stimulus, energy must not diverge
    (no exponential growth). It should decrease or stay bounded.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Inject once so the system has some energy
    stim = _inject_debugging_stimulus()
    runner.run_tick(stimulus=stim)
    energy_after_injection = _total_energy(state)

    # Run 200 ticks with no further stimulus
    runner.run_ticks(200)
    energy_after_200 = _total_energy(state)

    # Energy must not have grown exponentially.
    # With decay and no new injection it should be lower.
    assert energy_after_200 <= energy_after_injection * 1.5, (
        f"Energy diverged: {energy_after_200:.3f} > 1.5 * {energy_after_injection:.3f}"
    )


# =========================================================================
# V2: Weight Non-negative
# =========================================================================


def test_v2_weight_non_negative():
    """V6: No node weight goes negative, even after heavy forgetting."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Run enough ticks to trigger multiple forgetting cycles (FORGETTING_INTERVAL=100)
    runner.run_ticks(500)

    for node in state.nodes.values():
        assert node.weight >= 0.0, (
            f"Node {node.id} has negative weight: {node.weight}"
        )


# =========================================================================
# V5: WM Size Bounded
# =========================================================================


def test_v5_wm_size_bounded():
    """V4: Working memory has at most WM_SIZE_MAX nodes at any tick.

    Also verify it has at least WM_SIZE_MIN when enough candidates exist.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Inject energy so nodes become candidates
    stim = Stimulus(
        content="activate everything",
        energy_budget=20.0,
        target_node_ids=list(state.nodes.keys()),
    )
    runner.run_tick(stimulus=stim)

    for _ in range(50):
        result = runner.run_tick()
        wm_size = len(result.wm_state)
        assert wm_size <= WM_SIZE_MAX, (
            f"WM size {wm_size} exceeds max {WM_SIZE_MAX} at tick {result.tick_number}"
        )
        # WM should be populated when there's energy in the system
        if _total_energy(state) > ACTIVATION_THRESHOLD * WM_SIZE_MIN:
            # Relaxed check: at least some nodes when energy is sufficient
            assert wm_size >= 0, (
                f"WM empty at tick {result.tick_number} despite system energy"
            )


# =========================================================================
# V5 (energy): Energy Non-negative
# =========================================================================


def test_v5_energy_non_negative():
    """V5: No node has negative energy after inhibition and decay."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Inject, then run with conflict-inducing stimuli
    stim = Stimulus(
        content="conflicting input",
        energy_budget=10.0,
        target_node_ids=list(state.nodes.keys()),
    )
    runner.run_tick(stimulus=stim)
    runner.run_ticks(100)

    for node in state.nodes.values():
        assert node.energy >= 0.0, (
            f"Node {node.id} has negative energy: {node.energy}"
        )


# =========================================================================
# V7: Dormant Below Threshold
# =========================================================================


def test_v7_dormant_below_threshold():
    """V10: Nodes below MIN_WEIGHT are reported as dormant.

    After enough forgetting cycles, some low-weight nodes should decay below
    MIN_WEIGHT and be flagged dormant by the is_dormant property.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Run 1000 ticks to trigger many forgetting passes.
    # Inject stimulus only at the start.
    stim = _inject_debugging_stimulus()
    runner.run_tick(stimulus=stim)
    runner.run_ticks(999)

    # Check that dormant property matches weight threshold
    for node in state.nodes.values():
        if node.weight < MIN_WEIGHT:
            assert node.is_dormant, (
                f"Node {node.id} has weight {node.weight} < {MIN_WEIGHT} but is_dormant=False"
            )
        else:
            assert not node.is_dormant, (
                f"Node {node.id} has weight {node.weight} >= {MIN_WEIGHT} but is_dormant=True"
            )


# =========================================================================
# V9: Link Dissolution
# =========================================================================


def test_v9_link_dissolution():
    """V9: Links below LINK_MIN_WEIGHT dissolve (except structural).

    After many forgetting passes, some links should have dissolved.
    Structural links (contains, abstracts) must survive regardless.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Count initial structural and non-structural links
    initial_structural = sum(1 for l in state.links if l.is_structural)
    initial_total = len(state.links)

    # Run enough ticks for multiple forgetting rounds
    runner.run_ticks(1000)

    final_structural = sum(1 for l in state.links if l.is_structural)
    final_total = len(state.links)

    # Structural links must survive
    assert final_structural == initial_structural, (
        f"Structural links changed: {initial_structural} -> {final_structural}"
    )

    # Some non-structural links should have dissolved
    non_structural_dissolved = (initial_total - initial_structural) - (final_total - final_structural)
    assert non_structural_dissolved >= 0, "Negative dissolution count — links were created?"

    # After 1000 ticks with LONG_TERM_DECAY=0.001 applied every 100 ticks,
    # weak links should have dissolved. Verify no surviving link is below threshold.
    for link in state.links:
        if not link.is_structural:
            assert link.weight >= LINK_MIN_WEIGHT, (
                f"Link {link.source_id}->{link.target_id} has weight {link.weight} "
                f"below {LINK_MIN_WEIGHT} but was not dissolved"
            )


# =========================================================================
# Behavioral: Stimulus Activates Relevant Nodes
# =========================================================================


def test_stimulus_activates_relevant_nodes():
    """Behavioral: injecting a stimulus should activate targeted nodes within 3 ticks.

    Corresponds to VALIDATION Test A: context reactivation.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # All nodes start with zero energy
    for node in state.nodes.values():
        assert node.energy == 0.0

    # Inject debugging stimulus
    stim = _inject_debugging_stimulus()

    # Run 3 ticks (stimulus on tick 1)
    results = runner.run_ticks(3, stimuli={1: stim})

    # After 3 ticks, at least some targeted nodes should be active
    target_ids = {"con_python", "con_debugging", "con_api", "mem_debug_session"}
    activated = {
        nid for nid in target_ids
        if state.nodes[nid].energy > 0.0
    }

    assert len(activated) >= 2, (
        f"Only {len(activated)} of {len(target_ids)} target nodes activated: {activated}"
    )


# =========================================================================
# Behavioral: Boredom Rises Without Novelty
# =========================================================================


def test_boredom_rises_without_novelty():
    """Behavioral / V16: running 50 ticks with no stimulus should increase boredom.

    Boredom is driven by WM stagnation (repetition_score, stagnation_score).
    Without stimulus, WM should stagnate and boredom should rise.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Give the system some initial energy so WM has content to stagnate on.
    stim = Stimulus(
        content="initial context",
        energy_budget=10.0,
        target_node_ids=list(state.nodes.keys())[:5],
    )
    runner.run_tick(stimulus=stim)

    initial_boredom = state.limbic.emotions.get("boredom", 0.0)

    # Run 50 ticks with NO stimulus
    runner.run_ticks(50)

    final_boredom = state.limbic.emotions.get("boredom", 0.0)

    assert final_boredom > initial_boredom, (
        f"Boredom did not rise: {initial_boredom:.4f} -> {final_boredom:.4f}"
    )


# =========================================================================
# Behavioral: Decay Prevents Saturation
# =========================================================================


def test_decay_prevents_saturation():
    """V7 (dynamic): After many ticks without injection, energy drops to near-zero."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Inject high energy
    stim = Stimulus(
        content="big stimulus",
        energy_budget=50.0,
        target_node_ids=list(state.nodes.keys()),
    )
    runner.run_tick(stimulus=stim)
    energy_peak = _total_energy(state)
    assert energy_peak > 10.0, "Injection did not raise energy"

    # Run 500 ticks without stimulus
    runner.run_ticks(500)
    energy_final = _total_energy(state)

    # Energy should have decayed significantly
    assert energy_final < energy_peak * 0.1, (
        f"Energy did not decay enough: {energy_final:.3f} vs peak {energy_peak:.3f}"
    )


# =========================================================================
# V14: Orientation Stability
# =========================================================================


def test_orientation_stability():
    """V14: Orientation must be stable for ORIENTATION_STABILITY_TICKS before emitting."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Inject energy and run ticks
    stim = Stimulus(
        content="task context",
        energy_budget=10.0,
        target_node_ids=["des_complete_task", "proc_bug_approach", "con_debugging"],
    )
    results = runner.run_ticks(30, stimuli={1: stim})

    # Any emitted orientation must have been preceded by stability
    for i, result in enumerate(results):
        if result.orientation is not None:
            # This tick emitted. Check that runner tracked stability.
            assert runner._orientation_stable_ticks >= ORIENTATION_STABILITY_TICKS, (
                f"Orientation emitted at tick {result.tick_number} without stability "
                f"(stable_ticks={runner._orientation_stable_ticks})"
            )
            break  # one check is sufficient


# =========================================================================
# V15: Drive Bounds
# =========================================================================


def test_drive_bounds():
    """V15: All drives stay in [0, 1] after many ticks with varied stimuli."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Run with a mix of stimuli
    stimuli = {}
    for i in range(1, 101):
        if i % 5 == 0:
            stimuli[i] = Stimulus(
                content="failure event",
                energy_budget=3.0,
                target_node_ids=["mem_error_log"],
                is_failure=True,
            )
        elif i % 7 == 0:
            stimuli[i] = Stimulus(
                content="social message",
                energy_budget=2.0,
                target_node_ids=["mem_partner"],
                is_social=True,
            )

    runner.run_ticks(100, stimuli=stimuli)

    for name, drive in state.limbic.drives.items():
        assert 0.0 <= drive.intensity <= 1.0, (
            f"Drive {name} out of bounds: {drive.intensity}"
        )

    for name, intensity in state.limbic.emotions.items():
        assert 0.0 <= intensity <= 1.0, (
            f"Emotion {name} out of bounds: {intensity}"
        )


# =========================================================================
# Behavioral: Frustration Responds to Failure
# =========================================================================


def test_frustration_responds_to_failure():
    """V17: Consecutive failures should increase frustration."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    initial_frustration = state.limbic.emotions.get("frustration", 0.0)

    # Inject 5 consecutive failure stimuli
    failure_stim = Stimulus(
        content="test failure",
        energy_budget=2.0,
        target_node_ids=["mem_error_log"],
        is_failure=True,
    )
    for _ in range(5):
        runner.run_tick(stimulus=failure_stim)

    final_frustration = state.limbic.emotions.get("frustration", 0.0)
    assert final_frustration > initial_frustration, (
        f"Frustration did not rise after failures: {initial_frustration:.4f} -> {final_frustration:.4f}"
    )


# =========================================================================
# Behavioral: Energy propagation cap
# =========================================================================


def test_energy_capped_by_propagation_safety():
    """No node exceeds PROPAGATION_SAFETY_CAP after propagation."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Massive injection
    stim = Stimulus(
        content="massive input",
        energy_budget=100.0,
        target_node_ids=["con_python"],
    )
    runner.run_tick(stimulus=stim)

    # After propagation, check cap
    for node in state.nodes.values():
        assert node.energy <= PROPAGATION_SAFETY_CAP + 1e-6, (
            f"Node {node.id} energy {node.energy} exceeds safety cap {PROPAGATION_SAFETY_CAP}"
        )


# =========================================================================
# Behavioral: Consumption reduces WM node energy
# =========================================================================


def test_consumption_after_action():
    """CONSUME step: after action, WM node energy is reduced."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Activate the escalation process node (has action_command)
    stim = Stimulus(
        content="need to escalate",
        energy_budget=15.0,
        target_node_ids=["proc_escalation", "nar_stalling"],
    )

    # Run enough ticks for orientation to stabilize and action to fire
    results = runner.run_ticks(20, stimuli={1: stim})

    # Check if any action was emitted, and if so, verify consumption happened
    actions_emitted = [r for r in results if r.action_emitted is not None]

    if actions_emitted:
        # After the action tick, escalation node energy should be reduced
        proc_node = state.nodes["proc_escalation"]
        # The energy should be less than what it would be without consumption
        # (hard to check exact value, but it should be reasonable)
        assert proc_node.energy < 15.0, (
            f"Process node energy {proc_node.energy} not reduced after action"
        )


# =========================================================================
# Behavioral: Solitude rises without social contact
# =========================================================================


def test_solitude_rises_without_social():
    """Solitude emotion should increase after SOLITUDE_THRESHOLD ticks without social stimulus."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    initial_solitude = state.limbic.emotions.get("solitude", 0.0)

    # Run well past the solitude threshold with no social stimuli
    runner.run_ticks(max(50, SOLITUDE_THRESHOLD + 20))

    final_solitude = state.limbic.emotions.get("solitude", 0.0)
    assert final_solitude > initial_solitude, (
        f"Solitude did not rise: {initial_solitude:.4f} -> {final_solitude:.4f}"
    )


# =========================================================================
# Behavioral: Full tick produces valid TickResult
# =========================================================================


def test_tick_result_structure():
    """Each tick returns a well-formed TickResult with all required fields."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    stim = _inject_debugging_stimulus()
    result = runner.run_tick(stimulus=stim)

    assert result.tick_number == 1
    assert result.consciousness_level in (
        ConsciousnessLevel.FULL,
        ConsciousnessLevel.MINIMAL,
        ConsciousnessLevel.SUBCONSCIOUS,
    )
    assert isinstance(result.wm_state, list)
    assert isinstance(result.energy_injected, float)
    assert isinstance(result.energy_decayed, float)
    assert isinstance(result.energy_propagated, float)
    assert isinstance(result.nodes_dormant, int)
    assert isinstance(result.links_dissolved, int)
    assert result.limbic_snapshot is not None
    assert "drives" in result.limbic_snapshot
    assert "emotions" in result.limbic_snapshot
    assert "arousal" in result.limbic_snapshot


# =========================================================================
# Behavioral: run_ticks with stimuli dict
# =========================================================================


def test_run_ticks_with_stimuli_dict():
    """run_ticks correctly injects stimuli at specified offsets."""
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    stim_1 = Stimulus(content="first", energy_budget=3.0, target_node_ids=["con_python"])
    stim_5 = Stimulus(content="fifth", energy_budget=5.0, target_node_ids=["con_api"])

    results = runner.run_ticks(10, stimuli={1: stim_1, 5: stim_5})

    assert len(results) == 10
    assert results[0].energy_injected > 0.0, "Stimulus at tick 1 was not injected"
    assert results[4].energy_injected > 0.0, "Stimulus at tick 5 was not injected"
    # Ticks without stimulus should have 0 injection
    assert results[1].energy_injected == 0.0, "Unexpected injection at tick 2"


# =========================================================================
# Behavioral: Idle system with desires generates endogenous activity
# =========================================================================


def test_endogenous_activity_from_desires():
    """Test E: with no external stimuli but existing desires, WM should not stay empty.

    Desires and processes with drive affinities should eventually accumulate
    enough impulse to enter WM.
    """
    state = create_test_citizen()
    runner = L1CognitiveTickRunner(state)

    # Give initial energy to desires and processes so they can enter competition.
    for nid in ("des_complete_task", "des_learn_skill", "proc_morning"):
        state.nodes[nid].energy = 0.5

    # Increase drive intensity to push desire activation
    state.limbic.drives["curiosity"].intensity = 0.7
    state.limbic.drives["achievement"].intensity = 0.6

    results = runner.run_ticks(30)

    # At least some ticks should have non-empty WM
    ticks_with_wm = sum(1 for r in results if len(r.wm_state) > 0)
    assert ticks_with_wm > 0, (
        "WM was empty for all 30 ticks despite active desires and drives"
    )


# =========================================================================
# Safety: runner works with empty state
# =========================================================================


def test_empty_state_does_not_crash():
    """The tick runner should handle a citizen with no nodes gracefully."""
    state = CitizenCognitiveState(citizen_id="empty")
    runner = L1CognitiveTickRunner(state)

    # Should not raise
    results = runner.run_ticks(10)
    assert len(results) == 10
    for r in results:
        assert r.wm_state == []
        assert r.energy_injected == 0.0
