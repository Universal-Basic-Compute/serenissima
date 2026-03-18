"""
Refactor utilities for module/doc moves.

DOCS: docs/cli/core/PATTERNS_Why_CLI_Over_Copy.md
"""

from __future__ import annotations

import argparse
import shlex
import shutil
from pathlib import Path
from typing import Iterable, List, Tuple

from .repo_overview import generate_and_save as generate_overview


TEXT_EXTENSIONS = {
    ".md",
    ".yaml",
    ".yml",
    ".txt",
    ".py",
    ".json",
    ".ini",
    ".cfg",
    ".sh",
    ".ts",
    ".js",
    ".rst",
    ".csv",
}


def _posix_relative(target_dir: Path, path: Path) -> str:
    try:
        rel = path.relative_to(target_dir)
    except ValueError:
        return str(path)
    return rel.as_posix()


def _collect_text_files(target_dir: Path) -> Iterable[Path]:
    for file_path in target_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        yield file_path


def _replace_text(file_path: Path, replacements: List[Tuple[str, str]]) -> bool:
    try:
        text = file_path.read_text()
    except UnicodeDecodeError:
        return False

    updated = text
    changed = False
    for old, new in replacements:
        if old in updated:
            updated = updated.replace(old, new)
            changed = True

    if changed:
        file_path.write_text(updated)

    return changed


def _resolve_path(target_dir: Path, path: Path) -> Path:
    return path if path.is_absolute() else target_dir / path


def _update_modules_yaml(
    target_dir: Path,
    doc_replacements: List[Tuple[str, str]],
    module_key_translation: Tuple[str, str] | None,
) -> bool:
    modules_path = target_dir / "modules.yaml"
    if not modules_path.exists():
        return False

    try:
        text = modules_path.read_text()
    except UnicodeDecodeError:
        return False

    updated = text
    for old, new in doc_replacements:
        updated = updated.replace(old, new)

    if module_key_translation:
        updated_lines: List[str] = []
        old_key, new_key = module_key_translation
        for line in updated.splitlines():
            stripped = line.lstrip()
            if stripped.startswith(f"{old_key}:") and ":" in stripped:
                indent = line[: len(line) - len(stripped)]
                updated_lines.append(f"{indent}{new_key}:")
                continue
            updated_lines.append(line)
        updated = "\n".join(updated_lines)

    if updated != text:
        modules_path.write_text(updated)
        return True

    return False


def _gather_replacements(
    old_rel: str, new_rel: str, is_dir: bool
) -> List[Tuple[str, str]]:
    replacements = [(old_rel, new_rel)]
    if is_dir:
        replacements.append((f"{old_rel}/", f"{new_rel}/"))
    return replacements


def _run_post_refactor_workflow(target_dir: Path) -> None:
    print("Generating docs overview for `docs/` …")
    overview_path = generate_overview(target_dir, subfolder="docs")
    print(f"Saved overview: {overview_path.relative_to(target_dir)}")


def _parse_batch_line(line: str) -> Tuple[str, List[str]]:
    parts = shlex.split(line)
    if not parts:
        return "", []
    return parts[0], parts[1:]


def _run_batch_actions(
    target_dir: Path,
    filelist_path: Path,
    module_translation: Tuple[str, str] | None,
    skip_existing: bool,
    overwrite: bool,
) -> None:
    filelist_path = _resolve_path(target_dir, filelist_path)
    if not filelist_path.exists():
        raise FileNotFoundError(f"Filelist not found: {filelist_path}")

    lines = filelist_path.read_text().splitlines()
    changed = False
    for index, raw in enumerate(lines, start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        action, args = _parse_batch_line(stripped)
        if action in {"rename", "move"}:
            if len(args) < 2:
                raise ValueError(f"Line {index}: expected '{action} <old> <new>'")
            moved = refactor_rename(
                target_dir,
                Path(args[0]),
                Path(args[1]),
                module_translation=module_translation,
                run_post=False,
                skip_existing=skip_existing,
                overwrite=overwrite,
            )
            changed = changed or moved
            continue
        if action == "promote":
            if not args:
                raise ValueError(f"Line {index}: expected 'promote <source> [target]'")
            target = Path(args[1]) if len(args) > 1 else None
            moved = refactor_promote(
                target_dir,
                Path(args[0]),
                target=target,
                module_translation=module_translation,
                run_post=False,
                skip_existing=skip_existing,
                overwrite=overwrite,
            )
            changed = changed or moved
            continue
        if action == "demote":
            if len(args) < 2:
                raise ValueError(f"Line {index}: expected 'demote <module> <area>'")
            moved = refactor_demote(
                target_dir,
                Path(args[0]),
                args[1],
                module_translation=module_translation,
                run_post=False,
                skip_existing=skip_existing,
                overwrite=overwrite,
            )
            changed = changed or moved
            continue
        raise ValueError(f"Line {index}: unsupported action '{action}'")

    if changed:
        _run_post_refactor_workflow(target_dir)
    else:
        print("No refactor changes applied; skipping overview.")


def _handle_existing_target(target: Path, skip_existing: bool, overwrite: bool) -> bool:
    if not target.exists():
        return True
    if overwrite:
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
        return True
    if skip_existing:
        print(f"Skipping existing target: {target}")
        return False
    raise FileExistsError(f"Target path already exists: {target}")


def refactor_rename(
    target_dir: Path,
    old_path: Path,
    new_path: Path,
    module_translation: Tuple[str, str] | None = None,
    run_post: bool = True,
    skip_existing: bool = False,
    overwrite: bool = True,
) -> bool:
    old_path = _resolve_path(target_dir, old_path)
    new_path = _resolve_path(target_dir, new_path)

    if not old_path.exists():
        raise FileNotFoundError(f"Source path does not exist: {old_path}")
    if old_path.resolve() == new_path.resolve():
        print(f"Skipping no-op move: {old_path}")
        return False
    if not _handle_existing_target(new_path, skip_existing, overwrite):
        return False

    is_dir = old_path.is_dir()
    doc_replacements = _gather_replacements(
        _posix_relative(target_dir, old_path), _posix_relative(target_dir, new_path), is_dir
    )

    print(f"Moving {old_path} → {new_path}")
    new_path.parent.mkdir(parents=True, exist_ok=True)
    old_path.rename(new_path)

    print("Updating doc references …")
    updated_files = 0
    for file_path in _collect_text_files(target_dir):
        if _replace_text(file_path, doc_replacements):
            updated_files += 1

    print(f"Updated references in {updated_files} files.")

    if _update_modules_yaml(target_dir, doc_replacements, module_translation):
        print("modules.yaml updated.")

    if run_post:
        _run_post_refactor_workflow(target_dir)
    return True


def refactor_move(
    target_dir: Path,
    old_path: Path,
    new_path: Path,
    module_translation: Tuple[str, str] | None = None,
    run_post: bool = True,
    skip_existing: bool = False,
    overwrite: bool = True,
) -> bool:
    return refactor_rename(
        target_dir,
        old_path,
        new_path,
        module_translation=module_translation,
        run_post=run_post,
        skip_existing=skip_existing,
        overwrite=overwrite,
    )


def refactor_promote(
    target_dir: Path,
    source: Path,
    target: Path | None = None,
    module_translation: Tuple[str, str] | None = None,
    run_post: bool = True,
    skip_existing: bool = False,
    overwrite: bool = True,
) -> bool:
    source_path = _resolve_path(target_dir, source)
    if target:
        new_path = _resolve_path(target_dir, target)
    else:
        try:
            rel_parts = source_path.relative_to(target_dir).parts
        except ValueError:
            raise ValueError("Source path must live inside project root")
        if len(rel_parts) < 3 or rel_parts[0] != "docs":
            raise ValueError("Promote requires a `docs/<area>/<module>` path")
        module_name = rel_parts[-1]
        new_path = target_dir / "docs" / module_name

    return refactor_rename(
        target_dir,
        source_path,
        new_path,
        module_translation=module_translation,
        run_post=run_post,
        skip_existing=skip_existing,
        overwrite=overwrite,
    )


def refactor_demote(
    target_dir: Path,
    module_path: Path,
    target_area: str,
    module_translation: Tuple[str, str] | None = None,
    run_post: bool = True,
    skip_existing: bool = False,
    overwrite: bool = True,
) -> bool:
    module_path = _resolve_path(target_dir, module_path)
    if not target_area:
        raise ValueError("Demote requires --target-area to specify the destination area")

    module_name = module_path.name
    new_path = target_dir / "docs" / target_area / module_name

    return refactor_rename(
        target_dir,
        module_path,
        new_path,
        module_translation=module_translation,
        run_post=run_post,
        skip_existing=skip_existing,
        overwrite=overwrite,
    )


def refactor_command(args: argparse.Namespace) -> int:
    target_dir = Path(args.dir or Path.cwd())

    module_translation = None
    if getattr(args, "module_old", None) and getattr(args, "module_new", None):
        module_translation = (args.module_old, args.module_new)

    try:
        if args.action == "rename":
            refactor_rename(
                target_dir,
                Path(args.old),
                Path(args.new),
                module_translation=module_translation,
                skip_existing=args.skip_existing,
                overwrite=args.overwrite,
            )
            return 0
        if args.action == "move":
            refactor_move(
                target_dir,
                Path(args.old),
                Path(args.new),
                module_translation=module_translation,
                skip_existing=args.skip_existing,
                overwrite=args.overwrite,
            )
            return 0
        if args.action == "batch":
            _run_batch_actions(
                target_dir,
                Path(args.filelist),
                module_translation=module_translation,
                skip_existing=args.skip_existing,
                overwrite=args.overwrite,
            )
            return 0
        if args.action == "promote":
            refactor_promote(
                target_dir,
                Path(args.source),
                target=Path(args.target) if args.target else None,
                module_translation=module_translation,
                skip_existing=args.skip_existing,
                overwrite=args.overwrite,
            )
            return 0
        if args.action == "demote":
            refactor_demote(
                target_dir,
                Path(args.module),
                args.target_area,
                module_translation=module_translation,
                skip_existing=args.skip_existing,
                overwrite=args.overwrite,
            )
            return 0

        print(f"Unsupported refactor action: {args.action}")
        return 1
    except Exception as exc:
        print(f"Refactor failed: {exc}")
        return 1
