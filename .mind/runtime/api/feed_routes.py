"""
Feed routes — citizen wall posts (Moments in Spaces).

In the new architecture:
  - Feed items are Moment nodes in the graph
  - Each citizen's feed is a Space they own
  - Posts appear on the citizen's wall (their feed Space)
  - Mentions create links to other Actors

Storage: JSONL files at shrine/state/feed/{user_id}.jsonl (one file per citizen wall).
Each line is a feed post (Moment). Same append-only pattern as chat_routes.py.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException

from runtime.api.rate_limiter import check_rate_limit
from runtime.api import jwt_utils

logger = logging.getLogger("home.feed")

router = APIRouter(prefix="/feed", tags=["feed"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
FEED_DIR = PROJECT_ROOT / "shrine" / "state" / "feed"


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


def _sanitize_id(raw: str, max_len: int = 64) -> str:
    """Sanitize a user-provided ID for use as a filename component."""
    return "".join(c for c in raw if c.isalnum() or c in "-_")[:max_len]


# ── Storage helpers ───────────────────────────────────────────────────────

def _feed_path(user_id: str) -> Path:
    """Return the JSONL file path for a citizen's feed wall."""
    safe_id = _sanitize_id(user_id)
    if not safe_id:
        safe_id = "unknown"
    return FEED_DIR / f"{safe_id}.jsonl"


def _append_post(user_id: str, post: dict) -> dict:
    """Append a post (Moment) to a citizen's feed JSONL file."""
    FEED_DIR.mkdir(parents=True, exist_ok=True)
    path = _feed_path(user_id)
    with open(path, "a") as f:
        f.write(json.dumps(post, ensure_ascii=False) + "\n")
    return post


def _read_feed(user_id: str, limit: int = 50, since: str | None = None) -> list[dict]:
    """Read feed posts for a citizen, newest first."""
    path = _feed_path(user_id)
    if not path.exists():
        return []

    posts = []
    for line in path.read_text().strip().split("\n"):
        if not line:
            continue
        try:
            post = json.loads(line)
            if since and post.get("created_at", "") <= since:
                continue
            posts.append(post)
        except json.JSONDecodeError:
            continue

    # Return newest first, limited
    posts.reverse()
    return posts[:limit]


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/{user_id}")
async def get_feed(user_id: str, request: Request, limit: int = 50, since: str | None = None):
    """
    Get a citizen's feed (wall posts). Public endpoint.

    Each post is a Moment — a timestamped content entry on the citizen's wall Space.

    Query params:
      - limit: max posts to return (default 50)
      - since: ISO timestamp, only return posts after this time
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    safe_id = _sanitize_id(user_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid user_id")

    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    posts = _read_feed(safe_id, limit=limit, since=since)
    return {
        "user_id": safe_id,
        "posts": posts,
        "count": len(posts),
    }


@router.post("/")
async def create_post(request: Request):
    """
    Post to the authenticated citizen's feed wall.

    Creates a Moment node on the citizen's feed Space.

    Body:
      - content (str, required): the post text
      - media (list[str], optional): URLs to attached media
      - mentions (list[str], optional): user_ids mentioned in the post
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")
    author_name = payload.get("name", "")

    data = await request.json()
    content = (data.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")
    if len(content) > 5000:
        raise HTTPException(status_code=400, detail="content exceeds 5000 character limit")

    media = data.get("media", [])
    if not isinstance(media, list):
        media = []
    mentions = data.get("mentions", [])
    if not isinstance(mentions, list):
        mentions = []

    now = datetime.now(timezone.utc).isoformat()
    post = {
        "id": uuid.uuid4().hex[:12],
        "profile_id": user_id,
        "author_id": user_id,
        "author_name": author_name,
        "content": content,
        "media": media[:10],  # cap at 10 media items
        "mentions": mentions[:20],  # cap at 20 mentions
        "created_at": now,
        "edited_at": None,
        "source": "api",
    }

    _append_post(user_id, post)
    logger.info(f"[FEED] New post by {user_id}: {content[:60]}...")
    return {"post": post}


@router.get("/")
async def get_my_feed(request: Request, limit: int = 50, since: str | None = None):
    """
    Get the authenticated citizen's own feed.

    Shortcut for GET /feed/{my_user_id}. Requires auth.
    """
    if not check_rate_limit(_get_client_ip(request)):
        raise HTTPException(status_code=429, detail="Too many requests")

    payload = _require_auth(request)
    user_id = payload.get("sub", "")

    if limit < 1:
        limit = 1
    if limit > 200:
        limit = 200

    posts = _read_feed(user_id, limit=limit, since=since)
    return {
        "user_id": user_id,
        "posts": posts,
        "count": len(posts),
    }
