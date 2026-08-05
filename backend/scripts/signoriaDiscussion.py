"""Signoria council debate — the ten most influential citizens deliberate.

*Venice*: the great bell of San Marco tolls; the nine most influential
citizens and NLR file into the council chamber. The Doge sets the question,
each member speaks in randomized order, hearing all who spoke before them,
and every word is carved into the city's memory.

Substrate: CITIZENS (Airtable) sorted by Influence -> top 9 + NLR;
each AI member speaks through the local Ollama model (same model as
backend/minds/ollama_citizen_mind.py — KinOS being unreachable, the voices
are local now); the running transcript is fed to each next speaker; every
statement is written to MESSAGES (Receiver="SignoriaCouncil",
Type="signoria_discussion_statement"). NLR is the human Doge: prompted for
input when interactive, skipped in --auto mode. Ollama failures skip the
speaker loudly — one clouded mind never dissolves the council.

Usage:
  python backend/scripts/signoriaDiscussion.py --topic "Faut-il ..." --auto
  python backend/scripts/signoriaDiscussion.py            # interactive Doge
"""
import os
import sys
import random
import argparse
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api as AirtableApi
from pyairtable import Table as AirtableTable

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
sys.path.insert(0, PROJECT_ROOT)

try:
    from backend.engine.utils.activity_helpers import LogColors
except ImportError:
    class LogColors:
        HEADER = '\033[95m'
        OKBLUE = '\033[94m'
        OKCYAN = '\033[96m'
        OKGREEN = '\033[92m'
        WARNING = '\033[93m'
        FAIL = '\033[91m'
        ENDC = '\033[0m'
        BOLD = '\033[1m'
        UNDERLINE = '\033[4m'

# --- Configuration ---
OLLAMA_CHAT_URL = os.getenv("OLLAMA_CHAT_URL", "http://localhost:11434/api/chat")
DEFAULT_MODEL = "qwen3-vl:2b-instruct"  # same local mind as the Venice Engine
KEEP_ALIVE = "10m"
SPEAKER_TIMEOUT_SECONDS = 180  # cold model loads can take ~30 s on the shared GPU
TRANSCRIPT_LAST_N = 8          # 2B model: keep the fed transcript short
STATEMENT_TRUNCATE_CHARS = 500

# --- Airtable ---

def initialize_airtable() -> Optional[Dict[str, AirtableTable]]:
    """Connects to Airtable and returns the tables the council needs."""
    load_dotenv(os.path.join(PROJECT_ROOT, '.env'))
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")
    if not airtable_api_key or not airtable_base_id:
        print(f"{LogColors.FAIL}Error: AIRTABLE_API_KEY or AIRTABLE_BASE_ID not found in .env.{LogColors.ENDC}")
        return None
    try:
        api = AirtableApi(airtable_api_key)
        tables = {
            "citizens": api.table(airtable_base_id, "CITIZENS"),
            "messages": api.table(airtable_base_id, "MESSAGES"),
            "relationships": api.table(airtable_base_id, "RELATIONSHIPS"),
        }
        print(f"{LogColors.OKGREEN}Airtable connection initialized (Citizens, Messages, Relationships).{LogColors.ENDC}")
        return tables
    except Exception as e:
        print(f"{LogColors.FAIL}Error initializing Airtable: {e}{LogColors.ENDC}")
        return None


def get_signoria_members(tables: Dict[str, AirtableTable], nlr_username: str = "NLR") -> List[Dict]:
    """Top 9 citizens by Influence + NLR, speaking order randomized."""
    all_citizens_raw = tables["citizens"].all()
    all_citizens = [
        {
            "id": rec["id"],
            "username": rec["fields"].get("Username"),
            "influence": float(rec["fields"].get("Influence", 0.0) or 0.0),
            "fields": rec["fields"],
        }
        for rec in all_citizens_raw if rec["fields"].get("Username")
    ]
    all_citizens.sort(key=lambda x: x["influence"], reverse=True)

    signoria = all_citizens[:9]
    if not any(m["username"] == nlr_username for m in signoria):
        nlr = next((c for c in all_citizens if c["username"] == nlr_username), None)
        if nlr:
            signoria.append(nlr)
        else:
            print(f"{LogColors.WARNING}Citizen {nlr_username} not found. Signoria will consist of top 9 only.{LogColors.ENDC}")

    random.shuffle(signoria)
    print(f"{LogColors.OKCYAN}Signoria convened ({len(signoria)} members, speaking order randomized):{LogColors.ENDC}")
    for i, member in enumerate(signoria):
        print(f"  {i + 1}. {display_name_of(member)} (Influence: {member['influence']:.0f})")
    return signoria


def display_name_of(member: Dict) -> str:
    name = f"{member['fields'].get('FirstName', '')} {member['fields'].get('LastName', '')}".strip()
    return name or member["username"]


def load_council_relationships(tables: Dict[str, AirtableTable], members: List[Dict]) -> List[Dict[str, Any]]:
    """One fetch of RELATIONSHIPS, filtered to pairs sitting at the table."""
    usernames = {m["username"] for m in members}
    try:
        all_rels = tables["relationships"].all()
    except Exception as e:
        print(f"{LogColors.FAIL}Error fetching relationships: {e}{LogColors.ENDC}")
        return []
    council_rels = []
    for rec in all_rels:
        f = rec["fields"]
        if f.get("Citizen1") in usernames and f.get("Citizen2") in usernames:
            council_rels.append({
                "Citizen1": f.get("Citizen1"),
                "Citizen2": f.get("Citizen2"),
                "Title": f.get("Title"),
                "StrengthScore": f.get("StrengthScore"),
                "TrustScore": f.get("TrustScore"),
            })
    print(f"{LogColors.OKCYAN}{len(council_rels)} relationships between council members loaded.{LogColors.ENDC}")
    return council_rels


def create_airtable_message_record(
    tables: Dict[str, AirtableTable],
    sender_username: str,
    content: str,
    message_type: str,
) -> bool:
    """Carves a council statement into the city's memory (MESSAGES table)."""
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        tables["messages"].create({
            "MessageId": f"sig_disc_{sender_username}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
            "Sender": sender_username,
            "Receiver": "SignoriaCouncil",
            "Content": content,
            "Type": message_type,
            "CreatedAt": now_iso,
            "ReadAt": now_iso,  # council statements are heard by all, immediately
        })
        return True
    except Exception as e:
        print(f"  {LogColors.FAIL}Error recording message from {sender_username} in Airtable: {e}{LogColors.ENDC}")
        return False


# --- Local Ollama voices ---

def preload_model(model: str, timeout_seconds: int = 300) -> None:
    """Warm the local model before the first speaker (shared-GPU cold loads are slow)."""
    response = requests.post(
        OLLAMA_CHAT_URL,
        json={"model": model, "messages": [], "keep_alive": KEEP_ALIVE},
        timeout=timeout_seconds,
    )
    response.raise_for_status()


def build_persona_prompt(member: Dict, members: List[Dict], relationships: List[Dict], topic: str) -> str:
    """Compact persona + council context — the 2B model rewards brevity.

    Deliberate scope reduction vs the old KinOS version: no ledger, no full
    profile JSON — a 2B context cannot hold them and stay coherent.
    """
    f = member["fields"]
    lines = [
        f"Tu es {display_name_of(member)} ({member['username']}), "
        f"{f.get('SocialClass', 'citoyen')} de Venise, membre de la Signoria, le haut conseil de la ville.",
    ]
    personality = f.get("CorePersonality") or f.get("Personality") or f.get("Description")
    if personality:
        lines.append(f"Personnalité: {str(personality)[:300]}")
    if f.get("FamilyMotto"):
        lines.append(f"Devise familiale: {f['FamilyMotto']}")
    lines.append(f"Influence: {member['influence']:.0f}. Ducats: {f.get('Ducats', 0):.0f}.")

    others = ", ".join(display_name_of(m) for m in members if m["username"] != member["username"])
    lines.append(f"Autour de la table siègent: {others}.")

    my_rels = [r for r in relationships if member["username"] in (r["Citizen1"], r["Citizen2"])]
    if my_rels:
        rel_lines = []
        for r in my_rels[:8]:
            other = r["Citizen2"] if r["Citizen1"] == member["username"] else r["Citizen1"]
            parts = [f"avec {other}"]
            if r.get("Title"):
                parts.append(str(r["Title"]))
            if r.get("TrustScore") is not None:
                parts.append(f"confiance {r['TrustScore']:.0f}")
            rel_lines.append(" ".join(parts))
        lines.append("Tes relations au conseil: " + "; ".join(rel_lines) + ".")

    lines.append(
        f"Le Doge a soumis au débat: \"{topic}\" "
        "Parle en ton nom propre, à la première personne, en 3 à 6 phrases. "
        "Prends position clairement, réagis aux orateurs précédents si pertinent. "
        "Réponds en français, sans préambule ni guillemets."
    )
    return "\n".join(lines)


def build_transcript_prompt(transcript: List[Dict], speaker_display_name: str) -> str:
    if not transcript:
        return (
            f"Le conseil s'ouvre. {speaker_display_name}, vous parlez en premier. "
            "Quelle est votre position?"
        )
    lines = ["Les orateurs précédents ont dit:"]
    for entry in transcript[-TRANSCRIPT_LAST_N:]:
        lines.append(f"- {entry['speaker']}: {entry['text'][:STATEMENT_TRUNCATE_CHARS]}")
    lines.append(f"{speaker_display_name}, la parole est à vous. Quelle est votre position?")
    return "\n".join(lines)


def speak(model: str, persona_prompt: str, transcript_prompt: str) -> str:
    """One speaker's turn. Raises on HTTP/network failure (fail loud)."""
    response = requests.post(
        OLLAMA_CHAT_URL,
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": persona_prompt},
                {"role": "user", "content": transcript_prompt},
            ],
            "stream": False,
            "keep_alive": KEEP_ALIVE,
            "options": {"temperature": 0.9, "num_predict": 4000},
        },
        timeout=SPEAKER_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    content = response.json()["message"]["content"].strip()
    if content.startswith('"') and content.endswith('"'):
        content = content[1:-1].strip()
    return content


# --- Council session ---

def prompt_doge(label: str) -> Optional[str]:
    """Reads a line from the Doge if a keyboard is attached; None otherwise."""
    if not sys.stdin.isatty():
        return None
    try:
        text = input(f"{LogColors.OKBLUE}{label}{LogColors.ENDC}")
        return text.strip() or None
    except (EOFError, KeyboardInterrupt):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Signoria council debate (local Ollama voices).")
    parser.add_argument("--topic", type=str, default=None,
                        help="Question the Doge submits to the council. Asked interactively if omitted.")
    parser.add_argument("--rounds", type=int, default=1, help="Number of full speaking rounds (default 1).")
    parser.add_argument("--limit", type=int, default=None,
                        help="Cap the number of speakers per round (testing).")
    parser.add_argument("--auto", action="store_true",
                        help="Non-interactive: no Doge prompts between speakers; NLR is skipped.")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL,
                        help=f"Local Ollama model (default: {DEFAULT_MODEL}).")
    parser.add_argument("--nlr", type=str, default="NLR", help="Username of the human Doge citizen.")
    args = parser.parse_args()

    print(f"{LogColors.HEADER}--- Signoria Council Debate (local voices) ---{LogColors.ENDC}")

    tables = initialize_airtable()
    if not tables:
        sys.exit(1)

    members = get_signoria_members(tables, nlr_username=args.nlr)
    if not members:
        print(f"{LogColors.FAIL}No Signoria members found. Exiting.{LogColors.ENDC}")
        sys.exit(1)

    topic = args.topic
    if not topic:
        topic = prompt_doge("Question du Doge au conseil: ")
    if not topic:
        print(f"{LogColors.FAIL}No topic given (use --topic in non-interactive mode). Exiting.{LogColors.ENDC}")
        sys.exit(1)

    relationships = load_council_relationships(tables, members)

    print(f"{LogColors.OKCYAN}Warming the local model ({args.model})...{LogColors.ENDC}")
    preload_model(args.model)

    create_airtable_message_record(tables, args.nlr, f"Le Doge soumet au conseil: {topic}",
                                   "signoria_discussion_topic")

    transcript: List[Dict] = []
    for round_index in range(args.rounds):
        speakers = members[:args.limit] if args.limit else members
        if args.rounds > 1:
            print(f"\n{LogColors.HEADER}=== Round {round_index + 1}/{args.rounds} ==={LogColors.ENDC}")

        for member in speakers:
            name = display_name_of(member)
            print(f"\n{LogColors.HEADER}--- {name} ({member['username']}) ---{LogColors.ENDC}")

            if not args.auto:
                comment = prompt_doge("Commentaire du Doge (Entrée pour passer): ")
                if comment:
                    transcript.append({"speaker": "Le Doge", "text": comment})
                    create_airtable_message_record(tables, args.nlr, comment, "signoria_discussion_statement")

            if member["username"] == args.nlr:
                statement = None if args.auto else prompt_doge(f"Déclaration de {name} (vous — Entrée pour passer): ")
                if not statement:
                    print(f"{LogColors.WARNING}{name} (le Doge) garde le silence ce tour-ci.{LogColors.ENDC}")
                    continue
            else:
                persona = build_persona_prompt(member, members, relationships, topic)
                turn = build_transcript_prompt(transcript, name)
                try:
                    statement = speak(args.model, persona, turn)
                except (requests.exceptions.RequestException, KeyError) as e:
                    print(f"{LogColors.FAIL}{name}'s mind is clouded (Ollama error: {e}). Skipping speaker.{LogColors.ENDC}")
                    continue

            print(f"{LogColors.BOLD}{name} dit:{LogColors.ENDC}\n{statement}")
            transcript.append({"speaker": name, "text": statement})
            if create_airtable_message_record(tables, member["username"], statement,
                                              "signoria_discussion_statement"):
                print(f"  {LogColors.OKGREEN}Statement recorded in MESSAGES.{LogColors.ENDC}")

    print(f"\n{LogColors.HEADER}--- Council adjourned: {len(transcript)} statements carved into memory ---{LogColors.ENDC}")


if __name__ == "__main__":
    main()
