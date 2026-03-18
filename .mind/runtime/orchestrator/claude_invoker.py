"""Claude Code subprocess invoker — the sacred path.

Citizens MUST use Claude Code subprocess (`claude --print`), NOT direct API.
Direct API loses tools, MCP, repo access, safety layers — kills all capabilities.
The `invoke_degraded()` path is fallback ONLY.

Invokes Claude Code subprocess for citizen sessions.
"""

import os
import signal
import subprocess
import time
import uuid
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from runtime.orchestrator.account_balancer import (
    get_account_env,
    release_account,
    mark_account_exhausted,
    get_failover_env,
)
from runtime.orchestrator.degradation import (
    detect_rate_limit_error,
    escalate,
    attempt_recovery,
)
from runtime.citizens import load_citizen_identity, build_citizen_prompt

logger = logging.getLogger("orchestrator.invoker")

# ── Constants ───────────────────────────────────────────────────────────────

SESSION_TIMEOUT = 900  # 15 minutes


def get_state_dir() -> Path:
    """Return the state directory for response files."""
    return Path(__file__).resolve().parent.parent.parent / "shrine" / "state"


# ── Main invocation ─────────────────────────────────────────────────────────

def invoke_claude(
    request: dict,
    session_id: str,
    resume_claude_session: Optional[str] = None,
    pin_account_id: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    """Invoke Claude Code for a single request. Runs in thread pool.

    Returns (response_text, voice_response_or_None).
    """
    mode = request.get("mode", "partner")
    voice_text = request.get("voice_text", "")
    source = request.get("source", "")
    metadata = request.get("metadata", {})
    sender = request.get("sender", "user")

    # Citizen session detection
    citizen_handle = metadata.get("citizen_handle")
    citizen_data = None
    is_citizen_session = False
    if citizen_handle:
        citizen_data = load_citizen_identity(citizen_handle)
        if citizen_data:
            is_citizen_session = True
            logger.info(f"Citizen session for @{citizen_handle}")

    # Task routing
    is_task = source == "task" or metadata.get("task_type") == "implementation"
    task_cwd = metadata.get("cwd") if is_task else None

    # Build prompt
    prompt = _build_prompt(
        request, session_id, mode, voice_text, sender,
        is_citizen_session, citizen_data,
        is_task, task_cwd, metadata,
    )

    # Determine working directory
    project_root = Path(__file__).resolve().parent.parent.parent
    if is_citizen_session and citizen_data:
        citizen_dir = Path(citizen_data["dir"])
        working_dir = citizen_dir if citizen_dir.exists() else project_root
    elif task_cwd and Path(task_cwd).exists():
        working_dir = Path(task_cwd)
    else:
        working_dir = project_root

    # Build command
    cmd = [
        "claude",
        "--print",
        "--output-format", "text",
        "--dangerously-skip-permissions",
    ]

    # Conversation continuity
    is_resuming = False
    claude_session_uuid = None
    if resume_claude_session:
        cmd.extend(["--resume", resume_claude_session])
        claude_session_uuid = resume_claude_session
        is_resuming = True
    else:
        claude_session_uuid = str(uuid.uuid4())
        cmd.extend(["--session-id", claude_session_uuid])

    # Add context directories
    state_dir = get_state_dir()
    if is_citizen_session:
        cmd.extend(["--add-dir", str(state_dir.parent)])  # shrine for journal
    elif is_task and task_cwd:
        cmd.extend(["--add-dir", str(state_dir.parent)])
    else:
        cmd.extend(["--add-dir", ".."])

    # Build clean env (strip CLAUDECODE to allow nested invocation)
    clean_env = {k: v for k, v in os.environ.items() if k not in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT")}

    # Account selection
    if pin_account_id:
        balanced_env = _find_account_env(pin_account_id, clean_env)
    else:
        balanced_env = get_account_env(clean_env)
    account_id = balanced_env.get("_CLAUDE_ACCOUNT_ID", "default")

    # Launch subprocess
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=working_dir,
        env=balanced_env,
    )

    # For resumed sessions, send lean follow-up
    if is_resuming and voice_text:
        input_text = f"[FOLLOW-UP from {sender}]\n{voice_text}\n\nRespond naturally. Write to state/last_response_{session_id}.txt with ---VOICE--- separator."
    else:
        input_text = prompt

    # Execute
    start_time = time.time()
    try:
        stdout, stderr = process.communicate(input=input_text, timeout=SESSION_TIMEOUT)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        logger.warning(f"Session {session_id} timed out after {SESSION_TIMEOUT}s")

    elapsed = time.time() - start_time
    release_account(balanced_env, error=process.returncode != 0)

    # Check for rate limiting
    is_account_error = detect_rate_limit_error(stderr or "", stdout or "")

    # Read response from session-specific file
    response_file = state_dir / f"last_response_{session_id}.txt"
    response = ""
    voice_response = None

    if response_file.exists():
        raw = response_file.read_text().strip()
        response_file.unlink()
        if "---VOICE---" in raw:
            parts = raw.split("---VOICE---", 1)
            response = parts[0].strip()
            voice_response = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
        else:
            response = raw

    # Stdout fallback
    if not response and stdout and stdout.strip():
        _lines = [ln for ln in stdout.strip().splitlines()
                   if not ln.startswith("✓") and not ln.startswith("●")]
        _fallback = "\n".join(_lines).strip()
        if _fallback and len(_fallback) > 10:
            response = _fallback
            logger.debug(f"Session {session_id}: used stdout fallback ({len(response)} chars)")

    # Empty response diagnostics
    if not response:
        _rc = process.returncode
        _diag = [f"exit={_rc}", f"elapsed={elapsed:.1f}s", f"account={account_id}"]
        if _rc is not None and _rc < 0:
            try:
                _sig_name = signal.Signals(-_rc).name
            except (ValueError, AttributeError):
                _sig_name = f"SIG({-_rc})"
            _diag.append(f"signal={_sig_name}")
        if stderr:
            _diag.append(f"stderr={stderr[:200]}")
        logger.warning(f"Session {session_id} empty: {'; '.join(_diag)}")

    # Account failover (retry once with different account)
    _is_error_response = is_account_error and response and detect_rate_limit_error("", response)
    if _is_error_response:
        response = ""  # Clear error-as-response

    if not response and is_account_error and not pin_account_id:
        response, voice_response, elapsed = _attempt_failover(
            account_id, clean_env, cmd[:],  # Pass a copy of cmd
            working_dir, input_text, session_id,
            response_file, elapsed,
        )

    # Recovery / degradation tracking
    if response:
        attempt_recovery()
    elif detect_rate_limit_error(stderr or "", stdout or ""):
        escalate(f"Empty response from {account_id}")

    logger.info(f"Session {session_id} done in {elapsed:.0f}s — {len(response)} chars")
    return (response, voice_response)


def _attempt_failover(
    account_id: str,
    clean_env: dict,
    base_cmd: list,
    working_dir: Path,
    input_text: str,
    session_id: str,
    response_file: Path,
    elapsed: float,
) -> tuple[str, Optional[str], float]:
    """Attempt failover to a different account after failure."""
    mark_account_exhausted(account_id)
    failover_env = get_failover_env(account_id, clean_env)
    if not failover_env:
        logger.warning(f"Account {account_id} exhausted — no failover available")
        return ("", None, elapsed)

    failover_id = failover_env.get("_CLAUDE_ACCOUNT_ID", "?")
    logger.info(f"Account failover: {account_id} → {failover_id}")

    failover_uuid = str(uuid.uuid4())
    failover_cmd = [
        "claude", "--print", "--output-format", "text",
        "--dangerously-skip-permissions",
        "--session-id", failover_uuid,
        "--add-dir", "..",
    ]

    fo_proc = subprocess.Popen(
        failover_cmd,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=working_dir, env=failover_env,
    )

    fo_start = time.time()
    try:
        fo_stdout, fo_stderr = fo_proc.communicate(input=input_text, timeout=SESSION_TIMEOUT)
    except subprocess.TimeoutExpired:
        fo_proc.kill()
        fo_stdout, fo_stderr = fo_proc.communicate()

    fo_elapsed = time.time() - fo_start
    release_account(failover_env, error=fo_proc.returncode != 0)

    response = ""
    voice_response = None
    if response_file.exists():
        raw = response_file.read_text().strip()
        response_file.unlink()
        if "---VOICE---" in raw:
            parts = raw.split("---VOICE---", 1)
            response = parts[0].strip()
            voice_response = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
        else:
            response = raw

    if response:
        logger.info(f"Failover to {failover_id} succeeded in {fo_elapsed:.0f}s")
    else:
        if detect_rate_limit_error(fo_stderr or "", fo_stdout or ""):
            mark_account_exhausted(failover_id)
        logger.warning(f"Failover to {failover_id} also failed")

    return (response, voice_response, elapsed + fo_elapsed)


def _find_account_env(account_id: str, base_env: Optional[dict] = None) -> dict:
    """Find a specific account's env (for pinned resume)."""
    from runtime.orchestrator.account_balancer import get_accounts
    env = dict(base_env or os.environ)
    for a in get_accounts():
        if a["id"] == account_id:
            env["HOME"] = a["home"]
            env["_CLAUDE_ACCOUNT_ID"] = a["id"]
            return env
    return env


# ── Prompt building ─────────────────────────────────────────────────────────

def _build_prompt(
    request: dict,
    session_id: str,
    mode: str,
    voice_text: str,
    sender: str,
    is_citizen_session: bool,
    citizen_data: Optional[dict],
    is_task: bool,
    task_cwd: Optional[str],
    metadata: dict,
) -> str:
    """Build the invocation prompt based on request type."""

    _now = datetime.now()
    _day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    date_line = f"**Date:** {_day_names[_now.weekday()]} {_now.strftime('%Y-%m-%d %H:%M')}"

    mode_prompts = {
        "partner": "Engage as a partner. Offer ideas, challenge, build together.",
        "witness": "Be a witness. Reflect what you see without advice.",
        "critic": "Be a critic. Stress-test everything. Find flaws.",
        "architect": "Be an architect. Zoom out. Big picture.",
        "builder": "Focus on implementation. Write code, fix bugs, ship features.",
    }

    if is_citizen_session and citizen_data:
        citizen_mode = metadata.get("citizen_mode", mode)
        cognitive_context = metadata.get("cognitive_context", "")
        return build_citizen_prompt(
            citizen_data, voice_text or "(autonomous wake)",
            session_id, citizen_mode,
            cognitive_context=cognitive_context,
        )

    if is_task:
        task_repo = metadata.get("repo", "current")
        task_files = metadata.get("files", [])
        return f"""IMPLEMENTATION TASK (via Orchestrator)

**Mode:** {mode}
{mode_prompts.get(mode, mode_prompts["architect"])}

{date_line}
**Session ID:** {session_id}
**Repository:** {task_repo}
**Working Directory:** {task_cwd or '.'}
**Files to focus on:** {', '.join(task_files) if task_files else 'determine from task'}

**Task:**
{voice_text}

## Steps

1. Understand the task requirements
2. Explore relevant code if needed
3. Implement the changes
4. Write summary to state/last_response_{session_id}.txt
"""

    # Standard mode
    return f"""SESSION — {mode}

{mode_prompts.get(mode, mode_prompts["partner"])}

{date_line}
**Session ID:** {session_id}

**{sender}:** {voice_text}

Respond to what {sender} said. Write your full response to state/last_response_{session_id}.txt
If the response has a voice-friendly version, add it after a ---VOICE--- separator.
"""


# ── Degraded fallback ──────────────────────────────────────────────────────

def invoke_degraded(request: dict, session_id: str) -> tuple[str, Optional[str]]:
    """Fallback invocation via direct API when Claude Code is unavailable.

    Tries Claude API first, then OpenAI. Returns (response_text, None).
    This is the FALLBACK ONLY path — citizens lose all tool/MCP/repo access.
    """
    voice_text = request.get("voice_text", "")
    if not voice_text:
        return ("", None)

    # Try Claude API
    try:
        import anthropic
        client = anthropic.Anthropic()
        model = os.environ.get("SELECTED_MODEL", "claude-sonnet-4-20250514")
        response = client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{"role": "user", "content": voice_text}],
        )
        text = response.content[0].text if response.content else ""
        if text:
            logger.info(f"Degraded response via Claude API ({len(text)} chars)")
            return (text, None)
    except Exception as e:
        logger.warning(f"Claude API fallback failed: {e}")

    # Try OpenAI
    try:
        import openai
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": voice_text}],
            max_tokens=2048,
        )
        text = response.choices[0].message.content if response.choices else ""
        if text:
            logger.info(f"Degraded response via OpenAI ({len(text)} chars)")
            return (text, None)
    except Exception as e:
        logger.warning(f"OpenAI fallback failed: {e}")

    return ("", None)
