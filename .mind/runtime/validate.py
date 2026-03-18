# DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""
Validation command for mind CLI.

Checks protocol invariants:
- Protocol installed correctly
- VIEWs exist
- Project SYNC exists and initialized
- Module docs have minimum (PATTERNS + SYNC)
- Full doc chain completeness
- Naming conventions
- CHAIN links valid
- Module manifest configured
"""

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List

from .core_utils import find_module_directories


@dataclass
class ValidationResult:
    """Result of a single validation check."""
    check_id: str
    name: str
    passed: bool
    message: str
    details: List[str]


def check_protocol_installed(target_dir: Path) -> ValidationResult:
    """V6 (partial): Check that .mind/ exists."""
    protocol_dir = target_dir / ".mind"

    if not protocol_dir.exists():
        return ValidationResult(
            check_id="V6",
            name="Protocol installed",
            passed=False,
            message="Protocol not installed",
            details=[f"Missing: {protocol_dir}/", "Run: mind init"]
        )

    required_files = ["PROTOCOL.md", "PRINCIPLES.md"]
    missing = [f for f in required_files if not (protocol_dir / f).exists()]

    if missing:
        return ValidationResult(
            check_id="V6",
            name="Protocol installed",
            passed=False,
            message="Protocol incomplete",
            details=[f"Missing: {f}" for f in missing]
        )

    return ValidationResult(
        check_id="V6",
        name="Protocol installed",
        passed=True,
        message="Protocol installed correctly",
        details=[]
    )


def check_project_sync_exists(target_dir: Path) -> ValidationResult:
    """V6: Check that project SYNC exists and has content."""
    sync_path = target_dir / ".mind" / "state" / "SYNC_Project_State.md"

    if not sync_path.exists():
        return ValidationResult(
            check_id="V6",
            name="Project SYNC exists",
            passed=False,
            message="Project SYNC missing",
            details=[f"Missing: {sync_path}"]
        )

    content = sync_path.read_text()

    # Check if it's still the template (unfilled)
    if "{DATE}" in content or "{AGENT/HUMAN}" in content:
        return ValidationResult(
            check_id="V6",
            name="Project SYNC exists",
            passed=False,
            message="Project SYNC not initialized",
            details=["SYNC_Project_State.md still contains template placeholders", "Fill in actual project state"]
        )

    return ValidationResult(
        check_id="V6",
        name="Project SYNC exists",
        passed=True,
        message="Project SYNC exists and initialized",
        details=[]
    )


def check_module_docs_minimum(target_dir: Path) -> ValidationResult:
    """V2: Every module doc folder has OBJECTIVES + PATTERNS + SYNC minimum."""
    docs_dir = target_dir / "docs"

    if not docs_dir.exists():
        return ValidationResult(
            check_id="V2",
            name="Module docs minimum",
            passed=True,
            message="No docs/ directory (nothing to check)",
            details=[]
        )

    issues = []
    modules = find_module_directories(docs_dir)

    for module_dir in modules:
        md_files = list(module_dir.glob("*.md"))

        has_objectifs = any("OBJECTIVES_" in f.name for f in md_files)
        has_patterns = any("PATTERNS_" in f.name for f in md_files)
        has_sync = any("SYNC_" in f.name for f in md_files)

        if not has_objectifs:
            issues.append(f"{module_dir.relative_to(target_dir)}: missing OBJECTIVES_*.md")
        if not has_patterns:
            issues.append(f"{module_dir.relative_to(target_dir)}: missing PATTERNS_*.md")
        if not has_sync:
            issues.append(f"{module_dir.relative_to(target_dir)}: missing SYNC_*.md")

    if issues:
        return ValidationResult(
            check_id="V2",
            name="Module docs minimum",
            passed=False,
            message=f"{len(issues)} module(s) missing required docs",
            details=issues
        )

    return ValidationResult(
        check_id="V2",
        name="Module docs minimum",
        passed=True,
        message=f"All {len(modules)} module(s) have OBJECTIVES + PATTERNS + SYNC",
        details=[]
    )


def check_full_chain(target_dir: Path) -> ValidationResult:
    """Check that module docs have the full chain (OBJECTIVES, BEHAVIORS, PATTERNS, ALGORITHM, VALIDATION, HEALTH, SYNC)."""
    docs_dir = target_dir / "docs"

    if not docs_dir.exists():
        return ValidationResult(
            check_id="FC",
            name="Full chain",
            passed=True,
            message="No docs/ directory (nothing to check)",
            details=[]
        )

    # Full chain doc types (in order)
    full_chain = [
        "OBJECTIVES_",
        "BEHAVIORS_",
        "PATTERNS_",
        "ALGORITHM_",
        "VALIDATION_",
        "IMPLEMENTATION_",
        "HEALTH_",
        "SYNC_",
    ]

    issues = []
    modules = find_module_directories(docs_dir)

    for module_dir in modules:
        md_files = list(module_dir.glob("*.md"))
        module_path = module_dir.relative_to(target_dir)

        missing = []
        for doc_type in full_chain:
            if not any(doc_type in f.name for f in md_files):
                missing.append(doc_type.rstrip('_'))

        if missing:
            issues.append(f"{module_path}: missing {', '.join(missing)}")

    if issues:
        return ValidationResult(
            check_id="FC",
            name="Full chain",
            passed=False,
            message=f"{len(issues)} module(s) with incomplete chain",
            details=issues
        )

    return ValidationResult(
        check_id="FC",
        name="Full chain",
        passed=True,
        message=f"All {len(modules)} module(s) have full chain (8 doc types)",
        details=[]
    )


def check_chain_links(target_dir: Path) -> ValidationResult:
    """V3: All CHAIN links in docs are valid."""
    docs_dir = target_dir / "docs"

    if not docs_dir.exists():
        return ValidationResult(
            check_id="V3",
            name="CHAIN links valid",
            passed=True,
            message="No docs/ directory (nothing to check)",
            details=[]
        )

    issues = []
    files_checked = 0

    # Pattern to match CHAIN section links
    chain_pattern = re.compile(
        r'^\s*(OBJECTIVES|BEHAVIORS|PATTERNS|ALGORITHM|VALIDATION|IMPLEMENTATION|HEALTH|SYNC|THIS):\s*(.+\.md)\s*$',
        re.MULTILINE
    )

    for md_file in docs_dir.rglob("*.md"):
        content = md_file.read_text()

        # Look for CHAIN section
        if "## CHAIN" not in content:
            continue

        files_checked += 1

        # Find all referenced files in CHAIN
        for match in chain_pattern.finditer(content):
            link_type = match.group(1)
            link_path = match.group(2).strip()

            if link_type == "THIS":
                continue  # Skip self-reference

            # Resolve the path relative to the md file
            if link_path.startswith("./"):
                resolved = md_file.parent / link_path[2:]
            else:
                resolved = md_file.parent / link_path

            if not resolved.exists():
                issues.append(f"{md_file.relative_to(target_dir)}: broken link to {link_path}")

    if issues:
        return ValidationResult(
            check_id="V3",
            name="CHAIN links valid",
            passed=False,
            message=f"{len(issues)} broken CHAIN link(s)",
            details=issues
        )

    return ValidationResult(
        check_id="V3",
        name="CHAIN links valid",
        passed=True,
        message=f"All CHAIN links valid ({files_checked} files checked)",
        details=[]
    )


def check_naming_conventions(target_dir: Path) -> ValidationResult:
    """Check that doc files follow naming conventions."""
    docs_dir = target_dir / "docs"

    if not docs_dir.exists():
        return ValidationResult(
            check_id="NC",
            name="Naming conventions",
            passed=True,
            message="No docs/ directory (nothing to check)",
            details=[]
        )

    issues = []

    # Expected prefixes (plural form with underscore)
    expected_prefixes = [
        "OBJECTIVES_",
        "BEHAVIORS_",
        "PATTERNS_",
        "ALGORITHM_",
        "VALIDATION_",
        "IMPLEMENTATION_",
        "HEALTH_",
        "SYNC_",
        "CONCEPT_",
        "TOUCHES_",
    ]

    # Common mistakes (singular, no underscore, etc.)
    wrong_patterns = {
        "PATTERN.md": "Should be: PATTERNS_Descriptive_Name.md",
        "PATTERN_": "Should be: PATTERNS_ (plural)",
        "BEHAVIOR.md": "Should be: BEHAVIORS_Descriptive_Name.md",
        "BEHAVIOR_": "Should be: BEHAVIORS_ (plural)",
        "ALGORITHMS_": "Should be: ALGORITHM_ (singular)",
        "VALIDATIONS_": "Should be: VALIDATION_ (singular)",
        "CONCEPTS_": "Should be: CONCEPT_ (singular)",
        "OBJECTIF_": "Should be: OBJECTIVES_ (plural)",
    }

    for md_file in docs_dir.rglob("*.md"):
        filename = md_file.name

        # Check for common mistakes
        for wrong, suggestion in wrong_patterns.items():
            if filename.startswith(wrong) or filename == wrong:
                issues.append(f"{md_file.relative_to(target_dir)}: {suggestion}")
                break

    if issues:
        return ValidationResult(
            check_id="NC",
            name="Naming conventions",
            passed=False,
            message=f"{len(issues)} file(s) with naming issues",
            details=issues
        )

    return ValidationResult(
        check_id="NC",
        name="Naming conventions",
        passed=True,
        message="All doc files follow naming conventions",
        details=[]
    )


def check_views_exist(target_dir: Path) -> ValidationResult:
    """Check that all VIEWs exist."""
    views_dir = target_dir / ".mind" / "views"

    if not views_dir.exists():
        return ValidationResult(
            check_id="V7",
            name="VIEWs exist",
            passed=False,
            message="Views directory missing",
            details=[f"Missing: {views_dir}"]
        )

    expected_views = [
        "VIEW_Ingest_Process_Raw_Data_Sources.md",
        "VIEW_Onboard_Understand_Existing_Codebase.md",
        "VIEW_Specify_Design_Vision_And_Architecture.md",
        "VIEW_Implement_Write_Or_Modify_Code.md",
        "VIEW_Extend_Add_Features_To_Existing.md",
        "VIEW_Collaborate_Pair_Program_With_Human.md",
        "VIEW_Health_Define_Health_Checks_And_Verify.md",
        "VIEW_Debug_Investigate_And_Fix_Issues.md",
        "VIEW_Review_Evaluate_Changes.md",
        "VIEW_Refactor_Improve_Code_Structure.md",
        "VIEW_Document_Create_Module_Documentation.md",
    ]

    missing = [v for v in expected_views if not (views_dir / v).exists()]

    if missing:
        return ValidationResult(
            check_id="V7",
            name="VIEWs exist",
            passed=False,
            message=f"{len(missing)} VIEW(s) missing",
            details=[f"Missing: {v}" for v in missing]
        )

    return ValidationResult(
        check_id="V7",
        name="VIEWs exist",
        passed=True,
        message=f"All {len(expected_views)} VIEWs present",
        details=[]
    )


def check_module_manifest(target_dir: Path) -> ValidationResult:
    """Check that modules.yaml exists and has mappings for code directories."""
    manifest_path = target_dir / "modules.yaml"

    # Check if manifest exists
    if not manifest_path.exists():
        return ValidationResult(
            check_id="MM",
            name="Module manifest",
            passed=True,  # Not a failure, just info
            message="No modules.yaml (optional)",
            details=["Create modules.yaml in project root to map code to docs"]
        )

    content = manifest_path.read_text()

    # Check if it's still just the template (no real modules defined)
    if "# example:" in content.lower() or "# your modules" in content.lower():
        # Check if there are any uncommented module definitions
        lines = content.split('\n')
        has_real_modules = False
        for line in lines:
            stripped = line.strip()
            # Look for non-comment lines with module-like patterns
            if stripped and not stripped.startswith('#') and ':' in stripped:
                if 'code:' in stripped or 'docs:' in stripped:
                    has_real_modules = True
                    break

        if not has_real_modules:
            # Find code directories that should be mapped
            unmapped = []
            for code_dir in ['src', 'lib', 'app', 'pkg', 'components']:
                code_path = target_dir / code_dir
                if code_path.exists() and code_path.is_dir():
                    # Count subdirectories
                    subdirs = [d for d in code_path.iterdir() if d.is_dir()]
                    if subdirs:
                        unmapped.append(f"{code_dir}/ ({len(subdirs)} subdirectories)")
                    else:
                        unmapped.append(f"{code_dir}/")

            if unmapped:
                return ValidationResult(
                    check_id="MM",
                    name="Module manifest",
                    passed=False,
                    message=f"Code directories not mapped",
                    details=[
                        "modules.yaml exists but has no module definitions",
                        "Unmapped code directories:"
                    ] + [f"  - {d}" for d in unmapped] + [
                        "",
                        "Add mappings to modules.yaml",
                        "See VIEW_Document for guidance"
                    ]
                )

    return ValidationResult(
        check_id="MM",
        name="Module manifest",
        passed=True,
        message="modules.yaml configured",
        details=[]
    )


def generate_fix_prompt(target_dir: Path, results: List[ValidationResult]) -> str:
    """
    Generate a prompt explaining what's wrong and how to fix it.

    This is designed to be fed to an LLM to guide fixing validation issues.
    """
    failed_results = [r for r in results if not r.passed]

    if not failed_results:
        return ""

    prompt_parts = []
    prompt_parts.append("# Protocol Validation: Issues Found\n")
    prompt_parts.append(f"**Project:** `{target_dir}`\n")
    prompt_parts.append("---\n")

    for result in failed_results:
        prompt_parts.append(f"## ✗ {result.name}\n")

        # Add context based on the check type
        if result.check_id == "V6" and "SYNC" in result.name:
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("The project state file hasn't been initialized. It still contains template placeholders.\n\n")

            prompt_parts.append("### Why It Matters\n")
            prompt_parts.append("SYNC files are how agents communicate across sessions. Without initialized state:\n")
            prompt_parts.append("- New agents don't know what's happening in the project\n")
            prompt_parts.append("- Work gets lost between sessions\n")
            prompt_parts.append("- No handoffs happen\n\n")

            prompt_parts.append("### How to Fix\n")
            prompt_parts.append("Edit `.mind/state/SYNC_Project_State.md` and fill in:\n")
            prompt_parts.append("- Current project status (what phase? what's working?)\n")
            prompt_parts.append("- Recent changes (what happened lately?)\n")
            prompt_parts.append("- Active work (what's in progress?)\n")
            prompt_parts.append("- Handoffs (anything the next agent should know?)\n\n")

            prompt_parts.append("### Reference\n")
            prompt_parts.append("- Template: `.mind/templates/SYNC_TEMPLATE.md`\n")
            prompt_parts.append("- Protocol: `.mind/PROTOCOL.md` → \"SYNC files track current state\"\n\n")

        elif result.check_id == "V6" and "installed" in result.name.lower():
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("The mind is not installed or is incomplete.\n\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### How to Fix\n")
            prompt_parts.append("Run: `mind init --force`\n\n")

        elif result.check_id == "V7":
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("Some VIEW files are missing. VIEWs guide agents on what context to load.\n\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### How to Fix\n")
            prompt_parts.append("Re-initialize the protocol: `mind init --force`\n\n")

        elif result.check_id == "V2":
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("Some modules have incomplete documentation. Every module needs at minimum:\n")
            prompt_parts.append("- `OBJECTIVES_*.md` — Ranked goals and tradeoffs\n")
            prompt_parts.append("- `PATTERNS_*.md` — Why this design exists\n")
            prompt_parts.append("- `SYNC_*.md` — Current state of the module\n\n")

            prompt_parts.append("### Issues Found\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### Why It Matters\n")
            prompt_parts.append("Without OBJECTIVES, agents don't know what to optimize.\n")
            prompt_parts.append("Without PATTERNS, agents don't know *why* the module is shaped this way.\n")
            prompt_parts.append("Without SYNC, agents don't know the current state or what to continue.\n\n")

            prompt_parts.append("### How to Fix\n")
            prompt_parts.append("Use **VIEW_Document_Create_Module_Documentation.md** to create proper docs:\n")
            prompt_parts.append("1. Read the module's code to understand it\n")
            prompt_parts.append("2. Create OBJECTIVES with descriptive name (e.g., `OBJECTIVES_Event_Store_Goals.md`)\n")
            prompt_parts.append("3. Create PATTERNS with descriptive name (e.g., `PATTERNS_Why_Event_Sourcing.md`)\n")
            prompt_parts.append("4. Create SYNC with current state\n\n")

            prompt_parts.append("### Reference\n")
            prompt_parts.append("- VIEW: `.mind/views/VIEW_Document_Create_Module_Documentation.md`\n")
            prompt_parts.append("- Templates: `.mind/templates/OBJECTIVES_TEMPLATE.md`, `PATTERNS_TEMPLATE.md`, `SYNC_TEMPLATE.md`\n\n")

        elif result.check_id == "FC":
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("Some modules don't have the full documentation chain. The complete chain is:\n")
            prompt_parts.append("1. `OBJECTIVES_*.md` — Ranked goals and tradeoffs\n")
            prompt_parts.append("2. `BEHAVIORS_*.md` — What it should do (observable effects)\n")
            prompt_parts.append("3. `PATTERNS_*.md` — Why this design (philosophy, tradeoffs)\n")
            prompt_parts.append("4. `ALGORITHM_*.md` — How it works (step-by-step logic)\n")
            prompt_parts.append("5. `VALIDATION_*.md` — How to verify (invariants, checks)\n")
            prompt_parts.append("6. `IMPLEMENTATION_*.md` — Code architecture (where code lives, data flows)\n")
            prompt_parts.append("7. `HEALTH_*.md` — Health checks (verification mechanics, signals)\n")
            prompt_parts.append("8. `SYNC_*.md` — Current state (status, handoffs)\n\n")

            prompt_parts.append("### Issues Found\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### Why It Matters\n")
            prompt_parts.append("Each doc type answers a different question an agent might have:\n")
            prompt_parts.append("- OBJECTIVES: \"What are we optimizing?\"\n")
            prompt_parts.append("- PATTERNS: \"Why is it shaped this way?\"\n")
            prompt_parts.append("- BEHAVIORS: \"What should it do?\"\n")
            prompt_parts.append("- ALGORITHM: \"How does it work?\"\n")
            prompt_parts.append("- VALIDATION: \"How do I verify it's correct?\"\n")
            prompt_parts.append("- IMPLEMENTATION: \"Where is the code? How does data flow?\"\n")
            prompt_parts.append("- HEALTH: \"Is it healthy? How do I verify it?\"\n")
            prompt_parts.append("- SYNC: \"What's the current state?\"\n\n")

            prompt_parts.append("### How to Fix\n")
            prompt_parts.append("Use **VIEW_Document_Create_Module_Documentation.md** to complete the chain.\n")
            prompt_parts.append("Create each missing doc with a descriptive name that captures the insight.\n\n")

            prompt_parts.append("### Reference\n")
            prompt_parts.append("- VIEW: `.mind/views/VIEW_Document_Create_Module_Documentation.md`\n")
            prompt_parts.append("- Templates: `.mind/templates/` (one for each doc type)\n\n")

        elif result.check_id == "NC":
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("Some documentation files don't follow naming conventions.\n\n")

            prompt_parts.append("### Issues Found\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### Why It Matters\n")
            prompt_parts.append("Consistent naming enables:\n")
            prompt_parts.append("- Automatic discovery by tools (`mind context`)\n")
            prompt_parts.append("- Pattern recognition by agents\n")
            prompt_parts.append("- Validation checks to work correctly\n\n")

            prompt_parts.append("### Correct Naming\n")
            prompt_parts.append("| Type | Pattern | Example |\n")
            prompt_parts.append("|------|---------|--------|\n")
            prompt_parts.append("| OBJECTIVES | `OBJECTIVES_Descriptive_Name.md` | `OBJECTIVES_Event_Store_Goals.md` |\n")
            prompt_parts.append("| PATTERNS | `PATTERNS_Descriptive_Name.md` | `PATTERNS_Why_Event_Sourcing.md` |\n")
            prompt_parts.append("| BEHAVIORS | `BEHAVIORS_Descriptive_Name.md` | `BEHAVIORS_Event_Store_Operations.md` |\n")
            prompt_parts.append("| ALGORITHM | `ALGORITHM_Descriptive_Name.md` | `ALGORITHM_Projection_Rebuild.md` |\n")
            prompt_parts.append("| VALIDATION | `VALIDATION_Descriptive_Name.md` | `VALIDATION_Event_Ordering.md` |\n")
            prompt_parts.append("| IMPLEMENTATION | `IMPLEMENTATION_Descriptive_Name.md` | `IMPLEMENTATION_Event_Store_Code.md` |\n")
            prompt_parts.append("| HEALTH | `HEALTH_Descriptive_Name.md` | `HEALTH_Event_Store_Verification.md` |\n")
            prompt_parts.append("| SYNC | `SYNC_Descriptive_Name.md` | `SYNC_Event_Store_State.md` |\n\n")

            prompt_parts.append("### How to Fix\n")
            prompt_parts.append("Rename the files to follow the pattern. The name should describe the *insight*, not just the module.\n\n")

        elif result.check_id == "V3":
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("Some CHAIN links in documentation files point to non-existent files.\n\n")

            prompt_parts.append("### Issues Found\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### Why It Matters\n")
            prompt_parts.append("CHAIN links connect documentation files into a navigable graph. Broken links mean:\n")
            prompt_parts.append("- Agents can't follow the chain to find related docs\n")
            prompt_parts.append("- The `mind context` command returns incomplete results\n")
            prompt_parts.append("- Documentation becomes disconnected\n\n")

            prompt_parts.append("### How to Fix\n")
            prompt_parts.append("For each broken link, either:\n")
            prompt_parts.append("1. **Create the missing file** if it should exist\n")
            prompt_parts.append("2. **Update the CHAIN section** to point to the correct file\n")
            prompt_parts.append("3. **Remove the link** if that doc type isn't needed yet\n\n")

            prompt_parts.append("### CHAIN Section Format\n")
            prompt_parts.append("```\n")
            prompt_parts.append("## CHAIN\n")
            prompt_parts.append("\n")
            prompt_parts.append("OBJECTIVES:      ./OBJECTIVES_Descriptive_Name.md\n")
            prompt_parts.append("BEHAVIORS:       ./BEHAVIORS_Descriptive_Name.md\n")
            prompt_parts.append("PATTERNS:        ./PATTERNS_Descriptive_Name.md\n")
            prompt_parts.append("ALGORITHM:       ./ALGORITHM_Descriptive_Name.md\n")
            prompt_parts.append("VALIDATION:      ./VALIDATION_Descriptive_Name.md\n")
            prompt_parts.append("IMPLEMENTATION:  ./IMPLEMENTATION_Descriptive_Name.md\n")
            prompt_parts.append("HEALTH:          ./HEALTH_Descriptive_Name.md\n")
            prompt_parts.append("THIS:            SYNC_Descriptive_Name.md\n")
            prompt_parts.append("```\n\n")

        elif result.check_id == "MM":
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append("Code directories exist but aren't mapped in the module manifest.\n\n")

            prompt_parts.append("### Issues Found\n")
            for detail in result.details:
                prompt_parts.append(f"- {detail}\n")

            prompt_parts.append("\n### Why It Matters\n")
            prompt_parts.append("The module manifest (modules.yaml) maps code to documentation:\n")
            prompt_parts.append("- Agents can find docs from code paths\n")
            prompt_parts.append("- `mind context` knows which docs to load\n")
            prompt_parts.append("- Dependencies between modules are explicit\n")
            prompt_parts.append("- Validation can check for drift between code and docs\n\n")

            prompt_parts.append("### How to Fix\n")
            prompt_parts.append("Edit `modules.yaml` and add mappings:\n\n")
            prompt_parts.append("```yaml\n")
            prompt_parts.append("modules:\n")
            prompt_parts.append("  your_module:\n")
            prompt_parts.append("    code: \"src/your/code/**\"\n")
            prompt_parts.append("    docs: \"docs/area/module/\"\n")
            prompt_parts.append("    maturity: DESIGNING\n")
            prompt_parts.append("    # See modules.yaml template for more fields\n")
            prompt_parts.append("```\n\n")

            prompt_parts.append("### Reference\n")
            prompt_parts.append("- VIEW: `.mind/views/VIEW_Document_Create_Module_Documentation.md`\n")
            prompt_parts.append("- Template: `modules.yaml`\n\n")

        else:
            # Generic fallback
            prompt_parts.append("### What's Wrong\n")
            prompt_parts.append(f"{result.message}\n\n")
            if result.details:
                prompt_parts.append("### Details\n")
                for detail in result.details:
                    prompt_parts.append(f"- {detail}\n")
                prompt_parts.append("\n")

        prompt_parts.append("---\n\n")

    # Summary
    prompt_parts.append("## Next Steps\n\n")
    prompt_parts.append("1. **Read the relevant VIEW** for guidance on how to fix these issues\n")
    prompt_parts.append("2. **Fix issues in order** — some depend on others (e.g., naming before chain links)\n")
    prompt_parts.append("3. **Run validation again** after fixes: `mind validate`\n")
    prompt_parts.append("4. **Update SYNC** when done so the next agent knows what you fixed\n")

    return "".join(prompt_parts)


def validate_protocol(target_dir: Path, verbose: bool = False) -> bool:
    """
    Validate protocol invariants in a project directory.

    Returns True if all checks pass, False otherwise.
    """
    print(f"Validating: {target_dir}")
    print()

    # Run all checks
    results = [
        check_protocol_installed(target_dir),
        check_views_exist(target_dir),
        check_project_sync_exists(target_dir),
        check_module_docs_minimum(target_dir),
        check_full_chain(target_dir),
        check_naming_conventions(target_dir),
        check_chain_links(target_dir),
        check_module_manifest(target_dir),
    ]

    passed = 0
    failed = 0

    for result in results:
        if result.passed:
            passed += 1
            print(f"  ✓ [{result.check_id}] {result.name}: {result.message}")
        else:
            failed += 1
            print(f"  ✗ [{result.check_id}] {result.name}: {result.message}")

        if verbose or not result.passed:
            for detail in result.details:
                print(f"      - {detail}")

    print()
    print(f"Results: {passed} passed, {failed} failed")

    if failed > 0:
        print()
        print("=" * 60)
        print()
        print(generate_fix_prompt(target_dir, results))

    return failed == 0
