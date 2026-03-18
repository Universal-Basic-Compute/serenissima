# DOCS: docs/mind_cli_core/OBJECTIVES_mind_cli_core.md
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

AGENT_CHOICES = ("gemini", "claude", "codex", "all")
DEFAULT_AGENT = "all"
DEFAULT_CODEX_MODEL = "gpt-5.1-codex-mini"
DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5"


@dataclass(frozen=True)
class AgentCommand:
    cmd: List[str]
    stdin: Optional[str] = None


def normalize_agent(agent: Optional[str]) -> str:
    if not agent:
        return DEFAULT_AGENT
    agent = agent.lower()
    if agent not in AGENT_CHOICES:
        raise ValueError(f"Unknown agent provider: {agent}")
    return agent


def build_agent_command(
    agent: str,
    prompt: str,
    system_prompt: str = "",
    stream_json: bool = True,
    continue_session: bool = False,
    add_dir: Optional[Path] = None,
    allowed_tools: Optional[str] = None,
    use_dangerous: bool = True,
    model_name: Optional[str] = None, # Optional model override for providers that support it
) -> AgentCommand:
    agent = normalize_agent(agent)

    # Handle "all" by picking a random provider (excluding "all" itself)
    if agent == "all":
        providers = ["gemini", "claude", "codex"]
        agent = random.choice(providers)

    if agent == "gemini":
        # Use internal Gemini adapter
        import sys
        cmd = [sys.executable, "-m", "mind.llms.gemini_agent", "--prompt", prompt]

        if system_prompt:
            cmd.extend(["--system-prompt", system_prompt])
        
        cmd.extend(["--output-format", "stream-json" if stream_json else "text"])
        
        if allowed_tools:
            cmd.extend(["--allowed-tools", allowed_tools])
        
        if model_name: # Pass model name if specified
            cmd.extend(["--model-name", model_name])

        if add_dir:
            cmd.extend(["--project-dir", str(add_dir)])
        
        return AgentCommand(cmd=cmd)
    if agent == "claude":
        cmd = ["claude"]
        # Use specified model or default to Sonnet
        claude_model = model_name or os.getenv("CLAUDE_MODEL") or DEFAULT_CLAUDE_MODEL
        cmd.extend(["--model", claude_model])
        if continue_session:
            cmd.append("--continue")
        cmd.extend(["-p", prompt])
        cmd.extend(["--output-format", "stream-json" if stream_json else "text"])
        if use_dangerous:
            cmd.append("--dangerously-skip-permissions")
        if allowed_tools:
            cmd.extend(["--allowedTools", allowed_tools])
        if add_dir:
            cmd.extend(["--add-dir", str(add_dir)])
        if system_prompt:
            cmd.extend(["--append-system-prompt", system_prompt])
        cmd.append("--verbose")
        return AgentCommand(cmd=cmd)

    combined_prompt = prompt if not system_prompt else f"{system_prompt}\n\n{prompt}"
    codex_model = model_name or os.getenv("CODEX_MODEL") or DEFAULT_CODEX_MODEL
    cmd = ["codex", "exec", "--model", codex_model]
    if stream_json:
        cmd.append("--json")
    if use_dangerous:
        cmd.append("--dangerously-bypass-approvals-and-sandbox")
    if continue_session:
        cmd.extend(["resume", "--last", "-"])
    else:
        cmd.append("-")
    return AgentCommand(cmd=cmd, stdin=combined_prompt)
