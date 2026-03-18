#!/usr/bin/env python3
"""
Render Env Sync — Push all .env vars to Render service on every git push.

Installed as .git/hooks/pre-push by `mind init`.
Reads RENDER_API_KEY and service ID from .env / render.yaml.

Usage:
    python3 .mind/scripts/render_env_sync.py          # manual run
    # Or automatically via git hook (installed by mind init)
"""

import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError


def load_env(env_path=".env"):
    """Parse .env file into dict."""
    env = {}
    path = Path(env_path)
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and val:
            env[key] = val
    return env


def detect_service_id():
    """Detect Render service ID from render.yaml or env."""
    sid = os.environ.get("RENDER_SERVICE_ID")
    if sid:
        return sid

    # Try render.yaml
    yaml_path = Path("render.yaml")
    if yaml_path.exists():
        text = yaml_path.read_text()
        # Look for service ID comment or name
        match = re.search(r"#\s*service_id:\s*(\S+)", text)
        if match:
            return match.group(1)

        # Detect service name from render.yaml, then look up via API
        name_match = re.search(r"name:\s*(\S+)", text)
        if name_match:
            return lookup_service_by_name(name_match.group(1))

    return None


def lookup_service_by_name(name):
    """Look up Render service ID by name via API."""
    api_key = load_env().get("RENDER_API_KEY") or os.environ.get("RENDER_API_KEY")
    if not api_key:
        return None
    try:
        req = Request(
            f"https://api.render.com/v1/services?name={name}&limit=1",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            if data:
                svc = data[0].get("service", data[0])
                return svc.get("id")
    except Exception:
        pass
    return None


def sync_env_to_render(env_path=".env"):
    """Push all .env vars to Render service."""
    env = load_env(env_path)
    if not env:
        print("[render-sync] No .env found or empty, skipping")
        return False

    api_key = env.get("RENDER_API_KEY") or os.environ.get("RENDER_API_KEY")
    if not api_key:
        print("[render-sync] No RENDER_API_KEY, skipping")
        return False

    service_id = detect_service_id()
    if not service_id:
        print("[render-sync] Could not detect Render service ID, skipping")
        return False

    # Build env vars payload (include ALL vars from .env)
    env_vars = [{"key": k, "value": v} for k, v in env.items()]

    # Add standard Render vars
    for k, v in [("NODE_ENV", "production"), ("RENDER", "true")]:
        if k not in env:
            env_vars.append({"key": k, "value": v})

    # Push via API
    try:
        payload = json.dumps(env_vars).encode()
        req = Request(
            f"https://api.render.com/v1/services/{service_id}/env-vars",
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="PUT",
        )
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            count = len(result) if isinstance(result, list) else 0
            print(f"[render-sync] {count} env vars synced to {service_id}")
            return True
    except URLError as e:
        print(f"[render-sync] Failed: {e}")
        return False


if __name__ == "__main__":
    sync_env_to_render()
