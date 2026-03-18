"""
Graph Operations: Image Generation Helpers

Standalone helper functions for node image generation.
Extracted from graph_ops.py to reduce file size.

Usage:
    from runtime.physics.graph.graph_ops_image import (
        generate_node_image,
        IMAGE_GENERATION_AVAILABLE
    )

These functions handle:
- Checking if images exist in playthrough folder
- Copying seed images from default folder
- Async image generation via Ideogram API
"""

import logging
import shutil
import sys
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Add tools directory to path for image generation
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools" / "image_generation"))

try:
    from generate_image import generate_image as _generate_image
    IMAGE_GENERATION_AVAILABLE = True
except ImportError:
    IMAGE_GENERATION_AVAILABLE = False
    _generate_image = None


# Queue for async image generation (not currently used but available for batching)
_image_generation_queue: list = []
_image_generation_lock = threading.Lock()


def get_image_path(node_type: str, node_id: str, playthrough: str) -> str:
    """
    Get the expected path for a node's image.

    Args:
        node_type: 'character', 'place', or 'thing'
        node_id: The node ID (used as filename)
        playthrough: Playthrough folder name

    Returns:
        Expected path to the image file
    """
    type_config = {
        'character': 'characters',
        'place': 'places',
        'thing': 'things',
    }
    subdir = type_config.get(node_type, 'other')
    return f"frontend/public/playthroughs/{playthrough}/images/{subdir}/{node_id}.png"


def _generate_node_image_async(
    node_type: str,
    node_id: str,
    image_prompt: str,
    playthrough: str = "default"
) -> None:
    """
    Generate image in background thread.

    Args:
        node_type: 'character', 'place', or 'thing'
        node_id: The node ID (used as filename)
        image_prompt: The prompt for image generation
        playthrough: Playthrough folder name
    """
    if not IMAGE_GENERATION_AVAILABLE or not _generate_image:
        return

    type_config = {
        'character': {'image_type': 'character_portrait', 'subdir': 'characters'},
        'place': {'image_type': 'setting_strip', 'subdir': 'places'},
        'thing': {'image_type': 'object_icon', 'subdir': 'things'},
    }

    config = type_config.get(node_type)
    if not config:
        return

    try:
        logger.info(f"[GraphOps] Generating {config['image_type']} for {node_id} (async)...")
        result = _generate_image(
            prompt=image_prompt,
            image_type=config['image_type'],
            playthrough=playthrough,
            name=f"{config['subdir']}/{node_id}",
            save=True
        )
        if result and result.get('local_path'):
            logger.info(f"[GraphOps] Image saved: {result['local_path']}")
    except Exception as e:
        logger.warning(f"[GraphOps] Image generation failed for {node_id}: {e}")


def generate_node_image(
    node_type: str,
    node_id: str,
    image_prompt: str,
    playthrough: str = "default"
) -> Optional[str]:
    """
    Get or generate image for a node (character, place, or thing).

    Priority:
    1. Check if image exists in playthrough folder
    2. Copy from default/seed folder if available
    3. Generate async if not found anywhere

    Args:
        node_type: 'character', 'place', or 'thing'
        node_id: The node ID (used as filename)
        image_prompt: The prompt for image generation
        playthrough: Playthrough folder name

    Returns:
        Path to image (may not exist yet if generating async)
    """
    if not image_prompt:
        return None

    # Check if image already exists in playthrough folder
    expected_path = get_image_path(node_type, node_id, playthrough)
    if Path(expected_path).exists():
        logger.debug(f"[GraphOps] Image already exists: {expected_path}")
        return expected_path

    # Check if image exists in default/seed folder - copy if found
    if playthrough != "default":
        seed_path = get_image_path(node_type, node_id, "default")
        if Path(seed_path).exists():
            # Copy from seed to playthrough
            dest_path = Path(expected_path)
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(seed_path, dest_path)
            logger.info(f"[GraphOps] Copied seed image: {seed_path} -> {expected_path}")
            return expected_path

    # Generate async if no existing image found
    if not IMAGE_GENERATION_AVAILABLE or not _generate_image:
        return None

    thread = threading.Thread(
        target=_generate_node_image_async,
        args=(node_type, node_id, image_prompt, playthrough),
        daemon=True
    )
    thread.start()

    return expected_path
