#!/usr/bin/env python3
"""
Extract session tokens from Claude magic links
Magic link format: https://claude.ai/magic-link#token:base64email
"""

import re
import base64
import json
import os

def extract_from_magic_link(magic_link):
    """Extract token and email from magic link"""
    # Pattern: https://claude.ai/magic-link#token:base64email
    match = re.search(r'magic-link#([^:]+):([^&]+)', magic_link)
    
    if match:
        token = match.group(1)
        email_b64 = match.group(2)
        
        try:
            email = base64.b64decode(email_b64).decode('utf-8')
            return token, email
        except Exception:
            return token, "unknown"
    
    return None, None

def setup_account_from_magic_link(account_num, magic_link):
    """Setup account using magic link token"""
    token, email = extract_from_magic_link(magic_link)
    
    if not token:
        print(f"❌ Invalid magic link for account {account_num}")
        return False
    
    account_dir = f"/home/lester/.claude_account{account_num}/.claude"
    os.makedirs(account_dir, exist_ok=True)
    
    # Store token as sessionToken
    credentials = {
        "sessionToken": token,
        "magicLinkToken": token,
        "email": email,
        "userId": f"venice_account_{account_num}",
        "authenticated": True
    }
    
    cred_file = f"{account_dir}/.credentials.json"
    with open(cred_file, "w") as f:
        json.dump(credentials, f, indent=2)
    
    os.chmod(cred_file, 0o600)
    
    print(f"✓ Account {account_num} configured ({email})")
    return True

if __name__ == "__main__":
    print("🔮 Venice Magic Link Authentication")
    print("===================================")
    print("")
    print("Paste magic links for each account:")
    print("")
    
    for i in range(1, 5):
        magic_link = input(f"Magic link for account {i}: ").strip()
        if magic_link:
            setup_account_from_magic_link(i, magic_link)
        else:
            print(f"⏭️  Skipped account {i}")
    
    print("\n✅ Setup complete!")
    print("\nTesting authentication...")