"""
Exploration Runner — v1.8 Async SubEntity Traversal

Manages SubEntity exploration as async coroutines with tree structure.
Parent SubEntities run children at branch points, wait for results, then merge.

STATE MACHINE:
    SEEKING → BRANCHING → ABSORBING → RESONATING → REFLECTING → CRYSTALLIZING → MERGING

v1.8 CHANGES (Query vs Intention):
    - explore() now takes query (what to find) and intention (why finding) separately
    - intention_type affects traversal behavior (summarize, verify, find_next, explore, retrieve)
    - Query drives semantic matching; intention colors traversal priority

v1.7.2 CHANGES:
    - D1: sibling_ids are strings, resolved via ExplorationContext (lazy refs)
    - D3: found_narratives is dict[str, float] with max(alignment) merge
    - D4: Timeout errors loudly, crashes exploration, no partial merge
    - D5: Branch threshold is len(outgoing) >= 2

ASYNC PATTERN:
    - Each SubEntity runs as a coroutine
    - Branching runs child coroutines
    - Parent awaits all children before proceeding
    - Timeout safety prevents runaway exploration (D4: crash loud on timeout)

DOCS: docs/physics/ALGORITHM_Physics.md (v1.8 SubEntity section)
"""

import asyncio
from typing import List, Dict, Any, Optional, Callable, Awaitable, Tuple
from dataclasses import dataclass, field
import time

# Import SubEntity from canonical location (v1.9)
from runtime.physics.subentity import (
    SubEntity,
    SubEntityState,
    ExplorationContext,
    create_subentity,
    STATE_MULTIPLIER,  # v1.9: energy injection multipliers
)


# =============================================================================
# GRAPH INTERFACE (Abstract)
# =============================================================================

@dataclass
class GraphInterface:
    """
    Abstract interface for graph operations.

    Implementations must provide these async methods.
    """
    # Node queries
    get_node: Callable[[str], Awaitable[Optional[Dict[str, Any]]]] = None
    get_node_embedding: Callable[[str], Awaitable[Optional[List[float]]]] = None

    # Link queries
    get_outgoing_links: Callable[[str], Awaitable[List[Dict[str, Any]]]] = None
    get_incoming_links: Callable[[str], Awaitable[List[Dict[str, Any]]]] = None
    get_link: Callable[[str], Awaitable[Optional[Dict[str, Any]]]] = None
    get_link_embedding: Callable[[str], Awaitable[Optional[List[float]]]] = None

    # Narrative queries
    get_all_narratives: Callable[[], Awaitable[List[Tuple[str, List[float]]]]] = None
    is_narrative: Callable[[str], Awaitable[bool]] = None
    is_moment: Callable[[str], Awaitable[bool]] = None

    # Mutations
    update_node: Callable[[str, Dict[str, Any]], Awaitable[None]] = None
    update_link: Callable[[str, Dict[str, Any]], Awaitable[None]] = None
    create_narrative: Callable[[Dict[str, Any]], Awaitable[str]] = None
    create_link: Callable[[Dict[str, Any]], Awaitable[str]] = None


# =============================================================================
# EXPLORATION RESULT
# =============================================================================

@dataclass
class ExplorationResult:
    """Result of SubEntity exploration (v1.7.2)."""
    subentity_id: str
    actor_id: str
    origin_moment: Optional[str]
    state: SubEntityState
    found_narratives: Dict[str, float]  # v1.7.2: dict {id: max_alignment}
    crystallized: Optional[str]
    satisfaction: float
    depth: int
    duration_s: float
    children_results: List['ExplorationResult'] = field(default_factory=list)


def collect_result(se: SubEntity, context: ExplorationContext) -> ExplorationResult:
    """Collect result from completed SubEntity (v1.7.2)."""
    duration = (getattr(se, 'completed_at', None) or time.time()) - getattr(se, 'created_at', time.time())
    return ExplorationResult(
        subentity_id=se.id,
        actor_id=se.actor_id,
        origin_moment=se.origin_moment,
        state=se.state,
        found_narratives=dict(se.found_narratives),  # v1.7.2: copy dict
        crystallized=se.crystallized,
        satisfaction=se.satisfaction,
        depth=se.depth,
        duration_s=duration,
        children_results=[collect_result(c, context) for c in se.children],  # lazy resolve children
    )


# =============================================================================
# EXPLORATION RUNNER
# =============================================================================

@dataclass
class ExplorationConfig:
    """Configuration for exploration (v1.7.2)."""
    max_depth: int = 10
    max_children: int = 3
    timeout_s: float = 30.0
    min_branch_links: int = 2  # v1.7.2 D5: Simple count threshold
    satisfaction_threshold: float = 0.8
    novelty_threshold: float = 0.85
    min_link_score: float = 0.1


class ExplorationTimeoutError(Exception):
    """v1.7.2 D4: Timeout errors loudly, crashes exploration."""
    pass


class ExplorationRunner:
    """
    Async runner for SubEntity exploration (v1.7.2).

    Manages the tree of SubEntities as coroutines.
    Uses ExplorationContext for lazy sibling/parent resolution.
    """

    def __init__(
        self,
        graph: GraphInterface,
        config: Optional[ExplorationConfig] = None,
        logger: Optional['TraversalLogger'] = None,
        exploration_id: Optional[str] = None,
    ):
        self.graph = graph
        self.config = config or ExplorationConfig()
        self._context = ExplorationContext()  # v1.7.2: shared context for lazy refs
        self._logger = logger
        self._exploration_id = exploration_id or ""
        self._step_counter: Dict[str, int] = {}  # subentity_id -> step count
        self._tick = 0

    def _log_step(
        self,
        se: SubEntity,
        state_before: str,
        state_after: str,
        decision_type: str = "",
        transition_reason: str = "",
        candidates: List[Dict] = None,
        selected_link: Optional[Dict] = None,
        movement: Optional[Dict] = None,
        new_narrative: Optional[str] = None,
        alignment: Optional[float] = None,
    ) -> None:
        """Log a step if logger is available."""
        if not self._logger:
            return

        # Increment step counter
        if se.id not in self._step_counter:
            self._step_counter[se.id] = 0
        self._step_counter[se.id] += 1
        step_num = self._step_counter[se.id]

        # Build decision info
        from runtime.physics.traversal_logger import DecisionInfo, LinkCandidate, MovementInfo

        decision = None
        if decision_type:
            link_candidates = []
            if candidates:
                for i, c in enumerate(candidates):
                    lc = LinkCandidate(
                        link_id=c.get('link', {}).get('id', ''),
                        target_id=c.get('target_id', ''),
                        target_type=c.get('target_type', ''),
                        score=c.get('score', 0),
                        semantic=c.get('components', {}).get('semantic', 0),
                        polarity=c.get('components', {}).get('polarity', 0),
                        permanence_factor=c.get('components', {}).get('permanence_factor', 0),
                        self_novelty=c.get('components', {}).get('self_novelty', 0),
                        sibling_divergence=c.get('components', {}).get('sibling_divergence', 0),
                        verdict="SELECTED" if i == 0 and selected_link else "REJECTED",
                    )
                    link_candidates.append(lc)

            decision = DecisionInfo(
                decision_type=decision_type,
                candidates=link_candidates,
                selected_link_id=selected_link.get('id') if selected_link else None,
                explanation=transition_reason,
            )

        # Build movement info
        move_info = None
        if movement:
            move_info = MovementInfo(
                from_node_id=movement.get('from_id', ''),
                from_node_type=movement.get('from_type', ''),
                to_node_id=movement.get('to_id', ''),
                to_node_type=movement.get('to_type', ''),
                via_link_id=movement.get('via_link', ''),
            )

        self._logger.log_step(
            exploration_id=self._exploration_id,
            subentity_id=se.id,
            actor_id=se.actor_id,
            tick=self._tick,
            step_number=step_num,
            state_before=state_before,
            state_after=state_after,
            transition_reason=transition_reason,
            position_node_id=se.position,
            position_node_type="",  # Would need to fetch
            position_node_name="",
            depth=se.depth,
            satisfaction=se.satisfaction,
            criticality=se.criticality,
            decision=decision,
            movement=move_info,
            found_narratives=dict(se.found_narratives),
            new_this_step=new_narrative,
            alignment_this_step=alignment,
            parent_id=se.parent_id,
            sibling_ids=se.sibling_ids,
            children_ids=se.children_ids,
            active_siblings=len([s for s in se.siblings if s and s.is_active]),
            emotions={},
            intention=se.intention,
        )

    async def explore(
        self,
        actor_id: str,
        query: str,
        query_embedding: Optional[List[float]],
        intention: str = "",
        intention_embedding: Optional[List[float]] = None,
        intention_type: str = "explore",
        origin_moment: Optional[str] = None,
    ) -> ExplorationResult:
        """
        Start exploration from an actor (v1.8).

        v1.8: Separate query (what to find) from intention (why finding).

        Args:
            actor_id: ID of the exploring actor
            query: Text of what to search for
            query_embedding: Embedding of query
            intention: Why searching (optional, defaults to query)
            intention_embedding: Embedding of intention (optional, defaults to query_embedding)
            intention_type: Type of intention: summarize, verify, find_next, explore, retrieve
            origin_moment: Moment that triggered exploration

        Returns:
            ExplorationResult with findings

        Raises:
            ExplorationTimeoutError: v1.7.2 D4 - timeout errors loudly
        """
        # v2.1: Removed IntentionType enum - intention is semantic via embedding

        # Run root SubEntity using canonical factory (v2.1)
        # Start at origin_moment if provided, otherwise at actor
        start_pos = origin_moment if origin_moment else actor_id
        root = create_subentity(
            actor_id=actor_id,
            origin_moment=origin_moment or "",
            query=query,
            query_embedding=query_embedding,
            intention=intention,
            intention_embedding=intention_embedding,
            start_position=start_pos,
            context=self._context,  # v1.7.2: register with context
        )
        root.created_at = time.time()

        try:
            # Run exploration with timeout
            await asyncio.wait_for(
                self._run_subentity(root),
                timeout=self.config.timeout_s,
            )
        except asyncio.TimeoutError:
            # v1.7.2 D4: Timeout errors loudly, crash exploration, no partial merge
            root.state = SubEntityState.MERGING  # Use MERGING as terminal
            root.completed_at = time.time()
            raise ExplorationTimeoutError(
                f"Exploration timed out after {self.config.timeout_s}s. "
                f"SubEntity {root.id} at depth {root.depth}, position {root.position}. "
                f"Found {len(root.found_narratives)} narratives before timeout."
            )
        except Exception as e:
            root.state = SubEntityState.MERGING
            root.completed_at = time.time()
            raise  # v1.7.2: propagate errors
        finally:
            root.completed_at = time.time()

        return collect_result(root, self._context)

    async def _run_subentity(self, se: SubEntity) -> None:
        """
        Run SubEntity state machine.

        State transitions:
            SEEKING → BRANCHING (at branch point)
            SEEKING → ABSORBING (content to process)
            SEEKING → RESONATING (found narrative)
            SEEKING → REFLECTING (no aligned links)
            BRANCHING → REFLECTING (after children complete)
            ABSORBING → CRYSTALLIZING (alignment > 0.7 AND novelty > 0.7)
            ABSORBING → SEEKING (continue exploration)
            RESONATING → MERGING (satisfaction high)
            RESONATING → SEEKING (continue exploration)
            REFLECTING → MERGING (satisfaction ok)
            REFLECTING → CRYSTALLIZING (satisfaction low)
            CRYSTALLIZING → SEEKING (v1.9: continue after crystallization)
            CRYSTALLIZING → MERGING
            MERGING → COMPLETED
        """
        step_count = 0
        MAX_STEPS = 1000

        while se.is_active:
            step_count += 1
            if step_count > MAX_STEPS:
                se.transition_to(SubEntityState.MERGING)
                break

            if se.state == SubEntityState.SEEKING:
                await self._step_seeking(se)

            elif se.state == SubEntityState.BRANCHING:
                await self._step_branching(se)

            elif se.state == SubEntityState.ABSORBING:
                await self._step_absorbing(se)

            elif se.state == SubEntityState.RESONATING:
                await self._step_resonating(se)

            elif se.state == SubEntityState.REFLECTING:
                await self._step_reflecting(se)

            elif se.state == SubEntityState.CRYSTALLIZING:
                await self._step_crystallizing(se)

            elif se.state == SubEntityState.MERGING:
                await self._step_merging(se)

            # Depth check - only applies during exploration, not after crystallization/merging
            # Bug fix: Previously this would overwrite CRYSTALLIZING→MERGING transitions,
            # causing an infinite loop (REFLECTING→CRYSTALLIZING→depth check→REFLECTING→...)
            if se.depth >= self.config.max_depth and se.state in (
                SubEntityState.SEEKING,
                SubEntityState.BRANCHING,
                SubEntityState.ABSORBING,
            ):
                se.state = SubEntityState.REFLECTING

    async def _step_seeking(self, se: SubEntity) -> None:
        """SEEKING: Traverse aligned links (v2.1)."""
        from runtime.physics.link_scoring import (
            score_outgoing_links,
            get_target_node_id,
            should_branch,
        )
        # v2.1: Removed forward_color_link - coloring now happens in backprop

        state_before = se.state.value

        # Get outgoing links
        links = await self.graph.get_outgoing_links(se.position)
        if not links:
            se.transition_to(SubEntityState.REFLECTING)
            self._log_step(
                se, state_before, se.state.value,
                decision_type="NO_LINKS",
                transition_reason=f"No outgoing links from {se.position}",
            )
            return

        # Get path embeddings for self-novelty
        path_embeddings = []
        for link_id, _ in se.path:
            emb = await self.graph.get_link_embedding(link_id)
            if emb:
                path_embeddings.append(emb)

        # Get sibling crystallization embeddings (v1.7.2: lazy resolution via property)
        sibling_embeddings = [
            s.crystallization_embedding for s in se.siblings
            if s and s.crystallization_embedding
        ]

        # Score links
        scored = score_outgoing_links(
            links=links,
            from_node_id=se.position,
            intention_embedding=se.intention_embedding or [],
            path_embeddings=path_embeddings,
            sibling_embeddings=sibling_embeddings,
            min_score=self.config.min_link_score,
        )

        if not scored:
            se.transition_to(SubEntityState.REFLECTING)
            self._log_step(
                se, state_before, se.state.value,
                decision_type="NO_SCORED_LINKS",
                transition_reason=f"No links with score > {self.config.min_link_score} from {se.position} (had {len(links)} raw links)",
            )
            return

        # v1.7.2 D5: Check for branching with simple count threshold
        if should_branch(scored, self.config.min_branch_links):
            # Check if at a moment (only branch on moments)
            is_moment = await self.graph.is_moment(se.position)
            if is_moment:
                se.transition_to(SubEntityState.BRANCHING)
                return

        # Take top link
        link, score, components = scored[0]
        target_id = get_target_node_id(link, se.position)

        if not target_id:
            se.transition_to(SubEntityState.REFLECTING)
            return

        # v2.1: No forward coloring here - we don't know if path is useful yet
        # Links are colored during backprop (REFLECTING) when we know the path was valuable

        # Save position before updating
        old_position = se.position

        # Update path
        se.path.append((link.get('id', ''), target_id))
        se.position = target_id
        se.depth += 1

        # Log successful traversal
        self._log_step(
            se, state_before, se.state.value,
            decision_type="TRAVERSE",
            transition_reason=f"Moved to {target_id} via {link.get('id', '')} (score {score:.3f})",
            candidates=[{'link': l, 'score': s, 'target_id': get_target_node_id(l, old_position), 'components': c} for l, s, c in scored[:5]],
            selected_link=link,
            movement={'from_id': old_position, 'to_id': target_id, 'via_link': link.get('id', '')},
        )

        # v1.9: Inject energy into target node
        # injection = criticality × state_mult × node.weight
        if self.graph.get_node and target_node:
            inject_node_energy(target_node, se.criticality, state_mult)

            # Determine node type from labels or properties
            node_type = target_node.get('type', target_node.get('labels', ['Node'])[0] if isinstance(target_node.get('labels'), list) else 'Node')

            # Regenerate synthesis if embedding drifted (ticks deprecated)
            was_regenerated, new_synthesis = regenerate_node_synthesis_if_drifted(
                target_node,
                node_type,
                target_node.get('embedding'),
            )
            if was_regenerated and self.graph.update_node:
                await self.graph.update_node(target_id, {'synthesis': new_synthesis})

        # Update crystallization embedding
        await self._update_crystallization_embedding(se)

        # Check if target is narrative
        is_narrative = await self.graph.is_narrative(target_id)
        if is_narrative:
            se.transition_to(SubEntityState.RESONATING)
            return

        # v1.7.2 D5: Check if at branch point with simple count
        is_moment = await self.graph.is_moment(target_id)
        if is_moment:
            outgoing = await self.graph.get_outgoing_links(target_id)
            if len(outgoing) >= self.config.min_branch_links:
                se.transition_to(SubEntityState.BRANCHING)
                return

        # Continue seeking

    async def _step_branching(self, se: SubEntity) -> None:
        """BRANCHING: Run children for parallel exploration (v1.7.2)."""
        from runtime.physics.link_scoring import select_branch_candidates, get_target_node_id

        # Get outgoing links
        links = await self.graph.get_outgoing_links(se.position)

        # Get path embeddings
        path_embeddings = []
        for link_id, _ in se.path:
            emb = await self.graph.get_link_embedding(link_id)
            if emb:
                path_embeddings.append(emb)

        # Get sibling embeddings (v1.7.2: lazy resolution via property)
        sibling_embeddings = [
            s.crystallization_embedding for s in se.siblings
            if s and s.crystallization_embedding
        ]

        # Score and select branch candidates
        from runtime.physics.link_scoring import score_outgoing_links
        scored = score_outgoing_links(
            links=links,
            from_node_id=se.position,
            intention_embedding=se.intention_embedding or [],
            path_embeddings=path_embeddings,
            sibling_embeddings=sibling_embeddings,
        )

        candidates = select_branch_candidates(
            scored,
            max_branches=self.config.max_children,
        )

        if len(candidates) <= 1:
            # Not worth branching, continue seeking
            se.transition_to(SubEntityState.SEEKING)
            return

        # Run children using v1.7.2 run_child method
        children = []
        for link, score, components in candidates:
            target_id = get_target_node_id(link, se.position)
            if not target_id:
                continue

            # v1.7.2: use run_child with context for lazy refs
            child = se.run_child(
                target_position=target_id,
                via_link=link.get('id', ''),
                context=self._context,
            )
            child.created_at = time.time()
            children.append(child)

        # v1.7.2: Set sibling_ids using method
        se.set_sibling_references()

        # Run children in parallel
        child_tasks = [self._run_subentity(child) for child in children]
        await asyncio.gather(*child_tasks, return_exceptions=True)

        # v1.7.2 D3: Merge children results with max(alignment) per narrative
        for child in children:
            for narr_id, alignment in child.found_narratives.items():
                current = se.found_narratives.get(narr_id, 0.0)
                se.found_narratives[narr_id] = max(current, alignment)
            # v1.7.2: crystallized narratives get alignment 1.0
            if child.crystallized:
                se.found_narratives[child.crystallized] = 1.0

        # Aggregate satisfaction
        if children:
            se.satisfaction = sum(c.satisfaction for c in children) / len(children)

        # Update crystallization embedding
        await self._update_crystallization_embedding(se)

        se.transition_to(SubEntityState.REFLECTING)

    async def _step_absorbing(self, se: SubEntity) -> None:
        """ABSORBING: Process content at current position (v1.9).

        Transition to CRYSTALLIZING if BOTH:
            - alignment > 0.7 (strong match with intention)
            - novelty > 0.7 (sufficiently different from what we've seen)

        Otherwise continue SEEKING.
        """
        from runtime.physics.link_scoring import cosine_similarity, max_cosine_against_set
        from runtime.physics.crystallization import check_novelty
        from runtime.physics.flow import inject_node_energy

        # Get current node embedding
        node_embedding = await self.graph.get_node_embedding(se.position) if self.graph.get_node_embedding else None

        # Compute alignment with intention
        alignment = 0.0
        if node_embedding and se.intention_embedding:
            alignment = cosine_similarity(se.intention_embedding, node_embedding)

        # Compute novelty against path
        novelty = 1.0
        if node_embedding and se.path:
            path_embeddings = []
            for link_id, _ in se.path:
                emb = await self.graph.get_link_embedding(link_id) if self.graph.get_link_embedding else None
                if emb:
                    path_embeddings.append(emb)
            if path_embeddings:
                novelty = 1.0 - max_cosine_against_set(node_embedding, path_embeddings)

        # v1.9: Inject energy during ABSORBING
        state_mult = STATE_MULTIPLIER.get(se.state, 1.0)
        if self.graph.get_node:
            node = await self.graph.get_node(se.position)
            if node:
                inject_node_energy(node, se.criticality, state_mult)
                if self.graph.update_node:
                    await self.graph.update_node(se.position, {'energy': node['energy']})

        # v1.9: BOTH conditions required for crystallization
        if alignment > 0.7 and novelty > 0.7:
            se.transition_to(SubEntityState.CRYSTALLIZING)
        else:
            se.transition_to(SubEntityState.SEEKING)

    async def _step_resonating(self, se: SubEntity) -> None:
        """RESONATING: Absorb found narrative (v1.9)."""
        from runtime.physics.link_scoring import cosine_similarity
        from runtime.physics.flow import add_node_weight_on_resonating

        # Get narrative embedding
        narrative_embedding = await self.graph.get_node_embedding(se.position)

        if narrative_embedding and se.intention_embedding:
            align = cosine_similarity(se.intention_embedding, narrative_embedding)

            if align > 0:
                # v1.7.2 D3/B9: found_narratives is dict with max(alignment)
                current = se.found_narratives.get(se.position, 0.0)
                se.found_narratives[se.position] = max(current, align)

                # Boost satisfaction
                total_align = sum(se.found_narratives.values()) + 1.0
                boost = align / total_align
                se.satisfaction = min(1.0, se.satisfaction + boost)

                # v1.9: Add weight to node on RESONATING
                # gain = criticality × STATE_MULTIPLIER[RESONATING]
                if self.graph.get_node:
                    node = await self.graph.get_node(se.position)
                    if node:
                        add_node_weight_on_resonating(node, se.criticality)

                # Update crystallization embedding
                await self._update_crystallization_embedding(se)

        if se.satisfaction >= self.config.satisfaction_threshold:
            se.transition_to(SubEntityState.MERGING)
        else:
            se.transition_to(SubEntityState.SEEKING)

    async def _step_reflecting(self, se: SubEntity) -> None:
        """REFLECTING: Backpropagate colors along path (v2.1).

        Color links that led to useful discoveries:
        - If satisfaction > 0.5: path led to good findings → color with intention
        - If crystallizing: path led to new knowledge → will color after crystallization
        """
        from runtime.physics.flow import backward_color_path

        # Only backprop color if the path was useful (satisfaction > 0.5)
        if se.satisfaction > 0.5 and se.path:
            # Fetch all path links
            path_links = []
            for link_id, _ in se.path:
                if self.graph.get_link:
                    link = await self.graph.get_link(link_id)
                    if link:
                        path_links.append(link)

            if path_links:
                # Backprop color with intention embedding
                # Links that led to success get colored by what we were looking for
                colored_links, weight_gained = backward_color_path(
                    path_links=path_links,
                    final_embedding=se.intention_embedding,  # Color with intention
                    attenuation_rate=0.8,  # 20% decay per hop
                    permanence_boost=0.05 * se.satisfaction,  # Boost based on how useful
                )

                # Save colored links back to graph
                if self.graph.update_link:
                    for link in colored_links:
                        await self.graph.update_link(link.get('id', ''), link)

        if se.satisfaction > 0.5:
            se.transition_to(SubEntityState.MERGING)
        else:
            se.transition_to(SubEntityState.CRYSTALLIZING)

    async def _step_crystallizing(self, se: SubEntity) -> None:
        """CRYSTALLIZING: Create new narrative with links (v1.9).

        1. Create narrative: name="{intention}: {run_node.name}"
        2. Link: run_node → new_narrative
        3. Link: new_narrative → focus_node
        4. Store crystallization_embedding
        5. Return to SEEKING
        """
        from runtime.physics.subentity import STATE_MULTIPLIER, SubEntityState
        from runtime.physics.cluster_presentation import render_cluster
        from runtime.physics.synthesis import synthesize_from_crystallization

        # Get run and focus node data
        run_node = await self.graph.get_node(se.run_node) if self.graph.get_node else None
        focus_node = await self.graph.get_node(se.focus_node) if self.graph.get_node else None

        if not run_node or not focus_node:
            se.transition_to(SubEntityState.MERGING)
            return

        run_name = run_node.get('name', se.run_node)
        state_mult = STATE_MULTIPLIER.get(SubEntityState.CRYSTALLIZING, 1.5)

        # Compute mean hierarchy/permanence from path
        path_hierarchies = []
        path_permanences = []
        for link_id, _ in se.path:
            link = await self.graph.get_link(link_id) if self.graph.get_link else None
            if link:
                path_hierarchies.append(link.get('hierarchy', 0.0))
                path_permanences.append(link.get('permanence', 0.5))

        mean_hierarchy = sum(path_hierarchies) / len(path_hierarchies) if path_hierarchies else 0.0
        mean_permanence = sum(path_permanences) / len(path_permanences) if path_permanences else 0.5

        # Get last link for focus hierarchy
        last_link = None
        if se.path:
            last_link_id, _ = se.path[-1]
            last_link = await self.graph.get_link(last_link_id) if self.graph.get_link else None

        # SubEntity emotions as dict
        se_emotions = se.get_emotions()

        # 1. Create narrative
        narrative_weight = se.criticality * state_mult
        narrative_energy = se.criticality * state_mult
        focus_name = focus_node.get('name', se.focus_node)

        # Build narrative content from path (simple prose, no grammar parsing)
        # Deduplicate path (backtracking creates duplicates)
        seen_nodes = set()
        unique_path = []
        for link_id, node_id in reversed(se.path):
            if node_id not in seen_nodes:
                seen_nodes.add(node_id)
                unique_path.append((link_id, node_id))
        unique_path = list(reversed(unique_path))

        # Generate content directly (don't rely on unfold for non-grammar nodes)
        content_parts = []
        if se.intention:
            content_parts.append(f"Exploration: {se.intention}")

        # Add path nodes
        path_nodes = []
        for link_id, node_id in unique_path:
            node = await self.graph.get_node(node_id) if self.graph.get_node else None
            if node:
                node_name = node.get('name', node_id)
                path_nodes.append(node_name)

        if path_nodes:
            content_parts.append(f"Path: {' → '.join(path_nodes)} → {focus_name}")

        # Add focus node info
        focus_content = focus_node.get('content', '') or focus_node.get('synthesis', '')
        if focus_content and len(focus_content) > 10:
            content_parts.append(f"Found: {focus_content[:300]}")

        narrative_content = "\n".join(content_parts) if content_parts else f"Discovered: {focus_name}"

        # Generate name via synthesis
        found_narr_info = []
        for narr_id, alignment in se.found_narratives.items():
            narr_node = await self.graph.get_node(narr_id) if self.graph.get_node else None
            if narr_node:
                found_narr_info.append((
                    narr_id,
                    narr_node.get('name', narr_id),
                    narr_node.get('content', '')[:200],
                    alignment
                ))

        path_summary = f"{run_name} → {focus_name}" if run_name != focus_name else focus_name
        synth_name, _ = synthesize_from_crystallization(
            intention_text=se.intention or "exploration",
            found_narratives=found_narr_info,
            path_summary=path_summary,
        )
        narrative_name = synth_name if synth_name else f"{se.intention}: {run_name}"

        # Create synthesis (shorter version for embedding search)
        synthesis = f"{narrative_name}. {narrative_content[:200]}" if len(narrative_content) > 200 else narrative_content

        if self.graph.create_narrative:
            narr_id = await self.graph.create_narrative({
                'name': narrative_name,
                'weight': narrative_weight,
                'energy': narrative_energy,
                'content': narrative_content,
                'synthesis': synthesis,
                'embedding': se.crystallization_embedding,
            })

            # 2. Link: run_node → new_narrative
            if self.graph.create_link:
                await self.graph.create_link({
                    'node_a': se.run_node,
                    'node_b': narr_id,
                    'polarity': [0.8, 0.2],
                    'hierarchy': mean_hierarchy,
                    'permanence': mean_permanence,
                    **se_emotions,
                })

            # 3. Link: new_narrative → focus_node
            if self.graph.create_link:
                await self.graph.create_link({
                    'node_a': narr_id,
                    'node_b': se.focus_node,
                    'polarity': [0.8, 0.2],
                    'hierarchy': last_link.get('hierarchy', 0.5) if last_link else 0.5,
                    'permanence': se.criticality,
                    **se_emotions,
                })

            # Record crystallization
            se.crystallized = narr_id
            se.found_narratives[narr_id] = 1.0

            # Update satisfaction - crystallization counts as finding something
            se.update_satisfaction(1.0, 1.0)

        # 4. Store crystallization_embedding (blend intention, focus, narrative)
        if se.crystallization_embedding and focus_node.get('embedding'):
            from runtime.physics.flow import blend_embeddings
            se.crystallization_embedding = blend_embeddings(
                se.intention_embedding or [],
                focus_node.get('embedding', []),
                0.5,
            )

        # v2.1: Backprop color after crystallization - path led to new knowledge
        if se.path:
            from runtime.physics.flow import backward_color_path

            path_links = []
            for link_id, _ in se.path:
                if self.graph.get_link:
                    link = await self.graph.get_link(link_id)
                    if link:
                        path_links.append(link)

            if path_links:
                # Color with crystallization embedding (what we created)
                colored_links, _ = backward_color_path(
                    path_links=path_links,
                    final_embedding=se.crystallization_embedding,
                    attenuation_rate=0.8,
                    permanence_boost=0.1,  # Crystallization = strong signal
                )

                if self.graph.update_link:
                    for link in colored_links:
                        await self.graph.update_link(link.get('id', ''), link)

        # 5. After crystallizing, go to MERGING
        # v2.0.1: Changed from conditional SEEKING to always MERGING
        # Rationale: Crystallization creates a narrative - that's the result.
        # Continuing to SEEKING caused infinite loop (low sat → crystallize → seek → reflect → crystallize)
        se.transition_to(SubEntityState.MERGING)

    async def _step_merging(self, se: SubEntity) -> None:
        """MERGING: Return findings to parent or actor (v1.7.2)."""
        # v1.7.2: parent is lazy resolved via property
        if se.parent:
            # Results will be collected by parent after await
            pass
        else:
            # Root SubEntity - would reinforce actor links
            pass

        # Terminal state - can't transition from MERGING
        se.state = SubEntityState.MERGING
        se.completed_at = time.time()

    async def _update_crystallization_embedding(self, se: SubEntity) -> None:
        """Update crystallization embedding based on current state (v1.7.2)."""
        from runtime.physics.crystallization import compute_crystallization_embedding

        # Get position embedding
        position_emb = await self.graph.get_node_embedding(se.position) if self.graph.get_node_embedding else None

        # Get found narrative embeddings - v1.7.2: iterate dict keys
        found_embs = []
        for narr_id in se.found_narratives.keys():
            emb = await self.graph.get_node_embedding(narr_id) if self.graph.get_node_embedding else None
            if emb:
                found_embs.append(emb)

        # Get path link embeddings
        path_embs = []
        for link_id, _ in se.path:
            emb = await self.graph.get_link_embedding(link_id) if self.graph.get_link_embedding else None
            if emb:
                path_embs.append(emb)

        se.crystallization_embedding = compute_crystallization_embedding(
            intention_embedding=se.intention_embedding,
            position_embedding=position_emb,
            found_narrative_embeddings=found_embs,
            path_link_embeddings=path_embs,
        )


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

async def run_exploration(
    graph: GraphInterface,
    actor_id: str,
    intention: str,
    intention_embedding: Optional[List[float]],
    origin_moment: Optional[str] = None,
    config: Optional[ExplorationConfig] = None,
) -> ExplorationResult:
    """
    Run a single exploration.

    Args:
        graph: Graph interface
        actor_id: ID of exploring actor
        intention: What to find
        intention_embedding: Embedding of intention
        origin_moment: Triggering moment
        config: Exploration configuration

    Returns:
        ExplorationResult
    """
    runner = ExplorationRunner(graph, config)
    return await runner.explore(
        actor_id=actor_id,
        intention=intention,
        intention_embedding=intention_embedding,
        origin_moment=origin_moment,
    )


def run_exploration_sync(
    graph: GraphInterface,
    actor_id: str,
    intention: str,
    intention_embedding: Optional[List[float]],
    origin_moment: Optional[str] = None,
    config: Optional[ExplorationConfig] = None,
) -> ExplorationResult:
    """
    Run exploration synchronously (wraps async).

    Args:
        graph: Graph interface
        actor_id: ID of exploring actor
        intention: What to find
        intention_embedding: Embedding of intention
        origin_moment: Triggering moment
        config: Exploration configuration

    Returns:
        ExplorationResult
    """
    return asyncio.run(run_exploration(
        graph=graph,
        actor_id=actor_id,
        intention=intention,
        intention_embedding=intention_embedding,
        origin_moment=origin_moment,
        config=config,
    ))


# =============================================================================
# CLUSTER PRESENTATION INTEGRATION (v1.9)
# =============================================================================

def present_exploration_result(
    result: ExplorationResult,
    query: str,
    intention: str,
    intention_type: str = "explore",
    query_embedding: Optional[List[float]] = None,
    intention_embedding: Optional[List[float]] = None,
) -> 'PresentedCluster':
    """
    Present an exploration result as a readable cluster (v1.9).

    This creates a minimal cluster from the ExplorationResult's found_narratives.
    For full cluster presentation with path/convergence/tension detection,
    use present_cluster() with a properly tracked RawCluster.

    Args:
        result: ExplorationResult from exploration
        query: What was searched for
        intention: Why searching
        intention_type: How to filter (summarize, verify, find_next, explore, retrieve)
        query_embedding: Embedding of query
        intention_embedding: Embedding of intention

    Returns:
        PresentedCluster with markdown and stats
    """
    from runtime.physics.cluster_presentation import (
        ClusterNode,
        ClusterLink,
        RawCluster,
        PresentedCluster,
        ClusterStats,
        present_cluster,
        IntentionType,  # v2.1: For presentation filtering (not link scoring)
    )

    # Parse intention_type for presentation filtering
    try:
        intent_type = IntentionType(intention_type)
    except ValueError:
        intent_type = IntentionType.EXPLORE

    # Create nodes from found narratives
    nodes = []
    for narr_id, alignment in result.found_narratives.items():
        nodes.append(ClusterNode(
            id=narr_id,
            node_type='narrative',
            name=narr_id,
            synthesis=f"{narr_id} (alignment: {alignment:.2f})",
            embedding=query_embedding or [],
            weight=alignment,
            energy=alignment,
        ))

    # Add actor node
    nodes.append(ClusterNode(
        id=result.actor_id,
        node_type='actor',
        name=result.actor_id,
        synthesis=result.actor_id,
        embedding=query_embedding or [],
        weight=1.0,
        energy=1.0,
    ))

    # Create links from actor to found narratives
    links = []
    for narr_id, alignment in result.found_narratives.items():
        links.append(ClusterLink(
            id=f"link_{result.actor_id}_{narr_id}",
            source_id=result.actor_id,
            target_id=narr_id,
            synthesis=f"found with alignment {alignment:.2f}",
            embedding=intention_embedding or query_embedding or [],
            weight=alignment,
            energy=alignment,
            permanence=0.0,
        ))

    raw_cluster = RawCluster(
        nodes=nodes,
        links=links,
        traversed_link_ids={l.id for l in links},
    )

    return present_cluster(
        raw_cluster=raw_cluster,
        query=query,
        intention=intention,
        intention_type=intent_type,
        query_embedding=query_embedding or [],
        intention_embedding=intention_embedding or query_embedding or [],
        start_id=result.actor_id,
    )
