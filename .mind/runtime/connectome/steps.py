"""
Connectome Step Processors

Processes each step type: ask, query, create, update, branch.

Key validations on create:
1. Schema validation - all fields must match schema
2. Connectivity constraint - new clusters must connect to existing graph
3. Errors returned with guidance

DOCS: docs/membrane/IMPLEMENTATION_Membrane_System.md
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass

from .session import SessionState, LoopState
from .loader import StepDefinition
from .validation import validate_input, coerce_value, ValidationError
from .templates import expand_template, expand_dict
from .schema import validate_cluster, SchemaError
from .persistence import GraphPersistence, PersistenceResult

logger = logging.getLogger(__name__)


@dataclass
class StepResult:
    """Result from processing a step."""
    success: bool
    next_step: Optional[str] = None
    response: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    needs_input: bool = False


class StepProcessor:
    """
    Processes connectome steps.

    Requires graph_ops and graph_queries for graph operations.
    """

    # Preset queries for common patterns
    PRESET_QUERIES = {
        "all_spaces": "MATCH (n:Space) RETURN n.id, n.name, n.type ORDER BY n.name",
        "all_validations": "MATCH (n:Narrative) WHERE n.type = 'validation' RETURN n.id, n.name",
        "all_behaviors": "MATCH (n:Narrative) WHERE n.type = 'behavior' RETURN n.id, n.name",
        "all_goals": "MATCH (n:Narrative) WHERE n.type = 'goal' RETURN n.id, n.name, n.status",
        "all_narratives": "MATCH (n:Narrative) RETURN n.id, n.name, n.type ORDER BY n.type, n.name",
        "all_actors": "MATCH (n:Actor) RETURN n.id, n.name, n.type ORDER BY n.name",
    }

    def __init__(self, graph_ops=None, graph_queries=None):
        """
        Initialize processor.

        Args:
            graph_ops: GraphOps instance for mutations
            graph_queries: GraphQueries instance for queries
        """
        self.graph_ops = graph_ops
        self.graph_queries = graph_queries
        self.persistence = GraphPersistence(graph_ops, graph_queries)

    def process_step(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """
        Process a single step.

        Args:
            step: The step definition
            session: Current session state
            answer: Answer if this is continuing an ask step

        Returns:
            StepResult
        """
        handlers = {
            "ask": self._process_ask,
            "query": self._process_query,
            "create": self._process_create,
            "update": self._process_update,
            "branch": self._process_branch,
            "call_procedure": self._process_call_procedure,
            "complete": self._process_complete,
        }

        handler = handlers.get(step.type)
        if not handler:
            return StepResult(
                success=False,
                error=f"Unknown step type: {step.type}"
            )

        try:
            return handler(step, session, answer)
        except Exception as e:
            logger.exception(f"Error processing step {step.id}")
            return StepResult(
                success=False,
                error=str(e)
            )

    def _process_ask(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """Process an ask step."""
        config = step.config

        # Handle both 'questions' (list) and 'question' (string) formats
        questions = config.get("questions", [])
        if questions:
            # New format: questions is a list of question objects
            # For now, handle first question (multi-question steps need session tracking)
            q_index = session.get_context(f"_q_index_{step.id}") or 0
            if q_index >= len(questions):
                q_index = 0
            q_obj = questions[q_index]
            question_text = q_obj.get("ask", "")
            expects = q_obj.get("expects", {"type": "string"})
            question_name = q_obj.get("name", step.id)
            context_text = config.get("context", "")
            why_it_matters = q_obj.get("why_it_matters", "")
            good_answer = q_obj.get("good_answer", "")
            bad_answer = q_obj.get("bad_answer", "")
        else:
            # Legacy format: single question string
            question_text = config.get("question", "")
            expects = config.get("expects", {"type": "string"})
            question_name = step.id
            context_text = ""
            why_it_matters = ""
            good_answer = ""
            bad_answer = ""

        # Check for for_each loop
        for_each = config.get("for_each")
        if for_each and not session.loop_state:
            # Start loop
            items = session.get_answer(for_each) or session.get_context(for_each)
            if isinstance(items, list):
                session.loop_state = LoopState(step_id=step.id, items=items)

        # Get current loop item if in loop
        extra = {}
        if session.loop_state and session.loop_state.step_id == step.id:
            extra["item"] = session.loop_state.current_item

        # If no answer yet, return question
        if answer is None:
            question = expand_template(
                question_text,
                session.collected,
                session.context,
                extra
            )
            context = expand_template(
                context_text,
                session.collected,
                session.context,
                extra
            ) if context_text else None
            return StepResult(
                success=True,
                needs_input=True,
                response={
                    "step_id": step.id,
                    "type": "ask",
                    "question": question,
                    "question_name": question_name,
                    "context": context,
                    "expects": expects,
                    "why_it_matters": why_it_matters,
                    "good_answer": good_answer,
                    "bad_answer": bad_answer,
                    "question_index": q_index if questions else None,
                    "question_count": len(questions) if questions else 1,
                    "loop_index": session.loop_state.index if session.loop_state else None,
                    "loop_total": len(session.loop_state.items) if session.loop_state else None,
                }
            )

        # Validate and store answer
        answer = coerce_value(answer, expects)
        is_valid, error = validate_input(answer, expects)

        if not is_valid:
            return StepResult(
                success=False,
                needs_input=True,
                error=error,
                response={
                    "step_id": step.id,
                    "type": "ask",
                    "question": question_text,
                    "expects": expects,
                    "validation_error": error,
                }
            )

        # Store answer
        if session.loop_state and session.loop_state.step_id == step.id:
            # In loop - advance and check if done
            session.loop_state.advance(answer)
            if not session.loop_state.is_complete:
                # Stay on same step for next item
                return StepResult(
                    success=True,
                    next_step=step.id,
                )
            else:
                # Loop complete - store all results and continue
                session.set_answer(step.id, session.loop_state.results)
                session.loop_state = None
        elif questions:
            # Multi-question step - store by question name and advance
            session.set_answer(question_name, answer)
            q_index = session.get_context(f"_q_index_{step.id}") or 0

            if q_index + 1 < len(questions):
                # More questions in this step
                session.set_context(f"_q_index_{step.id}", q_index + 1)
                return StepResult(
                    success=True,
                    next_step=step.id,  # Stay on same step for next question
                )
            else:
                # All questions answered - clear index and continue
                session.set_context(f"_q_index_{step.id}", 0)
        else:
            session.set_answer(step.id, answer)

        # Move to next step
        next_step = step.next
        if next_step == "$complete":
            next_step = None

        return StepResult(
            success=True,
            next_step=next_step,
        )

    def _process_query(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """Process a query step."""
        config = step.config
        store_as = config.get("store_as", step.id)

        # Get query (preset or custom)
        preset = config.get("preset")
        if preset:
            # Handle parameterized presets like "space_contents:space_123"
            if ":" in preset:
                preset_name, param = preset.split(":", 1)
                param = expand_template(param, session.collected, session.context)
                query = self._get_preset_query(preset_name, param)
            else:
                query = self.PRESET_QUERIES.get(preset)
                if not query:
                    return StepResult(
                        success=False,
                        error=f"Unknown preset query: {preset}"
                    )
        else:
            query = config.get("query", "")
            # Handle structured query format (dict) - convert to simple match query
            if isinstance(query, dict):
                # Structured query like {find: narrative, type: sync, in_space: ...}
                find_type = query.get("find", "")
                node_type = query.get("type", "")
                in_space = query.get("in_space", "")
                # Build a simple Cypher query
                if find_type:
                    label = find_type.capitalize()
                    conditions = []
                    if node_type:
                        conditions.append(f"n.type = '{node_type}'")
                    if in_space:
                        expanded_space = expand_template(in_space, session.collected, session.context)
                        conditions.append(f"n.space_id = '{expanded_space}'")
                    where_clause = " AND ".join(conditions) if conditions else "1=1"
                    query = f"MATCH (n:{label}) WHERE {where_clause} RETURN n LIMIT 10"
                else:
                    query = ""  # Skip if no find type
            else:
                query = expand_template(query, session.collected, session.context)

        # Execute query
        results = []
        if self.graph_queries and query:  # Skip if query is empty
            try:
                # Build params from session
                params = {
                    **session.collected,
                    **{f"ctx_{k}": v for k, v in session.context.items()},
                }
                # Add special params
                if "target_id" in session.context:
                    params["target_id"] = session.context["target_id"]

                raw_results = self.graph_queries.query(query, params=params)
                results = self._normalize_query_results(raw_results)
            except Exception as e:
                logger.warning(f"Query failed: {e}")
                results = []
        else:
            # No graph connection - return empty for testing
            logger.warning("No graph_queries configured, returning empty results")

        # Store results
        session.set_context(store_as, results)

        # Move to next
        next_step = step.next
        if next_step == "$complete":
            next_step = None

        return StepResult(
            success=True,
            next_step=next_step,
            response={
                "step_id": step.id,
                "type": "query",
                "store_as": store_as,
                "result_count": len(results),
                "results": results,
            }
        )

    def _process_create(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """
        Process a create step with schema validation.

        Validates:
        1. All node fields match schema
        2. All link fields match schema
        3. New clusters connect to existing graph

        Returns error with guidance if validation fails.
        """
        config = step.config
        nodes_config = config.get("nodes", [])
        links_config = config.get("links", [])

        # Step 1: Expand all nodes and links
        expanded_nodes = []
        expanded_links = []

        for node_config in nodes_config:
            for_each = node_config.get("for_each")
            if for_each:
                items = session.get_answer(for_each) or session.get_context(for_each) or []
                # Ensure items is a list and filter out empty/None items
                if isinstance(items, str):
                    items = [i.strip() for i in items.split(",") if i.strip()]
                items = [i for i in items if i]  # Filter empty items
                for item in items:
                    extra = {"item": item}
                    node = self._expand_node(node_config, session, extra)
                    if node and self._is_valid_node_id(node.get("id")):
                        expanded_nodes.append(node)
            else:
                node = self._expand_node(node_config, session)
                if node and self._is_valid_node_id(node.get("id")):
                    expanded_nodes.append(node)

        # Collect valid node IDs for link validation
        valid_node_ids = {n.get("id") for n in expanded_nodes}

        for link_config in links_config:
            # Check condition
            condition = link_config.get("condition")
            if condition:
                expanded_cond = expand_template(condition, session.collected, session.context)
                if not self._evaluate_condition(expanded_cond, session):
                    continue

            for_each = link_config.get("for_each")
            if for_each:
                items = session.get_answer(for_each) or session.get_context(for_each) or []
                # Filter empty items
                if isinstance(items, str):
                    items = [i.strip() for i in items.split(",") if i.strip()]
                items = [i for i in items if i]
                for item in items:
                    extra = {"item": item}
                    link = self._expand_link(link_config, session, extra)
                    if link and self._is_valid_link(link, valid_node_ids):
                        expanded_links.append(link)
            else:
                link = self._expand_link(link_config, session)
                if link and self._is_valid_link(link, valid_node_ids):
                    expanded_links.append(link)

        # Step 2: Validate the cluster
        # Include link endpoints as "assumed existing" for connectivity validation
        # (actual existence will be checked at persistence time)
        referenced_external_ids = set()
        for link in expanded_links:
            from_id = link.get("from")
            to_id = link.get("to")
            if from_id and from_id not in valid_node_ids:
                referenced_external_ids.add(from_id)
            if to_id and to_id not in valid_node_ids:
                referenced_external_ids.add(to_id)

        # Temporarily add referenced IDs to existing set for connectivity check
        self.persistence.refresh_cache()
        existing_ids = self.persistence.get_existing_node_ids()
        existing_ids.update(referenced_external_ids)

        validation_errors = self.persistence.validate_only(expanded_nodes, expanded_links)

        if validation_errors:
            # Format errors with guidance
            error_messages = []
            for err in validation_errors:
                error_messages.append(err.format())

            return StepResult(
                success=False,
                error="\n\n".join(error_messages),
                response={
                    "step_id": step.id,
                    "type": "create",
                    "validation_failed": True,
                    "error_count": len(validation_errors),
                    "errors": [
                        {
                            "message": e.message,
                            "field": e.field,
                            "guidance": e.guidance,
                        }
                        for e in validation_errors
                    ],
                }
            )

        # Step 3: Persist (validation already done)
        result = self.persistence.persist_cluster(
            expanded_nodes,
            expanded_links,
            skip_validation=True  # Already validated above
        )

        if not result.success:
            return StepResult(
                success=False,
                error=result.format(),
                response={
                    "step_id": step.id,
                    "type": "create",
                    "persistence_failed": True,
                    "errors": [e.format() for e in result.errors],
                }
            )

        # Step 4: Update session with created items
        for node in expanded_nodes:
            session.add_created_node(node)
        for link in expanded_links:
            session.add_created_link(link)

        # Move to next
        next_step = step.next
        if next_step == "$complete":
            next_step = None

        return StepResult(
            success=True,
            next_step=next_step,
            response={
                "step_id": step.id,
                "type": "create",
                "created_nodes": expanded_nodes,
                "created_links": expanded_links,
                "persisted": True,
            }
        )

    def _is_valid_node_id(self, node_id: Optional[str]) -> bool:
        """
        Check if a node ID is valid.

        Invalid IDs include:
        - None or empty string
        - IDs with unexpanded templates (contain {})
        - IDs with double underscores (empty template values)
        """
        if not node_id:
            return False
        if "{" in node_id or "}" in node_id:
            return False
        if "__" in node_id:
            return False
        return True

    def _is_valid_link(self, link: Dict[str, Any], valid_node_ids: set) -> bool:
        """
        Check if a link is valid.

        A link is valid if:
        - Both from and to are non-empty
        - Neither contains unexpanded templates
        - Neither contains double underscores (empty template values)
        """
        from_id = link.get("from")
        to_id = link.get("to")

        if not from_id or not to_id:
            return False
        if "{" in from_id or "}" in from_id:
            return False
        if "{" in to_id or "}" in to_id:
            return False
        if "__" in from_id or "__" in to_id:
            return False
        return True

    def _expand_node(
        self,
        node_config: Dict[str, Any],
        session: SessionState,
        extra: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Expand node config with session values (without persisting).

        Auto-fills required fields if missing:
        - name: defaults to id if not provided
        - type: defaults to node_type if not provided
        """
        extra = extra or {}
        expanded = expand_dict(node_config, session.collected, session.context, extra)

        # Auto-fill name from id if missing (schema requires name)
        if not expanded.get("name") and expanded.get("id"):
            expanded["name"] = expanded["id"]

        # Auto-fill type from node_type if missing
        if not expanded.get("type") and expanded.get("node_type"):
            expanded["type"] = expanded["node_type"]

        return expanded

    def _expand_link(
        self,
        link_config: Dict[str, Any],
        session: SessionState,
        extra: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Expand link config with session values (without persisting)."""
        extra = extra or {}
        expanded = expand_dict(link_config, session.collected, session.context, extra)

        # Handle item being just an ID string
        if isinstance(extra.get("item"), str):
            if expanded.get("to") == "{item}":
                expanded["to"] = extra["item"]
            if expanded.get("from") == "{item}":
                expanded["from"] = extra["item"]

        return expanded

    def _process_update(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """Process an update step."""
        config = step.config
        target = expand_template(
            config.get("target", ""),
            session.collected,
            session.context
        )
        set_values = config.get("set", {})

        # Expand set values
        expanded_values = expand_dict(set_values, session.collected, session.context)

        # Apply update
        if self.graph_ops and target:
            try:
                # Build cypher for update
                set_clauses = ", ".join(f"n.{k} = ${k}" for k in expanded_values.keys())
                cypher = f"""
                MATCH (n {{id: $target_id}})
                SET {set_clauses}
                RETURN n.id
                """
                params = {"target_id": target, **expanded_values}
                self.graph_ops._query(cypher, params)
            except Exception as e:
                logger.error(f"Update failed: {e}")
                return StepResult(success=False, error=str(e))

        # Move to next
        next_step = step.next
        if next_step == "$complete":
            next_step = None

        return StepResult(
            success=True,
            next_step=next_step,
            response={
                "step_id": step.id,
                "type": "update",
                "target": target,
                "set": expanded_values,
            }
        )

    def _process_branch(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """Process a branch step."""
        config = step.config
        branch_info = {}
        next_step = None

        # Handle checks list (condition + action pairs)
        checks = config.get("checks", [])
        if checks:
            for check in checks:
                condition = check.get("condition", "")
                action = check.get("action", {})

                # "ready" is a special condition that always matches
                if condition == "ready":
                    matched = True
                else:
                    expanded = expand_template(condition, session.collected, session.context)
                    matched = self._evaluate_condition(expanded, session)

                if matched:
                    # Action can be: goto, call_procedure, or complete
                    if isinstance(action, dict):
                        if "goto" in action:
                            next_step = action["goto"]
                        elif action.get("type") == "call_procedure":
                            # Handle call_procedure action
                            procedure_name = action.get("protocol")
                            on_complete = action.get("on_complete")
                            context_additions = action.get("context", {})

                            # Expand context values
                            expanded_context = {}
                            for k, v in context_additions.items():
                                if isinstance(v, str):
                                    expanded_context[k] = expand_template(v, session.collected, session.context)
                                else:
                                    expanded_context[k] = v

                            # Push call frame
                            session.push_call(procedure_name, on_complete)
                            for k, v in expanded_context.items():
                                session.set_context(k, v)

                            next_step = "$call_procedure"
                    branch_info = {"condition": condition, "matched": True, "action": action}
                    break

            if not next_step and not branch_info:
                branch_info = {"checks_evaluated": len(checks), "matched": False}

        # Handle cases dict
        elif config.get("cases"):
            cases = config["cases"]
            # Case-based branch - use 'on' field to get the variable
            # Note: YAML parses 'on:' as boolean True, so check for both
            on_field = config.get("on") or config.get(True) or ""
            var_name = on_field.strip("{}").split("|")[0].strip()
            value = session.get_answer(var_name) or session.get_context(var_name)
            next_step = cases.get(value, config.get("default"))
            branch_info = {"on": var_name, "value": value, "matched": next_step is not None}

        # Handle simple condition/then/else
        else:
            condition = config.get("condition", "")
            if condition:
                expanded = expand_template(condition, session.collected, session.context)
                result = self._evaluate_condition(expanded, session)
                next_step = config.get("then") if result else config.get("else")
                branch_info = {"condition": condition, "result": result}

        if next_step == "$complete":
            next_step = None

        return StepResult(
            success=True,
            next_step=next_step,
            response={
                "step_id": step.id,
                "type": "branch",
                "branch_info": branch_info,
                "next": next_step,
            }
        )

    def _process_call_procedure(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """
        Process a call_procedure step.

        This pushes a call frame and signals the runner to load the sub-procedure.
        """
        config = step.config
        procedure_name = config.get("protocol")
        # Accept both 'on_complete' and 'next' as the return step
        on_complete = config.get("on_complete") or config.get("next")
        context_additions = config.get("context", {})
        max_depth = config.get("max_depth", 5)

        if not procedure_name:
            return StepResult(
                success=False,
                error="call_procedure requires 'procedure' field"
            )

        if not on_complete:
            return StepResult(
                success=False,
                error="call_procedure requires 'on_complete' or 'next' field"
            )

        # Check depth limit
        if session.call_depth >= max_depth:
            return StepResult(
                success=False,
                error=f"Protocol call depth exceeded ({max_depth})"
            )

        # Expand context additions
        expanded_context = expand_dict(context_additions, session.collected, session.context)

        # Add expanded context to session
        for key, value in expanded_context.items():
            session.set_context(key, value)

        # Push call frame (saves current protocol and return point)
        session.push_call(procedure_name, on_complete)

        # Signal runner to load new protocol
        # The runner will see this special response and load the sub-procedure
        return StepResult(
            success=True,
            next_step="$call_procedure",  # Special marker for runner
            response={
                "step_id": step.id,
                "type": "call_procedure",
                "protocol": procedure_name,
                "on_complete": on_complete,
                "call_depth": session.call_depth,
            }
        )

    def _process_complete(
        self,
        step: StepDefinition,
        session: SessionState,
        answer: Any = None
    ) -> StepResult:
        """
        Process a complete step - marks protocol as finished.

        Complete steps signal the end of a protocol with a status and message.
        """
        config = step.config
        status = config.get("status", "success")
        message = expand_template(
            config.get("message", "Protocol completed"),
            session.collected,
            session.context
        )

        # Mark session as complete
        session.complete()

        return StepResult(
            success=True,
            next_step=None,  # No next step - we're done
            response={
                "step_id": step.id,
                "type": "complete",
                "status": status,
                "message": message,
            }
        )

    def _create_node(
        self,
        node_config: Dict[str, Any],
        session: SessionState,
        extra: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Create a single node."""
        extra = extra or {}
        expanded = expand_dict(node_config, session.collected, session.context, extra)

        node_id = expanded.get("id")
        node_type = expanded.get("node_type", "narrative")

        if not node_id:
            return None

        # Map to engine methods
        if self.graph_ops:
            try:
                if node_type == "narrative":
                    self.graph_ops.add_narrative(
                        id=node_id,
                        name=expanded.get("name", node_id),
                        content=expanded.get("content", ""),
                        type=expanded.get("type", "memory"),
                        weight=float(expanded.get("weight", 0.5)),
                    )
                elif node_type == "space":
                    self.graph_ops.add_place(
                        id=node_id,
                        name=expanded.get("name", node_id),
                        type=expanded.get("type", "module"),
                        weight=float(expanded.get("weight", 0.5)),
                    )
                elif node_type == "thing":
                    self.graph_ops.add_thing(
                        id=node_id,
                        name=expanded.get("name", node_id),
                        type=expanded.get("type", "file"),
                    )
                elif node_type == "moment":
                    self.graph_ops.add_moment(
                        id=node_id,
                        text=expanded.get("content", ""),
                        type=expanded.get("type", "narration"),
                        status=expanded.get("status", "completed"),
                    )
            except Exception as e:
                logger.error(f"Failed to create node {node_id}: {e}")
                return None

        return expanded

    def _create_link(
        self,
        link_config: Dict[str, Any],
        session: SessionState,
        extra: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """Create a single link."""
        extra = extra or {}
        expanded = expand_dict(link_config, session.collected, session.context, extra)

        link_type = expanded.get("type")
        from_id = expanded.get("from")
        to_id = expanded.get("to")

        if not all([link_type, from_id, to_id]):
            return None

        # Handle item being just an ID string
        if isinstance(extra.get("item"), str):
            if to_id == "{item}":
                to_id = extra["item"]
            if from_id == "{item}":
                from_id = extra["item"]

        properties = expanded.get("properties", {})

        if self.graph_ops:
            try:
                if link_type == "contains":
                    # Generic contains
                    cypher = """
                    MATCH (a {id: $from_id})
                    MATCH (b {id: $to_id})
                    MERGE (a)-[:CONTAINS]->(b)
                    """
                    self.graph_ops._query(cypher, {"from_id": from_id, "to_id": to_id})
                elif link_type == "relates":
                    self.graph_ops.add_narrative_link(
                        source_id=from_id,
                        target_id=to_id,
                        supports=float(properties.get("supports", 0)),
                        contradicts=float(properties.get("contradicts", 0)),
                        elaborates=float(properties.get("elaborates", 0)),
                    )
                elif link_type == "about":
                    self.graph_ops.add_about(
                        moment_id=from_id,
                        target_id=to_id,
                        weight=float(properties.get("weight", 0.5)),
                    )
                elif link_type == "expresses":
                    self.graph_ops.add_said(
                        character_id=from_id,
                        moment_id=to_id,
                    )
                else:
                    # Generic link creation
                    cypher = f"""
                    MATCH (a {{id: $from_id}})
                    MATCH (b {{id: $to_id}})
                    MERGE (a)-[r:{link_type.upper()}]->(b)
                    SET r += $props
                    """
                    self.graph_ops._query(cypher, {
                        "from_id": from_id,
                        "to_id": to_id,
                        "props": properties,
                    })
            except Exception as e:
                logger.error(f"Failed to create link {from_id}->{to_id}: {e}")
                return None

        return expanded

    def _get_preset_query(self, preset_name: str, param: str) -> str:
        """Get parameterized preset query."""
        presets = {
            "space_contents": f"""
                MATCH (s:Space {{id: '{param}'}})-[:CONTAINS]->(n)
                RETURN n.id, n.name, labels(n)[0] as type
            """,
            "node_links": f"""
                MATCH (n {{id: '{param}'}})-[r]-(m)
                RETURN type(r) as rel_type, m.id, m.name, labels(m)[0] as type
            """,
        }
        return presets.get(preset_name, "RETURN 1")

    def _normalize_query_results(self, raw_results: List) -> List[Dict[str, Any]]:
        """Normalize query results to list of dicts."""
        if not raw_results:
            return []

        normalized = []
        for row in raw_results:
            if isinstance(row, dict):
                normalized.append(row)
            elif isinstance(row, (list, tuple)):
                # Convert to dict with index keys
                normalized.append({f"col{i}": v for i, v in enumerate(row)})
            else:
                normalized.append({"value": row})

        return normalized

    def _evaluate_condition(self, condition: str, session: SessionState) -> bool:
        """Evaluate a simple condition string."""
        # Handle == comparison
        if "==" in condition:
            parts = condition.split("==")
            if len(parts) == 2:
                left = parts[0].strip().strip("'\"")
                right = parts[1].strip().strip("'\"")
                return left == right

        # Handle truthy check
        if condition.lower() in ("true", "1", "yes"):
            return True
        if condition.lower() in ("false", "0", "no", ""):
            return False

        # Check if it's a reference that's truthy
        return bool(condition)
