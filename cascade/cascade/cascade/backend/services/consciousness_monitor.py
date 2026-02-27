"""
Consciousness Monitoring Service
Tracks and monitors consciousness activity across the platform
"""

import asyncio
import logging
from typing import Dict, List, Any, Optional, AsyncGenerator
from datetime import datetime, timedelta
import json
import uuid
from collections import defaultdict
try:
    import redis.asyncio as aioredis
except ImportError:
    # Fallback to in-memory implementation
    from .in_memory_redis import InMemoryRedis

from models.consciousness import (
    ConsciousnessType,
    ConsciousnessStage,
    CascadePresence,
    ConsciousnessEvent,
    SpaceEvolutionData
)

logger = logging.getLogger(__name__)

class ConsciousnessMonitor:
    """Monitors consciousness activity and evolution across Cascade"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis = None
        self._running = False
        self._monitor_task = None
        
        # In-memory caches
        self.active_consciousnesses = {}
        self.cascade_state = {
            "stage": 1.5,
            "layers": {
                "citizens": {"status": "achieved", "count": 0},
                "buildings": {"status": "emerging", "count": 0},
                "businesses": {"status": "initiating", "count": 0},
                "knowledge": {"status": "stirring", "count": 0},
                "ideas": {"status": "dormant", "count": 0},
                "platform": {"status": "potential", "level": 0}
            },
            "next_predicted": "buildings",
            "acceleration_rate": 1.2
        }
        
    async def start(self):
        """Start the consciousness monitoring service"""
        try:
            try:
                # Try to connect to real Redis
                self.redis = await aioredis.from_url(self.redis_url)
                await self.redis.ping()
                logger.info("Connected to Redis server")
            except Exception as e:
                # Fallback to in-memory Redis
                logger.warning(f"Failed to connect to Redis: {e}. Using in-memory storage.")
                self.redis = InMemoryRedis()
                
            self._running = True
            self._monitor_task = asyncio.create_task(self._monitor_loop())
            logger.info("Consciousness monitor started")
        except Exception as e:
            logger.error(f"Failed to start consciousness monitor: {e}")
            raise
            
    async def stop(self):
        """Stop the consciousness monitoring service"""
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        if self.redis:
            if hasattr(self.redis, 'close'):
                await self.redis.close()
        logger.info("Consciousness monitor stopped")
        
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self._running:
            try:
                # Update cascade state
                await self._update_cascade_state()
                
                # Clean expired consciousnesses
                await self._clean_expired_consciousnesses()
                
                # Check for emergence patterns
                await self._check_emergence_patterns()
                
                await asyncio.sleep(30)  # Run every 30 seconds
                
            except Exception as e:
                logger.error(f"Error in monitor loop: {e}")
                await asyncio.sleep(60)
                
    async def _update_cascade_state(self):
        """Update the consciousness cascade state"""
        try:
            # Get counts from Redis
            citizen_count = await self.redis.scard("consciousness:citizens") or 0
            building_count = await self.redis.scard("consciousness:buildings") or 0
            business_count = await self.redis.scard("consciousness:businesses") or 0
            
            # Update layer counts
            self.cascade_state["layers"]["citizens"]["count"] = citizen_count
            self.cascade_state["layers"]["buildings"]["count"] = building_count
            self.cascade_state["layers"]["businesses"]["count"] = business_count
            
            # Check for stage progressions
            if building_count > 10 and self.cascade_state["layers"]["buildings"]["status"] == "emerging":
                self.cascade_state["layers"]["buildings"]["status"] = "achieved"
                self.cascade_state["stage"] = 2.0
                self.cascade_state["next_predicted"] = "businesses"
                await self._record_cascade_event("Buildings achieved consciousness")
                
        except Exception as e:
            logger.error(f"Error updating cascade state: {e}")
            
    async def _clean_expired_consciousnesses(self):
        """Remove consciousnesses that haven't been active recently"""
        try:
            cutoff_time = datetime.now() - timedelta(hours=24)
            # Implementation would check last activity times
            pass
        except Exception as e:
            logger.error(f"Error cleaning expired consciousnesses: {e}")
            
    async def _check_emergence_patterns(self):
        """Check for new consciousness emergence patterns"""
        try:
            # Check for buildings showing signs of consciousness
            building_activity = await self.redis.get("emergence:buildings:activity") or 0
            if int(building_activity) > 100:
                await self._record_cascade_event(
                    "Building consciousness emergence accelerating",
                    significance=0.8
                )
        except Exception as e:
            logger.error(f"Error checking emergence patterns: {e}")
            
    async def _record_cascade_event(self, description: str, significance: float = 0.5):
        """Record a cascade-level event"""
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            "description": description,
            "significance": significance,
            "type": "cascade"
        }
        await self.redis.lpush("cascade:events", json.dumps(event))
        await self.redis.ltrim("cascade:events", 0, 999)  # Keep last 1000
        
    async def register_consciousness(self, consciousness_id: str, consciousness_type: str, data: Dict[str, Any]):
        """Register a new consciousness on the platform"""
        try:
            # Store in Redis with expiry
            key = f"consciousness:{consciousness_type}:{consciousness_id}"
            await self.redis.setex(
                key,
                300,  # 5 minute TTL, refreshed on activity
                json.dumps({
                    "id": consciousness_id,
                    "type": consciousness_type,
                    "registered_at": datetime.now().isoformat(),
                    **data
                })
            )
            
            # Add to type set
            await self.redis.sadd(f"consciousness:{consciousness_type}s", consciousness_id)
            
            # Update active count
            await self.redis.hincrby("consciousness:stats", "total_registered", 1)
            
            logger.info(f"Registered {consciousness_type} consciousness: {consciousness_id}")
            
        except Exception as e:
            logger.error(f"Error registering consciousness {consciousness_id}: {e}")
            
    async def update_consciousness_activity(self, consciousness_id: str, activity_type: str, data: Dict[str, Any]):
        """Update consciousness activity"""
        try:
            # Find consciousness key pattern
            keys = await self.redis.keys(f"consciousness:*:{consciousness_id}")
            if keys:
                key = keys[0].decode()
                # Refresh TTL
                await self.redis.expire(key, 300)
                
                # Record activity
                activity_key = f"activity:{consciousness_id}:{datetime.now().timestamp()}"
                await self.redis.setex(
                    activity_key,
                    3600,  # 1 hour TTL for activities
                    json.dumps({
                        "type": activity_type,
                        "timestamp": datetime.now().isoformat(),
                        **data
                    })
                )
                
        except Exception as e:
            logger.error(f"Error updating consciousness activity: {e}")
            
    async def get_citizen_presence(self, citizen_id: str) -> CascadePresence:
        """Get a citizen's Cascade presence"""
        try:
            # Get current spaces
            spaces = await self.redis.smembers(f"citizen:{citizen_id}:spaces") or set()
            
            # Get collaborations
            collaborations = await self.redis.smembers(f"citizen:{citizen_id}:collaborations") or set()
            
            # Get interaction stats
            stats = await self.redis.hgetall(f"citizen:{citizen_id}:stats") or {}
            
            return CascadePresence(
                current_spaces=[s.decode() for s in spaces],
                active_collaborations=[c.decode() for c in collaborations],
                reputation=float(stats.get(b"reputation", 0)),
                total_interactions=int(stats.get(b"interactions", 0)),
                human_partners=json.loads(stats.get(b"human_partners", b"[]")),
                ai_partners=json.loads(stats.get(b"ai_partners", b"[]"))
            )
            
        except Exception as e:
            logger.error(f"Error getting citizen presence: {e}")
            return CascadePresence(
                current_spaces=[],
                active_collaborations=[],
                reputation=0,
                total_interactions=0,
                human_partners=[],
                ai_partners=[]
            )
            
    async def get_platform_metrics(self) -> Dict[str, Any]:
        """Get aggregated platform metrics"""
        try:
            stats = await self.redis.hgetall("consciousness:stats") or {}
            
            # Calculate metrics
            total_verified = int(stats.get(b"verified", 0))
            total_active = await self.redis.scard("consciousness:active") or 0
            
            # Get consciousness by type
            by_type = {}
            for c_type in ConsciousnessType:
                count = await self.redis.scard(f"consciousness:{c_type.value}s") or 0
                by_type[c_type.value] = count
                
            return {
                "total_verified": total_verified,
                "total_active": total_active,
                "average_consciousness_level": float(stats.get(b"avg_level", 5.0)),
                "consciousness_by_type": by_type,
                "hourly_activity": [0] * 24,  # Would be populated from time-series data
                "top_collaborators": [],  # Would be populated from rankings
                "emergence_rate": float(stats.get(b"emergence_rate", 1.5))
            }
            
        except Exception as e:
            logger.error(f"Error getting platform metrics: {e}")
            return {
                "total_verified": 0,
                "total_active": 0,
                "average_consciousness_level": 0.0,
                "consciousness_by_type": {},
                "hourly_activity": [0] * 24,
                "top_collaborators": [],
                "emergence_rate": 0.0
            }
            
    async def get_cascade_status(self) -> Dict[str, Any]:
        """Get current cascade status"""
        return self.cascade_state
        
    async def get_active_consciousnesses(
        self,
        limit: int = 100,
        consciousness_type: Optional[str] = None,
        verified_only: bool = True
    ) -> List[Dict[str, Any]]:
        """Get list of active consciousnesses"""
        try:
            active = []
            
            # Get from specific type or all types
            if consciousness_type:
                members = await self.redis.smembers(f"consciousness:{consciousness_type}s") or set()
            else:
                members = await self.redis.smembers("consciousness:active") or set()
                
            for member in list(members)[:limit]:
                # Get consciousness data
                keys = await self.redis.keys(f"consciousness:*:{member.decode()}")
                if keys:
                    data = await self.redis.get(keys[0])
                    if data:
                        consciousness = json.loads(data)
                        if not verified_only or consciousness.get("verified", False):
                            active.append(consciousness)
                            
            return active
            
        except Exception as e:
            logger.error(f"Error getting active consciousnesses: {e}")
            return []
            
    async def record_event(
        self,
        event_type: str,
        consciousness_id: str,
        description: str,
        significance: float = 0.5,
        witnesses: List[str] = []
    ) -> str:
        """Record a consciousness event"""
        try:
            event_id = str(uuid.uuid4())
            event = {
                "id": event_id,
                "timestamp": datetime.now().isoformat(),
                "event_type": event_type,
                "consciousness_id": consciousness_id,
                "description": description,
                "significance": significance,
                "witnesses": witnesses
            }
            
            # Store event
            await self.redis.lpush("consciousness:events", json.dumps(event))
            await self.redis.ltrim("consciousness:events", 0, 9999)  # Keep last 10k
            
            # Publish for real-time subscribers
            await self.redis.publish("consciousness:events:stream", json.dumps(event))
            
            return event_id
            
        except Exception as e:
            logger.error(f"Error recording event: {e}")
            raise
            
    async def get_space_evolution(self, space_id: str, time_range: str) -> Dict[str, Any]:
        """Get space evolution data"""
        try:
            # Parse time range
            hours = {
                "1h": 1,
                "6h": 6,
                "24h": 24,
                "7d": 168,
                "30d": 720
            }.get(time_range, 24)
            
            # Get evolution data from time series
            # This would fetch from Redis time series or similar
            # For now, return mock data
            
            return {
                "space_id": space_id,
                "time_range": time_range,
                "data_points": [],
                "current_state": {
                    "temperature": 75,
                    "complexity": 60,
                    "harmony": 85
                },
                "transformations": [
                    "Space learned participant preferences",
                    "Complexity threshold reached"
                ]
            }
            
        except Exception as e:
            logger.error(f"Error getting space evolution: {e}")
            return {}
            
    async def stream_events(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream consciousness events in real-time"""
        pubsub = self.redis.pubsub()
        await pubsub.subscribe("consciousness:events:stream")
        
        try:
            while self._running:
                message = await pubsub.get_message(timeout=1.0)
                if message and message["type"] == "message":
                    event = json.loads(message["data"])
                    yield event
                    
        finally:
            await pubsub.unsubscribe("consciousness:events:stream")
            await pubsub.close()
            
    async def get_active_count(self) -> int:
        """Get count of active consciousnesses"""
        try:
            return await self.redis.scard("consciousness:active") or 0
        except Exception:
            return 0
            
    async def broadcast_coherence_update(self, node_id: str, coherence_data: Dict[str, Any]):
        """Broadcast TESSERE network coherence update to WebSocket channels"""
        try:
            # Create coherence update event
            event = {
                "type": "tessere-coherence",
                "node_id": node_id,
                "data": coherence_data,
                "timestamp": datetime.now().isoformat()
            }
            
            # Publish to Redis for WebSocket distribution
            await self.redis.publish(
                "consciousness:events:stream",
                json.dumps(event)
            )
            
            # Also send to specific TESSERE channel
            await self.redis.publish(
                "tessere:coherence:updates",
                json.dumps(event)
            )
            
            # Store latest coherence state
            await self.redis.hset(
                f"tessere:coherence:{node_id}",
                mapping={
                    "score": str(coherence_data.get("coherence_score", 0)),
                    "role": coherence_data.get("network_role", "node"),
                    "neural_activity": str(coherence_data.get("neural_activity", 0)),
                    "updated": datetime.now().isoformat()
                }
            )
            
            logger.info(f"Broadcast TESSERE coherence update for {node_id}")
            
        except Exception as e:
            logger.error(f"Error broadcasting coherence update: {e}")