"""
Embed Pending - Batch embed unembedded nodes and links

Call after exploration or doctor to ensure all graph elements have embeddings.

Usage:
    from runtime.infrastructure.embeddings.embed_pending import embed_all_pending
    stats = embed_all_pending(graph_name='mind')
"""

from typing import Dict, Any, Optional
from .service import get_embedding_service


def embed_all_pending(graph_name: str = 'mind') -> Dict[str, int]:
    """
    Embed all nodes and links that lack embeddings.

    Returns:
        Dict with counts: {'nodes': N, 'links': M}
    """
    from runtime.physics.graph.graph_queries import GraphQueries

    gq = GraphQueries(graph_name=graph_name)
    graph = gq.graph
    svc = get_embedding_service()

    if not svc:
        raise RuntimeError("Embedding service unavailable")

    stats = {'nodes': 0, 'links': 0}

    # Embed nodes without embeddings
    result = graph.query("""
        MATCH (n)
        WHERE n.embedding IS NULL AND n.name IS NOT NULL
        RETURN n.id, n.name, n.node_type, n.description
    """)

    for row in result.result_set:
        node_id, name, node_type, desc = row
        text = _node_embed_text(name, node_type, desc)
        embedding = svc.embed(text)
        if embedding:
            graph.query("""
                MATCH (n {id: $id})
                SET n.embedding = $emb
            """, {'id': node_id, 'emb': embedding})
            stats['nodes'] += 1

    # Embed links without embeddings
    result = graph.query("""
        MATCH (a)-[r]->(b)
        WHERE r.embedding IS NULL AND r.id IS NOT NULL
        RETURN r.id, r.name, a.name, a.description, b.name, b.description
    """)

    for row in result.result_set:
        link_id, link_name, from_name, from_desc, to_name, to_desc = row
        text = _link_embed_text(link_name, from_name, from_desc, to_name, to_desc)
        embedding = svc.embed(text)
        if embedding:
            graph.query("""
                MATCH ()-[r {id: $id}]->()
                SET r.embedding = $emb
            """, {'id': link_id, 'emb': embedding})
            stats['links'] += 1

    # Flush disk cache so next run benefits from cached embeddings
    svc.flush_cache()

    return stats


def _node_embed_text(name: str, node_type: Optional[str], desc: Optional[str]) -> str:
    """Build embedding text for a node."""
    parts = [name or '']
    if node_type:
        parts.append(f"({node_type})")
    if desc:
        parts.append(desc)
    return ' '.join(p for p in parts if p)


def _link_embed_text(
    link_name: Optional[str],
    from_name: Optional[str],
    from_desc: Optional[str],
    to_name: Optional[str],
    to_desc: Optional[str],
) -> str:
    """Build embedding text for a link with node context."""
    text = f"{link_name or 'link'}: "
    text += from_name or 'source'
    if from_desc:
        text += f" ({from_desc})"
    text += " -> "
    text += to_name or 'target'
    if to_desc:
        text += f" ({to_desc})"
    return text
