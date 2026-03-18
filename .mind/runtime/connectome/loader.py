"""
Connectome Loader

Loads and validates connectome definitions from YAML.

DOCS: docs/membrane/IMPLEMENTATION_Membrane_System.md
"""

import yaml
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field


@dataclass
class StepDefinition:
    """A single step in a connectome."""
    id: str
    type: str  # ask, query, create, update, branch
    next: Optional[str] = None
    # Type-specific fields stored in raw dict
    config: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, step_id: str, data: Dict[str, Any]) -> "StepDefinition":
        """Create step from YAML dict."""
        return cls(
            id=step_id,
            type=data.get("type", "ask"),
            next=data.get("next"),
            config=data,
        )


@dataclass
class ConnectomeDefinition:
    """A complete connectome definition."""
    name: str
    version: str
    description: str
    steps: Dict[str, StepDefinition]
    output: Optional[Dict[str, Any]] = None
    start_step: Optional[str] = None

    @classmethod
    def from_dict(cls, name: str, data: Dict[str, Any]) -> "ConnectomeDefinition":
        """Create connectome from YAML dict."""
        steps = {}
        raw_steps = data.get("steps", {})

        for step_id, step_data in raw_steps.items():
            steps[step_id] = StepDefinition.from_dict(step_id, step_data)

        # Find start step (first one if not specified)
        start = data.get("start")
        if not start and raw_steps:
            start = list(raw_steps.keys())[0]

        return cls(
            name=name,
            version=data.get("version", "1.0"),
            description=data.get("description", ""),
            steps=steps,
            output=data.get("output"),
            start_step=start,
        )

    def get_step(self, step_id: str) -> Optional[StepDefinition]:
        """Get step by ID."""
        return self.steps.get(step_id)

    def get_start_step(self) -> Optional[StepDefinition]:
        """Get the starting step."""
        if self.start_step:
            return self.steps.get(self.start_step)
        return None


class ConnectomeLoader:
    """Loads connectome definitions from files or directory."""

    def __init__(self, connectomes_dir: Optional[Path] = None):
        """
        Initialize loader.

        Args:
            connectomes_dir: Directory containing connectome YAML files
        """
        self.connectomes_dir = connectomes_dir
        self._cache: Dict[str, ConnectomeDefinition] = {}

    def load(self, name: str) -> ConnectomeDefinition:
        """
        Load a connectome by name.

        Args:
            name: Connectome name (filename without .yaml)

        Returns:
            ConnectomeDefinition

        Raises:
            FileNotFoundError: If connectome not found
            ValueError: If connectome is invalid
        """
        if name in self._cache:
            return self._cache[name]

        if not self.connectomes_dir:
            raise ValueError("No connectomes directory configured")

        path = self.connectomes_dir / f"{name}.yaml"
        if not path.exists():
            raise FileNotFoundError(f"Connectome not found: {name}")

        connectome = load_connectome(path)
        self._cache[name] = connectome
        return connectome

    def load_all(self) -> Dict[str, ConnectomeDefinition]:
        """Load all connectomes from directory."""
        if not self.connectomes_dir:
            return {}

        for path in self.connectomes_dir.glob("*.yaml"):
            name = path.stem
            if name not in self._cache:
                try:
                    self._cache[name] = load_connectome(path)
                except Exception as e:
                    print(f"Warning: Failed to load {path}: {e}")

        return self._cache


def load_connectome(path: Path) -> ConnectomeDefinition:
    """
    Load a single connectome from file.

    Args:
        path: Path to YAML file

    Returns:
        ConnectomeDefinition
    """
    with open(path) as f:
        data = yaml.safe_load(f)

    name = data.get("connectome", path.stem)
    return ConnectomeDefinition.from_dict(name, data)


def load_connectome_from_string(yaml_str: str, name: str = None) -> ConnectomeDefinition:
    """
    Load connectome from YAML string.

    Args:
        yaml_str: YAML content
        name: Name to assign (uses connectome: field from YAML if not provided)

    Returns:
        ConnectomeDefinition
    """
    data = yaml.safe_load(yaml_str)
    # Use name from YAML if not provided
    if name is None:
        name = data.get("connectome", "inline")
    return ConnectomeDefinition.from_dict(name, data)
