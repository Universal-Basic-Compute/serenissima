"""
Explore Command — SubEntity Graph Exploration via CLI

Runs SubEntity exploration on the graph and returns results.
Supports --debug mode to include full traversal logs.

IMPL: engine/physics/exploration.py
LOGS: engine/physics/traversal_logger.py

Usage:
    mind explore "What does Edmund believe?" --actor edmund
    mind explore "Find tensions in the oath" --actor claude --intention-type verify
    mind explore "Summary of recent events" --actor edmund --debug
"""

import asyncio
import json
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Optional, Dict, Any, List

from runtime.physics.exploration import (
    ExplorationRunner,
    ExplorationConfig,
    ExplorationResult,
    GraphInterface,
    ExplorationTimeoutError,
)
# v2.1: Removed IntentionType import - intention is semantic via embedding
from runtime.physics.traversal_logger import (
    TraversalLogger,
    LogLevel,
    get_traversal_logger,
    create_traversal_logger,
)


def get_graph_interface(graph_name: Optional[str] = None) -> GraphInterface:
    """
    Get a GraphInterface implementation connected to FalkorDB.
    Uses raw Cypher queries for low-level graph access.
    """
    from runtime.physics.graph.graph_queries import GraphQueries

    try:
        gq = GraphQueries(graph_name=graph_name)
        graph = gq.graph  # Raw FalkorDB graph
        print(f"Connected to graph: {gq.graph_name}")

        # Embedding service not used during exploration (causes feedback loop)
        # Query embedding done separately in get_embedding()
        _embed_svc = None

        def _query(cypher: str) -> List[Dict]:
            """Run Cypher query and return results as dicts."""
            result = graph.query(cypher)
            return [dict(zip(result.header, row)) for row in result.result_set]

        def _parse_embedding(value) -> Optional[List[float]]:
            """Parse embedding from database - handles string-serialized embeddings."""
            if value is None:
                return None
            if isinstance(value, list):
                # Already a list, ensure floats
                return [float(x) for x in value]
            if isinstance(value, str):
                # JSON-serialized string like "[0.1, 0.2, ...]"
                import json
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return [float(x) for x in parsed]
                except (json.JSONDecodeError, ValueError):
                    pass
            return None

        def _node_to_dict(node) -> Dict[str, Any]:
            """Convert FalkorDB node to dict."""
            if node is None:
                return None
            props = dict(node.properties) if hasattr(node, 'properties') else {}
            props['id'] = props.get('id', '')
            # Parse embedding if stored as string
            if 'embedding' in props:
                props['embedding'] = _parse_embedding(props['embedding'])
            return props

        def _rel_to_dict(rel, from_id: str, to_id: str) -> Dict[str, Any]:
            """Convert FalkorDB relationship to dict."""
            if rel is None:
                return None
            props = dict(rel.properties) if hasattr(rel, 'properties') else {}
            props['from_id'] = from_id
            props['to_id'] = to_id
            props['node_a'] = from_id  # for link_scoring compatibility
            props['node_b'] = to_id    # for link_scoring compatibility
            props['type'] = rel.relation if hasattr(rel, 'relation') else ''

            # Normalize polarity: convert list format [a→b, b→a] to polarity_ab/polarity_ba
            # This handles both new schema (polarity as list) and legacy (polarity_ab/polarity_ba)
            polarity = props.get('polarity')
            if polarity is not None:
                if isinstance(polarity, (list, tuple)) and len(polarity) >= 2:
                    props['polarity_ab'] = float(polarity[0])
                    props['polarity_ba'] = float(polarity[1])
                elif isinstance(polarity, (int, float)):
                    # Single value - use for both directions
                    props['polarity_ab'] = float(polarity)
                    props['polarity_ba'] = float(polarity)
            # Ensure defaults if not set
            if 'polarity_ab' not in props:
                props['polarity_ab'] = 0.5
            if 'polarity_ba' not in props:
                props['polarity_ba'] = 0.5

            # Parse embedding if stored as string
            if 'embedding' in props:
                props['embedding'] = _parse_embedding(props['embedding'])

            return props

        async def get_node(node_id: str) -> Optional[Dict[str, Any]]:
            try:
                result = graph.query(f"MATCH (n {{id: '{node_id}'}}) RETURN n")
                if result.result_set:
                    return _node_to_dict(result.result_set[0][0])
            except:
                pass
            return None

        async def get_node_embedding(node_id: str) -> Optional[List[float]]:
            node = await get_node(node_id)
            return node.get('embedding') if node else None

        async def get_outgoing_links(node_id: str) -> List[Dict[str, Any]]:
            """Get all traversable links from a node (both directions)."""
            try:
                links = []
                # Outgoing links (node → target)
                result = graph.query(f"""
                    MATCH (n {{id: '{node_id}'}})-[r]->(m)
                    RETURN r, n.id as from_id, m.id as to_id, m.node_type as to_type
                """)
                for row in result.result_set:
                    rel, from_id, to_id, to_type = row
                    link = _rel_to_dict(rel, from_id, to_id)
                    link['to_type'] = to_type
                    links.append(link)

                # Incoming links (source → node) - traverse in reverse
                result = graph.query(f"""
                    MATCH (m)-[r]->(n {{id: '{node_id}'}})
                    RETURN r, m.id as source_id, n.id as target_id, m.node_type as source_type
                """)
                for row in result.result_set:
                    rel, source_id, target_id, source_type = row
                    # Swap: we traverse FROM node_id TO source_id
                    link = _rel_to_dict(rel, target_id, source_id)
                    link['node_a'] = target_id  # current node
                    link['node_b'] = source_id  # where we're going
                    link['to_id'] = source_id
                    link['from_id'] = target_id
                    link['to_type'] = source_type
                    # Swap polarity for reverse traversal
                    pab = link.get('polarity_ab', 0.5)
                    pba = link.get('polarity_ba', 0.5)
                    link['polarity_ab'] = pba
                    link['polarity_ba'] = pab
                    links.append(link)

                return links
            except Exception as e:
                print(f"get_outgoing_links error: {e}")
                return []

        async def get_incoming_links(node_id: str) -> List[Dict[str, Any]]:
            try:
                result = graph.query(f"""
                    MATCH (m)-[r]->(n {{id: '{node_id}'}})
                    RETURN r, m.id as from_id, n.id as to_id, m.node_type as from_type
                """)
                links = []
                for row in result.result_set:
                    rel, from_id, to_id, from_type = row
                    link = _rel_to_dict(rel, from_id, to_id)
                    link['from_type'] = from_type
                    links.append(link)
                return links
            except:
                return []

        async def get_link(link_id: str) -> Optional[Dict[str, Any]]:
            """Get link by ID."""
            try:
                result = graph.query(f"""
                    MATCH (a)-[r:link {{id: '{link_id}'}}]->(b)
                    RETURN r, a.id as from_id, b.id as to_id
                """)
                if result.result_set:
                    rel, from_id, to_id = result.result_set[0]
                    return _rel_to_dict(rel, from_id, to_id)
            except:
                pass
            return None

        async def get_link_embedding(link_id: str) -> Optional[List[float]]:
            link = await get_link(link_id)
            return link.get('embedding') if link else None

        async def get_all_narratives() -> List[tuple]:
            try:
                result = graph.query("MATCH (n {node_type: 'narrative'}) RETURN n.id, n.embedding")
                return [(row[0], row[1]) for row in result.result_set]
            except:
                return []

        async def is_narrative(node_id: str) -> bool:
            node = await get_node(node_id)
            return node.get('node_type') == 'narrative' if node else False

        async def is_moment(node_id: str) -> bool:
            node = await get_node(node_id)
            return node.get('node_type') == 'moment' if node else False

        async def update_node(node_id: str, updates: Dict[str, Any]) -> None:
            """Update node properties by ID."""
            if not updates:
                return
            set_parts = []
            for key, value in updates.items():
                if isinstance(value, str):
                    set_parts.append(f"n.{key} = '{value}'")
                elif isinstance(value, (int, float)):
                    set_parts.append(f"n.{key} = {value}")
            if set_parts:
                set_clause = ", ".join(set_parts)
                try:
                    graph.query(f"MATCH (n {{id: '{node_id}'}}) SET {set_clause}")
                except Exception as e:
                    print(f"update_node failed: {e}")

        async def update_link(link_id: str, updates: Dict[str, Any]) -> None:
            pass  # Not implemented for now

        async def create_narrative(data: Dict[str, Any]) -> str:
            """Persist narrative from crystallization."""
            import uuid
            narr_id = f"narrative_cryst_{uuid.uuid4().hex[:8]}"
            try:
                graph.query("""
                    CREATE (n:Narrative {
                        id: $id, name: $name, node_type: 'narrative',
                        weight: $weight, energy: $energy,
                        content: $content, synthesis: $synthesis
                    })
                """, {
                    'id': narr_id,
                    'name': data.get('name', ''),
                    'weight': data.get('weight', 1.0),
                    'energy': data.get('energy', 1.0),
                    'content': data.get('content', ''),
                    'synthesis': data.get('synthesis', ''),
                })
            except Exception as e:
                print(f"create_narrative failed: {e}")
            return narr_id

        async def create_link(data: Dict[str, Any]) -> str:
            """Persist link from crystallization (no embedding - causes feedback loop)."""
            import uuid
            link_id = f"link_{uuid.uuid4().hex[:8]}"
            node_a, node_b = data.get('node_a'), data.get('node_b')
            if not node_a or not node_b:
                return link_id
            polarity = data.get('polarity', [0.5, 0.5])

            # Don't embed during exploration - causes crystallization feedback loop
            # Crystallized links use default sem=0.5 until embedded by helper
            embedding = None

            try:
                params = {
                    'a': node_a, 'b': node_b, 'id': link_id,
                    'w': data.get('weight', 1.0),
                    'e': data.get('energy', 0.0),
                    'h': data.get('hierarchy', 0.0),
                    'p': data.get('permanence', 0.5),
                    'pab': polarity[0], 'pba': polarity[1] if len(polarity) > 1 else polarity[0],
                }
                if embedding:
                    params['emb'] = embedding
                    graph.query("""
                        MATCH (a {id: $a}), (b {id: $b})
                        CREATE (a)-[r:link {
                            id: $id, weight: $w, energy: $e,
                            hierarchy: $h, permanence: $p,
                            polarity_ab: $pab, polarity_ba: $pba,
                            embedding: $emb
                        }]->(b)
                    """, params)
                else:
                    graph.query("""
                        MATCH (a {id: $a}), (b {id: $b})
                        CREATE (a)-[r:link {
                            id: $id, weight: $w, energy: $e,
                            hierarchy: $h, permanence: $p,
                            polarity_ab: $pab, polarity_ba: $pba
                        }]->(b)
                    """, params)
            except Exception as e:
                print(f"create_link failed: {e}")
            return link_id

        return GraphInterface(
            get_node=get_node,
            get_node_embedding=get_node_embedding,
            get_outgoing_links=get_outgoing_links,
            get_incoming_links=get_incoming_links,
            get_link=get_link,
            get_link_embedding=get_link_embedding,
            get_all_narratives=get_all_narratives,
            is_narrative=is_narrative,
            is_moment=is_moment,
            update_node=update_node,
            update_link=update_link,
            create_narrative=create_narrative,
            create_link=create_link,
        )
    except Exception as e:
        print(f"Warning: Could not connect to graph: {e}")
        print("Using mock graph interface for testing.")
        return _get_mock_graph_interface()


def _get_mock_graph_interface() -> GraphInterface:
    """Mock graph interface for testing without FalkorDB."""

    async def get_node(node_id: str) -> Optional[Dict[str, Any]]:
        return {'id': node_id, 'name': node_id, 'node_type': 'actor'}

    async def get_node_embedding(node_id: str) -> Optional[List[float]]:
        return [0.1] * 384  # Mock embedding

    async def get_outgoing_links(node_id: str) -> List[Dict[str, Any]]:
        return []  # No links in mock

    async def get_incoming_links(node_id: str) -> List[Dict[str, Any]]:
        return []

    async def get_link_embedding(link_id: str) -> Optional[List[float]]:
        return [0.1] * 384

    async def get_all_narratives() -> List[tuple]:
        return []

    async def is_narrative(node_id: str) -> bool:
        return False

    async def is_moment(node_id: str) -> bool:
        return False

    async def update_node(node_id: str, updates: Dict[str, Any]) -> None:
        pass

    async def update_link(link_id: str, updates: Dict[str, Any]) -> None:
        pass

    async def create_narrative(data: Dict[str, Any]) -> str:
        return f"narr_{data.get('name', 'new')[:20]}"

    async def create_link(data: Dict[str, Any]) -> str:
        return f"link_new"

    return GraphInterface(
        get_node=get_node,
        get_node_embedding=get_node_embedding,
        get_outgoing_links=get_outgoing_links,
        get_incoming_links=get_incoming_links,
        get_link_embedding=get_link_embedding,
        get_all_narratives=get_all_narratives,
        is_narrative=is_narrative,
        is_moment=is_moment,
        update_node=update_node,
        update_link=update_link,
        create_narrative=create_narrative,
        create_link=create_link,
    )


def get_embedding(text: str) -> List[float]:
    """
    Get embedding for text using the embedding service.
    Fails loudly if service unavailable.
    """
    from runtime.infrastructure.embeddings.service import get_embedding_service
    svc = get_embedding_service()
    if not svc:
        raise RuntimeError("Embedding service unavailable")
    return svc.embed(text)


def format_result(
    result: ExplorationResult,
    debug: bool = False,
    log_path: Optional[Path] = None,
) -> str:
    """Format exploration result for display."""
    lines = []

    lines.append("=" * 60)
    lines.append("EXPLORATION RESULT")
    lines.append("=" * 60)
    lines.append(f"SubEntity:    {result.subentity_id}")
    lines.append(f"Actor:        {result.actor_id}")
    lines.append(f"State:        {result.state.value}")
    lines.append(f"Satisfaction: {result.satisfaction:.2f}")
    lines.append(f"Depth:        {result.depth}")
    lines.append(f"Duration:     {result.duration_s:.2f}s")
    lines.append("")

    # Found narratives
    if result.found_narratives:
        lines.append(f"FOUND NARRATIVES ({len(result.found_narratives)}):")
        sorted_narr = sorted(
            result.found_narratives.items(),
            key=lambda x: x[1],
            reverse=True
        )
        for narr_id, alignment in sorted_narr[:10]:
            marker = "*" if narr_id == result.crystallized else " "
            lines.append(f"  {marker} {narr_id}: {alignment:.3f}")
        if len(sorted_narr) > 10:
            lines.append(f"    ... and {len(sorted_narr) - 10} more")
    else:
        lines.append("FOUND NARRATIVES: (none)")

    lines.append("")

    # Crystallized
    if result.crystallized:
        lines.append(f"CRYSTALLIZED: {result.crystallized}")

    # Children
    if result.children_results:
        lines.append(f"\nCHILDREN ({len(result.children_results)}):")
        for child in result.children_results:
            lines.append(f"  - {child.subentity_id}: {len(child.found_narratives)} narratives, sat={child.satisfaction:.2f}")

    # Debug info
    if debug and log_path:
        lines.append("")
        lines.append("-" * 60)
        lines.append("DEBUG INFO")
        lines.append("-" * 60)
        lines.append(f"Log files:")
        lines.append(f"  JSONL: {log_path}.jsonl")
        lines.append(f"  TXT:   {log_path}.txt")
        lines.append("")
        lines.append("To view logs:")
        lines.append(f"  cat {log_path}.txt")
        lines.append(f"  jq . {log_path}.jsonl")

    lines.append("=" * 60)

    return "\n".join(lines)


async def run_exploration(
    query: str,
    actor_id: str,
    intention: Optional[str] = None,
    intention_type: str = "explore",
    origin_moment: Optional[str] = None,
    graph_name: Optional[str] = None,
    timeout: float = 30.0,
    max_depth: int = 10,
    debug: bool = False,
) -> tuple[ExplorationResult, Optional[Path]]:
    """
    Run SubEntity exploration.

    Args:
        query: What to search for
        actor_id: Actor doing the exploration
        intention: Why searching (defaults to query)
        intention_type: Type of intention (summarize, verify, find_next, explore, retrieve)
        origin_moment: Moment that triggered exploration
        graph_name: Graph to connect to
        timeout: Exploration timeout in seconds
        max_depth: Maximum traversal depth
        debug: Enable detailed logging

    Returns:
        (ExplorationResult, log_path if debug else None)
    """
    import uuid

    # Generate exploration ID
    exploration_id = f"exp_{uuid.uuid4().hex[:8]}"

    # Set up logging
    log_path = None
    logger = None
    if debug:
        log_dir = Path("engine/data/logs/traversal")
        log_path = log_dir / f"traversal_{exploration_id}"
        logger = create_traversal_logger(
            log_dir=log_dir,
            level=LogLevel.STEP,
            enable_human_readable=True,
            enable_jsonl=True,
        )

    # Get embeddings
    query_embedding = get_embedding(query)
    intention_text = intention or query
    intention_embedding = get_embedding(intention_text) if intention else query_embedding

    # Get graph interface
    graph = get_graph_interface(graph_name)

    # Configure exploration
    config = ExplorationConfig(
        max_depth=max_depth,
        timeout_s=timeout,
        min_branch_links=2,
    )

    # Run exploration with logger
    runner = ExplorationRunner(graph, config, logger=logger, exploration_id=exploration_id)

    # Log exploration start
    if logger:
        logger.exploration_start(
            exploration_id=exploration_id,
            actor_id=actor_id,
            origin_moment=origin_moment or "",
            intention=intention_text,
            intention_embedding=intention_embedding,
            tick=0,
        )

    try:
        result = await runner.explore(
            actor_id=actor_id,
            query=query,
            query_embedding=query_embedding,
            intention=intention_text,
            intention_embedding=intention_embedding,
            intention_type=intention_type,
            origin_moment=origin_moment,
        )

        # Log exploration end
        if logger:
            logger.exploration_end(
                exploration_id=exploration_id,
                found_narratives=result.found_narratives,
                crystallized=result.crystallized,
                satisfaction=result.satisfaction,
            )

        return result, log_path

    except ExplorationTimeoutError as e:
        if logger:
            logger.exploration_end(
                exploration_id=exploration_id,
                found_narratives={},
                crystallized=None,
                satisfaction=0.0,
            )
        print(f"ERROR: {e}", file=sys.stderr)
        raise


def explore_command(
    query: str,
    actor_id: str,
    intention: Optional[str] = None,
    intention_type: str = "explore",
    origin_moment: Optional[str] = None,
    graph_name: Optional[str] = None,
    timeout: float = 30.0,
    max_depth: int = 10,
    debug: bool = False,
    output_format: str = "text",
) -> int:
    """
    CLI command for exploration.

    Returns:
        Exit code (0 = success, 1 = error)
    """
    try:
        result, log_path = asyncio.run(run_exploration(
            query=query,
            actor_id=actor_id,
            intention=intention,
            intention_type=intention_type,
            origin_moment=origin_moment,
            graph_name=graph_name,
            timeout=timeout,
            max_depth=max_depth,
            debug=debug,
        ))

        if output_format == "json":
            output = {
                "subentity_id": result.subentity_id,
                "actor_id": result.actor_id,
                "state": result.state.value,
                "found_narratives": result.found_narratives,
                "crystallized": result.crystallized,
                "satisfaction": result.satisfaction,
                "depth": result.depth,
                "duration_s": result.duration_s,
            }
            if debug and log_path:
                output["log_jsonl"] = str(log_path) + ".jsonl"
                output["log_txt"] = str(log_path) + ".txt"
            print(json.dumps(output, indent=2))
        else:
            print(format_result(result, debug=debug, log_path=log_path))

        return 0

    except ExplorationTimeoutError:
        return 1
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        if debug:
            import traceback
            traceback.print_exc()
        return 1
