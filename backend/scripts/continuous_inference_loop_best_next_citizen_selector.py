#!/usr/bin/env python3
"""
continuous_inference_loop_best_next_citizen_selector.py

Continuous inference worker. Each iteration selects the BEST next inference to
perform, executes it through the materialized queue (INFERENCE_REQUESTS), and
loops.

Best-next selection score, per citizen:
- Never served since the queue exists:  class_weight * (1 + past_failed_count)
  -> the historically most starved, highest-class citizens come first
- Already served:                       class_weight * hours_since_last_thought
  -> then the loop rotates by staleness, weighted by social class

Social class weights mirror backend/ais/thinkingLoop.py (Ambasciatore 7x ... Facchini 1x).

Inference is executed by feed_citizen() from
feed_starved_citizens_thoughts_via_claude_cli.py: request materialized in
INFERENCE_REQUESTS (system prompt + prompt), thought generated (Ollama by
default), persisted as a self-message, silent Windows toast shown.

Usage:
  python continuous_inference_loop_best_next_citizen_selector.py
      [--interval 90] [--engine ollama] [--model qwen3:4b] [--once]
"""

import os
import sys
import time
import argparse
import traceback
from collections import Counter
from datetime import datetime, timezone

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_ROOT, '.env'))

from backend.engine.utils.activity_helpers import get_tables, LogColors
from feed_starved_citizens_thoughts_via_claude_cli import feed_citizen

# Mirrors thinkingLoop.py weighting
SOCIAL_CLASS_WEIGHTS = {
    'Ambasciatore': 7,
    'Innovatori': 6,
    'Scientisti': 5,
    'Artisti': 5,
    'Clero': 4,
    'Nobili': 4,
    'Forestieri': 3,
    'Cittadini': 3,
    'Popolani': 2,
    'Facchini': 1
}


def load_historical_starvation(tables):
    """Failed-process count per citizen: how long each one went unfed under KinOS."""
    failed = tables['processes'].all(formula="{Status}='failed'", fields=['Citizen'])
    return Counter(r['fields'].get('Citizen', '?') for r in failed)


def load_citizens(tables):
    return {
        r['fields'].get('Username'): r['fields'].get('SocialClass', 'Unknown')
        for r in tables['citizens'].all(fields=['Username', 'SocialClass'])
        if r['fields'].get('Username')
    }


def load_last_served(tables):
    """Most recent completed inference per citizen, from the materialized queue."""
    last = {}
    records = tables['inference_requests'].all(
        formula="{Status}='completed'", fields=['Citizen', 'CompletedAt']
    )
    for r in records:
        citizen = r['fields'].get('Citizen')
        completed_at = r['fields'].get('CompletedAt')
        if citizen and completed_at and completed_at > last.get(citizen, ''):
            last[citizen] = completed_at
    return last


def select_best_next_citizen(citizens, starvation, last_served):
    """Returns (username, score, reason) for the best next inference."""
    now = datetime.now(timezone.utc)
    best = None
    for username, social_class in citizens.items():
        weight = SOCIAL_CLASS_WEIGHTS.get(social_class, 1)
        served_at = last_served.get(username)
        if not served_at:
            score = weight * (1 + starvation.get(username, 0))
            reason = f"never served, {starvation.get(username, 0)} past failures, class {social_class}"
        else:
            try:
                dt = datetime.fromisoformat(served_at.replace('Z', '+00:00'))
                hours_since = max((now - dt).total_seconds() / 3600.0, 0.0)
            except ValueError:
                hours_since = 0.0
            score = weight * hours_since
            reason = f"last thought {hours_since:.1f}h ago, class {social_class}"
        if best is None or score > best[1]:
            best = (username, score, reason)
    return best


def main():
    parser = argparse.ArgumentParser(description="Continuous best-next-inference worker")
    parser.add_argument("--interval", type=int, default=90, help="Seconds between inferences")
    parser.add_argument("--engine", default="ollama", choices=["ollama", "claude-cli"])
    parser.add_argument("--model", default="qwen3:4b")
    parser.add_argument("--timeout", type=int, default=300, help="Per-inference timeout in seconds")
    parser.add_argument("--once", action="store_true", help="Run a single iteration then exit")
    args = parser.parse_args()

    print(f"Continuous inference loop starting (engine={args.engine}, model={args.model}, interval={args.interval}s)")

    tables = get_tables()
    print("Loading historical starvation from PROCESSES (one-time)...")
    starvation = load_historical_starvation(tables)
    citizens = load_citizens(tables)
    print(f"{len(citizens)} citizens known, {len(starvation)} with past failures.\n")

    iteration = 0
    while True:
        iteration += 1
        try:
            last_served = load_last_served(tables)
            best = select_best_next_citizen(citizens, starvation, last_served)
            if not best:
                print(f"{LogColors.WARNING}No citizen to select - sleeping{LogColors.ENDC}")
                time.sleep(args.interval)
                continue

            username, score, reason = best
            print(f"[{iteration}] {datetime.now().strftime('%H:%M:%S')} best next inference: "
                  f"{username} (score {score:.1f}: {reason})")
            feed_citizen(tables, username, args.engine, args.model, args.timeout)

        except KeyboardInterrupt:
            print("\nContinuous inference loop stopped by user.")
            break
        except Exception as e:
            print(f"{LogColors.FAIL}Iteration {iteration} error: {e}{LogColors.ENDC}")
            traceback.print_exc()

        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
