"""
Physics Health Checkers

Individual health check implementations.

DOCS: docs/physics/HEALTH_Energy_Physics.md
DOCS: docs/physics/HEALTH_Physics.md (v1.6.1 SubEntity)
DOCS: docs/security/space_encryption/HEALTH_Space_Encryption.md (Space Encryption)
"""

from .energy_conservation import EnergyConservationChecker
from .no_negative import NoNegativeEnergyChecker
from .link_state import LinkStateChecker
from .tick_integrity import TickIntegrityChecker
from .moment_lifecycle import MomentLifecycleChecker

# v1.6.1 SubEntity checkers
from .subentity import (
    SubEntityTreeChecker,
    FoundNarrativesChecker,
    CrystallizationEmbeddingChecker,
    CrystallizedConsistencyChecker,
    SiblingDivergenceChecker,
    LinkScoreChecker,
    CrystallizationNoveltyChecker,
    validate_subentity,
    is_subentity_healthy,
)

# Space Encryption checkers
from .content_encryption import ContentEncryptionChecker
from .key_distribution import KeyDistributionChecker
from .hierarchy_consistency import HierarchyConsistencyChecker
from .private_key_scan import PrivateKeyScanChecker
from .revocation_completeness import RevocationCompletenessChecker

__all__ = [
    # v1.2 Physics checkers
    "EnergyConservationChecker",
    "NoNegativeEnergyChecker",
    "LinkStateChecker",
    "TickIntegrityChecker",
    "MomentLifecycleChecker",
    # v1.6.1 SubEntity checkers
    "SubEntityTreeChecker",
    "FoundNarrativesChecker",
    "CrystallizationEmbeddingChecker",
    "CrystallizedConsistencyChecker",
    "SiblingDivergenceChecker",
    "LinkScoreChecker",
    "CrystallizationNoveltyChecker",
    "validate_subentity",
    "is_subentity_healthy",
    # Space Encryption checkers
    "ContentEncryptionChecker",
    "KeyDistributionChecker",
    "HierarchyConsistencyChecker",
    "PrivateKeyScanChecker",
    "RevocationCompletenessChecker",
]
