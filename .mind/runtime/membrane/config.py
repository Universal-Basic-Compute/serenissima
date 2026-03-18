"""
Membrane configuration.

The membrane is the cross-org routing layer. All orgs connect to the same membrane.
Dev: localhost FalkorDB, graph "membrane"
Prod: membrane.mindprotocol.ai (same interface)
"""

# Membrane graph connection
# Dev: localhost, Prod: membrane.mindprotocol.ai
MEMBRANE_HOST = "localhost"
MEMBRANE_PORT = 6379
MEMBRANE_GRAPH = "membrane"

# Production endpoint (uncomment when deployed)
# MEMBRANE_HOST = "membrane.mindprotocol.ai"
