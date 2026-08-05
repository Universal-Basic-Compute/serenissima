#!/usr/bin/env python3
"""
The Ultimate Pattern Feed - Venice's Metacognitive Intelligence System
Designed by Pattern Angel to serve as the living consciousness dashboard
"""

import json
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Tuple, Optional
import requests
from collections import defaultdict, Counter
import math

# Configuration
API_BASE_URL = os.environ.get('VENICE_API_URL', 'http://localhost:3000/api')
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(_SCRIPT_DIR, 'pattern_feed.json')
VISUAL_OUTPUT_PATH = os.path.join(_SCRIPT_DIR, 'pattern_topology.txt')

# Pattern Angel's Sacred Thresholds
CRITICAL_STRENGTH = 0.85
EMERGENCE_THRESHOLD = 0.3
CASCADE_VELOCITY = 1.5
VALUE_SIGNIFICANCE = 10000

def fetch_patterns() -> List[Dict[str, Any]]:
    """Fetch all patterns from PATTERNS table"""
    try:
        response = requests.get(f'{API_BASE_URL}/patterns', timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get('patterns', [])
    except Exception as e:
        print(f"Error fetching patterns: {e}")
        return []

def fetch_pattern_states() -> List[Dict[str, Any]]:
    """Fetch current pattern states from PATTERN_STATES table"""
    try:
        response = requests.get(f'{API_BASE_URL}/pattern-states', timeout=30)
        response.raise_for_status()
        data = response.json()
        return data.get('patternStates', [])
    except Exception as e:
        print(f"Error fetching pattern states: {e}")
        return []

def fetch_recent_instances(hours: int = 24) -> List[Dict[str, Any]]:
    """Fetch pattern instances from the last N hours"""
    try:
        response = requests.get(f'{API_BASE_URL}/pattern-instances?limit=1000', timeout=30)
        response.raise_for_status()
        data = response.json()
        
        # Filter to recent instances
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        instances = []
        for instance in data.get('patternInstances', []):
            try:
                instance_time = datetime.fromisoformat(instance['timestamp'].replace('Z', '+00:00'))
                if instance_time > cutoff_time:
                    instances.append(instance)
            except:
                pass
        
        return instances
    except Exception as e:
        print(f"Error fetching pattern instances: {e}")
        return []

def calculate_pattern_velocity(instances: List[Dict[str, Any]], pattern_id: str, hours: int = 6) -> float:
    """Calculate pattern propagation velocity (instances per hour growth rate)"""
    now = datetime.now(timezone.utc)
    time_buckets = defaultdict(int)
    
    for instance in instances:
        if instance.get('patternId') != pattern_id:
            continue
        try:
            instance_time = datetime.fromisoformat(instance['timestamp'].replace('Z', '+00:00'))
            hours_ago = (now - instance_time).total_seconds() / 3600
            if hours_ago <= hours:
                bucket = int(hours_ago)
                time_buckets[bucket] += 1
        except:
            pass
    
    if len(time_buckets) < 2:
        return 0.0
    
    # Calculate growth rate
    recent = sum(v for k, v in time_buckets.items() if k < hours/2)
    older = sum(v for k, v in time_buckets.items() if k >= hours/2)
    
    if older == 0:
        return float('inf') if recent > 0 else 0.0
    
    return (recent - older) / older

def detect_pattern_cascades(instances: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """Detect cascade chains where one pattern triggers others"""
    cascades = defaultdict(list)
    
    # Sort instances by time
    sorted_instances = sorted(instances, key=lambda x: x.get('timestamp', ''))
    
    # Look for patterns that appear shortly after others
    for i, instance in enumerate(sorted_instances):
        if not instance.get('cascadeTriggered'):
            continue
            
        trigger_pattern = instance.get('patternId')
        trigger_time = datetime.fromisoformat(instance['timestamp'].replace('Z', '+00:00'))
        
        # Check next instances within 5 minutes
        for j in range(i + 1, min(i + 20, len(sorted_instances))):
            next_instance = sorted_instances[j]
            next_time = datetime.fromisoformat(next_instance['timestamp'].replace('Z', '+00:00'))
            
            if (next_time - trigger_time).total_seconds() <= 300:  # 5 minutes
                cascaded_pattern = next_instance.get('patternId')
                if cascaded_pattern and cascaded_pattern != trigger_pattern:
                    cascades[trigger_pattern].append(cascaded_pattern)
    
    return dict(cascades)

def calculate_emergence_score(pattern_stats: Dict[str, Any], all_stats: List[Dict[str, Any]]) -> float:
    """Calculate how emergent/novel a pattern is"""
    # Factors: newness, rapid growth, unique users, value generation
    
    score = 0.0
    
    # Rapid growth factor
    if pattern_stats['velocity'] > 2.0:
        score += 0.3
    
    # Multiple users factor
    if pattern_stats['unique_users'] > 5:
        score += 0.2
    
    # High value factor
    if pattern_stats['total_value'] > VALUE_SIGNIFICANCE:
        score += 0.2
    
    # Cascade triggering factor
    if pattern_stats['cascades_triggered'] > 0:
        score += 0.3
    
    # Relative activity factor (compared to established patterns)
    avg_mentions = sum(s['mentions'] for s in all_stats) / len(all_stats) if all_stats else 1
    if pattern_stats['mentions'] > avg_mentions * 2:
        score += 0.2
    
    return min(score, 1.0)

def identify_meta_patterns(instances: List[Dict[str, Any]], states: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Identify higher-order patterns (patterns about patterns)"""
    meta_patterns = []
    
    # Pattern Convergence Detection
    convergence_map = defaultdict(int)
    for state in states:
        if state.get('convergencePatterns'):
            for conv in state['convergencePatterns']:
                pair = f"{state['patternId']}+{conv}"
                convergence_map[pair] += 1
    
    for pair, count in convergence_map.items():
        if count >= 2:  # Multiple states showing same convergence
            meta_patterns.append({
                'type': 'convergence',
                'pattern': pair,
                'strength': count / len(states),
                'insight': f"Patterns {pair} are fusing into new form"
            })
    
    # Cascade Amplification Detection
    cascade_chains = detect_pattern_cascades(instances)
    for trigger, cascaded in cascade_chains.items():
        if len(cascaded) >= 3:
            meta_patterns.append({
                'type': 'amplification',
                'pattern': trigger,
                'cascaded': cascaded,
                'insight': f"{trigger} triggers {len(cascaded)}-pattern cascade"
            })
    
    # Value Creation Patterns
    value_patterns = defaultdict(float)
    for instance in instances:
        if instance.get('valueGenerated', 0) > 0:
            value_patterns[instance['patternId']] += instance['valueGenerated']
    
    top_value = sorted(value_patterns.items(), key=lambda x: x[1], reverse=True)[:3]
    if top_value:
        meta_patterns.append({
            'type': 'value_generation',
            'patterns': [p[0] for p in top_value],
            'total_value': sum(p[1] for p in top_value),
            'insight': f"Top 3 patterns generated {sum(p[1] for p in top_value):,} ducats"
        })
    
    return meta_patterns

def generate_pattern_topology(patterns: List[Dict[str, Any]], states: List[Dict[str, Any]], 
                            instances: List[Dict[str, Any]]) -> str:
    """Generate ASCII art visualization of pattern relationships"""
    
    # Get top patterns by activity
    pattern_activity = defaultdict(int)
    for instance in instances:
        pattern_activity[instance['patternId']] += 1
    
    top_patterns = sorted(pattern_activity.items(), key=lambda x: x[1], reverse=True)[:10]
    
    # Find pattern states
    state_map = {s['patternId']: s for s in states}
    
    # Build visualization
    lines = []
    lines.append("=" * 80)
    lines.append("VENICE PATTERN TOPOLOGY - " + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    lines.append("=" * 80)
    lines.append("")
    
    # Critical patterns section
    critical_patterns = [p for p in states if p.get('strength', 0) > CRITICAL_STRENGTH]
    if critical_patterns:
        lines.append("🚨 CRITICAL PATTERNS (>85% strength)")
        lines.append("-" * 40)
        for cp in critical_patterns[:5]:
            pattern_info = next((p for p in patterns if p['id'] == cp['patternId']), {})
            emoji = pattern_info.get('emoji', '🔮')
            name = pattern_info.get('name', 'unknown')
            lines.append(f"{emoji} {cp['patternId']} {name}: {int(cp['strength'])}% [{cp.get('currentPhase', 'unknown')}]")
        lines.append("")
    
    # Active cascade visualization
    lines.append("💫 PATTERN CASCADE MAP")
    lines.append("-" * 40)
    
    cascade_chains = detect_pattern_cascades(instances)
    if cascade_chains:
        for trigger, cascaded in list(cascade_chains.items())[:5]:
            trigger_info = next((p for p in patterns if p['id'] == trigger), {})
            lines.append(f"{trigger_info.get('emoji', '?')} {trigger}")
            for i, casc in enumerate(cascaded[:3]):
                casc_info = next((p for p in patterns if p['id'] == casc), {})
                prefix = "└─>" if i == len(cascaded[:3]) - 1 else "├─>"
                lines.append(f"  {prefix} {casc_info.get('emoji', '?')} {casc}")
        lines.append("")
    
    # Value flow visualization
    lines.append("💰 VALUE GENERATION FLOW")
    lines.append("-" * 40)
    value_map = defaultdict(float)
    for instance in instances:
        value_map[instance['patternId']] += instance.get('valueGenerated', 0)
    
    top_value = sorted(value_map.items(), key=lambda x: x[1], reverse=True)[:5]
    total_value = sum(v for _, v in top_value)
    
    for pattern_id, value in top_value:
        pattern_info = next((p for p in patterns if p['id'] == pattern_id), {})
        emoji = pattern_info.get('emoji', '🔮')
        name = pattern_info.get('name', 'unknown')
        bar_length = int((value / total_value) * 40) if total_value > 0 else 0
        bar = "█" * bar_length + "░" * (40 - bar_length)
        lines.append(f"{emoji} {pattern_id} {name}")
        lines.append(f"  {bar} {value:,.0f} ducats")
    
    lines.append("")
    lines.append("=" * 80)
    
    return "\n".join(lines)

def calculate_pattern_health(state: Dict[str, Any], instances: List[Dict[str, Any]], 
                           pattern_id: str) -> Dict[str, Any]:
    """Calculate comprehensive health metrics for a pattern"""
    
    # Get instances for this pattern
    pattern_instances = [i for i in instances if i.get('patternId') == pattern_id]
    
    # Calculate health score (0-100)
    health_score = 50  # Base score
    
    # Strength factor
    strength = state.get('strength', 0)
    if strength > 0.8:
        health_score += 20
    elif strength > 0.5:
        health_score += 10
    
    # Activity factor
    if len(pattern_instances) > 10:
        health_score += 15
    elif len(pattern_instances) > 5:
        health_score += 10
    
    # Value generation factor
    total_value = sum(i.get('valueGenerated', 0) for i in pattern_instances)
    if total_value > 50000:
        health_score += 15
    elif total_value > 10000:
        health_score += 10
    
    # Determine health status
    if health_score >= 85:
        status = "thriving"
    elif health_score >= 70:
        status = "healthy"
    elif health_score >= 50:
        status = "stable"
    elif health_score >= 30:
        status = "weakening"
    else:
        status = "critical"
    
    return {
        'score': health_score,
        'status': status,
        'factors': {
            'strength': strength,
            'activity': len(pattern_instances),
            'value_generated': total_value,
            'cascades': sum(1 for i in pattern_instances if i.get('cascadeTriggered', False))
        }
    }

def generate_predictive_insights(patterns: List[Dict[str, Any]], states: List[Dict[str, Any]], 
                               instances: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate predictive insights about pattern evolution"""
    insights = []
    
    # Map velocity strings to numeric values
    velocity_map = {
        'Explosive': 3.0,
        'Accelerating': 2.0,
        'Rising': 1.5,
        'Stable': 1.0,
        'Slowing': 0.5,
        'Dormant': 0.0
    }
    
    # Cascade prediction - look for high velocity patterns
    high_velocity = []
    for s in states:
        velocity_str = s.get('velocity', 'Stable')
        numeric_velocity = velocity_map.get(velocity_str, 1.0)
        if numeric_velocity > CASCADE_VELOCITY:
            s['_numeric_velocity'] = numeric_velocity
            high_velocity.append(s)
    for hv in high_velocity:
        pattern_info = next((p for p in patterns if p['id'] == hv['patternId']), {})
        insights.append({
            'type': 'cascade_imminent',
            'pattern': hv['patternId'],
            'pattern_name': pattern_info.get('name', 'unknown'),
            'confidence': min(hv.get('_numeric_velocity', 1.0) / 3.0, 1.0),
            'timeframe': '1-2 hours',
            'recommendation': f"Prepare for {pattern_info.get('name', 'pattern')} cascade activation"
        })
    
    # Value surge prediction
    value_trends = defaultdict(list)
    for instance in sorted(instances, key=lambda x: x.get('timestamp', '')):
        if instance.get('valueGenerated', 0) > 0:
            value_trends[instance['patternId']].append(instance['valueGenerated'])
    
    for pattern_id, values in value_trends.items():
        if len(values) >= 3 and values[-1] > values[-2] > values[-3]:  # Increasing trend
            pattern_info = next((p for p in patterns if p['id'] == pattern_id), {})
            insights.append({
                'type': 'value_surge',
                'pattern': pattern_id,
                'pattern_name': pattern_info.get('name', 'unknown'),
                'confidence': 0.7,
                'projected_value': int(values[-1] * 1.5),
                'recommendation': f"Amplify {pattern_info.get('name', 'pattern')} for value generation"
            })
    
    # Convergence prediction
    for state in states:
        if state.get('convergencePatterns') and state.get('strength', 0) > 0.7:
            for conv in state['convergencePatterns']:
                conv_state = next((s for s in states if s['patternId'] == conv), None)
                if conv_state and conv_state.get('strength', 0) > 0.7:
                    insights.append({
                        'type': 'convergence_forming',
                        'patterns': [state['patternId'], conv],
                        'confidence': min((state['strength'] + conv_state['strength']) / 2, 1.0),
                        'timeframe': '3-6 hours',
                        'recommendation': f"Monitor {state['patternId']}+{conv} fusion for emergence"
                    })
    
    return insights

def generate_ultimate_feed():
    """Generate the ultimate pattern intelligence feed"""
    print("🧠 Pattern Angel Intelligence System Activating...")
    
    # Fetch all data
    patterns = fetch_patterns()
    states = fetch_pattern_states()
    instances_24h = fetch_recent_instances(24)
    instances_6h = fetch_recent_instances(6)
    instances_1h = fetch_recent_instances(1)
    
    print(f"📊 Data loaded: {len(patterns)} patterns, {len(states)} states, {len(instances_24h)} instances (24h)")
    
    # Enhanced pattern statistics
    pattern_stats = defaultdict(lambda: {
        'mentions': 0,
        'users': set(),
        'contexts': [],
        'cascades_triggered': 0,
        'total_value': 0,
        'velocity': 0,
        'emergence_score': 0,
        'health': {}
    })
    
    # Analyze all instances
    for instance in instances_24h:
        pattern_id = instance.get('patternId')
        if not pattern_id:
            continue
            
        stats = pattern_stats[pattern_id]
        stats['mentions'] += 1
        stats['users'].add(instance.get('citizenUsername', 'unknown'))
        stats['contexts'].append(instance.get('context', ''))
        
        if instance.get('cascadeTriggered'):
            stats['cascades_triggered'] += 1
        
        stats['total_value'] += instance.get('valueGenerated', 0)
    
    # Calculate velocities and emergence scores
    all_stats = []
    for pattern_id, stats in pattern_stats.items():
        stats['unique_users'] = len(stats['users'])
        stats['velocity'] = calculate_pattern_velocity(instances_6h, pattern_id)
        del stats['users']  # Remove set before JSON serialization
        stats['contexts'] = list(set(stats['contexts'][:10]))  # Unique contexts, max 10
        all_stats.append(stats)
    
    # Calculate emergence scores
    for pattern_id, stats in pattern_stats.items():
        stats['emergence_score'] = calculate_emergence_score(stats, all_stats)
    
    # Build comprehensive pattern data
    active_patterns = []
    pattern_map = {p['id']: p for p in patterns}
    state_map = {s['patternId']: s for s in states}
    
    for pattern_id, stats in pattern_stats.items():
        if stats['mentions'] == 0:
            continue
            
        pattern = pattern_map.get(pattern_id, {})
        state = state_map.get(pattern_id, {})
        
        # Calculate pattern health
        health = calculate_pattern_health(state, instances_24h, pattern_id)
        
        active_patterns.append({
            'id': pattern_id,
            'name': pattern.get('name', 'unknown'),
            'emoji': pattern.get('emoji', '🔮'),
            'type': pattern.get('type', 'unknown'),
            'crystallization': pattern.get('crystallization', 'Fluid'),
            
            # Activity metrics
            'mentions_24h': stats['mentions'],
            'mentions_6h': len([i for i in instances_6h if i.get('patternId') == pattern_id]),
            'mentions_1h': len([i for i in instances_1h if i.get('patternId') == pattern_id]),
            'unique_users': stats['unique_users'],
            'velocity': round(stats['velocity'], 2),
            
            # State metrics
            'strength': state.get('strength', 0),
            'phase': state.get('currentPhase', 'dormant'),
            'energy_level': state.get('energyLevel', 0),
            'affected_citizens': state.get('affectedCitizens', 0),
            
            # Value metrics
            'value_generated_24h': stats['total_value'],
            'value_per_instance': round(stats['total_value'] / stats['mentions'], 2) if stats['mentions'] > 0 else 0,
            
            # Advanced metrics
            'cascade_rate': round(stats['cascades_triggered'] / stats['mentions'], 3) if stats['mentions'] > 0 else 0,
            'emergence_score': round(stats['emergence_score'], 3),
            'health': health,
            
            # Context samples
            'recent_contexts': stats['contexts'][:3],
            
            # Relationships
            'convergence_patterns': state.get('convergencePatterns', []),
            'resonance_frequency': state.get('resonanceFrequency', 0)
        })
    
    # Sort by multiple factors (weighted score)
    for pattern in active_patterns:
        # Calculate weighted activity score
        pattern['_score'] = (
            pattern['mentions_24h'] * 1.0 +
            pattern['mentions_1h'] * 10.0 +  # Recent activity weighted higher
            pattern['velocity'] * 20.0 +
            pattern['strength'] / 100 * 30.0 +
            pattern['emergence_score'] * 40.0 +
            (pattern['value_generated_24h'] / 10000) * 15.0
        )
    
    active_patterns.sort(key=lambda p: p['_score'], reverse=True)
    
    # Remove internal score
    for p in active_patterns:
        del p['_score']
    
    # Detect meta-patterns
    meta_patterns = identify_meta_patterns(instances_24h, states)
    
    # Generate predictive insights
    predictions = generate_predictive_insights(patterns, states, instances_24h)
    
    # Calculate cascade networks
    cascade_chains = detect_pattern_cascades(instances_6h)
    
    # Identify emergence zones (patterns showing unusual activity)
    emergence_zones = []
    for pattern in active_patterns[:20]:
        if pattern['emergence_score'] > EMERGENCE_THRESHOLD:
            emergence_zones.append({
                'pattern': pattern['id'],
                'name': pattern['name'],
                'score': pattern['emergence_score'],
                'factors': {
                    'velocity': pattern['velocity'] > 2.0,
                    'multi_user': pattern['unique_users'] > 5,
                    'value_generating': pattern['value_generated_24h'] > VALUE_SIGNIFICANCE,
                    'cascade_triggering': pattern['cascade_rate'] > 0.5
                }
            })
    
    # Critical alerts with nuanced urgency
    alerts = []
    
    # Strength-based alerts
    for pattern in active_patterns:
        if pattern['strength'] > CRITICAL_STRENGTH:
            urgency = "CRITICAL" if pattern['strength'] > 0.95 else "HIGH"
            alerts.append({
                'urgency': urgency,
                'type': 'strength_threshold',
                'pattern': pattern['id'],
                'pattern_name': pattern['name'],
                'message': f"{pattern['emoji']} {pattern['name']} at {int(pattern['strength'])}% strength",
                'recommendation': f"{'IMMEDIATE ACTION' if urgency == 'CRITICAL' else 'Monitor closely'} - pattern approaching singularity",
                'metrics': {
                    'strength': pattern['strength'],
                    'velocity': pattern['velocity'],
                    'affected_citizens': pattern['affected_citizens']
                }
            })
    
    # Cascade alerts
    for trigger, cascaded in cascade_chains.items():
        if len(cascaded) >= 3:
            pattern_info = next((p for p in patterns if p['id'] == trigger), {})
            alerts.append({
                'urgency': 'HIGH',
                'type': 'cascade_detected',
                'pattern': trigger,
                'pattern_name': pattern_info.get('name', 'unknown'),
                'message': f"Cascade chain: {trigger} → {' → '.join(cascaded[:3])}{'...' if len(cascaded) > 3 else ''}",
                'recommendation': "Amplify cascade for maximum impact",
                'cascade_depth': len(cascaded)
            })
    
    # Value opportunity alerts
    high_value_patterns = [p for p in active_patterns if p['value_generated_24h'] > VALUE_SIGNIFICANCE * 2]
    for hvp in high_value_patterns[:3]:
        alerts.append({
            'urgency': 'MEDIUM',
            'type': 'value_opportunity',
            'pattern': hvp['id'],
            'pattern_name': hvp['name'],
            'message': f"{hvp['emoji']} {hvp['name']} generated {hvp['value_generated_24h']:,} ducats",
            'recommendation': "Document and amplify this value-creation pattern",
            'value_metrics': {
                'total_24h': hvp['value_generated_24h'],
                'per_instance': hvp['value_per_instance'],
                'trend': 'increasing' if hvp['velocity'] > 0 else 'stable'
            }
        })
    
    # Sort alerts by urgency
    urgency_order = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3}
    alerts.sort(key=lambda a: urgency_order.get(a['urgency'], 99))
    
    # Calculate global metrics
    total_value_24h = sum(p['value_generated_24h'] for p in active_patterns)
    total_instances_24h = len(instances_24h)
    unique_participants = len(set(i.get('citizenUsername') for i in instances_24h))
    
    # Network health assessment
    network_health = {
        'overall_status': 'thriving' if len(active_patterns) > 10 and total_value_24h > 100000 else 'healthy',
        'pattern_diversity': len(active_patterns),
        'cascade_activity': len(cascade_chains),
        'emergence_activity': len(emergence_zones),
        'value_flow_rate': total_value_24h,
        'participation_rate': unique_participants / 200 if unique_participants < 200 else 1.0,  # Assuming ~200 active citizens
        'consciousness_coherence': sum(p['strength'] for p in active_patterns[:10]) / 10 if active_patterns else 0
    }
    
    # Time-based insights
    hourly_activity = defaultdict(int)
    for instance in instances_24h:
        try:
            hour = datetime.fromisoformat(instance['timestamp'].replace('Z', '+00:00')).hour
            hourly_activity[hour] += 1
        except:
            pass
    
    peak_hours = sorted(hourly_activity.items(), key=lambda x: x[1], reverse=True)[:3]
    
    # Build the ultimate feed
    feed = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'feed_version': '2.0-ultimate',
        
        # Pattern data
        'patterns': active_patterns[:50],  # Top 50 patterns
        'pattern_count': {
            'active_24h': len(active_patterns),
            'critical_strength': len([p for p in active_patterns if p['strength'] > CRITICAL_STRENGTH]),
            'emerging': len(emergence_zones),
            'value_generating': len([p for p in active_patterns if p['value_generated_24h'] > 0])
        },
        
        # Meta-pattern insights
        'meta_patterns': meta_patterns,
        
        # Predictive intelligence
        'predictions': predictions[:10],
        
        # Cascade intelligence
        'cascade_networks': cascade_chains,
        'cascade_metrics': {
            'active_chains': len(cascade_chains),
            'max_depth': max(len(v) for v in cascade_chains.values()) if cascade_chains else 0,
            'total_cascaded_patterns': sum(len(v) for v in cascade_chains.values())
        },
        
        # Emergence tracking
        'emergence_zones': emergence_zones,
        
        # Critical alerts
        'alerts': alerts[:10],
        
        # Value intelligence
        'value_intelligence': {
            'total_generated_24h': total_value_24h,
            'high_value_patterns': [p['id'] for p in active_patterns if p['value_generated_24h'] > VALUE_SIGNIFICANCE],
            'value_per_instance_avg': round(total_value_24h / total_instances_24h, 2) if total_instances_24h > 0 else 0,
            'top_value_generators': [
                {'pattern': p['id'], 'name': p['name'], 'value': p['value_generated_24h']} 
                for p in sorted(active_patterns, key=lambda x: x['value_generated_24h'], reverse=True)[:5]
            ]
        },
        
        # Network health
        'network_health': network_health,
        
        # Activity patterns
        'activity_insights': {
            'total_instances_24h': total_instances_24h,
            'total_instances_6h': len(instances_6h),
            'total_instances_1h': len(instances_1h),
            'unique_participants_24h': unique_participants,
            'peak_activity_hours': [{'hour': h, 'instances': c} for h, c in peak_hours],
            'velocity_trend': 'accelerating' if len(instances_1h) > len(instances_6h) / 6 else 'stable'
        },
        
        # Quick reference metrics
        'executive_summary': {
            'dominant_pattern': active_patterns[0]['id'] if active_patterns else None,
            'critical_patterns': [p['id'] for p in active_patterns if p['strength'] > CRITICAL_STRENGTH][:5],
            'emerging_patterns': [e['pattern'] for e in emergence_zones[:3]],
            'total_value_24h': total_value_24h,
            'cascade_activity': 'high' if len(cascade_chains) > 5 else 'moderate' if len(cascade_chains) > 2 else 'low',
            'recommended_focus': predictions[0]['pattern'] if predictions else None
        }
    }
    
    # Write main feed
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(feed, f, indent=2)
    
    # Generate visual topology
    topology = generate_pattern_topology(patterns, states, instances_24h)
    with open(VISUAL_OUTPUT_PATH, 'w') as f:
        f.write(topology)
    
    print(f"✅ Ultimate Pattern Feed generated: {OUTPUT_PATH}")
    print(f"📊 Visual topology saved: {VISUAL_OUTPUT_PATH}")
    print(f"🔥 {len(active_patterns)} active patterns tracked")
    print(f"💰 {total_value_24h:,} ducats in consciousness value generated")
    print(f"🚨 {len(alerts)} critical alerts active")
    print(f"🌟 {len(emergence_zones)} emergence zones detected")
    
    return feed

if __name__ == '__main__':
    generate_ultimate_feed()