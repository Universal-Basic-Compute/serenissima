"""
Graph Operations: Apply Method and Helpers

Mixin class for the apply() method and its extraction helpers.
Extracted from graph_ops.py to reduce file size.

Usage:
    This is a mixin class - GraphOps inherits from it.
    All methods expect self._query() and add_* methods to be available.

Docs:
- docs/engine/GRAPH_OPERATIONS_GUIDE.md — mutation file format
- docs/physics/ALGORITHM_Transitions.md — how mutations should behave
"""

import json
import yaml
import logging
from pathlib import Path
from typing import Dict, Any, List, Set

from runtime.infrastructure.embeddings.service import get_embedding_service

logger = logging.getLogger(__name__)


class ApplyOperationsMixin:
    """
    Mixin providing the apply() method and extraction helpers for GraphOps.

    This mixin handles:
    - Loading and applying mutation files (YAML/JSON)
    - Extracting arguments from mutation dicts
    - Validating links and detecting orphaned nodes
    - Applying updates to nodes

    Ref: docs/engine/GRAPH_OPERATIONS_GUIDE.md
    """

    # =========================================================================
    # EMBEDDING GENERATION
    # =========================================================================

    def _generate_node_embedding(self, node: Dict) -> List[float]:
        """
        Generate embedding for a node from name + description.
        """
        parts = []

        # Name/title
        name = node.get('name') or node.get('id', '')
        if name:
            parts.append(name)

        # Description (try common fields)
        for field in ['description', 'content', 'text']:
            if node.get(field):
                parts.append(node[field])
                break

        text = '. '.join(p for p in parts if p)
        if not text:
            return None

        embed_service = get_embedding_service()
        return embed_service.embed(text)

    def _get_node_name(self, node_id: str) -> str:
        """Get node name from graph, fallback to id."""
        try:
            cypher = f"MATCH (n {{id: '{node_id}'}}) RETURN n.name"
            rows = self._query(cypher)
            if rows and rows[0] and rows[0][0]:
                return rows[0][0]
        except:
            pass
        return node_id

    def _generate_link_embedding(self, from_id: str, link_type: str, to_id: str, notes: str = None) -> List[float]:
        """
        Generate embedding for a link: source_name + link_type + target_name + notes.
        """
        from_name = self._get_node_name(from_id)
        to_name = self._get_node_name(to_id)

        parts = [from_name, link_type.upper(), to_name]
        if notes:
            parts.append(notes)

        text = ' '.join(parts)
        embed_service = get_embedding_service()
        return embed_service.embed(text)

    def _set_link_embedding(self, from_id: str, to_id: str, rel_type: str, embedding: List[float]):
        """Store embedding on a relationship."""
        if not embedding:
            return
        embedding_json = json.dumps(embedding)
        cypher = f"""
        MATCH (a {{id: '{from_id}'}})-[r:{rel_type}]->(b {{id: '{to_id}'}})
        SET r.embedding = '{embedding_json}'
        """
        try:
            self._query(cypher)
        except Exception as e:
            logger.warning(f"Failed to set link embedding: {e}")

    # =========================================================================
    # APPLY METHOD (Main API)
    # =========================================================================

    def apply(self, path: str = None, data: Dict = None, playthrough: str = "default"):
        """
        Apply mutations from a YAML/JSON file or dict.

        Args:
            path: Path to mutation file (YAML or JSON)
            data: Dict with mutations (alternative to file)
            playthrough: Playthrough folder name (for image generation)

        Returns:
            ApplyResult with persisted, rejected, and errors

        File format:
            nodes:
              - type: character
                id: char_aldric
                name: Aldric
                image_prompt: "A cinematic portrait of..."
                ...
            links:
              - type: belief
                character: char_aldric
                narrative: narr_oath
                ...
            updates:
              - node: char_aldric
                modifier_add: {...}
            movements:
              - character: char_edmund
                to: place_castle
        """
        # Import here to avoid circular imports
        from runtime.physics.graph.graph_ops_types import ApplyResult, WriteError
        from runtime.physics.graph.graph_ops_events import emit_event as _emit_event

        self._current_playthrough = playthrough  # Store for use in add_* methods
        result = ApplyResult()

        # Load data
        if path:
            try:
                file_path = Path(path)
                if not file_path.exists():
                    raise WriteError(
                        f"File not found: {path}",
                        f"Create the file at: {file_path.absolute()}"
                    )

                with open(file_path) as f:
                    if path.endswith('.yaml') or path.endswith('.yml'):
                        data = yaml.safe_load(f)
                    else:
                        data = json.load(f)
            except yaml.YAMLError as e:
                raise WriteError(
                    f"Invalid YAML: {e}",
                    "Check your YAML syntax. Common issues:\n"
                    "- Missing colons after keys\n"
                    "- Inconsistent indentation\n"
                    "- Unquoted special characters"
                )
            except json.JSONDecodeError as e:
                raise WriteError(
                    f"Invalid JSON: {e}",
                    "Check your JSON syntax. Common issues:\n"
                    "- Missing commas between items\n"
                    "- Trailing commas\n"
                    "- Unquoted keys"
                )

        if not data:
            raise WriteError(
                "No data provided",
                "Either provide a path to a mutation file:\n"
                "  write.apply(path='mutations/scene.yaml')\n\n"
                "Or provide data directly:\n"
                "  write.apply(data={'nodes': [...], 'links': [...]})"
            )

        # Emit apply_start event
        _emit_event("apply_start", {
            "source": path or "direct",
            "node_count": len(data.get('nodes', [])),
            "link_count": len(data.get('links', [])),
            "update_count": len(data.get('updates', [])),
            "movement_count": len(data.get('movements', [])),
            "event_summary": data.get('event', {}).get('summary', '')
        })

        # Get existing node IDs for connectivity check
        existing_ids = self._get_existing_node_ids()
        new_node_ids: Set[str] = set()
        linked_ids: Set[str] = set()

        # 1. Process nodes
        for node in data.get('nodes', []):
            node_type = node.get('type')
            node_id = node.get('id')

            if not node_type or not node_id:
                result.errors.append({
                    'item': str(node),
                    'message': 'Node missing type or id',
                    'fix': 'Every node needs: type (character/place/thing/narrative/moment) and id'
                })
                result.rejected.append(str(node))
                continue

            # Auto-generate embedding from title + description
            embedding = self._generate_node_embedding(node)

            # Check for duplicates using embedding
            if embedding:
                label = node_type.capitalize()
                similar = self.check_duplicate(label, embedding)
                if similar:
                    result.duplicates.append({
                        'new_node': node_id,
                        'new_name': node.get('name', node_id),
                        'similar_to': similar.id,
                        'similar_name': similar.name,
                        'similarity': similar.similarity,
                        'action': 'skipped',
                        'fix': f"Update existing node '{similar.id}' or use force=True to create anyway"
                    })
                    result.rejected.append(node_id)
                    continue

            # Store embedding on node for extraction helpers
            node['_embedding'] = embedding

            new_node_ids.add(node_id)

            try:
                if node_type == 'character':
                    self.add_character(**self._extract_character_args(node))
                elif node_type == 'place':
                    self.add_place(**self._extract_place_args(node))
                elif node_type == 'thing':
                    self.add_thing(**self._extract_thing_args(node))
                elif node_type == 'narrative':
                    self.add_narrative(**self._extract_narrative_args(node))
                elif node_type == 'moment':
                    self.add_moment(**self._extract_moment_args(node))
                else:
                    result.errors.append({
                        'item': node_id,
                        'message': f'Invalid node type: {node_type}',
                        'fix': 'Valid types: character, place, thing, narrative, moment'
                    })
                    result.rejected.append(node_id)
                    continue

                result.persisted.append(node_id)

                # Emit node_created event with ALL fields
                _emit_event("node_created", node)

            except WriteError as e:
                result.errors.append({
                    'item': node_id,
                    'message': e.message,
                    'fix': e.fix
                })
                result.rejected.append(node_id)

                # Emit error event
                _emit_event("node_error", {
                    "id": node_id,
                    "type": node_type,
                    "error": e.message
                })

        # 2. Process links
        for link in data.get('links', []):
            link_type = link.get('type')
            link_id = self._link_id(link)

            try:
                if link_type == 'belief':
                    char_id = link.get('character')
                    narr_id = link.get('narrative')
                    self._validate_link_targets(char_id, narr_id, existing_ids, new_node_ids)
                    linked_ids.add(char_id)
                    linked_ids.add(narr_id)
                    self.add_belief(**self._extract_belief_args(link))
                    # Embed link
                    emb = self._generate_link_embedding(char_id, 'BELIEVES', narr_id, link.get('notes'))
                    self._set_link_embedding(char_id, narr_id, 'BELIEVES', emb)

                elif link_type == 'present':
                    char_id = link.get('from')
                    place_id = link.get('to')
                    self._validate_link_targets(char_id, place_id, existing_ids, new_node_ids)
                    linked_ids.add(char_id)
                    linked_ids.add(place_id)
                    self.add_presence(**self._extract_presence_args(link))
                    emb = self._generate_link_embedding(char_id, 'AT', place_id, link.get('notes'))
                    self._set_link_embedding(char_id, place_id, 'AT', emb)

                elif link_type in ('carries', 'carries_hidden'):
                    char_id = link.get('from')
                    thing_id = link.get('to')
                    self._validate_link_targets(char_id, thing_id, existing_ids, new_node_ids)
                    linked_ids.add(char_id)
                    linked_ids.add(thing_id)
                    self.add_possession(**self._extract_possession_args(link))
                    emb = self._generate_link_embedding(char_id, 'CARRIES', thing_id, link.get('notes'))
                    self._set_link_embedding(char_id, thing_id, 'CARRIES', emb)

                elif link_type == 'geography':
                    from_id = link.get('from')
                    to_id = link.get('to')
                    self._validate_link_targets(from_id, to_id, existing_ids, new_node_ids)
                    linked_ids.add(from_id)
                    linked_ids.add(to_id)
                    self.add_geography(**self._extract_geography_args(link))
                    emb = self._generate_link_embedding(from_id, 'CONNECTS', to_id, link.get('notes'))
                    self._set_link_embedding(from_id, to_id, 'CONNECTS', emb)

                elif link_type == 'narrative_link':
                    from_id = link.get('from')
                    to_id = link.get('to')
                    self._validate_link_targets(from_id, to_id, existing_ids, new_node_ids)
                    linked_ids.add(from_id)
                    linked_ids.add(to_id)
                    self.add_narrative_link(**self._extract_narrative_link_args(link))
                    emb = self._generate_link_embedding(from_id, 'RELATES_TO', to_id, link.get('notes'))
                    self._set_link_embedding(from_id, to_id, 'RELATES_TO', emb)

                elif link_type == 'located':
                    thing_id = link.get('from')
                    place_id = link.get('to')
                    self._validate_link_targets(thing_id, place_id, existing_ids, new_node_ids)
                    linked_ids.add(thing_id)
                    linked_ids.add(place_id)
                    self.add_thing_location(**self._extract_thing_location_args(link))
                    emb = self._generate_link_embedding(thing_id, 'LOCATED_AT', place_id, link.get('notes'))
                    self._set_link_embedding(thing_id, place_id, 'LOCATED_AT', emb)

                elif link_type == 'said':
                    char_id = link.get('character')
                    moment_id = link.get('moment')
                    self._validate_link_targets(char_id, moment_id, existing_ids, new_node_ids)
                    linked_ids.add(char_id)
                    linked_ids.add(moment_id)
                    self.add_said(char_id, moment_id)
                    emb = self._generate_link_embedding(char_id, 'SAID', moment_id, link.get('notes'))
                    self._set_link_embedding(char_id, moment_id, 'SAID', emb)

                elif link_type == 'moment_at':
                    moment_id = link.get('moment')
                    place_id = link.get('place')
                    self._validate_link_targets(moment_id, place_id, existing_ids, new_node_ids)
                    linked_ids.add(moment_id)
                    linked_ids.add(place_id)
                    self.add_moment_at(moment_id, place_id)
                    emb = self._generate_link_embedding(moment_id, 'AT', place_id, link.get('notes'))
                    self._set_link_embedding(moment_id, place_id, 'AT', emb)

                elif link_type == 'moment_then':
                    from_id = link.get('from')
                    to_id = link.get('to')
                    self._validate_link_targets(from_id, to_id, existing_ids, new_node_ids)
                    linked_ids.add(from_id)
                    linked_ids.add(to_id)
                    self.add_moment_then(from_id, to_id)
                    emb = self._generate_link_embedding(from_id, 'THEN', to_id, link.get('notes'))
                    self._set_link_embedding(from_id, to_id, 'THEN', emb)

                elif link_type == 'narrative_from':
                    narr_id = link.get('narrative')
                    moment_id = link.get('moment')
                    self._validate_link_targets(narr_id, moment_id, existing_ids, new_node_ids)
                    linked_ids.add(narr_id)
                    linked_ids.add(moment_id)
                    self.add_narrative_from_moment(narr_id, moment_id)
                    emb = self._generate_link_embedding(narr_id, 'FROM', moment_id, link.get('notes'))
                    self._set_link_embedding(narr_id, moment_id, 'FROM', emb)

                elif link_type == 'can_speak':
                    char_id = link.get('character')
                    moment_id = link.get('moment')
                    self._validate_link_targets(char_id, moment_id, existing_ids, new_node_ids)
                    linked_ids.add(char_id)
                    linked_ids.add(moment_id)
                    self.add_can_speak(
                        char_id,
                        moment_id,
                        weight=link.get('weight', 1.0)
                    )
                    emb = self._generate_link_embedding(char_id, 'CAN_SPEAK', moment_id, link.get('notes'))
                    self._set_link_embedding(char_id, moment_id, 'CAN_SPEAK', emb)

                elif link_type == 'attached_to':
                    moment_id = link.get('moment')
                    target_id = link.get('target')
                    self._validate_link_targets(moment_id, target_id, existing_ids, new_node_ids)
                    linked_ids.add(moment_id)
                    linked_ids.add(target_id)
                    self.add_attached_to(
                        moment_id,
                        target_id,
                        presence_required=link.get('presence_required', False),
                        persistent=link.get('persistent', True),
                        dies_with_target=link.get('dies_with_target', False)
                    )
                    emb = self._generate_link_embedding(moment_id, 'ATTACHED_TO', target_id, link.get('notes'))
                    self._set_link_embedding(moment_id, target_id, 'ATTACHED_TO', emb)

                elif link_type == 'can_lead_to':
                    from_id = link.get('from')
                    to_id = link.get('to')
                    self._validate_link_targets(from_id, to_id, existing_ids, new_node_ids)
                    linked_ids.add(from_id)
                    linked_ids.add(to_id)
                    self.add_can_lead_to(
                        from_id,
                        to_id,
                        trigger=link.get('trigger', 'player'),
                        weight_transfer=link.get('weight_transfer', 0.3),
                        require_words=link.get('require_words'),
                        bidirectional=link.get('bidirectional', False),
                        wait_ticks=link.get('wait_ticks'),
                        consumes_origin=link.get('consumes_origin', True)
                    )
                    emb = self._generate_link_embedding(from_id, 'CAN_LEAD_TO', to_id, link.get('notes'))
                    self._set_link_embedding(from_id, to_id, 'CAN_LEAD_TO', emb)

                elif link_type == 'contains':
                    parent_id = link.get('from') or link.get('parent')
                    child_id = link.get('to') or link.get('child')
                    self._validate_link_targets(parent_id, child_id, existing_ids, new_node_ids)
                    linked_ids.add(parent_id)
                    linked_ids.add(child_id)
                    self.add_contains(parent_id, child_id)
                    emb = self._generate_link_embedding(parent_id, 'CONTAINS', child_id, link.get('notes'))
                    self._set_link_embedding(parent_id, child_id, 'CONTAINS', emb)

                elif link_type == 'about':
                    moment_id = link.get('from') or link.get('moment')
                    target_id = link.get('to') or link.get('target')
                    self._validate_link_targets(moment_id, target_id, existing_ids, new_node_ids)
                    linked_ids.add(moment_id)
                    linked_ids.add(target_id)
                    self.add_about(
                        moment_id,
                        target_id,
                        weight=link.get('weight', 0.5)
                    )
                    emb = self._generate_link_embedding(moment_id, 'ABOUT', target_id, link.get('notes'))
                    self._set_link_embedding(moment_id, target_id, 'ABOUT', emb)

                else:
                    result.errors.append({
                        'item': link_id,
                        'message': f'Invalid link type: {link_type}',
                        'fix': 'Valid types: belief, present, carries, carries_hidden, located, geography, narrative_link, said, moment_at, moment_then, narrative_from, can_speak, attached_to, can_lead_to, contains, about'
                    })
                    result.rejected.append(link_id)
                    continue

                result.persisted.append(link_id)

                # Emit link_created event with ALL fields
                _emit_event("link_created", {**link, "_link_id": link_id})

            except WriteError as e:
                result.errors.append({
                    'item': link_id,
                    'message': e.message,
                    'fix': e.fix
                })
                result.rejected.append(link_id)

                # Emit error event
                _emit_event("link_error", {
                    "id": link_id,
                    "type": link_type,
                    "error": e.message
                })

        # 3. Check for orphaned new nodes
        orphaned = new_node_ids - linked_ids - existing_ids
        for node_id in orphaned:
            # Check if it links to existing nodes (not captured above)
            if not self._node_has_links(node_id):
                result.errors.append({
                    'item': node_id,
                    'message': f'{node_id} has no links (orphaned)',
                    'fix': 'Add at least one link connecting this node to the graph'
                })

        # 4. Process updates
        for update in data.get('updates', []):
            try:
                if 'node' in update:
                    self._apply_node_update(update)
                    result.persisted.append(f"update:{update.get('node')}")
            except WriteError as e:
                result.errors.append({
                    'item': str(update),
                    'message': e.message,
                    'fix': e.fix
                })

        # 5. Process movements
        for move in data.get('movements', []):
            try:
                char_id = move.get('character')
                to_place = move.get('to')
                visible = move.get('visible', True)
                self.move_character(char_id, to_place, 1.0 if visible else 0.0)
                result.persisted.append(f"move:{char_id}->{to_place}")

                # Emit movement event with ALL fields
                _emit_event("movement", move)

            except WriteError as e:
                result.errors.append({
                    'item': f"move:{move.get('character')}",
                    'message': e.message,
                    'fix': e.fix
                })

        # Emit apply_complete event
        _emit_event("apply_complete", {
            "source": path or "direct",
            "persisted_count": len(result.persisted),
            "rejected_count": len(result.rejected),
            "error_count": len(result.errors),
            "duplicate_count": len(result.duplicates),
            "success": result.success
        })

        logger.info(f"[GraphOps] Applied: {len(result.persisted)} persisted, {len(result.rejected)} rejected")
        return result

    # =========================================================================
    # APPLY HELPERS
    # =========================================================================

    def _get_existing_node_ids(self) -> Set[str]:
        """Get all existing node IDs in the graph."""
        try:
            cypher = """
            MATCH (n)
            WHERE n.id IS NOT NULL
            RETURN n.id
            """
            rows = self._query(cypher)
            return {row[0] for row in rows if rows}
        except:
            return set()

    def _node_has_links(self, node_id: str) -> bool:
        """Check if a node has any links."""
        cypher = f"""
        MATCH (n {{id: '{node_id}'}})-[r]-()
        RETURN count(r) > 0
        """
        try:
            rows = self._query(cypher)
            return rows and rows[0][0]
        except:
            return False

    def _validate_link_targets(self, id1: str, id2: str, existing: Set[str], new: Set[str]):
        """Validate that link targets exist."""
        from runtime.physics.graph.graph_ops_types import WriteError

        all_ids = existing | new
        if id1 and id1 not in all_ids:
            raise WriteError(
                f"Link references non-existent node: {id1}",
                f"Create the node first, or check the ID spelling.\n"
                f"Existing nodes: {', '.join(sorted(existing)[:10])}..."
            )
        if id2 and id2 not in all_ids:
            raise WriteError(
                f"Link references non-existent node: {id2}",
                f"Create the node first, or check the ID spelling.\n"
                f"Existing nodes: {', '.join(sorted(existing)[:10])}..."
            )

    def _link_id(self, link: Dict) -> str:
        """Generate a readable ID for a link."""
        link_type = link.get('type', 'unknown')
        if link_type == 'belief':
            return f"belief:{link.get('character')}->{link.get('narrative')}"
        elif link_type == 'present':
            return f"present:{link.get('from')}@{link.get('to')}"
        elif link_type in ('carries', 'carries_hidden'):
            return f"{link_type}:{link.get('from')}->{link.get('to')}"
        elif link_type == 'located':
            return f"located:{link.get('from')}@{link.get('to')}"
        elif link_type == 'geography':
            return f"geography:{link.get('from')}->{link.get('to')}"
        elif link_type == 'narrative_link':
            return f"narr_link:{link.get('from')}->{link.get('to')}"
        elif link_type == 'can_speak':
            return f"can_speak:{link.get('character')}->{link.get('moment')}"
        elif link_type == 'attached_to':
            return f"attached:{link.get('moment')}->{link.get('target')}"
        elif link_type == 'can_lead_to':
            return f"can_lead:{link.get('from')}->{link.get('to')}"
        elif link_type == 'contains':
            return f"contains:{link.get('from') or link.get('parent')}->{link.get('to') or link.get('child')}"
        elif link_type == 'about':
            return f"about:{link.get('from') or link.get('moment')}->{link.get('to') or link.get('target')}"
        else:
            return f"link:{link_type}"

    # =========================================================================
    # EXTRACTION HELPERS
    # =========================================================================

    def _extract_character_args(self, node: Dict) -> Dict:
        return {
            'id': node['id'],
            'name': node.get('name', node['id']),
            'type': node.get('character_type', 'minor'),
            'alive': node.get('alive', True),
            'face': node.get('face'),
            'skills': node.get('skills'),
            'voice_tone': node.get('voice_tone') or node.get('voice', {}).get('tone'),
            'voice_style': node.get('voice_style') or node.get('voice', {}).get('style'),
            'approach': node.get('approach') or node.get('personality', {}).get('approach'),
            'values': node.get('values') or node.get('personality', {}).get('values'),
            'flaw': node.get('flaw') or node.get('personality', {}).get('flaw'),
            'backstory_family': node.get('backstory_family') or node.get('backstory', {}).get('family'),
            'backstory_wound': node.get('backstory_wound') or node.get('backstory', {}).get('wound'),
            'backstory_why_here': node.get('backstory_why_here') or node.get('backstory', {}).get('why_here'),
            'image_prompt': node.get('image_prompt'),
            'embedding': node.get('_embedding'),
        }

    def _extract_place_args(self, node: Dict) -> Dict:
        return {
            'id': node['id'],
            'name': node.get('name', node['id']),
            'type': node.get('place_type', 'village'),
            'mood': node.get('mood') or node.get('atmosphere', {}).get('mood'),
            'weather': node.get('weather') or node.get('atmosphere', {}).get('weather'),
            'details': node.get('details') or node.get('atmosphere', {}).get('details'),
            'image_prompt': node.get('image_prompt'),
            'embedding': node.get('_embedding'),
        }

    def _extract_thing_args(self, node: Dict) -> Dict:
        return {
            'id': node['id'],
            'name': node.get('name', node['id']),
            'type': node.get('thing_type', 'tool'),
            'portable': node.get('portable', True),
            'significance': node.get('significance', 'mundane'),
            'description': node.get('description'),
            'quantity': node.get('quantity', 1),
            'image_prompt': node.get('image_prompt'),
            'embedding': node.get('_embedding'),
        }

    def _extract_narrative_args(self, node: Dict) -> Dict:
        about = node.get('about', {})
        return {
            'id': node['id'],
            'name': node.get('name', node['id']),
            'content': node.get('content', ''),
            'type': node.get('narrative_type', node.get('type', 'memory')),
            'interpretation': node.get('interpretation'),
            'about_characters': about.get('characters') or node.get('about_characters'),
            'about_places': about.get('places') or node.get('about_places'),
            'about_things': about.get('things') or node.get('about_things'),
            'about_relationship': about.get('relationship') or node.get('about_relationship'),
            'tone': node.get('tone'),
            'voice_style': node.get('voice_style') or node.get('voice', {}).get('style'),
            'voice_phrases': node.get('voice_phrases') or node.get('voice', {}).get('phrases'),
            'weight': node.get('weight', 0.5),
            'focus': node.get('focus', 1.0),
            'truth': node.get('truth', 1.0),
            'narrator_notes': node.get('narrator_notes'),
            'embedding': node.get('_embedding'),
        }

    def _extract_moment_args(self, node: Dict) -> Dict:
        return {
            'id': node['id'],
            'content': node.get('content', ''),
            'synthesis': node.get('synthesis', ''),
            'type': node.get('moment_type', 'narration'),
            'tick_created': node.get('tick_created', 0),
            'status': node.get('status', 'completed'),
            'weight': node.get('weight', 0.5),
            'tone': node.get('tone'),
            'tick_resolved': node.get('tick_resolved'),
            'speaker': node.get('speaker'),  # Used for SAID link, not stored as attribute
            'place_id': node.get('place_id'),
            'after_moment_id': node.get('after_moment_id'),
            'embedding': node.get('_embedding'),
            'line': node.get('line'),
        }

    def _extract_belief_args(self, link: Dict) -> Dict:
        return {
            'character_id': link['character'],
            'narrative_id': link['narrative'],
            'heard': link.get('heard', 0.0),
            'believes': link.get('believes', 0.0),
            'doubts': link.get('doubts', 0.0),
            'denies': link.get('denies', 0.0),
            'hides': link.get('hides', 0.0),
            'spreads': link.get('spreads', 0.0),
            'originated': link.get('originated', 0.0),
            'source': link.get('source', 'none'),
            'from_whom': link.get('from_whom'),
        }

    def _extract_presence_args(self, link: Dict) -> Dict:
        return {
            'character_id': link['from'],
            'place_id': link['to'],
            'present': link.get('present', 1.0),
            'visible': link.get('visible', 1.0),
        }

    def _extract_possession_args(self, link: Dict) -> Dict:
        # carries_hidden as link type sets carries_hidden=1.0
        is_hidden = link.get('type') == 'carries_hidden'
        return {
            'character_id': link['from'],
            'thing_id': link['to'],
            'carries': link.get('carries', 1.0),
            'carries_hidden': 1.0 if is_hidden else link.get('carries_hidden', 0.0),
        }

    def _extract_geography_args(self, link: Dict) -> Dict:
        return {
            'from_place_id': link['from'],
            'to_place_id': link['to'],
            'contains': link.get('contains', 0.0),
            'path': link.get('path', 0.0),
            'path_distance': link.get('path_distance'),
            'path_difficulty': link.get('path_difficulty', 'moderate'),
            'borders': link.get('borders', 0.0),
        }

    def _extract_narrative_link_args(self, link: Dict) -> Dict:
        return {
            'source_id': link['from'],
            'target_id': link['to'],
            'contradicts': link.get('contradicts', 0.0),
            'supports': link.get('supports', 0.0),
            'elaborates': link.get('elaborates', 0.0),
            'subsumes': link.get('subsumes', 0.0),
            'supersedes': link.get('supersedes', 0.0),
        }

    def _extract_thing_location_args(self, link: Dict) -> Dict:
        return {
            'thing_id': link['from'],
            'place_id': link['to'],
            'located': link.get('located', 1.0),
            'hidden': link.get('hidden', 0.0),
            'specific_location': link.get('specific_location'),
        }

    # =========================================================================
    # UPDATE HELPERS
    # =========================================================================

    def _apply_node_update(self, update: Dict):
        """Apply property updates to a node."""
        node_id = update['node']
        props = {k: v for k, v in update.items() if k != 'node'}
        if not props:
            return

        set_parts = [f"n.{k} = {repr(v)}" for k, v in props.items()]
        cypher = f"""
        MATCH (n {{id: '{node_id}'}})
        SET {', '.join(set_parts)}
        """
        self._query(cypher)
