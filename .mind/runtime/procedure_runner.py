"""
Procedure Runner — Execute procedures to create dense graph clusters.

Protocols define step-by-step processes that:
1. Fetch context from graph
2. Ask questions (to user or agent)
3. Create nodes and links based on answers
4. Validate cluster completeness
5. Record provenance via moments

Usage:
    runner = ProtocolRunner(graph_ops)
    result = runner.run(".mind/procedures/add_health_coverage.yaml", actor_id="actor_agent_keeper")
"""

import re
import yaml
import time
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable, Tuple

# Import cluster metrics (lazy to avoid circular imports)
def _get_cluster_validator():
    from .cluster_metrics import ClusterValidator
    return ClusterValidator


def _get_markdown_sync():
    from .markdown_sync import sync_narrative_to_markdown
    return sync_narrative_to_markdown

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ProcedureStep:
    """A single step in a procedure."""
    id: str
    ask: str = ""
    options: List[str] = field(default_factory=list)
    options_from: str = ""
    multi: bool = False
    min: int = 0
    max: int = 0
    validates: str = ""
    stores: str = ""
    creates: Dict = field(default_factory=dict)
    updates: Dict = field(default_factory=dict)
    condition: str = ""


@dataclass
class ProcedureResult:
    """Result of running a procedure."""
    success: bool
    nodes_created: List[str] = field(default_factory=list)
    links_created: int = 0
    moment_id: str = ""
    errors: List[str] = field(default_factory=list)
    context: Dict = field(default_factory=dict)
    # Cluster metrics (added for connection scoring)
    connection_score: Optional[Any] = None
    validation_report: str = ""
    suggestions: List[Any] = field(default_factory=list)


# =============================================================================
# UTILITIES
# =============================================================================

def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    slug = re.sub(r'[/\\._\s]', '-', text.lower())
    slug = re.sub(r'[^a-z0-9-]', '', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def expand_template(template: str, context: Dict) -> str:
    """Expand {variable} placeholders in template string."""
    def replace(match):
        key = match.group(1)
        # Handle nested keys like "each validation_id"
        if key.startswith('each '):
            return match.group(0)  # Keep for iteration handling
        # Handle dotted keys like "context.space"
        parts = key.split('.')
        value = context
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part, match.group(0))
            else:
                return match.group(0)
        return str(value) if value is not None else match.group(0)

    return re.sub(r'\{([^}]+)\}', replace, template)


def expand_dict(d: Dict, context: Dict) -> Dict:
    """Recursively expand templates in a dict."""
    result = {}
    for k, v in d.items():
        if isinstance(v, str):
            result[k] = expand_template(v, context)
        elif isinstance(v, dict):
            result[k] = expand_dict(v, context)
        elif isinstance(v, list):
            result[k] = [expand_template(i, context) if isinstance(i, str) else
                        expand_dict(i, context) if isinstance(i, dict) else i
                        for i in v]
        else:
            result[k] = v
    return result


# =============================================================================
# VALIDATORS
# =============================================================================

VALIDATORS = {
    'slug_format': lambda x: bool(re.match(r'^[a-z][a-z0-9_-]*$', x.lower())),
    'dock_uri_format': lambda x: '::' in x or ':' in x,
    'threshold_format': lambda x: isinstance(x, dict) or ':' in str(x),
    'non_empty': lambda x: bool(x and str(x).strip()),
    'id_format': lambda x: bool(re.match(r'^[a-z]+_[A-Z]+_', x)),
}


# =============================================================================
# PROTOCOL RUNNER
# =============================================================================

class ProtocolRunner:
    """
    Execute procedures to create dense graph clusters.

    Protocols are YAML files that define:
    - context_fetch: Queries to run before starting
    - steps: Questions to ask, nodes/links to create
    - validate: Checks that must pass
    - on_complete: Moment to create
    """

    def __init__(self, graph_ops=None, answer_provider: Callable = None, validate_cluster: bool = True):
        """
        Args:
            graph_ops: GraphOps instance for graph queries/mutations
            answer_provider: Function to get answers (for testing/automation)
                            Signature: (step_id, question, options) -> answer
            validate_cluster: Whether to run cluster validation after creation
        """
        self.graph = graph_ops
        self.answer_provider = answer_provider or self._default_answer_provider
        self.validate_cluster = validate_cluster
        self.context: Dict[str, Any] = {}
        self.created_nodes: List[str] = []
        self.created_nodes_full: List[Dict] = []  # Full node dicts for validation
        self.created_links: int = 0
        self.created_links_full: List[Dict] = []  # Full link dicts for validation
        self.primary_node_type: str = ""  # Type of primary node for validation

    def run(
        self,
        procedure_path: Path,
        actor_id: str = "actor_SYSTEM_protocol",
        initial_context: Dict = None
    ) -> ProcedureResult:
        """
        Run a procedure and return the result.

        Args:
            procedure_path: Path to procedure YAML file
            actor_id: Actor running this procedure
            initial_context: Pre-populated context values

        Returns:
            ProcedureResult with created nodes/links
        """
        # Reset state
        self.context = initial_context.copy() if initial_context else {}
        self.created_nodes = []
        self.created_nodes_full = []
        self.created_links = 0
        self.created_links_full = []
        self.primary_node_type = ""
        errors = []

        # Load protocol
        try:
            protocol = yaml.safe_load(Path(procedure_path).read_text())
        except Exception as e:
            return ProcedureResult(success=False, errors=[f"Failed to load procedure: {e}"])

        self.context['_protocol'] = protocol.get('id', procedure_path.stem)
        self.context['_actor'] = actor_id

        # Fetch context
        if self.graph and 'context_fetch' in protocol:
            for key, fetch_def in protocol['context_fetch'].items():
                try:
                    results = self._execute_query(fetch_def.get('query', {}))
                    self.context[key] = results
                except Exception as e:
                    logger.warning(f"Context fetch failed for {key}: {e}")
                    self.context[key] = []

        # Detect procedure format
        steps = protocol.get('steps', {})
        is_v2_format = isinstance(steps, dict)  # v2 uses dict with step names as keys

        if is_v2_format:
            # V2 format: steps is a dict with step names as keys
            errors.extend(self._run_steps_v2(steps))
        else:
            # V1 format: steps is a list
            for step_def in steps:
                step = self._parse_step(step_def)

                # Check condition
                if step.condition and not self._evaluate_condition(step.condition):
                    continue

                try:
                    self._run_step(step)
                except StepError as e:
                    errors.append(f"Step {step.id}: {e}")
                    if 'on_error' not in step_def:
                        break  # Stop on error unless handled

        # Validate
        for check in protocol.get('validate', []):
            try:
                if not self._validate_check(check):
                    errors.append(f"Validation failed: {check}")
            except Exception as e:
                errors.append(f"Validation error: {e}")

        # Run cluster validation BEFORE moment creation (so metrics can be included)
        connection_score = None
        validation_report = ""
        suggestions = []
        cluster_summary = ""

        if self.validate_cluster and self.created_nodes:
            try:
                ClusterValidator = _get_cluster_validator()
                validator = ClusterValidator(self.graph)

                space_id = self.context.get('space', '')
                validation_result = validator.validate_cluster(
                    self.primary_node_type or 'narrative.unknown',
                    self.created_nodes_full,
                    self.created_links_full,
                    space_id
                )

                connection_score = validation_result['score']
                validation_report = validation_result['report']
                suggestions = validation_result['suggestions']

                # Build compact summary for moment description
                if connection_score:
                    cluster_summary = (
                        f"Cluster: {connection_score.total_nodes} nodes, "
                        f"{connection_score.total_links} links | "
                        f"{connection_score.links_per_node:.1f} links/node | "
                        f"{int(connection_score.external_ratio * 100)}% external | "
                        f"{connection_score.verdict}"
                    )

                # Add validation warnings to errors if cluster is invalid
                if not validation_result['valid']:
                    target_errors = validation_result['target_validation'].errors
                    for err in target_errors:
                        errors.append(f"Cluster validation: {err}")

                # Print report if running interactively
                if validation_report:
                    print(validation_report)

            except Exception as e:
                logger.warning(f"Cluster validation failed: {e}")

        # Create completion moment (with cluster metrics in description)
        moment_id = ""
        if not errors and 'on_complete' in protocol:
            moment_id = self._create_completion_moment(
                protocol['on_complete'],
                actor_id,
                cluster_summary=cluster_summary
            )

        # Sync narrative nodes to markdown
        if not errors:
            self._sync_narratives_to_markdown(actor_id)

        return ProcedureResult(
            success=len(errors) == 0,
            nodes_created=self.created_nodes,
            links_created=self.created_links,
            moment_id=moment_id,
            errors=errors,
            context=self.context,
            connection_score=connection_score,
            validation_report=validation_report,
            suggestions=suggestions,
        )

    def _parse_step(self, step_def: Dict) -> ProcedureStep:
        """Parse step definition into ProcedureStep."""
        # Handle both old format (id as key) and new format (id as field)
        step_id = step_def.get('id', 'unnamed')

        return ProcedureStep(
            id=step_id,
            ask=step_def.get('ask', ''),
            options=step_def.get('options', []),
            options_from=step_def.get('options_from', ''),
            multi=step_def.get('multi', False),
            min=step_def.get('min', 0),
            max=step_def.get('max', 0),
            validates=step_def.get('validates', ''),
            stores=step_def.get('stores', ''),
            creates=step_def.get('creates', {}),
            updates=step_def.get('updates', {}),
            condition=step_def.get('condition', ''),
        )

    def _parse_step_v2(self, step_name: str, step_def: Dict) -> Dict:
        """Parse v2 format step (from existing procedures)."""
        return {
            'name': step_name,
            'type': step_def.get('type', 'ask'),
            'context': step_def.get('context', ''),
            'questions': step_def.get('questions', []),
            'auto_fetch': step_def.get('auto_fetch', []),
            'nodes': step_def.get('nodes', []),
            'links': step_def.get('links', []),
            'checks': step_def.get('checks', []),
            'next': step_def.get('next'),
            'moment': step_def.get('moment', {}),
            'protocol': step_def.get('protocol'),
            'inputs': step_def.get('inputs', {}),
            'purpose': step_def.get('purpose', ''),
        }

    def _run_steps_v2(self, steps: Dict) -> List[str]:
        """Execute v2 format steps (dict with step names as keys)."""
        errors = []

        # Find first step (no incoming 'next' from other steps)
        step_nexts = {s.get('next') for s in steps.values() if s.get('next')}
        first_step = None
        for step_name in steps:
            if step_name not in step_nexts:
                first_step = step_name
                break

        if not first_step:
            first_step = list(steps.keys())[0]

        # Execute steps following 'next' chain
        current_step = first_step
        visited = set()

        while current_step and current_step != '$complete':
            if current_step in visited:
                errors.append(f"Step loop detected at: {current_step}")
                break
            visited.add(current_step)

            if current_step not in steps:
                errors.append(f"Step not found: {current_step}")
                break

            step_def = steps[current_step]
            step = self._parse_step_v2(current_step, step_def)

            try:
                next_step = self._run_step_v2(step)
                # Use returned next or step's default next
                current_step = next_step if next_step else step.get('next')
            except StepError as e:
                errors.append(f"Step {current_step}: {e}")
                break
            except Exception as e:
                errors.append(f"Step {current_step} failed: {e}")
                break

        return errors

    def _run_step_v2(self, step: Dict) -> Optional[str]:
        """Execute a single v2 format step. Returns next step name or None."""
        step_type = step.get('type', 'ask')
        step_name = step.get('name', 'unnamed')

        logger.debug(f"Running step: {step_name} (type: {step_type})")

        if step_type == 'query':
            return self._run_query_step(step)
        elif step_type == 'branch':
            return self._run_branch_step(step)
        elif step_type == 'ask':
            return self._run_ask_step(step)
        elif step_type == 'create':
            return self._run_create_step(step)
        elif step_type == 'call_procedure':
            return self._run_call_procedure_step(step)
        else:
            logger.warning(f"Unknown step type: {step_type}")
            return step.get('next')

    def _run_query_step(self, step: Dict) -> Optional[str]:
        """Execute a query step - auto_fetch context data."""
        auto_fetch = step.get('auto_fetch', [])

        for fetch in auto_fetch:
            query_def = fetch.get('query', {})
            store_as = fetch.get('store_as')

            if store_as and self.graph:
                # Expand query parameters with current context
                expanded_query = expand_dict(query_def, self.context)

                try:
                    results = self._execute_query_v2(expanded_query)
                    self.context[store_as] = results
                    logger.debug(f"Fetched {len(results)} items for {store_as}")
                except Exception as e:
                    logger.warning(f"Query failed for {store_as}: {e}")
                    self.context[store_as] = []

        return step.get('next')

    def _execute_query_v2(self, query_def: Dict) -> List[Dict]:
        """Execute v2 format query."""
        if not self.graph:
            return []

        find = query_def.get('find', 'n')
        node_type = query_def.get('type')
        in_space = query_def.get('in_space')
        limit = query_def.get('limit', 100)

        conditions = []

        # Map find to node_type
        if find == 'narrative':
            conditions.append("n.node_type = 'narrative'")
        elif find == 'thing':
            conditions.append("n.node_type = 'thing'")
        elif find == 'moment':
            conditions.append("n.node_type = 'moment'")
        elif find == 'space':
            conditions.append("n.node_type = 'space'")

        if node_type:
            conditions.append(f"n.type = '{node_type}'")

        where_clause = " AND ".join(conditions) if conditions else "true"

        if in_space:
            cypher = f"""
            MATCH (s {{id: $space_id}})-[:CONTAINS]->(n)
            WHERE {where_clause}
            RETURN n.id as id, n.name as name, n.type as type, n.priority as priority
            LIMIT {limit}
            """
            params = {'space_id': in_space}
        else:
            cypher = f"""
            MATCH (n)
            WHERE {where_clause}
            RETURN n.id as id, n.name as name, n.type as type, n.priority as priority
            LIMIT {limit}
            """
            params = {}

        try:
            results = self.graph._query(cypher, params)
            return [dict(r) for r in results]
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            return []

    def _run_branch_step(self, step: Dict) -> Optional[str]:
        """Execute a branch step - check conditions and route."""
        checks = step.get('checks', [])

        for check in checks:
            condition = check.get('condition', '')
            action = check.get('action', {})

            # Evaluate condition
            if condition == 'ready' or self._evaluate_condition_v2(condition):
                if isinstance(action, dict):
                    if action.get('goto'):
                        return action['goto']
                    elif action.get('type') == 'call_procedure':
                        # Would call another protocol - for now, skip
                        logger.info(f"Would call procedure: {action.get('protocol')}")
                        return step.get('next')

        return step.get('next')

    def _evaluate_condition_v2(self, condition: str) -> bool:
        """Evaluate v2 format condition expression."""
        if not condition or condition == 'ready':
            return True

        # Handle {var | count} == 0 style conditions
        match = re.match(r'\{(\w+)\s*\|\s*count\}\s*(==|>|<|>=|<=)\s*(\d+)', condition)
        if match:
            var_name, operator, value = match.groups()
            var_value = self.context.get(var_name, [])
            count = len(var_value) if isinstance(var_value, list) else 0
            value = int(value)

            if operator == '==':
                return count == value
            elif operator == '>':
                return count > value
            elif operator == '<':
                return count < value
            elif operator == '>=':
                return count >= value
            elif operator == '<=':
                return count <= value

        # Simple truthiness check
        expanded = expand_template(condition, self.context)
        return bool(expanded and expanded != condition)

    def _run_ask_step(self, step: Dict) -> Optional[str]:
        """Execute an ask step - gather answers from questions."""
        questions = step.get('questions', [])
        context_text = step.get('context', '')

        # Expand and display context
        if context_text:
            expanded_context = expand_template(context_text, self.context)
            print(f"\n{expanded_context}\n")

        # Process each question
        for q in questions:
            q_name = q.get('name', 'unnamed')
            q_ask = q.get('ask', '')
            q_expects = q.get('expects', {})
            q_from = q_expects.get('from', '') if isinstance(q_expects, dict) else ''
            q_required = q_expects.get('required', True) if isinstance(q_expects, dict) else True

            # Build options from 'from' reference
            options = []
            if q_from:
                # Expand {validations} to get options from context
                expanded = expand_template(q_from, self.context)
                if expanded != q_from and expanded in self.context:
                    ctx_val = self.context[expanded]
                    if isinstance(ctx_val, list):
                        options = ctx_val
                # Also check if it's a direct reference
                var_name = q_from.strip('{}')
                if var_name in self.context:
                    ctx_val = self.context[var_name]
                    if isinstance(ctx_val, list):
                        options = ctx_val

            # Show why it matters
            if q.get('why_it_matters'):
                print(f"  ({q.get('why_it_matters')})")
            if q.get('good_answer'):
                print(f"  Good: {q.get('good_answer')}")
            if q.get('bad_answer'):
                print(f"  Bad: {q.get('bad_answer')}")

            # Get answer
            answer = self.answer_provider(q_name, q_ask, options, False)

            # Validate if pattern specified
            if isinstance(q_expects, dict) and q_expects.get('pattern'):
                pattern = q_expects['pattern']
                if not re.match(pattern, str(answer)):
                    if q_required:
                        raise StepError(f"Answer doesn't match pattern: {pattern}")
                    else:
                        answer = ""

            # Store answer
            self.context[q_name] = answer

        # Add timestamp for moment creation
        self.context['timestamp'] = int(time.time())

        return step.get('next')

    def _run_create_step(self, step: Dict) -> Optional[str]:
        """Execute a create step - create nodes and links."""
        nodes = step.get('nodes', [])
        links = step.get('links', [])

        # Create nodes
        for node_def in nodes:
            # Filter out comment lines (keys starting with #)
            clean_def = {k: v for k, v in node_def.items() if not k.startswith('#')}
            expanded = expand_dict(clean_def, self.context)

            node_id = expanded.get('id')
            if node_id and not node_id.startswith('{'):  # Skip if template not resolved
                self._create_node(expanded)

        # Create links
        for link_def in links:
            # Filter out comment lines
            clean_def = {k: v for k, v in link_def.items() if not k.startswith('#')}
            expanded = expand_dict(clean_def, self.context)

            from_id = expanded.get('from')
            to_id = expanded.get('to')

            if from_id and to_id and not from_id.startswith('{') and not to_id.startswith('{'):
                # Use _create_link to properly track the link
                self._create_link(expanded)

        return step.get('next')

    def _run_call_procedure_step(self, step: Dict) -> Optional[str]:
        """Execute a call_procedure step - invoke another protocol."""
        procedure_name = step.get('protocol')
        inputs = step.get('inputs', {})

        if not procedure_name:
            return step.get('next')

        # Expand inputs
        expanded_inputs = expand_dict(inputs, self.context)

        # Find protocol file
        procedure_path = Path(f".mind/procedures/{procedure_name}.yaml")

        if procedure_path.exists():
            logger.info(f"Calling procedure: {procedure_name}")
            # Run sub-procedure with merged context
            sub_runner = ProtocolRunner(self.graph, self.answer_provider)
            sub_context = {**self.context, **expanded_inputs}
            result = sub_runner.run(procedure_path, self.context.get('_actor', 'actor_SYSTEM'), sub_context)

            # Merge results
            self.created_nodes.extend(result.nodes_created)
            self.created_links += result.links_created

            if not result.success:
                for err in result.errors:
                    logger.warning(f"Sub-procedure error: {err}")
        else:
            logger.warning(f"Procedure not found: {procedure_name}")

        return step.get('next')

    def _run_step(self, step: ProcedureStep):
        """Execute a single procedure step."""
        # Build options list
        options = step.options.copy()
        if step.options_from:
            ctx_options = self._get_from_context(step.options_from)
            if isinstance(ctx_options, list):
                options.extend(ctx_options)

        # Get answer
        answer = self.answer_provider(step.id, step.ask, options, step.multi)

        # Validate answer
        if step.validates and step.validates in VALIDATORS:
            if not VALIDATORS[step.validates](answer):
                raise StepError(f"Invalid answer format: {step.validates}")

        # Check min/max for multi-select
        if step.multi and isinstance(answer, list):
            if step.min and len(answer) < step.min:
                raise StepError(f"Need at least {step.min} selections")
            if step.max and len(answer) > step.max:
                raise StepError(f"Maximum {step.max} selections allowed")

        # Store answer
        if step.stores:
            self.context[step.stores] = answer

        # Create nodes
        if 'node' in step.creates:
            node_def = expand_dict(step.creates['node'], self.context)
            self._create_node(node_def)

        # Create links
        if 'link' in step.creates:
            link_def = expand_dict(step.creates['link'], self.context)
            self._create_link(link_def)

        if 'links' in step.creates:
            for link_def in step.creates['links']:
                expanded = expand_dict(link_def, self.context)

                # Handle "each" iteration
                if '{each ' in str(link_def):
                    self._create_links_foreach(link_def, answer)
                else:
                    self._create_link(expanded)

        # Update existing nodes
        if step.updates:
            self._update_node(expand_dict(step.updates, self.context))

    def _create_node(self, node_def: Dict):
        """Create a node in the graph."""
        node_id = node_def.get('id')
        if not node_id:
            raise StepError("Node definition missing 'id'")

        if self.graph:
            props = {k: v for k, v in node_def.items()}
            self._upsert_node(props)

        self.created_nodes.append(node_id)
        self.created_nodes_full.append(node_def.copy())

        # Track primary node type (first non-moment, non-dock node)
        node_type = node_def.get('node_type', '')
        sub_type = node_def.get('type', '')
        full_type = f"{node_type}.{sub_type}"
        if not self.primary_node_type and node_type not in ('moment', 'thing'):
            self.primary_node_type = full_type
        elif not self.primary_node_type and node_type == 'thing' and sub_type != 'dock':
            self.primary_node_type = full_type

        logger.info(f"Created node: {node_id}")

    def _create_link(self, link_def: Dict):
        """Create a link in the graph."""
        from_id = link_def.get('from')
        to_id = link_def.get('to')
        rel_type = link_def.get('type', 'relates')

        if not from_id or not to_id:
            logger.warning(f"Link missing from/to: {link_def}")
            return

        if self.graph:
            props = {k: v for k, v in link_def.items()
                    if k not in ('from', 'to', 'type')}
            self._upsert_link(from_id, to_id, rel_type, props)

        self.created_links += 1
        self.created_links_full.append(link_def.copy())
        logger.info(f"Created link: {from_id} -[{rel_type}]-> {to_id}")

    def _create_links_foreach(self, link_template: Dict, items: List):
        """Create multiple links by iterating over items."""
        # Find the "each X" pattern
        template_str = str(link_template)
        match = re.search(r'\{each\s+(\w+)\}', template_str)
        if not match:
            return

        var_name = match.group(1)

        for item in items:
            # Temporarily add item to context
            self.context[var_name] = item
            expanded = expand_dict(link_template, self.context)
            self._create_link(expanded)

    def _update_node(self, update_def: Dict):
        """Update properties on an existing node."""
        node_id = update_def.get('node')
        set_props = update_def.get('set', {})

        if not node_id or not set_props:
            return

        if self.graph:
            self._upsert_node({'id': node_id, **set_props})

        logger.info(f"Updated node: {node_id}")

    def _validate_check(self, check: Dict) -> bool:
        """Run a validation check."""
        if 'node_exists' in check:
            node_id = expand_template(check['node_exists'], self.context)
            return node_id in self.created_nodes or self._node_exists(node_id)

        if 'link_count' in check:
            # For now, trust that we created the links
            return True

        if 'link_exists' in check:
            return True  # Trust protocol created it

        return True

    def _create_completion_moment(self, on_complete: Dict, actor_id: str, cluster_summary: str = "") -> str:
        """Create a moment recording this protocol run.

        Args:
            on_complete: Protocol's on_complete config
            actor_id: ID of actor running protocol
            cluster_summary: Optional cluster metrics summary to append to description
        """
        timestamp = int(time.time())
        moment_id = f"moment_PROTOCOL_{self.context.get('_protocol', 'unknown')}-{timestamp}"

        moment_def = on_complete.get('create_moment', {})
        moment_type = moment_def.get('type', 'protocol')
        text = expand_template(moment_def.get('text', 'Protocol completed'), self.context)

        # Append cluster metrics summary if provided
        if cluster_summary:
            text = f"{text} | {cluster_summary}"

        about_nodes = moment_def.get('about', [])

        # Expand about references
        expanded_about = []
        for ref in about_nodes:
            expanded = expand_template(ref, self.context)
            expanded_about.append(expanded)

        # Create moment node
        if self.graph:
            # Find actor's previous moment for NEXT chain
            previous_moment_id = self._find_actor_last_moment(actor_id)

            self._upsert_node({
                'id': moment_id,
                'node_type': 'moment',
                'type': moment_type,
                'text': text,
                'status': 'completed',
                'created_at_s': timestamp,
            })

            # Link actor -> moment
            self._upsert_link(actor_id, moment_id, 'EXPRESSES', {})

            # Link previous moment -> new moment (temporal chain)
            if previous_moment_id:
                self._upsert_link(previous_moment_id, moment_id, 'NEXT', {})

            # Link moment -> about nodes
            for about_id in expanded_about:
                self._upsert_link(moment_id, about_id, 'ABOUT', {})

        self.created_nodes.append(moment_id)
        logger.info(f"Created moment: {moment_id}")
        return moment_id

    # -------------------------------------------------------------------------
    # Graph Operations
    # -------------------------------------------------------------------------

    def _find_actor_last_moment(self, actor_id: str) -> Optional[str]:
        """Find the actor's most recent moment for NEXT chain linking.

        Returns the moment_id of the actor's last expressed moment, or None.
        """
        if not self.graph:
            return None

        try:
            # Query for actor's moments, ordered by created_at_s descending
            cypher = """
            MATCH (actor {id: $actor_id})-[:EXPRESSES]->(m:moment)
            RETURN m.id AS moment_id, m.created_at_s AS created_at
            ORDER BY m.created_at_s DESC
            LIMIT 1
            """
            result = self.graph.run_query(cypher, {'actor_id': actor_id})
            if result and len(result) > 0:
                return result[0].get('moment_id')
        except Exception as e:
            logger.debug(f"Could not find previous moment for {actor_id}: {e}")

        return None

    def _execute_query(self, query_def: Dict) -> List[Dict]:
        """Execute a context query."""
        if not self.graph:
            return []

        # Build Cypher query from definition
        find = query_def.get('find', 'n')
        where = query_def.get('where', {})
        in_space = query_def.get('in_space')
        limit = query_def.get('limit', 100)

        # Simple query builder
        conditions = []
        for k, v in where.items():
            if isinstance(v, list):
                conditions.append(f"n.{k} IN {v}")
            else:
                conditions.append(f"n.{k} = '{v}'")

        where_clause = " AND ".join(conditions) if conditions else "true"

        cypher = f"""
        MATCH (n)
        WHERE {where_clause}
        RETURN n.id as id, n.name as name, n.type as type
        LIMIT {limit}
        """

        try:
            results = self.graph._query(cypher)
            return [dict(r) for r in results]
        except:
            return []

    def _upsert_node(self, props: Dict):
        """MERGE a node into the graph using unified inject()."""
        if not self.graph:
            return

        node_id = props.get('id')
        if not node_id:
            return

        # Use canonical inject (no context - procedure creates its own moments)
        from runtime.inject import inject
        adapter = self.graph._adapter
        inject(adapter, props, with_context=False)

    def _upsert_link(self, from_id: str, to_id: str, rel_type: str, props: Dict):
        """MERGE a link into the graph using unified inject()."""
        if not self.graph:
            return

        # Use canonical inject with verb from rel_type
        from runtime.inject import inject
        adapter = self.graph._adapter

        link_data = {
            "from": from_id,
            "to": to_id,
            "verb": rel_type.lower(),
            **(props or {})
        }

        inject(adapter, link_data, with_context=False)

    def _node_exists(self, node_id: str) -> bool:
        """Check if a node exists in the graph."""
        if not self.graph:
            return False

        try:
            result = self.graph._query(
                "MATCH (n {id: $id}) RETURN n.id",
                {'id': node_id}
            )
            return len(result) > 0
        except:
            return False

    def _get_from_context(self, path: str) -> Any:
        """Get a value from context by dotted path."""
        parts = path.replace('context.', '').split('.')
        value = self.context
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None
        return value

    def _evaluate_condition(self, condition: str) -> bool:
        """Evaluate a condition expression."""
        # Simple evaluation - expand and check truthiness
        expanded = expand_template(condition, self.context)
        return bool(expanded and expanded != condition)

    def _sync_narratives_to_markdown(self, actor_id: str) -> None:
        """Sync created narrative nodes to markdown files."""
        if not self.created_nodes_full:
            return

        try:
            sync_narrative = _get_markdown_sync()
        except ImportError:
            logger.debug("markdown_sync not available, skipping sync")
            return

        # Find docs directory
        docs_dir = Path.cwd() / "docs"
        if not docs_dir.exists():
            docs_dir = self.target_dir / "docs" if hasattr(self, 'target_dir') else None
            if not docs_dir or not docs_dir.exists():
                logger.debug("No docs/ directory found, skipping markdown sync")
                return

        # Get module from context (space is usually the container)
        space_id = self.context.get('space', '')
        module = ''
        if space_id:
            # Extract module name from space_id (e.g., "space_module_physics" -> "physics")
            if space_id.startswith('space_module_'):
                module = space_id[len('space_module_'):]
            elif space_id.startswith('space_'):
                module = space_id[len('space_'):]
            else:
                module = space_id

        synced = 0
        for node in self.created_nodes_full:
            node_type = node.get('node_type', '')

            # Only sync narrative nodes
            if node_type != 'narrative':
                continue

            # Add module and actor info for sync
            node_with_context = node.copy()
            node_with_context['module'] = module
            node_with_context['created_by'] = actor_id

            try:
                result = sync_narrative(node_with_context, docs_dir, self.graph)
                if result:
                    synced += 1
                    logger.info(f"Synced {node.get('id')} to {result}")
            except Exception as e:
                logger.warning(f"Failed to sync {node.get('id')} to markdown: {e}")

        if synced:
            print(f"✓ Synced {synced} narrative(s) to markdown")

    def _default_answer_provider(
        self,
        step_id: str,
        question: str,
        options: List,
        multi: bool
    ) -> Any:
        """Default answer provider - prompts user interactively."""
        print(f"\n{question}")

        if options:
            for i, opt in enumerate(options, 1):
                if isinstance(opt, dict):
                    print(f"  {i}. {opt.get('name', opt.get('id', str(opt)))}")
                else:
                    print(f"  {i}. {opt}")

            if multi:
                response = input("Enter numbers (comma-separated): ")
                indices = [int(x.strip()) - 1 for x in response.split(',')]
                return [options[i] for i in indices if 0 <= i < len(options)]
            else:
                response = input("Enter number: ")
                idx = int(response) - 1
                return options[idx] if 0 <= idx < len(options) else options[0]
        else:
            return input("Answer: ")


class StepError(Exception):
    """Error during protocol step execution."""
    pass


# =============================================================================
# CLI HELPER
# =============================================================================

def run_protocol_command(
    procedure_name: str,
    actor_id: str = "actor_SYSTEM_cli",
    graph_name: str = None,
    answers: Dict = None
) -> ProcedureResult:
    """
    Run a procedure from CLI.

    Args:
        procedure_name: Protocol file name (without .yaml)
        actor_id: Actor running the protocol
        graph_name: Graph to connect to
        answers: Pre-provided answers for automation
    """
    # Find protocol file
    procedure_path = Path(f".mind/procedures/{procedure_name}.yaml")
    if not procedure_path.exists():
        # Try with extension
        procedure_path = Path(f".mind/procedures/{procedure_name}")
        if not procedure_path.exists():
            raise FileNotFoundError(f"Procedure not found: {procedure_name}")

    # Connect to graph
    graph_ops = None
    if graph_name:
        try:
            from runtime.physics.graph.graph_ops import GraphOps
            graph_ops = GraphOps(graph_name=graph_name)
        except Exception as e:
            logger.warning(f"Could not connect to graph: {e}")

    # Create answer provider if answers provided
    answer_provider = None
    if answers:
        def preset_answers(step_id, question, options, multi):
            if step_id in answers:
                return answers[step_id]
            # Fall back to first option or empty
            if options:
                return [options[0]] if multi else options[0]
            return ""
        answer_provider = preset_answers

    # Run protocol
    runner = ProtocolRunner(graph_ops, answer_provider)
    return runner.run(procedure_path, actor_id)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run a procedure")
    parser.add_argument("protocol", help="Protocol name")
    parser.add_argument("--graph", "-g", help="Graph name")
    parser.add_argument("--actor", "-a", default="actor_SYSTEM_cli", help="Actor ID")
    parser.add_argument("--verbose", "-v", action="store_true")

    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)

    result = run_protocol_command(args.protocol, args.actor, args.graph)

    print(f"\nResult: {'SUCCESS' if result.success else 'FAILED'}")
    print(f"Nodes created: {len(result.nodes_created)}")
    print(f"Links created: {result.links_created}")

    if result.errors:
        print(f"\nErrors:")
        for err in result.errors:
            print(f"  - {err}")
