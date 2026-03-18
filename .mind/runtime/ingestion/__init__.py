"""
Human Integration — Ingestion Pipelines (Force 3).

Provides the foundational layers for ingesting human partner data
into an AI citizen's L1 brain graph:

- Consent gate: graph-native consent checking and management
- Partner node factory: creates nodes tagged with partner_relevance
- L1 stimulus injector: wraps partner data as Stimulus for the tick loop
- Sovereign cascade: prediction tracking and alignment fidelity

Spec: docs/human_integration/IMPLEMENTATION_Human_Integration.md
      docs/human_integration/ALGORITHM_Human_Integration.md
"""

from .consent_gate_and_bond_validator import (
    check_consent,
    grant_consent,
    revoke_consent,
    check_bond_active,
    VALID_STREAMS,
)
from .partner_node_factory_and_relevance_scorer import (
    create_partner_node,
    score_relevance,
)
from .l1_stimulus_injector_for_partner_data import (
    inject_partner_stimulus,
)
from .sovereign_cascade_prediction_tracker import (
    record_prediction,
    resolve_prediction,
    measure_alignment_fidelity,
    get_cascade_status,
)

__all__ = [
    "check_consent",
    "grant_consent",
    "revoke_consent",
    "check_bond_active",
    "VALID_STREAMS",
    "create_partner_node",
    "score_relevance",
    "inject_partner_stimulus",
    "record_prediction",
    "resolve_prediction",
    "measure_alignment_fidelity",
    "get_cascade_status",
]
