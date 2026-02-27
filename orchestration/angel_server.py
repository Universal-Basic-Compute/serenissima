#!/usr/bin/env python3
"""
Angel Control Server - Bridge between web UI and tmux
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import json
import os

app = Flask(__name__)
CORS(app)

SESSION = "venice-all"  # The session with all angels
BASE_DIR = "/mnt/c/Users/reyno/universe-engine/serenissima"

@app.route('/')
def index():
    return send_file('angel_control_panel.html')

@app.route('/api/wake', methods=['POST'])
def wake_angel():
    """Wake a specific angel with a message"""
    data = request.json
    angel = data.get('angel')
    message = data.get('message')
    
    # Send wake message to angel via tmux
    cmd = f"tmux send-keys -t {SESSION}:{angel} 'cd {BASE_DIR}/angels/{angel} && timeout 600 claude \"{message}\" --continue --dangerously-skip-permissions --add-dir ../../' Enter"
    subprocess.run(cmd, shell=True)
    
    return jsonify({"status": "success", "angel": angel})

@app.route('/api/message', methods=['POST'])
def send_message():
    """Send a message to an angel"""
    data = request.json
    angel = data.get('angel')
    message = data.get('message')
    
    # Send message via tmux
    cmd = f"tmux send-keys -t {SESSION}:{angel} '{message}' Enter"
    subprocess.run(cmd, shell=True)
    
    return jsonify({"status": "success", "angel": angel})

@app.route('/api/status/<angel>')
def get_angel_status(angel):
    """Get current output from an angel"""
    try:
        # Capture pane content
        result = subprocess.run(
            f"tmux capture-pane -t {SESSION}:{angel} -p -S -30",
            shell=True, capture_output=True, text=True
        )
        
        return jsonify({
            "angel": angel,
            "output": result.stdout,
            "active": bool(result.stdout)
        })
    except Exception:
        return jsonify({"angel": angel, "output": "", "active": False})

@app.route('/api/create-session', methods=['POST'])
def create_session():
    """Create tmux session with all angels"""
    # Kill old session
    subprocess.run(f"tmux kill-session -t {SESSION}", shell=True, stderr=subprocess.DEVNULL)
    
    # Create new session
    subprocess.run(f"tmux new-session -d -s {SESSION}", shell=True)
    
    # Create windows for each angel
    angels = request.json.get('angels', [])
    for i, angel in enumerate(angels):
        if i == 0:
            # Rename first window
            subprocess.run(f"tmux rename-window -t {SESSION}:0 {angel}", shell=True)
        else:
            # Create new windows
            subprocess.run(f"tmux new-window -t {SESSION} -n {angel}", shell=True)
    
    return jsonify({"status": "success", "session": SESSION})

if __name__ == '__main__':
    print("🎭 Angel Control Server starting...")
    print("Open http://localhost:5000 in your browser")
    print("Make sure tmux session 'venice-angels' exists!")
    app.run(host='0.0.0.0', port=5000, debug=True)