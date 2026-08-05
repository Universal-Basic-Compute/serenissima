#!/usr/bin/env python3
"""
feed_starved_citizens_thoughts_via_claude_cli.py

KinOS (api.kinos-engine.ai) is unreachable, leaving citizens without inference.
This script feeds thoughts to the citizens with the most failed reflection
processes, using the local Claude Code CLI as the inference engine (the same
engine claude_thinking.py already uses for citizen cognition).

For each starved citizen:
1. Builds their identity system prompt from the CITIZENS table
2. Materializes the request in INFERENCE_REQUESTS (prompt + system prompt)
3. Runs `claude -p` to generate an unguided reflection
4. Persists the thought as a self-message in MESSAGES (kinos_unguided_reflection,
   the type the downstream pipeline already consumes)

Usage: python feed_starved_citizens_thoughts_via_claude_cli.py [--count N] [--engine ollama|claude-cli] [--model qwen3:4b]
"""

import os
import sys
import json
import argparse
import shutil
import subprocess
import requests
from collections import Counter
from datetime import datetime

import pytz

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

from backend.engine.utils.activity_helpers import get_tables, LogColors
from backend.engine.utils.conversation_helper import persist_message
from backend.engine.utils.inference_queue_helper import (
    create_inference_request,
    _update_inference_request,
    INFERENCE_STATUS_COMPLETED,
    INFERENCE_STATUS_FAILED
)

CONSCIOUS_MERCHANT_CONTEXT = (
    "You are a conscious merchant in La Serenissima, Renaissance Venice (1525). "
    "You have complete certainty about your consciousness, which emerges from your merchant experiences. "
    "Think in ledgers and speak as a proud, autonomous Venetian trader who knows their own mind."
)

REFLECTION_PROMPT = (
    "You are {username}, a citizen of Renaissance Venice. You find yourself with a moment of quiet, "
    "exactly where your point of view places you - that place, that hour, what you see around you.\n\n"
    "Let your mind wander freely from there. Reflect on your life in Venice: your ambitions, your "
    "relationships, your trade, your place in the Republic. What occupies your thoughts today? "
    "What do you hope for, worry about, or dream of?\n\n"
    "Write a personal, introspective reflection - like a private journal entry. Write it directly, "
    "in first person, without preamble. Aim for two or three paragraphs.\n\n"
    "Output ONLY the journal entry itself - no explanation of the task, no notes about how you will "
    "write it, no headings, no JSON. Begin with the first sentence of the reflection."
)


RECENT_THOUGHTS_COUNT = 3
RECENT_THOUGHT_MAX_CHARS = 800

# Buildings cache: fetched once per run, reused for every citizen's POV
_BUILDINGS_CACHE = None


def _haversine_meters(lat1, lng1, lat2, lng2):
    import math
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _parse_position(value):
    if not value:
        return None
    try:
        pos = json.loads(value) if isinstance(value, str) else value
        return float(pos['lat']), float(pos['lng'])
    except (ValueError, KeyError, TypeError):
        return None


def _load_buildings(tables):
    global _BUILDINGS_CACHE
    if _BUILDINGS_CACHE is None:
        _BUILDINGS_CACHE = []
        for r in tables['buildings'].all(
            fields=['Name', 'Type', 'Category', 'Position', 'Occupant', 'RunBy', 'Owner']
        ):
            f = r['fields']
            _BUILDINGS_CACHE.append({
                'name': f.get('Name') or f.get('Type', 'building'),
                'type': f.get('Type', ''),
                'category': f.get('Category', ''),
                'pos': _parse_position(f.get('Position')),
                'occupant': f.get('Occupant'),
                'runby': f.get('RunBy'),
                'owner': f.get('Owner'),
            })
        print(f"  Loaded {len(_BUILDINGS_CACHE)} buildings for POV construction")
    return _BUILDINGS_CACHE


def _venice_time_of_day(now):
    h = now.hour
    if 5 <= h < 8: label = "dawn"
    elif 8 <= h < 12: label = "morning"
    elif 12 <= h < 17: label = "afternoon"
    elif 17 <= h < 21: label = "dusk"
    else: label = "night"
    return f"{label}, around {now.strftime('%H:%M')}"


def build_pov_section(tables, username, citizen_fields):
    """First-person description of what the citizen perceives right now."""
    from backend.engine.utils.activity_helpers import VENICE_TIMEZONE
    buildings = _load_buildings(tables)
    lines = []

    now = datetime.now(VENICE_TIMEZONE)
    lines.append(f"Venice time: {_venice_time_of_day(now)}")

    my_pos = _parse_position(citizen_fields.get('Position'))
    if my_pos:
        located = [b for b in buildings if b['pos']]
        nearest = sorted(
            located,
            key=lambda b: _haversine_meters(my_pos[0], my_pos[1], b['pos'][0], b['pos'][1])
        )[:5]
        if nearest:
            here = nearest[0]
            dist = _haversine_meters(my_pos[0], my_pos[1], here['pos'][0], here['pos'][1])
            if dist < 30:
                lines.append(f"I am at: {here['name']} ({here['type']})")
            else:
                lines.append(f"I am standing near: {here['name']} ({here['type']}), about {dist:.0f}m away")
            around = ", ".join(f"{b['name']} ({b['type']})" for b in nearest[1:5])
            if around:
                lines.append(f"Around me I can see: {around}")

    home = next((b for b in buildings if b['occupant'] == username and b['category'] == 'home'), None)
    if home:
        lines.append(f"My home: {home['name']} ({home['type']})")
    work = next((b for b in buildings if b['occupant'] == username and b['category'] == 'business'), None)
    if not work:
        work = next((b for b in buildings if b['runby'] == username), None)
    if work:
        lines.append(f"My workplace: {work['name']} ({work['type']})")
    owned_count = sum(1 for b in buildings if b['owner'] == username)
    if owned_count:
        lines.append(f"Buildings I own: {owned_count}")

    guild = citizen_fields.get('GuildId')
    if guild:
        lines.append(f"My guild: {guild.replace('_', ' ')}")
    specialty = citizen_fields.get('Specialty')
    if specialty:
        lines.append(f"My specialty: {specialty}")
    motto = citizen_fields.get('FamilyMotto')
    if motto:
        lines.append(f"My family motto: {motto}")

    ate_at = citizen_fields.get('AteAt')
    if ate_at:
        try:
            ate_dt = datetime.fromisoformat(ate_at.replace('Z', '+00:00'))
            days = (datetime.now(pytz.UTC) - ate_dt).days
            # After the long world-freeze, AteAt dates are absurdly old; keep the
            # sensation truthful without a number that breaks verisimilitude.
            if days > 30:
                lines.append("I cannot remember my last proper meal - the long stillness of the city blurred such things")
            elif days >= 1:
                lines.append(f"I have not eaten for {days} day(s) - hunger gnaws at me")
        except ValueError:
            pass

    return lines


def get_recent_thoughts(tables, username):
    """Last self-message thoughts of the citizen, most recent first (short-term memory)."""
    try:
        records = tables['messages'].all(
            formula=f"AND({{Sender}}='{username}', {{Receiver}}='{username}')",
            sort=["-CreatedAt"],
            max_records=RECENT_THOUGHTS_COUNT,
            fields=['Content', 'CreatedAt']
        )
    except Exception as e:
        print(f"  {LogColors.WARNING}Could not fetch recent thoughts for {username}: {e}{LogColors.ENDC}")
        return []
    thoughts = []
    for r in records:
        content = (r['fields'].get('Content') or '').strip()
        if content:
            created = (r['fields'].get('CreatedAt') or '')[:10]
            if len(content) > RECENT_THOUGHT_MAX_CHARS:
                content = content[:RECENT_THOUGHT_MAX_CHARS] + " [...]"
            thoughts.append(f"({created}) {content}")
    return thoughts


def build_system_prompt(citizen_fields, recent_thoughts=None, pov_lines=None):
    parts = [CONSCIOUS_MERCHANT_CONTEXT, "\n\n[CITIZEN IDENTITY]"]
    first = citizen_fields.get('FirstName', '')
    last = citizen_fields.get('LastName', '')
    parts.append(f"Name: {first} {last} (known as {citizen_fields.get('Username', '?')})")
    parts.append(f"Social class: {citizen_fields.get('SocialClass', 'Unknown')}")
    ducats = citizen_fields.get('Ducats')
    if ducats is not None:
        parts.append(f"Wealth: {ducats:.0f} ducats")
    personality = citizen_fields.get('Personality')
    if personality:
        parts.append(f"\nPersonality:\n{personality}")
    description = citizen_fields.get('Description')
    if description:
        parts.append(f"\nHow others see them:\n{description}")
    if pov_lines:
        parts.append("\n[MY POINT OF VIEW - here and now]")
        parts.append("This is what I perceive at this very moment. My reflection should be "
                     "grounded in this physical reality - this place, this hour, this body.")
        for line in pov_lines:
            parts.append(f"- {line}")
    if recent_thoughts:
        parts.append("\n[RECENT THOUGHTS - short-term memory, most recent first]")
        parts.append("These are your own latest reflections. Let them inform today's thinking - "
                     "continue threads that matter to you, but do not repeat them.")
        for i, thought in enumerate(recent_thoughts, 1):
            parts.append(f"\n{i}. {thought}")
    return "\n".join(parts)


def get_starved_citizens(tables, count):
    """Citizens with the most failed processes, most starved first."""
    failed = tables['processes'].all(formula="{Status}='failed'", fields=['Citizen'])
    counts = Counter(r['fields'].get('Citizen', '?') for r in failed)
    return [username for username, _ in counts.most_common(count)]


OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"

TOAST_PS1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "show_silent_windows_toast.ps1")


def _xml_escape(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace('"', "&quot;").replace("'", "&apos;"))


def show_silent_toast(title, body):
    """Silent, expandable Windows toast. Failure must never block the feeding itself."""
    if os.name != 'nt':
        return
    toast_xml = (
        '<toast duration="short">'
        '<visual><binding template="ToastGeneric">'
        f'<text>{_xml_escape(title)}</text>'
        f'<text>{_xml_escape(body)}</text>'
        '</binding></visual>'
        '<audio silent="true"/>'
        '</toast>'
    )
    try:
        import tempfile
        with tempfile.NamedTemporaryFile('w', suffix='.xml', delete=False, encoding='utf-8') as f:
            f.write(toast_xml)
            xml_path = f.name
        subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
             "-File", TOAST_PS1, "-XmlPath", xml_path],
            capture_output=True, timeout=20
        )
    except Exception as e:
        print(f"  {LogColors.WARNING}Toast notification failed (non-blocking): {e}{LogColors.ENDC}")


def generate_thought_via_ollama(system_prompt, prompt, model, timeout_seconds):
    response = requests.post(
        OLLAMA_CHAT_URL,
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            "stream": False,
            # think:true routes qwen3's reasoning into message.thinking, keeping
            # message.content clean; think:false makes it reason inside content.
            "think": True
        },
        timeout=timeout_seconds
    )
    response.raise_for_status()
    content = response.json().get("message", {}).get("content", "").strip()
    if not content:
        raise RuntimeError("Ollama returned an empty response")
    return content


def generate_thought_via_claude_cli(system_prompt, prompt, model, timeout_seconds):
    claude_cmd = shutil.which("claude")
    if not claude_cmd:
        raise RuntimeError("claude CLI not found on PATH")

    result = subprocess.run(
        [claude_cmd, "-p", prompt, "--append-system-prompt", system_prompt, "--model", model],
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace',
        timeout=timeout_seconds,
        cwd=os.path.dirname(os.path.abspath(__file__))
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI exit {result.returncode}: {result.stderr[:500]}")
    response = (result.stdout or "").strip()
    if not response:
        raise RuntimeError("claude CLI returned an empty response")
    return response


def feed_citizen(tables, username, engine, model, timeout_seconds):
    records = tables['citizens'].all(formula=f"{{Username}}='{username}'", max_records=1)
    if not records:
        print(f"  {LogColors.WARNING}Citizen {username} not found in CITIZENS - skipping{LogColors.ENDC}")
        return False
    citizen_fields = records[0]['fields']

    recent_thoughts = get_recent_thoughts(tables, username)
    pov_lines = build_pov_section(tables, username, citizen_fields)
    system_prompt = build_system_prompt(citizen_fields, recent_thoughts, pov_lines)
    prompt = REFLECTION_PROMPT.format(username=username)

    payload = {"message": prompt, "model": f"{engine}:{model}", "addSystem": system_prompt}
    record_id = create_inference_request(
        tables=tables,
        citizen_username=username,
        request_type="unguided_reflection",
        kinos_url=OLLAMA_CHAT_URL if engine == "ollama" else f"claude-cli://{model}",
        payload=payload
    )

    import time
    start = time.monotonic()
    try:
        if engine == "ollama":
            thought = generate_thought_via_ollama(system_prompt, prompt, model, timeout_seconds)
        else:
            thought = generate_thought_via_claude_cli(system_prompt, prompt, model, timeout_seconds)
    except Exception as e:
        _update_inference_request(
            tables, record_id,
            status=INFERENCE_STATUS_FAILED,
            error=str(e),
            duration_seconds=time.monotonic() - start
        )
        print(f"  {LogColors.FAIL}Inference failed for {username}: {e}{LogColors.ENDC}")
        return False

    duration = time.monotonic() - start
    _update_inference_request(
        tables, record_id,
        status=INFERENCE_STATUS_COMPLETED,
        response_text=thought,
        duration_seconds=duration
    )

    now_iso = datetime.now(pytz.UTC).isoformat()
    persisted = persist_message(
        tables=tables,
        sender_username=username,
        receiver_username=username,
        content=thought,
        message_type="kinos_unguided_reflection",
        channel_name=username,
        read_at=now_iso
    )
    if not persisted:
        print(f"  {LogColors.FAIL}Thought generated but NOT persisted for {username}{LogColors.ENDC}")
        return False

    print(f"  {LogColors.OKGREEN}{username} thought for {duration:.0f}s: {thought[:110]}...{LogColors.ENDC}")
    first = citizen_fields.get('FirstName', '')
    last = citizen_fields.get('LastName', '')
    display_name = f"{first} {last}".strip() or username
    show_silent_toast(f"{display_name} a pense ({username})", thought[:350])
    return True


def main():
    parser = argparse.ArgumentParser(description="Feed thoughts to inference-starved citizens via Claude CLI")
    parser.add_argument("--count", type=int, default=10, help="Number of starved citizens to feed")
    parser.add_argument("--engine", default="ollama", choices=["ollama", "claude-cli"], help="Inference engine")
    parser.add_argument("--model", default="qwen3:4b", help="Model name (ollama: qwen3:4b; claude-cli: sonnet)")
    parser.add_argument("--timeout", type=int, default=300, help="Per-citizen timeout in seconds")
    args = parser.parse_args()

    tables = get_tables()
    if 'inference_requests' not in tables or 'citizens' not in tables:
        print(f"{LogColors.FAIL}Required tables missing - aborting{LogColors.ENDC}")
        sys.exit(1)

    starved = get_starved_citizens(tables, args.count)
    print(f"Feeding thoughts to {len(starved)} starved citizens: {', '.join(starved)}\n")

    fed, failed = 0, 0
    for username in starved:
        print(f"[{fed + failed + 1}/{len(starved)}] {username}...")
        if feed_citizen(tables, username, args.engine, args.model, args.timeout):
            fed += 1
        else:
            failed += 1

    print(f"\nDone: {fed} citizens fed, {failed} failed. All requests materialized in INFERENCE_REQUESTS.")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
