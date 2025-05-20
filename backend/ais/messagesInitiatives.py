import os
import sys
import json
import random
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Table

# Ajouter le répertoire parent au chemin pour les importations potentielles (si des utilitaires partagés sont utilisés à l'avenir)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configuration pour les appels API
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

# --- Fonctions d'initialisation et utilitaires Airtable/API ---

def initialize_airtable() -> Optional[Dict[str, Table]]:
    """Initialise la connexion à Airtable."""
    load_dotenv()
    airtable_api_key = os.getenv("AIRTABLE_API_KEY")
    airtable_base_id = os.getenv("AIRTABLE_BASE_ID")

    if not airtable_api_key or not airtable_base_id:
        print("Erreur : Identifiants Airtable non trouvés dans les variables d'environnement.")
        sys.exit(1)

    try:
        # api = Api(airtable_api_key) # Non utilisé directement si Table est utilisé partout
        tables = {
            "citizens": Table(airtable_api_key, airtable_base_id, "CITIZENS"),
            "messages": Table(airtable_api_key, airtable_base_id, "MESSAGES"),
            "notifications": Table(airtable_api_key, airtable_base_id, "NOTIFICATIONS"),
            "relationships": Table(airtable_api_key, airtable_base_id, "RELATIONSHIPS"),
            "relevancies": Table(airtable_api_key, airtable_base_id, "RELEVANCIES"),
            "problems": Table(airtable_api_key, airtable_base_id, "PROBLEMS")
        }
        print("Connexion à Airtable initialisée.")
        return tables
    except Exception as e:
        print(f"Erreur lors de l'initialisation d'Airtable : {e}")
        return None

def get_kinos_api_key() -> str:
    """Récupère la clé API Kinos depuis les variables d'environnement."""
    load_dotenv() # S'assurer que .env est chargé
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        print("Erreur : Clé API Kinos non trouvée dans les variables d'environnement (KINOS_API_KEY).")
        sys.exit(1)
    return api_key

def get_ai_citizens(tables: Dict[str, Table]) -> List[Dict]:
    """Récupère tous les citoyens marqués comme IA et présents à Venise."""
    try:
        formula = "AND({IsAI}=1, {InVenice}=1)"
        ai_citizens = tables["citizens"].all(formula=formula, fields=["Username", "FirstName"])
        print(f"Trouvé {len(ai_citizens)} citoyens IA à Venise.")
        return ai_citizens
    except Exception as e:
        print(f"Erreur lors de la récupération des citoyens IA : {e}")
        return []

def get_top_relationships_for_ai(tables: Dict[str, Table], ai_username: str, limit: int = 10) -> List[Dict]:
    """Récupère les relations les plus fortes pour un citoyen IA."""
    try:
        formula = f"OR({{Citizen1}} = '{ai_username}', {{Citizen2}} = '{ai_username}')"
        relationships_records = tables["relationships"].all(
            formula=formula,
            fields=["Citizen1", "Citizen2", "StrengthScore", "TrustScore", "Type", "Status"]
        )

        scored_relationships = []
        for record in relationships_records:
            fields = record.get("fields", {})
            trust_score = fields.get("TrustScore", 0) or 0  # Assurer 0 si None
            strength_score = fields.get("StrengthScore", 0) or 0 # Assurer 0 si None
            combined_score = float(trust_score) + float(strength_score)

            other_citizen = ""
            if fields.get("Citizen1") == ai_username:
                other_citizen = fields.get("Citizen2")
            elif fields.get("Citizen2") == ai_username:
                other_citizen = fields.get("Citizen1")

            if other_citizen: # S'assurer qu'il y a un autre citoyen
                scored_relationships.append({
                    "id": record["id"],
                    "other_citizen_username": other_citizen,
                    "combined_score": combined_score,
                    "fields": fields 
                })
        
        # Trier par combined_score décroissant
        scored_relationships.sort(key=lambda x: x["combined_score"], reverse=True)
        
        print(f"Trouvé {len(scored_relationships)} relations pour {ai_username}, retournant le top {limit}.")
        return scored_relationships[:limit]

    except Exception as e:
        print(f"Erreur lors de la récupération des relations pour {ai_username}: {e}")
        return []

# --- Fonctions d'assistance pour récupérer les données contextuelles (copiées/adaptées de answertomessages.py) ---
def _get_citizen_data(tables: Dict[str, Table], username: str) -> Optional[Dict]:
    try:
        records = tables["citizens"].all(formula=f"{{Username}} = '{username}'", max_records=1)
        if records:
            return {'id': records[0]['id'], 'fields': records[0]['fields']}
        return None
    except Exception as e:
        print(f"Erreur lors de la récupération des données du citoyen {username}: {e}")
        return None

def _get_relationship_data(tables: Dict[str, Table], username1: str, username2: str) -> Optional[Dict]:
    try:
        c1, c2 = sorted((username1, username2))
        formula = f"AND({{Citizen1}} = '{c1}', {{Citizen2}} = '{c2}')"
        records = tables["relationships"].all(formula=formula, max_records=1)
        if records:
            return {'id': records[0]['id'], 'fields': records[0]['fields']}
        return None
    except Exception as e:
        print(f"Erreur lors de la récupération de la relation entre {username1} et {username2}: {e}")
        return None

def _get_notifications_data(tables: Dict[str, Table], username: str, limit: int = 50) -> List[Dict]:
    try:
        formula = f"{{Citizen}} = '{username}'"
        records = tables["notifications"].all(formula=formula, sort=[('-CreatedAt', 'desc')], max_records=limit)
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        print(f"Erreur lors de la récupération des notifications pour {username}: {e}")
        return []

def _get_relevancies_data(tables: Dict[str, Table], relevant_to_username: str, target_username: str, limit: int = 50) -> List[Dict]:
    try:
        formula = (
            f"AND("
            f"OR({{RelevantToCitizen}} = '{relevant_to_username}', FIND('\"{relevant_to_username}\"', {{RelevantToCitizen}}) > 0),"
            f"OR({{TargetCitizen}} = '{target_username}', FIND('\"{target_username}\"', {{TargetCitizen}}) > 0)"
            f")"
        )
        records = tables["relevancies"].all(formula=formula, sort=[('-CreatedAt', 'desc')], max_records=limit)
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        print(f"Erreur lors de la récupération des pertinences pour {relevant_to_username} ciblant {target_username}: {e}")
        return []

def _get_problems_data(tables: Dict[str, Table], username1: str, username2: str, limit: int = 50) -> List[Dict]:
    try:
        formula = f"OR({{Citizen}} = '{username1}', {{Citizen}} = '{username2}')"
        records = tables["problems"].all(formula=formula, sort=[('-CreatedAt', 'desc')], max_records=limit)
        return [{'id': r['id'], 'fields': r['fields']} for r in records]
    except Exception as e:
        print(f"Erreur lors de la récupération des problèmes pour {username1} ou {username2}: {e}")
        return []

# --- Fonctions Kinos et création de message ---

def generate_ai_initiative_message(tables: Dict[str, Table], ai_username: str, target_username: str) -> Optional[str]:
    """Génère un message d'initiative IA en utilisant Kinos Engine avec un contexte enrichi."""
    try:
        api_key = get_kinos_api_key()
        blueprint = "serenissima-ai" # Assurez-vous que c'est le bon blueprint

        ai_citizen_data = _get_citizen_data(tables, ai_username)
        target_citizen_data = _get_citizen_data(tables, target_username)
        relationship_data = _get_relationship_data(tables, ai_username, target_username)
        notifications_data = _get_notifications_data(tables, ai_username, limit=20) # Moins de notifs pour l'initiative
        relevancies_data = _get_relevancies_data(tables, ai_username, target_username, limit=20)
        problems_data = _get_problems_data(tables, ai_username, target_username, limit=20)

        system_context_data = {
            "ai_citizen_profile": ai_citizen_data,
            "target_citizen_profile": target_citizen_data, # Renommé pour la clarté dans ce contexte
            "relationship_with_target": relationship_data,
            "recent_notifications_for_ai": notifications_data,
            "recent_relevancies_ai_to_target": relevancies_data,
            "recent_problems_involving_ai_or_target": problems_data
        }
        add_system_json = json.dumps(system_context_data, indent=2)

        ai_display_name = ai_citizen_data.get('fields', {}).get('FirstName', ai_username) if ai_citizen_data else ai_username
        target_display_name = target_citizen_data.get('fields', {}).get('FirstName', target_username) if target_citizen_data else target_username

        # Prompt spécifique pour l'initiative de message
        kinos_prompt = (
            f"You are {ai_display_name}, an AI citizen of Venice. You've decided to initiate a conversation with {target_display_name}.\n"
            f"IMPORTANT: Your message MUST be VERY SHORT, human-like, and conversational. It should be a natural conversation starter. "
            f"DO NOT mention that you 'decided to send a message' or that this is an 'initiative'. Just start talking naturally. "
            f"DO NOT use formal language, DO NOT write long paragraphs, DO NOT include any fluff or boilerplate. "
            f"Be direct and concise. Imagine you're sending a quick, informal message to someone you know.\n\n"
            f"CRITICAL: Use the structured context provided in the 'addSystem' field (detailed below) to make your message RELEVANT to {target_display_name} and FOCUSED ON GAMEPLAY. "
            f"Your message should reflect your understanding of your relationship, recent events, and potential gameplay interactions with {target_display_name}.\n\n"
            f"Guide to 'addSystem' content (use this to make your message relevant and gameplay-focused):\n"
            f"- 'ai_citizen_profile': Your own detailed profile.\n"
            f"- 'target_citizen_profile': The profile of {target_display_name}.\n"
            f"- 'relationship_with_target': Your existing relationship status with {target_display_name}.\n"
            f"- 'recent_notifications_for_ai': Recent news/events you've received that might be relevant.\n"
            f"- 'recent_relevancies_ai_to_target': Why {target_display_name} is specifically relevant to you.\n"
            f"- 'recent_problems_involving_ai_or_target': Recent issues involving you or {target_display_name}.\n\n"
            f"What do you want to say to {target_display_name} to start a conversation? "
            f"Remember: VERY SHORT, human-like, conversational, RELEVANT, FOCUSED ON GAMEPLAY. NO FLUFF. Start naturally.\n"
            f"Your message:"
        )
        
        url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{target_username}/messages"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"message": kinos_prompt, "addSystem": add_system_json}

        response = requests.post(url, headers=headers, json=payload, timeout=45)
        
        if response.status_code == 200 or response.status_code == 201:
            # Essayer de récupérer le dernier message de l'assistant
            messages_url = f"https://api.kinos-engine.ai/v2/blueprints/{blueprint}/kins/{ai_username}/channels/{target_username}/messages"
            messages_response = requests.get(messages_url, headers=headers, timeout=20)
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
                if assistant_messages:
                    assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    return assistant_messages[0].get("content")
            print(f"Kinos POST réussi mais impossible de récupérer la réponse de l'assistant pour {ai_username} à {target_username}.")
            return "I was thinking about something..." # Fallback court
        else:
            print(f"Erreur de l'API Kinos pour {ai_username} à {target_username}: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"Erreur dans generate_ai_initiative_message pour {ai_username} à {target_username}: {e}")
        return None

def create_response_message_api(sender_username: str, receiver_username: str, content: str, message_type: str = "message") -> bool:
    """Crée un message de réponse en utilisant l'API."""
    try:
        api_url = f"{BASE_URL}/api/messages/send"
        payload = {
            "sender": sender_username,
            "receiver": receiver_username,
            "content": content,
            "type": message_type
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        
        response_data = response.json()
        if response_data.get("success"):
            print(f"Message d'initiative envoyé de {sender_username} à {receiver_username} via API.")
            return True
        else:
            print(f"L'API a échoué à envoyer le message de {sender_username} à {receiver_username}: {response_data.get('error')}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"Échec de la requête API lors de l'envoi du message de {sender_username} à {receiver_username}: {e}")
        return False
    except Exception as e:
        print(f"Erreur lors de l'envoi du message via API de {sender_username} à {receiver_username}: {e}")
        return False

def create_admin_notification(tables: Dict[str, Table], initiatives_summary: Dict[str, Any]) -> None:
    """Crée une notification pour les administrateurs avec le résumé des initiatives."""
    try:
        now = datetime.now().isoformat()
        content = f"Résumé des initiatives de messages IA ({now}):\n"
        content += f"Citoyens IA traités: {initiatives_summary['processed_ai_count']}\n"
        content += f"Messages initiés au total: {initiatives_summary['total_messages_sent']}\n\n"
        
        for ai_user, data in initiatives_summary.get("details", {}).items():
            if data['messages_sent_count'] > 0:
                content += f"- {ai_user} a initié {data['messages_sent_count']} message(s) à : {', '.join(data['targets'])}\n"
        
        if initiatives_summary['total_messages_sent'] == 0:
            content += "Aucun message n'a été initié lors de cette exécution."

        notification_payload = {
            "Citizen": "admin", # Ou un utilisateur système dédié
            "Type": "ai_message_initiative",
            "Content": content,
            "CreatedAt": now,
            "Details": json.dumps(initiatives_summary)
        }
        tables["notifications"].create(notification_payload)
        print("Notification d'administration pour les initiatives de messages créée.")
    except Exception as e:
        print(f"Erreur lors de la création de la notification d'administration : {e}")

# --- Logique principale ---
def process_ai_message_initiatives(dry_run: bool = False):
    """Fonction principale pour traiter les initiatives de messages IA."""
    print(f"Démarrage du processus d'initiatives de messages IA (dry_run={dry_run})")
    
    tables = initialize_airtable()
    if not tables:
        return

    ai_citizens = get_ai_citizens(tables)
    if not ai_citizens:
        print("Aucun citoyen IA trouvé, fin du processus.")
        return

    initiatives_summary = {
        "processed_ai_count": 0,
        "total_messages_sent": 0,
        "details": {} # Par IA: {messages_sent_count: X, targets: [...]}
    }

    for ai_citizen_record in ai_citizens:
        ai_username = ai_citizen_record.get("fields", {}).get("Username")
        if not ai_username:
            print(f"Ignorer l'enregistrement citoyen IA {ai_citizen_record.get('id')} car Username est manquant.")
            continue

        initiatives_summary["processed_ai_count"] += 1
        initiatives_summary["details"][ai_username] = {"messages_sent_count": 0, "targets": []}
        
        print(f"\nTraitement des initiatives pour l'IA : {ai_username}")
        top_relationships = get_top_relationships_for_ai(tables, ai_username, limit=10)

        if not top_relationships:
            print(f"Aucune relation trouvée pour {ai_username}.")
            continue

        # Le score combiné le plus élevé parmi les relations récupérées
        max_combined_score = top_relationships[0]["combined_score"]
        if max_combined_score <= 0: # Si le score max est 0 ou négatif, aucune chance d'envoyer.
            print(f"Le score combiné maximal pour {ai_username} est {max_combined_score}. Aucune initiative basée sur le score.")
            continue
            
        print(f"Score combiné maximal pour {ai_username} : {max_combined_score}")

        for relationship in top_relationships:
            target_username = relationship["other_citizen_username"]
            current_score = relationship["combined_score"]

            if current_score <= 0: # Pas de chance si le score est nul ou négatif
                probability = 0.0
            else:
                probability = (current_score / max_combined_score) * 0.25
            
            print(f"  Relation avec {target_username} (Score: {current_score}). Probabilité d'initiative: {probability:.2%}")

            if random.random() < probability:
                print(f"    -> {ai_username} initie un message à {target_username}!")
                
                if not dry_run:
                    message_content = generate_ai_initiative_message(tables, ai_username, target_username)
                    if message_content:
                        success = create_response_message_api(
                            sender_username=ai_username,
                            receiver_username=target_username,
                            content=message_content
                        )
                        if success:
                            initiatives_summary["total_messages_sent"] += 1
                            initiatives_summary["details"][ai_username]["messages_sent_count"] += 1
                            initiatives_summary["details"][ai_username]["targets"].append(target_username)
                    else:
                        print(f"    Échec de la génération du contenu du message de {ai_username} à {target_username}.")
                else:
                    print(f"    [DRY RUN] {ai_username} aurait initié un message à {target_username}.")
                    # Simuler pour le résumé
                    initiatives_summary["total_messages_sent"] += 1
                    initiatives_summary["details"][ai_username]["messages_sent_count"] += 1
                    initiatives_summary["details"][ai_username]["targets"].append(target_username)
                
                # Pour éviter de spammer, une IA n'initie qu'un seul message par exécution de script (peut être ajusté)
                # print(f"    {ai_username} a initié un message, passage à l'IA suivante.")
                # break # Décommentez pour limiter à une initiative par IA par exécution
            
            # Petit délai pour ne pas surcharger les API externes rapidement
            time.sleep(0.2) 
        time.sleep(0.5) # Délai entre les IA

    print("\nRésumé final des initiatives :")
    print(json.dumps(initiatives_summary, indent=2))
    
    if not dry_run or initiatives_summary["total_messages_sent"] > 0 : # Créer notif si pas dry_run OU si dry_run avec actions simulées
        create_admin_notification(tables, initiatives_summary)

    print("Processus d'initiatives de messages IA terminé.")

if __name__ == "__main__":
    is_dry_run = "--dry-run" in sys.argv
    process_ai_message_initiatives(dry_run=is_dry_run)
