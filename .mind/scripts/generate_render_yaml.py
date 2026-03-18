#!/usr/bin/env python3
"""
Generate render.yaml — auto-detect runtime, repo name, build/start commands.

Called by `mind init` to create a ready-to-deploy render.yaml.

Usage:
    python3 .mind/scripts/generate_render_yaml.py
"""

import subprocess
import sys
from pathlib import Path


def detect_repo_name():
    try:
        remote = subprocess.check_output(
            ["git", "remote", "get-url", "origin"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        return remote.split("/")[-1].replace(".git", "")
    except Exception:
        return Path.cwd().name


def detect_runtime():
    """Detect runtime from project files."""
    cwd = Path.cwd()
    if (cwd / "Dockerfile").exists():
        return "docker"
    if (cwd / "package.json").exists():
        return "node"
    if (cwd / "requirements.txt").exists() or (cwd / "setup.py").exists():
        return "python"
    return "node"


def detect_commands(runtime):
    """Detect build and start commands."""
    cwd = Path.cwd()

    if runtime == "docker":
        return None, None  # Docker uses Dockerfile

    if runtime == "node":
        build = "npm install && npm run build"
        # Check for world-manifest (universe repo)
        if (cwd / "world-manifest.json").exists():
            start = "node engine/index.js --world world-manifest.json"
            build += " && curl -fsSL https://claude.ai/install.sh | bash || true"
        elif (cwd / "engine" / "index.js").exists():
            start = "node engine/index.js"
        else:
            start = "npm start"
        return build, start

    if runtime == "python":
        build = "pip install -r requirements.txt"
        if (cwd / "home_server.py").exists():
            start = "uvicorn home_server:app --host 0.0.0.0 --port $PORT"
        else:
            start = "python3 main.py"
        return build, start

    return "npm install", "npm start"


def detect_env_keys():
    """Read .env file and extract key names for sync: false entries."""
    env_path = Path(".env")
    if not env_path.exists():
        return []
    keys = []
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key = line.partition("=")[0].strip()
        if key:
            keys.append(key)
    return keys


def generate():
    name = detect_repo_name()
    runtime = detect_runtime()
    build_cmd, start_cmd = detect_commands(runtime)
    env_keys = detect_env_keys()

    lines = ["services:"]
    lines.append(f"  - type: web")
    lines.append(f"    name: {name}")
    lines.append(f"    runtime: {runtime}")
    lines.append(f"    plan: starter")
    lines.append(f"    region: frankfurt")

    if runtime != "docker":
        if build_cmd:
            lines.append(f"    buildCommand: {build_cmd}")
        if start_cmd:
            lines.append(f"    startCommand: {start_cmd}")

    if runtime == "docker" and Path("Dockerfile").exists():
        lines.append(f"    dockerfilePath: ./Dockerfile")

    # Env vars
    lines.append(f"    envVars:")
    lines.append(f"      - key: NODE_ENV")
    lines.append(f"        value: production")
    lines.append(f"      - key: PORT")
    lines.append(f'        value: "10000"')
    lines.append(f"      - key: RENDER")
    lines.append(f'        value: "true"')

    # All .env keys as sync: false (secrets set via dashboard)
    for key in env_keys:
        if key in ("NODE_ENV", "PORT", "RENDER"):
            continue
        lines.append(f"      - key: {key}")
        lines.append(f"        sync: false")

    output = "\n".join(lines) + "\n"

    render_yaml = Path("render.yaml")
    if render_yaml.exists():
        print(f"render.yaml already exists, writing to render.yaml.generated")
        render_yaml = Path("render.yaml.generated")

    render_yaml.write_text(output)
    print(f"Generated {render_yaml} ({name}, {runtime}, {len(env_keys)} env keys)")


if __name__ == "__main__":
    generate()
