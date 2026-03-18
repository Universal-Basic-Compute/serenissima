"""
mind-mcp

MIND Engine - Graph physics, traversal, membrane client.

pip install mind-mcp
"""

__version__ = "0.2.1"

# Core exports (lazy import to avoid circular deps)
def get_graph_ops(graph_name: str = "blood_ledger"):
    from .physics.graph.graph_ops import GraphOps
    return GraphOps(graph_name=graph_name)

def get_graph_queries(graph_name: str = "blood_ledger"):
    from .physics.graph.graph_queries import GraphQueries
    return GraphQueries(graph_name=graph_name)

__all__ = ["__version__", "get_graph_ops", "get_graph_queries"]
