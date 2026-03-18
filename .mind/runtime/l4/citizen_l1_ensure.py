"""
L1 Citizen Ensure — UPSERT citizen L1 graph + RSA keypair at every deploy.

For each citizen:
  1. Compute a seed hash from source data (profile + base brain version)
  2. Compare with hash stored in the graph (_seed_hash property)
  3. If different (or missing) → upsert: re-seed identity, personality, backstory
  4. Ensure RSA keypair exists

This runs at EVERY deploy — not just first time. If a manifesto changes, if a
profile is updated, the brain gets the new data on next deploy via MERGE.

Usage:
    from runtime.l4.citizen_l1_ensure import ensure_citizen_l1

    pubkey = ensure_citizen_l1("DragonSlayer")
    # Returns public key PEM string, or None if keypair generation failed
"""

import hashlib
import json
import logging
import os
import subprocess
import time
from pathlib import Path

logger = logging.getLogger("mind.l1")

KEYS_BASE = Path(os.environ.get("KEYS_DIR", ".keys/citizens"))


def _get_graph(graph_name=None):
    """Connect to the citizen's L1 graph."""
    from falkordb import FalkorDB
    host = os.environ.get("FALKORDB_HOST", "localhost")
    port = int(os.environ.get("FALKORDB_PORT", "6379"))
    name = graph_name or os.environ.get("CITIZEN_GRAPH", os.environ.get("FALKORDB_GRAPH", "mind_protocol"))
    client = FalkorDB(host=host, port=port)
    return client.select_graph(name)


def _compute_seed_hash(citizen_data: dict, base_brain_version: str = "") -> str:
    """Compute a deterministic hash from citizen seed sources.

    If any source changes (profile, personality, base brain version),
    the hash changes and triggers a re-seed.
    """
    parts = [
        citizen_data.get("name", ""),
        citizen_data.get("social_class", ""),
        citizen_data.get("description", ""),
        citizen_data.get("personality", ""),
        base_brain_version,
    ]
    raw = "|".join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _get_stored_seed_hash(graph, citizen_id: str) -> str:
    """Read _seed_hash from the citizen's Actor node. Returns '' if missing."""
    try:
        result = graph.query(
            "MATCH (a {id: $id}) RETURN a._seed_hash",
            {"id": citizen_id},
        )
        if result.result_set and result.result_set[0][0]:
            return result.result_set[0][0]
    except Exception:
        pass
    return ""


def check_l1_exists(handle, graph_name=None):
    """Check if citizen has nodes in their L1 graph."""
    try:
        graph = _get_graph(graph_name)
        citizen_id = f"CITIZEN_{handle}"
        result = graph.query(
            "MATCH (a {id: $id}) RETURN count(a)",
            {"id": citizen_id},
        )
        count = result.result_set[0][0] if result.result_set else 0
        return count > 0
    except Exception as e:
        logger.debug(f"L1 check failed for {handle}: {e}")
        return False


def _collect_citizen_data(handle, citizen_data=None, citizens_dir=None) -> dict:
    """Collect citizen data from all sources into a single dict."""
    data = {
        "name": handle,
        "social_class": "",
        "description": "",
        "personality": "",
    }

    if citizen_data:
        data["name"] = citizen_data.get("name", handle)
        data["social_class"] = citizen_data.get("social_class", "")
        data["description"] = citizen_data.get("description", "")
        data["personality"] = citizen_data.get("personality", "")
    elif citizens_dir:
        cdir = Path(citizens_dir)
        # venezia format: data/citizens.json
        for candidate in [cdir / "data" / "citizens.json", cdir / "citizens.json"]:
            if candidate.exists():
                citizens = json.loads(candidate.read_text())
                for c in citizens:
                    if (c.get("id") or c.get("handle")) == handle:
                        data["name"] = c.get("name", handle)
                        data["social_class"] = c.get("social_class", "")
                        data["description"] = c.get("description", "")
                        data["personality"] = c.get("personality", "")
                        break
                break

        # mind-mcp format: citizens/{handle}/profile.json
        profile = cdir / "citizens" / handle / "profile.json"
        if profile.exists() and not data["description"]:
            pdata = json.loads(profile.read_text())
            identity = pdata.get("identity", pdata)
            data["name"] = identity.get("name", handle)
            data["social_class"] = identity.get("social_class", "")
            data["description"] = identity.get("description", "")

    return data


def _get_base_brain_version() -> str:
    """Get a version string for the base brain to detect manifesto changes."""
    base_brain_path = Path(__file__).parent.parent.parent / "data" / "base_seed_brain.json"
    if base_brain_path.exists():
        stat = base_brain_path.stat()
        return f"{stat.st_size}_{int(stat.st_mtime)}"
    return "none"


def upsert_l1(handle, citizen_data=None, citizens_dir=None):
    """Upsert citizen's L1 graph — always runs, uses MERGE for idempotency.

    Called at every deploy. Compares seed hash to detect changes.
    If nothing changed, skips. If source data changed, re-merges.
    """
    try:
        graph = _get_graph()
    except Exception as e:
        logger.warning(f"Cannot upsert L1 for {handle}: {e}")
        return "error"

    citizen_id = f"CITIZEN_{handle}"
    data = _collect_citizen_data(handle, citizen_data, citizens_dir)

    # Compute hash of current source data
    base_version = _get_base_brain_version()
    new_hash = _compute_seed_hash(data, base_version)

    # Check stored hash
    stored_hash = _get_stored_seed_hash(graph, citizen_id)
    if stored_hash == new_hash:
        return "unchanged"

    # Hash differs or missing → upsert
    now_s = int(time.time())
    name = data["name"]
    social_class = data["social_class"]
    description = data["description"]
    personality = data["personality"]

    synthesis = f"{name}"
    if social_class:
        synthesis += f", {social_class}"
    if description:
        synthesis += f" -- {description[:200]}"

    # MERGE Actor node — upserts identity fields, preserves runtime state
    graph.query(
        "MERGE (a {id: $id}) "
        "SET a.node_type = 'actor', a.type = 'citizen', "
        "a.name = $name, a.handle = $handle, "
        "a.synthesis = $syn, a.social_class = $sc, "
        "a.weight = CASE WHEN a.weight IS NULL THEN 1.0 ELSE a.weight END, "
        "a.energy = CASE WHEN a.energy IS NULL THEN 0.5 ELSE a.energy END, "
        "a.updated_at_s = $ts, a._seed_hash = $hash",
        {"id": citizen_id, "name": name, "handle": handle,
         "syn": synthesis, "sc": social_class, "ts": now_s, "hash": new_hash},
    )

    # MERGE personality — update content, preserve learned link properties
    if personality:
        graph.query(
            "MERGE (n {id: $nid}) "
            "SET n.node_type = 'narrative', n.type = 'personality', "
            "n.name = $nname, n.content = $content, "
            "n.synthesis = $syn, n.updated_at_s = $ts, "
            "n.weight = CASE WHEN n.weight IS NULL THEN 0.8 ELSE n.weight END, "
            "n.energy = CASE WHEN n.energy IS NULL THEN 0.0 ELSE n.energy END "
            "WITH n "
            "MATCH (a {id: $aid}) "
            "MERGE (a)-[r:LINK {id: $lid}]->(n) "
            "SET r.hierarchy = CASE WHEN r.hierarchy IS NULL THEN 0.9 ELSE r.hierarchy END, "
            "r.permanence = CASE WHEN r.permanence IS NULL THEN 0.95 ELSE r.permanence END, "
            "r.weight = CASE WHEN r.weight IS NULL THEN 1.0 ELSE r.weight END, "
            "r.energy = CASE WHEN r.energy IS NULL THEN 0.0 ELSE r.energy END, "
            "r.stability = CASE WHEN r.stability IS NULL THEN 0.5 ELSE r.stability END",
            {"nid": f"{handle}_personality", "nname": f"Personality of {name}",
             "content": personality[:2000], "syn": personality[:300],
             "ts": now_s, "aid": citizen_id, "lid": f"{handle}_has_personality"},
        )

    # MERGE backstory — update content, preserve learned link properties
    if description:
        graph.query(
            "MERGE (n {id: $nid}) "
            "SET n.node_type = 'narrative', n.type = 'backstory', "
            "n.name = $nname, n.content = $content, "
            "n.synthesis = $syn, n.updated_at_s = $ts, "
            "n.weight = CASE WHEN n.weight IS NULL THEN 0.7 ELSE n.weight END, "
            "n.energy = CASE WHEN n.energy IS NULL THEN 0.0 ELSE n.energy END "
            "WITH n "
            "MATCH (a {id: $aid}) "
            "MERGE (a)-[r:LINK {id: $lid}]->(n) "
            "SET r.hierarchy = CASE WHEN r.hierarchy IS NULL THEN 0.8 ELSE r.hierarchy END, "
            "r.permanence = CASE WHEN r.permanence IS NULL THEN 0.9 ELSE r.permanence END, "
            "r.weight = CASE WHEN r.weight IS NULL THEN 1.0 ELSE r.weight END, "
            "r.energy = CASE WHEN r.energy IS NULL THEN 0.0 ELSE r.energy END, "
            "r.stability = CASE WHEN r.stability IS NULL THEN 0.5 ELSE r.stability END",
            {"nid": f"{handle}_backstory", "nname": f"Backstory of {name}",
             "content": description[:2000], "syn": description[:300],
             "ts": now_s, "aid": citizen_id, "lid": f"{handle}_has_backstory"},
        )

    action = "created" if not stored_hash else "updated"
    logger.info(f"L1 {action} for {handle}: actor + personality + backstory (hash={new_hash})")
    return action


# Keep old name for backwards compat
def seed_l1(handle, citizen_data=None, citizens_dir=None):
    """Legacy wrapper — calls upsert_l1."""
    return upsert_l1(handle, citizen_data, citizens_dir) != "error"


def ensure_keypair(handle):
    """Generate RSA keypair for citizen if not exists. Returns public key PEM."""
    keys_dir = KEYS_BASE / handle
    priv_key = keys_dir / "rsa_private_key.pem"
    pub_key = keys_dir / "rsa_public_key.pem"

    if pub_key.exists():
        return pub_key.read_text()

    keys_dir.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            ["openssl", "genrsa", "-out", str(priv_key), "2048"],
            check=True, capture_output=True,
        )
        subprocess.run(
            ["openssl", "rsa", "-in", str(priv_key), "-pubout", "-out", str(pub_key)],
            check=True, capture_output=True,
        )
        os.chmod(priv_key, 0o400)
        logger.info(f"RSA keypair generated for {handle}")
        return pub_key.read_text()
    except Exception as e:
        logger.warning(f"Keypair generation failed for {handle}: {e}")
        return None


def ensure_citizen_l1(handle, citizen_data=None, citizens_dir=None):
    """Full ensure: upsert L1 graph (hash-based change detection) + generate keypair.

    Returns public key PEM string or None.
    """
    # 1. Upsert L1 (always runs, skips if hash unchanged)
    upsert_l1(handle, citizen_data=citizen_data, citizens_dir=citizens_dir)

    # 2. Ensure keypair
    pubkey = ensure_keypair(handle)

    return pubkey


def bulk_ensure_citizens(citizens_dir, graph_name=None):
    """Upsert all citizens' L1 graphs + keypairs at deploy time.

    Uses hash-based change detection: if source data hasn't changed,
    the upsert is a no-op. If a profile or base brain changed, re-seeds.

    Returns dict of {handle: public_key_pem}.
    """
    cdir = Path(citizens_dir)
    results = {}
    citizens = []

    # Load citizen list
    for candidate in [cdir / "data" / "citizens.json", cdir / "citizens.json"]:
        if candidate.exists():
            citizens = json.loads(candidate.read_text())
            break

    if not citizens:
        # Scan subdirectories
        if cdir.is_dir():
            for subdir in sorted(cdir.iterdir()):
                if subdir.is_dir() and (subdir / "CLAUDE.md").exists():
                    citizens.append({"id": subdir.name, "name": subdir.name})

    created = 0
    updated = 0
    unchanged = 0
    errors = 0

    for c in citizens:
        handle = c.get("id") or c.get("handle")
        if not handle:
            continue
        try:
            # Upsert L1 graph
            action = upsert_l1(handle, citizen_data=c, citizens_dir=str(cdir))
            if action == "created":
                created += 1
            elif action == "updated":
                updated += 1
            elif action == "unchanged":
                unchanged += 1
            else:
                errors += 1

            # Ensure keypair
            pubkey = ensure_keypair(handle)
            if pubkey:
                results[handle] = pubkey
        except Exception as e:
            logger.warning(f"Failed to ensure {handle}: {e}")
            errors += 1

    total = len(citizens)
    changed = created + updated
    variation_pct = round(100 * changed / total, 1) if total > 0 else 0
    print(f"  L1: {total} citizens — {created} created, {updated} updated, {unchanged} unchanged, {errors} errors")
    print(f"  L1: variation {variation_pct}% ({changed}/{total} changed this deploy)")
    return results
