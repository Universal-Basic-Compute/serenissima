"""
First-boot self-registration for newly spawned citizens.

When a citizen directory contains `.first_boot.json`, this module
uses the L4 citizen upsert to register/update the citizen in FalkorDB.
Then deletes `.first_boot.json` (one-shot).

Called by the dispatcher on each tick (~30s).
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger("orchestrator.first_boot")

CITIZENS_DIR = Path(__file__).resolve().parent.parent.parent / "citizens"


def check_and_register_new_citizens(graph_ops=None) -> list[str]:
    """Scan citizen dirs for .first_boot.json and register them in L4.

    Returns list of handles that were successfully registered.
    """
    if not CITIZENS_DIR.exists():
        return []

    registered = []

    for citizen_dir in sorted(CITIZENS_DIR.iterdir()):
        if not citizen_dir.is_dir():
            continue

        boot_file = citizen_dir / ".first_boot.json"
        if not boot_file.exists():
            continue

        handle = citizen_dir.name
        logger.info(f"First boot detected for @{handle}")

        try:
            boot_data = json.loads(boot_file.read_text())
        except (OSError, json.JSONDecodeError) as e:
            logger.warning(f"Cannot read .first_boot.json for {handle}: {e}")
            continue

        success = _execute_registration(handle, boot_data)

        if success:
            boot_file.unlink()
            _activate_profile(handle)
            registered.append(handle)
            logger.info(f"@{handle} self-registered on L4 and confirmed")
        else:
            logger.warning(f"@{handle} first boot registration failed — will retry next tick")

    return registered


def _execute_registration(handle: str, boot_data: dict) -> bool:
    """Register citizen in L4 via upsert."""
    try:
        from runtime.l4.citizen_l4_upsert import upsert_citizen_l4

        host = os.environ.get("FALKORDB_HOST", "localhost")
        port = int(os.environ.get("FALKORDB_PORT", "6379"))

        result = upsert_citizen_l4(
            handle=handle,
            name=boot_data.get("handle", handle),
            wallet_address=boot_data.get("wallet_address", ""),
            endpoint_url=boot_data.get("registration", {}).get("endpoints", {}).get("citizen_dir", ""),
            org_id=_get_org_from_profile(handle),
            status="active",
            rsa_public_key=boot_data.get("rsa_public_key", ""),
            falkordb_host=host,
            falkordb_port=port,
        )
        return result.get("status") == "ok"

    except Exception as e:
        logger.error(f"L4 upsert failed for {handle}: {e}")
        return False


def _get_org_from_profile(handle: str) -> str:
    """Read org_id from citizen's profile.json."""
    profile_path = CITIZENS_DIR / handle / "profile.json"
    if not profile_path.exists():
        return ""
    try:
        profile = json.loads(profile_path.read_text())
        return profile.get("identity", {}).get("organization", "")
    except (OSError, json.JSONDecodeError):
        return ""


def _activate_profile(handle: str):
    """Set profile status to active after L4 registration."""
    profile_path = CITIZENS_DIR / handle / "profile.json"
    if not profile_path.exists():
        return
    try:
        profile = json.loads(profile_path.read_text())
        profile["status"] = "active"
        profile_path.write_text(json.dumps(profile, indent=2, ensure_ascii=False))
    except (OSError, json.JSONDecodeError):
        pass
