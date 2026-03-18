"""
CLI helper for Connectome graph reads.

Usage:
  python -m mind.physics.graph.connectome_read_cli --search "query" --threshold 0.4 --hops 2
  python -m mind.physics.graph.connectome_read_cli --cypher "MATCH (n) RETURN n"
  python -m mind.physics.graph.connectome_read_cli --nl "all links"
"""

import argparse
import json
import os
import sys

from runtime.physics.graph.graph_ops import GraphReadOps


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", default="seed")
    parser.add_argument("--host", default=os.getenv("MIND_FALKORDB_HOST", "localhost"))
    parser.add_argument("--port", type=int, default=int(os.getenv("MIND_FALKORDB_PORT", "6379")))
    parser.add_argument("--search", default=None)
    parser.add_argument("--threshold", type=float, default=0.3)
    parser.add_argument("--hops", type=int, default=1)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--cypher", default=None)
    parser.add_argument("--nl", default=None)
    parser.add_argument("--list-graphs", action="store_true")
    args = parser.parse_args()

    try:
        read = GraphReadOps(graph_name=args.graph, host=args.host, port=args.port)

        if args.list_graphs:
            result = {"graphs": read.list_graphs()}
        elif args.search:
            result = read.search_semantic(
                args.search,
                threshold=args.threshold,
                hops=max(1, args.hops),
                limit=max(1, args.limit),
            )
        elif args.cypher:
            result = read.query_cypher(args.cypher)
        elif args.nl:
            result = read.query_natural_language(args.nl)
        else:
            result = read.fetch_full_graph()

        sys.stdout.write(json.dumps(result, ensure_ascii=True))
        return 0
    except Exception as exc:
        payload = {"error": str(exc), "type": exc.__class__.__name__}
        sys.stdout.write(json.dumps(payload, ensure_ascii=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
