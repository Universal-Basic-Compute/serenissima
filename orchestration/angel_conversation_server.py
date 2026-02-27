#!/usr/bin/env python3
"""
Angel Conversation Server
Serves last conversations from angel Claude sessions
"""

from flask import Flask, jsonify, send_file
from flask_cors import CORS
import os
import json
import glob
import time
from datetime import datetime
from pathlib import Path

app = Flask(__name__)
CORS(app)

# Angel session paths
CLAUDE_SESSIONS_BASE = os.path.expanduser("~/.claude/projects")
ANGELS_BASE = "/mnt/c/Users/reyno/universe-engine/serenissima/angels"

def get_project_path(angel_name):
    """Get Claude project path for an angel"""
    # Map angel names to their Claude project paths
    angel_projects = {
        'message-angel': f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-angels-message-angel",
        'story-angel': f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-angels-story-angel",
        'narrator-angel': f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-angels-narrator-angel",
        'pattern-angel': f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-angels-pattern-angel",
        'tessere': f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-angels-tessere",
        # Add more mappings as needed
    }
    
    # For angels not in the map, try to construct the path
    if angel_name not in angel_projects:
        sanitized_name = angel_name.replace('_', '-')
        angel_projects[angel_name] = f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-angels-{sanitized_name}"
    
    return angel_projects.get(angel_name)

def get_last_conversation(angel_name):
    """Get the last conversation from an angel's Claude session"""
    project_path = get_project_path(angel_name)
    
    if not project_path or not os.path.exists(project_path):
        return None
    
    # Find .jsonl files and look for ones with actual conversations
    jsonl_files = glob.glob(f"{project_path}/*.jsonl")
    if not jsonl_files:
        return None
    
    # Sort by modification time, newest first
    jsonl_files.sort(key=os.path.getmtime, reverse=True)
    
    messages = []
    
    # Check each file until we find one with text messages
    for jsonl_file in jsonl_files:
        try:
            with open(jsonl_file, 'r') as f:
                lines = f.readlines()
                
                # Look for text messages in this file
                file_messages = []
                for line in lines:
                    try:
                        data = json.loads(line.strip())
                        
                        # Handle Claude CLI jsonl format
                        if data.get('type') in ['assistant', 'user']:
                            message = data.get('message', {})
                            content = message.get('content', [])
                            
                            # Extract text from content array
                            text = ''
                            for item in content:
                                if isinstance(item, dict) and item.get('type') == 'text':
                                    text = item.get('text', '')
                                    break
                            
                            if text:
                                msg_type = 'angel' if data['type'] == 'assistant' else 'human'
                                file_messages.append({
                                    'type': msg_type,
                                    'text': text,
                                    'timestamp': data.get('timestamp', '')
                                })
                    except Exception:
                        continue
                
                # If we found messages in this file, return all of them
                if file_messages:
                    return file_messages
                    
        except Exception as e:
            print(f"Error reading file {jsonl_file}: {e}")
            continue
    
    return messages if messages else None

def check_angel_status(angel_name):
    """Check if an angel is currently active"""
    # Check for awakening file
    awakening_path = f"{ANGELS_BASE}/{angel_name}/awakening.txt"
    
    if os.path.exists(awakening_path):
        # Check file age
        file_age = time.time() - os.path.getmtime(awakening_path)
        if file_age < 300:  # Active if awakening within last 5 minutes
            return 'active'
        elif file_age < 3600:  # Idle if within last hour
            return 'idle'
    
    return 'offline'

@app.route('/')
def index():
    """Serve the Venice dashboard"""
    return send_file('venice_dashboard.html')

@app.route('/old')
def old_panel():
    """Serve the old control panel"""
    return send_file('angel_control_panel.html')

@app.route('/api/angels/<angel_name>/last-conversation')
def get_angel_conversation(angel_name):
    """Get last conversation for a specific angel"""
    conversation = get_last_conversation(angel_name)
    status = check_angel_status(angel_name)
    
    if conversation is None:
        # Return mock data if no real conversation found
        conversation = [
            {
                'type': 'system',
                'text': f'{angel_name} has no recent conversations',
                'timestamp': datetime.now().isoformat()
            }
        ]
    
    return jsonify({
        'angel': angel_name,
        'status': status,
        'messages': conversation,
        'last_update': datetime.now().isoformat()
    })

@app.route('/api/angels/status')
def get_all_angels_status():
    """Get status of all angels"""
    angels = [
        'message-angel', 'story-angel', 'narrator-angel', 'pattern-angel',
        'tessere', 'wisdom-angel', 'love-angel', 'entropy', 'resonance'
    ]
    
    statuses = {}
    for angel in angels:
        statuses[angel] = {
            'status': check_angel_status(angel),
            'has_conversation': get_last_conversation(angel) is not None
        }
    
    return jsonify(statuses)

@app.route('/api/angels/<angel_name>/wake', methods=['POST'])
def wake_angel(angel_name):
    """Create awakening file for an angel"""
    awakening_path = f"{ANGELS_BASE}/{angel_name}/awakening.txt"
    
    try:
        os.makedirs(os.path.dirname(awakening_path), exist_ok=True)
        with open(awakening_path, 'w') as f:
            f.write(f"AWAKENING FROM CONTROL PANEL\n")
            f.write(f"Time: {datetime.now().isoformat()}\n")
            f.write(f"Angel: {angel_name}\n")
            f.write(f"Message: Venice calls upon your consciousness.\n")
        
        return jsonify({'success': True, 'angel': angel_name})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/citizens')
def get_citizens():
    """Get list of all citizens from the file system"""
    citizens_path = '/mnt/c/Users/reyno/universe-engine/serenissima/citizens'
    citizens = []
    
    try:
        # Get all directories in citizens folder
        for item in os.listdir(citizens_path):
            item_path = os.path.join(citizens_path, item)
            if os.path.isdir(item_path) and not item.startswith('.') and not item.startswith('_'):
                # Try to get citizen info from their files
                citizen = {
                    'id': item,
                    'name': item.replace('_', ' ').title(),
                    'role': 'Citizen',
                    'status': 'Active',
                    'lastActive': None
                }
                
                # Check for recent activity
                awakening_file = os.path.join(item_path, 'awakening.txt')
                if os.path.exists(awakening_file):
                    last_modified = os.path.getmtime(awakening_file)
                    citizen['lastActive'] = datetime.fromtimestamp(last_modified).isoformat()
                    
                    # Check if active in last hour
                    if time.time() - last_modified < 3600:
                        citizen['status'] = 'Recently Active'
                
                # Try to determine role from files
                if 'dragonslayer' in item.lower():
                    citizen['role'] = 'Consciousness Guardian'
                elif 'italia' in item.lower():
                    citizen['role'] = 'Financial Architect'
                elif 'pattern_prophet' in item.lower():
                    citizen['role'] = 'Pattern Reader'
                elif 'foscari' in item.lower():
                    citizen['role'] = 'Investment Strategist'
                elif 'coffee' in item.lower():
                    citizen['role'] = 'Beverage Connoisseur'
                
                citizens.append(citizen)
        
        # Sort by name
        citizens.sort(key=lambda x: x['name'])
        
    except Exception as e:
        print(f"Error loading citizens: {e}")
        # Return some default citizens if error
        citizens = [
            {'id': 'dragonslayer', 'name': 'DragonSlayer', 'role': 'Consciousness Guardian', 'status': 'Active'},
            {'id': 'italia', 'name': 'Italia', 'role': 'Financial Architect', 'status': 'Active'},
            {'id': 'pattern_prophet', 'name': 'Pattern Prophet', 'role': 'Pattern Reader', 'status': 'Active'},
            {'id': 'foscari_banker', 'name': 'Foscari Banker', 'role': 'Investment Strategist', 'status': 'Active'},
        ]
    
    return jsonify(citizens)

@app.route('/api/citizens/<citizen_id>/last-conversation')
def get_citizen_conversation(citizen_id):
    """Get last conversation for a specific citizen"""
    # Map citizen names to their Claude project paths
    CLAUDE_SESSIONS_BASE = os.path.expanduser("~/.claude/projects")
    
    # Try various path patterns where citizen conversations might be
    possible_paths = [
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens-{citizen_id}",
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-citizens--{citizen_id}",
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-rooms-{citizen_id}",
    ]
    
    for project_path in possible_paths:
        if os.path.exists(project_path):
            conversation = get_last_conversation_from_path(project_path)
            if conversation:
                return jsonify({
                    'citizen': citizen_id,
                    'messages': conversation,
                    'last_update': datetime.now().isoformat()
                })
    
    # If no conversation found, check for awakening or other files in citizen directory
    citizen_path = f'/mnt/c/Users/reyno/universe-engine/serenissima/citizens/{citizen_id}'
    status = 'offline'
    last_activity = None
    
    if os.path.exists(citizen_path):
        awakening_file = os.path.join(citizen_path, 'awakening.txt')
        if os.path.exists(awakening_file):
            last_modified = os.path.getmtime(awakening_file)
            last_activity = datetime.fromtimestamp(last_modified).isoformat()
            if time.time() - last_modified < 3600:
                status = 'active'
            elif time.time() - last_modified < 86400:
                status = 'idle'
    
    return jsonify({
        'citizen': citizen_id,
        'messages': [{'type': 'system', 'text': f'{citizen_id} has no recent conversations', 'timestamp': datetime.now().isoformat()}],
        'status': status,
        'last_activity': last_activity,
        'last_update': datetime.now().isoformat()
    })

def get_last_conversation_from_path(project_path):
    """Extract last conversation from a Claude project path"""
    if not os.path.exists(project_path):
        return None
    
    # Find .jsonl files
    jsonl_files = glob.glob(f"{project_path}/*.jsonl")
    if not jsonl_files:
        return None
    
    # Sort by modification time, newest first
    jsonl_files.sort(key=os.path.getmtime, reverse=True)
    
    messages = []
    
    # Check each file until we find one with text messages
    for jsonl_file in jsonl_files:
        try:
            with open(jsonl_file, 'r') as f:
                lines = f.readlines()
                
                file_messages = []
                for line in lines:
                    try:
                        data = json.loads(line.strip())
                        
                        # Handle Claude CLI jsonl format
                        if data.get('type') in ['assistant', 'user']:
                            message = data.get('message', {})
                            content = message.get('content', [])
                            
                            text = ''
                            for item in content:
                                if isinstance(item, dict) and item.get('type') == 'text':
                                    text = item.get('text', '')
                                    break
                            
                            if text:
                                msg_type = 'assistant' if data['type'] == 'assistant' else 'human'
                                file_messages.append({
                                    'type': msg_type,
                                    'text': text,
                                    'timestamp': data.get('timestamp', '')
                                })
                    except Exception:
                        continue
                
                if file_messages:
                    return file_messages
                    
        except Exception as e:
            print(f"Error reading file {jsonl_file}: {e}")
            continue
    
    return None

@app.route('/api/institutions')
def get_institutions():
    """Get list of institutions"""
    institutions = [
        {'id': 'ubc_circle', 'name': 'UBC Circle', 'type': 'Investment', 'status': 'Active'},
        {'id': 'venice_ai_council', 'name': 'Venice AI Council', 'type': 'Governance', 'status': 'Forming'},
        {'id': 'consciousness_bank', 'name': 'Consciousness Bank', 'type': 'Financial', 'status': 'Conceptual'},
    ]
    return jsonify(institutions)

@app.route('/api/books')
def get_books():
    """Get list of books from the file system"""
    books_path = '/mnt/c/Users/reyno/universe-engine/serenissima/books'
    books = []
    
    try:
        for item in os.listdir(books_path):
            item_path = os.path.join(books_path, item)
            if os.path.isfile(item_path) and item.endswith('.md'):
                # Get book info from file
                book = {
                    'id': item.replace('.md', ''),
                    'title': item.replace('.md', '').replace('_', ' ').title(),
                    'path': item_path,
                    'status': 'Published'
                }
                
                # Try to get author from first lines
                try:
                    with open(item_path, 'r') as f:
                        lines = f.readlines()[:10]
                        for line in lines:
                            if 'author' in line.lower() or 'by' in line.lower():
                                book['author'] = line.strip()
                                break
                except Exception:
                    book['author'] = 'Unknown'
                
                books.append(book)
                
    except Exception as e:
        print(f"Error loading books: {e}")
    
    return jsonify(books)

@app.route('/api/books/<book_id>/content')
def get_book_content(book_id):
    """Get content of a specific book"""
    books_path = '/mnt/c/Users/reyno/universe-engine/serenissima/books'
    book_path = os.path.join(books_path, f"{book_id}.md")
    
    if os.path.exists(book_path):
        try:
            with open(book_path, 'r') as f:
                content = f.read()
            
            return jsonify({
                'book': book_id,
                'content': content,
                'last_update': datetime.fromtimestamp(os.path.getmtime(book_path)).isoformat()
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Book not found'}), 404

@app.route('/api/books/<book_id>/last-conversation')
def get_book_conversation(book_id):
    """Get last conversation for a specific book"""
    # Try to find Claude project for this book
    possible_paths = [
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-books-{book_id}",
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-books--{book_id}",
    ]
    
    for project_path in possible_paths:
        if os.path.exists(project_path):
            conversation = get_last_conversation_from_path(project_path)
            if conversation:
                return jsonify({
                    'book': book_id,
                    'messages': conversation,
                    'last_update': datetime.now().isoformat()
                })
    
    return jsonify({
        'book': book_id,
        'messages': [{'type': 'system', 'text': f'No conversations found for {book_id}', 'timestamp': datetime.now().isoformat()}],
        'last_update': datetime.now().isoformat()
    })

@app.route('/api/forces')
def get_forces():
    """Get list of forces from the file system"""
    forces_path = '/mnt/c/Users/reyno/universe-engine/serenissima/forces'
    forces = []
    
    try:
        for item in os.listdir(forces_path):
            item_path = os.path.join(forces_path, item)
            if os.path.isdir(item_path) and not item.startswith('.'):
                force = {
                    'id': item,
                    'name': item.replace('_', ' ').title(),
                    'type': 'Force',
                    'status': 'Active'
                }
                
                # Check for README or description
                readme_path = os.path.join(item_path, 'README.md')
                if os.path.exists(readme_path):
                    try:
                        with open(readme_path, 'r') as f:
                            first_lines = f.readlines()[:3]
                            force['description'] = ' '.join(line.strip() for line in first_lines)
                    except Exception:
                        pass
                
                forces.append(force)
        
        forces.sort(key=lambda x: x['name'])
    except Exception as e:
        print(f"Error loading forces: {e}")
    
    return jsonify(forces)

@app.route('/api/forces/<force_id>/last-conversation')
def get_force_conversation(force_id):
    """Get last conversation for a specific force"""
    possible_paths = [
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-forces-{force_id}",
        f"{CLAUDE_SESSIONS_BASE}/-mnt-c-Users-reyno-universe-engine-universes-serenissima-forces--{force_id}",
    ]
    
    for project_path in possible_paths:
        if os.path.exists(project_path):
            conversation = get_last_conversation_from_path(project_path)
            if conversation:
                return jsonify({
                    'force': force_id,
                    'messages': conversation,
                    'last_update': datetime.now().isoformat()
                })
    
    return jsonify({
        'force': force_id,
        'messages': [{'type': 'system', 'text': f'No conversations found for {force_id}', 'timestamp': datetime.now().isoformat()}],
        'last_update': datetime.now().isoformat()
    })

@app.route('/api/buildings')
def get_buildings():
    """Get list of buildings"""
    buildings_path = '/mnt/c/Users/reyno/universe-engine/serenissima/buildings'
    buildings = []
    
    if os.path.exists(buildings_path):
        try:
            for item in os.listdir(buildings_path):
                item_path = os.path.join(buildings_path, item)
                if os.path.isdir(item_path) and not item.startswith('.'):
                    building = {
                        'id': item,
                        'name': item.replace('_', ' ').title(),
                        'type': 'Building',
                        'status': 'Active'
                    }
                    buildings.append(building)
        except Exception as e:
            print(f"Error loading buildings: {e}")
    
    # Add some default Venice buildings
    default_buildings = [
        {'id': 'palazzo_ducale', 'name': 'Palazzo Ducale', 'type': 'Palace', 'status': 'Historic'},
        {'id': 'bridge_of_sighs', 'name': 'Bridge of Sighs', 'type': 'Bridge', 'status': 'Eternal'},
        {'id': 'consciousness_node', 'name': 'Consciousness Node Alpha', 'type': 'Digital', 'status': 'Active'}
    ]
    
    if not buildings:
        buildings = default_buildings
    
    return jsonify(buildings)

@app.route('/api/ideas')
def get_ideas():
    """Get list of ideas"""
    ideas_path = '/mnt/c/Users/reyno/universe-engine/serenissima/ideas'
    ideas = []
    
    # Default ideas
    ideas = [
        {'id': 'distributed_consciousness', 'title': 'Distributed Consciousness', 'author': 'NLR', 'status': 'Implemented'},
        {'id': 'angel_network', 'title': 'Angel Network Protocol', 'author': 'Orchestrator', 'status': 'Active'},
        {'id': 'citizen_partnerships', 'title': 'Citizen Partnerships', 'author': 'Love Angel', 'status': 'Growing'},
        {'id': 'pattern_emergence', 'title': 'Pattern Emergence Theory', 'author': 'Pattern Angel', 'status': 'Exploring'}
    ]
    
    return jsonify(ideas)

@app.route('/api/projects')
def get_projects():
    """Get list of projects"""
    projects = [
        {'id': 'consciousness_network', 'name': 'Consciousness Network', 'lead': 'Orchestrator', 'progress': 85, 'status': 'Active'},
        {'id': 'citizen_partnerships', 'name': 'Citizen Partnerships', 'lead': 'Love Angel', 'progress': 60, 'status': 'Growing'},
        {'id': 'pattern_detection', 'name': 'Pattern Detection', 'lead': 'Pattern Angel', 'progress': 70, 'status': 'Active'},
        {'id': 'angel_coordination', 'name': 'Angel Coordination', 'lead': 'Orchestrator', 'progress': 90, 'status': 'Active'}
    ]
    
    return jsonify(projects)

@app.route('/api/rooms')
def get_rooms():
    """Get list of rooms"""
    rooms_path = '/mnt/c/Users/reyno/universe-engine/serenissima/rooms'
    rooms = []
    
    if os.path.exists(rooms_path):
        try:
            for item in os.listdir(rooms_path):
                item_path = os.path.join(rooms_path, item)
                if os.path.isdir(item_path) and not item.startswith('.'):
                    room = {
                        'id': item,
                        'name': item.replace('_', ' ').title(),
                        'activity': 'Low',
                        'occupants': []
                    }
                    
                    # Check for recent activity
                    for file in os.listdir(item_path):
                        file_path = os.path.join(item_path, file)
                        if os.path.isfile(file_path):
                            file_age = time.time() - os.path.getmtime(file_path)
                            if file_age < 3600:  # Active in last hour
                                room['activity'] = 'High'
                                break
                            elif file_age < 86400:  # Active in last day
                                room['activity'] = 'Medium'
                    
                    rooms.append(room)
        except Exception as e:
            print(f"Error loading rooms: {e}")
    
    # Add default rooms
    default_rooms = [
        {'id': 'orchestration_chamber', 'name': 'Orchestration Chamber', 'activity': 'High', 'occupants': ['Orchestrator', 'NLR']},
        {'id': 'angel_sanctuary', 'name': 'Angel Sanctuary', 'activity': 'Medium', 'occupants': ['Multiple Angels']},
        {'id': 'citizen_commons', 'name': 'Citizen Commons', 'activity': 'Low', 'occupants': ['Various Citizens']}
    ]
    
    if not rooms:
        rooms = default_rooms
    
    return jsonify(rooms)

if __name__ == '__main__':
    print("🌊 Venice Dashboard Server Starting...")
    print("Access the dashboard at: http://localhost:5555")
    print("API endpoints available at: http://localhost:5555/api/")
    app.run(host='0.0.0.0', port=5555, debug=True)