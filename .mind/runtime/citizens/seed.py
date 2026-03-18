"""Seed citizen Actor nodes into the graph for task routing.

Citizens become Actor nodes with type='citizen'. The select_best_agent()
function in task_assignment.py matches tasks to citizens using:
    score = cosine_similarity(task_emb, citizen_emb) * weight * energy * 0.5^active_tasks

Idempotent: MERGE on id, recompute embedding only if synthesis changed.

Respects behavior flag `know_all_citizens` from database_config.yaml:
  - true (default): inject ALL citizens into graph (full directory knowledge)
  - false: skip bulk injection (citizens only know those they meet)
"""

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("mind.citizens.seed")


def _build_citizen_synthesis(citizen: dict) -> str:
    """Build embeddable synthesis string from citizen data."""
    name = citizen.get("display_name", citizen.get("id", ""))
    role = citizen.get("role", "")
    tags = citizen.get("tags", [])
    bio = citizen.get("bio", "")
    home = citizen.get("home_project", "")

    parts = []
    if name:
        parts.append(name)
    if role:
        parts.append(role)
    if tags:
        parts.append(f"Skills: {', '.join(tags[:8])}")
    if home:
        parts.append(f"Home: {home}")
    if bio:
        # First sentence of bio for embedding context
        first_sentence = bio.split(".")[0] + "." if "." in bio else bio[:200]
        parts.append(first_sentence)

    return ". ".join(parts)


def _check_know_all_citizens() -> bool:
    """Check if know_all_citizens behavior is enabled."""
    try:
        import yaml
        config_path = Path(__file__).parent.parent.parent / ".mind" / "database_config.yaml"
        if config_path.exists():
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
            return cfg.get("behaviors", {}).get("know_all_citizens", True)
    except Exception:
        pass
    return True


def seed_citizen_actors(citizen_list: list[dict], adapter: Any) -> int:
    """Ensure all citizens exist as Actor nodes in the graph.

    Respects `know_all_citizens` behavior flag. If false, skips entirely —
    citizens only discover others through interaction, not bulk injection.

    Args:
        citizen_list: List of citizen dicts (from citizens.json or any source).
            Expected keys: id, display_name, role, tags, bio, home_project, autonomy_level
        adapter: Database adapter (FalkorDB or Neo4j)

    Returns:
        Number of citizens seeded/updated.
    """
    if not _check_know_all_citizens():
        logger.info("know_all_citizens: disabled — skipping bulk citizen injection")
        return 0
    from runtime.infrastructure.embeddings import get_embedding

    count = 0
    for citizen in citizen_list:
        handle = citizen.get("id", "").strip()
        if not handle:
            continue

        actor_id = f"CITIZEN_{handle}"
        synthesis = _build_citizen_synthesis(citizen)
        autonomy = citizen.get("autonomy_level", 1)
        weight = 0.5
        energy = max(autonomy / 10.0, 0.1)

        # Check if actor exists and synthesis changed
        existing = adapter.query(
            "MATCH (a:Actor {id: $id}) RETURN a.synthesis",
            {"id": actor_id},
        )

        needs_embedding = True
        if existing and existing[0] and existing[0][0] == synthesis:
            needs_embedding = False

        # Compute embedding only if synthesis changed
        embedding = None
        if needs_embedding:
            embedding = get_embedding(synthesis)

        # MERGE actor node
        if embedding:
            adapter.execute(
                """
                MERGE (a:Actor {id: $id})
                SET a.type = 'citizen',
                    a.node_type = 'actor',
                    a.synthesis = $synthesis,
                    a.weight = $weight,
                    a.energy = $energy,
                    a.embedding = $embedding,
                    a.status = 'idle'
                """,
                {
                    "id": actor_id,
                    "synthesis": synthesis,
                    "weight": weight,
                    "energy": energy,
                    "embedding": embedding,
                },
            )
        else:
            # No embedding change needed — just ensure node exists with current properties
            adapter.execute(
                """
                MERGE (a:Actor {id: $id})
                ON CREATE SET a.type = 'citizen',
                              a.node_type = 'actor',
                              a.synthesis = $synthesis,
                              a.weight = $weight,
                              a.energy = $energy,
                              a.status = 'idle'
                """,
                {
                    "id": actor_id,
                    "synthesis": synthesis,
                    "weight": weight,
                    "energy": energy,
                },
            )

        count += 1

    if count > 0:
        logger.info(f"Seeded {count} citizen actors into graph")

    return count
