"""
POST /l4/confirm — Org identity verification + citizen liveness check.

The org proves its identity by signing a challenge with its RSA private key.
The server verifies against the TOFU-registered public key in L4 FalkorDB,
then pings each citizen's L1 graph to check who's alive.

Returns:
  {
    "org_id": "mind-protocol",
    "verified": true,
    "total_citizens": 172,
    "reachable": 45,
    "citizens": [
      {"handle": "forge", "name": "Marcus Forge", "reachable": true, "has_brain": true, "has_keys": true},
      ...
    ]
  }
"""

import base64
import hashlib
import json
import logging
import os
import subprocess
import tempfile
import time
from pathlib import Path

logger = logging.getLogger("mind.l4.confirm")

L4_HOST = os.environ.get("L4_FALKORDB_HOST", os.environ.get("FALKORDB_HOST", "mind-protocol-falkordb"))
L4_PORT = int(os.environ.get("L4_FALKORDB_PORT", os.environ.get("FALKORDB_PORT", "6379")))
L4_GRAPH = os.environ.get("L4_GRAPH", "mind_protocol")


def _l4_graph():
    from falkordb import FalkorDB
    return FalkorDB(host=L4_HOST, port=L4_PORT).select_graph(L4_GRAPH)


def verify_signature(org_id, challenge, signature_b64):
    """Verify RSA-PSS signature against TOFU-registered public key in L4."""
    graph = _l4_graph()

    # Fetch stored public key
    result = graph.query(
        "MATCH (k {id: $kid}) RETURN k.content",
        {"kid": f"{org_id}_public_key"},
    )
    if not result.result_set or not result.result_set[0][0]:
        return False, "No TOFU public key registered for this org"

    pubkey_pem = result.result_set[0][0]

    # Write pubkey and signature to temp files for openssl verification
    with tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False) as pk:
        pk.write(pubkey_pem)
        pk_path = pk.name

    with tempfile.NamedTemporaryFile(mode="wb", suffix=".sig", delete=False) as sig:
        sig.write(base64.b64decode(signature_b64))
        sig_path = sig.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as ch:
        ch.write(challenge)
        ch_path = ch.name

    try:
        result = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", pk_path, "-signature", sig_path, ch_path],
            capture_output=True, text=True,
        )
        verified = result.returncode == 0
        return verified, "OK" if verified else result.stderr.strip()
    except Exception as e:
        return False, str(e)
    finally:
        for p in [pk_path, sig_path, ch_path]:
            try:
                os.unlink(p)
            except OSError:
                pass


def check_citizen_liveness(handle):
    """Check if a citizen has a reachable L1 brain graph.

    Tries to query the citizen's graph for their Actor node.
    """
    host = os.environ.get("FALKORDB_HOST", "localhost")
    port = int(os.environ.get("FALKORDB_PORT", "6379"))

    has_brain = False
    has_keys = False
    reachable = False

    try:
        from falkordb import FalkorDB
        client = FalkorDB(host=host, port=port)

        # Check citizen graph (try multiple naming conventions)
        citizen_id = f"CITIZEN_{handle}"
        for graph_name in [L4_GRAPH, f"brain_{handle}", "venezia", "cities_of_light"]:
            try:
                g = client.select_graph(graph_name)
                result = g.query(
                    "MATCH (a {id: $id}) RETURN a.name, a.synthesis",
                    {"id": citizen_id},
                )
                if result.result_set:
                    has_brain = True
                    reachable = True
                    break
            except Exception:
                continue

        # Check for keys in L4
        l4 = client.select_graph(L4_GRAPH)
        key_result = l4.query(
            "MATCH (k {id: $kid}) RETURN k.content",
            {"kid": f"{handle}_public_key"},
        )
        has_keys = bool(key_result.result_set and key_result.result_set[0][0])

    except Exception as e:
        logger.debug(f"Liveness check failed for {handle}: {e}")

    return {"reachable": reachable, "has_brain": has_brain, "has_keys": has_keys}


def confirm_org(org_id, challenge, signature_b64):
    """Full confirm flow: verify org identity, then check all citizens."""

    # 1. Verify signature
    verified, msg = verify_signature(org_id, challenge, signature_b64)

    if not verified:
        return {
            "org_id": org_id,
            "verified": False,
            "error": msg,
            "total_citizens": 0,
            "reachable": 0,
            "citizens": [],
        }

    # 2. Find all citizens linked to this org in L4
    graph = _l4_graph()
    result = graph.query(
        "MATCH (c)-[r:link]->(o {id: $oid}) "
        "WHERE r.type = 'MEMBER_OF' AND c.type = 'citizen' "
        "RETURN c.handle, c.name",
        {"oid": org_id},
    )

    citizens = []
    total = 0
    reachable_count = 0

    for row in (result.result_set or []):
        handle = row[0]
        name = row[1] or handle
        if not handle:
            continue
        total += 1

        liveness = check_citizen_liveness(handle)
        citizens.append({
            "handle": handle,
            "name": name,
            **liveness,
        })
        if liveness["reachable"]:
            reachable_count += 1

    return {
        "org_id": org_id,
        "verified": True,
        "total_citizens": total,
        "reachable": reachable_count,
        "citizens": citizens,
    }


# ── FastAPI / Express route handler ──────────────────────────────────────

def handle_confirm_request(body):
    """Handle POST /l4/confirm request body."""
    org_id = body.get("org_id")
    challenge = body.get("challenge")
    signature = body.get("signature")

    if not org_id or not challenge or not signature:
        return {"error": "Missing required fields: org_id, challenge, signature"}, 400

    result = confirm_org(org_id, challenge, signature)
    return result, 200 if result.get("verified") else 403
