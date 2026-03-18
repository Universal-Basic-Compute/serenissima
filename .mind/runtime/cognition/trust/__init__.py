"""
Trust Mechanics — Limbic-delta-driven trust updates on links.

Spec: docs/trust_mechanics/ALGORITHM_Trust_Mechanics.md

This module implements Phase T1 (trust update on links) and Phase T2
(Limbic Delta computation from drive snapshots). Trust lives on links,
never on nodes. Positive limbic deltas grow trust asymptotically;
negative deltas grow friction. Trust decay happens elsewhere (Law 7).
"""

from .limbic_delta_computation import compute_limbic_delta
from .trust_update_on_links import update_link_trust

__all__ = [
    "compute_limbic_delta",
    "update_link_trust",
]
