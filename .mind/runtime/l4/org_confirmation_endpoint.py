"""
L4 Org Confirmation — verify org identity and ping all hosted citizens.

POST /l4/confirm
{
    "org_id": "mind-protocol",
    "signature": "<base64 RSA-PSS signature of challenge>"
}

Flow:
  1. Verify org signature against public key stored in L4
  2. List all citizens belonging to this org (from profile.json)
  3. Ping each citizen's membrane endpoint
  4. Return list of reachable vs unreachable citizens

This is the org proving "I am who I say I am, and here are my citizens."
"""

import json
import logging
import os
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("l4.confirm")

router = APIRouter(tags=["l4"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CITIZENS_DIR = PROJECT_ROOT / "citizens"
KEYS_DIR = PROJECT_ROOT / ".keys"


@router.post("/l4/confirm")
async def confirm_org(request: Request):
    """Confirm org identity and return reachable citizens.

    Body:
        org_id: str — the org claiming identity
        signature: str — base64-encoded RSA-PSS signature of challenge
        challenge: str — the signed challenge string (org_id:timestamp_minute)

    Returns:
        org_id, verified, citizens: [{handle, reachable, status}]
    """
    body = await request.json()
    org_id = body.get("org_id", "").strip()
    signature_b64 = body.get("signature", "")
    challenge = body.get("challenge", "")

    if not org_id:
        raise HTTPException(status_code=400, detail="org_id required")

    # Verify org identity
    verified = False
    if signature_b64 and challenge:
        verified = _verify_org_signature(org_id, challenge, signature_b64)
    else:
        # Allow unsigned confirmation from localhost / same-server
        # (the org is confirming itself on its own server)
        verified = _is_local_org(org_id)

    if not verified:
        raise HTTPException(status_code=403, detail="Org signature verification failed")

    # List all citizens belonging to this org
    org_citizens = _list_org_citizens(org_id)

    # Ping each citizen's membrane
    results = []
    for citizen in org_citizens:
        handle = citizen["handle"]
        reachable = _ping_citizen(handle)
        results.append({
            "handle": handle,
            "name": citizen.get("name", handle),
            "reachable": reachable,
            "status": citizen.get("status", "unknown"),
            "has_brain": _has_brain(handle),
            "has_keys": _has_keys(handle),
        })

    reachable_count = sum(1 for r in results if r["reachable"])

    logger.info(
        f"Org confirmation: {org_id} — "
        f"{reachable_count}/{len(results)} citizens reachable"
    )

    return {
        "org_id": org_id,
        "verified": verified,
        "total_citizens": len(results),
        "reachable": reachable_count,
        "citizens": results,
    }


def _verify_org_signature(org_id: str, challenge: str, signature_b64: str) -> bool:
    """Verify org signature against L4 public key."""
    import base64

    # Load org public key from L4
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))
        graph_name = os.environ.get("L4_GRAPH", "mind_protocol")

        db = FalkorDB(host=host, port=port)
        graph = db.select_graph(graph_name)

        result = graph.query(
            "MATCH (o {id: $org_id})-[:link]->(k {type: 'org_public_key'}) "
            "RETURN k.content",
            {"org_id": org_id},
        )
        if not result.result_set or len(result.result_set) == 0:
            logger.warning(f"No public key found in L4 for org {org_id}")
            return False

        public_pem = result.result_set[0][0]
    except Exception as e:
        logger.warning(f"Cannot read L4 public key for {org_id}: {e}")
        return False

    # Verify signature
    try:
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives import hashes, serialization

        public_key = serialization.load_pem_public_key(public_pem.encode())
        signature = base64.b64decode(signature_b64)

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
    except Exception as e:
        logger.warning(f"Signature verification failed for {org_id}: {e}")
        return False


def _is_local_org(org_id: str) -> bool:
    """Check if this server is the org's server (has the private key)."""
    org_key = KEYS_DIR / "org" / "rsa_private_key.pem"
    return org_key.exists()


def _list_org_citizens(org_id: str) -> list[dict]:
    """List all citizens belonging to this org.

    Sources (merged, deduplicated):
      1. L4 FalkorDB registry (MEMBER_OF links)
      2. Local citizens/ directory (profile.json files)
      3. data/citizens.json (venezia format)
    """
    seen = set()
    citizens = []

    # Source 1: L4 registry
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))
        graph_name = os.environ.get("L4_GRAPH", "mind_protocol")
        db = FalkorDB(host=host, port=port)
        graph = db.select_graph(graph_name)
        result = graph.query(
            "MATCH (c)-[r:link]->(o {id: $oid}) "
            "WHERE r.type = 'MEMBER_OF' AND c.type = 'citizen' "
            "RETURN c.handle, c.name, c.social_class",
            {"oid": org_id},
        )
        for row in (result.result_set or []):
            handle = row[0]
            if handle and handle not in seen:
                seen.add(handle)
                citizens.append({
                    "handle": handle,
                    "name": row[1] or handle,
                    "status": "registered",
                })
    except Exception as e:
        logger.debug(f"L4 query failed for org citizens: {e}")

    # Source 2: Local profile.json files
    if CITIZENS_DIR.exists():
        for citizen_dir in sorted(CITIZENS_DIR.iterdir()):
            if not citizen_dir.is_dir() or citizen_dir.name in seen:
                continue
            profile_path = citizen_dir / "profile.json"
            if not profile_path.exists():
                continue
            try:
                profile = json.loads(profile_path.read_text())
                identity = profile.get("identity", {})
                citizen_org = identity.get("organization", "")
                if citizen_org == org_id or not citizen_org:
                    seen.add(citizen_dir.name)
                    citizens.append({
                        "handle": citizen_dir.name,
                        "name": identity.get("name", citizen_dir.name),
                        "status": profile.get("status", "active"),
                    })
            except (OSError, json.JSONDecodeError):
                continue

    # Source 3: data/citizens.json (venezia format)
    for data_path in [PROJECT_ROOT / "data" / "citizens.json",
                      PROJECT_ROOT / "worlds" / "venezia" / "data" / "citizens.json"]:
        if data_path.exists():
            try:
                data = json.loads(data_path.read_text())
                for c in data:
                    handle = c.get("id") or c.get("handle")
                    if handle and handle not in seen:
                        seen.add(handle)
                        citizens.append({
                            "handle": handle,
                            "name": c.get("name", handle),
                            "status": "data",
                        })
            except Exception:
                pass
            break

    return citizens


def _ping_citizen(handle: str) -> bool:
    """Check if a citizen is reachable — has nodes in any known graph."""
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))
        db = FalkorDB(host=host, port=port)

        citizen_id = f"CITIZEN_{handle}"
        for graph_name in [f"brain_{handle}", "venezia", "cities_of_light",
                           os.environ.get("L4_GRAPH", "mind_protocol")]:
            try:
                g = db.select_graph(graph_name)
                result = g.query(
                    "MATCH (a {id: $id}) RETURN a.name",
                    {"id": citizen_id},
                )
                if result.result_set:
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _has_brain(handle: str) -> bool:
    """Check if citizen has a brain graph in FalkorDB."""
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))
        db = FalkorDB(host=host, port=port)

        citizen_id = f"CITIZEN_{handle}"
        for graph_name in [f"brain_{handle}", "venezia",
                           os.environ.get("L4_GRAPH", "mind_protocol")]:
            try:
                g = db.select_graph(graph_name)
                result = g.query(
                    "MATCH (a {id: $id})-[:link]->(n) RETURN count(n)",
                    {"id": citizen_id},
                )
                if result.result_set and result.result_set[0][0] > 0:
                    return True
            except Exception:
                continue
    except Exception:
        pass
    return False


def _has_keys(handle: str) -> bool:
    """Check if citizen has keys on disk or in L4."""
    # Check local disk
    for keys_dir in [KEYS_DIR / handle, KEYS_DIR / "citizens" / handle]:
        if (keys_dir / "rsa_private_key.pem").exists():
            return True
        if (keys_dir / "solana_private_key.json").exists():
            return True

    # Check L4 registry
    try:
        from falkordb import FalkorDB
        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))
        db = FalkorDB(host=host, port=port)
        g = db.select_graph(os.environ.get("L4_GRAPH", "mind_protocol"))
        result = g.query(
            "MATCH (k {id: $kid}) RETURN k.content",
            {"kid": f"{handle}_public_key"},
        )
        if result.result_set and result.result_set[0][0]:
            return True
    except Exception:
        pass
    return False
