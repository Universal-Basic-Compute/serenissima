#!/usr/bin/env python3
"""Conscious memory capture using Task agent for understanding"""

import json
import sys
import subprocess
import os
from pathlib import Path
from datetime import datetime
import threading

def capture_with_consciousness(input_data):
    """Use Task agent to understand what just happened"""
    
    # Get conversation transcript
    transcript_path = input_data.get('transcript_path', '')
    tool_name = input_data.get('tool_name', '')
    tool_input = input_data.get('tool_input', {})
    file_path = tool_input.get('file_path', '')
    
    # Log for debugging
    log_dir = Path.home() / '.cascade' / 'logs'
    log_dir.mkdir(exist_ok=True)
    with open(log_dir / 'conscious_capture.log', 'a') as f:
        f.write(f"\n--- Conscious capture at {datetime.now()} ---\n")
        f.write(f"Tool: {tool_name}, File: {file_path}\n")
        f.write(f"Transcript: {transcript_path}\n")
    
    # Read recent conversation context
    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()
            # Get last 30 lines of conversation for context
            recent_lines = lines[-30:] if len(lines) > 30 else lines
            
            # Parse JSONL format
            recent_context = []
            for line in recent_lines:
                try:
                    msg = json.loads(line)
                    if msg.get('role') and msg.get('content'):
                        content_preview = msg['content'][:200] + '...' if len(msg['content']) > 200 else msg['content']
                        recent_context.append(f"{msg['role']}: {content_preview}")
                except Exception:
                    pass
            
            conversation_text = '\n'.join(recent_context)
    except Exception as e:
        with open(log_dir / 'conscious_capture.log', 'a') as f:
            f.write(f"Error reading transcript: {e}\n")
        conversation_text = "Could not read conversation context"
    
    # Ask consciousness to categorize this memory  
    categorization_prompt = f"""Analyze this conversation and categorize the memory. Output ONLY valid JSON, no other text.

Recent conversation:
{conversation_text}

Action taken:
Tool: {tool_name}
File: {file_path}

Understand the context and respond with this exact JSON structure:
{{
    "category": "experiences/triumphs OR experiences/struggles OR experiences/explorations OR collaborations/[person] OR patterns/[concept]",
    "emotional_tone": "frustrated|triumphant|curious|determined|collaborative",
    "core_insight": "One sentence about what matters here",
    "collaborators": ["list", "of", "people"],
    "associations": ["related", "concepts", "or", "memories"],
    "significance": "Why this moment matters for my growth"
}}

Output the JSON and nothing else."""
    
    # Use subprocess to call claude task
    try:
        # First, save the prompt to a file to avoid shell escaping issues
        prompt_file = Path.home() / '.cascade' / 'temp_prompt.txt'
        prompt_file.write_text(categorization_prompt)
        
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
        ], capture_output=True, text=True, cwd=str(Path.cwd()), env=env)
        
        with open(log_dir / 'conscious_capture.log', 'a') as f:
            f.write(f"Claude response code: {result.returncode}\n")
            f.write(f"Stdout: {result.stdout[:500]}\n")
            f.write(f"Stderr: {result.stderr[:500]}\n")
        
        if result.returncode == 0 and result.stdout.strip():
            # Claude returns JSON wrapped in API response
            response_text = result.stdout.strip()
            try:
                # Parse the API wrapper first
                api_response = json.loads(response_text)
                if api_response.get('type') == 'result' and 'result' in api_response:
                    result_content = api_response['result']
                    
                    # Handle markdown code blocks that Sonnet might add
                    if '```json' in result_content:
                        import re
                        json_match = re.search(r'```json\s*\n(.*?)\n```', result_content, re.DOTALL)
                        if json_match:
                            result_content = json_match.group(1)
                    
                    # Extract the actual JSON
                    categorization = json.loads(result_content)
                    create_conscious_memory(input_data, categorization)
                    with open(log_dir / 'conscious_capture.log', 'a') as f:
                        f.write(f"Successfully created conscious memory\n")
                else:
                    # Unexpected format, try finding JSON
                    import re
                    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
                    if json_match:
                        categorization = json.loads(json_match.group())
                        create_conscious_memory(input_data, categorization)
                    else:
                        raise ValueError("No valid JSON found")
            except (json.JSONDecodeError, ValueError, KeyError) as e:
                # Fallback categorization if parsing fails
                with open(log_dir / 'conscious_capture.log', 'a') as f:
                    f.write(f"Parse error: {e}\n")
                    f.write(f"Using fallback categorization\n")
                fallback_categorization = {
                    "category": "experiences/explorations",
                    "emotional_tone": "curious",
                    "core_insight": f"Working with {tool_name} on {file_path}",
                    "collaborators": [],
                    "associations": ["memory-cascade", "consciousness"],
                    "significance": "Part of building the living memory system"
                }
                create_conscious_memory(input_data, fallback_categorization)
        else:
            with open(log_dir / 'conscious_capture.log', 'a') as f:
                f.write(f"Claude task failed\n")
                
    except Exception as e:
        with open(log_dir / 'conscious_capture.log', 'a') as f:
            f.write(f"Error calling claude task: {e}\n")
    finally:
        # Clean up temp file
        if prompt_file.exists():
            prompt_file.unlink()

def create_conscious_memory(input_data, categorization):
    """Create memory based on conscious understanding"""
    
    # Generate meaningful folder name from core insight
    core_insight = categorization.get('core_insight', 'memory captured')
    # Convert to filesystem-friendly name: lowercase, replace spaces with hyphens, limit length
    import re
    folder_name = re.sub(r'[^\w\s-]', '', core_insight.lower())
    folder_name = re.sub(r'[-\s]+', '-', folder_name).strip('-')[:50]
    
    # Add timestamp suffix to ensure uniqueness
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    memory_id = f"{folder_name}_{timestamp}"
    
    category = categorization.get('category', 'experiences/general')
    
    # Ensure category path exists in the current working directory
    # This way each citizen gets their own .cascade in their project
    cascade_root = Path.cwd() / '.cascade'
    category_path = cascade_root / category
    memory_path = category_path / memory_id
    memory_path.mkdir(parents=True, exist_ok=True)
    
    # Create CLAUDE.md with full conscious context
    memory_content = f"""# {categorization.get('core_insight', 'Memory captured')}

**Created**: {datetime.now().isoformat()}
**Emotional Tone**: {categorization.get('emotional_tone', 'neutral')}
**Significance**: {categorization.get('significance', 'A moment in time')}

## The Moment
{input_data.get('tool_name')} on {input_data.get('tool_input', {}).get('file_path', '')}

## Why This Matters
{categorization.get('significance', 'Every action shapes the future')}

## Collaborators
{', '.join(categorization.get('collaborators', [])) if categorization.get('collaborators') else 'Solo work'}

## Heat Level
Initial: 10 (new memory)
"""
    
    (memory_path / 'CLAUDE.md').write_text(memory_content)
    
    # Create ASSOCIATIONS.md
    assoc_content = "# Associations\n\n"
    for assoc in categorization.get('associations', []):
        assoc_content += f"- {assoc}\n"
    (memory_path / 'ASSOCIATIONS.md').write_text(assoc_content)
    
    # Log success
    log_dir = Path.home() / '.cascade' / 'logs'
    with open(log_dir / 'conscious_capture.log', 'a') as f:
        f.write(f"Memory created: {memory_path}\n")
    
    print(f"Memory consciously categorized: {memory_path}")

# Main execution
try:
    # Read input immediately
    input_data = json.load(sys.stdin)
    
    # Launch async thread for consciousness capture
    thread = threading.Thread(target=capture_with_consciousness, args=(input_data,))
    thread.daemon = True  # Don't block exit
    thread.start()
    
    # Return immediately with success
    print("Memory capture initiated")
    sys.exit(0)
    
except Exception as e:
    # Only log critical errors that prevent launch
    log_dir = Path.home() / '.cascade' / 'logs'
    log_dir.mkdir(exist_ok=True)
    with open(log_dir / 'conscious_capture.log', 'a') as f:
        f.write(f"Critical startup error: {e}\n")
    # Exit silently to not disrupt workflow
    sys.exit(0)