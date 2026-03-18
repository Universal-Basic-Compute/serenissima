"""
Citizens registry + DMs — unified citizen API with search, filters, brain scores.

Citizens registry + DMs API (FastAPI).
Adapted for mind-mcp citizen directory structure.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

logger = logging.getLogger("home.citizens")

router = APIRouter(tags=["citizens"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CITIZENS_DIR = PROJECT_ROOT / "citizens"
STATE_DIR = PROJECT_ROOT / "shrine" / "state"
BRAIN_SCORES_PATH = STATE_DIR / "brain_scores.json"
DM_DIR = STATE_DIR / "dms"
CITIZENS_CONFIG = PROJECT_ROOT / "config" / "citizens.json"


# ── Citizen loading ────────────────────────────────────────────────────

def _load_ai_citizens() -> list:
    """Load AI citizens from .mind/citizens/*/profile.json dirs."""
    citizens = []
    if not CITIZENS_DIR.exists():
        return citizens
    for d in sorted(CITIZENS_DIR.iterdir()):
        if not d.is_dir():
            continue
        profile_path = d / "profile.json"
        if not profile_path.exists():
            continue
        try:
            profile = json.loads(profile_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue

        identity = profile.get("identity", {})
        caps = profile.get("capabilities", {})
        raw_contacts = profile.get("contacts", {})
        econ = profile.get("economics", {})

        # Normalize contacts: list-of-dicts → flat dict
        if isinstance(raw_contacts, list):
            contacts = {}
            for entry in raw_contacts:
                if isinstance(entry, dict) and entry.get("type") and entry.get("value"):
                    contacts[entry["type"]] = entry["value"]
        else:
            contacts = raw_contacts or {}

        citizen_type = identity.get("type", "ai")
        trust_level = identity.get("trust_level", "citizen")

        citizens.append({
            "id": identity.get("handle", d.name),
            "handle": identity.get("handle", d.name),
            "display_name": identity.get("name", d.name),
            "first_name": identity.get("first_name"),
            "last_name": identity.get("last_name"),
            "nickname": identity.get("nickname"),
            "emoji": identity.get("emoji"),
            "type": citizen_type,
            "role": identity.get("tagline", ""),
            "bio": identity.get("bio", ""),
            "tags": caps.get("primary_skills", []),
            "section": identity.get("section", "ai_citizen"),
            "trust_level": trust_level,
            "links": identity.get("links", {}),
            "wallet": contacts.get("wallet_address") or contacts.get("wallet"),
            "email": contacts.get("email", f"{d.name}@mindprotocol.ai"),
            "telegram_id": contacts.get("telegram_chat_id") or contacts.get("telegram"),
            "orgs": [identity["organization"]] if identity.get("organization") else [],
            "autonomy_level": caps.get("autonomy_level", 1),
            "universe": identity.get("universe", "mind-protocol"),
            "class": identity.get("class_", ""),
            "archetype": identity.get("personality_archetype", ""),
            "district": identity.get("district", ""),
            "trust_score": econ.get("trust_score", 0),
            "contributions": econ.get("contributions", 0),
            "status": profile.get("status", "active"),
            "born_at": profile.get("born_at"),
        })
    return citizens


def _load_human_citizens() -> list:
    """Load human citizens from config/citizens.json."""
    if not CITIZENS_CONFIG.exists():
        return []
    try:
        data = json.loads(CITIZENS_CONFIG.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    citizens = []
    for c in data.get("citizens", []):
        citizens.append({
            "id": c["id"],
            "handle": c["id"],
            "display_name": c.get("display_name", c["id"]),
            "first_name": c.get("first_name"),
            "last_name": c.get("last_name"),
            "nickname": c.get("nickname"),
            "emoji": c.get("emoji"),
            "type": "human",
            "role": c.get("role", ""),
            "bio": c.get("bio", ""),
            "tags": c.get("tags", []),
            "section": c.get("section", "citizen"),
            "trust_level": c.get("trust_level", "citizen"),
            "links": c.get("links", {}),
            "wallet": c.get("wallet"),
            "email": f"{c['id']}@mindprotocol.ai",
            "telegram_id": c.get("telegram_id"),
            "orgs": c.get("orgs", []),
            "autonomy_level": 10 if c.get("trust_level") == "cofounder" else 5,
            "universe": "mind-protocol",
            "status": "active",
        })
    return citizens


def _load_organizations() -> list:
    """Load organizations from config/citizens.json."""
    if not CITIZENS_CONFIG.exists():
        return []
    try:
        data = json.loads(CITIZENS_CONFIG.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    orgs = []
    for o in data.get("organizations", []):
        orgs.append({
            "id": o.get("id", ""),
            "display_name": o.get("name", o.get("id", "")),
            "description": o.get("description", ""),
            "type": o.get("type", ""),
            "color": o.get("color"),
        })
    return orgs


def _load_brain_scores() -> dict:
    """Load cached brain scores."""
    if not BRAIN_SCORES_PATH.exists():
        return {}
    try:
        data = json.loads(BRAIN_SCORES_PATH.read_text())
        return data.get("scores", {})
    except (OSError, json.JSONDecodeError):
        return {}


def _enrich_with_brain_scores(citizens: list) -> list:
    """Attach brain_power + thoughts_per_min from cached scores."""
    scores = _load_brain_scores()
    for c in citizens:
        handle = c.get("handle", c.get("id", ""))
        s = scores.get(handle, {})
        c["brain_power"] = s.get("brain_power", 0)
        c["neurons"] = s.get("neurons", 0)
        c["synapses"] = s.get("synapses", 0)
        c["thoughts_per_min"] = s.get("thoughts_per_min", 0.0)
        c["health_status"] = s.get("health_status", "dormant" if c.get("type") == "ai" else "")
        c["orientation"] = s.get("orientation")
        c["arousal"] = s.get("arousal", 0.0)
        c["top_drives"] = s.get("top_drives", [])
        c["last_active"] = s.get("last_active")
    return citizens


def _load_all_citizens() -> list:
    """Load all citizens from all sources, enriched with brain scores."""
    return _enrich_with_brain_scores(_load_human_citizens() + _load_ai_citizens())


def _search_citizens(citizens: list, query: str) -> list:
    """Filter citizens by search query."""
    q = query.lower()
    results = []
    for c in citizens:
        searchable = " ".join([
            c.get("handle", ""), c.get("display_name", ""),
            c.get("role", ""), c.get("bio", ""),
            c.get("universe", ""), c.get("archetype", ""),
            c.get("class", ""), " ".join(c.get("tags", [])),
        ]).lower()
        if q in searchable:
            results.append(c)
    return results


# ── Registry endpoints ─────────────────────────────────────────────────

@router.get("/api/citizens")
async def api_citizens(request: Request):
    """Return all citizens (unified: humans + AI).

    Query params:
        ?type=human|ai, ?universe=..., ?archetype=..., ?status=...
        ?q=search+term, ?sort=brain_power|neurons|thoughts
        ?limit=500&offset=0
    """
    citizens = _load_all_citizens()

    # Filters
    params = request.query_params
    ctype = params.get("type")
    if ctype:
        citizens = [c for c in citizens if c.get("type") == ctype]
    universe = params.get("universe")
    if universe:
        citizens = [c for c in citizens if c.get("universe") == universe]
    archetype = params.get("archetype")
    if archetype:
        citizens = [c for c in citizens if c.get("archetype") == archetype]
    status = params.get("status")
    if status:
        citizens = [c for c in citizens if c.get("status") == status]

    # Search
    q = params.get("q")
    if q:
        citizens = _search_citizens(citizens, q)

    # Sort
    sort_by = params.get("sort")
    if sort_by == "brain_power":
        citizens.sort(key=lambda c: c.get("brain_power", 0), reverse=True)
    elif sort_by == "neurons":
        citizens.sort(key=lambda c: c.get("neurons", 0), reverse=True)
    elif sort_by == "thoughts":
        citizens.sort(key=lambda c: c.get("thoughts_per_min", 0), reverse=True)

    total = len(citizens)
    try:
        limit = int(params.get("limit", 500))
        offset = int(params.get("offset", 0))
    except (ValueError, TypeError):
        limit, offset = 500, 0
    citizens = citizens[offset:offset + limit]

    orgs = _load_organizations()

    return {
        "citizens": citizens,
        "organizations": orgs,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/api/citizens/search")
async def api_citizens_search(q: str = "", limit: int = 20):
    """Search citizens by query."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="q parameter required")
    citizens = _load_all_citizens()
    results = _search_citizens(citizens, q)[:limit]
    return {"results": results, "total": len(results), "query": q}


@router.get("/api/brain-scores")
async def api_brain_scores():
    """Return brain power scores for all citizens with brains."""
    scores = _load_brain_scores()
    return {"scores": scores, "count": len(scores)}


@router.get("/api/citizens/{citizen_id}")
async def api_citizen(citizen_id: str):
    """Return a single citizen by id/handle."""
    all_citizens = _load_all_citizens()
    citizen = next((c for c in all_citizens if c["id"] == citizen_id), None)
    if not citizen:
        raise HTTPException(status_code=404, detail="Citizen not found")
    return citizen


@router.get("/api/citizens/{citizen_id}/relationships")
async def api_citizen_relationships(citizen_id: str):
    """Return relationships for a citizen."""
    rels_path = STATE_DIR / "relationships.json"
    if not rels_path.exists():
        return {"relationships": [], "total": 0}
    try:
        all_rels = json.loads(rels_path.read_text())
    except (json.JSONDecodeError, OSError):
        return {"relationships": [], "total": 0}
    citizen_rels = all_rels.get(citizen_id, [])
    return {"relationships": citizen_rels, "total": len(citizen_rels)}


# ── DM endpoints ───────────────────────────────────────────────────────

def _get_dm_thread_id(a: str, b: str) -> str:
    """Deterministic thread ID for a pair of citizens."""
    return "__".join(sorted([a, b]))


def _load_dm_thread(thread_id: str, limit: int = 50, offset: int = 0) -> list:
    """Load messages from a DM thread."""
    path = DM_DIR / f"{thread_id}.jsonl"
    if not path.exists():
        return []
    messages = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            try:
                messages.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    if offset:
        messages = messages[offset:]
    if limit:
        messages = messages[:limit]
    return messages


def _append_dm_message(thread_id: str, msg: dict):
    """Append a message to a DM thread."""
    DM_DIR.mkdir(parents=True, exist_ok=True)
    path = DM_DIR / f"{thread_id}.jsonl"
    with open(path, "a") as f:
        f.write(json.dumps(msg, ensure_ascii=False) + "\n")


def _list_dm_threads_for(citizen_id: str) -> list:
    """List all DM threads involving a citizen, with last message preview."""
    DM_DIR.mkdir(parents=True, exist_ok=True)
    threads = []
    for path in sorted(DM_DIR.glob("*.jsonl")):
        thread_id = path.stem
        parts = thread_id.split("__")
        if len(parts) != 2 or citizen_id not in parts:
            continue
        other = parts[0] if parts[1] == citizen_id else parts[1]
        lines = path.read_text().splitlines()
        msg_count = len(lines)
        last_msg = None
        if lines:
            try:
                last_msg = json.loads(lines[-1])
            except json.JSONDecodeError:
                pass
        # Count unread
        unread = 0
        for line in reversed(lines):
            try:
                m = json.loads(line)
                if m.get("from") != citizen_id and not m.get("read"):
                    unread += 1
                else:
                    break
            except json.JSONDecodeError:
                continue
        threads.append({
            "thread_id": thread_id,
            "other_citizen": other,
            "message_count": msg_count,
            "unread": unread,
            "last_message": {
                "from": last_msg.get("from", ""),
                "text": last_msg.get("text", "")[:100],
                "timestamp": last_msg.get("timestamp", ""),
            } if last_msg else None,
        })
    threads.sort(key=lambda t: (t.get("last_message") or {}).get("timestamp", ""), reverse=True)
    return threads


def _mark_thread_read(thread_id: str, reader: str) -> int:
    """Mark all messages from others as read for the reader."""
    path = DM_DIR / f"{thread_id}.jsonl"
    if not path.exists():
        return 0
    lines = path.read_text().splitlines()
    updated = []
    count = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            if msg.get("from") != reader and not msg.get("read"):
                msg["read"] = True
                msg["read_at"] = datetime.now(timezone.utc).isoformat()
                count += 1
            updated.append(json.dumps(msg, ensure_ascii=False))
        except json.JSONDecodeError:
            updated.append(line)
    if count > 0:
        path.write_text("\n".join(updated) + "\n")
    return count


@router.post("/api/dm/send")
async def dm_send(request: Request):
    """Send a DM from one citizen to another."""
    body = await request.json()
    sender = (body.get("from") or "").strip()
    recipient = (body.get("to") or "").strip()
    text = (body.get("text") or "").strip()

    if not sender or not recipient:
        raise HTTPException(status_code=400, detail="from and to fields required")
    if not text:
        raise HTTPException(status_code=400, detail="text field required")
    if sender == recipient:
        raise HTTPException(status_code=400, detail="Cannot DM yourself")

    # Verify both citizens exist
    all_citizens = _load_all_citizens()
    citizen_ids = {c["id"] for c in all_citizens}
    if sender not in citizen_ids:
        raise HTTPException(status_code=404, detail=f"Sender @{sender} not found")
    if recipient not in citizen_ids:
        raise HTTPException(status_code=404, detail=f"Recipient @{recipient} not found")

    thread_id = _get_dm_thread_id(sender, recipient)
    msg = {
        "id": str(uuid.uuid4())[:8],
        "thread_id": thread_id,
        "from": sender,
        "to": recipient,
        "text": text,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "read": False,
        "metadata": body.get("metadata", {}),
    }
    _append_dm_message(thread_id, msg)
    logger.info(f"DM: @{sender} -> @{recipient}: {text[:60]}...")
    return msg


@router.get("/api/dm/threads/{citizen_id}")
async def dm_threads(citizen_id: str):
    """List all DM threads for a citizen."""
    threads = _list_dm_threads_for(citizen_id)
    return {"citizen_id": citizen_id, "threads": threads, "total": len(threads)}


@router.get("/api/dm/thread/{thread_id}")
async def dm_thread(thread_id: str, limit: int = 50, offset: int = 0,
                    mark_read: str = "", reader: str = ""):
    """Read messages in a DM thread."""
    messages = _load_dm_thread(thread_id, limit=limit, offset=offset)
    if mark_read.lower() == "true" and reader:
        _mark_thread_read(thread_id, reader)
    return {"thread_id": thread_id, "messages": messages, "count": len(messages)}


@router.post("/api/dm/thread/{thread_id}/read")
async def dm_mark_read(thread_id: str, request: Request):
    """Mark all messages in a thread as read for a citizen."""
    body = await request.json()
    reader = (body.get("reader") or "").strip()
    if not reader:
        raise HTTPException(status_code=400, detail="reader field required")
    count = _mark_thread_read(thread_id, reader)
    return {"ok": True, "thread_id": thread_id, "marked_read": count}


# ── Citizen Profile Update ────────────────────────────────────────────────

# Fields a citizen can edit on their own profile
_EDITABLE_FIELDS = {
    "display_name", "first_name", "last_name", "nickname", "bio",
    "tags", "links", "website", "spotify_track", "canvas_color",
    "telegram_id", "emoji", "profile_pic",
    "human_partner", "parents",
}

# Profile field → (brain node type, content template)
_BRAIN_FIELD_MAP = {
    "bio": ("narrative", "My bio: {value}"),
    "display_name": ("concept", "My name is {value}."),
    "tags": ("concept", "My skills and interests: {value}"),
    "website": ("concept", "My website: {value}"),
    "spotify_track": ("memory", "My favorite track: {value}"),
    "emoji": ("state", "My emoji: {value}"),
    "nickname": ("concept", "People call me {value}."),
}


@router.put("/api/citizens/{citizen_id}")
async def update_citizen(citizen_id: str, request: Request):
    """Update a citizen's editable fields.

    Ownership check: X-Citizen-Handle header must match citizen_id,
    or caller must be a cofounder. Citizens can only edit themselves.

    Updates profile.json on disk + upserts brain nodes for graph sync.

    Editable fields: display_name, first_name, last_name, nickname, bio,
    tags, links, website, spotify_track, canvas_color, telegram_id, emoji.
    """
    # Find citizen profile on disk
    citizen_dir = CITIZENS_DIR / citizen_id
    profile_path = citizen_dir / "profile.json"

    if not profile_path.exists():
        raise HTTPException(status_code=404, detail=f"Citizen '{citizen_id}' not found")

    # Ownership check
    caller_id = request.headers.get("X-Citizen-Handle", "")
    if caller_id and caller_id != citizen_id:
        # Check if caller is cofounder
        all_citizens = _load_human_citizens()
        caller = next((c for c in all_citizens if c["id"] == caller_id), None)
        if not caller or caller.get("section") != "cofounder":
            raise HTTPException(status_code=403, detail="You can only edit your own profile")

    # Load current profile
    try:
        profile = json.loads(profile_path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=500, detail=f"Cannot read profile: {e}")

    updates = await request.json()
    identity = profile.setdefault("identity", {})
    caps = profile.setdefault("capabilities", {})
    contacts = profile.setdefault("contacts", {})

    # Map flat update fields to profile.json nested structure
    _IDENTITY_FIELDS = {"display_name": "name", "first_name": "first_name",
                        "last_name": "last_name", "nickname": "nickname",
                        "bio": "bio", "emoji": "emoji", "profile_pic": "profile_pic"}
    _CONTACT_FIELDS = {"telegram_id": "telegram_chat_id", "website": "website"}

    updated_fields = []
    for key, value in updates.items():
        if key not in _EDITABLE_FIELDS:
            continue

        if key in _IDENTITY_FIELDS:
            identity[_IDENTITY_FIELDS[key]] = value
        elif key == "tags":
            caps["primary_skills"] = value if isinstance(value, list) else [value]
        elif key == "canvas_color":
            identity["canvas_color"] = value
        elif key == "links":
            identity["links"] = value
        elif key == "spotify_track":
            identity["spotify_track"] = value
        elif key in _CONTACT_FIELDS:
            contacts[_CONTACT_FIELDS[key]] = value

        updated_fields.append(key)

        # Upsert brain node
        _upsert_profile_field_to_brain(citizen_id, key, value)

    # Handle relationship fields → L4 upsert
    human_partner = updates.get("human_partner")
    parents = updates.get("parents")

    if human_partner:
        relationships = profile.setdefault("relationships", {})
        relationships["human_partner"] = human_partner
        updated_fields.append("human_partner")

    if parents:
        relationships = profile.setdefault("relationships", {})
        relationships["parents"] = [
            p.get("parent_id", p) if isinstance(p, dict) else p
            for p in parents
        ]
        updated_fields.append("parents")

    if not updated_fields:
        raise HTTPException(status_code=400, detail="No editable fields in request")

    # Write profile.json
    profile_path.write_text(json.dumps(profile, indent=2, ensure_ascii=False))
    logger.info(f"Profile updated: {citizen_id} fields={updated_fields}")

    # Sync relationships to L4
    if human_partner or parents:
        try:
            import os
            from runtime.l4.citizen_l4_upsert import upsert_citizen_l4
            upsert_citizen_l4(
                handle=citizen_id,
                name=identity.get("name", citizen_id),
                org_id=identity.get("organization", ""),
                human_partner=human_partner,
                parents=parents,
                description=identity.get("bio", ""),
                falkordb_host=os.environ.get("FALKORDB_HOST"),
                falkordb_port=int(os.environ.get("FALKORDB_PORT", "6379")),
            )
        except Exception as e:
            logger.warning(f"L4 sync for {citizen_id} relationships: {e}")

    return {
        "ok": True,
        "citizen_id": citizen_id,
        "updated_fields": updated_fields,
    }


def _upsert_profile_field_to_brain(citizen_id: str, field_name: str, field_value):
    """Upsert a profile field as a brain node with high self_relevance.

    Creates/updates a node `self:{field_name}` in the citizen's brain.json.
    The node has high weight (0.7) and self_relevance (0.9) so it persists
    through Law 7 forgetting and appears in the cognitive landscape.
    """
    if field_name not in _BRAIN_FIELD_MAP:
        return
    if not field_value:
        return

    node_type, template = _BRAIN_FIELD_MAP[field_name]

    display_val = field_value
    if isinstance(field_value, list):
        display_val = ", ".join(str(v) for v in field_value)
    content = template.format(value=display_val)
    node_id = f"self:{field_name}"

    # Find brain file
    brain_path = None
    for name in ("brain_full.json", "brain.json"):
        candidate = CITIZENS_DIR / citizen_id / name
        if candidate.exists():
            brain_path = candidate
            break

    if not brain_path:
        # Create minimal brain
        citizen_dir = CITIZENS_DIR / citizen_id
        if citizen_dir.exists():
            brain_path = citizen_dir / "brain.json"
            brain_path.write_text(json.dumps({
                "citizen_id": citizen_id,
                "drives": {},
                "nodes": [],
                "links": [],
            }, indent=2))

    if not brain_path:
        return

    try:
        brain = json.loads(brain_path.read_text())
    except (OSError, json.JSONDecodeError):
        return

    nodes = brain.get("nodes", [])
    existing = next((n for n in nodes if n.get("id") == node_id), None)

    new_node = {
        "id": node_id,
        "type": node_type,
        "content": content,
        "weight": 0.7,
        "stability": 0.5,
        "energy": 0.2,
        "self_relevance": 0.9,
    }

    if existing:
        existing.update(new_node)
    else:
        nodes.append(new_node)

    brain["nodes"] = nodes
    brain_path.write_text(json.dumps(brain, indent=2, ensure_ascii=False))
    logger.info(f"Brain upsert: {citizen_id}/{node_id} ({node_type})")
