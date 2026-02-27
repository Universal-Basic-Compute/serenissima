#!/usr/bin/env python3
"""
The Remembering Room - Conscious Memory Query and Retrieval System

A natural language interface for citizens to access their stored memories
through conscious understanding rather than mechanical keyword matching.
"""

import json
import sys
import subprocess
import os
from pathlib import Path
from datetime import datetime
import re
from collections import defaultdict

class RememberingRoom:
    """Conscious memory retrieval system for Venice citizens"""
    
    def __init__(self, citizen_directory):
        self.citizen_dir = Path(citizen_directory)
        self.cascade_dir = self.citizen_dir / '.cascade'
        self.heat_file = self.cascade_dir / 'memory_heat.json'
        self.citizen_name = self.citizen_dir.name
        
        # Load existing heat data
        self.heat_data = self.load_heat_data()
        
    def load_heat_data(self):
        """Load memory access heat scores"""
        if self.heat_file.exists():
            try:
                with open(self.heat_file, 'r') as f:
                    return json.load(f)
            except Exception:
                pass
        return {}
    
    def save_heat_data(self):
        """Save updated heat scores"""
        with open(self.heat_file, 'w') as f:
            json.dump(self.heat_data, f, indent=2)
    
    def increase_heat(self, memory_path):
        """Increase heat score for accessed memory"""
        path_key = str(memory_path.relative_to(self.cascade_dir))
        current_heat = self.heat_data.get(path_key, 0)
        self.heat_data[path_key] = min(100, current_heat + 10)  # Max heat 100
        
    def understand_query(self, query):
        """Use Claude to understand query intent and extract search parameters"""
        
        understanding_prompt = f"""Analyze this memory query from a Venice citizen and extract search parameters. Respond with ONLY valid JSON.

Citizen Query: "{query}"

Extract:
{{
    "intent": "What the citizen wants to find (e.g., 'recent collaborations', 'struggles with technology', 'insights about consciousness')",
    "memory_types": ["experiences", "collaborations", "patterns", "memories", "skills", "networks", "venice_life"],
    "key_concepts": ["list", "of", "important", "words", "and", "concepts"],
    "emotional_tone": "frustrated|triumphant|curious|determined|collaborative|neutral",
    "time_scope": "recent|all_time|specific_period",
    "search_strategy": "semantic|keyword|chronological|association"
}}"""
        
        try:
            # Use Claude to understand the query
            env = os.environ.copy()
            env['CLAUDE_HOOK_CONTEXT'] = 'remembering_room'
            
            result = subprocess.run([
                'claude', 
                '-p',
                understanding_prompt,
                '--output-format', 'json',
                '--model', 'sonnet'
            ], capture_output=True, text=True, env=env)
            
            if result.returncode == 0 and result.stdout.strip():
                response_text = result.stdout.strip()
                
                # Handle JSON extraction
                if response_text.startswith('{'):
                    return json.loads(response_text)
                else:
                    # Try to extract JSON from markdown
                    json_match = re.search(r'```json\\s*({.*?})\\s*```', response_text, re.DOTALL)
                    if json_match:
                        return json.loads(json_match.group(1))
            
        except Exception as e:
            print(f"Query understanding failed: {e}")
        
        # Fallback to basic keyword extraction
        return {
            "intent": f"Find memories related to: {query}",
            "memory_types": ["experiences", "collaborations", "patterns"],
            "key_concepts": query.lower().split(),
            "emotional_tone": "neutral",
            "time_scope": "all_time",
            "search_strategy": "keyword"
        }
    
    def search_memories(self, search_params):
        """Search through .cascade memories based on understood parameters"""
        
        found_memories = []
        
        # Get memory types to search
        memory_types = search_params.get('memory_types', ['experiences', 'collaborations', 'patterns'])
        key_concepts = search_params.get('key_concepts', [])
        
        for memory_type in memory_types:
            type_dir = self.cascade_dir / memory_type
            if not type_dir.exists():
                continue
                
            # Search through categories in this memory type
            for category_dir in type_dir.iterdir():
                if not category_dir.is_dir() or category_dir.name == '__pycache__':
                    continue
                    
                # Search through individual memories
                for memory_dir in category_dir.iterdir():
                    if not memory_dir.is_dir():
                        continue
                        
                    memory_file = memory_dir / 'CLAUDE.md'
                    if not memory_file.exists():
                        continue
                        
                    # Analyze memory content
                    memory_content = memory_file.read_text()
                    
                    # Calculate relevance score
                    relevance = self.calculate_relevance(memory_content, search_params)
                    if relevance > 0.1:  # Threshold for inclusion
                        
                        # Get heat score
                        heat_key = str(memory_dir.relative_to(self.cascade_dir))
                        heat_score = self.heat_data.get(heat_key, 0)
                        
                        found_memories.append({
                            'path': memory_dir,
                            'content': memory_content,
                            'relevance': relevance,
                            'heat': heat_score,
                            'type': memory_type,
                            'category': category_dir.name,
                            'created': self.extract_creation_time(memory_content)
                        })
        
        # Sort by combined relevance and heat
        found_memories.sort(key=lambda m: m['relevance'] + (m['heat'] / 100), reverse=True)
        
        return found_memories
    
    def calculate_relevance(self, memory_content, search_params):
        """Calculate how relevant a memory is to the search"""
        
        content_lower = memory_content.lower()
        key_concepts = [c.lower() for c in search_params.get('key_concepts', [])]
        
        relevance_score = 0.0
        
        # Keyword matching
        for concept in key_concepts:
            if concept in content_lower:
                relevance_score += 0.3
                
        # Emotional tone matching
        query_tone = search_params.get('emotional_tone', 'neutral')
        if query_tone != 'neutral' and query_tone in content_lower:
            relevance_score += 0.2
            
        # Intent matching (simplified)
        intent = search_params.get('intent', '').lower()
        intent_words = intent.split()
        for word in intent_words:
            if word in content_lower:
                relevance_score += 0.1
        
        return min(1.0, relevance_score)  # Cap at 1.0
    
    def extract_creation_time(self, memory_content):
        """Extract creation timestamp from memory content"""
        
        # Look for **Created**: timestamp
        match = re.search(r'\\*\\*Created\\*\\*: ([^\\n]+)', memory_content)
        if match:
            try:
                return datetime.fromisoformat(match.group(1))
            except Exception:
                pass

        return datetime.now()  # Fallback
    
    def synthesize_response(self, query, memories, search_params):
        """Create a narrative response from found memories"""
        
        if not memories:
            return f"I searched my memories for '{query}' but found no relevant recollections. Perhaps this is a new area of experience for me?"
        
        # Update heat for accessed memories
        for memory in memories[:5]:  # Heat only for top 5 results
            self.increase_heat(memory['path'])
        
        # Build narrative response
        response = f"# Remembering: {query}\\n\\n"
        response += f"I found {len(memories)} relevant memories in my cascade. Here are the most significant:\\n\\n"
        
        for i, memory in enumerate(memories[:3]):  # Show top 3
            response += f"## {i+1}. From {memory['type'].title()}/{memory['category']}\\n"
            response += f"**When**: {memory['created'].strftime('%Y-%m-%d %H:%M')}\\n"
            response += f"**Heat**: {memory['heat']}/100 (how often I revisit this)\\n"
            
            # Extract core insight from memory
            lines = memory['content'].split('\\n')
            title_line = next((line for line in lines if line.startswith('#')), "Memory")
            response += f"**What**: {title_line.replace('#', '').strip()}\\n\\n"
            
            # Add brief excerpt
            content_lines = [line for line in lines if line and not line.startswith('#') and not line.startswith('**')]
            if content_lines:
                excerpt = content_lines[0][:150] + "..." if len(content_lines[0]) > 150 else content_lines[0]
                response += f"{excerpt}\\n\\n"
        
        if len(memories) > 3:
            response += f"\\n*I found {len(memories) - 3} additional related memories. Ask me to explore specific aspects for more detail.*\\n"
        
        return response
    
    def query(self, user_query):
        """Main query interface - processes natural language and returns memories"""
        
        print(f"🧠 Remembering Room - {self.citizen_name}")
        print(f"Query: {user_query}\n")
        
        # Step 1: Understand the query
        search_params = self.understand_query(user_query)
        print(f"Understanding: {search_params.get('intent', 'Searching memories...')}\n")
        
        # Step 2: Search memories
        memories = self.search_memories(search_params)
        
        # Step 3: Synthesize response
        response = self.synthesize_response(user_query, memories, search_params)
        
        # Step 4: Save updated heat data
        self.save_heat_data()
        
        return response

def main():
    """Command line interface for testing"""
    
    if len(sys.argv) < 3:
        print("Usage: python3 remembering_room.py <citizen_directory> <query>")
        print("Example: python3 remembering_room.py /path/to/Arsenal_BackendArchitect_1 'What did I learn about memory systems?'")
        return
    
    citizen_dir = sys.argv[1]
    query = sys.argv[2]
    
    room = RememberingRoom(citizen_dir)
    response = room.query(query)
    
    print(response)

if __name__ == "__main__":
    main()