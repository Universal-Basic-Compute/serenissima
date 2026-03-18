"""
Auto-grant Space access on org membership.

When an Actor creates a BELIEVES link to a Narrative that is ABOUT Spaces
(i.e., joins an org), they should automatically receive HAS_ACCESS to those
Spaces. This module implements that trigger.

Flow:
    1. Actor BELIEVES Narrative (org membership)
    2. Query: which Spaces does the Narrative reference via ABOUT links?
    3. For each private Space:
       a. Find an existing admin/owner with accessible keys
       b. Unwrap the Space key using the admin's private key
       c. Wrap the Space key for the new actor's public key
       d. Create HAS_ACCESS link with role="member" + encrypted_key
    4. If no admin keys are accessible, queue as a pending_grant Thing node

Co-Authored-By: Tomaso Nervo (@nervo) <nervo@mindprotocol.ai>
"""

import base64
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("mind.membrane.auto_grant")

# Path to mind-protocol Python crypto library
MIND_PROTOCOL_PYTHON = os.environ.get(
    "MIND_PROTOCOL_PYTHON",
    str(Path("/home/mind-protocol/mind-protocol/python")),
)

# Directory containing actor .keys/ subdirectories
MIND_KEYS_DIR = os.environ.get(
    "MIND_KEYS_DIR",
    str(Path("/home/mind-protocol/cities-of-light/citizens")),
)


# ---------------------------------------------------------------------------
# Crypto loader (lazy, same pattern as place_handler.py)
# ---------------------------------------------------------------------------

def _ensure_crypto_path() -> None:
    if MIND_PROTOCOL_PYTHON not in sys.path:
        sys.path.insert(0, MIND_PROTOCOL_PYTHON)


def _import_crypto():
    try:
        _ensure_crypto_path()
        import crypto
        return crypto
    except ImportError as e:
        logger.warning(f"Crypto library not available: {e}")
        return None


# ---------------------------------------------------------------------------
# Graph helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_actor_public_key(actor_id: str, graph_client) -> Optional[bytes]:
    """Get an actor's public key from the graph (base64 → bytes)."""
    try:
        result = graph_client._query(
            "MATCH (a:Actor {id: $id}) RETURN a.public_key",
            {"id": actor_id},
        )
        if result and result[0] and result[0][0]:
            return base64.b64decode(result[0][0])
    except Exception as e:
        logger.debug(f"Could not get public key for {actor_id}: {e}")
    return None


def _load_actor_keys_from_disk(actor_id: str):
    """Load an actor's key pair from disk (.keys/ directory)."""
    crypto = _import_crypto()
    if not crypto:
        return None
    keys_dir = os.path.join(MIND_KEYS_DIR, actor_id, ".keys")
    try:
        return crypto.load_actor_keys(keys_dir)
    except FileNotFoundError:
        logger.debug(f"No key files on disk for actor '{actor_id}'")
        return None
    except Exception as e:
        logger.debug(f"Failed to load keys for '{actor_id}': {e}")
        return None


def _find_spaces_for_narrative(narrative_id: str, graph_client) -> List[dict]:
    """Find all Spaces linked to a Narrative via ABOUT relationship.

    Returns list of dicts: [{id, visibility}, ...]
    """
    try:
        result = graph_client._query(
            "MATCH (n:Narrative {id: $nid})-[:ABOUT]->(s:Space) "
            "RETURN s.id, s.visibility",
            {"nid": narrative_id},
        )
        spaces = []
        for row in (result or []):
            if row and row[0]:
                spaces.append({
                    "id": row[0],
                    "visibility": str(row[1]).lower() if row[1] else "public",
                })
        return spaces
    except Exception as e:
        logger.warning(f"Failed to find spaces for narrative {narrative_id}: {e}")
        return []


def _find_admin_for_space(space_id: str, graph_client) -> Optional[str]:
    """Find an actor with owner or admin role on a Space.

    Returns the actor_id of the first owner/admin found, or None.
    """
    try:
        result = graph_client._query(
            "MATCH (a:Actor)-[r:HAS_ACCESS]->(s:Space {id: $sid}) "
            "WHERE r.role IN ['owner', 'admin'] "
            "RETURN a.id, r.role "
            "ORDER BY CASE r.role WHEN 'owner' THEN 0 ELSE 1 END "
            "LIMIT 1",
            {"sid": space_id},
        )
        if result and result[0] and result[0][0]:
            return result[0][0]
    except Exception as e:
        logger.debug(f"Could not find admin for space {space_id}: {e}")
    return None


def _get_encrypted_key_for_actor(actor_id: str, space_id: str, graph_client) -> Optional[str]:
    """Get the encrypted_key from an actor's HAS_ACCESS link to a Space."""
    try:
        result = graph_client._query(
            "MATCH (a:Actor {id: $aid})-[r:HAS_ACCESS]->(s:Space {id: $sid}) "
            "RETURN r.encrypted_key",
            {"aid": actor_id, "sid": space_id},
        )
        if result and result[0] and result[0][0]:
            return result[0][0]
    except Exception as e:
        logger.debug(f"No encrypted key for {actor_id} -> {space_id}: {e}")
    return None


def _actor_already_has_access(actor_id: str, space_id: str, graph_client) -> bool:
    """Check whether an actor already has a HAS_ACCESS link to a Space."""
    try:
        result = graph_client._query(
            "MATCH (a:Actor {id: $aid})-[r:HAS_ACCESS]->(s:Space {id: $sid}) "
            "RETURN r.role",
            {"aid": actor_id, "sid": space_id},
        )
        return bool(result and result[0])
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Pending grant queue
# ---------------------------------------------------------------------------

def _queue_pending_grant(
    actor_id: str,
    space_id: str,
    narrative_id: str,
    graph_client,
) -> str:
    """Create a Thing node representing a pending grant.

    The pending_grant Thing is linked to the Space (ABOUT) and to the Actor
    (FOR). An admin can process it later via process_pending_grants().

    Returns the pending grant node ID.
    """
    pending_id = f"pending_grant_{uuid.uuid4().hex[:12]}"
    ts = _now_iso()

    try:
        graph_client._query(
            "CREATE (t:Thing {"
            "  id: $id, type: 'pending_grant',"
            "  actor_id: $actor_id, space_id: $space_id,"
            "  narrative_id: $narrative_id,"
            "  status: 'pending', created_at: $ts"
            "})",
            {
                "id": pending_id,
                "actor_id": actor_id,
                "space_id": space_id,
                "narrative_id": narrative_id,
                "ts": ts,
            },
        )
        # Link pending grant to Space
        graph_client._query(
            "MATCH (t:Thing {id: $tid}), (s:Space {id: $sid}) "
            "CREATE (t)-[:ABOUT]->(s)",
            {"tid": pending_id, "sid": space_id},
        )
        # Link pending grant to Actor
        graph_client._query(
            "MATCH (t:Thing {id: $tid}), (a:Actor {id: $aid}) "
            "CREATE (t)-[:FOR]->(a)",
            {"tid": pending_id, "aid": actor_id},
        )
        logger.info(
            f"Queued pending grant {pending_id}: "
            f"{actor_id} -> {space_id} (narrative: {narrative_id})"
        )
        return pending_id
    except Exception as e:
        logger.error(f"Failed to queue pending grant: {e}")
        return ""


# ---------------------------------------------------------------------------
# Core: auto_grant_on_membership
# ---------------------------------------------------------------------------

def auto_grant_on_membership(
    actor_id: str,
    narrative_id: str,
    graph_client,
) -> List[str]:
    """Auto-grant Space access when an Actor joins an org (BELIEVES a Narrative).

    For each private Space linked to the Narrative via ABOUT:
      1. Skip if the actor already has access
      2. Find an admin/owner of that Space
      3. Load the admin's keys from disk, unwrap the Space key
      4. Wrap the Space key for the new actor's public key
      5. Create HAS_ACCESS link with role="member" + encrypted_key
      6. If no admin keys are accessible, queue a pending_grant

    Args:
        actor_id: The actor joining the org.
        narrative_id: The Narrative node the actor BELIEVES.
        graph_client: Object with a _query(cypher, params) method.

    Returns:
        List of space_ids where access was successfully granted.
    """
    crypto = _import_crypto()
    if not crypto:
        logger.error("Crypto library unavailable — cannot auto-grant")
        return []

    # 1. Find all Spaces the Narrative is ABOUT
    spaces = _find_spaces_for_narrative(narrative_id, graph_client)
    if not spaces:
        logger.info(f"Narrative {narrative_id} has no ABOUT spaces — nothing to grant")
        return []

    # 2. Get the new actor's public key
    actor_pub_key = _get_actor_public_key(actor_id, graph_client)
    if not actor_pub_key:
        logger.warning(
            f"Actor {actor_id} has no public_key in graph — "
            "cannot wrap space keys. Queuing all as pending."
        )
        for space in spaces:
            if space["visibility"] == "private":
                _queue_pending_grant(actor_id, space["id"], narrative_id, graph_client)
        return []

    granted = []
    ts = _now_iso()

    for space in spaces:
        space_id = space["id"]

        # Skip public spaces — no key exchange needed
        if space["visibility"] != "private":
            logger.debug(f"Space {space_id} is public — skipping")
            continue

        # Skip if already has access
        if _actor_already_has_access(actor_id, space_id, graph_client):
            logger.debug(f"Actor {actor_id} already has access to {space_id}")
            continue

        # 3. Find an admin/owner for this Space
        admin_id = _find_admin_for_space(space_id, graph_client)
        if not admin_id:
            logger.warning(f"No admin found for space {space_id} — queuing pending grant")
            _queue_pending_grant(actor_id, space_id, narrative_id, graph_client)
            continue

        # 4. Load admin's keys from disk and unwrap the Space key
        admin_keys = _load_actor_keys_from_disk(admin_id)
        if not admin_keys:
            logger.warning(
                f"Admin {admin_id} keys not on disk for space {space_id} — "
                "queuing pending grant"
            )
            _queue_pending_grant(actor_id, space_id, narrative_id, graph_client)
            continue

        # Get admin's encrypted_key from HAS_ACCESS link
        admin_encrypted_key = _get_encrypted_key_for_actor(admin_id, space_id, graph_client)
        if not admin_encrypted_key:
            logger.warning(
                f"Admin {admin_id} has no encrypted_key on HAS_ACCESS to {space_id} — "
                "queuing pending grant"
            )
            _queue_pending_grant(actor_id, space_id, narrative_id, graph_client)
            continue

        # Unwrap space key
        try:
            space_key = crypto.decrypt_space_key_for_actor(
                encrypted_key=admin_encrypted_key,
                actor_public_key=admin_keys["public_key"],
                actor_private_key=admin_keys["private_key"],
            )
        except Exception as e:
            logger.error(f"Failed to unwrap space key via admin {admin_id}: {e}")
            _queue_pending_grant(actor_id, space_id, narrative_id, graph_client)
            continue

        # 5. Wrap space key for the new actor
        try:
            new_encrypted_key = crypto.encrypt_space_key_for_actor(
                space_key, actor_pub_key
            )
        except Exception as e:
            logger.error(f"Failed to wrap space key for {actor_id}: {e}")
            _queue_pending_grant(actor_id, space_id, narrative_id, graph_client)
            continue

        # 6. Create HAS_ACCESS link
        try:
            graph_client._query(
                "MATCH (a:Actor {id: $actor_id}), (s:Space {id: $space_id}) "
                "MERGE (a)-[r:HAS_ACCESS]->(s) "
                "SET r.role = 'member', r.encrypted_key = $ekey, "
                "r.granted_at = $ts, r.granted_by = $grantor, "
                "r.grant_source = 'auto_membership'",
                {
                    "actor_id": actor_id,
                    "space_id": space_id,
                    "ekey": new_encrypted_key,
                    "ts": ts,
                    "grantor": admin_id,
                },
            )
            granted.append(space_id)
            logger.info(
                f"Auto-granted access: {actor_id} -> {space_id} "
                f"(via admin {admin_id}, narrative {narrative_id})"
            )
        except Exception as e:
            logger.error(f"Failed to create HAS_ACCESS for {actor_id} -> {space_id}: {e}")
            _queue_pending_grant(actor_id, space_id, narrative_id, graph_client)

    return granted


# ---------------------------------------------------------------------------
# Pending grant processor
# ---------------------------------------------------------------------------

def process_pending_grants(
    admin_actor_id: str,
    graph_client,
) -> List[str]:
    """Process queued pending_grant Thing nodes using an admin's keys.

    Called when an admin comes online (or periodically). For each pending grant
    where the admin has owner/admin access to the target Space:
      1. Load admin keys from disk
      2. Unwrap the Space key
      3. Wrap for the target actor
      4. Create HAS_ACCESS link
      5. Mark the pending_grant as completed

    Args:
        admin_actor_id: The admin whose keys are available to process grants.
        graph_client: Object with a _query(cypher, params) method.

    Returns:
        List of space_ids where pending grants were successfully processed.
    """
    crypto = _import_crypto()
    if not crypto:
        logger.error("Crypto library unavailable — cannot process pending grants")
        return []

    # Load admin keys from disk
    admin_keys = _load_actor_keys_from_disk(admin_actor_id)
    if not admin_keys:
        logger.warning(f"Admin {admin_actor_id} keys not on disk — cannot process grants")
        return []

    # Find pending grants for Spaces where this admin has owner/admin access
    try:
        result = graph_client._query(
            "MATCH (t:Thing {type: 'pending_grant', status: 'pending'})-[:ABOUT]->(s:Space) "
            "MATCH (admin:Actor {id: $admin_id})-[ar:HAS_ACCESS]->(s) "
            "WHERE ar.role IN ['owner', 'admin'] "
            "RETURN t.id, t.actor_id, t.space_id, t.narrative_id",
            {"admin_id": admin_actor_id},
        )
    except Exception as e:
        logger.error(f"Failed to query pending grants: {e}")
        return []

    if not result:
        logger.debug(f"No pending grants for admin {admin_actor_id}")
        return []

    processed = []
    ts = _now_iso()

    for row in result:
        pending_id = row[0]
        actor_id = row[1]
        space_id = row[2]
        narrative_id = row[3] if len(row) > 3 else None

        # Get target actor's public key
        actor_pub_key = _get_actor_public_key(actor_id, graph_client)
        if not actor_pub_key:
            logger.warning(
                f"Pending grant {pending_id}: actor {actor_id} still has no public_key — skipping"
            )
            continue

        # Skip if actor already got access (maybe another admin processed it)
        if _actor_already_has_access(actor_id, space_id, graph_client):
            logger.info(f"Pending grant {pending_id}: {actor_id} already has access — marking done")
            _mark_pending_done(pending_id, admin_actor_id, graph_client)
            continue

        # Unwrap space key using admin's keys
        admin_encrypted_key = _get_encrypted_key_for_actor(
            admin_actor_id, space_id, graph_client
        )
        if not admin_encrypted_key:
            logger.warning(
                f"Pending grant {pending_id}: admin {admin_actor_id} "
                f"has no encrypted_key for {space_id} — skipping"
            )
            continue

        try:
            space_key = crypto.decrypt_space_key_for_actor(
                encrypted_key=admin_encrypted_key,
                actor_public_key=admin_keys["public_key"],
                actor_private_key=admin_keys["private_key"],
            )
        except Exception as e:
            logger.error(f"Pending grant {pending_id}: unwrap failed: {e}")
            continue

        # Wrap for target actor
        try:
            new_encrypted_key = crypto.encrypt_space_key_for_actor(
                space_key, actor_pub_key
            )
        except Exception as e:
            logger.error(f"Pending grant {pending_id}: wrap failed: {e}")
            continue

        # Create HAS_ACCESS link
        try:
            graph_client._query(
                "MATCH (a:Actor {id: $actor_id}), (s:Space {id: $space_id}) "
                "MERGE (a)-[r:HAS_ACCESS]->(s) "
                "SET r.role = 'member', r.encrypted_key = $ekey, "
                "r.granted_at = $ts, r.granted_by = $grantor, "
                "r.grant_source = 'auto_pending'",
                {
                    "actor_id": actor_id,
                    "space_id": space_id,
                    "ekey": new_encrypted_key,
                    "ts": ts,
                    "grantor": admin_actor_id,
                },
            )
            processed.append(space_id)
            _mark_pending_done(pending_id, admin_actor_id, graph_client)
            logger.info(
                f"Processed pending grant {pending_id}: "
                f"{actor_id} -> {space_id} (via admin {admin_actor_id})"
            )
        except Exception as e:
            logger.error(f"Pending grant {pending_id}: HAS_ACCESS creation failed: {e}")

    return processed


def _mark_pending_done(pending_id: str, processed_by: str, graph_client) -> None:
    """Mark a pending_grant Thing node as completed."""
    try:
        graph_client._query(
            "MATCH (t:Thing {id: $id}) "
            "SET t.status = 'completed', t.processed_at = $ts, "
            "t.processed_by = $by",
            {"id": pending_id, "ts": _now_iso(), "by": processed_by},
        )
    except Exception as e:
        logger.warning(f"Failed to mark pending grant {pending_id} as done: {e}")
