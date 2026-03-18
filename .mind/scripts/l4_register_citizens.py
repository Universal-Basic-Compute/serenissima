#!/usr/bin/env python3
"""
L4 Citizen Registration — register all citizens/ to the L4 registry.

Called at end of deploy (via entrypoint or post-deploy hook).
Auto-detects citizen data from the repo structure.

Usage:
    python3 .mind/scripts/l4_register_citizens.py
"""

import os
import sys
from pathlib import Path

# Add mind-mcp to path for runtime.l4 import
for candidate in [Path.home() / "mind-mcp", Path("/app"), Path.cwd()]:
    l4_path = candidate / "runtime" / "l4"
    if l4_path.exists():
        sys.path.insert(0, str(candidate))
        break


def _detect_org_id():
    org_id = os.environ.get("ORG_ID")
    if org_id:
        return org_id
    try:
        import subprocess
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        parts = remote.split(":")[-1].replace(".git", "").split("/")
        return parts[-2] if len(parts) >= 2 else "unknown"
    except Exception:
        return "unknown"


def _detect_citizens_dir():
    cwd = Path.cwd()
    for candidate in [cwd / "citizens", cwd / "data", cwd]:
        if (candidate / "citizens.json").exists() or any(candidate.glob("*/entity.json")):
            return str(candidate)
    return None


def main():
    from runtime.l4.citizen_l1_ensure import bulk_ensure_citizens
    from runtime.l4.citizen_l4_upsert import bulk_register_citizens

    org_id = _detect_org_id()

    endpoint_base = os.environ.get("RENDER_EXTERNAL_URL", "")
    if not endpoint_base:
        repo_name = Path.cwd().name
        endpoint_base = f"https://{repo_name}.onrender.com"
    endpoint_base = endpoint_base.rstrip("/") + "/api/citizens"

    citizens_dir = _detect_citizens_dir()
    if not citizens_dir:
        print("  No citizens found, skipping")
        return

    falkordb_host = os.environ.get("L4_FALKORDB_HOST", os.environ.get("FALKORDB_HOST", "mind-protocol-falkordb"))
    falkordb_port = int(os.environ.get("L4_FALKORDB_PORT", os.environ.get("FALKORDB_PORT", "6379")))

    # ── Step 1: Ensure L1 graph + keypair for every citizen ──
    print(f"\n  L1 Citizen Ensure (graph + keypair)")
    print(f"  ────────────────────────────────────")
    print(f"  Source: {citizens_dir}")

    pubkeys = bulk_ensure_citizens(citizens_dir)

    # ── Step 2: Register all citizens to L4 with their pubkeys ──
    print(f"\n  L4 Citizen Registration")
    print(f"  ───────────────────────")
    print(f"  Org: {org_id}")
    print(f"  Endpoint: {endpoint_base}")

    count = bulk_register_citizens(
        citizens_dir=citizens_dir,
        org_id=org_id,
        endpoint_base=endpoint_base,
        falkordb_host=falkordb_host,
        falkordb_port=falkordb_port,
    )
    print(f"  Done: {count} citizens.\n")


if __name__ == "__main__":
    main()
