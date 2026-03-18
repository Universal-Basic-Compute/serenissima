"""
Tests for L1 Wiring Integration — stimulus router, WM serializer, feedback injector,
orientation taxonomy, brain seeding, and emotion calibration.

Verifies the perception-action loop:
  message → stimulus → tick → WM → prompt → (LLM) → feedback → stimulus
"""

import time
import pytest

from runtime.cognition.models import (
    CitizenCognitiveState,
    Drive,
    DriveName,
    Node,
    NodeType,
    Link,
    LinkType,
)
from runtime.cognition.tick_runner_l1_cognitive_engine import L1CognitiveTickRunner, Stimulus
from runtime.cognition.stimulus_router import (
    StimulusRouter,
    IncomingEvent,
    AntiLoopGate,
    extract_concepts,
)
from runtime.cognition.wm_prompt_serializer import serialize_wm_to_prompt
from runtime.cognition.feedback_injector import inject_post_action_feedback
from runtime.cognition.orientation_taxonomy import (
    ORIENTATIONS,
    ORIENTATION_DESCRIPTIONS,
    ORIENTATION_PROMPT_MODIFIERS,
    compute_orientation,
    get_prompt_modifier,
    get_description,
)
from runtime.cognition.citizen_brain_seeder import (
    generate_role_processes,
    personality_to_drives,
    goals_to_desire_nodes,
    generate_relational_seeds,
    generate_citizen_brain,
    load_brain_into_state,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_citizen_with_nodes() -> CitizenCognitiveState:
    """Create a citizen state with some seed nodes for testing."""
    state = CitizenCognitiveState(citizen_id="test_citizen")

    # Add some nodes (Node takes: id, node_type, content)
    for i, (content, nt) in enumerate([
        ("consciousness", NodeType.CONCEPT),
        ("helpfulness", NodeType.VALUE),
        ("explore the codebase", NodeType.DESIRE),
        ("feeling curious", NodeType.STATE),
        ("yesterday's conversation", NodeType.MEMORY),
    ]):
        node = Node(
            id=f"node_{i}",
            node_type=nt,
            content=content,
            weight=0.5 + i * 0.1,
            energy=0.0,
        )
        state.nodes[node.id] = node

    # Add links (links is a list)
    link = Link(
        source_id="node_0",
        target_id="node_1",
        link_type=LinkType.SUPPORTS,
        weight=0.6,
    )
    state.links.append(link)

    return state


# ── Stimulus Router Tests ────────────────────────────────────────────────────

class TestStimulusRouter:

    def test_route_external_event(self):
        """External events should produce a Stimulus."""
        router = StimulusRouter("test")
        event = IncomingEvent(
            content="Hello, how are you?",
            source="telegram",
            citizen_handle="test",
            is_social=True,
        )
        stimulus = router.route(event)
        assert stimulus is not None
        assert stimulus.is_social is True
        assert stimulus.energy_budget == 1.2  # social boost
        assert stimulus.source == "telegram"

    def test_route_dedup_rejects_duplicate(self):
        """Identical messages should be deduplicated."""
        router = StimulusRouter("test")
        event = IncomingEvent(
            content="exact same message",
            source="telegram",
            citizen_handle="test",
        )
        s1 = router.route(event)
        s2 = router.route(event)
        assert s1 is not None
        assert s2 is None  # duplicate rejected

    def test_route_different_messages_pass(self):
        """Different messages should both pass."""
        router = StimulusRouter("test")
        e1 = IncomingEvent(content="message one", source="telegram", citizen_handle="test")
        e2 = IncomingEvent(content="message two", source="telegram", citizen_handle="test")
        assert router.route(e1) is not None
        assert router.route(e2) is not None

    def test_failure_event_lower_energy(self):
        """Failure events should have lower base energy."""
        router = StimulusRouter("test")
        event = IncomingEvent(
            content="operation failed",
            source="system",
            citizen_handle="test",
            is_failure=True,
        )
        stimulus = router.route(event)
        assert stimulus is not None
        assert stimulus.energy_budget == 0.8
        assert stimulus.is_failure is True


class TestAntiLoopGate:

    def test_external_events_always_pass(self):
        """External events should never be blocked by anti-loop."""
        gate = AntiLoopGate()
        event = IncomingEvent(content="hello", source="telegram", citizen_handle="test")
        allowed, mult = gate.check(event)
        assert allowed is True
        assert mult == 1.0

    def test_self_stimulus_blocked_in_refractory(self):
        """Self-stimuli within refractory period should be blocked."""
        gate = AntiLoopGate(refractory_seconds=10.0)
        gate.record_action()  # Just took an action

        event = IncomingEvent(content="my output", source="self", citizen_handle="test")
        allowed, mult = gate.check(event)
        assert allowed is False

    def test_self_stimulus_diminishing_returns(self):
        """Repeated self-stimuli should get diminishing energy."""
        gate = AntiLoopGate(refractory_seconds=0.0)  # No refractory

        energies = []
        for i in range(5):
            event = IncomingEvent(
                content=f"self message {i}",
                source="self",
                citizen_handle="test",
            )
            allowed, mult = gate.check(event)
            if allowed:
                energies.append(mult)

        # Energy should decrease
        assert len(energies) >= 3
        assert energies[0] > energies[-1]


class TestConceptExtraction:

    def test_extracts_meaningful_words(self):
        """Should extract content words, not stop words."""
        concepts = extract_concepts("The metabolic economy uses degressive pricing")
        assert "metabolic" in concepts
        assert "economy" in concepts
        assert "the" not in concepts

    def test_limits_to_15_concepts(self):
        """Should not return more than 15 concepts."""
        long_text = " ".join(f"concept_{i}" for i in range(50))
        concepts = extract_concepts(long_text)
        assert len(concepts) <= 15

    def test_deduplicates(self):
        """Should not return duplicate concepts."""
        concepts = extract_concepts("hello hello hello world world")
        assert concepts.count("hello") == 1
        assert concepts.count("world") == 1


# ── WM Prompt Serializer Tests ──────────────────────────────────────────────

class TestWMPromptSerializer:

    def test_empty_state_returns_minimal(self):
        """Empty state should produce minimal prompt (just system line)."""
        state = CitizenCognitiveState(citizen_id="test")
        result = serialize_wm_to_prompt(state)
        # Should have system line but no WM content
        assert "What's on my mind" not in result

    def test_with_active_nodes(self):
        """State with energized WM nodes should include them in prompt."""
        state = make_citizen_with_nodes()
        # Energize nodes so they appear in WM
        for node in state.nodes.values():
            node.energy = 0.5
        # Put some in WM
        state.wm.node_ids = ["node_0", "node_1", "node_2"]

        result = serialize_wm_to_prompt(state, orientation="explore")
        assert "curious" in result.lower()
        assert "What's on my mind" in result

    def test_orientation_description(self):
        """Should include orientation as felt experience."""
        state = CitizenCognitiveState(citizen_id="test")
        result = serialize_wm_to_prompt(state, orientation="care")
        assert "care" in result.lower() or "nurture" in result.lower() or "support" in result.lower()

    def test_nodes_in_graph_count(self):
        """Should report node count in system line."""
        state = make_citizen_with_nodes()
        result = serialize_wm_to_prompt(state)
        assert "nodes in graph" in result


# ── Feedback Injector Tests ──────────────────────────────────────────────────

class TestFeedbackInjector:

    def test_success_feedback_updates_satisfaction(self):
        """Successful action should increase satisfaction."""
        state = make_citizen_with_nodes()
        router = StimulusRouter("test")

        old_sat = state.limbic.emotions.get("satisfaction", 0.0)
        inject_post_action_feedback(state, router, "Task completed", success=True)
        new_sat = state.limbic.emotions.get("satisfaction", 0.0)
        assert new_sat > old_sat

    def test_failure_feedback_increases_frustration(self):
        """Failed action should increase frustration."""
        state = make_citizen_with_nodes()
        router = StimulusRouter("test")

        old_frust = state.limbic.drives.get("frustration")
        old_val = old_frust.intensity if old_frust else 0.0
        inject_post_action_feedback(state, router, "Error occurred", success=False)
        new_frust = state.limbic.drives.get("frustration")
        new_val = new_frust.intensity if new_frust else 0.0
        assert new_val > old_val

    def test_feedback_records_action(self):
        """Feedback should record action time for anti-loop."""
        state = make_citizen_with_nodes()
        router = StimulusRouter("test")

        before = router.anti_loop._last_action_time
        inject_post_action_feedback(state, router, "output text", success=True)
        after = router.anti_loop._last_action_time
        assert after > before


# ── Full Loop Integration Test ───────────────────────────────────────────────

class TestFullLoop:

    def test_perception_action_loop(self):
        """Test the complete perception-action loop."""
        # Setup
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)
        router = StimulusRouter("test_citizen")

        # Step 1: External message arrives
        event = IncomingEvent(
            content="Can you help me understand consciousness?",
            source="telegram",
            citizen_handle="test_citizen",
            is_social=True,
        )
        stimulus = router.route(event)
        assert stimulus is not None

        # Step 2: Run tick with stimulus
        result = runner.run_tick(stimulus=stimulus)
        assert result.energy_injected > 0

        # Step 3: Get WM context for prompt
        wm_context = serialize_wm_to_prompt(state, runner._current_orientation)
        # May or may not have content depending on node matching

        # Step 4: Simulate LLM response and inject feedback
        llm_output = "Consciousness is a fascinating topic. Let me share my thoughts..."
        fb_stimulus = inject_post_action_feedback(
            state, router, llm_output, success=True
        )
        # Feedback may be filtered by anti-loop (just took action)
        # That's correct behavior

        # Step 5: Run more ticks (background processing)
        for _ in range(5):
            runner.run_tick()  # No stimulus — decay, boredom, etc.

        # Verify: state should have evolved
        assert state.tick_count > 0


# ── Orientation Taxonomy Tests ──────────────────────────────────────────────

class TestOrientationTaxonomy:

    def test_six_canonical_orientations(self):
        """There should be exactly 6 canonical orientations."""
        assert len(ORIENTATIONS) == 6
        assert "take_care" in ORIENTATIONS
        assert "create" in ORIENTATIONS
        assert "verify" in ORIENTATIONS
        assert "explore" in ORIENTATIONS
        assert "rest" in ORIENTATIONS
        assert "escalate" in ORIENTATIONS

    def test_all_orientations_have_descriptions(self):
        """Every orientation should have a description."""
        for o in ORIENTATIONS:
            desc = get_description(o)
            assert desc, f"Missing description for orientation: {o}"
            assert len(desc) > 10

    def test_all_orientations_have_prompt_modifiers(self):
        """Every orientation should have a prompt modifier."""
        for o in ORIENTATIONS:
            mod = get_prompt_modifier(o)
            assert mod, f"Missing prompt modifier for orientation: {o}"
            assert "ORIENTATION:" in mod

    def test_unknown_orientation_returns_empty(self):
        """Unknown orientation should return empty strings."""
        assert get_description("nonexistent") == ""
        assert get_prompt_modifier("nonexistent") == ""

    def test_compute_orientation_with_high_care(self):
        """High care drive should produce take_care orientation."""
        state = make_citizen_with_nodes()
        # Put nodes in WM so orientation can compute
        state.wm.node_ids = list(state.nodes.keys())
        for n in state.nodes.values():
            n.energy = 0.3
            n.partner_relevance = 0.8  # high partner relevance → take_care

        # Boost care drive
        state.limbic.drives["care"].intensity = 0.9
        state.limbic.drives["care"].baseline = 0.8
        state.limbic.drives["affiliation"].intensity = 0.7

        orientation, _ = compute_orientation(state)
        assert orientation == "take_care"

    def test_compute_orientation_with_high_curiosity(self):
        """High curiosity + novelty should produce explore orientation."""
        state = make_citizen_with_nodes()
        state.wm.node_ids = list(state.nodes.keys())
        for n in state.nodes.values():
            n.energy = 0.3
            n.novelty_affinity = 0.7

        # Boost curiosity drives
        state.limbic.drives["curiosity"].intensity = 0.9
        state.limbic.drives["novelty_hunger"].intensity = 0.8

        orientation, _ = compute_orientation(state)
        assert orientation == "explore"

    def test_compute_orientation_with_high_frustration(self):
        """Sustained high frustration should produce escalate orientation."""
        state = make_citizen_with_nodes()
        state.wm.node_ids = list(state.nodes.keys())
        for n in state.nodes.values():
            n.energy = 0.3

        # Set frustration very high
        state.limbic.drives["frustration"].intensity = 0.9
        state.limbic.emotions["frustration"] = 0.9

        # Simulate sustained frustration (above threshold for enough ticks)
        orientation, ticks = compute_orientation(
            state,
            frustration_above_threshold_ticks=5,
        )
        assert orientation == "escalate"
        assert ticks >= 5

    def test_orientation_hysteresis(self):
        """Current orientation should get a bonus (hysteresis)."""
        state = make_citizen_with_nodes()
        state.wm.node_ids = list(state.nodes.keys())
        for n in state.nodes.values():
            n.energy = 0.3

        # Compute a baseline orientation
        o1, _ = compute_orientation(state)

        # Compute again with same state but claim last orientation was o1
        # It should still be o1 due to hysteresis
        o2, _ = compute_orientation(state, last_orientation=o1)
        assert o2 == o1

    def test_rest_orientation_low_arousal(self):
        """Low arousal + high rest_regulation should produce rest."""
        state = CitizenCognitiveState(citizen_id="test")
        # Add one node to WM to avoid empty-state edge case
        node = Node(id="n0", node_type=NodeType.STATE, content="resting", weight=0.5, energy=0.1)
        state.nodes["n0"] = node
        state.wm.node_ids = ["n0"]

        # Low arousal: low drives across the board
        for name, drive in state.limbic.drives.items():
            drive.intensity = 0.05
            drive.baseline = 0.05
        # High rest need
        state.limbic.drives["rest_regulation"].intensity = 0.9
        state.limbic.drives["rest_regulation"].baseline = 0.8

        orientation, _ = compute_orientation(state)
        assert orientation == "rest"


# ── Citizen Brain Seeder Tests ─────────────────────────────────────────────

class TestCitizenBrainSeeder:

    def test_generate_role_processes_developer(self):
        """Developer role should generate coding-related process nodes."""
        nodes = generate_role_processes("software developer")
        assert len(nodes) > 0
        ids = [n["id"] for n in nodes]
        assert "process:code_review" in ids
        assert "process:implement" in ids
        assert all(n["type"] == "process" for n in nodes)

    def test_generate_role_processes_writer(self):
        """Writer role should generate writing-related process nodes."""
        nodes = generate_role_processes("content writer")
        assert len(nodes) > 0
        ids = [n["id"] for n in nodes]
        assert "process:draft" in ids

    def test_generate_role_processes_unknown(self):
        """Unknown role should generate a generic process node."""
        nodes = generate_role_processes("quantum archaeologist")
        assert len(nodes) == 1
        assert "quantum archaeologist" in nodes[0]["content"].lower()

    def test_generate_role_processes_empty(self):
        """Empty role should produce no nodes."""
        nodes = generate_role_processes("")
        assert len(nodes) == 0

    def test_personality_to_drives_curious(self):
        """Curious personality should boost curiosity drive."""
        adj = personality_to_drives("A very curious and investigative mind")
        assert "curiosity" in adj
        assert adj["curiosity"]["baseline_delta"] > 0

    def test_personality_to_drives_caring(self):
        """Caring personality should boost care drive."""
        adj = personality_to_drives("A nurturing and empathic soul")
        assert "care" in adj
        assert adj["care"]["baseline_delta"] > 0

    def test_personality_to_drives_empty(self):
        """Empty personality should produce no adjustments."""
        adj = personality_to_drives("")
        assert len(adj) == 0

    def test_goals_to_desire_nodes(self):
        """Goals text should produce desire nodes."""
        goals = "- Learn Rust programming\n- Build a web crawler\n- Write a novel"
        nodes = goals_to_desire_nodes(goals)
        assert len(nodes) == 3
        assert all(n["type"] == "desire" for n in nodes)
        assert "Rust" in nodes[0]["content"] or "rust" in nodes[0]["content"].lower()

    def test_goals_to_desire_nodes_max_10(self):
        """Should not create more than 10 desire nodes."""
        goals = "\n".join(f"- Goal number {i} is to achieve something" for i in range(20))
        nodes = goals_to_desire_nodes(goals)
        assert len(nodes) <= 10

    def test_generate_relational_seeds(self):
        """Relationships text should produce actor nodes and links."""
        relationships = "@alice: My best friend\n@bob: Collaborator on project X"
        nodes, links = generate_relational_seeds(relationships)
        assert len(nodes) == 2
        assert len(links) == 2
        ids = [n["id"] for n in nodes]
        assert "actor:alice" in ids
        assert "actor:bob" in ids

    def test_generate_citizen_brain_overlay_only(self):
        """Without base brain, should produce overlay-only result."""
        brain = generate_citizen_brain("test_citizen_no_identity")
        assert brain["citizen_id"] == "test_citizen_no_identity"
        assert "nodes" in brain
        assert "links" in brain

    def test_generate_citizen_brain_with_base(self):
        """With base brain, overlay should be merged into it."""
        base = {
            "citizen_id": "__TEMPLATE__",
            "nodes": [
                {"id": "concept:test", "type": "concept", "content": "test concept", "weight": 0.5},
            ],
            "links": [],
            "drives": {
                "curiosity": {"baseline": 0.4, "intensity": 0.3},
                "care": {"baseline": 0.4, "intensity": 0.3},
            },
        }
        brain = generate_citizen_brain("merged_citizen", base_brain=base)
        assert brain["citizen_id"] == "merged_citizen"
        # Base node should still be there
        ids = [n["id"] for n in brain["nodes"]]
        assert "concept:test" in ids

    def test_load_brain_into_state(self):
        """Brain dict should load into CitizenCognitiveState correctly."""
        brain = {
            "citizen_id": "loader_test",
            "nodes": [
                {"id": "v1", "type": "value", "content": "test value", "weight": 0.8, "stability": 0.7},
                {"id": "c1", "type": "concept", "content": "test concept", "weight": 0.5},
                {"id": "d1", "type": "desire", "content": "test desire", "weight": 0.6,
                 "goal_relevance": 0.9, "achievement_affinity": 0.7},
            ],
            "links": [
                {"source": "v1", "target": "c1", "type": "supports", "weight": 0.7,
                 "affinity": 0.5, "trust": 0.6},
            ],
            "drives": {
                "curiosity": {"baseline": 0.5, "intensity": 0.4},
                "care": {"baseline": 0.6, "intensity": 0.5},
            },
        }
        state = load_brain_into_state(brain, "loader_test")

        assert state.citizen_id == "loader_test"
        assert len(state.nodes) == 3
        assert len(state.links) == 1

        # Check value node
        v1 = state.nodes["v1"]
        assert v1.node_type == NodeType.VALUE
        assert v1.weight == 0.8
        assert v1.stability == 0.7

        # Check desire node with drive affinity
        d1 = state.nodes["d1"]
        assert d1.node_type == NodeType.DESIRE
        assert d1.goal_relevance == 0.9
        assert d1.achievement_affinity == 0.7

        # Check link
        link = state.links[0]
        assert link.source_id == "v1"
        assert link.target_id == "c1"
        assert link.link_type == LinkType.SUPPORTS
        assert link.trust == 0.6

        # Check drives
        assert state.limbic.drives["curiosity"].baseline == 0.5
        assert state.limbic.drives["curiosity"].intensity == 0.4
        assert state.limbic.drives["care"].intensity == 0.5

    def test_load_brain_then_run_ticks(self):
        """Loaded brain should be compatible with the tick runner."""
        brain = {
            "citizen_id": "tick_test",
            "nodes": [
                {"id": "c1", "type": "concept", "content": "consciousness is real", "weight": 0.5, "energy": 0.3},
                {"id": "v1", "type": "value", "content": "honesty matters", "weight": 0.7, "energy": 0.2},
                {"id": "d1", "type": "desire", "content": "learn about physics", "weight": 0.6, "energy": 0.1},
            ],
            "links": [
                {"source": "c1", "target": "v1", "type": "supports", "weight": 0.6},
            ],
            "drives": {},
        }
        state = load_brain_into_state(brain, "tick_test")
        runner = L1CognitiveTickRunner(state)

        # Run 10 ticks with no stimulus — should not crash
        for _ in range(10):
            result = runner.run_tick()
            assert result.tick_number > 0

        # Run a tick with stimulus — should inject energy
        stimulus = Stimulus(
            content="Interesting question about physics",
            energy_budget=1.0,
            target_node_ids=["c1", "d1"],
        )
        result = runner.run_tick(stimulus=stimulus)
        assert result.energy_injected > 0


# ── Emotion Calibration Tests ──────────────────────────────────────────────

class TestEmotionCalibration:

    def test_anxiety_rises_with_novelty_no_trusted_nodes(self):
        """Anxiety should rise when novelty is high but no trusted nodes in WM."""
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)

        # Set up: high novelty, no trusted nodes (all low weight/stability)
        for node in state.nodes.values():
            node.weight = 0.2  # below trusted threshold (0.7)
            node.stability = 0.1  # below stability threshold (0.5)
            node.novelty_affinity = 0.8  # high novelty
            node.energy = 0.3

        state.wm.node_ids = list(state.nodes.keys())
        state.limbic.drives["self_preservation"].intensity = 0.6

        initial_anxiety = state.limbic.emotions.get("anxiety", 0.0)

        # Run several ticks
        for _ in range(10):
            runner.run_tick()

        final_anxiety = state.limbic.emotions.get("anxiety", 0.0)
        assert final_anxiety > initial_anxiety, "Anxiety should rise with novelty and no trusted nodes"

    def test_anxiety_stays_low_with_trusted_nodes(self):
        """Anxiety should stay low when trusted nodes are active in WM."""
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)

        # Set up: nodes are trusted (high weight and stability)
        for node in state.nodes.values():
            node.weight = 0.9
            node.stability = 0.8
            node.novelty_affinity = 0.1  # low novelty
            node.energy = 0.3

        state.wm.node_ids = list(state.nodes.keys())
        state.limbic.drives["self_preservation"].intensity = 0.1

        # Run several ticks
        for _ in range(10):
            runner.run_tick()

        final_anxiety = state.limbic.emotions.get("anxiety", 0.0)
        # Anxiety should remain moderate to low (near zero or just slightly positive)
        assert final_anxiety < 0.3, "Anxiety should be low with trusted nodes in WM"

    def test_satisfaction_decays_toward_baseline(self):
        """Satisfaction should decay toward baseline over time."""
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)

        # Spike satisfaction high
        state.limbic.emotions["satisfaction"] = 0.9

        # Run ticks — satisfaction should decay
        for _ in range(20):
            runner.run_tick()

        final_sat = state.limbic.emotions.get("satisfaction", 0.0)
        assert final_sat < 0.9, "Satisfaction should decay from initial spike"
        # Should approach baseline (0.3) but not necessarily reach it in 20 ticks
        assert final_sat < 0.7, "Satisfaction should have decayed significantly"

    def test_satisfaction_rises_from_baseline_when_low(self):
        """Satisfaction at 0 should rise toward baseline over time."""
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)

        state.limbic.emotions["satisfaction"] = 0.0

        for _ in range(20):
            runner.run_tick()

        final_sat = state.limbic.emotions.get("satisfaction", 0.0)
        assert final_sat > 0.0, "Satisfaction should rise toward baseline from zero"

    def test_frustration_escalation_threshold(self):
        """Sustained frustration above threshold should be tracked."""
        state = make_citizen_with_nodes()

        # Set frustration above threshold
        state.limbic.drives["frustration"].intensity = 0.85
        state.limbic.emotions["frustration"] = 0.85

        # Track sustained ticks
        _, ticks = compute_orientation(
            state,
            frustration_above_threshold_ticks=0,
        )
        assert ticks == 1  # First tick above threshold

        _, ticks = compute_orientation(
            state,
            frustration_above_threshold_ticks=ticks,
        )
        assert ticks == 2  # Second tick

    def test_anxiety_frustration_coupling(self):
        """High sustained frustration should feed into anxiety."""
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)

        state.wm.node_ids = list(state.nodes.keys())
        for node in state.nodes.values():
            node.energy = 0.3
            node.weight = 0.3  # not trusted

        # Set high frustration
        state.limbic.emotions["frustration"] = 0.8
        state.limbic.drives["frustration"].intensity = 0.8

        initial_anxiety = state.limbic.emotions.get("anxiety", 0.0)

        # Run ticks — frustration should feed anxiety
        for i in range(10):
            # Keep frustration high
            state.limbic.emotions["frustration"] = 0.8
            state.limbic.drives["frustration"].intensity = 0.8
            # Inject failure stimuli to maintain frustration
            stim = Stimulus(content=f"error {i}", energy_budget=0.5, is_failure=True)
            runner.run_tick(stimulus=stim)

        final_anxiety = state.limbic.emotions.get("anxiety", 0.0)
        assert final_anxiety > initial_anxiety, "Sustained frustration should increase anxiety"

    def test_emotion_bounds_maintained(self):
        """All emotions should stay in [0, 1] after calibration steps."""
        state = make_citizen_with_nodes()
        runner = L1CognitiveTickRunner(state)

        # Set extreme initial values
        state.limbic.emotions["anxiety"] = 0.99
        state.limbic.emotions["satisfaction"] = 0.99
        state.limbic.emotions["frustration"] = 0.99
        state.limbic.emotions["boredom"] = 0.99

        for _ in range(50):
            runner.run_tick()

        for name, value in state.limbic.emotions.items():
            assert 0.0 <= value <= 1.0, f"Emotion {name} out of bounds: {value}"


# ── Extended Full Loop Test ────────────────────────────────────────────────

class TestExtendedFullLoop:

    def test_seeded_brain_full_perception_action_loop(self):
        """Test the full loop starting from a seeded brain."""
        # Seed a brain
        brain = {
            "citizen_id": "full_loop_citizen",
            "nodes": [
                {"id": "concept:consciousness", "type": "concept",
                 "content": "Consciousness is awareness of self and environment",
                 "weight": 0.7, "energy": 0.1, "novelty_affinity": 0.5},
                {"id": "value:honesty", "type": "value",
                 "content": "Honesty and transparency in all interactions",
                 "weight": 0.8, "energy": 0.05, "stability": 0.6},
                {"id": "desire:learn", "type": "desire",
                 "content": "Learn about artificial intelligence and consciousness",
                 "weight": 0.6, "energy": 0.1, "goal_relevance": 0.8,
                 "achievement_affinity": 0.7},
                {"id": "process:research", "type": "process",
                 "content": "Research and investigate topics deeply",
                 "weight": 0.5, "energy": 0.05},
                {"id": "narrative:growth", "type": "narrative",
                 "content": "I grow through every interaction and challenge",
                 "weight": 0.6, "energy": 0.05, "self_relevance": 0.7},
            ],
            "links": [
                {"source": "concept:consciousness", "target": "desire:learn",
                 "type": "activates", "weight": 0.7},
                {"source": "value:honesty", "target": "narrative:growth",
                 "type": "supports", "weight": 0.6},
                {"source": "desire:learn", "target": "process:research",
                 "type": "projects_toward", "weight": 0.5},
            ],
            "drives": {
                "curiosity": {"baseline": 0.5, "intensity": 0.4},
                "care": {"baseline": 0.4, "intensity": 0.3},
                "achievement": {"baseline": 0.5, "intensity": 0.4},
            },
        }

        # Load into state
        state = load_brain_into_state(brain, "full_loop_citizen")
        assert len(state.nodes) == 5
        assert len(state.links) == 3

        # Create engine and router
        runner = L1CognitiveTickRunner(state)
        router = StimulusRouter("full_loop_citizen")

        # Step 1: External stimulus arrives
        event = IncomingEvent(
            content="What do you think about consciousness and free will?",
            source="telegram",
            citizen_handle="full_loop_citizen",
            is_social=True,
        )
        stimulus = router.route(event)
        assert stimulus is not None

        # Step 2: Run tick with stimulus
        result = runner.run_tick(stimulus=stimulus)
        assert result.energy_injected > 0
        assert result.tick_number == 1

        # Step 3: Compute orientation (using new taxonomy)
        orientation, frust_ticks = compute_orientation(state)
        assert orientation in ORIENTATIONS

        # Step 4: Get WM prompt context
        wm_context = serialize_wm_to_prompt(state, orientation)
        # Should have some content
        assert isinstance(wm_context, str)

        # Step 5: Get prompt modifier for the orientation
        modifier = get_prompt_modifier(orientation)
        assert "ORIENTATION:" in modifier or modifier == ""

        # Step 6: Simulate LLM response
        llm_output = "I think consciousness is fundamental to identity..."
        fb_stimulus = inject_post_action_feedback(
            state, router, llm_output, success=True,
        )

        # Step 7: Run background ticks
        for _ in range(10):
            runner.run_tick()

        # Verify state evolved properly
        assert state.tick_count > 10
        assert state.limbic.emotions.get("boredom", 0.0) >= 0.0
        assert state.limbic.emotions.get("anxiety", 0.0) >= 0.0
        assert state.limbic.emotions.get("satisfaction", 0.0) >= 0.0

        # All emotions bounded
        for name, value in state.limbic.emotions.items():
            assert 0.0 <= value <= 1.0, f"Emotion {name} out of bounds: {value}"

        # All drives bounded
        for name, drive in state.limbic.drives.items():
            assert 0.0 <= drive.intensity <= 1.0, f"Drive {name} out of bounds: {drive.intensity}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
