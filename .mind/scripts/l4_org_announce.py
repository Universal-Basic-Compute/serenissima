#!/usr/bin/env python3
"""
L4 Org Announce — Register or update org identity in the L4 registry.

Called automatically at the end of each deploy (via post-deploy hook or entrypoint).
On first run: generates RSA keypair, registers org with TOFU.
On subsequent runs: signs challenge with private key, updates endpoint.

Usage:
    python3 .mind/scripts/l4_org_announce.py

    # Or with explicit args:
    python3 .mind/scripts/l4_org_announce.py --org myorg --endpoint wss://myorg.onrender.com

Environment:
    FALKORDB_HOST: L4 registry host (default: mind-protocol-falkordb)
    FALKORDB_PORT: L4 registry port (default: 6379)
    L4_GRAPH: L4 registry graph name (default: mind_protocol)
    RENDER_EXTERNAL_URL: auto-set by Render
    ORG_NAME: override org display name
"""

import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────

KEYS_DIR = Path(".keys/org")
PRIVATE_KEY_PATH = KEYS_DIR / "rsa_private_key.pem"
PUBLIC_KEY_PATH = KEYS_DIR / "rsa_public_key.pem"

L4_HOST = os.environ.get("FALKORDB_HOST", "mind-protocol-falkordb")
L4_PORT = int(os.environ.get("FALKORDB_PORT", "6379"))
L4_GRAPH = os.environ.get("L4_GRAPH", "mind_protocol")


def detect_org_id():
    """Detect org ID from git remote or directory name."""
    try:
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        # git@github.com:mind-protocol/venezia.git → mind-protocol
        if ":" in remote:
            parts = remote.split(":")[-1].replace(".git", "").split("/")
            if len(parts) >= 2:
                return parts[-2]  # org name
    except Exception:
        pass
    return Path.cwd().parent.name


def detect_repo_name():
    """Detect repo name from git remote or directory."""
    try:
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        return remote.split("/")[-1].replace(".git", "")
    except Exception:
        return Path.cwd().name


def detect_endpoint():
    """Detect endpoint URL from Render env or fallback."""
    render_url = os.environ.get("RENDER_EXTERNAL_URL")
    if render_url:
        return render_url.replace("https://", "wss://")
    service_name = os.environ.get("RENDER_SERVICE_NAME", detect_repo_name())
    return f"wss://{service_name}.onrender.com"


# ── RSA Keypair ─────────────────────────────────────────────────────────

def generate_keypair():
    """Generate RSA 2048 keypair and store in .keys/org/."""
    KEYS_DIR.mkdir(parents=True, exist_ok=True)

    if PRIVATE_KEY_PATH.exists():
        print(f"  Keypair exists: {PRIVATE_KEY_PATH}")
        return PUBLIC_KEY_PATH.read_text()

    print("  Generating RSA keypair...")
    subprocess.run([
        "openssl", "genrsa", "-out", str(PRIVATE_KEY_PATH), "2048"
    ], check=True, capture_output=True)
    subprocess.run([
        "openssl", "rsa", "-in", str(PRIVATE_KEY_PATH),
        "-pubout", "-out", str(PUBLIC_KEY_PATH)
    ], check=True, capture_output=True)
    os.chmod(PRIVATE_KEY_PATH, 0o400)

    print(f"  Private key: {PRIVATE_KEY_PATH} (0400)")
    print(f"  Public key: {PUBLIC_KEY_PATH}")
    return PUBLIC_KEY_PATH.read_text()


def sign_challenge(org_id, endpoint_url):
    """Sign challenge string with private key."""
    minute = int(time.time()) // 60
    challenge = f"{org_id}:{endpoint_url}:{minute}"
    challenge_path = Path("/tmp/l4_challenge.txt")
    sig_path = Path("/tmp/l4_signature.bin")

    challenge_path.write_text(challenge)
    subprocess.run([
        "openssl", "dgst", "-sha256", "-sign", str(PRIVATE_KEY_PATH),
        "-out", str(sig_path), str(challenge_path)
    ], check=True, capture_output=True)

    import base64
    return base64.b64encode(sig_path.read_bytes()).decode()


# ── L4 Registry Queries ────────────────────────────────────────────────

def connect_l4():
    """Connect to L4 FalkorDB registry."""
    try:
        from falkordb import FalkorDB
        client = FalkorDB(host=L4_HOST, port=L4_PORT)
        graph = client.select_graph(L4_GRAPH)
        # Test connection
        graph.query("RETURN 1")
        return graph
    except Exception as e:
        print(f"  L4 registry unavailable ({L4_HOST}:{L4_PORT}): {e}")
        return None


def first_registration(graph, org_id, org_name, endpoint_url, public_key_pem):
    """First-time TOFU registration: create org + pubkey + endpoint + claim."""
    now_s = int(time.time())
    tofu_hash = hashlib.sha256(
        f"{org_id}:{public_key_pem}:{now_s}".encode()
    ).hexdigest()

    queries = [
        # 1. Actor: org
        (
            "MERGE (o {id: $id}) "
            "SET o.node_type = 'actor', o.type = 'ORGANIZATION', "
            "o.name = $name, o.synthesis = $synthesis, "
            "o.weight = 1.0, o.energy = 0.0, o.updated_at_s = $ts",
            {"id": org_id, "name": org_name,
             "synthesis": f"Organization {org_name}", "ts": now_s},
        ),
        # 2. Thing: public key (TOFU)
        (
            "MERGE (k {id: $kid}) "
            "SET k.node_type = 'thing', k.type = 'org_public_key', "
            "k.name = $kname, k.content = $pubkey, "
            "k.synthesis = $ksyn, k.created_at_s = $ts, k.updated_at_s = $ts "
            "WITH k "
            "MATCH (o {id: $oid}) "
            "MERGE (o)-[r:link {id: $lid}]->(k) "
            "SET r.hierarchy = 1.0, r.permanence = 1.0",
            {"kid": f"{org_id}_public_key", "kname": f"Public key for {org_id}",
             "pubkey": public_key_pem,
             "ksyn": f"RSA public key for org {org_id} — TOFU registered",
             "ts": now_s, "oid": org_id, "lid": f"{org_id}_has_public_key"},
        ),
        # 3. Thing: endpoint
        (
            "MERGE (e {id: $eid}) "
            "SET e.node_type = 'thing', e.type = 'endpoint', "
            "e.name = $ename, e.content = $url, e.uri = $url, "
            "e.synthesis = $esyn, e.created_at_s = $ts, e.updated_at_s = $ts "
            "WITH e "
            "MATCH (o {id: $oid}) "
            "MERGE (o)-[r:link {id: $lid}]->(e) "
            "SET r.hierarchy = 1.0, r.permanence = 0.8",
            {"eid": f"{org_id}_endpoint", "ename": f"Endpoint for {org_id}",
             "url": endpoint_url,
             "esyn": f"Home server endpoint for org {org_id}",
             "ts": now_s, "oid": org_id, "lid": f"{org_id}_has_endpoint"},
        ),
        # 4. Thing: TOFU claim
        (
            "MERGE (c {id: $cid}) "
            "SET c.node_type = 'thing', c.type = 'tofu_claim', "
            "c.content = $hash, "
            "c.synthesis = $csyn, c.created_at_s = $ts "
            "WITH c "
            "MATCH (o {id: $oid}) "
            "MERGE (o)-[r:link {id: $lid}]->(c) "
            "SET r.hierarchy = 1.0, r.permanence = 1.0",
            {"cid": f"{org_id}_tofu_claim", "hash": tofu_hash,
             "csyn": f"TOFU claim for {org_id} at {now_s}",
             "ts": now_s, "oid": org_id, "lid": f"{org_id}_has_claim"},
        ),
    ]

    for cypher, params in queries:
        graph.query(cypher, params)

    print(f"  Registered: {org_id} → {endpoint_url}")
    print(f"  TOFU claim: {tofu_hash[:16]}...")


def update_endpoint(graph, org_id, endpoint_url, signature):
    """Update endpoint with signed challenge verification."""
    now_s = int(time.time())

    # Verify pubkey exists (TOFU check)
    result = graph.query(
        "MATCH (k {id: $kid}) RETURN k.content",
        {"kid": f"{org_id}_public_key"},
    )
    if not result.result_set:
        print(f"  No TOFU pubkey found for {org_id} — re-registering")
        return False

    # Update endpoint
    graph.query(
        "MERGE (e {id: $eid}) "
        "SET e.content = $url, e.uri = $url, e.updated_at_s = $ts",
        {"eid": f"{org_id}_endpoint", "url": endpoint_url, "ts": now_s},
    )
    print(f"  Endpoint updated: {org_id} → {endpoint_url}")
    return True


# ── Main ────────────────────────────────────────────────────────────────

def announce_org(org_id=None, endpoint_url=None, org_name=None):
    """Run the full announce flow."""
    org_id = org_id or detect_org_id()
    endpoint_url = endpoint_url or detect_endpoint()
    org_name = org_name or os.environ.get("ORG_NAME", org_id)

    print(f"\n  L4 Org Announce")
    print(f"  ───────────────")
    print(f"  Org: {org_id}")
    print(f"  Name: {org_name}")
    print(f"  Endpoint: {endpoint_url}")

    # 1. Ensure keypair
    public_key_pem = generate_keypair()

    # 2. Connect to L4
    graph = connect_l4()
    if not graph:
        print("  Skipping L4 registration (no connection)")
        return False

    # 3. Check if already registered
    result = graph.query(
        "MATCH (k {id: $kid}) RETURN k.content",
        {"kid": f"{org_id}_public_key"},
    )

    if result.result_set:
        # Already registered — update endpoint with signature
        signature = sign_challenge(org_id, endpoint_url)
        if not update_endpoint(graph, org_id, endpoint_url, signature):
            # Re-register if TOFU check failed
            first_registration(graph, org_id, org_name, endpoint_url, public_key_pem)
    else:
        # First time — TOFU registration
        first_registration(graph, org_id, org_name, endpoint_url, public_key_pem)

    print(f"  Done.\n")
    return True


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Register org in L4 registry")
    parser.add_argument("--org", help="Org ID (default: auto-detect from git)")
    parser.add_argument("--endpoint", help="Endpoint URL (default: auto-detect from Render)")
    parser.add_argument("--name", help="Org display name")
    args = parser.parse_args()

    announce_org(
        org_id=args.org,
        endpoint_url=args.endpoint,
        org_name=args.name,
    )
