"""
Database Layer

Apply mutations via YAML/JSON files:
    from runtime.physics.graph import GraphOps
    write = GraphOps()
    result = write.apply(path="mutations/scene.yaml")

Query data:
    from runtime.physics.graph import GraphQueries
    read = GraphQueries()
    aldric = read.get_character("char_aldric")

Get playthrough-specific graph:
    from runtime.physics.graph import get_playthrough_graph_name, GraphOps
    graph_name = get_playthrough_graph_name("pt_abc123")
    write = GraphOps(graph_name=graph_name)

See docs/engine/GRAPH_OPERATIONS_GUIDE.md for full usage guide.
"""

from pathlib import Path


def get_playthrough_graph_name(playthrough_id: str) -> str:
    """
    Get the graph name for a playthrough.

    Each playthrough has its own isolated graph. The graph name is stored
    in player.yaml when the playthrough is created.

    Args:
        playthrough_id: The playthrough ID (e.g., "pt_abc123")

    Returns:
        Graph name to use with GraphOps/GraphQueries
    """
    import yaml
    playthroughs_dir = Path(__file__).parent.parent.parent / "playthroughs"
    player_file = playthroughs_dir / playthrough_id / "player.yaml"
    if player_file.exists():
        try:
            data = yaml.safe_load(player_file.read_text())
            return data.get("graph_name", playthrough_id)
        except Exception:
            pass
    # Fallback to playthrough_id as graph name
    return playthrough_id


from .graph_ops import (
    GraphOps, get_graph, ApplyResult, WriteError,
    add_mutation_listener, remove_mutation_listener
)
from .graph_queries import GraphQueries, get_queries, QueryError
from .graph_interface import GraphClient

__all__ = [
    'GraphOps', 'get_graph', 'ApplyResult', 'WriteError',
    'add_mutation_listener', 'remove_mutation_listener',
    'GraphQueries', 'get_queries', 'QueryError',
    'get_playthrough_graph_name',
    'GraphClient'
]
