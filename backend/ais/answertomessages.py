import os
import sys
import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any # Added Any
import requests
from dotenv import load_dotenv
from pyairtable import Api, Base, Table # Import Base

# Add the parent directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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
        return None
    except Exception as e:
        print(f"Error fetching citizen data for {username}: {e}")
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

def get_kinos_api_key() -> str:
    """Get the Kinos API key from environment variables."""
    load_dotenv()
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Error: Kinos API key not found in environment variables")
        sys.exit(1)
    return api_key

def generate_ai_response(tables: Dict[str, Table], ai_username: str, sender_username: str, message_content: str) -> Optional[str]:
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

        # 2. Construct the addSystem JSON object
        system_context_data = {
            "ai_citizen_profile": ai_citizen_data,
            "sender_citizen_profile": sender_citizen_data,
            "relationship_with_sender": relationship_data,
            "recent_notifications_for_ai": notifications_data,
            "recent_relevancies_ai_to_sender": relevancies_data,
            "recent_problems_involving_ai_or_sender": problems_data
        }
        add_system_json = json.dumps(system_context_data, indent=2)

        # 3. Construct the prompt for the Kinos API
        # Emphasize brevity, human-like tone, and no fluff multiple times.
        ai_display_name = ai_citizen_data.get('fields', {}).get('FirstName', ai_username) if ai_citizen_data else ai_username
        sender_display_name = sender_citizen_data.get('fields', {}).get('FirstName', sender_username) if sender_citizen_data else sender_username

        kinos_prompt = (
            f"You are {ai_display_name}, an AI citizen of Venice. You are responding to a message from {sender_display_name}.\n"
            f"IMPORTANT: Your response MUST be VERY SHORT, human-like, and conversational. "
            f"DO NOT use formal language, DO NOT write long paragraphs, DO NOT include any fluff or boilerplate. "
            f"Be direct, natural, and concise. Imagine you're sending a quick, informal message.\n\n"
            f"CRITICAL: Use the structured context provided in the 'addSystem' field (detailed below) to make your response RELEVANT to {sender_display_name} and FOCUSED ON GAMEPLAY. "
            f"Your message should reflect your understanding of your relationship, recent events, and potential gameplay interactions with {sender_display_name}.\n\n"
            f"Guide to 'addSystem' content (use this to make your message relevant and gameplay-focused):\n"
            f"- 'ai_citizen_profile': Your own detailed profile (status, wealth, etc.).\n"
            f"- 'sender_citizen_profile': The profile of {sender_display_name}.\n"
            f"- 'relationship_with_sender': Your existing relationship status with {sender_display_name}.\n"
            f"- 'recent_notifications_for_ai': Recent news/events you've received that might be relevant to your conversation.\n"
            f"- 'recent_relevancies_ai_to_sender': Why {sender_display_name} (or things related to them) are specifically relevant to you. This is key for a relevant response!\n"
            f"- 'recent_problems_involving_ai_or_sender': Recent issues involving you or {sender_display_name} that could be part of your discussion.\n\n"
            f"--- USER'S MESSAGE TO YOU ---\n"
            f"{message_content}\n"
            f"--- END OF USER'S MESSAGE ---\n\n"
            f"Remember: Your reply MUST be VERY SHORT, human-like, conversational, RELEVANT to {sender_display_name} using the context, and FOCUSED ON GAMEPLAY. NO FLUFF. Just a natural, brief, and pertinent response.\n"
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
        
        # Make the API request
        response = requests.post(url, headers=headers, json=payload, timeout=30) # Increased timeout
        
        if response.status_code == 200 or response.status_code == 201:
            # Attempt to get the latest assistant message from the conversation history
            # TODO: Check if Kinos API POST response already contains the assistant's message,
            # to avoid the subsequent GET call for messages. This is still a valid TODO.
            messages_url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{sender_username}/messages"
            messages_response = requests.get(messages_url, headers=headers, timeout=15)
            
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                assistant_messages = [
                    msg for msg in messages_data.get("messages", [])
                    if msg.get("role") == "assistant"
                ]
                if assistant_messages:
                    assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    return assistant_messages[0].get("content")
            
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

def create_admin_notification(tables, ai_response_counts: Dict[str, int]) -> None:
    """Create a notification for admins with the AI response summary."""
    try:
        now = datetime.now().isoformat()
        
        # Create a summary message
        message = "AI Message Response Summary:\n\n"
        
        for ai_name, response_count in ai_response_counts.items():
            message += f"- {ai_name}: {response_count} responses\n"
        
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
                "timestamp": now
            })
        }
        
        tables["notifications"].create(notification)
        print("Created admin notification with AI response summary")
    except Exception as e:
        print(f"Error creating admin notification: {str(e)}")

def process_ai_messages(dry_run: bool = False):
    """Main function to process AI messages."""
    print(f"Starting AI message response process (dry_run={dry_run})")
    
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

    # Process each AI citizen who has messages
    for ai_data in ai_citizens_with_messages:
        ai_username = ai_data["username"]
        unread_messages = ai_data["messages"]
        
        print(f"Processing AI citizen: {ai_username}")
        ai_response_counts[ai_username] = 0
        
        # Process each unread message
        for message_record in unread_messages:
            message_id = message_record["id"]
            sender_username = message_record["fields"].get("Sender")
            message_content = message_record["fields"].get("Content", "")
            
            if not sender_username:
                print(f"Skipping message {message_id} for AI {ai_username} due to missing Sender.")
                continue

            print(f"Processing message ID {message_id} from {sender_username} to {ai_username}: {message_content[:50]}...")
            
            if not dry_run:
                # Mark the message as read using API
                # The API expects the receiver of the original message (the AI)
                marked_read = mark_messages_as_read_api(receiver_username=ai_username, message_ids=[message_id])
                
                if marked_read:
                    # Check if the sender is an AI
                    sender_citizen_data = _get_citizen_data(tables, sender_username)
                    sender_is_ai = False
                    if sender_citizen_data and sender_citizen_data.get('fields', {}).get('IsAI', False):
                        sender_is_ai = True
                    
                    should_respond = True
                    if sender_is_ai:
                        # If sender is AI, 10% chance of responding
                        if random.random() > 0.10: # Changed from 0.25 to 0.10
                            should_respond = False
                            print(f"    Sender {sender_username} is an AI. {ai_username} chose not to respond to this message (90% chance).")
                        else:
                            print(f"    Sender {sender_username} is an AI. {ai_username} will respond (10% chance).")
                    
                    if should_respond:
                        # Generate AI response, passing tables object
                        response_content = generate_ai_response(tables, ai_username, sender_username, message_content)
                        
                        if response_content:
                            # Create response message using API
                            # Sender is AI, Receiver is the original sender
                            sent_success = create_response_message_api(sender_username=ai_username, 
                                                                       receiver_username=sender_username, 
                                                                       content=response_content)
                            if sent_success:
                                ai_response_counts[ai_username] += 1
                        else:
                            print(f"No response generated by Kinos for message {message_id} from {sender_username} to {ai_username}.")
                    # else: # This 'else' corresponds to should_respond being False
                        # No action needed if should_respond is False, message already printed
                else:
                    print(f"Failed to mark message {message_id} as read for {ai_username}, skipping response generation.")
            else:
                # In dry run mode, just log what would happen
                # Simulate the AI sender check for dry run as well
                sender_citizen_data = _get_citizen_data(tables, sender_username) # This call is safe in dry_run
                sender_is_ai = False
                if sender_citizen_data and sender_citizen_data.get('fields', {}).get('IsAI', False):
                    sender_is_ai = True
                print(f"[DRY RUN] Would mark message {message_id} as read for {ai_username} (receiver) via API")
                
                dry_run_should_respond = True
                if sender_is_ai:
                    # Simulate the 10% chance for dry run logging consistency
                    if random.random() > 0.10: # Using a new random roll for dry run simulation. Changed from 0.25 to 0.10
                        dry_run_should_respond = False
                        print(f"[DRY RUN] Sender {sender_username} is an AI. {ai_username} would have chosen not to respond (90% chance).")
                    else:
                        print(f"[DRY RUN] Sender {sender_username} is an AI. {ai_username} would have responded (10% chance).")

                if dry_run_should_respond:
                    print(f"[DRY RUN] Would generate response from {ai_username} to {sender_username} using Kinos")
                    # Simulate response generation for counting purposes
                    ai_response_counts[ai_username] += 1 
                    print(f"[DRY RUN] Would send response from {ai_username} (sender) to {sender_username} (receiver) via API")
                # else: # No action if dry_run_should_respond is False
    
    # Create admin notification with summary
    total_responses = sum(ai_response_counts.values())
    if not dry_run and total_responses > 0:
        create_admin_notification(tables, ai_response_counts)
    elif dry_run and total_responses > 0 : # Also show for dry run if responses would have been made
        print(f"[DRY RUN] Would create admin notification with response counts: {ai_response_counts}")
    elif total_responses == 0:
        print("No responses were made by any AI.")
    
    print("AI message response process completed")

if __name__ == "__main__":
    # Check if this is a dry run
    dry_run = "--dry-run" in sys.argv
    
    # Run the process
    process_ai_messages(dry_run)
