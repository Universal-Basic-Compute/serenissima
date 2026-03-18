"""
Symbol Extractor — Level 2 Code Structure Extraction

Extracts code symbols (functions, classes, methods, constants) from source files
and upserts them into the graph with rich linking.

DOCS: specs/symbol-extraction.yaml

Usage:
    from runtime.symbol_extractor import SymbolExtractor

    extractor = SymbolExtractor(graph_name="mind")
    result = extractor.extract_directory("engine/")
    print(f"Extracted {result.files} files, {result.symbols} symbols")

Phases:
    1. Discover files (thing_FILE nodes)
    2. Parse symbols (thing_FUNC, thing_CLASS, thing_METHOD, thing_CONST)
    3. Extract relationships (calls, imports, inherits, uses)
    4. Infer test relationships
    5. Link to docs
"""

import ast
import os
import re
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class ExtractedSymbol:
    """A symbol extracted from source code."""
    id: str
    node_type: str  # thing
    type: str       # file, func, class, method, const
    name: str
    description: str
    uri: str
    line_start: int
    line_end: int
    lines: int

    # Optional fields
    weight: float = 1.0
    energy: float = 0.0
    docstring: str = ""
    signature: str = ""
    complexity: int = 0
    parameters: List[str] = field(default_factory=list)
    returns: str = ""
    is_public: bool = True
    is_async: bool = False
    is_generator: bool = False
    is_classmethod: bool = False
    is_staticmethod: bool = False
    is_property: bool = False
    is_dataclass: bool = False
    is_abstract: bool = False
    decorators: List[str] = field(default_factory=list)
    bases: List[str] = field(default_factory=list)
    method_count: int = 0
    public_method_count: int = 0
    value: str = ""
    value_type: str = ""

    # File-specific
    language: str = ""
    size_bytes: int = 0
    last_modified_s: int = 0
    imports_raw: List[str] = field(default_factory=list)


@dataclass
class ExtractedLink:
    """A relationship between symbols."""
    id: str
    node_a: str
    node_b: str
    type: str           # contains, relates
    direction: str = "" # calls, imports, inherits, uses, tests, documented_by
    call_count: int = 0
    import_type: str = ""
    alias: str = ""
    inference: str = ""
    weight: float = 1.0
    energy: float = 0.0


@dataclass
class ExtractionResult:
    """Result of extraction run."""
    files: int = 0
    symbols: int = 0
    links: int = 0
    errors: List[str] = field(default_factory=list)
    extracted_files: List[str] = field(default_factory=list)


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    # Replace path separators and special chars with hyphens
    slug = re.sub(r'[/\\._]', '-', text)
    # Remove non-alphanumeric except hyphens
    slug = re.sub(r'[^a-zA-Z0-9-]', '', slug)
    # Collapse multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    # Remove leading/trailing hyphens
    return slug.strip('-').lower()


def calculate_complexity(node: ast.AST) -> int:
    """Calculate cyclomatic complexity of an AST node."""
    complexity = 1  # Base complexity

    for child in ast.walk(node):
        # Decision points
        if isinstance(child, (ast.If, ast.While, ast.For, ast.AsyncFor)):
            complexity += 1
        elif isinstance(child, ast.ExceptHandler):
            complexity += 1
        elif isinstance(child, (ast.And, ast.Or)):
            complexity += 1
        elif isinstance(child, ast.comprehension):
            complexity += 1
        elif isinstance(child, ast.Assert):
            complexity += 1
        # Match cases (Python 3.10+)
        elif hasattr(ast, 'match_case') and isinstance(child, ast.match_case):
            complexity += 1

    return complexity


def get_docstring_first_line(docstring: Optional[str]) -> str:
    """Extract first line of docstring as description."""
    if not docstring:
        return ""
    lines = docstring.strip().split('\n')
    return lines[0].strip() if lines else ""


def get_return_annotation(node: ast.FunctionDef) -> str:
    """Get return type annotation as string."""
    if node.returns:
        return ast.unparse(node.returns)
    return ""


def get_signature(node: ast.FunctionDef) -> str:
    """Build function signature string."""
    args = []

    # Regular args
    for i, arg in enumerate(node.args.args):
        arg_str = arg.arg
        if arg.annotation:
            arg_str += f": {ast.unparse(arg.annotation)}"
        # Check for default value
        defaults_offset = len(node.args.args) - len(node.args.defaults)
        if i >= defaults_offset:
            default = node.args.defaults[i - defaults_offset]
            arg_str += f" = {ast.unparse(default)}"
        args.append(arg_str)

    # *args
    if node.args.vararg:
        vararg = f"*{node.args.vararg.arg}"
        if node.args.vararg.annotation:
            vararg += f": {ast.unparse(node.args.vararg.annotation)}"
        args.append(vararg)

    # **kwargs
    if node.args.kwarg:
        kwarg = f"**{node.args.kwarg.arg}"
        if node.args.kwarg.annotation:
            kwarg += f": {ast.unparse(node.args.kwarg.annotation)}"
        args.append(kwarg)

    sig = f"{node.name}({', '.join(args)})"

    if node.returns:
        sig += f" -> {ast.unparse(node.returns)}"

    return sig


def has_decorator(node: ast.FunctionDef, name: str) -> bool:
    """Check if function has a specific decorator."""
    for dec in node.decorator_list:
        if isinstance(dec, ast.Name) and dec.id == name:
            return True
        if isinstance(dec, ast.Attribute) and dec.attr == name:
            return True
        if isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name) and dec.func.id == name:
                return True
            if isinstance(dec.func, ast.Attribute) and dec.func.attr == name:
                return True
    return False


def get_decorators(node: ast.FunctionDef | ast.ClassDef) -> List[str]:
    """Get list of decorator names."""
    decorators = []
    for dec in node.decorator_list:
        if isinstance(dec, ast.Name):
            decorators.append(f"@{dec.id}")
        elif isinstance(dec, ast.Attribute):
            decorators.append(f"@{ast.unparse(dec)}")
        elif isinstance(dec, ast.Call):
            if isinstance(dec.func, ast.Name):
                decorators.append(f"@{dec.func.id}")
            elif isinstance(dec.func, ast.Attribute):
                decorators.append(f"@{ast.unparse(dec.func)}")
    return decorators


# =============================================================================
# PYTHON AST EXTRACTOR
# =============================================================================

class PythonExtractor:
    """Extract symbols from Python source files."""

    def __init__(self, base_path: Path):
        self.base_path = base_path
        self.constant_pattern = re.compile(r'^[A-Z][A-Z0-9_]*$')

    def extract_file(self, file_path: Path) -> Tuple[List[ExtractedSymbol], List[ExtractedLink]]:
        """Extract all symbols from a Python file."""
        symbols: List[ExtractedSymbol] = []
        links: List[ExtractedLink] = []

        try:
            content = file_path.read_text(encoding='utf-8')
            tree = ast.parse(content, filename=str(file_path))
        except SyntaxError as e:
            logger.warning(f"Syntax error in {file_path}: {e}")
            return symbols, links
        except Exception as e:
            logger.warning(f"Failed to parse {file_path}: {e}")
            return symbols, links

        rel_path = str(file_path.relative_to(self.base_path))
        file_slug = slugify(rel_path)
        file_id = f"thing_FILE_{file_slug}"

        # Create file node
        stat = file_path.stat()
        lines = content.count('\n') + 1
        module_docstring = ast.get_docstring(tree) or ""

        file_symbol = ExtractedSymbol(
            id=file_id,
            node_type="thing",
            type="file",
            name=file_path.name,
            description=get_docstring_first_line(module_docstring),
            uri=rel_path,
            line_start=1,
            line_end=lines,
            lines=lines,
            language="python",
            size_bytes=stat.st_size,
            last_modified_s=int(stat.st_mtime),
            docstring=module_docstring,
            imports_raw=self._extract_imports_raw(tree),
        )
        symbols.append(file_symbol)

        # Extract top-level symbols
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                func_symbols, func_links = self._extract_function(node, file_id, file_slug, rel_path)
                symbols.extend(func_symbols)
                links.extend(func_links)

            elif isinstance(node, ast.ClassDef):
                class_symbols, class_links = self._extract_class(node, file_id, file_slug, rel_path)
                symbols.extend(class_symbols)
                links.extend(class_links)

            elif isinstance(node, ast.Assign):
                const_symbols, const_links = self._extract_constants(node, file_id, file_slug, rel_path)
                symbols.extend(const_symbols)
                links.extend(const_links)

            elif isinstance(node, ast.AnnAssign) and node.target:
                const_symbols, const_links = self._extract_annotated_constant(node, file_id, file_slug, rel_path)
                symbols.extend(const_symbols)
                links.extend(const_links)

        # Extract call relationships
        call_links = self._extract_calls(tree, file_slug, rel_path, symbols)
        links.extend(call_links)

        # Extract import relationships
        import_links = self._extract_import_links(tree, file_id, rel_path)
        links.extend(import_links)

        return symbols, links

    def _extract_imports_raw(self, tree: ast.Module) -> List[str]:
        """Extract raw import statements."""
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(f"import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                names = ", ".join(a.name for a in node.names)
                imports.append(f"from {module} import {names}")
        return imports

    def _extract_function(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        file_id: str,
        file_slug: str,
        rel_path: str
    ) -> Tuple[List[ExtractedSymbol], List[ExtractedLink]]:
        """Extract a top-level function."""
        symbols = []
        links = []

        func_name = node.name
        func_slug = slugify(func_name)
        func_id = f"thing_FUNC_{file_slug}_{func_slug}"

        docstring = ast.get_docstring(node) or ""
        is_async = isinstance(node, ast.AsyncFunctionDef)
        is_generator = any(isinstance(n, (ast.Yield, ast.YieldFrom)) for n in ast.walk(node))

        # Get parameters (excluding self/cls)
        params = [arg.arg for arg in node.args.args if arg.arg not in ('self', 'cls')]

        func_symbol = ExtractedSymbol(
            id=func_id,
            node_type="thing",
            type="func",
            name=func_name,
            description=get_docstring_first_line(docstring),
            uri=f"{rel_path}::{func_name}",
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno,
            lines=(node.end_lineno or node.lineno) - node.lineno + 1,
            docstring=docstring,
            signature=get_signature(node),
            complexity=calculate_complexity(node),
            parameters=params,
            returns=get_return_annotation(node),
            is_public=not func_name.startswith('_'),
            is_async=is_async,
            is_generator=is_generator,
            decorators=get_decorators(node),
        )
        symbols.append(func_symbol)

        # Link: file contains function
        links.append(ExtractedLink(
            id=f"contains_{file_slug}_to_{func_slug}",
            node_a=file_id,
            node_b=func_id,
            type="contains",
        ))

        return symbols, links

    def _extract_class(
        self,
        node: ast.ClassDef,
        file_id: str,
        file_slug: str,
        rel_path: str
    ) -> Tuple[List[ExtractedSymbol], List[ExtractedLink]]:
        """Extract a class and its methods."""
        symbols = []
        links = []

        class_name = node.name
        class_slug = slugify(class_name)
        class_id = f"thing_CLASS_{file_slug}_{class_slug}"

        docstring = ast.get_docstring(node) or ""
        bases = [ast.unparse(base) for base in node.bases]
        decorators = get_decorators(node)

        # Check for dataclass/abstract
        is_dataclass = any('dataclass' in d for d in decorators)
        is_abstract = any('ABC' in b or 'Abstract' in b for b in bases)

        # Count methods
        methods = [n for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        public_methods = [m for m in methods if not m.name.startswith('_')]

        class_symbol = ExtractedSymbol(
            id=class_id,
            node_type="thing",
            type="class",
            name=class_name,
            description=get_docstring_first_line(docstring),
            uri=f"{rel_path}::{class_name}",
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno,
            lines=(node.end_lineno or node.lineno) - node.lineno + 1,
            docstring=docstring,
            bases=bases,
            decorators=decorators,
            is_dataclass=is_dataclass,
            is_abstract=is_abstract,
            method_count=len(methods),
            public_method_count=len(public_methods),
            is_public=not class_name.startswith('_'),
        )
        symbols.append(class_symbol)

        # Link: file contains class
        links.append(ExtractedLink(
            id=f"contains_{file_slug}_to_{class_slug}",
            node_a=file_id,
            node_b=class_id,
            type="contains",
        ))

        # Extract methods
        for method_node in methods:
            method_symbols, method_links = self._extract_method(
                method_node, class_id, class_slug, file_slug, rel_path, class_name
            )
            symbols.extend(method_symbols)
            links.extend(method_links)

        return symbols, links

    def _extract_method(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        class_id: str,
        class_slug: str,
        file_slug: str,
        rel_path: str,
        class_name: str
    ) -> Tuple[List[ExtractedSymbol], List[ExtractedLink]]:
        """Extract a method from a class."""
        symbols = []
        links = []

        method_name = node.name
        method_slug = slugify(method_name)
        method_id = f"thing_METHOD_{file_slug}_{class_slug}_{method_slug}"

        docstring = ast.get_docstring(node) or ""
        is_async = isinstance(node, ast.AsyncFunctionDef)

        # Get parameters (excluding self/cls)
        params = [arg.arg for arg in node.args.args if arg.arg not in ('self', 'cls')]

        method_symbol = ExtractedSymbol(
            id=method_id,
            node_type="thing",
            type="method",
            name=method_name,
            description=get_docstring_first_line(docstring),
            uri=f"{rel_path}::{class_name}.{method_name}",
            line_start=node.lineno,
            line_end=node.end_lineno or node.lineno,
            lines=(node.end_lineno or node.lineno) - node.lineno + 1,
            docstring=docstring,
            signature=get_signature(node),
            complexity=calculate_complexity(node),
            parameters=params,
            returns=get_return_annotation(node),
            is_public=not method_name.startswith('_'),
            is_async=is_async,
            is_classmethod=has_decorator(node, 'classmethod'),
            is_staticmethod=has_decorator(node, 'staticmethod'),
            is_property=has_decorator(node, 'property'),
            decorators=get_decorators(node),
        )
        symbols.append(method_symbol)

        # Link: class contains method
        links.append(ExtractedLink(
            id=f"contains_{class_slug}_to_{method_slug}",
            node_a=class_id,
            node_b=method_id,
            type="contains",
        ))

        return symbols, links

    def _extract_constants(
        self,
        node: ast.Assign,
        file_id: str,
        file_slug: str,
        rel_path: str
    ) -> Tuple[List[ExtractedSymbol], List[ExtractedLink]]:
        """Extract module-level constants (UPPER_SNAKE_CASE)."""
        symbols = []
        links = []

        for target in node.targets:
            if isinstance(target, ast.Name) and self.constant_pattern.match(target.id):
                const_name = target.id
                const_slug = slugify(const_name)
                const_id = f"thing_CONST_{file_slug}_{const_slug}"

                # Try to get value as string
                try:
                    value = ast.unparse(node.value)
                except:
                    value = "<complex>"

                # Infer type
                value_type = type(ast.literal_eval(node.value)).__name__ if self._is_literal(node.value) else "unknown"

                const_symbol = ExtractedSymbol(
                    id=const_id,
                    node_type="thing",
                    type="const",
                    name=const_name,
                    description="",
                    uri=f"{rel_path}::{const_name}",
                    line_start=node.lineno,
                    line_end=node.lineno,
                    lines=1,
                    value=value[:200],  # Truncate long values
                    value_type=value_type,
                    weight=0.5,
                )
                symbols.append(const_symbol)

                # Link: file contains constant
                links.append(ExtractedLink(
                    id=f"contains_{file_slug}_to_{const_slug}",
                    node_a=file_id,
                    node_b=const_id,
                    type="contains",
                ))

        return symbols, links

    def _extract_annotated_constant(
        self,
        node: ast.AnnAssign,
        file_id: str,
        file_slug: str,
        rel_path: str
    ) -> Tuple[List[ExtractedSymbol], List[ExtractedLink]]:
        """Extract annotated module-level constants."""
        symbols = []
        links = []

        if isinstance(node.target, ast.Name) and self.constant_pattern.match(node.target.id):
            const_name = node.target.id
            const_slug = slugify(const_name)
            const_id = f"thing_CONST_{file_slug}_{const_slug}"

            value = ast.unparse(node.value) if node.value else ""
            value_type = ast.unparse(node.annotation) if node.annotation else "unknown"

            const_symbol = ExtractedSymbol(
                id=const_id,
                node_type="thing",
                type="const",
                name=const_name,
                description="",
                uri=f"{rel_path}::{const_name}",
                line_start=node.lineno,
                line_end=node.lineno,
                lines=1,
                value=value[:200],
                value_type=value_type,
                weight=0.5,
            )
            symbols.append(const_symbol)

            links.append(ExtractedLink(
                id=f"contains_{file_slug}_to_{const_slug}",
                node_a=file_id,
                node_b=const_id,
                type="contains",
            ))

        return symbols, links

    def _is_literal(self, node: ast.AST) -> bool:
        """Check if node is a literal value."""
        try:
            ast.literal_eval(node)
            return True
        except:
            return False

    def _extract_calls(
        self,
        tree: ast.Module,
        file_slug: str,
        rel_path: str,
        symbols: List[ExtractedSymbol]
    ) -> List[ExtractedLink]:
        """Extract call relationships within the file."""
        links = []
        symbol_names = {s.name: s.id for s in symbols if s.type in ('func', 'method')}

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                caller_slug = slugify(node.name)
                caller_id = f"thing_FUNC_{file_slug}_{caller_slug}"

                # Check if this is a method
                # (simplified - would need parent tracking for accuracy)

                # Count calls to other symbols in this file
                call_counts: Dict[str, int] = {}
                for child in ast.walk(node):
                    if isinstance(child, ast.Call):
                        callee_name = None
                        if isinstance(child.func, ast.Name):
                            callee_name = child.func.id
                        elif isinstance(child.func, ast.Attribute):
                            callee_name = child.func.attr

                        if callee_name and callee_name in symbol_names:
                            call_counts[callee_name] = call_counts.get(callee_name, 0) + 1

                for callee_name, count in call_counts.items():
                    callee_id = symbol_names[callee_name]
                    links.append(ExtractedLink(
                        id=f"rel_{caller_slug}_calls_{slugify(callee_name)}",
                        node_a=caller_id,
                        node_b=callee_id,
                        type="relates",
                        direction="calls",
                        call_count=count,
                    ))

        return links

    def _extract_import_links(
        self,
        tree: ast.Module,
        file_id: str,
        rel_path: str
    ) -> List[ExtractedLink]:
        """Extract import relationships (file-level only, local imports)."""
        links = []

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and not self._is_external_module(node.module):
                    # Try to resolve to local file
                    target_path = self._resolve_import(node.module, rel_path)
                    if target_path:
                        target_slug = slugify(target_path)
                        target_id = f"thing_FILE_{target_slug}"

                        links.append(ExtractedLink(
                            id=f"rel_{slugify(rel_path)}_imports_{target_slug}",
                            node_a=file_id,
                            node_b=target_id,
                            type="relates",
                            direction="imports",
                            import_type="from",
                        ))

        return links

    def _is_external_module(self, module: str) -> bool:
        """Check if module is external (stdlib or third-party)."""
        # Simple heuristic: if it doesn't start with known local prefixes
        local_prefixes = ('engine', 'mind', 'tools', 'app', 'tests')
        first_part = module.split('.')[0]
        return first_part not in local_prefixes

    def _resolve_import(self, module: str, from_file: str) -> Optional[str]:
        """Resolve import to local file path."""
        # Convert module.path to file path
        parts = module.split('.')
        potential_paths = [
            '/'.join(parts) + '.py',
            '/'.join(parts) + '/__init__.py',
        ]

        for path in potential_paths:
            full_path = self.base_path / path
            if full_path.exists():
                return path

        return None


# =============================================================================
# TEST INFERENCE (Phase 4)
# =============================================================================

class TestInferrer:
    """Infer test-to-source symbol relationships."""

    def __init__(self, base_path: Path):
        self.base_path = base_path
        # Pattern for explicit test markers: # TESTS: symbol_name
        self.explicit_marker = re.compile(r'#\s*TESTS?:\s*([a-zA-Z_][a-zA-Z0-9_.,\s]*)')

    def infer_test_links(
        self,
        symbols: List[ExtractedSymbol],
        test_files: List[Path]
    ) -> List[ExtractedLink]:
        """
        Infer which test functions test which source symbols.

        Strategies:
        1. naming_convention: test_foo tests foo
        2. file_convention: test_tick.py tests tick.py
        3. call_analysis: Test calls symbol directly
        4. explicit_marker: # TESTS: symbol_name
        """
        links = []

        # Build indices
        source_funcs = {s.name: s for s in symbols if s.type == 'func' and not s.uri.startswith('tests/')}
        source_methods = {s.name: s for s in symbols if s.type == 'method' and not s.uri.startswith('tests/')}
        source_classes = {s.name: s for s in symbols if s.type == 'class' and not s.uri.startswith('tests/')}
        test_funcs = [s for s in symbols if s.type == 'func' and 'test' in s.uri.lower()]

        # Also index source files for file convention
        source_files = {Path(s.uri).stem: s for s in symbols if s.type == 'file' and not s.uri.startswith('tests/')}

        for test_func in test_funcs:
            test_name = test_func.name

            # Strategy 1: Naming convention (test_foo -> foo)
            if test_name.startswith('test_'):
                target_name = test_name[5:]  # Remove 'test_' prefix

                # Check functions
                if target_name in source_funcs:
                    links.append(self._create_test_link(
                        test_func, source_funcs[target_name], 'naming'
                    ))

                # Check methods
                if target_name in source_methods:
                    links.append(self._create_test_link(
                        test_func, source_methods[target_name], 'naming'
                    ))

                # Check classes (TestFoo -> Foo pattern)
                if target_name in source_classes:
                    links.append(self._create_test_link(
                        test_func, source_classes[target_name], 'naming'
                    ))

            # Strategy 2: File convention (tests/test_tick.py -> tick.py)
            test_file_stem = Path(test_func.uri.split('::')[0]).stem
            if test_file_stem.startswith('test_'):
                source_stem = test_file_stem[5:]
                if source_stem in source_files:
                    # Link test function to source file
                    links.append(ExtractedLink(
                        id=f"rel_{slugify(test_func.id)}_tests_{slugify(source_files[source_stem].id)}",
                        node_a=test_func.id,
                        node_b=source_files[source_stem].id,
                        type="relates",
                        direction="tests",
                        inference="file_convention",
                    ))

        # Strategy 4: Explicit markers from test file content
        for test_file in test_files:
            explicit_links = self._extract_explicit_markers(test_file, symbols)
            links.extend(explicit_links)

        return links

    def _create_test_link(
        self,
        test_symbol: ExtractedSymbol,
        source_symbol: ExtractedSymbol,
        inference: str
    ) -> ExtractedLink:
        """Create a test->source link."""
        return ExtractedLink(
            id=f"rel_{slugify(test_symbol.id)}_tests_{slugify(source_symbol.id)}",
            node_a=test_symbol.id,
            node_b=source_symbol.id,
            type="relates",
            direction="tests",
            inference=inference,
        )

    def _extract_explicit_markers(
        self,
        test_file: Path,
        symbols: List[ExtractedSymbol]
    ) -> List[ExtractedLink]:
        """Extract explicit # TESTS: markers from test file."""
        links = []

        try:
            content = test_file.read_text(encoding='utf-8')
        except Exception:
            return links

        # Build symbol name index
        symbol_by_name = {s.name: s for s in symbols if s.type in ('func', 'method', 'class')}

        # Find all TESTS markers
        for match in self.explicit_marker.finditer(content):
            target_names = [n.strip() for n in match.group(1).split(',')]

            # Find line number to identify which test function this is near
            line_num = content[:match.start()].count('\n') + 1

            # Find the test function at or after this line
            test_func = self._find_test_at_line(test_file, symbols, line_num)
            if not test_func:
                continue

            for target_name in target_names:
                if target_name in symbol_by_name:
                    links.append(ExtractedLink(
                        id=f"rel_{slugify(test_func.id)}_tests_{slugify(symbol_by_name[target_name].id)}",
                        node_a=test_func.id,
                        node_b=symbol_by_name[target_name].id,
                        type="relates",
                        direction="tests",
                        inference="explicit",
                    ))

        return links

    def _find_test_at_line(
        self,
        test_file: Path,
        symbols: List[ExtractedSymbol],
        line_num: int
    ) -> Optional[ExtractedSymbol]:
        """Find the test function that contains or follows a line number."""
        rel_path = str(test_file.relative_to(self.base_path))
        file_funcs = [
            s for s in symbols
            if s.type == 'func'
            and s.uri.startswith(rel_path)
            and s.name.startswith('test')
        ]

        # Find the function that contains this line or starts right after
        for func in sorted(file_funcs, key=lambda f: f.line_start):
            if func.line_start >= line_num or (func.line_start <= line_num <= func.line_end):
                return func

        return None


# =============================================================================
# DOCS LINKING (Phase 5)
# =============================================================================

class DocsLinker:
    """Link symbols to documentation files."""

    def __init__(self, base_path: Path):
        self.base_path = base_path
        # Pattern for explicit doc markers: # DOCS: path/to/doc.md
        self.docs_marker = re.compile(r'#\s*DOCS?:\s*([^\n]+)')

    def link_docs(
        self,
        symbols: List[ExtractedSymbol],
        docs_dir: str = "docs"
    ) -> List[ExtractedLink]:
        """
        Link symbols to documentation.

        Strategies:
        1. docs_comment: # DOCS: path/to/doc.md in source
        2. implementation_reference: IMPLEMENTATION.md mentions symbol
        3. naming_convention: Module name matches doc folder
        """
        links = []
        docs_path = self.base_path / docs_dir

        if not docs_path.exists():
            return links

        # Find all narrative docs (IMPLEMENTATION, PATTERNS, etc.)
        narratives = self._find_narrative_docs(docs_path)

        # Strategy 1: Explicit doc markers in source files
        for symbol in symbols:
            if symbol.type == 'file':
                file_path = self.base_path / symbol.uri
                if file_path.exists():
                    explicit_links = self._extract_docs_markers(file_path, symbol, narratives)
                    links.extend(explicit_links)

        # Strategy 2: IMPLEMENTATION.md references
        for narrative_path, narrative_content in narratives.items():
            ref_links = self._find_symbol_references(narrative_path, narrative_content, symbols)
            links.extend(ref_links)

        # Strategy 3: Module-doc folder naming convention
        module_links = self._link_by_module_convention(symbols, docs_path)
        links.extend(module_links)

        return links

    def _find_narrative_docs(self, docs_path: Path) -> Dict[str, str]:
        """Find all narrative documentation files."""
        narratives = {}
        patterns = ['IMPLEMENTATION_*.md', 'PATTERNS_*.md', 'ALGORITHM_*.md', 'VALIDATION_*.md']

        for pattern in patterns:
            for doc_file in docs_path.rglob(pattern):
                try:
                    narratives[str(doc_file.relative_to(self.base_path))] = doc_file.read_text(encoding='utf-8')
                except Exception:
                    pass

        return narratives

    def _extract_docs_markers(
        self,
        file_path: Path,
        file_symbol: ExtractedSymbol,
        narratives: Dict[str, str]
    ) -> List[ExtractedLink]:
        """Extract # DOCS: markers from source file."""
        links = []

        try:
            content = file_path.read_text(encoding='utf-8')
        except Exception:
            return links

        for match in self.docs_marker.finditer(content):
            doc_path = match.group(1).strip()

            # Normalize path
            if doc_path in narratives:
                narrative_id = f"narrative_{slugify(doc_path)}"
                links.append(ExtractedLink(
                    id=f"rel_{slugify(file_symbol.id)}_documented_by_{slugify(narrative_id)}",
                    node_a=file_symbol.id,
                    node_b=narrative_id,
                    type="relates",
                    direction="documented_by",
                ))

        return links

    def _find_symbol_references(
        self,
        narrative_path: str,
        content: str,
        symbols: List[ExtractedSymbol]
    ) -> List[ExtractedLink]:
        """Find symbol names referenced in documentation."""
        links = []
        narrative_id = f"narrative_{slugify(narrative_path)}"

        # Look for code references like `function_name` or `ClassName`
        code_refs = re.findall(r'`([a-zA-Z_][a-zA-Z0-9_]*)`', content)

        # Also look for file paths like engine/physics/tick.py
        path_refs = re.findall(r'([a-zA-Z_][a-zA-Z0-9_/]*\.py)', content)

        symbol_names = {s.name: s for s in symbols}
        symbol_uris = {s.uri.split('::')[0]: s for s in symbols if s.type == 'file'}

        for ref in code_refs:
            if ref in symbol_names:
                symbol = symbol_names[ref]
                links.append(ExtractedLink(
                    id=f"rel_{slugify(symbol.id)}_documented_by_{slugify(narrative_id)}",
                    node_a=symbol.id,
                    node_b=narrative_id,
                    type="relates",
                    direction="documented_by",
                ))

        for path_ref in path_refs:
            if path_ref in symbol_uris:
                symbol = symbol_uris[path_ref]
                links.append(ExtractedLink(
                    id=f"rel_{slugify(symbol.id)}_documented_by_{slugify(narrative_id)}",
                    node_a=symbol.id,
                    node_b=narrative_id,
                    type="relates",
                    direction="documented_by",
                ))

        return links

    def _link_by_module_convention(
        self,
        symbols: List[ExtractedSymbol],
        docs_path: Path
    ) -> List[ExtractedLink]:
        """Link source modules to doc folders with matching names."""
        links = []

        # Find source directories
        source_dirs = set()
        for symbol in symbols:
            if symbol.type == 'file':
                parent = Path(symbol.uri).parent
                if str(parent) != '.':
                    source_dirs.add(str(parent))

        # Check for matching doc folders
        for source_dir in source_dirs:
            # Try different doc folder naming patterns
            module_name = Path(source_dir).name
            potential_doc_folders = [
                docs_path / module_name,
                docs_path / source_dir,
            ]

            for doc_folder in potential_doc_folders:
                if doc_folder.exists() and doc_folder.is_dir():
                    # Find IMPLEMENTATION or PATTERNS file
                    for pattern in ['IMPLEMENTATION_*.md', 'PATTERNS_*.md']:
                        for doc_file in doc_folder.glob(pattern):
                            narrative_id = f"narrative_{slugify(str(doc_file.relative_to(self.base_path)))}"

                            # Link all files in this source directory
                            for symbol in symbols:
                                if symbol.type == 'file' and symbol.uri.startswith(source_dir + '/'):
                                    links.append(ExtractedLink(
                                        id=f"rel_{slugify(symbol.id)}_documented_by_{slugify(narrative_id)}",
                                        node_a=symbol.id,
                                        node_b=narrative_id,
                                        type="relates",
                                        direction="documented_by",
                                    ))
                            break  # Only link first matching doc
                    break  # Only link first matching folder

        return links


# =============================================================================
# MAIN EXTRACTOR CLASS
# =============================================================================

class SymbolExtractor:
    """
    Main symbol extractor that coordinates extraction and graph upsert.

    Usage:
        extractor = SymbolExtractor(graph_name="mind")
        result = extractor.extract_directory("engine/")
    """

    def __init__(
        self,
        graph_name: str = "mind",
        host: str = "localhost",
        port: int = 6379,
        base_path: Path = None
    ):
        self.graph_name = graph_name
        self.host = host
        self.port = port
        self.base_path = base_path or Path.cwd()
        self.graph_ops = None

        # Language-specific extractors
        self.extractors = {
            '.py': PythonExtractor(self.base_path),
        }

        # Phase 4 & 5 processors
        self.test_inferrer = TestInferrer(self.base_path)
        self.docs_linker = DocsLinker(self.base_path)

        # Config
        self.include_dirs = ['engine/', 'mind/', 'tools/', 'tests/']
        self.exclude_patterns = [
            '**/node_modules/**',
            '**/__pycache__/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/.venv/**',
            '**/venv/**',
        ]

    def _connect_graph(self) -> bool:
        """Connect to FalkorDB graph."""
        if self.graph_ops:
            return True

        try:
            from runtime.physics.graph.graph_ops import GraphOps
            self.graph_ops = GraphOps(
                graph_name=self.graph_name,
                host=self.host,
                port=self.port
            )
            logger.info(f"Connected to graph: {self.graph_name}")
            return True
        except ImportError:
            logger.warning("GraphOps not available (engine not installed)")
            return False
        except Exception as e:
            logger.warning(f"Failed to connect to graph: {e}")
            return False

    def extract_directory(
        self,
        directory: str = None,
        upsert: bool = True
    ) -> ExtractionResult:
        """
        Extract symbols from a directory and optionally upsert to graph.

        Args:
            directory: Directory to scan (relative to base_path)
            upsert: If True, upsert nodes/links to graph

        Returns:
            ExtractionResult with counts and any errors
        """
        result = ExtractionResult()

        if upsert and not self._connect_graph():
            result.errors.append("Failed to connect to graph")
            upsert = False  # Continue extraction without upsert

        # Determine directories to scan
        if directory:
            scan_dirs = [self.base_path / directory]
        else:
            scan_dirs = [self.base_path / d for d in self.include_dirs]

        all_symbols: List[ExtractedSymbol] = []
        all_links: List[ExtractedLink] = []
        test_files: List[Path] = []

        # Phase 1 & 2: Files and Symbols
        for scan_dir in scan_dirs:
            if not scan_dir.exists():
                continue

            for file_path in self._iter_source_files(scan_dir):
                ext = file_path.suffix
                extractor = self.extractors.get(ext)

                if not extractor:
                    continue

                try:
                    symbols, links = extractor.extract_file(file_path)
                    all_symbols.extend(symbols)
                    all_links.extend(links)
                    result.files += 1
                    result.extracted_files.append(str(file_path.relative_to(self.base_path)))

                    # Track test files for phase 4
                    if 'test' in str(file_path).lower():
                        test_files.append(file_path)
                except Exception as e:
                    result.errors.append(f"{file_path}: {e}")

        # Phase 4: Test inference
        try:
            test_links = self.test_inferrer.infer_test_links(all_symbols, test_files)
            all_links.extend(test_links)
            logger.info(f"Inferred {len(test_links)} test links")
        except Exception as e:
            result.errors.append(f"Test inference: {e}")

        # Phase 5: Docs linking
        try:
            docs_links = self.docs_linker.link_docs(all_symbols)
            all_links.extend(docs_links)
            logger.info(f"Created {len(docs_links)} docs links")
        except Exception as e:
            result.errors.append(f"Docs linking: {e}")

        result.symbols = len(all_symbols)
        result.links = len(all_links)

        # Upsert to graph
        if upsert and self.graph_ops:
            upsert_errors = self._upsert_to_graph(all_symbols, all_links)
            result.errors.extend(upsert_errors)

        return result

    def _iter_source_files(self, directory: Path):
        """Iterate over source files, respecting exclude patterns."""
        import fnmatch

        for root, dirs, files in os.walk(directory):
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if not any(
                fnmatch.fnmatch(os.path.join(root, d), pat.replace('**/', ''))
                for pat in self.exclude_patterns
            )]

            for filename in files:
                file_path = Path(root) / filename

                # Check exclude patterns
                rel_path = str(file_path.relative_to(self.base_path))
                if any(fnmatch.fnmatch(rel_path, pat.replace('**/', '*')) for pat in self.exclude_patterns):
                    continue

                # Check if we have an extractor for this extension
                if file_path.suffix in self.extractors:
                    yield file_path

    def _upsert_to_graph(
        self,
        symbols: List[ExtractedSymbol],
        links: List[ExtractedLink]
    ) -> List[str]:
        """Upsert symbols and links to graph."""
        errors = []

        # Upsert symbols
        for symbol in symbols:
            try:
                self._upsert_symbol(symbol)
            except Exception as e:
                errors.append(f"Symbol {symbol.id}: {e}")

        # Upsert links
        for link in links:
            try:
                self._upsert_link(link)
            except Exception as e:
                errors.append(f"Link {link.id}: {e}")

        return errors

    def _upsert_symbol(self, symbol: ExtractedSymbol) -> None:
        """Upsert a symbol node to the graph using unified inject()."""
        from runtime.inject import inject

        # Build properties dict
        props = {
            'id': symbol.id,
            'label': 'Thing',  # All symbols are things
            'node_type': symbol.node_type,
            'type': symbol.type,
            'name': symbol.name,
            'content': symbol.description,  # description -> content for synthesis
            'uri': symbol.uri,
            'weight': symbol.weight,
            'energy': symbol.energy,
            'line_start': symbol.line_start,
            'line_end': symbol.line_end,
            'lines': symbol.lines,
        }

        # Add type-specific properties
        if symbol.type == 'file':
            props.update({
                'language': symbol.language,
                'size_bytes': symbol.size_bytes,
                'last_modified_s': symbol.last_modified_s,
            })
        elif symbol.type in ('func', 'method'):
            props.update({
                'signature': symbol.signature,
                'complexity': symbol.complexity,
                'is_public': symbol.is_public,
                'is_async': symbol.is_async,
                'returns': symbol.returns,
            })
        elif symbol.type == 'class':
            props.update({
                'method_count': symbol.method_count,
                'public_method_count': symbol.public_method_count,
                'is_dataclass': symbol.is_dataclass,
                'is_abstract': symbol.is_abstract,
                'is_public': symbol.is_public,
            })
        elif symbol.type == 'const':
            props.update({
                'value': symbol.value,
                'value_type': symbol.value_type,
            })

        # Use canonical inject (no context - bulk extraction operation)
        adapter = self.graph_ops._adapter
        inject(adapter, props, with_context=False)

    def _upsert_link(self, link: ExtractedLink) -> None:
        """Upsert a link to the graph using unified inject()."""
        from runtime.inject import inject

        # Build link data for inject
        link_data = {
            'from': link.node_a,
            'to': link.node_b,
            'verb': link.type.lower(),
            'weight': link.weight,
            'energy': link.energy,
        }

        if link.direction:
            link_data['direction'] = link.direction
        if link.call_count:
            link_data['call_count'] = link.call_count
        if link.import_type:
            link_data['import_type'] = link.import_type

        # Use canonical inject (no context - bulk extraction operation)
        adapter = self.graph_ops._adapter
        inject(adapter, link_data, with_context=False)


# =============================================================================
# CLI INTERFACE
# =============================================================================

def extract_symbols_command(
    directory: str = None,
    graph_name: str = None,
    dry_run: bool = False
) -> ExtractionResult:
    """
    CLI command to extract symbols.

    Args:
        directory: Directory to scan
        graph_name: Graph name (defaults to repo name)
        dry_run: If True, extract but don't upsert

    Returns:
        ExtractionResult
    """
    base_path = Path.cwd()
    graph_name = graph_name or base_path.name

    extractor = SymbolExtractor(
        graph_name=graph_name,
        base_path=base_path
    )

    result = extractor.extract_directory(
        directory=directory,
        upsert=not dry_run
    )

    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Extract code symbols to graph")
    parser.add_argument("--dir", "-d", help="Directory to scan")
    parser.add_argument("--graph", "-g", help="Graph name")
    parser.add_argument("--dry-run", action="store_true", help="Extract without upsert")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")

    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)

    result = extract_symbols_command(
        directory=args.dir,
        graph_name=args.graph,
        dry_run=args.dry_run
    )

    print(f"\nExtraction complete:")
    print(f"  Files: {result.files}")
    print(f"  Symbols: {result.symbols}")
    print(f"  Links: {result.links}")

    if result.errors:
        print(f"\nErrors ({len(result.errors)}):")
        for error in result.errors[:10]:
            print(f"  - {error}")
        if len(result.errors) > 10:
            print(f"  ... and {len(result.errors) - 10} more")
