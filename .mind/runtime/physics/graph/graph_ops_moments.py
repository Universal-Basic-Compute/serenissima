"""
Graph Operations: Moment Lifecycle Methods

Mixin class for moment-related graph operations.
Extracted from graph_ops.py to reduce file size.

Usage:
    This is a mixin class - GraphOps inherits from it.
    All methods expect self._query() to be available.

Docs:
- docs/physics/ALGORITHM_Lifecycle.md — moment state transitions
- docs/physics/ALGORITHM_Transitions.md — how clicks trigger transitions
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class MomentOperationsMixin:
    """
    Mixin providing moment lifecycle operations for GraphOps.

    Methods for handling clicks, weight updates, decay, dormancy,
    and garbage collection of moments in the graph.

    Ref: docs/physics/ALGORITHM_Lifecycle.md
    """

    # =========================================================================
    # CLICK HANDLER (Moment Graph Architecture)
    # =========================================================================

    def handle_click(
        self,
        moment_id: str,
        clicked_word: str,
        player_id: str
    ) -> Dict[str, Any]:
        """
        Handle a player click on a word in a moment.

        This is the core instant-response mechanism. Target: <50ms.
        No LLM calls in this path.

        Args:
            moment_id: The moment containing the clicked word
            clicked_word: The word that was clicked
            player_id: The player character ID

        Returns:
            Dict with:
                - flipped: bool - whether any moments crossed threshold
                - flipped_moments: List of moment dicts that flipped to active
                - weight_updates: List of moments that had weight increased
                - queue_narrator: bool - whether to fall back to narrator

        Mechanism:
            1. Find CAN_LEAD_TO links from moment where clicked_word is in require_words
            2. Apply weight_transfer to target moments
            3. Check for flips (weight > 0.8)
            4. Return flipped moments (or empty + queue_narrator if none flip)
        """
        # Find matching transitions
        cypher_find = """
        MATCH (m:Moment {id: $moment_id})-[r:CAN_LEAD_TO]->(target:Moment)
        WHERE r.trigger = 'player'
          AND r.require_words IS NOT NULL
        RETURN target.id, target.content, target.type, target.status, target.weight,
               r.require_words, r.weight_transfer, r.consumes_origin
        """

        rows = self._query(cypher_find, {"moment_id": moment_id})

        if not rows:
            return {
                "flipped": False,
                "flipped_moments": [],
                "weight_updates": [],
                "queue_narrator": True
            }

        # Check which transitions match the clicked word
        matching_targets = []
        for row in rows:
            target_id, target_content, target_type, target_status, target_weight, \
                require_words, weight_transfer, consumes_origin = row

            # Parse require_words if it's a JSON string
            if isinstance(require_words, str):
                require_words = json.loads(require_words)

            # Check if clicked word matches any require_words
            clicked_lower = clicked_word.lower()
            if any(word.lower() == clicked_lower for word in (require_words or [])):
                matching_targets.append({
                    "id": target_id,
                    "content": target_content,
                    "type": target_type,
                    "status": target_status,
                    "weight": target_weight or 0.5,
                    "weight_transfer": weight_transfer or 0.3,
                    "consumes_origin": consumes_origin if consumes_origin is not None else True
                })

        if not matching_targets:
            return {
                "flipped": False,
                "flipped_moments": [],
                "weight_updates": [],
                "queue_narrator": True
            }

        # Apply weight transfers
        weight_updates = []
        flipped_moments = []

        for target in matching_targets:
            new_weight = target["weight"] + target["weight_transfer"]
            new_weight = min(new_weight, 1.0)  # Cap at 1.0

            # Update the weight
            cypher_update = """
            MATCH (m:Moment {id: $target_id})
            SET m.weight = $new_weight
            """
            self._query(cypher_update, {
                "target_id": target["id"],
                "new_weight": new_weight
            })

            weight_updates.append({
                "id": target["id"],
                "old_weight": target["weight"],
                "new_weight": new_weight
            })

            # Check for flip (threshold: 0.8)
            if new_weight >= 0.8:
                # Flip to active
                current_tick = self._get_current_tick()
                cypher_flip = """
                MATCH (m:Moment {id: $target_id})
                SET m.status = 'active',
                    m.tick_resolved = $tick
                """
                self._query(cypher_flip, {
                    "target_id": target["id"],
                    "tick": current_tick
                })

                flipped_moments.append({
                    "id": target["id"],
                    "content": target["content"],
                    "type": target["type"],
                    "weight": new_weight
                })

                logger.info(f"[GraphOps] Moment flipped: {target['id']} (weight={new_weight})")

        # If consumes_origin and we had flips, mark source as completed
        if flipped_moments and matching_targets[0].get("consumes_origin"):
            current_tick = self._get_current_tick()
            cypher_consume = """
            MATCH (m:Moment {id: $moment_id})
            SET m.status = 'completed',
                m.tick_resolved = $tick
            """
            self._query(cypher_consume, {
                "moment_id": moment_id,
                "tick": current_tick
            })

        return {
            "flipped": len(flipped_moments) > 0,
            "flipped_moments": flipped_moments,
            "weight_updates": weight_updates,
            "queue_narrator": len(flipped_moments) == 0
        }

    def update_moment_weight(
        self,
        moment_id: str,
        weight_delta: float,
        reason: str = "manual"
    ) -> Dict[str, Any]:
        """
        Update a moment's weight by a delta amount.

        Args:
            moment_id: The moment to update
            weight_delta: Amount to add (positive) or subtract (negative)
            reason: Why the update is happening (for logging)

        Returns:
            Dict with old_weight, new_weight, and flipped status
        """
        # Get current weight
        cypher_get = """
        MATCH (m:Moment {id: $moment_id})
        RETURN m.weight, m.status
        """
        rows = self._query(cypher_get, {"moment_id": moment_id})

        if not rows:
            return {"error": f"Moment not found: {moment_id}"}

        old_weight = rows[0][0] or 0.5
        old_status = rows[0][1] or "possible"
        new_weight = max(0.0, min(1.0, old_weight + weight_delta))

        # Update weight
        cypher_update = """
        MATCH (m:Moment {id: $moment_id})
        SET m.weight = $new_weight
        """
        self._query(cypher_update, {
            "moment_id": moment_id,
            "new_weight": new_weight
        })

        # Check for flip
        flipped = False
        if old_status == "possible" and new_weight >= 0.8:
            current_tick = self._get_current_tick()
            cypher_flip = """
            MATCH (m:Moment {id: $moment_id})
            SET m.status = 'active',
                m.tick_resolved = $tick
            """
            self._query(cypher_flip, {
                "moment_id": moment_id,
                "tick": current_tick
            })
            flipped = True
            logger.info(f"[GraphOps] Moment flipped by {reason}: {moment_id}")

        return {
            "moment_id": moment_id,
            "old_weight": old_weight,
            "new_weight": new_weight,
            "flipped": flipped,
            "reason": reason
        }

    def propagate_embedding_energy(
        self,
        moment_id: str,
        base_boost: float = 0.1
    ) -> List[Dict[str, Any]]:
        """
        Propagate energy to semantically similar moments.

        When a moment is activated, nearby moments in embedding space
        also get a small boost. This creates associative conversation flow.

        Args:
            moment_id: The activated moment
            base_boost: Base amount to boost similar moments

        Returns:
            List of moments that received boosts
        """
        import numpy as np

        # Get the moment's embedding
        cypher_get = """
        MATCH (m:Moment {id: $moment_id})
        RETURN m.embedding
        """
        rows = self._query(cypher_get, {"moment_id": moment_id})

        if not rows or not rows[0][0]:
            return []

        source_embedding = rows[0][0]
        if isinstance(source_embedding, str):
            source_embedding = json.loads(source_embedding)

        # Find neighbors with embeddings (via CAN_LEAD_TO links first)
        cypher_neighbors = """
        MATCH (m:Moment {id: $moment_id})-[:CAN_LEAD_TO]-(neighbor:Moment)
        WHERE neighbor.status IN ['possible', "possible"]
          AND neighbor.embedding IS NOT NULL
        RETURN neighbor.id, neighbor.weight, neighbor.embedding
        """
        rows = self._query(cypher_neighbors, {"moment_id": moment_id})

        source_vec = np.array(source_embedding)
        source_norm = np.linalg.norm(source_vec)

        boosted = []
        for row in rows:
            neighbor_id, neighbor_weight, neighbor_embedding = row

            if isinstance(neighbor_embedding, str):
                neighbor_embedding = json.loads(neighbor_embedding)

            neighbor_vec = np.array(neighbor_embedding)
            neighbor_norm = np.linalg.norm(neighbor_vec)

            if source_norm > 0 and neighbor_norm > 0:
                similarity = float(np.dot(source_vec, neighbor_vec) / (source_norm * neighbor_norm))

                if similarity > 0.7:  # Only boost if fairly similar
                    boost = base_boost * similarity
                    new_weight = min(1.0, (neighbor_weight or 0.5) + boost)

                    cypher_boost = """
                    MATCH (m:Moment {id: $neighbor_id})
                    SET m.weight = $new_weight
                    """
                    self._query(cypher_boost, {
                        "neighbor_id": neighbor_id,
                        "new_weight": new_weight
                    })

                    boosted.append({
                        "id": neighbor_id,
                        "similarity": similarity,
                        "boost": boost,
                        "new_weight": new_weight
                    })

        return boosted

    def _get_current_tick(self) -> int:
        """Get the current world tick (placeholder - should come from game state)."""
        # In production, this would query the playthrough state
        # For now, return a timestamp-based value
        return int(datetime.utcnow().timestamp())

    # =========================================================================
    # MOMENT LIFECYCLE METHODS (Phase 5)
    # Ref: docs/physics/ALGORITHM_Lifecycle.md
    # =========================================================================

    def decay_moments(
        self,
        decay_rate: float = 0.99,
        decay_threshold: float = 0.1,
        current_tick: int = None
    ) -> Dict[str, Any]:
        """
        Apply weight decay to possible moments, mark as decayed below threshold.

        Called every world tick (5 minutes). Possible moments gradually lose
        weight. When weight drops below threshold, they become decayed and
        are no longer candidates for activation.

        Args:
            decay_rate: Multiplier per tick (0.99 = 1% decay)
            decay_threshold: Weight below which moment decays (default 0.1)
            current_tick: Current world tick (for tick_resolved)

        Returns:
            Dict with counts: {decayed_count, updated_count}

        Ref: ALGORITHM_Lifecycle.md § Weight Decay
        """
        if current_tick is None:
            current_tick = self._get_current_tick()

        # Apply decay to all possible moments
        decay_cypher = """
        MATCH (m:Moment)
        WHERE m.status = 'possible'
        SET m.weight = m.weight * $decay_rate
        RETURN count(m)
        """
        result = self._query(decay_cypher, {"decay_rate": decay_rate})
        updated_count = result[0][0] if result and result[0] else 0

        # Mark below-threshold moments as decayed
        decayed_cypher = """
        MATCH (m:Moment)
        WHERE m.status = 'possible' AND m.weight < $threshold
        SET m.status = "failed", m.tick_resolved = $tick
        RETURN count(m)
        """
        result = self._query(decayed_cypher, {
            "threshold": decay_threshold,
            "tick": current_tick
        })
        decayed_count = result[0][0] if result and result[0] else 0

        if decayed_count > 0:
            logger.info(f"[GraphOps] Decay: {updated_count} updated, {decayed_count} decayed")

        return {
            "updated_count": updated_count,
            "decayed_count": decayed_count
        }

    def on_player_leaves_location(
        self,
        location_id: str,
        player_id: str = "char_player"
    ) -> Dict[str, Any]:
        """
        Handle moment state when player leaves a location.

        - Persistent moments -> dormant (can reactivate on return)
        - Non-persistent moments -> deleted

        Called when player moves to a new location.

        Args:
            location_id: The place ID being left
            player_id: Player character ID

        Returns:
            Dict with counts: {dormant_count, deleted_count}

        Ref: ALGORITHM_Lifecycle.md § Dormancy
        """
        # Mark persistent moments as dormant
        dormant_cypher = """
        MATCH (m:Moment)-[a:ATTACHED_TO]->(p:Space {id: $location_id})
        WHERE a.persistent = true AND m.status IN ['possible', 'active']
        SET m.status = "possible"
        RETURN count(m)
        """
        result = self._query(dormant_cypher, {"location_id": location_id})
        dormant_count = result[0][0] if result and result[0] else 0

        # Delete non-persistent moments attached to this location
        delete_cypher = """
        MATCH (m:Moment)-[a:ATTACHED_TO]->(p:Space {id: $location_id})
        WHERE a.persistent = false AND m.status IN ['possible', 'active']
        DETACH DELETE m
        RETURN count(m)
        """
        result = self._query(delete_cypher, {"location_id": location_id})
        deleted_count = result[0][0] if result and result[0] else 0

        logger.info(f"[GraphOps] Player left {location_id}: {dormant_count} dormant, {deleted_count} deleted")

        return {
            "dormant_count": dormant_count,
            "deleted_count": deleted_count
        }

    def on_player_arrives_location(
        self,
        location_id: str,
        player_id: str = "char_player"
    ) -> Dict[str, Any]:
        """
        Handle moment reactivation when player arrives at a location.

        Dormant moments attached to this location become possible again.

        Args:
            location_id: The place ID being entered
            player_id: Player character ID

        Returns:
            Dict with counts: {reactivated_count}

        Ref: ALGORITHM_Lifecycle.md § Reactivation
        """
        reactivate_cypher = """
        MATCH (m:Moment)-[a:ATTACHED_TO]->(p:Space {id: $location_id})
        WHERE m.status = "possible"
        SET m.status = 'possible'
        RETURN count(m)
        """
        result = self._query(reactivate_cypher, {"location_id": location_id})
        reactivated_count = result[0][0] if result and result[0] else 0

        if reactivated_count > 0:
            logger.info(f"[GraphOps] Player arrived {location_id}: {reactivated_count} reactivated")

        return {
            "reactivated_count": reactivated_count
        }

    def garbage_collect_moments(
        self,
        current_tick: int,
        retention_ticks: int = 100
    ) -> Dict[str, Any]:
        """
        Remove old decayed moments to prevent graph bloat.

        Called periodically (e.g., every 10 ticks or on game save).

        Args:
            current_tick: Current world tick
            retention_ticks: How long to keep decayed moments (default 100)

        Returns:
            Dict with counts: {deleted_count}

        Ref: ALGORITHM_Lifecycle.md § Garbage Collection
        """
        threshold_tick = current_tick - retention_ticks

        gc_cypher = """
        MATCH (m:Moment)
        WHERE m.status = "failed" AND m.tick_resolved < $threshold
        DETACH DELETE m
        RETURN count(m)
        """
        result = self._query(gc_cypher, {"threshold": threshold_tick})
        deleted_count = result[0][0] if result and result[0] else 0

        if deleted_count > 0:
            logger.info(f"[GraphOps] GC: {deleted_count} old decayed moments removed")

        return {
            "deleted_count": deleted_count
        }

    def boost_moment_weight(
        self,
        moment_id: str,
        boost: float,
        current_tick: int = None
    ) -> Dict[str, Any]:
        """
        Add weight to a moment, checking for flip to active.

        Used for external events that should surface moments
        (e.g., NPC initiates conversation).

        Args:
            moment_id: The moment to boost
            boost: Weight to add (0-1)
            current_tick: Current tick for tick_resolved if flipped

        Returns:
            Dict with {new_weight, flipped, status}

        Ref: ALGORITHM_Transitions.md § External Activation
        """
        if current_tick is None:
            current_tick = self._get_current_tick()

        flip_threshold = 0.8

        # Get current weight
        get_cypher = """
        MATCH (m:Moment {id: $id})
        RETURN m.weight, m.status
        """
        result = self._query(get_cypher, {"id": moment_id})
        if not result or not result[0]:
            return {"error": f"Moment {moment_id} not found"}

        current_weight = result[0][0] or 0.5
        current_status = result[0][1]

        # Calculate new weight (capped at 1.0)
        new_weight = min(1.0, current_weight + boost)
        flipped = False
        new_status = current_status

        # Check for flip
        if current_status == "possible" and new_weight >= flip_threshold:
            flipped = True
            new_status = "active"

        # Update moment
        if flipped:
            update_cypher = """
            MATCH (m:Moment {id: $id})
            SET m.weight = $weight, m.status = 'active', m.tick_resolved = $tick
            """
            self._query(update_cypher, {
                "id": moment_id,
                "weight": new_weight,
                "tick": current_tick
            })
        else:
            update_cypher = """
            MATCH (m:Moment {id: $id})
            SET m.weight = $weight
            """
            self._query(update_cypher, {"id": moment_id, "weight": new_weight})

        logger.info(f"[GraphOps] Boosted {moment_id}: {current_weight:.2f} -> {new_weight:.2f}" +
                    (f" (FLIPPED to active)" if flipped else ""))

        return {
            "new_weight": new_weight,
            "flipped": flipped,
            "status": new_status
        }
