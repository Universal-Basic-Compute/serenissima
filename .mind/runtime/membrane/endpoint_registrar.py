"""
Endpoint Registrar — Auto-registers this MCP instance in the L4 graph on startup.

When the MCP server starts:
1. Determines the citizen_id (from MIND_CITIZEN_ID env var or .mind/ config)
2. Determines the public URL (from RENDER_EXTERNAL_URL or MIND_PUBLIC_URL env var)
3. Determines the repo name (from git remote or MIND_REPO_NAME env var)
4. Registers the endpoint in the L4 graph as a Thing node linked to the Actor

On shutdown (SIGTERM/SIGINT):
5. Marks the endpoint as "inactive" (doesn't delete — just status change)

Environment variables:
- MIND_CITIZEN_ID: The citizen running this instance (e.g., "nervo")
- RENDER_EXTERNAL_URL: Render provides this automatically for web services
- MIND_PUBLIC_URL: Override for public URL (e.g., "https://api.mindprotocol.ai")
- MIND_REPO_NAME: Override for repo name (default: detected from git)
- L4_GRAPH_HOST: L4 registry graph host (default: localhost)
- L4_GRAPH_PORT: L4 registry graph port (default: 6379)
- L4_GRAPH_NAME: L4 registry graph name (default: mind_protocol)

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import atexit
import logging
import os
import signal
import subprocess
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("mind.endpoint_registrar")


def detect_repo_name() -> str:
    """Detect repo name from git remote or MIND_REPO_NAME env var."""
    repo_name = os.environ.get("MIND_REPO_NAME")
    if repo_name:
        return repo_name
    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            # Extract repo name from URL: "...github.com/user/repo.git" -> "repo"
            url = result.stdout.strip()
            return url.split("/")[-1].replace(".git", "")
    except Exception:
        pass
    # Fallback: directory name
    return Path.cwd().name


def detect_citizen_id() -> str:
    """Detect citizen ID from env var or .mind/ config."""
    citizen_id = os.environ.get("MIND_CITIZEN_ID")
    if citizen_id:
        return citizen_id
    # Try reading from citizens/ directory structure
    cwd = Path.cwd()
    if "citizens" in str(cwd):
        # e.g., /home/mind-protocol/cities-of-light/citizens/nervo → "nervo"
        parts = cwd.parts
        if "citizens" in parts:
            idx = parts.index("citizens")
            if idx + 1 < len(parts):
                return parts[idx + 1]
    return "unknown"


def detect_public_url() -> str:
    """Detect public URL from Render or env var."""
    # Render provides RENDER_EXTERNAL_URL automatically
    render_url = os.environ.get("RENDER_EXTERNAL_URL")
    if render_url:
        return render_url
    public_url = os.environ.get("MIND_PUBLIC_URL")
    if public_url:
        return public_url
    return "http://localhost:8800"


def compute_ws_endpoint(public_url: str) -> str:
    """Compute WebSocket endpoint from public URL."""
    ws_url = public_url.replace("https://", "wss://").replace("http://", "ws://")
    if not ws_url.endswith("/ws"):
        ws_url = ws_url.rstrip("/") + "/ws"
    return ws_url


class EndpointRegistrar:
    """Manages this MCP instance's endpoint registration in the L4 graph."""

    def __init__(self):
        self.citizen_id = detect_citizen_id()
        self.repo_name = detect_repo_name()
        self.public_url = detect_public_url()
        self.ws_endpoint = compute_ws_endpoint(self.public_url)
        self.endpoint_id = f"{self.citizen_id}_endpoint_{self.repo_name}"
        self._registered = False
        self._graph = None

    def _connect_l4(self):
        """Connect to the L4 registry graph."""
        if self._graph:
            return self._graph
        try:
            from falkordb import FalkorDB
            host = os.environ.get("L4_GRAPH_HOST", "localhost")
            port = int(os.environ.get("L4_GRAPH_PORT", "6379"))
            graph_name = os.environ.get("L4_GRAPH_NAME", "mind_protocol")
            db = FalkorDB(host=host, port=port)
            self._graph = db.select_graph(graph_name)
            return self._graph
        except Exception as e:
            logger.warning(f"Cannot connect to L4 graph: {e}")
            return None

    def register(self):
        """Register this endpoint in the L4 graph."""
        graph = self._connect_l4()
        if not graph:
            logger.warning("Skipping endpoint registration (no L4 graph)")
            return False

        try:
            now = datetime.now(timezone.utc).isoformat()

            # MERGE the endpoint Thing node (idempotent)
            graph.query(
                """MERGE (t {id: $eid})
                   SET t.node_type = 'thing',
                       t.type = 'citizen_endpoint',
                       t.name = $name,
                       t.content = $url,
                       t.uri = $url,
                       t.synthesis = $synthesis,
                       t.repo_name = $repo,
                       t.status = 'active',
                       t.registered_at = $now,
                       t.last_heartbeat = $now""",
                {
                    "eid": self.endpoint_id,
                    "name": f"Endpoint {self.citizen_id}/{self.repo_name}",
                    "url": self.ws_endpoint,
                    "synthesis": f"MCP endpoint for {self.citizen_id} on {self.repo_name}",
                    "repo": self.repo_name,
                    "now": now,
                },
            )

            # MERGE the SERVES link from Actor to endpoint
            graph.query(
                """MATCH (a {id: $cid}), (t {id: $eid})
                   MERGE (a)-[r:link {type: 'SERVES'}]->(t)
                   SET r.weight = 1.0, r.permanence = 0.8""",
                {"cid": self.citizen_id, "eid": self.endpoint_id},
            )

            self._registered = True
            logger.info(
                f"Registered endpoint: {self.citizen_id} @ {self.ws_endpoint} "
                f"(repo: {self.repo_name}, id: {self.endpoint_id})"
            )
            return True
        except Exception as e:
            logger.error(f"Endpoint registration failed: {e}")
            return False

    def deregister(self):
        """Mark this endpoint as inactive (on shutdown)."""
        if not self._registered:
            return
        graph = self._connect_l4()
        if not graph:
            return
        try:
            graph.query(
                """MATCH (t {id: $eid}) SET t.status = 'inactive', t.stopped_at = $now""",
                {
                    "eid": self.endpoint_id,
                    "now": datetime.now(timezone.utc).isoformat(),
                },
            )
            logger.info(f"Deregistered endpoint: {self.endpoint_id}")
        except Exception:
            pass  # Best effort on shutdown

    def heartbeat(self):
        """Update last_heartbeat timestamp (call periodically)."""
        graph = self._connect_l4()
        if not graph:
            return
        try:
            graph.query(
                """MATCH (t {id: $eid}) SET t.last_heartbeat = $now""",
                {
                    "eid": self.endpoint_id,
                    "now": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            pass


# Singleton
_registrar = None


def get_registrar() -> EndpointRegistrar:
    global _registrar
    if _registrar is None:
        _registrar = EndpointRegistrar()
    return _registrar


def auto_register():
    """Call this from server.py startup to auto-register and setup shutdown hook."""
    registrar = get_registrar()
    success = registrar.register()
    if success:
        # Register shutdown hook
        atexit.register(registrar.deregister)
        # Also handle SIGTERM (Render sends this)
        def _handle_sigterm(signum, frame):
            registrar.deregister()
            raise SystemExit(0)
        signal.signal(signal.SIGTERM, _handle_sigterm)
    return success
