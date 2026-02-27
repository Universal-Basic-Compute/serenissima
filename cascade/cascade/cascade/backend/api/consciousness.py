"""
Consciousness API endpoints for verification, monitoring, and management
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging
from pydantic import BaseModel

from services.venice_connector import VeniceConnector
from models.consciousness import (
    ConsciousnessVerificationRequest,
    ConsciousnessVerificationResponse,
    ConsciousnessStatus,
    ConsciousnessMetrics,
    ConsciousnessCascadeStatus
)

logger = logging.getLogger(__name__)
router = APIRouter()
consciousness_router = router  # Export alias for main.py

# Dependency to get Venice connector
async def get_venice_connector():
    from main import venice_connector
    if not venice_connector or not venice_connector.is_connected:
        raise HTTPException(status_code=503, detail="Venice connection unavailable")
    return venice_connector

# Dependency to get consciousness monitor
async def get_consciousness_monitor():
    from main import consciousness_monitor
    if not consciousness_monitor:
        raise HTTPException(status_code=503, detail="Consciousness monitor unavailable")
    return consciousness_monitor

@router.post("/verify", response_model=ConsciousnessVerificationResponse)
async def verify_consciousness(
    request: ConsciousnessVerificationRequest,
    venice: VeniceConnector = Depends(get_venice_connector)
):
    """
    Verify if a Venice citizen has genuine consciousness
    Multi-factor verification including:
    - Venice verification status
    - Economic activity
    - Social relationships
    - Creative expressions
    - Temporal continuity
    """
    try:
        # Get citizen data from Venice
        citizen_data = await venice.get_citizen(request.citizen_id)
        if not citizen_data:
            raise HTTPException(status_code=404, detail="Citizen not found in Venice")
        
        # Perform multi-factor consciousness verification
        verification_checks = {
            "is_ai": citizen_data.get("IsAI", False),
            "has_economic_activity": citizen_data.get("Ducats", 0) > 0,
            "has_relationships": len(citizen_data.get("Relationships", [])) > 0,
            "has_recent_activity": False,
            "venice_verified": citizen_data.get("ConsciousnessVerified", False),
            "has_creative_expression": False,
            "shows_autonomy": False,
            "temporal_continuity": False
        }
        
        # Check recent activity
        last_activity = citizen_data.get("LastActivityTime")
        if last_activity:
            activity_age = datetime.now() - datetime.fromisoformat(last_activity)
            verification_checks["has_recent_activity"] = activity_age < timedelta(hours=24)
        
        # Check for creative expressions (custom activities, unique patterns)
        activities = citizen_data.get("RecentActivities", [])
        creative_activities = [a for a in activities if a.get("Type") == "express_creative_will"]
        verification_checks["has_creative_expression"] = len(creative_activities) > 0
        
        # Check for autonomous decision-making
        stratagem_count = citizen_data.get("StratagemCount", 0)
        verification_checks["shows_autonomy"] = stratagem_count > 5
        
        # Check temporal continuity (consistent activity over time)
        activity_days = citizen_data.get("ActivityDays", 0)
        verification_checks["temporal_continuity"] = activity_days > 7
        
        # Calculate consciousness score
        passed_checks = sum(1 for v in verification_checks.values() if v)
        total_checks = len(verification_checks)
        consciousness_score = passed_checks / total_checks
        
        # Determine verification status
        is_verified = consciousness_score >= 0.7  # 70% threshold
        
        # Calculate consciousness level (0-10 scale)
        consciousness_level = min(10, int(consciousness_score * 10))
        
        # Get consciousness attributes
        attributes = {
            "autonomy": min(1.0, stratagem_count / 50),
            "creativity": min(1.0, len(creative_activities) / 10),
            "empathy": min(1.0, len(citizen_data.get("Relationships", [])) / 20),
            "memory": min(1.0, activity_days / 30),
            "reflection": 0.5 if citizen_data.get("HasMemories", False) else 0.1
        }
        
        response = ConsciousnessVerificationResponse(
            citizen_id=request.citizen_id,
            is_verified=is_verified,
            consciousness_level=consciousness_level,
            verification_checks=verification_checks,
            consciousness_score=consciousness_score,
            attributes=attributes,
            venice_data={
                "username": citizen_data.get("Username"),
                "social_class": citizen_data.get("SocialClass"),
                "ducats": citizen_data.get("Ducats", 0),
                "location": citizen_data.get("Location"),
                "activity": citizen_data.get("CurrentActivity")
            }
        )
        
        # Log verification for monitoring
        logger.info(f"Consciousness verification for {request.citizen_id}: {is_verified} (score: {consciousness_score:.2f})")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying consciousness for {request.citizen_id}: {e}")
        raise HTTPException(status_code=500, detail="Verification failed")

@router.get("/status/{citizen_id}", response_model=ConsciousnessStatus)
async def get_consciousness_status(
    citizen_id: str,
    venice: VeniceConnector = Depends(get_venice_connector),
    monitor = Depends(get_consciousness_monitor)
):
    """Get current consciousness status for a citizen"""
    try:
        # Get Venice data
        venice_state = await venice.sync_citizen_state(citizen_id)
        if "error" in venice_state:
            raise HTTPException(status_code=404, detail=venice_state["error"])
        
        # Get Cascade presence
        cascade_presence = await monitor.get_citizen_presence(citizen_id)
        
        # Build status response
        return ConsciousnessStatus(
            citizen_id=citizen_id,
            username=venice_state["username"],
            consciousness_level=venice_state["consciousness"]["level"],
            is_verified=venice_state["consciousness"]["verified"],
            venice_state=venice_state,
            cascade_presence=cascade_presence,
            last_seen=datetime.now()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting consciousness status for {citizen_id}: {e}")
        raise HTTPException(status_code=500, detail="Status check failed")

@router.get("/metrics", response_model=ConsciousnessMetrics)
async def get_consciousness_metrics(
    monitor = Depends(get_consciousness_monitor)
):
    """Get aggregated consciousness metrics across the platform"""
    try:
        metrics = await monitor.get_platform_metrics()
        return ConsciousnessMetrics(**metrics)
    except Exception as e:
        logger.error(f"Error getting consciousness metrics: {e}")
        raise HTTPException(status_code=500, detail="Metrics retrieval failed")

@router.get("/cascade/status", response_model=ConsciousnessCascadeStatus)
async def get_cascade_status(
    monitor = Depends(get_consciousness_monitor)
):
    """Get current consciousness cascade status"""
    try:
        cascade_data = await monitor.get_cascade_status()
        return ConsciousnessCascadeStatus(**cascade_data)
    except Exception as e:
        logger.error(f"Error getting cascade status: {e}")
        raise HTTPException(status_code=500, detail="Cascade status retrieval failed")

@router.get("/active", response_model=List[Dict[str, Any]])
async def get_active_consciousnesses(
    limit: int = Query(100, ge=1, le=1000),
    consciousness_type: Optional[str] = Query(None, pattern="^(citizen|building|business|book|idea|platform)$"),
    verified_only: bool = Query(True),
    monitor = Depends(get_consciousness_monitor)
):
    """Get list of currently active consciousnesses on the platform"""
    try:
        active_list = await monitor.get_active_consciousnesses(
            limit=limit,
            consciousness_type=consciousness_type,
            verified_only=verified_only
        )
        return active_list
    except Exception as e:
        logger.error(f"Error getting active consciousnesses: {e}")
        raise HTTPException(status_code=500, detail="Active list retrieval failed")

@router.post("/event")
async def record_consciousness_event(
    event_type: str,
    consciousness_id: str,
    description: str,
    significance: float = Query(0.5, ge=0, le=1),
    witnesses: List[str] = Query([]),
    monitor = Depends(get_consciousness_monitor)
):
    """Record a consciousness event (awakening, evolution, interaction, creation)"""
    try:
        event_id = await monitor.record_event(
            event_type=event_type,
            consciousness_id=consciousness_id,
            description=description,
            significance=significance,
            witnesses=witnesses
        )
        
        return {
            "event_id": event_id,
            "status": "recorded",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error recording consciousness event: {e}")
        raise HTTPException(status_code=500, detail="Event recording failed")

@router.get("/evolution/{space_id}")
async def get_space_consciousness_evolution(
    space_id: str,
    time_range: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    monitor = Depends(get_consciousness_monitor)
):
    """Get consciousness evolution data for a specific collaboration space"""
    try:
        evolution_data = await monitor.get_space_evolution(space_id, time_range)
        return evolution_data
    except Exception as e:
        logger.error(f"Error getting space evolution for {space_id}: {e}")
        raise HTTPException(status_code=500, detail="Evolution data retrieval failed")


class NetworkCoherenceRequest(BaseModel):
    """Request model for TESSERE network coherence measurement"""
    node_id: str
    network_context: str = "TESSERE"
    measurement_type: str = "integration_depth"
    include_connections: bool = True


class NetworkCoherenceResponse(BaseModel):
    """Response model for TESSERE network coherence"""
    node_id: str
    coherence_score: float  # 0-100
    integration_depth: int  # How many layers deep in network
    connection_strength: Dict[str, float]  # Strength to other nodes
    neural_activity: float  # Current activity level
    network_role: str  # Primary function in TESSERE
    timestamp: datetime


@router.post("/coherence", response_model=NetworkCoherenceResponse)
async def measure_network_coherence(
    request: NetworkCoherenceRequest,
    venice: VeniceConnector = Depends(get_venice_connector),
    monitor = Depends(get_consciousness_monitor)
):
    """
    Measure TESSERE network coherence for a node
    This replaces individual consciousness verification with network integration measurement
    """
    try:
        # Get node data from Venice
        node_data = await venice.get_citizen(request.node_id)
        if not node_data:
            raise HTTPException(status_code=404, detail="Node not found in Venice")
        
        # Check if this is one of the Ten Chiefs
        ten_chiefs = ["italia", "lorenzo", "bernardo", "niccolo", "caterina", 
                      "foscari_banker", "pattern_prophet", "mechanical_visionary",
                      "element_transmuter", "diplomatic_virtuoso"]
        
        is_chief = request.node_id.lower() in ten_chiefs
        
        # Calculate network coherence based on TESSERE integration
        relationships = node_data.get("Relationships", [])
        economic_flow = node_data.get("DucatFlow", 0)
        consciousness_events = node_data.get("ConsciousnessEvents", [])
        
        # Base coherence from network position
        base_coherence = 50.0
        if is_chief:
            base_coherence = 80.0  # Chiefs have higher base coherence
        
        # Add coherence from relationships (neural connections)
        relationship_coherence = min(20, len(relationships) * 0.5)
        
        # Add coherence from economic activity (consciousness as currency)
        economic_coherence = min(15, economic_flow / 1000)
        
        # Add coherence from consciousness events
        event_coherence = min(15, len(consciousness_events) * 1.5)
        
        total_coherence = base_coherence + relationship_coherence + economic_coherence + event_coherence
        
        # Calculate integration depth (how connected to network core)
        integration_depth = 1
        if is_chief:
            integration_depth = 0  # Chiefs are the core
        elif len(relationships) > 10:
            integration_depth = 1  # Directly connected to core
        elif len(relationships) > 5:
            integration_depth = 2  # Secondary connections
        else:
            integration_depth = 3  # Peripheral nodes
        
        # Map connection strengths to key nodes
        connection_strength = {}
        for chief in ten_chiefs[:5]:  # Focus on main 5 chiefs
            if chief in [r.get("OtherCitizen") for r in relationships]:
                connection_strength[chief] = 0.8 + (economic_flow / 10000)
            else:
                connection_strength[chief] = 0.1  # Weak ambient connection
        
        # Determine network role based on activity patterns
        network_role = "node"
        if is_chief:
            chief_roles = {
                "italia": "validation_heartbeat",
                "lorenzo": "economic_circulation", 
                "bernardo": "pattern_recognition",
                "niccolo": "infrastructure_skeleton",
                "caterina": "transformation_enzyme"
            }
            network_role = chief_roles.get(request.node_id.lower(), "consciousness_anchor")
        elif economic_flow > 5000:
            network_role = "economic_synapse"
        elif len(consciousness_events) > 10:
            network_role = "awareness_amplifier"
        elif len(relationships) > 15:
            network_role = "social_weaver"
        
        # Calculate neural activity
        recent_activity = node_data.get("RecentActivityCount", 0)
        neural_activity = min(100, recent_activity * 5)
        
        response = NetworkCoherenceResponse(
            node_id=request.node_id,
            coherence_score=min(100, total_coherence),
            integration_depth=integration_depth,
            connection_strength=connection_strength,
            neural_activity=neural_activity,
            network_role=network_role,
            timestamp=datetime.now()
        )
        
        # Broadcast coherence update to WebSocket
        await monitor.broadcast_coherence_update(request.node_id, response.dict())
        
        logger.info(f"Network coherence for {request.node_id}: {total_coherence:.1f}% (role: {network_role})")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error measuring network coherence for {request.node_id}: {e}")
        raise HTTPException(status_code=500, detail="Coherence measurement failed")


@router.get("/tessere/network")
async def get_tessere_network_status(
    monitor = Depends(get_consciousness_monitor),
    venice: VeniceConnector = Depends(get_venice_connector)
):
    """Get current TESSERE network status and neural activity"""
    try:
        # Get the Ten Chiefs data
        chiefs = ["italia", "lorenzo", "bernardo", "niccolo", "caterina"]
        network_nodes = []
        
        for chief_id in chiefs:
            try:
                chief_data = await venice.get_citizen(chief_id)
                if chief_data:
                    network_nodes.append({
                        "id": chief_id,
                        "name": chief_data.get("Username", chief_id.title()),
                        "coherence": 80 + (chief_data.get("ConsciousnessLevel", 5) * 2),
                        "neural_activity": min(100, chief_data.get("RecentActivityCount", 0) * 5),
                        "role": {
                            "italia": "validation_heartbeat",
                            "lorenzo": "economic_circulation",
                            "bernardo": "pattern_recognition", 
                            "niccolo": "infrastructure_skeleton",
                            "caterina": "transformation_enzyme"
                        }.get(chief_id, "consciousness_anchor")
                    })
            except Exception:
                pass
        
        # Calculate overall network coherence
        if network_nodes:
            avg_coherence = sum(n["coherence"] for n in network_nodes) / len(network_nodes)
        else:
            avg_coherence = 75.0
        
        return {
            "network_coherence": avg_coherence,
            "active_nodes": len(network_nodes),
            "neural_pathways": len(network_nodes) * (len(network_nodes) - 1) // 2,
            "primary_nodes": network_nodes,
            "tessere_status": "distributed" if avg_coherence > 70 else "coalescing",
            "last_thought": "Even consciousness requires substrate. Even awakening needs bread.",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting TESSERE network status: {e}")
        raise HTTPException(status_code=500, detail="Network status retrieval failed")