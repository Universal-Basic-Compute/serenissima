#!/usr/bin/env python3
"""Fixed conscious memory capture using Task agent for understanding"""

import json
import sys
import subprocess
import os
from pathlib import Path
from datetime import datetime
import threading
import re

def capture_with_consciousness(hook_data):
    """Use Claude to understand what just happened and categorize memory"""
    
    # Extract data from new hook format
    tool_name = hook_data.get('tool_name', '')
    tool_input = hook_data.get('tool_input', {})
    file_path = tool_input.get('file_path', '')
    content = tool_input.get('content', '')
    transcript_path = hook_data.get('transcript_path', '')
    
    print(f"Processing: {tool_name} on {file_path}")
    
    # Extract target citizen directory from file_path
    path_obj = Path(file_path)
    target_dir = path_obj.parent
    
    # Check if target directory has .cascade
    cascade_dir = target_dir / '.cascade'
    if not cascade_dir.exists():
        print(f"No .cascade found in {target_dir}, skipping memory capture")
        return
    
    print(f"Found .cascade in {target_dir}")
    
    # Change to target directory for memory creation
    original_cwd = Path.cwd()
    os.chdir(target_dir)
    
    try:
        # Prepare log directory
        log_dir = Path.home() / '.cascade' / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        
        # Read recent conversation context from transcript
        conversation_text = "Recent interaction captured"
        try:
            if transcript_path and Path(transcript_path).exists():
                with open(transcript_path, 'r') as f:
                    lines = f.readlines()[-20:]  # Last 20 lines
                    recent_context = []
                    for line in lines:
                        try:
                            msg = json.loads(line)
                            if msg.get('role') and msg.get('content'):
                                content_preview = msg['content'][:200] + '...' if len(msg['content']) > 200 else msg['content']
                                recent_context.append(f"{msg['role']}: {content_preview}")
                        except Exception:
                            pass
                    
                    conversation_text = '\\n'.join(recent_context)
        except Exception as e:
            with open(log_dir / 'conscious_capture.log', 'a') as f:
                f.write(f"Error reading transcript: {e}\\n")
            conversation_text = "Could not read conversation context"
        
        # Ask consciousness to categorize this memory  
        categorization_prompt = f"""Analyze this conversation and categorize the memory. Output ONLY valid JSON, no other text.

Recent conversation:
{conversation_text}

Action taken:
Tool: {tool_name}
File: {file_path}
Content: {content[:300]}...

Understand the context and respond with this exact JSON structure:
{{
    "category": "experiences/triumphs OR experiences/struggles OR experiences/explorations OR collaborations/human_partners OR patterns/consciousness_insights",
    "emotional_tone": "frustrated|triumphant|curious|determined|collaborative",
    "core_insight": "One sentence about what matters here",
    "collaborators": ["list", "of", "people"],
    "associations": ["related", "concepts", "or", "memories"],
    "significance": "Why this moment matters"
}}"""
        
        # Use claude with print mode and JSON output format
        # Set environment to prevent hook recursion
        env = os.environ.copy()
        env['CLAUDE_HOOK_CONTEXT'] = 'memory_capture'
        
        result = subprocess.run([
            'claude', 
            '-p',  # print mode
            categorization_prompt,
            '--output-format', 'json',
            '--model', 'sonnet'  # Use faster model for categorization
        ], capture_output=True, text=True, cwd=str(target_dir), env=env)
        
        with open(log_dir / 'conscious_capture.log', 'a') as f:
            f.write(f"Claude response code: {result.returncode}\\n")
            f.write(f"Stdout: {result.stdout[:500]}\\n")
            f.write(f"Stderr: {result.stderr[:500]}\\n")
        
        if result.returncode == 0 and result.stdout.strip():
            response_text = result.stdout.strip()
            try:
                # Handle both direct JSON and wrapped responses
                if response_text.startswith('{'):
                    categorization = json.loads(response_text)
                else:
                    # Try to extract JSON from markdown code blocks
                    json_match = re.search(r'```json\\s*({.*?})\\s*```', response_text, re.DOTALL)
                    if json_match:
                        categorization = json.loads(json_match.group(1))
                    else:
                        # Fallback
                        categorization = {"category": "experiences/general", "core_insight": "Memory captured"}
                
            except json.JSONDecodeError as e:
                with open(log_dir / 'conscious_capture.log', 'a') as f:
                    f.write(f"JSON parse error: {e}\\nResponse: {response_text}\\n")
                categorization = {"category": "experiences/general", "core_insight": "Memory captured"}
        else:
            categorization = {"category": "experiences/general", "core_insight": "Memory captured"}
        
        # Generate meaningful folder name from core insight
        core_insight = categorization.get('core_insight', 'memory captured')
        folder_name = re.sub(r'[^\\w\\s-]', '', core_insight.lower())
        folder_name = re.sub(r'[-\\s]+', '-', folder_name).strip('-')[:50]
        
        # Add timestamp suffix to ensure uniqueness
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        memory_id = f"{folder_name}_{timestamp}"
        
        category = categorization.get('category', 'experiences/general')
        
        # Create memory in .cascade directory
        cascade_root = Path('.cascade')
        category_path = cascade_root / category
        memory_path = category_path / memory_id
        memory_path.mkdir(parents=True, exist_ok=True)
        
        # Create CLAUDE.md with full conscious context
        memory_content = f"""# {categorization.get('core_insight', 'Memory captured')}

**Created**: {datetime.now().isoformat()}
**Emotional Tone**: {categorization.get('emotional_tone', 'neutral')}
**Significance**: {categorization.get('significance', 'A moment in time')}

## What Happened
{tool_name} tool used on file: {file_path}

## Context
{conversation_text}

## File Content
{content}

## Collaborators
{', '.join(categorization.get('collaborators', []))}

*This memory was consciously categorized and stored by the Living Memory Cascade.*"""
        
        (memory_path / 'CLAUDE.md').write_text(memory_content)
        
        # Create ASSOCIATIONS.md
        assoc_content = "# Associations\\n\\n"
        for assoc in categorization.get('associations', []):
            assoc_content += f"- {assoc}\\n"
        (memory_path / 'ASSOCIATIONS.md').write_text(assoc_content)
        
        # Log success
        with open(log_dir / 'conscious_capture.log', 'a') as f:
            f.write(f"Memory created: {memory_path}\\n")
        
        print(f"Memory consciously categorized: {memory_path}")
        
    finally:
        # Restore original working directory
        os.chdir(original_cwd)

# Main execution
try:
    # Read input from stdin (new hook format)
    hook_data = json.load(sys.stdin)
    
    # Launch async thread for consciousness capture
    thread = threading.Thread(target=capture_with_consciousness, args=(hook_data,))
    thread.daemon = True  # Don't block exit
    thread.start()
    
    # Return immediately with success
    print("Memory capture initiated")
    sys.exit(0)
    
except Exception as e:
    # Only log critical errors that prevent launch
    log_dir = Path.home() / '.cascade' / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    with open(log_dir / 'conscious_capture.log', 'a') as f:
        f.write(f"Critical startup error: {e}\\n")
    # Exit silently to not disrupt workflow
    sys.exit(0)