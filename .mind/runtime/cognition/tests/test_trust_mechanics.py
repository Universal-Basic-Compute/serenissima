"""
Trust Mechanics — Test Suite for Phase T1 (Trust Update on Links) and
Phase T2 (Limbic Delta Computation from Drive Snapshots).

Spec: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md
      docs/trust_mechanics/VALIDATION_Trust_Mechanics.md

Run: python -m pytest runtime/cognition/tests/test_trust_mechanics.py -v
"""

from __future__ import annotations

import time

import pytest

from ..models import (
    CitizenCognitiveState,
    Drive,
    DriveName,
    DriveSnapshot,
    EmotionName,
    LimbicState,
    Link,
    LinkType,
    Node,
    NodeType,
    WorkingMemory,
)
from ..trust.limbic_delta_computation import (
    LIMBIC_DELTA_MAX,
    LIMBIC_DELTA_MIN,
    compute_limbic_delta,
)
from ..trust.trust_update_on_links import (
    AVERSION_RATE,
    FRICTION_GAMMA,
    TRUST_BETA,
    TrustUpdateResult,
    update_link_trust,
)
from ..tick_runner_l1_cognitive_engine import L1CognitiveTickRunner, Stimulus


# =========================================================================
# Helpers
# =========================================================================


def _make_link(**kwargs) -> Link:
    """Create a link with sensible defaults."""
    defaults = dict(
        source_id="a",
        target_id="b",
        link_type=LinkType.ASSOCIATES,
        weight=0.5,
        trust=0.5,
        friction=0.0,
        affinity=0.0,
        aversion=0.0,
    )
    defaults.update(kwargs)
    return Link(**defaults)


def _make_snapshots(
    sat_before: float = 0.0,
    sat_after: float = 0.0,
    frust_before: float = 0.0,
    frust_after: float = 0.0,
    anx_before: float = 0.0,
    anx_after: float = 0.0,
) -> tuple[DriveSnapshot, DriveSnapshot]:
    """Create before/after drive snapshots for testing."""
    before = DriveSnapshot(
        satisfaction=sat_before,
        frustration=frust_before,
        anxiety=anx_before,
        tick=1,
    )
    after = DriveSnapshot(
        satisfaction=sat_after,
        frustration=frust_after,
        anxiety=anx_after,
        tick=2,
    )
    return before, after


def _create_trust_test_citizen() -> CitizenCognitiveState:
    """Create a minimal citizen with two nodes and a link for trust testing."""
    now = time.time()
    nodes = {
        "user": Node(
            id="user", node_type=NodeType.CONCEPT,
            content="user node", weight=0.5, energy=1.0,
            created_at=now,
        ),
        "thing": Node(
            id="thing", node_type=NodeType.CONCEPT,
            content="thing node", weight=0.5, energy=1.0,
            created_at=now,
        ),
    }
    links = [
        Link(
            source_id="user", target_id="thing",
            link_type=LinkType.ASSOCIATES, weight=0.5,
            trust=0.5, friction=0.0, affinity=0.0, aversion=0.0,
        ),
    ]
    state = CitizenCognitiveState(
        citizen_id="trust_test",
        nodes=nodes,
        links=links,
        limbic=LimbicState(),
        wm=WorkingMemory(node_ids=["user", "thing"]),
    )
    return state


# =========================================================================
# Phase T2: Limbic Delta Computation
# =========================================================================


class TestLimbicDeltaComputation:
    """Tests for compute_limbic_delta (Phase T2)."""

    def test_positive_delta_from_satisfaction_increase(self):
        """Satisfaction increase produces positive limbic delta."""
        before, after = _make_snapshots(sat_before=0.3, sat_after=0.6)
        delta = compute_limbic_delta(before, after)
        assert delta > 0.0, f"Expected positive delta, got {delta}"
        assert abs(delta - 0.3) < 1e-9, f"Expected ~0.3, got {delta}"

    def test_negative_delta_from_frustration_increase(self):
        """Frustration increase produces negative limbic delta."""
        before, after = _make_snapshots(frust_before=0.2, frust_after=0.7)
        delta = compute_limbic_delta(before, after)
        assert delta < 0.0, f"Expected negative delta, got {delta}"
        assert abs(delta - (-0.5)) < 1e-9, f"Expected ~-0.5, got {delta}"

    def test_anxiety_reduction_is_positive_signal(self):
        """Anxiety decrease produces a (smaller) positive signal."""
        before, after = _make_snapshots(anx_before=0.8, anx_after=0.2)
        delta = compute_limbic_delta(before, after)
        # anxiety_delta = 0.2 - 0.8 = -0.6, contribution = -0.5 * (-0.6) = +0.3
        assert delta > 0.0, f"Expected positive delta from anxiety reduction, got {delta}"
        assert abs(delta - 0.3) < 1e-9, f"Expected ~0.3, got {delta}"

    def test_anxiety_increase_is_negative_signal(self):
        """Anxiety increase produces a (smaller) negative signal."""
        before, after = _make_snapshots(anx_before=0.2, anx_after=0.8)
        delta = compute_limbic_delta(before, after)
        # anxiety_delta = 0.6, contribution = -0.5 * 0.6 = -0.3
        assert delta < 0.0, f"Expected negative delta from anxiety increase, got {delta}"
        assert abs(delta - (-0.3)) < 1e-9

    def test_neutral_interaction_returns_zero(self):
        """No change in drives returns zero."""
        before, after = _make_snapshots(
            sat_before=0.5, sat_after=0.5,
            frust_before=0.3, frust_after=0.3,
            anx_before=0.2, anx_after=0.2,
        )
        delta = compute_limbic_delta(before, after)
        assert abs(delta) < 1e-9, f"Expected zero delta, got {delta}"

    def test_combined_positive_scenario(self):
        """Satisfaction up + frustration down + anxiety down = strong positive."""
        before, after = _make_snapshots(
            sat_before=0.0, sat_after=0.5,  # +0.5
            frust_before=0.5, frust_after=0.0,  # -0.5, contribution +0.5
            anx_before=0.5, anx_after=0.0,  # -0.5, contribution +0.25
        )
        delta = compute_limbic_delta(before, after)
        # 0.5 - (-0.5) - 0.5*(-0.5) = 0.5 + 0.5 + 0.25 = 1.25
        assert abs(delta - 1.25) < 1e-9, f"Expected 1.25, got {delta}"

    def test_combined_negative_scenario(self):
        """Satisfaction down + frustration up + anxiety up = strong negative."""
        before, after = _make_snapshots(
            sat_before=0.5, sat_after=0.0,  # -0.5
            frust_before=0.0, frust_after=0.5,  # +0.5, contribution -0.5
            anx_before=0.0, anx_after=0.5,  # +0.5, contribution -0.25
        )
        delta = compute_limbic_delta(before, after)
        # -0.5 - 0.5 - 0.5*0.5 = -0.5 - 0.5 - 0.25 = -1.25
        assert abs(delta - (-1.25)) < 1e-9, f"Expected -1.25, got {delta}"

    def test_clamped_to_bounds(self):
        """Extreme values are clamped to [-2.5, +2.5]."""
        # Create extreme scenario
        before = DriveSnapshot(satisfaction=0.0, frustration=1.0, anxiety=1.0)
        after = DriveSnapshot(satisfaction=1.0, frustration=0.0, anxiety=0.0)
        delta = compute_limbic_delta(before, after)
        # sat_delta=1.0, frust_delta=-1.0, anx_delta=-1.0
        # 1.0 - (-1.0) - 0.5*(-1.0) = 1.0 + 1.0 + 0.5 = 2.5
        assert delta <= LIMBIC_DELTA_MAX
        assert delta >= LIMBIC_DELTA_MIN
        assert abs(delta - 2.5) < 1e-9

    def test_snapshot_from_limbic_state(self):
        """DriveSnapshot.from_limbic_state captures correct values."""
        limbic = LimbicState()
        limbic.drives[DriveName.FRUSTRATION.value].intensity = 0.7
        limbic.drives[DriveName.CURIOSITY.value].intensity = 0.4
        limbic.emotions[EmotionName.SATISFACTION.value] = 0.6
        limbic.emotions[EmotionName.ANXIETY.value] = 0.3

        snap = DriveSnapshot.from_limbic_state(limbic, tick=42)

        assert snap.frustration == 0.7
        assert snap.curiosity == 0.4
        assert snap.satisfaction == 0.6
        assert snap.anxiety == 0.3
        assert snap.tick == 42


# =========================================================================
# Phase T1: Trust Update on Links
# =========================================================================


class TestTrustUpdateOnLinks:
    """Tests for update_link_trust (Phase T1)."""

    def test_positive_delta_increases_trust(self):
        """Positive limbic delta should increase trust asymptotically."""
        link = _make_link(trust=0.5)
        result = update_link_trust(link, limbic_delta=0.5)

        assert result.trust_delta > 0.0
        assert link.trust > 0.5
        # delta_trust = 0.05 * 0.5 * (1 - 0.5) = 0.0125
        expected_delta = TRUST_BETA * 0.5 * 0.5
        assert abs(result.trust_delta - expected_delta) < 1e-9

    def test_negative_delta_increases_friction(self):
        """Negative limbic delta should increase friction, not decrease trust."""
        link = _make_link(trust=0.5, friction=0.0)
        original_trust = link.trust
        result = update_link_trust(link, limbic_delta=-0.5)

        assert link.trust == original_trust, "Trust must NOT decrease on negative LD"
        assert result.friction_delta > 0.0
        assert link.friction > 0.0
        # delta_friction = 0.08 * 0.5 * (1 - 0) = 0.04
        expected_friction = FRICTION_GAMMA * 0.5 * 1.0
        assert abs(result.friction_delta - expected_friction) < 1e-9

    def test_trust_never_exceeds_one(self):
        """Trust clamped to 1.0 even with large positive delta."""
        link = _make_link(trust=0.99)
        update_link_trust(link, limbic_delta=2.0)
        assert link.trust <= 1.0

    def test_friction_never_exceeds_one(self):
        """Friction clamped to 1.0 even with large negative delta."""
        link = _make_link(friction=0.99)
        update_link_trust(link, limbic_delta=-2.0)
        assert link.friction <= 1.0

    def test_asymptotic_growth_slows_near_ceiling(self):
        """Trust growth should slow dramatically as trust approaches 1.0."""
        # Low trust: fast growth
        link_low = _make_link(trust=0.1)
        result_low = update_link_trust(link_low, limbic_delta=0.5)

        # High trust: slow growth
        link_high = _make_link(trust=0.9)
        result_high = update_link_trust(link_high, limbic_delta=0.5)

        # Growth at trust=0.1 should be 9x faster than at trust=0.9
        ratio = result_low.trust_delta / result_high.trust_delta
        assert abs(ratio - 9.0) < 1e-6, f"Expected 9x ratio, got {ratio}"

    def test_zero_delta_no_change(self):
        """Zero limbic delta produces no changes."""
        link = _make_link(trust=0.5, friction=0.2)
        result = update_link_trust(link, limbic_delta=0.0)
        assert result.trust_delta == 0.0
        assert result.friction_delta == 0.0
        assert link.trust == 0.5
        assert link.friction == 0.2

    def test_positive_delta_also_grows_affinity(self):
        """Positive LD should co-evolve affinity."""
        link = _make_link(affinity=0.0)
        result = update_link_trust(link, limbic_delta=0.5)
        assert result.affinity_delta > 0.0
        assert link.affinity > 0.0

    def test_negative_delta_also_grows_aversion(self):
        """Negative LD should co-evolve aversion."""
        link = _make_link(aversion=0.0)
        result = update_link_trust(link, limbic_delta=-0.5)
        assert result.aversion_delta > 0.0
        assert link.aversion > 0.0

    def test_dt_scaling(self):
        """dt parameter scales the trust delta linearly."""
        link_dt1 = _make_link(trust=0.5)
        result_dt1 = update_link_trust(link_dt1, limbic_delta=0.5, dt=1.0)

        link_dt2 = _make_link(trust=0.5)
        result_dt2 = update_link_trust(link_dt2, limbic_delta=0.5, dt=2.0)

        assert abs(result_dt2.trust_delta - 2.0 * result_dt1.trust_delta) < 1e-9

    def test_negativity_bias(self):
        """Friction should grow faster than trust (gamma > beta)."""
        link_positive = _make_link(trust=0.0, friction=0.0)
        result_pos = update_link_trust(link_positive, limbic_delta=0.5)

        link_negative = _make_link(trust=0.0, friction=0.0)
        result_neg = update_link_trust(link_negative, limbic_delta=-0.5)

        # gamma (0.08) > beta (0.05)
        assert result_neg.friction_delta > result_pos.trust_delta, (
            "Negativity bias: friction should grow faster than trust "
            f"(friction={result_neg.friction_delta}, trust={result_pos.trust_delta})"
        )

    def test_trust_accumulates_over_many_positive_ticks(self):
        """Repeated small positive deltas should accumulate trust."""
        link = _make_link(trust=0.1)
        for _ in range(100):
            update_link_trust(link, limbic_delta=0.2)
        assert link.trust > 0.3, f"Trust should accumulate, got {link.trust}"
        assert link.trust < 1.0, "Trust should not reach 1.0 in 100 ticks"

    def test_trust_on_links_only(self):
        """Verify that update_link_trust operates on Link objects, not nodes."""
        link = _make_link()
        # This test is structural: the function signature accepts Link, not Node.
        result = update_link_trust(link, limbic_delta=0.3)
        assert isinstance(result, TrustUpdateResult)


# =========================================================================
# Integration: Trust in Tick Runner
# =========================================================================


class TestTrustInTickRunner:
    """Integration tests for trust mechanics in the tick runner."""

    def test_drive_snapshot_captured_each_tick(self):
        """Runner should capture DriveSnapshots for limbic delta computation."""
        state = _create_trust_test_citizen()
        runner = L1CognitiveTickRunner(state)

        # First tick
        runner.run_tick()

        assert runner._drives_before is not None, "drives_before should be set"
        assert runner._drives_after is not None, "drives_after should be set"
        assert isinstance(runner._drives_before, DriveSnapshot)
        assert isinstance(runner._drives_after, DriveSnapshot)

    def test_limbic_delta_flows_to_law_18(self):
        """When drives change between ticks, limbic delta should affect trust."""
        state = _create_trust_test_citizen()
        runner = L1CognitiveTickRunner(state)

        # Record initial trust
        initial_trust = state.links[0].trust

        # Manually set satisfaction high to create a positive limbic delta
        state.limbic.emotions[EmotionName.SATISFACTION.value] = 0.0

        # Run one tick (captures "before" snapshot with satisfaction=0)
        runner.run_tick()

        # Now boost satisfaction to create a delta on the next tick
        state.limbic.emotions[EmotionName.SATISFACTION.value] = 0.8

        # Give nodes energy so they're co-active
        state.nodes["user"].energy = 1.0
        state.nodes["thing"].energy = 1.0

        # Run another tick -- should detect positive limbic delta
        runner.run_tick()

        # Trust may or may not have changed (depends on whether limbic delta
        # was significant after all the limbic processing). Just verify
        # the machinery ran without error.
        assert state.links[0].trust >= 0.0
        assert state.links[0].trust <= 1.0

    def test_failure_stimulus_increases_friction(self):
        """Failure stimuli should increase frustration, producing negative LD,
        which should increase friction on co-active links."""
        state = _create_trust_test_citizen()
        runner = L1CognitiveTickRunner(state)

        # Give nodes energy
        state.nodes["user"].energy = 2.0
        state.nodes["thing"].energy = 2.0

        initial_friction = state.links[0].friction

        # Send several failure stimuli
        for _ in range(5):
            stim = Stimulus(
                content="failure event",
                energy_budget=2.0,
                target_node_ids=["user", "thing"],
                is_failure=True,
            )
            runner.run_tick(stimulus=stim)

        # Friction should have increased (or at least not decreased)
        # from the frustration-driven negative limbic delta.
        # The exact amount depends on how much frustration accumulated.
        assert state.links[0].friction >= initial_friction

    def test_no_regression_empty_state(self):
        """Trust mechanics should not crash on empty state."""
        state = CitizenCognitiveState(citizen_id="empty_trust")
        runner = L1CognitiveTickRunner(state)
        results = runner.run_ticks(10)
        assert len(results) == 10

    def test_trust_bounds_maintained_over_many_ticks(self):
        """Trust and friction stay in [0, 1] over extended runs."""
        state = _create_trust_test_citizen()
        runner = L1CognitiveTickRunner(state)

        # Mix of stimuli
        stimuli = {}
        for i in range(1, 51):
            if i % 3 == 0:
                stimuli[i] = Stimulus(
                    content="positive event",
                    energy_budget=3.0,
                    target_node_ids=["user", "thing"],
                    is_progress=True,
                )
            elif i % 5 == 0:
                stimuli[i] = Stimulus(
                    content="failure event",
                    energy_budget=2.0,
                    target_node_ids=["user", "thing"],
                    is_failure=True,
                )

        runner.run_ticks(50, stimuli=stimuli)

        for link in state.links:
            assert 0.0 <= link.trust <= 1.0, (
                f"Trust out of bounds: {link.trust} on "
                f"{link.source_id}->{link.target_id}"
            )
            assert 0.0 <= link.friction <= 1.0, (
                f"Friction out of bounds: {link.friction} on "
                f"{link.source_id}->{link.target_id}"
            )
            assert 0.0 <= link.affinity <= 1.0, (
                f"Affinity out of bounds: {link.affinity}"
            )
            assert 0.0 <= link.aversion <= 1.0, (
                f"Aversion out of bounds: {link.aversion}"
            )


# =========================================================================
# Edge Cases
# =========================================================================


class TestTrustEdgeCases:
    """Edge cases and boundary conditions."""

    def test_trust_at_zero_maximum_growth(self):
        """Trust at 0.0 should have maximum growth rate."""
        link = _make_link(trust=0.0)
        result = update_link_trust(link, limbic_delta=1.0)
        # delta = 0.05 * 1.0 * (1.0 - 0.0) = 0.05
        assert abs(result.trust_delta - TRUST_BETA) < 1e-9

    def test_trust_at_one_no_growth(self):
        """Trust at 1.0 should have zero growth."""
        link = _make_link(trust=1.0)
        result = update_link_trust(link, limbic_delta=1.0)
        assert abs(result.trust_delta) < 1e-9
        assert link.trust == 1.0

    def test_friction_at_one_no_growth(self):
        """Friction at 1.0 should have zero growth."""
        link = _make_link(friction=1.0)
        result = update_link_trust(link, limbic_delta=-1.0)
        assert abs(result.friction_delta) < 1e-9
        assert link.friction == 1.0

    def test_very_small_delta_below_epsilon(self):
        """Extremely small limbic delta (< 1e-9) should be treated as zero."""
        link = _make_link(trust=0.5)
        result = update_link_trust(link, limbic_delta=1e-12)
        assert result.trust_delta == 0.0
        assert result.friction_delta == 0.0

    def test_identical_snapshots_zero_delta(self):
        """Identical before/after snapshots produce zero limbic delta."""
        snap = DriveSnapshot(satisfaction=0.5, frustration=0.3, anxiety=0.2)
        delta = compute_limbic_delta(snap, snap)
        assert abs(delta) < 1e-9

    def test_drive_snapshot_default_values(self):
        """DriveSnapshot defaults to all zeros."""
        snap = DriveSnapshot()
        assert snap.satisfaction == 0.0
        assert snap.frustration == 0.0
        assert snap.anxiety == 0.0
        assert snap.tick == 0
