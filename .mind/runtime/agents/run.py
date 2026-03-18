"""
Agent Run with Status Management

Runs work agents with:
1. Graph status tracking (running/ready)
2. --continue retry logic (try with --continue, retry without on failure)
3. Posture-based system prompt loading

Usage:
    from runtime.agents.run import run_work_agent

    result = await run_work_agent(
        actor_id="AGENT_Witness",
        prompt="Fix the stale SYNC file at...",
        target_dir=Path("/path/to/project"),
        agent_provider="claude",
    )

DOCS: docs/agents/PATTERNS_Agent_System.md
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Callable, Awaitable, List

from .graph import AgentGraph
from .mapping import NAME_TO_AGENT_ID
from .cli import build_agent_command, normalize_agent
from .prompts import get_agent_system_prompt

logger = logging.getLogger(__name__)


@dataclass
class RunResult:
    """Result of running a work agent."""
    success: bool
    actor_id: str
    output: str
    error: Optional[str] = None
    duration_seconds: float = 0.0
    retried_without_continue: bool = False
    assignment_moment_id: Optional[str] = None  # ID of the assignment moment created
    completion_moment_id: Optional[str] = None  # ID of the completion moment with output


async def run_work_agent(
    actor_id: str,
    prompt: str,
    target_dir: Path,
    agent_provider: str = "claude",
    on_output: Optional[Callable[[str], Awaitable[None]]] = None,
    timeout: float = 300.0,
    use_continue: bool = True,
    task_id: Optional[str] = None,
    problem_ids: Optional[List[str]] = None,
) -> RunResult:
    """
    Run a work agent with status management and --continue retry.

    This function:
    1. Sets agent status to 'running' in the graph
    2. Creates graph links for task/problem assignment (if provided)
    3. Creates an assignment moment recording the run
    4. Loads the agent's name-based system prompt
    5. Attempts run with --continue (if use_continue=True)
    6. On failure, retries without --continue
    7. Sets agent status back to 'ready' when done

    Args:
        actor_id: Agent ID (e.g., "AGENT_Witness")
        prompt: The task prompt for the agent
        target_dir: Project root directory
        agent_provider: Provider (claude, gemini, codex, all)
        on_output: Optional callback for streaming output
        timeout: Maximum time in seconds
        use_continue: Whether to try --continue first
        task_id: Optional task narrative ID to link agent to
        problem_ids: Optional list of problem narrative IDs to link agent to

    Returns:
        RunResult with success status and output
    """
    agent_provider = normalize_agent(agent_provider)
    start_time = time.time()
    assignment_moment_id = None

    # Extract name from actor_id
    name = actor_id.replace("AGENT_", "").lower() if actor_id.startswith("AGENT_") else actor_id

    # Initialize graph connection
    agent_graph = AgentGraph()  # Uses default from config

    # Set agent to running
    agent_graph.set_agent_running(actor_id)

    # Create assignment links and moment if task/problems provided
    if task_id or problem_ids:
        # assign_agent_to_work creates links AND moment, returns moment ID
        assignment_moment_id = agent_graph.assign_agent_to_work(
            actor_id, task_id or "", problem_ids
        )

    try:
        # Load name-based system prompt from .mind/actors/
        system_prompt = get_agent_system_prompt(name, target_dir)

        # Build and run the agent command
        result = await _run_with_retry(
            prompt=prompt,
            system_prompt=system_prompt,
            target_dir=target_dir,
            agent_provider=agent_provider,
            on_output=on_output,
            timeout=timeout,
            use_continue=use_continue,
            agent_name=name,
        )

        duration = time.time() - start_time

        # Boost energy on successful completion
        if result.success:
            agent_graph.boost_agent_energy(actor_id, 0.1)

        # Detect cd commands and update agent's folder space links
        if result.conversation:
            cd_dirs = _detect_cd_commands(result.conversation)
            if cd_dirs:
                # Use the last cd directory as current working dir
                new_cwd = cd_dirs[-1]
                # Resolve relative paths against target_dir
                if not new_cwd.startswith("/"):
                    new_cwd = str((target_dir / new_cwd).resolve())
                agent_graph.update_agent_cwd(actor_id, new_cwd)

        # Create conversation moments from batches
        completion_moment_id = None
        status = "completed" if result.success else "failed"

        if result.conversation:
            batches = _group_turns_into_batches(result.conversation)
            prev_moment_id = assignment_moment_id

            for i, batch in enumerate(batches):
                moment_id = agent_graph.create_moment(
                    actor_id=actor_id,
                    moment_type="CONVERSATION",
                    prose=batch.summary,
                    about_ids=[task_id] if task_id else None,
                    extra_props={
                        "task_id": task_id,
                        "batch_index": i,
                        "turn_count": batch.turn_count,
                    },
                    tools_used=batch.tools_used,
                )
                # Chain moments: prev --precedes--> current
                if prev_moment_id:
                    agent_graph.link_moments(prev_moment_id, moment_id, "precedes")
                prev_moment_id = moment_id
                completion_moment_id = moment_id  # Last batch is completion

            # Add final status moment
            if completion_moment_id:
                all_tools = [t for b in batches for t in b.tools_used]
                final_moment_id = agent_graph.create_moment(
                    actor_id=actor_id,
                    moment_type="COMPLETION",
                    prose=f"Agent {name} {status} after {len(batches)} batches",
                    about_ids=[task_id] if task_id else None,
                    extra_props={
                        "task_id": task_id,
                        "status": status,
                        "duration_seconds": round(duration, 2),
                        "total_turns": sum(b.turn_count for b in batches),
                        "error": result.error[:200] if result.error else None,
                    },
                    tools_used=all_tools,
                )
                agent_graph.link_moments(completion_moment_id, final_moment_id, "precedes")
                completion_moment_id = final_moment_id

        elif result.output:
            # Fallback: no conversation parsed, use output
            output_preview = result.output[:500] + "..." if len(result.output) > 500 else result.output
            completion_moment_id = agent_graph.create_moment(
                actor_id=actor_id,
                moment_type="COMPLETION",
                prose=f"Agent {name} {status}: {output_preview}",
                about_ids=[task_id] if task_id else None,
                extra_props={
                    "task_id": task_id,
                    "status": status,
                    "duration_seconds": round(duration, 2),
                    "output_length": len(result.output),
                    "error": result.error[:200] if result.error else None,
                },
            )

        return RunResult(
            success=result.success,
            actor_id=actor_id,
            output=result.output,
            error=result.error,
            duration_seconds=duration,
            retried_without_continue=result.retried,
            assignment_moment_id=assignment_moment_id,
            completion_moment_id=completion_moment_id,
        )

    finally:
        # Always set agent back to ready
        agent_graph.set_agent_ready(actor_id)

        # Clean up session file
        session_file = target_dir / ".mind" / "actors" / name / ".sessionId"
        if session_file.exists():
            session_file.unlink()


@dataclass
class _InternalResult:
    """Internal result from run attempt."""
    success: bool
    output: str
    error: Optional[str] = None
    retried: bool = False
    conversation: Optional[List["_ConversationTurn"]] = None


async def _run_with_retry(
    prompt: str,
    system_prompt: str,
    target_dir: Path,
    agent_provider: str,
    on_output: Optional[Callable[[str], Awaitable[None]]],
    timeout: float,
    use_continue: bool,
    agent_name: Optional[str] = None,
) -> _InternalResult:
    """
    Run agent with --continue retry logic.

    First attempts with --continue (if enabled).
    On failure, retries without --continue.
    """
    retried = False

    # First attempt: with --continue if enabled
    if use_continue:
        try:
            result = await _run_agent(
                prompt=prompt,
                system_prompt=system_prompt,
                target_dir=target_dir,
                agent_provider=agent_provider,
                continue_session=True,
                on_output=on_output,
                timeout=timeout,
                agent_name=agent_name,
            )

            if result.success:
                return _InternalResult(
                    success=True,
                    output=result.output,
                    retried=False,
                    conversation=result.conversation,
                )
        except Exception as e:
            logger.warning(f"[run] --continue attempt failed: {e}, retrying without")
            retried = True

    # Second attempt: without --continue
    try:
        result = await _run_agent(
            prompt=prompt,
            system_prompt=system_prompt,
            target_dir=target_dir,
            agent_provider=agent_provider,
            continue_session=False,
            on_output=on_output,
            timeout=timeout,
            agent_name=agent_name,
        )

        return _InternalResult(
            success=result.success,
            output=result.output,
            error=result.error if not result.success else None,
            retried=retried,
            conversation=result.conversation,
        )

    except Exception as e:
        return _InternalResult(
            success=False,
            output="",
            error=str(e),
            retried=retried,
            conversation=None,
        )


@dataclass
class _ConversationTurn:
    """A single turn in the conversation."""
    type: str  # "thinking", "text", "tool_use", "tool_result"
    content: str
    tool_name: Optional[str] = None
    tool_id: Optional[str] = None


@dataclass
class _ConversationBatch:
    """A batch of grouped conversation turns."""
    summary: str  # Compact summary of the batch
    turn_count: int
    tools_used: List[str]  # Tool names in this batch


@dataclass
class _RunResult:
    """Result from running an agent process."""
    success: bool
    output: str
    error: Optional[str] = None
    conversation: Optional[List[_ConversationTurn]] = None  # Full conversation turns


def _detect_cd_commands(turns: List["_ConversationTurn"]) -> List[str]:
    """
    Detect cd commands in conversation and extract target directories.

    Returns list of directories the agent cd'd into.
    """
    import re
    directories = []

    for turn in turns:
        if turn.type == "tool_use" and turn.tool_name == "Bash":
            try:
                # Parse JSON tool input to get command
                tool_input = json.loads(turn.content) if turn.content else {}
                command = tool_input.get("command", "")

                # Look for cd command patterns
                # Matches: cd /path, cd path, cd "/path", cd 'path'
                # In: cd /tmp, cd /tmp && ls, ls && cd /tmp, cd /tmp; ls
                for match in re.finditer(r'(?:^|&&|;|\|)\s*cd\s+["\']?([^"\'&;|\n]+)["\']?', command):
                    path = match.group(1).strip()
                    if path:
                        directories.append(path)
            except (json.JSONDecodeError, Exception):
                pass

    return directories


def _group_turns_into_batches(
    turns: List[_ConversationTurn],
    batch_size: int = 5,
    tool_output_max_len: int = 200,
) -> List[_ConversationBatch]:
    """
    Group conversation turns into compact batches.

    Each batch combines up to batch_size turns into a summary:
    - thinking: full content
    - text: full content
    - tool_use: Tool(full args)
    - tool_result: truncated to tool_output_max_len
    """
    batches = []

    for i in range(0, len(turns), batch_size):
        batch_turns = turns[i:i + batch_size]
        summary_parts = []
        tools_used = []

        for turn in batch_turns:
            if turn.type == "thinking":
                summary_parts.append(f"💭 {turn.content}")
            elif turn.type == "text":
                summary_parts.append(f"📝 {turn.content}")
            elif turn.type == "tool_use":
                tool_name = turn.tool_name or "?"
                tools_used.append(tool_name)
                summary_parts.append(f"🔧 {tool_name}({turn.content})")
            elif turn.type == "tool_result":
                # Only truncate tool output
                content = turn.content[:tool_output_max_len]
                if len(turn.content) > tool_output_max_len:
                    content += "..."
                summary_parts.append(f"→ {content}")

        batches.append(_ConversationBatch(
            summary="\n".join(summary_parts),
            turn_count=len(batch_turns),
            tools_used=tools_used,
        ))

    return batches


async def _run_agent(
    prompt: str,
    system_prompt: str,
    target_dir: Path,
    agent_provider: str,
    continue_session: bool,
    on_output: Optional[Callable[[str], Awaitable[None]]],
    timeout: float,
    agent_name: Optional[str] = None,
) -> _RunResult:
    """
    Run an agent process and collect full conversation.

    Writes session_id to .mind/actors/{agent_name}/.sessionId for MCP auto-detection.
    """
    # Build command with verbose stream-json for full conversation
    # Note: --verbose is already added in cli.py for Claude
    agent_cmd = build_agent_command(
        agent=agent_provider,
        prompt=prompt,
        system_prompt=system_prompt,
        stream_json=True,
        continue_session=continue_session,
        add_dir=target_dir,
        allowed_tools="Bash(*) Read(*) Edit(*) Write(*) Glob(*) Grep(*) WebFetch(*) NotebookEdit(*) TodoWrite(*)",
    )

    # Start process
    process = await asyncio.create_subprocess_exec(
        *agent_cmd.cmd,
        cwd=str(target_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        stdin=asyncio.subprocess.PIPE if agent_cmd.stdin else None,
    )

    stdin_data = (agent_cmd.stdin + "\n").encode() if agent_cmd.stdin else None

    try:
        stdout_data, stderr_data = await asyncio.wait_for(
            process.communicate(input=stdin_data),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        return _RunResult(
            success=False,
            output="",
            error=f"Agent timed out after {timeout}s",
        )

    stdout_str = stdout_data.decode(errors="replace")
    stderr_str = stderr_data.decode(errors="replace")

    # Parse output and conversation
    output_parts = []
    conversation_turns: List[_ConversationTurn] = []
    session_id = None

    for line in stdout_str.split("\n"):
        line = line.strip()
        if not line:
            continue

        try:
            data = json.loads(line)
            if isinstance(data, dict):
                msg_type = data.get("type")

                # Capture session_id from system message
                if msg_type == "system":
                    session_id = data.get("session_id")
                    if session_id and agent_name:
                        # Write session_id to .mind/actors/{name}/.sessionId
                        session_file = target_dir / ".mind" / "actors" / agent_name / ".sessionId"
                        session_file.parent.mkdir(parents=True, exist_ok=True)
                        session_file.write_text(session_id)

                elif msg_type == "assistant":
                    msg_data = data.get("message", {})
                    if isinstance(msg_data, dict):
                        for content in msg_data.get("content", []):
                            if isinstance(content, dict):
                                content_type = content.get("type")

                                if content_type == "thinking":
                                    # Capture thinking blocks
                                    thinking_text = content.get("thinking", "")
                                    if thinking_text:
                                        conversation_turns.append(_ConversationTurn(
                                            type="thinking",
                                            content=thinking_text,
                                        ))

                                elif content_type == "text":
                                    text = content.get("text", "")
                                    if text:
                                        output_parts.append(text)
                                        conversation_turns.append(_ConversationTurn(
                                            type="text",
                                            content=text,
                                        ))
                                        if on_output:
                                            await on_output(text)

                                elif content_type == "tool_use":
                                    # Capture tool calls
                                    tool_name = content.get("name", "")
                                    tool_id = content.get("id", "")
                                    tool_input = content.get("input", {})
                                    conversation_turns.append(_ConversationTurn(
                                        type="tool_use",
                                        content=json.dumps(tool_input, indent=2) if tool_input else "",
                                        tool_name=tool_name,
                                        tool_id=tool_id,
                                    ))

                elif msg_type == "user":
                    # User messages contain tool results
                    msg_data = data.get("message", {})
                    if isinstance(msg_data, dict):
                        for content in msg_data.get("content", []):
                            if isinstance(content, dict):
                                if content.get("type") == "tool_result":
                                    tool_id = content.get("tool_use_id", "")
                                    result_content = content.get("content", "")
                                    # Handle content that may be a list of text blocks
                                    if isinstance(result_content, list):
                                        result_text = "\n".join(
                                            item.get("text", str(item))
                                            for item in result_content
                                            if isinstance(item, dict)
                                        )
                                    else:
                                        result_text = str(result_content)

                                    conversation_turns.append(_ConversationTurn(
                                        type="tool_result",
                                        content=result_text[:2000],  # Truncate large results
                                        tool_id=tool_id,
                                    ))

                elif msg_type == "result":
                    result = data.get("result", "")
                    if result:
                        output_parts.append(result)
                        if on_output:
                            await on_output(result)

        except json.JSONDecodeError:
            # Plain text output
            output_parts.append(line)
            if on_output:
                await on_output(line)

    output = "\n".join(output_parts)

    # Check exit code
    success = process.returncode == 0

    if not success and stderr_str:
        return _RunResult(
            success=False,
            output=output,
            error=stderr_str[:500],
            conversation=conversation_turns,
        )

    return _RunResult(
        success=success,
        output=output,
        conversation=conversation_turns,
    )


async def run_for_task(
    task_id: str,
    prompt: str,
    target_dir: Path,
    agent_provider: str = "claude",
    on_output: Optional[Callable[[str], Awaitable[None]]] = None,
    timeout: float = 300.0,
    task_type: Optional[str] = None,
) -> RunResult:
    """
    Run an agent to work on a task.

    Agents work on tasks - problem detection creates tasks, then agents execute them.

    This function:
    1. Looks up task to determine problem type (if not provided)
    2. Selects best agent based on name mapping
    3. Runs the agent with task assignment

    Args:
        task_id: Task narrative ID (e.g., "narrative:task_run:abc123")
        prompt: The task prompt
        target_dir: Project root
        agent_provider: Provider name
        on_output: Optional output callback
        timeout: Maximum time
        task_type: Optional problem type hint (saves graph lookup)

    Returns:
        RunResult
    """
    agent_graph = AgentGraph()  # Uses default from config

    # Get problem type from task if not provided
    if not task_type:
        task_type = agent_graph.get_task_task_type(task_id) or "STUB_IMPL"

    # Build task synthesis for agent selection
    task_synthesis = f"{task_type}: {task_id}"
    if prompt:
        task_synthesis += f" - {prompt[:100]}"

    # Select best agent using graph physics
    actor_id = agent_graph.select_agent_for_task(task_synthesis)

    if not actor_id:
        # All agents busy, use default fixer
        logger.warning("[run] All agents busy, using default fixer")
        actor_id = NAME_TO_AGENT_ID.get("fixer", "AGENT_Fixer")

    return await run_work_agent(
        actor_id=actor_id,
        prompt=prompt,
        target_dir=target_dir,
        agent_provider=agent_provider,
        on_output=on_output,
        timeout=timeout,
        task_id=task_id,
    )
