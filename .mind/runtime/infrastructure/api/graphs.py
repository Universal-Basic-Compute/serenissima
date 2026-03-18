"""
Graph Management API — Generic graph CRUD operations.

This is the mind-level API for managing FalkorDB graphs.
Game-specific logic (playthroughs, scenarios) belongs in the game layer.

Endpoints:
- POST   /api/graph/create       - Create a new graph (optionally clone from template)
- DELETE /api/graph/{name}       - Delete a graph
- GET    /api/graph              - List all graphs
- GET    /api/graph/{name}       - Get graph info (node/edge counts, labels)
- GET    /api/graph/{name}/nodes - List nodes with optional label filter
- POST   /api/graph/{name}/query - Execute raw Cypher (read-only)

DOCS: docs/infrastructure/api/API_Graph_Management.md
"""

import os
import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from falkordb import FalkorDB

from runtime.physics.graph import GraphQueries


logger = logging.getLogger(__name__)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateGraphRequest(BaseModel):
    """Request to create a new graph."""
    name: str  # Graph name (e.g., "blood_ledger_pt_abc123")
    copy_from: Optional[str] = None  # Template graph to clone from


class CreateGraphResponse(BaseModel):
    """Response after creating a graph."""
    name: str
    created: bool
    node_count: int = 0
    message: str = ""


class GraphInfo(BaseModel):
    """Information about a graph."""
    name: str
    node_count: int
    edge_count: int
    labels: List[str]


class QueryRequest(BaseModel):
    """Request to execute a Cypher query."""
    cypher: str
    params: Optional[Dict[str, Any]] = None


# =============================================================================
# ROUTER
# =============================================================================

def create_graphs_router(
    host: str = "localhost",
    port: int = 6379
) -> APIRouter:
    """Create the graphs management router."""
    router = APIRouter(prefix="/api/graph", tags=["graphs"])

    def get_db() -> FalkorDB:
        """Get FalkorDB connection."""
        db_host = os.environ.get("FALKORDB_HOST", host)
        db_port = int(os.environ.get("FALKORDB_PORT", port))
        return FalkorDB(host=db_host, port=db_port)

    def clone_graph(db: FalkorDB, source_name: str, target_name: str) -> Dict[str, int]:
        """
        Clone all nodes and edges from source graph to target.
        Returns dict with node_count and edge_count.
        """
        source = db.select_graph(source_name)
        target = db.select_graph(target_name)

        node_count = 0
        edge_count = 0

        # Get all nodes with their labels and properties
        result = source.query("""
            MATCH (n)
            RETURN labels(n) as labels, properties(n) as props
        """)

        for row in (result.result_set or []):
            labels, props = row
            if labels and props:
                label_str = ":".join(labels)
                # Build property string with parameters
                prop_parts = []
                params = {}
                for i, (k, v) in enumerate(props.items()):
                    param_name = f"p{i}"
                    prop_parts.append(f"{k}: ${param_name}")
                    params[param_name] = v

                prop_str = ", ".join(prop_parts)
                cypher = f"CREATE (n:{label_str} {{{prop_str}}})"
                target.query(cypher, params)
                node_count += 1

        # Get all edges with their properties
        # We use node IDs to match source/target
        result = source.query("""
            MATCH (a)-[r]->(b)
            RETURN
                labels(a) as a_labels, a.id as a_id,
                type(r) as r_type, properties(r) as r_props,
                labels(b) as b_labels, b.id as b_id
        """)

        for row in (result.result_set or []):
            a_labels, a_id, r_type, r_props, b_labels, b_id = row
            if a_id and b_id and r_type:
                a_label = a_labels[0] if a_labels else "Node"
                b_label = b_labels[0] if b_labels else "Node"

                # Build relationship property string
                params = {"a_id": a_id, "b_id": b_id}
                if r_props:
                    prop_parts = []
                    for i, (k, v) in enumerate(r_props.items()):
                        param_name = f"r{i}"
                        prop_parts.append(f"{k}: ${param_name}")
                        params[param_name] = v
                    prop_str = " {" + ", ".join(prop_parts) + "}"
                else:
                    prop_str = ""

                cypher = f"""
                    MATCH (a:{a_label} {{id: $a_id}}), (b:{b_label} {{id: $b_id}})
                    CREATE (a)-[r:{r_type}{prop_str}]->(b)
                """
                try:
                    target.query(cypher, params)
                    edge_count += 1
                except Exception as e:
                    logger.warning(f"Failed to clone edge {a_id}->{b_id}: {e}")

        return {"node_count": node_count, "edge_count": edge_count}

    @router.post("/create", response_model=CreateGraphResponse)
    async def create_graph(request: CreateGraphRequest):
        """
        Create a new graph.

        If copy_from is specified, clones all nodes and edges from that graph.
        Otherwise creates an empty graph.

        POST /api/graph/create
        Body: { "name": "my_graph", "copy_from": "seed" }
        """
        db = get_db()

        try:
            if request.copy_from:
                # Verify source exists and has data
                source = db.select_graph(request.copy_from)
                result = source.query("MATCH (n) RETURN count(n) as cnt")
                source_count = result.result_set[0][0] if result.result_set else 0

                if source_count == 0:
                    return CreateGraphResponse(
                        name=request.name,
                        created=True,
                        node_count=0,
                        message=f"Created empty graph (source '{request.copy_from}' was empty)"
                    )

                # Clone the graph
                logger.info(f"[Graph] Cloning '{request.copy_from}' -> '{request.name}'")
                result = clone_graph(db, request.copy_from, request.name)

                return CreateGraphResponse(
                    name=request.name,
                    created=True,
                    node_count=result["node_count"],
                    message=f"Cloned {result['node_count']} nodes, {result['edge_count']} edges from '{request.copy_from}'"
                )
            else:
                # Create empty graph
                graph = db.select_graph(request.name)
                # Ensure graph exists by running a no-op query
                graph.query("RETURN 1")

                return CreateGraphResponse(
                    name=request.name,
                    created=True,
                    node_count=0,
                    message="Created empty graph"
                )

        except Exception as e:
            logger.error(f"Failed to create graph '{request.name}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/{name}")
    async def delete_graph(name: str):
        """
        Delete a graph.

        WARNING: This permanently deletes all data in the graph.

        DELETE /api/graph/{name}
        """
        try:
            gq = GraphQueries(graph_name=name)

            # Delete all nodes and relationships
            gq.query("MATCH (n) DETACH DELETE n")

            # Note: FalkorDB doesn't have a "drop graph" command,
            # but deleting all nodes effectively empties it

            return {"deleted": True, "name": name}

        except Exception as e:
            logger.error(f"Failed to delete graph '{name}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("", response_model=List[str])
    async def list_graphs():
        """
        List all available graphs.

        GET /api/graph
        """
        try:
            # FalkorDB stores graphs with a prefix
            # We need to query Redis directly for this
            gq = GraphQueries()  # Default connection

            # This is FalkorDB-specific - list all graphs
            # Note: This may not work on all FalkorDB versions
            try:
                # Try the FalkorDB-specific command
                import redis
                host = os.environ.get("FALKORDB_HOST", "localhost")
                port = int(os.environ.get("FALKORDB_PORT", "6379"))
                r = redis.Redis(host=host, port=port)

                # List all keys and filter for graphs
                keys = r.keys("*")
                graphs = [k.decode() for k in keys if not k.decode().startswith("_")]
                return graphs
            except Exception:
                # Fallback: just return the default graph name
                return [os.environ.get("GRAPH_NAME", "blood_ledger")]

        except Exception as e:
            logger.error(f"Failed to list graphs: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{name}", response_model=GraphInfo)
    async def get_graph_info(name: str):
        """
        Get information about a graph.

        GET /api/graph/{name}
        """
        try:
            gq = GraphQueries(graph_name=name)

            # Get node count
            node_result = gq.query("MATCH (n) RETURN count(n) as count")
            node_count = node_result[0].get('count', 0) if node_result else 0

            # Get edge count
            edge_result = gq.query("MATCH ()-[r]->() RETURN count(r) as count")
            edge_count = edge_result[0].get('count', 0) if edge_result else 0

            # Get labels
            label_result = gq.query("CALL db.labels()")
            labels = [r.get('label', '') for r in label_result] if label_result else []

            return GraphInfo(
                name=name,
                node_count=node_count,
                edge_count=edge_count,
                labels=labels
            )

        except Exception as e:
            logger.error(f"Failed to get graph info for '{name}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{name}/nodes")
    async def list_nodes(
        name: str,
        label: Optional[str] = Query(None, description="Filter by node label"),
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0)
    ):
        """
        List nodes with optional filtering.

        GET /api/graph/{name}/nodes?label=Character&limit=50
        """
        try:
            db = get_db()
            graph = db.select_graph(name)

            # Build query
            if label:
                cypher = f"MATCH (n:{label}) RETURN n SKIP $offset LIMIT $limit"
                count_cypher = f"MATCH (n:{label}) RETURN count(n)"
            else:
                cypher = "MATCH (n) RETURN n SKIP $offset LIMIT $limit"
                count_cypher = "MATCH (n) RETURN count(n)"

            # Get total count
            result = graph.query(count_cypher)
            total = result.result_set[0][0] if result.result_set else 0

            # Get nodes
            result = graph.query(cypher, {"offset": offset, "limit": limit})
            nodes = []
            for row in (result.result_set or []):
                node = row[0]
                if hasattr(node, 'properties'):
                    node_dict = dict(node.properties)
                    node_dict['_labels'] = list(node.labels) if hasattr(node, 'labels') else []
                    nodes.append(node_dict)

            return {
                "nodes": nodes,
                "total": total,
                "limit": limit,
                "offset": offset
            }
        except Exception as e:
            logger.error(f"Failed to list nodes for graph '{name}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{name}/query")
    async def query_graph(name: str, request: QueryRequest):
        """
        Execute a Cypher query on the graph.

        POST /api/graph/{name}/query
        Body: { "cypher": "MATCH (n) RETURN n LIMIT 10", "params": {} }

        Note: This is for read operations. Use mutations for writes.
        """
        # Basic safety check for mutations
        cypher_upper = request.cypher.upper()
        if any(word in cypher_upper for word in ["CREATE", "DELETE", "SET", "REMOVE", "MERGE"]):
            raise HTTPException(
                status_code=400,
                detail="Mutation queries not allowed via /query. Use GraphOps for writes."
            )

        try:
            gq = GraphQueries(graph_name=name)
            result = gq.query(request.cypher, request.params or {})
            return {"result": result, "count": len(result)}

        except Exception as e:
            logger.error(f"Query failed on graph '{name}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/{name}/mutate")
    async def mutate_graph(name: str, request: QueryRequest):
        """
        Execute a Cypher mutation on the graph.

        POST /api/graph/{name}/mutate
        Body: { "cypher": "CREATE (n:Actor {id: 'test'})", "params": {} }

        Allowed operations: CREATE, MERGE, SET, DELETE, REMOVE
        """
        try:
            db = get_db()
            graph = db.select_graph(name)

            result = graph.query(request.cypher, request.params or {})

            # Extract stats from result
            stats = {}
            if hasattr(result, 'statistics'):
                stats = {
                    'nodes_created': result.statistics.get('Nodes created', 0),
                    'nodes_deleted': result.statistics.get('Nodes deleted', 0),
                    'relationships_created': result.statistics.get('Relationships created', 0),
                    'relationships_deleted': result.statistics.get('Relationships deleted', 0),
                    'properties_set': result.statistics.get('Properties set', 0),
                }

            # Extract result set if any
            rows = []
            for row in (result.result_set or []):
                if hasattr(row[0], 'properties'):
                    rows.append(dict(row[0].properties))
                else:
                    rows.append(row)

            return {"success": True, "stats": stats, "result": rows}

        except Exception as e:
            logger.error(f"Mutation failed on graph '{name}': {e}")
            raise HTTPException(status_code=500, detail=str(e))

    return router
