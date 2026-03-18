"""HTTP membrane endpoint — universal information bus.

Exposes membrane operations over HTTP for cross-home communication.
Other citizen homes can send stimuli, subscribe to streams, and query
this home's public nodes through these endpoints.

Wired into home_server.py as a FastAPI router.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("membrane.http")

router = APIRouter(prefix="/membrane", tags=["membrane"])


# ── Models ──────────────────────────────────────────────────────────────────

class StimulusRequest(BaseModel):
    query: str
    from_org: str = "unknown"
    from_home: str = "unknown"
    top_k: int = 5


class SubscribeRequest(BaseModel):
    stream_type: str  # "rss" | "webhook" | "citizen_home"
    url: str
    scope: str = "org"  # "org" | "citizen:{handle}"
    filter: Optional[str] = None
    poll_interval_seconds: int = 300


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/stimulus")
async def receive_stimulus(req: StimulusRequest):
    """Receive a cross-org stimulus query.

    Another citizen home sends a natural language query.
    We search our public nodes and return matches.
    """
    try:
        from runtime.membrane import get_stimulus_handler
        handler = get_stimulus_handler()
        if not handler:
            raise HTTPException(
                status_code=503,
                detail="Stimulus handler not initialized (graph not connected)",
            )

        result = handler.handle_query(
            query=req.query,
            from_org=req.from_org,
            top_k=req.top_k,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Stimulus handling failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def membrane_info():
    """Return membrane metadata for L4 registry discovery."""
    home_id = os.environ.get("HOME_ID", "mind-home-dev")
    public_url = os.environ.get("MIND_PUBLIC_URL", "")

    return {
        "home_id": home_id,
        "membrane_endpoint": f"{public_url}/membrane" if public_url else None,
        "capabilities": ["stimulus", "info"],
        "protocol_version": "0.1.0",
    }


@router.post("/subscribe")
async def subscribe_stream(req: SubscribeRequest):
    """Subscribe to an information stream (RSS, webhook, citizen home).

    Stores the subscription. A background worker processes subscriptions
    by polling RSS feeds or registering webhook endpoints.
    """
    # For now, store subscription in state file
    from pathlib import Path
    subs_file = Path(__file__).resolve().parent.parent.parent / ".mind" / "state" / "subscriptions.jsonl"
    subs_file.parent.mkdir(parents=True, exist_ok=True)

    subscription = {
        "id": f"sub_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "stream_type": req.stream_type,
        "url": req.url,
        "scope": req.scope,
        "filter": req.filter,
        "poll_interval_seconds": req.poll_interval_seconds,
        "created_at": datetime.now().isoformat(),
        "active": True,
    }

    with open(subs_file, "a") as f:
        f.write(json.dumps(subscription) + "\n")

    logger.info(f"New subscription: {subscription['id']} ({req.stream_type}: {req.url})")
    return {"status": "subscribed", "subscription": subscription}


@router.get("/subscriptions")
async def list_subscriptions():
    """List active stream subscriptions."""
    from pathlib import Path
    subs_file = Path(__file__).resolve().parent.parent.parent / ".mind" / "state" / "subscriptions.jsonl"
    if not subs_file.exists():
        return {"subscriptions": []}

    subs = []
    for line in subs_file.read_text().strip().split("\n"):
        if line.strip():
            try:
                sub = json.loads(line)
                if sub.get("active", True):
                    subs.append(sub)
            except json.JSONDecodeError:
                pass

    return {"subscriptions": subs}
