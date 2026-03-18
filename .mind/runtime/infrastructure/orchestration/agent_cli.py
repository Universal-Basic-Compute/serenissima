"""
Agent CLI wrapper for non-interactive agent calls.

Centralizes command construction, execution, and response parsing so
callers share consistent behavior and error handling across providers.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import os
from pathlib import Path
import subprocess
from typing import Any, Optional

logger = logging.getLogger(__name__)

AGENTS_MODEL_ENV = "AGENTS_MODEL"
DEFAULT_AGENT_MODEL = "claude"
SUPPORTED_AGENT_MODELS = ("claude", "codex")
_DOTENV_LOADED = False


@dataclass(frozen=True)
class AgentCliResult:
    stdout: str
    stderr: str
    returncode: int
    raw_stdout: str = ""


def get_agent_model(model: Optional[str] = None) -> str:
    _load_dotenv_if_needed()
    if model:
        model = model.lower()
    else:
        model = (os.environ.get(AGENTS_MODEL_ENV) or DEFAULT_AGENT_MODEL).lower()
    if model not in SUPPORTED_AGENT_MODELS:
        raise ValueError(f"Unknown agent model: {model}")
    return model


def _load_dotenv_if_needed() -> None:
    global _DOTENV_LOADED
    if _DOTENV_LOADED:
        return
    if os.environ.get(AGENTS_MODEL_ENV):
        _DOTENV_LOADED = True
        return
    try:
        from dotenv import load_dotenv
    except ImportError:
        _DOTENV_LOADED = True
        return
    project_root = Path(__file__).resolve().parents[3]
    load_dotenv(project_root / ".env")
    _DOTENV_LOADED = True


def build_agent_command(
    prompt: str,
    *,
    agent_model: Optional[str] = None,
    continue_session: bool = False,
    output_format: str = "json",
    add_dir: Optional[str] = None,
    system_prompt: Optional[str] = None,
    verbose: bool = True,
    allow_dangerous: bool = True,
) -> tuple[list[str], Optional[str]]:
    agent_model = get_agent_model(agent_model)
    if agent_model == "codex":
        combined_prompt = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
        cmd = ["codex", "exec"]
        cmd.append("--json")
        if allow_dangerous:
            cmd.append("--dangerously-bypass-approvals-and-sandbox")
        cmd.append("-")
        return cmd, combined_prompt

    cmd = ["claude", "-p"]  # -p/--print for non-interactive mode
    if continue_session:
        cmd.append("--continue")
    cmd.extend(["--output-format", output_format])
    if allow_dangerous:
        cmd.append("--dangerously-skip-permissions")
    if add_dir:
        cmd.extend(["--add-dir", add_dir])
    if system_prompt:
        cmd.extend(["--append-system-prompt", system_prompt])
    if verbose:
        cmd.append("--verbose")
    # Prompt must be the last positional argument
    cmd.append(prompt)
    return cmd, None


def run_agent(
    prompt: str,
    *,
    working_dir: Optional[str] = None,
    timeout: int = 600,
    continue_session: bool = False,
    output_format: str = "json",
    add_dir: Optional[str] = None,
    system_prompt: Optional[str] = None,
    verbose: bool = True,
    allow_dangerous: bool = True,
) -> AgentCliResult:
    agent_model = get_agent_model()
    cmd, stdin_payload = build_agent_command(
        prompt,
        agent_model=agent_model,
        continue_session=continue_session if agent_model == "claude" else False,
        output_format=output_format,
        add_dir=add_dir,
        system_prompt=system_prompt,
        verbose=verbose,
        allow_dangerous=allow_dangerous,
    )

    if stdin_payload and not stdin_payload.endswith("\n"):
        stdin_payload += "\n"

    # Ensure PATH includes common CLI locations
    env = os.environ.copy()
    extra_paths = [
        os.path.expanduser("~/.nvm/versions/node/v24.10.0/bin"),
        os.path.expanduser("~/.local/bin"),
        "/usr/local/bin",
    ]
    env["PATH"] = ":".join(extra_paths) + ":" + env.get("PATH", "")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        input=stdin_payload,
        timeout=timeout,
        cwd=working_dir,
        env=env,
    )

    raw_stdout = result.stdout or ""
    if agent_model == "codex":
        stdout = parse_codex_stream_output(raw_stdout)
    else:
        stdout = raw_stdout

    return AgentCliResult(
        stdout=stdout,
        stderr=result.stderr or "",
        returncode=result.returncode,
        raw_stdout=raw_stdout,
    )


def parse_claude_json_output(output: str) -> Any:
    """Parse Claude JSON output, unwrapping result envelopes and code fences."""
    output = output.strip()
    try:
        envelope = json.loads(output)
    except json.JSONDecodeError:
        fenced = _strip_code_fence(output)
        return json.loads(fenced)

    # Handle stream-json format (list of messages)
    if isinstance(envelope, list):
        # Find the last 'result' type message
        for msg in reversed(envelope):
            if isinstance(msg, dict) and msg.get("type") == "result":
                envelope = msg
                break
        else:
            # No result found, return empty
            return {}

    if isinstance(envelope, dict) and "result" in envelope:
        result = envelope["result"]
        if isinstance(result, str):
            cleaned = _strip_code_fence(result)
            try:
                return json.loads(cleaned)
            except json.JSONDecodeError:
                return cleaned
        return result
    return envelope


def extract_claude_text(output: str) -> str:
    """Extract plain text from JSON or text output."""
    output = output.strip()
    try:
        parsed = parse_claude_json_output(output)
    except json.JSONDecodeError:
        return _strip_code_fence(output)

    if isinstance(parsed, str):
        return parsed
    return json.dumps(parsed)


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if len(lines) <= 2:
        return ""
    return "\n".join(lines[1:-1]).strip()


def parse_codex_stream_output(output: str) -> str:
    """Extract text deltas from Codex stream JSON output."""
    parts: list[str] = []
    for line in output.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        msg_type = data.get("type")
        if msg_type == "content_block_delta":
            delta = data.get("delta", {})
            if delta.get("type") == "text_delta":
                parts.append(delta.get("text", ""))
        elif msg_type == "assistant":
            message = data.get("message", {})
            for content in message.get("content", []):
                if content.get("type") == "text":
                    parts.append(content.get("text", ""))
        elif msg_type == "result":
            result = data.get("result")
            if isinstance(result, str):
                parts.append(result)
    return "".join(parts)
