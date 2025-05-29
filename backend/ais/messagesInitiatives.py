import os
import sys
import json
import random
import time
import argparse # Ajout de argparse
import math # Ajout de math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

import requests
from dotenv import load_dotenv
from pyairtable import Api, Base, Table # Import Base

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
        api = Api(airtable_api_key)
        base = Base(api, airtable_base_id) # Create a Base object
        
        tables = {
            "citizens": base.table("CITIZENS"), # Corrected usage
            "messages": base.table("MESSAGES"), # Corrected usage
            "notifications": base.table("NOTIFICATIONS"), # Corrected usage
            "relationships": base.table("RELATIONSHIPS"), # Corrected usage
            "relevancies": base.table("RELEVANCIES"), # Corrected usage
            "problems": base.table("PROBLEMS") # Corrected usage
        }
        print("Connexion à Airtable initialisée avec des objets Base et Table explicites.")
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
            fields=["Citizen1", "Citizen2", "StrengthScore", "TrustScore", "Status"] # "Type" a été retiré
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
        print(f"Erreur lors de la récupération des données du citoyen {username}: {e}")
        return None

def _get_relationship_data(tables: Dict[str, Table], username1: str, username2: str) -> Optional[Dict]:
    try:
        safe_username1 = _escape_airtable_value(username1)
        safe_username2 = _escape_airtable_value(username2)
        c1, c2 = sorted((safe_username1, safe_username2))
        formula = f"AND({{Citizen1}} = '{c1}', {{Citizen2}} = '{c2}')"
        records = tables["relationships"].all(formula=formula, max_records=1)
        if records:
            return {'id': records[0]['id'], 'fields': records[0]['fields']}
        return None
    except Exception as e:
        print(f"Erreur lors de la récupération de la relation entre {username1} et {username2}: {e}")
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
            return data["notifications"]
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

def _check_existing_messages(tables: Dict[str, Table], username1: str, username2: str) -> bool:
    """Vérifie s'il existe des messages entre username1 et username2."""
    try:
        safe_username1 = _escape_airtable_value(username1)
        safe_username2 = _escape_airtable_value(username2)
        # Vérifier les messages dans les deux sens
        formula = (
            f"OR("
            f"  AND({{Sender}} = '{safe_username1}', {{Receiver}} = '{safe_username2}'),"
            f"  AND({{Sender}} = '{safe_username2}', {{Receiver}} = '{safe_username1}')"
            f")"
        )
        # Nous avons juste besoin de savoir s'il y en a au moins un
        messages = tables["messages"].all(formula=formula, max_records=1)
        if messages:
            print(f"    -> Messages existants trouvés entre {username1} et {username2}.")
            return True
        print(f"    -> Aucun message existant trouvé entre {username1} et {username2}.")
        return False
    except Exception as e:
        print(f"Erreur lors de la vérification des messages existants entre {username1} et {username2}: {e}")
        return False # Supposer qu'il y a des messages en cas d'erreur pour ne pas augmenter la probabilité inutilement

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
            f"You are {ai_display_name}, an AI citizen of Venice. You've decided to initiate/continue the conversation with {target_display_name}.\n"
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

        response = requests.post(url, headers=headers, json=payload, timeout=90) # Augmentation du timeout à 90s
        
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
def process_ai_message_initiatives(dry_run: bool = False, citizen1_arg: Optional[str] = None, citizen2_arg: Optional[str] = None):
    """Fonction principale pour traiter les initiatives de messages IA."""
    if citizen1_arg and citizen2_arg:
        print(f"Démarrage du processus d'initiative de message IA CIBLÉ de {citizen1_arg} à {citizen2_arg} (dry_run={dry_run})")
    else:
        print(f"Démarrage du processus d'initiatives de messages IA (dry_run={dry_run})")
    
    tables = initialize_airtable()
    if not tables:
        return

    initiatives_summary = {
        "processed_ai_count": 0,
        "total_messages_sent": 0,
        "details": {} 
    }

    if citizen1_arg and citizen2_arg:
        # Mode ciblé
        ai_username = citizen1_arg
        target_username = citizen2_arg
        print(f"Mode ciblé : {ai_username} va tenter d'envoyer un message à {target_username}.")

        # Vérifier si citizen1 est une IA (optionnel, mais bon à savoir)
        # citizen1_data = _get_citizen_data(tables, ai_username)
        # if not (citizen1_data and citizen1_data.get('fields', {}).get('IsAI')):
        #     print(f"Attention : {ai_username} n'est pas marqué comme IA, mais on continue quand même.")

        initiatives_summary["processed_ai_count"] = 1
        initiatives_summary["details"][ai_username] = {"messages_sent_count": 0, "targets": []}

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
            initiatives_summary["total_messages_sent"] += 1
            initiatives_summary["details"][ai_username]["messages_sent_count"] += 1
            initiatives_summary["details"][ai_username]["targets"].append(target_username)
    else:
        # Mode normal (probabiliste)
        ai_citizens = get_ai_citizens(tables)
        if not ai_citizens:
            print("Aucun citoyen IA trouvé, fin du processus.")
            return

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

            max_combined_score = top_relationships[0]["combined_score"]
            if max_combined_score <= 0:
                print(f"Le score combiné maximal pour {ai_username} est {max_combined_score}. Aucune initiative basée sur le score.")
                continue
                
            print(f"Score combiné maximal pour {ai_username} : {max_combined_score}")

            for relationship in top_relationships:
                target_username = relationship["other_citizen_username"]
                current_score = relationship["combined_score"]

                if current_score <= 0:
                    probability = 0.0
                elif max_combined_score <= 0: # Devrait être déjà géré par le continue plus haut, mais par sécurité
                    probability = 0.0
                else:
                    # Calcul logarithmique de la probabilité
                    # Ajout de 1 pour éviter log(0) et pour que log(1) soit 0 si score est 0
                    log_current_score = math.log(current_score + 1)
                    log_max_score = math.log(max_combined_score + 1)
                    
                    if log_max_score > 0: # Éviter la division par zéro si max_combined_score était 0 (donc log_max_score serait log(1)=0)
                        probability = (log_current_score / log_max_score) * 0.25
                    else: # Si max_combined_score est 0, log_max_score est 0.
                        probability = 0.0 # current_score doit aussi être 0 dans ce cas.
                
                target_citizen_data = _get_citizen_data(tables, target_username)
                target_is_ai = False
                if target_citizen_data and target_citizen_data.get('fields', {}).get('IsAI', False):
                    target_is_ai = True
                    probability /= 10
                    print(f"    -> Cible {target_username} est une IA. Probabilité de base ajustée à: {probability:.2%}")
                
                # Vérifier les messages existants
                if not _check_existing_messages(tables, ai_username, target_username):
                    probability *= 2
                    print(f"    -> Aucun message existant. Probabilité doublée à: {probability:.2%}")

                # Plafonner la probabilité (par exemple à 0.95)
                probability = min(probability, 0.95)
                print(f"  Relation avec {target_username} (Score: {current_score}). Probabilité d'initiative finale plafonnée: {probability:.2%}")

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
                        initiatives_summary["total_messages_sent"] += 1
                        initiatives_summary["details"][ai_username]["messages_sent_count"] += 1
                        initiatives_summary["details"][ai_username]["targets"].append(target_username)
                    
                    # time.sleep(0.2) # Délai déjà présent
                
                time.sleep(0.2) 
            time.sleep(0.5)

    print("\nRésumé final des initiatives :")
    print(json.dumps(initiatives_summary, indent=2))
    
    if not dry_run or initiatives_summary["total_messages_sent"] > 0 :
        create_admin_notification(tables, initiatives_summary)

    print("Processus d'initiatives de messages IA terminé.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gère les initiatives de messages des citoyens IA.")
    parser.add_argument("--dry-run", action="store_true", help="Exécute le script sans effectuer de modifications réelles.")
    parser.add_argument("--citizen1", type=str, help="Le Username du citoyen IA qui initie le message (mode ciblé).")
    parser.add_argument("--citizen2", type=str, help="Le Username du citoyen destinataire (mode ciblé).")
    args = parser.parse_args()

    if (args.citizen1 and not args.citizen2) or (not args.citizen1 and args.citizen2):
        parser.error("--citizen1 et --citizen2 doivent être utilisés ensemble.")

    process_ai_message_initiatives(dry_run=args.dry_run, citizen1_arg=args.citizen1, citizen2_arg=args.citizen2)
