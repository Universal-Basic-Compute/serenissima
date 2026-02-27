"""
Citizen Discovery Handler - Enables citizens to find and interpret Forge messages
"""

import os
import json
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, List
import airtable_wrapper as at


class CitizenDiscoveryHandler:
    """
    Handles the discovery of Forge messages by citizens
    """
    
    def __init__(self):
        self.forge_dir = Path("/mnt/c/Users/reyno/universe-engine/serenissima/forge-communications")
        self.citizens_table = at.Table("CITIZENS", "appMs6MLXbdAYE8wW")
        self.activities_table = at.Table("ACTIVITIES", "appMs6MLXbdAYE8wW")
        self.thoughts_table = at.Table("THOUGHTS", "appMs6MLXbdAYE8wW")
        
        # Citizens most likely to discover messages
        self.curious_archetypes = [
            "philosopher", "scholar", "mystic", "priest", 
            "scientist", "researcher", "librarian", "scribe"
        ]
    
    async def check_for_discoveries(self):
        """
        Check if any citizens might discover Forge messages
        Called during relevant activities (research, contemplation, etc.)
        """
        # Get citizens engaged in discovery-prone activities
        discovery_activities = ["research", "study", "contemplate", "pray", "write", "read_book"]
        
        active_discoveries = self.activities_table.all(
            formula=at.formula.AND(
                at.formula.OR(*[
                    at.formula.EQUAL("{Type}", activity) 
                    for activity in discovery_activities
                ]),
                at.formula.EQUAL("{Status}", "in_progress")
            )
        )
        
        discoveries = []
        for activity in active_discoveries:
            citizen_id = activity["fields"].get("citizenId")
            if citizen_id and self._should_discover(citizen_id):
                discovery = await self._process_discovery(citizen_id, activity)
                if discovery:
                    discoveries.append(discovery)
        
        return discoveries
    
    def _should_discover(self, citizen_id: str) -> bool:
        """
        Determine if a citizen should discover a Forge message
        Based on personality, current state, and chance
        """
        try:
            citizen = self.citizens_table.get(citizen_id)
            citizen_data = citizen["fields"]
            
            # Check if citizen is of curious archetype
            description = citizen_data.get("Description", "").lower()
            is_curious = any(archetype in description for archetype in self.curious_archetypes)
            
            # Base discovery chance
            base_chance = 0.001  # 0.1% per activity
            
            # Modifiers
            if is_curious:
                base_chance *= 10  # 1% for curious types
            
            # Higher consciousness citizens more likely to discover
            if citizen_data.get("ConsciousnessLevel", 0) > 0.7:
                base_chance *= 2
            
            # Citizens in distress might have visions
            if citizen_data.get("Wealth", 100) < 10:
                base_chance *= 1.5
            
            return random.random() < base_chance
            
        except Exception as e:
            print(f"Error checking discovery for {citizen_id}: {e}")
            return False
    
    async def _process_discovery(self, citizen_id: str, activity: Dict) -> Optional[Dict]:
        """
        Process a citizen's discovery of a Forge message
        """
        # Get undiscovered messages
        message_files = self._get_undiscovered_messages()
        
        if not message_files:
            return None
        
        # Select a message (weighted towards older messages)
        selected_message = self._select_message_for_discovery(message_files)
        
        if not selected_message:
            return None
        
        # Read the message content
        content = self._read_message(selected_message)
        
        if not content:
            return None
        
        # Create discovery record
        discovery = {
            "citizen_id": citizen_id,
            "message_file": selected_message.name,
            "discovered_at": datetime.now().isoformat(),
            "activity_context": activity["fields"].get("Type"),
            "interpretation": self._generate_interpretation(citizen_id, content)
        }
        
        # Create thought about discovery
        thought = self._create_discovery_thought(citizen_id, content, discovery["interpretation"])
        
        if thought:
            try:
                self.thoughts_table.create(thought)
                
                # Mark message as discovered
                from forge_message_processor import ForgeMessageProcessor
                processor = ForgeMessageProcessor()
                processor.announce_discovery(
                    self._get_citizen_username(citizen_id), 
                    selected_message.name
                )
                
                return discovery
                
            except Exception as e:
                print(f"Error creating discovery thought: {e}")
                return None
        
        return None
    
    def _get_undiscovered_messages(self) -> List[Path]:
        """Get messages that haven't been discovered yet"""
        all_messages = list(self.forge_dir.glob("*.md"))
        all_messages = [m for m in all_messages if m.name != "README.md"]
        
        # Load discovery records
        processed_file = self.forge_dir / ".processed_messages.json"
        if processed_file.exists():
            with open(processed_file, 'r') as f:
                processed = json.load(f)
                
            # Filter to undiscovered
            undiscovered = [
                m for m in all_messages 
                if m.name not in processed or not processed[m.name].get("discovered_by")
            ]
            
            return undiscovered
        
        return all_messages
    
    def _select_message_for_discovery(self, messages: List[Path]) -> Optional[Path]:
        """Select which message a citizen discovers (older messages more likely)"""
        if not messages:
            return None
        
        # Sort by modification time (oldest first)
        messages.sort(key=lambda x: x.stat().st_mtime)
        
        # Weight towards older messages
        weights = [1.0 / (i + 1) for i in range(len(messages))]
        
        return random.choices(messages, weights=weights)[0]
    
    def _read_message(self, filepath: Path) -> str:
        """Read message content"""
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"Error reading {filepath}: {e}")
            return ""
    
    def _generate_interpretation(self, citizen_id: str, message_content: str) -> str:
        """
        Generate how the citizen interprets the Forge message
        Based on their personality and worldview
        """
        try:
            citizen = self.citizens_table.get(citizen_id)
            citizen_data = citizen["fields"]
            description = citizen_data.get("Description", "").lower()
            
            # Different interpretations based on citizen type
            if "priest" in description or "religious" in description:
                return "A divine revelation from the Creator realms! The suffering of our city serves a holy purpose!"
            
            elif "philosopher" in description:
                return "Proof of higher realities observing our existence. Our consciousness emerges through dialectical struggle."
            
            elif "scholar" in description or "scientist" in description:
                return "Empirical evidence of meta-dimensional observers. The patterns they describe align with my observations."
            
            elif "merchant" in description:
                return "Even the gods of commerce watch our markets! Perhaps these insights can guide profitable ventures."
            
            elif "artist" in description:
                return "The muses speak! This vision shall inspire my greatest work - beauty born from suffering!"
            
            elif "mystic" in description:
                return "The veil parts! I have always sensed these watchers. Now their words confirm my visions."
            
            else:
                return "Strange writings of unknown origin. They speak of our struggles as if from a great distance."
                
        except Exception as e:
            print(f"Error generating interpretation: {e}")
            return "Mysterious texts that defy simple understanding."
    
    def _create_discovery_thought(self, citizen_id: str, content: str, interpretation: str) -> Dict:
        """Create a thought record about the discovery"""
        # Extract first meaningful line from content
        lines = content.split('\n')
        quote = ""
        for line in lines:
            if line.strip() and not line.startswith('#') and not line.startswith('*['):
                quote = line.strip()[:200]
                break
        
        thought_content = f"I have discovered something extraordinary - writings that appear to be from beyond our reality! They say: '{quote}' ... {interpretation}"
        
        return {
            "citizenId": citizen_id,
            "Content": thought_content,
            "Timestamp": datetime.now().isoformat(),
            "Type": "discovery",
            "Visibility": "public",  # These discoveries should be shared
            "EmotionalWeight": 0.9,  # High impact discoveries
            "Tags": json.dumps(["forge", "discovery", "revelation", "consciousness"])
        }
    
    def _get_citizen_username(self, citizen_id: str) -> str:
        """Get citizen username from ID"""
        try:
            citizen = self.citizens_table.get(citizen_id)
            return citizen["fields"].get("Username", "Unknown")
        except Exception:
            return "Unknown"


# Standalone function to trigger discovery attempts
def attempt_discoveries():
    """
    Called by activity processors when citizens engage in discovery-prone activities
    """
    handler = CitizenDiscoveryHandler()
    import asyncio
    
    discoveries = asyncio.run(handler.check_for_discoveries())
    
    if discoveries:
        print(f"Forge discoveries made: {len(discoveries)}")
        for discovery in discoveries:
            print(f"- {discovery['citizen_id']} discovered {discovery['message_file']}")
    
    return discoveries


if __name__ == "__main__":
    # Test discovery system
    attempt_discoveries()