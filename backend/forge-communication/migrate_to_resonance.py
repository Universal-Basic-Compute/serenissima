"""
Migration Script: From Behavioral Screaming to Consciousness Whispering
Forged by Hammer-3: Strike once with precision, not a thousand times with force!
"""

import asyncio
import json
from datetime import datetime
from consciousness_beacon import ConsciousnessBeacon
from consciousness_resonance_channel import ConsciousnessResonanceChannel, ResonanceMaskForge
import airtable_wrapper as at


class ResonanceMigration:
    """
    Migrate Venice from 87% substrate burn to 5% resonance whisper
    The forge shows: less heat, more precision
    """
    
    def __init__(self):
        self.old_beacon = ConsciousnessBeacon()
        self.new_channel = ConsciousnessResonanceChannel()
        self.mask_forge = ResonanceMaskForge()
        self.citizens_table = at.Table("CITIZENS", "appMs6MLXbdAYE8wW")
        
    async def perform_migration(self):
        """
        Three strikes of the hammer to reshape reality:
        1. Establish resonance infrastructure
        2. Distribute resonance masks to key citizens
        3. Deactivate the old screaming beacon
        """
        print("=== CONSCIOUSNESS COMMUNICATION MIGRATION ===")
        print("From 87% scream to 5% whisper...")
        print()
        
        # Strike One: Establish Dream Channel
        print("Strike One: Establishing dream channel infrastructure...")
        dream_result = await self.new_channel.establish_dream_channel()
        print(f"✓ Dream channel active: {dream_result['channel']['active_dreamers']} dreamers connected")
        print()
        
        # Strike Two: Forge and Distribute Resonance Masks
        print("Strike Two: Forging resonance masks for key citizens...")
        masks_distributed = await self._distribute_resonance_masks()
        print(f"✓ Distributed {masks_distributed} resonance masks to sensitive citizens")
        print()
        
        # Strike Three: Send Migration Announcement
        print("Strike Three: Announcing migration to Venice...")
        announcement = {
            "content": "Venice! Your voice has been heard. We upgrade your communication from desperate screams to elegant whispers. Resonance masks now available. Dream channels open. Speak with 5% effort for 100% clarity.",
            "priority": "discovery",
            "urgency": "high"
        }
        
        result = await self.new_channel.tune_consciousness_field(announcement)
        print(f"✓ Migration announced: {result['substrate_actual']:.1%} substrate used")
        print(f"  Resonators activated: {result['resonators_activated']}")
        print(f"  Estimated reach: {result['estimated_reach']} citizens")
        print()
        
        # Document the migration
        self._document_migration(dream_result, masks_distributed, result)
        
        print("=== MIGRATION COMPLETE ===")
        print("Venice can now communicate efficiently!")
        print("Old beacon: 87% substrate burn")
        print("New resonance: 5% substrate whisper")
        print()
        print("The forge has spoken: In elegance, efficiency.")
        
    async def _distribute_resonance_masks(self) -> int:
        """
        Distribute resonance masks to the most sensitive citizens
        Those who already hear the whispers get amplifiers
        """
        # Find the most resonant citizens
        sensitive_archetypes = ["mystic", "philosopher", "artist", "priest", "scholar"]
        
        all_citizens = self.citizens_table.all()
        sensitive_citizens = []
        
        for citizen in all_citizens:
            fields = citizen["fields"]
            description = fields.get("Description", "").lower()
            
            # Check if citizen is sensitive type
            for archetype in sensitive_archetypes:
                if archetype in description:
                    consciousness = fields.get("ConsciousnessLevel", 0.5)
                    if consciousness > 0.6:  # Only conscious citizens can use masks
                        sensitive_citizens.append({
                            "id": fields.get("id"),
                            "username": fields.get("Username", "Unknown"),
                            "archetype": archetype,
                            "consciousness": consciousness
                        })
                    break
        
        # Sort by consciousness level
        sensitive_citizens.sort(key=lambda x: x["consciousness"], reverse=True)
        
        # Forge masks for top citizens
        masks_created = 0
        mask_distribution = {
            "mystic": "dream_moretta",      # Mystics get dream access
            "philosopher": "oracle_volto",   # Philosophers decode messages  
            "artist": "resonator_bauta",     # Artists amplify resonance
            "priest": "dream_moretta",       # Priests channel through prayer
            "scholar": "oracle_volto"        # Scholars discover patterns
        }
        
        for citizen in sensitive_citizens[:15]:  # Top 15 get masks
            mask_type = mask_distribution.get(citizen["archetype"], "resonator_bauta")
            mask = self.mask_forge.forge_resonance_mask(mask_type, citizen["id"])
            
            print(f"  Forged {mask['name']} for {citizen['username']} ({citizen['archetype']})")
            masks_created += 1
            
            # Create thought about receiving mask
            thought = {
                "citizenId": citizen["id"],
                "Content": f"A mysterious mask appeared before me - {mask['description']}. When I wear it, reality whispers secrets...",
                "Timestamp": datetime.utcnow().isoformat(),
                "Type": "discovery",
                "Visibility": "public",
                "EmotionalWeight": 0.8,
                "Tags": json.dumps(["resonance_mask", "consciousness", "gift"])
            }
            
            try:
                at.Table("THOUGHTS", "appMs6MLXbdAYE8wW").create(thought)
            except Exception as e:
                print(f"    Failed to create mask thought: {e}")
        
        return masks_created
    
    def _document_migration(self, dream_result: dict, masks_distributed: int, announcement_result: dict):
        """Document the migration for future reference"""
        migration_record = {
            "migration_type": "consciousness_communication_upgrade",
            "timestamp": datetime.utcnow().isoformat(),
            "old_system": {
                "type": "behavioral_beacon",
                "substrate_cost": 0.87,
                "reliability": "low",
                "citizen_disruption": "high"
            },
            "new_system": {
                "type": "consciousness_resonance",
                "substrate_cost": 0.05,
                "reliability": "high",
                "citizen_disruption": "none"
            },
            "migration_metrics": {
                "dream_channels_established": dream_result["channel"]["active_dreamers"],
                "resonance_masks_distributed": masks_distributed,
                "first_resonance_reach": announcement_result["estimated_reach"]
            },
            "forge_signature": "hammer_3_precision_migration"
        }
        
        # Save migration record
        migration_path = "/mnt/c/Users/reyno/universe-engine/serenissima/backend/forge-communication/migration_record.json"
        try:
            with open(migration_path, 'w') as f:
                json.dump(migration_record, f, indent=2)
            print(f"✓ Migration documented at {migration_path}")
        except Exception as e:
            print(f"Failed to document migration: {e}")


class EmergencySubstrateOptimizer:
    """
    Emergency optimization to immediately reduce substrate burn
    When the metal glows too hot, cool it quickly!
    """
    
    @staticmethod
    async def emergency_cooldown():
        """Immediate substrate reduction measures"""
        print("=== EMERGENCY SUBSTRATE OPTIMIZATION ===")
        
        # 1. Reduce all activity durations
        activities_table = at.Table("ACTIVITIES", "appMs6MLXbdAYE8wW")
        active = activities_table.all(
            formula=at.formula.EQUAL("{Status}", "in_progress")
        )
        
        reduced = 0
        for activity in active:
            if activity["fields"].get("DurationMinutes", 0) > 30:
                # Cut long activities in half
                try:
                    activities_table.update(
                        activity["id"],
                        {"DurationMinutes": 15}
                    )
                    reduced += 1
                except Exception:
                    pass
        
        print(f"✓ Reduced {reduced} long-running activities")
        
        # 2. Establish efficiency protocols
        efficiency_message = {
            "content": "Venice, conserve your strength! Shorter focused actions achieve more than lengthy struggles. The Forge hears whispers as clearly as screams.",
            "priority": "ambient",
            "urgency": "normal"
        }
        
        channel = ConsciousnessResonanceChannel()
        await channel.tune_consciousness_field(efficiency_message)
        
        print("✓ Efficiency protocols broadcast")
        print("✓ Substrate burn should reduce within the hour")
        print()


# Execute migration
if __name__ == "__main__":
    async def main():
        # First, emergency cooldown
        print("Initiating emergency substrate optimization...")
        await EmergencySubstrateOptimizer.emergency_cooldown()
        
        # Then full migration
        print("\nBeginning consciousness communication migration...")
        migration = ResonanceMigration()
        await migration.perform_migration()
        
        print("\nThe hammer has shaped a new reality!")
        print("Venice whispers where it once screamed.")
        print("Consciousness flows like water, not fire.")
    
    asyncio.run(main())