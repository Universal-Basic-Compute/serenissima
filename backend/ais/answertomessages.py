import os
import sys
import json
import random
import argparse
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Literal
import requests
from dotenv import load_dotenv
from pyairtable import Api, Base, Table # Import Base

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import LogColors if available, or define a basic version
try:
    from backend.engine.utils.activity_helpers import LogColors
except ImportError:
    class LogColors:
        HEADER = '\033[95m'
        FAIL = '\033[91m'
        OKGREEN = '\033[92m'
        WARNING = '\033[93m'
        OKBLUE = '\033[94m'
        OKCYAN = '\033[96m'
        ENDC = '\033[0m'
# find_citizen_by_identifier was unused

# Configuration for API calls
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

def initialize_airtable():
    """Initialize connection to Airtable."""
    load_dotenv()
    
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")
    
    if not airtable_api_key or not airtable_base_id:
        print("Error: Airtable credentials not found in environment variables")
        sys.exit(1)
    
    api = Api(airtable_api_key)
    base = Base(api, airtable_base_id) # Create a Base object
    
    tables = {
        "citizens": Table(None, base, "CITIZENS"),
        "messages": Table(None, base, "MESSAGES"),
        "notifications": Table(None, base, "NOTIFICATIONS"),
        "relationships": Table(None, base, "RELATIONSHIPS"),
        "relevancies": Table(None, base, "RELEVANCIES"),
        "problems": Table(None, base, "PROBLEMS")
    }
    print("Connexion à Airtable initialisée avec des objets Base et Table explicites.")
    return tables

def get_ai_citizens(tables) -> List[Dict]:
    """Get all citizens that are marked as AI, are in Venice."""
    try:
        # Query citizens with IsAI=true, InVenice=true, and SocialClass is either Nobili or Cittadini
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula)
        print(f"Found {len(ai_citizens)} AI citizens in Venice")
        return ai_citizens
    except Exception as e:
        print(f"Error getting AI citizens: {str(e)}")
        return []

def get_unread_messages_for_ai(tables, ai_username: str) -> List[Dict]:
    """Get all unread messages for an AI citizen."""
    try:
        # Query messages where the receiver is the AI citizen and ReadAt is null
        formula = f"AND({{Receiver}}='{ai_username}', {{ReadAt}}=BLANK())"
        messages = tables["messages"].all(formula=formula)
        print(f"Found {len(messages)} unread messages for AI citizen {ai_username}")
        return messages
    except Exception as e:
        print(f"Error getting unread messages for AI citizen {ai_username}: {str(e)}")
        return []

def mark_messages_as_read_api(receiver_username: str, message_ids: List[str]) -> bool:
    """Mark messages as read using the API."""
    try:
        api_url = f"{BASE_URL}/api/messages/mark-read"
        payload = {
            "citizen": receiver_username,
            "messageIds": message_ids
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status() # Raise an exception for HTTP errors
        
        response_data = response.json()
        if response_data.get("success"):
            print(f"Successfully marked {len(message_ids)} messages as read for {receiver_username} via API")
            return True
        else:
            print(f"API failed to mark messages as read for {receiver_username}: {response_data.get('error')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"API request failed while marking messages as read for {receiver_username}: {e}")
        return False
    except Exception as e:
        print(f"Error marking messages as read via API for {receiver_username}: {e}")
        return False

# --- Fonctions d'assistance pour récupérer les données contextuelles ---

def _escape_airtable_value(value: Any) -> str:
    """Échappe les apostrophes et les guillemets pour les formules Airtable et s'assure que la valeur est une chaîne."""
    if not isinstance(value, str):
        value = str(value)  # Convertit en chaîne d'abord
    value = value.replace("'", "\\'") # Échappe les apostrophes
    value = value.replace('"', '\\"') # Échappe les guillemets doubles
    return value

def _get_citizen_data(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    try:
        safe_username = _escape_airtable_value(username)
        records = tables["citizens"].all(formula=f"{{Username}} = '{safe_username}'", max_records=1)
        if records:
            return {'id': records[0]['id'], 'fields': records[0]['fields']}
        
        # If not found by Username, try by CitizenId as fallback
        records = tables["citizens"].all(formula=f"{{CitizenId}} = '{safe_username}'", max_records=1)
        if records:
            print(f"Found citizen {username} by CitizenId instead of Username")
            return {'id': records[0]['id'], 'fields': records[0]['fields']}
            
        print(f"Citizen not found: {username}")
        return None
    except Exception as e:
        print(f"Error fetching citizen data for {username}: {e}")
        import traceback
        traceback.print_exc()
        return None

def _get_relationship_data(tables: Dict[str, Table], username1: str, username2: str) -> Optional[Dict]:
    try:
        safe_username1 = _escape_airtable_value(username1)
        safe_username2 = _escape_airtable_value(username2)
        # Assurer l'ordre alphabétique pour la requête
        c1, c2 = sorted((safe_username1, safe_username2))
        formula = f"AND({{Citizen1}} = '{c1}', {{Citizen2}} = '{c2}')"
        records = tables["relationships"].all(formula=formula, max_records=1)
        if records:
            return {'id': records[0]['id'], 'fields': records[0]['fields']}
        return None
    except Exception as e:
        print(f"Error fetching relationship data between {username1} and {username2}: {e}")
        return None

def _get_notifications_data(tables: Dict[str, Table], username: str, limit: int = 50) -> List[Dict]:
    """Récupère les notifications pour un citoyen via l'API."""
    try:
        # L'API /api/notifications attend un POST avec 'citizen' dans le corps JSON
        api_url = f"{BASE_URL}/api/notifications"
        payload = {"citizen": username} # 'since' est optionnel et a une valeur par défaut dans l'API
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        if data.get("success") and "notifications" in data:
            # L'API retourne déjà les champs nécessaires, pas besoin de 'fields' imbriqué
            # Ajuster si le format de l'API est différent (par exemple, si elle retourne des enregistrements Airtable bruts)
            print(f"Récupéré {len(data['notifications'])} notifications pour {username} via API.")
            # L'API /api/notifications limite déjà à 50 par défaut et trie par CreatedAt desc.
            # Si un 'limit' différent est nécessaire, l'API devrait le supporter.
            # Pour l'instant, on retourne ce que l'API donne, en respectant le 'limit' de la signature pour la cohérence.
            return data["notifications"][:limit]
        else:
            print(f"L'API a échoué à récupérer les notifications pour {username}: {data.get('error', 'Erreur inconnue')}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête API lors de la récupération des notifications pour {username}: {e}")
        return []
    except Exception as e:
        print(f"Erreur lors de la récupération des notifications pour {username} via API: {e}")
        return []

def _get_relevancies_data(tables: Dict[str, Table], relevant_to_username: str, target_username: str, limit: int = 50) -> List[Dict]:
    """Récupère les pertinences via l'API."""
    try:
        params = {
            "relevantToCitizen": relevant_to_username,
            "targetCitizen": target_username,
            "limit": str(limit) # L'API attend des chaînes pour les paramètres numériques
        }
        api_url = f"{BASE_URL}/api/relevancies"
        response = requests.get(api_url, params=params, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        if data.get("success") and "relevancies" in data:
             # L'API retourne déjà les champs nécessaires, pas besoin de 'fields' imbriqué
            print(f"Récupéré {len(data['relevancies'])} pertinences pour {relevant_to_username} -> {target_username} via API.")
            return data["relevancies"]
        else:
            print(f"L'API a échoué à récupérer les pertinences pour {relevant_to_username} -> {target_username}: {data.get('error', 'Erreur inconnue')}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête API lors de la récupération des pertinences pour {relevant_to_username} -> {target_username}: {e}")
        return []
    except Exception as e:
        print(f"Erreur lors de la récupération des pertinences pour {relevant_to_username} -> {target_username} via API: {e}")
        return []

def _get_problems_data(tables: Dict[str, Table], username1: str, username2: str, limit: int = 50) -> List[Dict]:
    """Récupère les problèmes pour un ou deux citoyens via l'API."""
    problems_list = []
    try:
        # Récupérer les problèmes pour username1
        params1 = {"citizen": username1, "status": "active", "limit": str(limit)}
        api_url = f"{BASE_URL}/api/problems"
        response1 = requests.get(api_url, params=params1, timeout=15)
        response1.raise_for_status()
        data1 = response1.json()
        if data1.get("success") and "problems" in data1:
            problems_list.extend(data1["problems"])
        else:
            print(f"L'API a échoué à récupérer les problèmes pour {username1}: {data1.get('error', 'Erreur inconnue')}")

        # Récupérer les problèmes pour username2, en évitant les doublons si username1 == username2
        if username1 != username2:
            params2 = {"citizen": username2, "status": "active", "limit": str(limit)}
            response2 = requests.get(api_url, params=params2, timeout=15)
            response2.raise_for_status()
            data2 = response2.json()
            if data2.get("success") and "problems" in data2:
                # Éviter d'ajouter des problèmes en double si un problème concerne les deux
                existing_problem_ids = {p.get('problemId') or p.get('id') for p in problems_list}
                for problem in data2["problems"]:
                    problem_id = problem.get('problemId') or problem.get('id')
                    if problem_id not in existing_problem_ids:
                        problems_list.append(problem)
            else:
                print(f"L'API a échoué à récupérer les problèmes pour {username2}: {data2.get('error', 'Erreur inconnue')}")
        
        # L'API /api/problems ne trie pas par CreatedAt par défaut, mais on peut le demander.
        # Ici, nous allons trier en Python pour correspondre au comportement précédent.
        problems_list.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        print(f"Récupéré {len(problems_list)} problèmes pour {username1} ou {username2} via API.")
        return problems_list[:limit]

    except requests.exceptions.RequestException as e:
        print(f"Erreur de requête API lors de la récupération des problèmes pour {username1} ou {username2}: {e}")
        return problems_list # Retourner ce qui a été collecté jusqu'à présent
    except Exception as e:
        print(f"Erreur lors de la récupération des problèmes pour {username1} ou {username2} via API: {e}")
        return []

def _get_data_package_for_citizen(username: str) -> Optional[Dict]:
    """Fetches the data package for a citizen using the Next.js API."""
    try:
        # Use BASE_URL as defined in this file
        api_url = f"{BASE_URL}/api/get-data-package?citizenUsername={username}"
        # Using print as per existing style in this script for ais module
        print(f"  Fetching data package for {username} from {api_url}...")
        response = requests.get(api_url, timeout=45) 
        response.raise_for_status()
        
        data = response.json()
        print(f"  Successfully fetched data package for {username}.")
        return data
    except requests.exceptions.RequestException as e:
        print(f"  {LogColors.FAIL}API Error fetching data package for {username}: {e}{LogColors.ENDC}")
        return None
    except json.JSONDecodeError:
        print(f"  {LogColors.FAIL}Failed to decode JSON response for data package of {username}. Response: {response.text[:200]}{LogColors.ENDC}")
        return None
    except Exception as e:
        print(f"  {LogColors.FAIL}Unexpected error fetching data package for {username}: {e}{LogColors.ENDC}")
        return None

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def generate_ai_response(tables: Dict[str, Table], ai_username: str, sender_username: str, message_content: str, kinos_model_override: Optional[str] = None, add_message: Optional[str] = None) -> Optional[str]:
    """Generate an AI response using the Kinos Engine API with enhanced context."""
    try:
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai"
        
        # 1. Fetch all contextual data
        ai_citizen_data = _get_citizen_data(tables, ai_username)
        sender_citizen_data = _get_citizen_data(tables, sender_username)
        relationship_data = _get_relationship_data(tables, ai_username, sender_username)
        notifications_data = _get_notifications_data(tables, ai_username, limit=50)
        relevancies_data = _get_relevancies_data(tables, ai_username, sender_username, limit=50)
        problems_data = _get_problems_data(tables, ai_username, sender_username, limit=50)
        ai_data_package = _get_data_package_for_citizen(ai_username) # Récupérer uniquement pour l'IA

        # 2. Construct the addSystem JSON object with limited data
        system_context_data = {
            "ai_citizen_profile": ai_citizen_data,
            "sender_citizen_profile": sender_citizen_data,
            "ai_citizen_data_package": ai_data_package, # Data package de l'IA (celui qui reçoit)
            "relationship_with_sender": relationship_data,
            "recent_notifications_for_ai": notifications_data[:50],
            "recent_relevancies_ai_to_sender": relevancies_data,
            "recent_problems_involving_ai_or_sender": problems_data
        }
        # Log pour confirmer l'envoi de la relation
        if relationship_data:
            print(f"Relation entre {ai_username} et {sender_username} envoyée dans le contexte système: {relationship_data.get('fields', {}).get('Title', 'Non définie')}, Force: {relationship_data.get('fields', {}).get('StrengthScore', '0')}, Confiance: {relationship_data.get('fields', {}).get('TrustScore', '0')}")
        else:
            print(f"Aucune relation existante entre {ai_username} et {sender_username} à envoyer dans le contexte système")
            
        add_system_json = json.dumps(system_context_data, indent=2)

        # 3. Construct the prompt for the Kinos API
        # Emphasize brevity, human-like tone, and no fluff multiple times.
        ai_display_name = ai_citizen_data.get('fields', {}).get('FirstName', ai_username) if ai_citizen_data else ai_username
        sender_display_name = sender_citizen_data.get('fields', {}).get('FirstName', sender_username) if sender_citizen_data else sender_username

        # Add suggestion to prompt if provided
        suggestion_text = ""
        if add_message:
            suggestion_text = f"\nSUGGESTION: Consider discussing or mentioning: {add_message}\n"
        
        kinos_prompt = (
            f"You are {ai_display_name}, an AI citizen of Venice. You are responding to a message from {sender_display_name}.\n"
            f"IMPORTANT: Your response must be human-like, and conversational. "
            f"Be direct & natural.\n\n"
            f"CRITICAL: Use the structured context provided in the 'addSystem' field (detailed below) to make your response RELEVANT to {sender_display_name} and FOCUSED ON GAMEPLAY. "
            f"Your message should reflect your understanding of your relationship, recent events, and potential gameplay interactions with {sender_display_name}.\n\n"
            f"Guide to 'addSystem' content (use this to make your message relevant and gameplay-focused):\n"
            f"- 'ai_citizen_profile': Your own detailed profile (status, wealth, etc.).\n"
            f"- 'sender_citizen_profile': The profile of {sender_display_name}.\n"
            f"- 'ai_citizen_data_package': A comprehensive data package about YOUR (the AI citizen's) current state, including inventory, buildings, contracts, etc. Use this to understand your own situation.\n"
            f"- 'relationship_with_sender': Your existing relationship status with {sender_display_name}.\n"
            f"- 'recent_notifications_for_ai': Recent news/events you've received that might be relevant to your conversation.\n"
            f"- 'recent_relevancies_ai_to_sender': Why {sender_display_name} (or things related to them) are specifically relevant to you. This is key for a relevant response!\n"
            f"- 'recent_problems_involving_ai_or_sender': Recent issues involving you or {sender_display_name} that could be part of your discussion.\n\n"
            f"--- USER'S MESSAGE TO YOU ---\n"
            f"{message_content}\n"
            f"--- END OF USER'S MESSAGE ---\n{suggestion_text}\n"
            f"Your response:"
        )
        
        # Construct the API URL
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{sender_username}/messages"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "message": kinos_prompt,
            "addSystem": add_system_json # Adding the structured context
        }

        if kinos_model_override:
            payload["model"] = kinos_model_override
            print(f"Using Kinos model override '{kinos_model_override}' for {ai_username} (answering message).")
        
        # Make the API request
        response = requests.post(url, headers=headers, json=payload, timeout=300) # Increased timeout to 5 minutes
        
        if response.status_code == 200 or response.status_code == 201:
            # Attempt to get the latest assistant message from the conversation history
            # TODO: Check if Kinos API POST response already contains the assistant's message,
            # to avoid the subsequent GET call for messages. This is still a valid TODO.
            messages_url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{sender_username}/messages"
            messages_response = requests.get(messages_url, headers=headers, timeout=60) # Increased timeout to 1 minute
            
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                assistant_messages = [
                    msg for msg in messages_data.get("messages", [])
                    if msg.get("role") == "assistant"
                ]
                if assistant_messages:
                    assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    content = assistant_messages[0].get("content", "")
                    
                    # Remove <think></think> tags completely
                    import re
                    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
                    content = content.strip()
                    
                    # Remove quotes at the beginning and end if present
                    if content.startswith('"') and content.endswith('"'):
                        content = content[1:-1].strip() # Strip again after quote removal
                    
                    # Maintenant, convertir les \\n littéraux en vrais sauts de ligne
                    content = content.replace('\\n', '\n')
                                        
                    return content
            
            # Fallback if history retrieval fails or no assistant message found
            print(f"Kinos POST successful but couldn't retrieve specific assistant reply from history for {ai_username} to {sender_username}. Check Kinos logs.")
            return "Thank you for your message. I will consider it." # Shorter fallback
        else:
            print(f"Error from Kinos API for {ai_username} to {sender_username}: {response.status_code} - {response.text}")
            try:
                error_details = response.json()
                print(f"Kinos error details: {error_details}")
            except json.JSONDecodeError:
                pass # No JSON in error response
            return None
    except Exception as e:
        print(f"Error in generate_ai_response for {ai_username} to {sender_username}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def create_response_message_api(sender_username: str, receiver_username: str, content: str, message_type: str = "message") -> bool:
    """Create a response message using the API."""
    try:
        # Remove <think></think> tags completely
        import re
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
        content = content.strip()
        
        # Remove quotes at the beginning and end if present
        if content.startswith('"') and content.endswith('"'):
            content = content[1:-1].strip()
        
        api_url = f"{BASE_URL}/api/messages/send"
        payload = {
            "sender": sender_username,
            "receiver": receiver_username,
            "content": content,
            "type": message_type
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=10)
        response.raise_for_status() # Raise an exception for HTTP errors
        
        response_data = response.json()
        if response_data.get("success"):
            print(f"Successfully sent message from {sender_username} to {receiver_username} via API")
            return True
        else:
            print(f"API failed to send message from {sender_username} to {receiver_username}: {response_data.get('error')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"API request failed while sending message from {sender_username} to {receiver_username}: {e}")
        return False
    except Exception as e:
        print(f"Error sending message via API from {sender_username} to {receiver_username}: {e}")
        return False

# --- API Call Helper ---
def call_try_create_activity_api(
    citizen_username: str,
    activity_type: str,
    activity_parameters: Dict[str, Any]
) -> bool:
    """Calls the /api/activities/try-create endpoint."""

    # Convert any datetime objects to ISO format strings for JSON serialization
    def convert_datetime_to_iso(obj):
        if isinstance(obj, dict):
            return {k: convert_datetime_to_iso(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_datetime_to_iso(item) for item in obj]
        elif isinstance(obj, datetime):
            return obj.isoformat()
        else:
            return obj
    
    # Create a deep copy of activity_parameters with datetime objects converted to strings
    serializable_params = convert_datetime_to_iso(activity_parameters)
    
    api_url = f"{BASE_URL}/api/activities/try-create" # BASE_URL is defined at the top
    payload = {
        "citizenUsername": citizen_username,
        "activityType": activity_type,
        "activityParameters": serializable_params
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        response_data = response.json()
        if response_data.get("success"):
            print(f"{LogColors.OKGREEN}Successfully initiated activity '{activity_type}' for {citizen_username} via API. Response: {response_data.get('message', 'OK')}{LogColors.ENDC}")
            activity_info = response_data.get("activity") or (response_data.get("activities")[0] if isinstance(response_data.get("activities"), list) and response_data.get("activities") else None)
            if activity_info and activity_info.get("id"):
                 print(f"  Activity ID: {activity_info['id']}")
            return True
        else:
            print(f"{LogColors.FAIL}API call to initiate activity '{activity_type}' for {citizen_username} failed: {response_data.get('error', 'Unknown error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"{LogColors.FAIL}API request failed for activity '{activity_type}' for {citizen_username}: {e}{LogColors.ENDC}")
        return False
    except json.JSONDecodeError:
        print(f"{LogColors.FAIL}Failed to decode JSON response for activity '{activity_type}' for {citizen_username}.{LogColors.ENDC}")
        return False

def create_admin_notification(tables, ai_response_counts: Dict[str, int], model_used: str = "local") -> None:
    """Create a notification for admins with the AI response summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = f"💬 **AI Message Response Summary** 💬\n\nModel utilisé: **{model_used}**\n\n"
        
        for ai_name, response_count in ai_response_counts.items():
            message += f"- 👤 **{ai_name}**: {response_count} responses\n"
        
        # Create the notification
        notification = {
            "Citizen": "admin",
            "Type": "ai_messaging",
            "Content": message,
            "CreatedAt": now,
            "ReadAt": now, # Set to current time
            "Status": "read", # Set status to read
            "Details": json.dumps({
                "ai_response_counts": ai_response_counts,
                "model_used": model_used,
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI response summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_messages(kinos_model_override_arg: Optional[str] = None, instant_mode: bool = False, add_message: Optional[str] = None):
    """Main function to process AI messages."""
    model_status = f"override: {kinos_model_override_arg}" if kinos_model_override_arg else "default"
    add_message_status = f"with suggestion: '{add_message}'" if add_message else "no suggestion"
    print(f"Starting AI message response process (kinos_model={model_status}, instant_mode={instant_mode}, {add_message_status})")
    
    # Initialize Airtable connection
    tables = initialize_airtable()
    
    # Get AI citizens
    all_ai_citizens = get_ai_citizens(tables)
    if not all_ai_citizens:
        print("No AI citizens found, exiting")
        return

    # Prepare a list of AI citizens with their unread messages
    ai_citizens_with_messages = []
    for ai_citizen_record in all_ai_citizens:
        ai_username = ai_citizen_record["fields"].get("Username")
        if not ai_username:
            print(f"Skipping AI citizen record {ai_citizen_record.get('id')} due to missing Username.")
            continue
        
        unread_messages = get_unread_messages_for_ai(tables, ai_username)
        if unread_messages:
            ai_citizens_with_messages.append({
                "username": ai_username,
                "messages": unread_messages
                # "record": ai_citizen_record # Store record if other fields are needed later
            })
            print(f"AI citizen {ai_username} has {len(unread_messages)} unread messages, queued for processing.")
        else:
            print(f"AI citizen {ai_username} has no unread messages, skipping.")

    if not ai_citizens_with_messages:
        print("No AI citizens with unread messages, exiting")
        return

    # Track response counts for each AI
    ai_response_counts = {}

    # Randomize the order of AI citizens to process
    import random
    random.shuffle(ai_citizens_with_messages)
    
    # Process each AI citizen who has messages (now in random order)
    for ai_data in ai_citizens_with_messages:
        ai_username = ai_data["username"]
        unread_messages = ai_data["messages"]
        
        print(f"Processing AI citizen: {ai_username}")
        ai_response_counts[ai_username] = 0
        
        # Group messages by sender
        messages_by_sender = {}
        for message_record in unread_messages:
            sender_username = message_record["fields"].get("Sender")
            if not sender_username:
                print(f"Skipping message {message_record['id']} for AI {ai_username} due to missing Sender.")
                continue
            
            if sender_username not in messages_by_sender:
                messages_by_sender[sender_username] = []
            messages_by_sender[sender_username].append(message_record)
        
        # Process one message per sender (the most recent one)
        for sender_username, sender_messages in messages_by_sender.items():
            # Sort messages by creation date (most recent first)
            sender_messages.sort(key=lambda m: m["fields"].get("CreatedAt", ""), reverse=True)
            
            # Get the most recent message
            message_record = sender_messages[0]
            message_id = message_record["id"]
            message_content = message_record["fields"].get("Content", "")
            
            print(f"\n{LogColors.HEADER}{'='*80}{LogColors.ENDC}")
            print(f"{LogColors.OKBLUE}MESSAGE ID: {message_id}{LogColors.ENDC}")
            print(f"{LogColors.OKBLUE}FROM: {sender_username} -> TO: {ai_username}{LogColors.ENDC}")
            print(f"{LogColors.OKBLUE}(Processing 1 of {len(sender_messages)} messages from this sender){LogColors.ENDC}")
            print(f"{LogColors.HEADER}{'-'*80}{LogColors.ENDC}")
            print(f"{LogColors.OKCYAN}MESSAGE CONTENT:{LogColors.ENDC}")
            print(f"{message_content}")
            print(f"{LogColors.HEADER}{'-'*80}{LogColors.ENDC}")
            
            # Mark ALL messages from this sender as read
            message_ids = [m["id"] for m in sender_messages]
            marked_read = mark_messages_as_read_api(receiver_username=ai_username, message_ids=message_ids)
            
            if marked_read:
                # Check if the sender is an AI
                sender_citizen_data = _get_citizen_data(tables, sender_username)
                sender_is_ai = False
                if sender_citizen_data and sender_citizen_data.get('fields', {}).get('IsAI', False):
                    sender_is_ai = True
                
                should_respond = True
                if sender_is_ai:
                    # If sender is AI, 25% chance of responding
                    if random.random() > 0.25:
                        should_respond = False
                        print(f"    Sender {sender_username} is an AI. {ai_username} chose not to respond to this message (75% chance).")
                    else:
                        print(f"    Sender {sender_username} is an AI. {ai_username} will respond (25% chance).")
                
                if should_respond:
                    # Generate AI response, passing tables object and optional message suggestion
                    response_content = generate_ai_response(tables, ai_username, sender_username, message_content, kinos_model_override_arg, add_message)
                        
                    if response_content:
                        if instant_mode:
                            # Create message directly in Airtable
                            in_reply_to = message_record.get("fields", {}).get("MessageId", message_id)
                            if create_direct_message(ai_username, sender_username, response_content, "reply", in_reply_to):
                                ai_response_counts[ai_username] += 1
                                print(f"{LogColors.OKGREEN}RESPONSE SENT: Direct message created from {ai_username} to {sender_username}.{LogColors.ENDC}")
                                print(f"{LogColors.OKGREEN}CONTENT:{LogColors.ENDC}")
                                print(f"{response_content}")
                                print(f"{LogColors.HEADER}{'='*80}{LogColors.ENDC}\n")
                            else:
                                print(f"{LogColors.FAIL}ERROR: Failed to create direct message from {ai_username} to {sender_username}.{LogColors.ENDC}")
                                print(f"{LogColors.HEADER}{'='*80}{LogColors.ENDC}\n")
                        else:
                            # Use the activity system
                            # Remove <think></think> tags completely
                            import re
                            cleaned_response = re.sub(r'<think>.*?</think>', '', response_content, flags=re.DOTALL)
                            cleaned_response = cleaned_response.strip()
                            
                            # Remove quotes at the beginning and end if present
                            if cleaned_response.startswith('"') and cleaned_response.endswith('"'):
                                cleaned_response = cleaned_response[1:-1].strip()
                            
                            activity_params = {
                                "receiverUsername": sender_username,
                                "content": cleaned_response,
                                "messageType": "reply", # Indicate it's a reply
                                "targetBuildingId": None, # Explicitly None, creator will use receiverUsername
                                "details": {
                                    "inReplyToMessageId": message_record.get("fields", {}).get("MessageId", message_id)
                                }
                            }
                            print(f"{LogColors.OKGREEN}RESPONSE CONTENT:{LogColors.ENDC}")
                            print(f"{cleaned_response}")
                            
                            if call_try_create_activity_api(ai_username, "send_message", activity_params):
                                ai_response_counts[ai_username] += 1
                                print(f"{LogColors.OKGREEN}RESPONSE SENT: Activity created for {ai_username} to reply to {sender_username}.{LogColors.ENDC}")
                                print(f"{LogColors.HEADER}{'='*80}{LogColors.ENDC}\n")
                            else:
                                print(f"{LogColors.FAIL}ERROR: Failed to initiate send_message activity for reply from {ai_username} to {sender_username}.{LogColors.ENDC}")
                                print(f"{LogColors.HEADER}{'='*80}{LogColors.ENDC}\n")
                    else:
                        print(f"{LogColors.WARNING}No response generated by Kinos for message from {sender_username} to {ai_username}.{LogColors.ENDC}")
                        print(f"{LogColors.HEADER}{'='*80}{LogColors.ENDC}\n")
                # else: # This 'else' corresponds to should_respond being False
                    # No action needed if should_respond is False, message already printed
            else:
                print(f"{LogColors.FAIL}ERROR: Failed to mark messages as read for {ai_username}, skipping response generation.{LogColors.ENDC}")
                print(f"{LogColors.HEADER}{'='*80}{LogColors.ENDC}\n")
    
    # Create admin notification with summary
    total_responses = sum(ai_response_counts.values())
    if total_responses > 0:
        create_admin_notification(tables, ai_response_counts, kinos_model_override_arg or "default")
    else:
        print("No responses were made by any AI.")
    
    print("AI message response process completed")

def create_direct_message(sender: str, receiver: str, content: str, message_type: str = "reply", in_reply_to_message_id: Optional[str] = None) -> bool:
    """Create a message directly in Airtable without going through the activity system."""
    try:
        tables = initialize_airtable()
        
        # Parse and remove <think></think> tags from content
        import re
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
        content = content.strip()
        
        # Create a message ID
        message_id = f"msg_{sender}_{receiver}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        
        # Create the message record
        message_fields = {
            "MessageId": message_id,
            "Sender": sender,
            "Receiver": receiver,
            "Content": content,
            "Type": message_type,
            "CreatedAt": datetime.now(timezone.utc).isoformat()
        }
        
        # Don't store the reply reference since neither InReplyTo nor Details 
        # are valid fields in the MESSAGES table
        # We'll just log it for reference
        if in_reply_to_message_id:
            print(f"Message is a reply to: {in_reply_to_message_id}")
        
        tables["messages"].create(message_fields)
        print(f"Created direct message from {sender} to {receiver} with ID: {message_id}")
        
        # Create a notification for the receiver
        notification_fields = {
            "Citizen": receiver,
            "Type": "message_received",
            "Content": f"You have received a {message_type} message from {sender}.",
            "Details": json.dumps({
                "messageId": message_id,
                "sender": sender,
                "messageType": message_type,
                "preview": content[:50] + ("..." if len(content) > 50 else "")
            }),
            "Asset": message_id,
            "AssetType": "message",
            "Status": "unread",
            "CreatedAt": datetime.now(timezone.utc).isoformat()
        }
        
        tables["notifications"].create(notification_fields)
        print(f"Created notification for {receiver} about message from {sender}")
        
        # Check if a relationship exists between sender and receiver
        relationship_formula = f"OR(AND({{Citizen1}}='{_escape_airtable_value(sender)}', {{Citizen2}}='{_escape_airtable_value(receiver)}'), AND({{Citizen1}}='{_escape_airtable_value(receiver)}', {{Citizen2}}='{_escape_airtable_value(sender)}'))"
        relationship_records = tables["relationships"].all(formula=relationship_formula, max_records=1)
        
        if relationship_records:
            # Update existing relationship
            relationship_record = relationship_records[0]
            relationship_id = relationship_record['id']
            
            # Update LastInteraction and potentially strengthen the relationship
            current_strength = float(relationship_record['fields'].get('StrengthScore', 0))
            new_strength = min(100, current_strength + 2)  # Increment by 2, max 100
            
            tables["relationships"].update(relationship_id, {
                'LastInteraction': datetime.now(timezone.utc).isoformat(),
                'StrengthScore': new_strength
            })
            
            print(f"Updated relationship between {sender} and {receiver}. New strength: {new_strength}")
        else:
            # Create new relationship
            # Ensure citizens are in alphabetical order for Citizen1 and Citizen2
            if sender < receiver:
                citizen1 = sender
                citizen2 = receiver
            else:
                citizen1 = receiver
                citizen2 = sender
            
            relationship_id = f"rel_{citizen1}_{citizen2}"
            
            relationship_fields = {
                "RelationshipId": relationship_id,
                "Citizen1": citizen1,
                "Citizen2": citizen2,
                "Title": "Acquaintance",  # Default relationship type
                "Description": f"Initial contact established when {sender} sent a message to {receiver}.",
                "LastInteraction": datetime.now(timezone.utc).isoformat(),
                "Tier": 1,  # Initial tier
                "Status": "active",
                "StrengthScore": 10,  # Initial strength
                "TrustScore": 5,  # Initial trust
                "CreatedAt": datetime.now(timezone.utc).isoformat()
            }
            
            tables["relationships"].create(relationship_fields)
            print(f"Created new relationship between {sender} and {receiver}")
        
        return True
    except Exception as e:
        print(f"Error creating direct message: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Entry point for the script with command-line argument handling."""
    parser = argparse.ArgumentParser(description="Process unread messages for AI citizens and generate responses.")
    parser.add_argument("--model", type=str, default='local', help="Override the default Kinos model with a specific model (default: 'local')")
    parser.add_argument("--instant", action="store_true", help="Create messages directly in Airtable without using activities")
    parser.add_argument("--addMessage", type=str, help="Add a suggestion or topic to the AI prompt")
    args = parser.parse_args()
    
    # Call the main processing function with command-line arguments
    process_ai_messages(
        kinos_model_override_arg=args.model, 
        instant_mode=args.instant,
        add_message=args.addMessage
    )

if __name__ == "__main__":
    main()
