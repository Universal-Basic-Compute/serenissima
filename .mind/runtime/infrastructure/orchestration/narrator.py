"""
Narrator Service

Calls agent CLI to generate scenes.
Uses --continue for persistent session across playthrough.

DOCS: docs/agents/narrator/
"""

import json
import logging
import subprocess
from typing import Dict, Any, Optional
from pathlib import Path

from .agent_cli import extract_claude_text, parse_claude_json_output, run_agent

logger = logging.getLogger(__name__)


class NarratorService:
    """
    Service for calling the Narrator agent via agent CLI.
    Runs from agents/narrator/ directory where CLAUDE.md is located.
    """

    def __init__(
        self,
        working_dir: str = None,
        timeout: int = 600  # 10 minutes for complex scene generation
    ):
        # Default to agents/narrator relative to project root
        if working_dir:
            self.working_dir = working_dir
        else:
            # Find project root (parent of engine/)
            # narrator.py -> orchestration -> infrastructure -> engine -> mind
            project_root = Path(__file__).parent.parent.parent.parent
            self.working_dir = str(project_root / "agents" / "narrator")

        self.timeout = timeout
        self.session_started = False

        logger.info(f"[NarratorService] Initialized, working_dir={self.working_dir}")

    def generate(
        self,
        scene_context: Dict[str, Any],
        world_injection: Dict[str, Any] = None,
        instruction: str = None
    ) -> Dict[str, Any]:
        """
        Generate a scene using the Narrator.

        Args:
            scene_context: Current scene context (location, characters, narratives)
            world_injection: Optional injection from World Runner
            instruction: Optional specific instruction

        Returns:
            NarratorOutput dict with scene, time_elapsed, mutations, seeds
        """
        # Build prompt
        prompt = self._build_prompt(scene_context, world_injection, instruction)

        # Call agent CLI
        result = self._call_claude(prompt)

        return result

    def _build_prompt(
        self,
        scene_context: Dict[str, Any],
        world_injection: Dict[str, Any] = None,
        instruction: str = None
    ) -> str:
        """Build the narrator prompt."""
        import yaml

        parts = [
            "NARRATOR INSTRUCTION",
            "=" * 20,
            "",
            "SCENE_CONTEXT:",
            yaml.dump(scene_context, default_flow_style=False),
        ]

        if world_injection:
            parts.extend([
                "",
                "WORLD_INJECTION:",
                yaml.dump(world_injection, default_flow_style=False),
            ])

        if instruction:
            parts.extend([
                "",
                "GENERATION_INSTRUCTION:",
                instruction,
            ])
        else:
            parts.extend([
                "",
                "GENERATION_INSTRUCTION:",
                "Generate a scene for this moment.",
                "Include narration, speech (if appropriate), voices, and clickables.",
                "Estimate time_elapsed for this scene.",
            ])

        parts.extend([
            "",
            "Output JSON matching NarratorOutput schema.",
            "Include time_elapsed estimate.",
        ])

        return "\n".join(parts)

    def _call_claude(self, prompt: str) -> Dict[str, Any]:
        """Call agent CLI and parse response."""
        logger.info(f"[NarratorService] Calling agent CLI from {self.working_dir}")

        try:
            result = run_agent(
                prompt,
                working_dir=self.working_dir,
                timeout=self.timeout,
                continue_session=self.session_started,
                output_format="json",
                add_dir="../..",
            )
            self.session_started = True

            if result.returncode != 0:
                logger.error(f"[NarratorService] Agent CLI failed: {result.stderr}")
                return self._fallback_response()

            response_text = result.stdout.strip()
            logger.info(f"[NarratorService] Raw response length: {len(response_text)}")
            logger.info(f"[NarratorService] Raw response preview: {response_text[:300]}...")

            try:
                parsed = parse_claude_json_output(response_text)
                logger.info(f"[NarratorService] Parsed type: {type(parsed).__name__}, keys: {list(parsed.keys()) if isinstance(parsed, dict) else 'N/A'}")
            except json.JSONDecodeError as e:
                logger.error(f"[NarratorService] Failed to parse response: {e}")
                logger.error(f"[NarratorService] Response was: {response_text[:500]}")
                return self._fallback_response()

            if isinstance(parsed, dict):
                return parsed
            if isinstance(parsed, str):
                try:
                    return json.loads(extract_claude_text(parsed))
                except json.JSONDecodeError as e:
                    logger.error(f"[NarratorService] Failed to parse JSON result: {e}")
                    return self._fallback_response()
            return self._fallback_response()

        except subprocess.TimeoutExpired:
            logger.error("[NarratorService] Agent CLI timed out")
            return self._fallback_response()
        except FileNotFoundError:
            logger.error("[NarratorService] Agent CLI not found")
            return self._fallback_response()
        except Exception as e:
            logger.error(f"[NarratorService] Unexpected error: {e}")
            return self._fallback_response()

    def _fallback_response(self) -> Dict[str, Any]:
        """Return a minimal fallback response using SceneTree schema."""
        return {
            "scene": {
                "id": "scene_fallback",
                "location": {
                    "place": "place_unknown",
                    "name": "Unknown",
                    "region": "Somewhere in England",
                    "time": "unknown"
                },
                "present": [],
                "atmosphere": ["The fire has burned low.", "Cold seeps through your cloak."],
                "narration": [
                    {
                        "text": "The moment stretches in silence.",
                        "clickable": {}
                    }
                ],
                "voices": [],
                "freeInput": {
                    "enabled": True,
                    "handler": "narrator",
                    "context": []
                }
            },
            "time_elapsed": "1 minute",
            "mutations": [],
            "seeds": []
        }

    def reset_session(self):
        """Reset the narrator session (for new playthrough)."""
        self.session_started = False
        logger.info("[NarratorService] Session reset")
