"""
L4 Org Self-Announce — TOFU (Trust On First Use) endpoint registration.

At boot, the home server announces itself to the L4 FalkorDB registry:
  - First boot: CLAIM — generate RSA keypair, register public key + endpoint
  - Subsequent boots: VERIFY — sign announcement, L4 checks signature

The org's public key is stored in L4 (FalkorDB graph `mind_protocol`).
The org's private key stays in `.keys/org/rsa_private_key.pem` on the server.
Once claimed, only the holder of the private key can update the org's endpoint.

Usage:
    from runtime.l4.org_self_announce import announce_org
    result = announce_org(
        org_id="mind-protocol",
        endpoint_url="wss://mind-mcp.onrender.com",
        falkordb_host="mind-protocol-falkordb",
        falkordb_port=6379,
    )
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("l4.announce")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
KEYS_DIR = PROJECT_ROOT / ".keys"
L4_GRAPH_NAME = os.environ.get("L4_GRAPH_NAME", "mind_protocol")


def announce_org(
    org_id: str,
    endpoint_url: str,
    org_name: str = "",
    website: str = "",
    universe: str = "",
    description: str = "",
    falkordb_host: str = "localhost",
    falkordb_port: int = 6379,
) -> dict:
    """Announce this org's endpoint to L4 registry.

    TOFU protocol:
      - If org has no public key in L4: CLAIM (first use, register key)
      - If org has public key in L4: VERIFY (sign + verify before update)

    Returns dict with status, action taken, and details.
    """
    from falkordb import FalkorDB

    display_name = org_name or org_id.replace("-", " ").replace("_", " ").title()

    # Connect to L4 graph
    db = FalkorDB(host=falkordb_host, port=falkordb_port)
    graph = db.select_graph(L4_GRAPH_NAME)

    # Check: does this org already have a public key registered?
    existing_key = _get_org_public_key(graph, org_id)

    if existing_key is None:
        result = _claim_org(graph, org_id, endpoint_url, org_name, website)
    else:
        result = _update_org(graph, org_id, endpoint_url, existing_key, org_name, website)

    # Mirror org to L3 universe graph
    l3_graph = universe or os.environ.get("L3_GRAPH", "universe")
    if l3_graph:
        try:
            db_l3 = FalkorDB(host=falkordb_host, port=falkordb_port)
            l3 = db_l3.select_graph(l3_graph)
            _mirror_org_to_l3(l3, org_id, display_name, website, description, int(time.time()))
            result["l3_mirrored"] = l3_graph
        except Exception as e:
            logger.debug(f"L3 mirror for org {org_id}: {e}")

    return result


def _mirror_org_to_l3(l3, org_id, display_name, website, description, now_s):
    """Mirror org to L3 universe graph as a Space node (org = hall Space).

    In L3, an org is a Narrative that members BELIEVE in, with a hall Space
    that members get HAS_ACCESS to. The org actor in L3 carries dimensions
    that evolve through physics.
    """
    synthesis = display_name
    if description:
        synthesis += f" — {description[:150]}"

    # Org as actor node in L3
    l3.query(
        "MERGE (o {id: $org_id}) "
        "SET o.node_type = 'actor', o.type = 'organization', "
        "    o.name = $name, o.synthesis = $synthesis, "
        "    o.website = $website, "
        "    o.weight = 1.0, o.energy = 0.0, "
        "    o.stability = 0.5, o.recency = 1.0, "
        "    o.updated_at_s = $now",
        {"org_id": org_id, "name": display_name,
         "synthesis": synthesis, "website": website or "", "now": now_s},
    )

    # Org hall Space (the org's main space where members interact)
    hall_id = f"{org_id}_hall"
    l3.query(
        "MERGE (s {id: $sid}) "
        "SET s.node_type = 'space', s.type = 'hall', "
        "    s.name = $name, "
        "    s.synthesis = $synthesis, "
        "    s.weight = 0.8, s.energy = 0.0, "
        "    s.updated_at_s = $now "
        "WITH s "
        "MATCH (o {id: $org_id}) "
        "MERGE (o)-[r:link {id: $lid}]->(s) "
        "SET r.hierarchy = 0.8, r.permanence = 0.9, "
        "    r.polarity = 0.5, "
        "    r.weight = 0.8, r.energy = 0.1",
        {"sid": hall_id, "name": f"{display_name} Hall",
         "synthesis": f"Main space for org {display_name}",
         "org_id": org_id, "lid": f"{org_id}_has_hall", "now": now_s},
    )

    logger.info(f"L3 mirror: org {org_id} ({display_name}) + hall space")


def _get_org_public_key(graph, org_id: str) -> Optional[str]:
    """Read the org's public key from L4. Returns None if not registered."""
    result = graph.query(
        "MATCH (o {id: $org_id})-[:link]->(k {type: 'org_public_key'}) "
        "RETURN k.content",
        {"org_id": org_id},
    )
    if result.result_set and len(result.result_set) > 0:
        return result.result_set[0][0]
    return None


def _claim_org(graph, org_id: str, endpoint_url: str, org_name: str = "", website: str = "") -> dict:
    """First boot: generate keypair, register public key + endpoint + name + website in L4."""
    logger.info(f"TOFU CLAIM: org '{org_id}' — first registration")

    private_pem, public_pem = _generate_org_rsa_keypair(org_id)

    display_name = org_name or org_id.replace("-", " ").replace("_", " ").title()
    now_s = int(time.time())

    # 1. Ensure org actor exists with name + website
    graph.query(
        "MERGE (o {id: $org_id}) "
        "SET o.node_type = 'actor', o.type = 'ORGANIZATION', "
        "    o.name = $name, "
        "    o.synthesis = $synthesis, "
        "    o.website = $website, "
        "    o.weight = 1.0, o.energy = 0.0, "
        "    o.updated_at_s = $now",
        {
            "org_id": org_id,
            "name": display_name,
            "synthesis": f"Organization {display_name}",
            "website": website,
            "now": now_s,
        },
    )

    # 2. Register public key (Thing node, type=org_public_key)
    graph.query(
        "MERGE (k {id: $key_id}) "
        "SET k.node_type = 'thing', k.type = 'org_public_key', "
        "    k.name = $name, "
        "    k.content = $public_key, "
        "    k.synthesis = $synthesis, "
        "    k.created_at_s = $now, k.updated_at_s = $now "
        "WITH k "
        "MATCH (o {id: $org_id}) "
        "MERGE (o)-[r:link {id: $link_id}]->(k) "
        "SET r.hierarchy = 1.0, r.permanence = 1.0",
        {
            "key_id": f"{org_id}_public_key",
            "name": f"Public key for {org_id}",
            "public_key": public_pem,
            "synthesis": f"RSA public key for org {org_id} — TOFU registered",
            "org_id": org_id,
            "link_id": f"{org_id}_has_public_key",
            "now": now_s,
        },
    )

    # 3. Register endpoint (Thing node, type=endpoint)
    graph.query(
        "MERGE (e {id: $endpoint_id}) "
        "SET e.node_type = 'thing', e.type = 'endpoint', "
        "    e.name = $name, "
        "    e.content = $url, "
        "    e.uri = $url, "
        "    e.synthesis = $synthesis, "
        "    e.created_at_s = $now, e.updated_at_s = $now "
        "WITH e "
        "MATCH (o {id: $org_id}) "
        "MERGE (o)-[r:link {id: $link_id}]->(e) "
        "SET r.hierarchy = 1.0, r.permanence = 0.8",
        {
            "endpoint_id": f"{org_id}_endpoint",
            "name": f"Endpoint for {org_id}",
            "url": endpoint_url,
            "synthesis": f"Home server endpoint for org {org_id}",
            "org_id": org_id,
            "link_id": f"{org_id}_has_endpoint",
            "now": now_s,
        },
    )

    # 4. Register claim timestamp (Thing node, type=tofu_claim)
    claim_hash = hashlib.sha256(
        f"{org_id}:{public_pem}:{now_s}".encode()
    ).hexdigest()

    graph.query(
        "MERGE (c {id: $claim_id}) "
        "SET c.node_type = 'thing', c.type = 'tofu_claim', "
        "    c.content = $claim_hash, "
        "    c.synthesis = $synthesis, "
        "    c.created_at_s = $now "
        "WITH c "
        "MATCH (o {id: $org_id}) "
        "MERGE (o)-[r:link {id: $link_id}]->(c) "
        "SET r.hierarchy = 1.0, r.permanence = 1.0",
        {
            "claim_id": f"{org_id}_tofu_claim",
            "claim_hash": claim_hash,
            "synthesis": f"TOFU claim for {org_id} at {now_s}",
            "org_id": org_id,
            "link_id": f"{org_id}_has_claim",
            "now": now_s,
        },
    )

    logger.info(
        f"TOFU CLAIM OK: org={org_id} endpoint={endpoint_url} "
        f"key={public_pem[:40]}..."
    )

    return {
        "status": "claimed",
        "org_id": org_id,
        "endpoint_url": endpoint_url,
        "public_key_registered": True,
        "claim_hash": claim_hash,
    }


def _update_org(graph, org_id: str, endpoint_url: str, stored_public_key: str, org_name: str = "", website: str = "") -> dict:
    """Subsequent boot: verify signature before updating endpoint."""
    logger.info(f"TOFU VERIFY: org '{org_id}' — updating endpoint")

    # Load our private key
    org_key_dir = KEYS_DIR / "org"
    private_key_path = org_key_dir / "rsa_private_key.pem"

    if not private_key_path.exists():
        return {
            "status": "error",
            "detail": f"Private key not found at {private_key_path}. "
                      f"This org was claimed from another server.",
        }

    # Sign the announcement
    private_pem = private_key_path.read_text()
    challenge = f"{org_id}:{endpoint_url}:{int(time.time()) // 60}"  # 1-min window
    signature = _sign_challenge(private_pem, challenge)

    # Verify against stored public key
    if not _verify_signature(stored_public_key, challenge, signature):
        return {
            "status": "error",
            "detail": "Signature verification failed. "
                      "Private key does not match the public key registered in L4.",
        }

    # Signature OK — update endpoint + name + website
    display_name = org_name or org_id.replace("-", " ").replace("_", " ").title()
    now_s = int(time.time())

    # Update org actor name/website
    graph.query(
        "MATCH (o {id: $org_id}) "
        "SET o.name = $name, o.website = $website, o.updated_at_s = $now",
        {"org_id": org_id, "name": display_name, "website": website, "now": now_s},
    )

    # Update endpoint
    graph.query(
        "MERGE (e {id: $endpoint_id}) "
        "SET e.content = $url, e.uri = $url, e.updated_at_s = $now "
        "WITH e "
        "MATCH (o {id: $org_id}) "
        "MERGE (o)-[r:link {id: $link_id}]->(e) "
        "SET r.permanence = 0.8",
        {
            "endpoint_id": f"{org_id}_endpoint",
            "url": endpoint_url,
            "org_id": org_id,
            "link_id": f"{org_id}_has_endpoint",
            "now": now_s,
        },
    )

    logger.info(f"TOFU VERIFY OK: org={org_id} endpoint updated to {endpoint_url}")

    return {
        "status": "updated",
        "org_id": org_id,
        "endpoint_url": endpoint_url,
        "verified": True,
    }


# ── Crypto helpers ─────────────────────────────────────────────────────────

def _generate_org_rsa_keypair(org_id: str) -> tuple[str, str]:
    """Generate RSA-2048 for the org, store private key in .keys/org/."""
    from cryptography.hazmat.primitives.asymmetric import rsa, padding
    from cryptography.hazmat.primitives import serialization, hashes

    private_key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048,
    )

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    # Store private key
    org_key_dir = KEYS_DIR / "org"
    org_key_dir.mkdir(parents=True, exist_ok=True)

    pk_path = org_key_dir / "rsa_private_key.pem"
    pk_path.write_text(private_pem)
    os.chmod(pk_path, 0o400)

    pub_path = org_key_dir / "rsa_public_key.pem"
    pub_path.write_text(public_pem)

    logger.info(f"Generated org RSA keypair for {org_id} at {org_key_dir}")

    return private_pem, public_pem


def _sign_challenge(private_pem: str, challenge: str) -> bytes:
    """Sign a challenge string with RSA-PSS."""
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization

    private_key = serialization.load_pem_private_key(
        private_pem.encode(), password=None,
    )
    return private_key.sign(
        challenge.encode(),
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        hashes.SHA256(),
    )


def _verify_signature(public_pem: str, challenge: str, signature: bytes) -> bool:
    """Verify a challenge signature against a public key."""
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization

    public_key = serialization.load_pem_public_key(public_pem.encode())
    try:
        public_key.verify(
            signature,
            challenge.encode(),
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False
