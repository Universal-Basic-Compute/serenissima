"""
Prompt command for mind CLI.

DOCS: docs/cli/prompt/PATTERNS_Prompt_Command_Workflow_Design.md

Generates a bootstrap prompt for LLMs that guides them through:
1. Understanding the protocol
2. Checking project state
3. Choosing work mode
4. Selecting appropriate VIEW
5. Executing
"""

from pathlib import Path


PROMPT_VIEW_ENTRIES = [
    ("Processing raw data (chats, PDFs, specs)", "VIEW_Ingest_Process_Raw_Data_Sources.md"),
    ("Getting oriented in unfamiliar code", "VIEW_Onboard_Understand_Existing_Codebase.md"),
    ("Defining vision/architecture", "VIEW_Specify_Design_Vision_And_Architecture.md"),
    ("Writing or modifying code", "VIEW_Implement_Write_Or_Modify_Code.md"),
    ("Adding features to existing modules", "VIEW_Extend_Add_Features_To_Existing.md"),
    ("Pair programming with human", "VIEW_Collaborate_Pair_Program_With_Human.md"),
    ("Health checks", "VIEW_Health_Define_Health_Checks_And_Verify.md"),
    ("Debugging issues", "VIEW_Debug_Investigate_And_Fix_Issues.md"),
    ("Reviewing changes", "VIEW_Review_Evaluate_Changes.md"),
    ("Refactoring", "VIEW_Refactor_Improve_Code_Structure.md"),
]


def generate_bootstrap_prompt(target_dir: Path) -> str:
    """
    Generate a prompt to bootstrap an LLM into using the protocol.

    This prompt guides the LLM through:
    1. Understanding the protocol
    2. Checking project state
    3. Choosing work mode (autonomous vs collaborative)
    4. Selecting appropriate VIEW
    5. Executing
    """
    view_table_rows = "\n".join(f"| {task} | {view} |" for task, view in PROMPT_VIEW_ENTRIES)

    return f'''## mind Bootstrap

You are working on a project with the mind installed. Before doing anything, follow these steps:

### Step 1: Understand the Protocol

Read these files to understand how to work:
```
{target_dir}/.mind/PROTOCOL.md    # Navigation — what to load, where to update
{target_dir}/.mind/PRINCIPLES.md  # Stance — how to work well
```

### Step 2: Check Project State

Read the current state to understand what's happening:
```
{target_dir}/.mind/state/SYNC_Project_State.md
```

If SYNC contains template placeholders, initialize it with actual project state first.

### Step 3: Choose Work Mode

Ask the user (or check if already specified):

**Autonomous mode:** You make decisions and execute, updating SYNC as you go. Best for well-defined tasks.

**Collaborative mode:** You explain your plan, get feedback, then execute. Best for complex/ambiguous tasks.

If unclear, default to collaborative mode.

### Step 4: Select Your VIEW

Based on what you need to do, load ONE view from `.mind/views/`:

| Task | VIEW |
|------|------|
{view_table_rows}

### Step 5: Execute

Follow the VIEW instructions. When done:
1. Update SYNC files with what you did
2. Note handoffs for next agent or human
3. If collaborative mode: summarize for human approval
4. Restate the current project state and your task before moving on

**Start now:** What is the current project state? What task are you here to do?

### Checklist

- [ ] Update SYNC files with what changed and who to hand off to
- [ ] Re-run `mind prompt --dir {target_dir}` anytime you need to revisit the same bootstrap instructions
'''


def print_bootstrap_prompt(target_dir: Path):
    """Print the bootstrap prompt for copy-paste to LLM."""
    print(generate_bootstrap_prompt(target_dir))
