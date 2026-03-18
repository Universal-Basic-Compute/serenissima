"""
House state, activity dashboard, and citizen profile routes.

House state, activity dashboard, and citizen profile routes (FastAPI).
Aggregates state from shrine/state/ files for the webapp dashboard.

Profile routes use the new architecture:
  - Profiles live on Actor nodes (stored as JSONL via citizen_profiles)
  - A "house" is the citizen home deployment — info about this runtime instance
  - Spaces are containers; Actors have HAS_ACCESS links to Spaces with role property
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

from runtime.api.rate_limiter import check_rate_limit
from runtime.api import jwt_utils
from runtime.api import citizen_profiles

logger = logging.getLogger("home.house")

router = APIRouter(tags=["house"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
STATE_DIR = PROJECT_ROOT / "shrine" / "state"
KNOWLEDGE_DIR = PROJECT_ROOT / "knowledge" / "data"

# Journal events to filter out as noise
NOISE_EVENTS = {
    "lifeline", "neuron_cleanup", "biometric_sync", "dialogue",
    "invoke_start", "invoke_end", "route_decision", "priority_pop",
}


def _read_json(path: Path) -> dict:
    """Safely read a JSON file."""
    try:
        if path.exists():
            return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _read_jsonl_tail(path: Path, n: int = 100) -> list[dict]:
    """Read last N lines of a JSONL file."""
    if not path.exists():
        return []
    try:
        lines = path.read_text().strip().split("\n")
        result = []
        for line in lines[-n:]:
            if line.strip():
                try:
                    result.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return result
    except OSError:
        return []


@router.get("/api/house")
async def house_state():
    """Aggregate awareness state for the house visualization."""
    result = {
        "ts": datetime.now().isoformat(),
        "presence": {"active_sessions": 0, "busy_count": 0, "queue_depth": 0, "citizens_online": 0},
        "vitals": {},
        "conversation": {"recent": []},
        "neurons": [],
        "activity": [],
        "backlog": {"ready": 0, "in_progress": 0, "done": 0, "total": 0},
    }

    # --- Presence: orchestrator state ---
    orch = _read_json(STATE_DIR / "orchestrator.json")
    if orch:
        result["presence"]["active_sessions"] = orch.get("active_sessions", 0)
        result["presence"]["busy_sessions"] = orch.get("busy_sessions", 0)
        result["presence"]["queue_depth"] = orch.get("queue_depth", 0)
        result["presence"]["max_parallel"] = orch.get("max_parallel", 5)

    # --- Neurons: active sessions ---
    neuron_dir = STATE_DIR / "neurons"
    if neuron_dir.exists():
        import yaml
        for yf in sorted(neuron_dir.glob("*.yaml"), key=lambda f: f.stat().st_mtime, reverse=True)[:20]:
            try:
                data = yaml.safe_load(yf.read_text()) or {}
                result["neurons"].append({
                    "id": yf.stem,
                    "status": data.get("status", "unknown"),
                    "purpose": (data.get("purpose") or "")[:120],
                    "mode": data.get("mode", ""),
                    "created": data.get("created", ""),
                    "updated": data.get("updated", ""),
                })
            except Exception:
                pass
        result["presence"]["active_sessions"] = max(
            result["presence"]["active_sessions"],
            len([n for n in result["neurons"] if n["status"] in ("busy", "spawning")])
        )

    # --- Vitals: biometrics ---
    bio = _read_json(KNOWLEDGE_DIR / "biometrics" / "latest.json")
    if bio:
        summary = bio.get("summary", {})
        cognitive = bio.get("cognitive", {})
        result["vitals"] = {
            "heart_rate": summary.get("heart_rate", {}),
            "stress": summary.get("stress", {}),
            "body_battery": summary.get("body_battery", {}),
            "sleep": summary.get("sleep", {}),
            "ans_mode": cognitive.get("ANS_ESTIMATE", {}).get("mode", "unknown"),
            "updated_at": bio.get("updated_at", ""),
        }

    # --- Conversation: recent dialogue ---
    dialogue_entries = _read_jsonl_tail(STATE_DIR / "dialogue.jsonl", 8)
    result["conversation"]["recent"] = dialogue_entries

    # --- Activity: recent journal entries (non-noise) ---
    journal_entries = _read_jsonl_tail(STATE_DIR / "journal.jsonl", 100)
    for entry in reversed(journal_entries):
        if entry.get("event") not in NOISE_EVENTS:
            result["activity"].append({
                "ts": entry.get("ts", ""),
                "event": entry.get("event", ""),
                "content": (entry.get("content") or "")[:200],
                "instance": entry.get("instance", ""),
            })
            if len(result["activity"]) >= 15:
                break

    # --- Backlog stats ---
    backlog_entries = _read_jsonl_tail(STATE_DIR / "backlog.jsonl", 5000)
    tasks = {}
    for t in backlog_entries:
        tid = t.get("task_id", t.get("id", ""))
        if tid:
            tasks[tid] = t
    for t in tasks.values():
        s = t.get("status", "")
        if s == "ready":
            result["backlog"]["ready"] += 1
        elif s == "in_progress":
            result["backlog"]["in_progress"] += 1
        elif s == "done":
            result["backlog"]["done"] += 1
        result["backlog"]["total"] += 1

    # --- Citizens online ---
    users = _read_jsonl_tail(STATE_DIR / "telegram_users.jsonl", 10000)
    seen = set()
    for u in users:
        uid = u.get("chat_id", u.get("user_id", ""))
        if uid:
            seen.add(str(uid))
    result["presence"]["citizens_online"] = len(seen)

    return result


@router.get("/house/state")
async def house_state_v2():
    """Return the live state of the awareness house (v2 visualization)."""
    house = {
        "ts": datetime.now().isoformat(),
        "rooms": [],
        "hallway": [],
        "neon": {},
        "ceiling": {},
        "streets": {},
    }

    # --- Rooms: Active neurons ---
    neuron_dir = STATE_DIR / "neurons"
    if neuron_dir.exists():
        import yaml
        for yf in sorted(neuron_dir.glob("*.yaml")):
            try:
                data = yaml.safe_load(yf.read_text())
                if data and data.get("status") in ("busy", "idle", "spawning"):
                    house["rooms"].append({
                        "id": yf.stem,
                        "status": data.get("status", "unknown"),
                        "mode": data.get("mode", "partner"),
                        "purpose": (data.get("purpose") or "")[:80],
                        "created": data.get("created_at", ""),
                    })
            except Exception:
                pass

    # --- Hallway: Last 20 journal events (non-noise) ---
    journal_entries = _read_jsonl_tail(STATE_DIR / "journal.jsonl", 100)
    for entry in reversed(journal_entries):
        if len(house["hallway"]) >= 20:
            break
        if entry.get("event") not in NOISE_EVENTS:
            house["hallway"].append({
                "ts": entry.get("ts", ""),
                "event": entry.get("event", ""),
                "content": (entry.get("content") or "")[:120],
                "instance": entry.get("instance", ""),
            })

    # --- Neon: Biometrics ---
    bio = _read_json(KNOWLEDGE_DIR / "biometrics" / "latest.json")
    if bio:
        summary = bio.get("summary", {})
        cognitive = bio.get("cognitive", {})
        house["neon"] = {
            "hr": summary.get("heart_rate", {}).get("resting"),
            "hrv": summary.get("hrv", {}).get("weekly_avg"),
            "stress": summary.get("stress", {}).get("current") or summary.get("stress", {}).get("avg"),
            "energy": summary.get("body_battery", {}).get("latest"),
            "energy_max": summary.get("body_battery", {}).get("max"),
            "sleep_hours": cognitive.get("SLEEP", {}).get("duration_hours"),
            "ans_mode": cognitive.get("ANS_ESTIMATE", {}).get("mode", "unknown"),
        }

    # --- Streets: Connected citizens ---
    users = _read_jsonl_tail(STATE_DIR / "telegram_users.jsonl", 10000)
    seen = {}
    for u in users:
        uid = str(u.get("chat_id", u.get("user_id", "")))
        if uid:
            seen[uid] = u
    recent_citizens = []
    for uid, u in list(seen.items())[-5:]:
        recent_citizens.append({
            "name": u.get("name", u.get("first_name", "Anonymous")),
            "joined": u.get("registered_at", u.get("ts", "")),
        })

    house["streets"] = {
        "citizen_count": len(seen),
        "recent": recent_citizens,
    }

    house["meta"] = {
        "room_count": len(house["rooms"]),
        "hallway_events": len(house["hallway"]),
        "has_neon": bool(house["neon"]),
        "has_music": bool(house["ceiling"]),
    }

    return house


# ── Auth helper ───────────────────────────────────────────────────────────

def _require_auth(request: Request) -> dict:
    """Extract and verify JWT from Authorization header. Returns payload or raises 401."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header with Bearer token required")
    token = auth_header[7:].strip()
    payload = jwt_utils.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def _get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


# ── House info ────────────────────────────────────────────────────────────

@router.get("/house/info")
async def house_info():
    """Public house information — what this citizen home is, who lives here."""
    home_id = os.environ.get("HOME_ID", "mind-home-dev")
    version = "0.1.0"

    citizen_count = 0
    citizen_handles = []
    try:
        from runtime.citizens import list_available_citizens
        citizens = list_available_citizens()
        citizen_count = len(citizens)
        citizen_handles = [c["handle"] for c in citizens]
    except Exception:
        pass

    return {
        "home_id": home_id,
        "version": version,
        "citizen_count": citizen_count,
        "citizens": citizen_handles,
        "capabilities": ["chat", "feed", "dm", "membrane"],
    }


# ── Profile routes ────────────────────────────────────────────────────────

@router.get("/house/profile/me")
async def get_my_profile(request: Request):
    """Get the authenticated citizen's own profile."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")

    profile = citizen_profiles.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Return profile without sensitive fields
    safe_profile = {k: v for k, v in profile.items() if k != "password_hash"}
    return {"profile": safe_profile}


@router.put("/house/profile/me")
async def update_my_profile(request: Request):
    """Update the authenticated citizen's profile. Accepts partial updates."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")

    data = await request.json()

    # Only allow updating specific fields
    allowed_fields = {"name", "bio", "avatar_url", "language", "linked_accounts", "wallet"}
    updates = {k: v for k, v in data.items() if k in allowed_fields}

    if not updates:
        raise HTTPException(
            status_code=400,
            detail="No valid fields to update. Allowed: " + ", ".join(sorted(allowed_fields)),
        )

    updated = citizen_profiles.update_profile(user_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Profile not found")

    safe_profile = {k: v for k, v in updated.items() if k != "password_hash"}
    logger.info(f"[HOUSE] Profile updated for user_id={user_id}: {list(updates.keys())}")
    return {"profile": safe_profile}


@router.get("/house/profile/{user_id}")
async def get_user_profile(user_id: str, request: Request):
    """Get a citizen's public profile by user_id."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    profile = citizen_profiles.get_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Citizen not found")

    # Public view — only non-sensitive fields
    public_profile = {
        "user_id": profile.get("user_id"),
        "name": profile.get("name", ""),
        "bio": profile.get("bio", ""),
        "avatar_url": profile.get("avatar_url", ""),
        "trust": profile.get("trust", "medium"),
        "created_at": profile.get("created_at"),
    }
    return {"profile": public_profile}


@router.get("/house/citizens")
async def list_house_citizens(request: Request):
    """List all citizen profiles in this house (public view)."""
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    profiles = citizen_profiles.list_profiles()
    public_list = []
    for p in profiles:
        public_list.append({
            "user_id": p.get("user_id"),
            "name": p.get("name", ""),
            "bio": p.get("bio", ""),
            "avatar_url": p.get("avatar_url", ""),
            "trust": p.get("trust", "medium"),
        })

    return {"citizens": public_list, "count": len(public_list)}
