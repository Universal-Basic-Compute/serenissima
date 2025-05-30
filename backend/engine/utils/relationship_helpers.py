import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
import pytz # Pour la gestion des fuseaux horaires
import os
import json
import requests
from dotenv import load_dotenv

# Importer les helpers nécessaires depuis activity_helpers
from .activity_helpers import _escape_airtable_value, VENICE_TIMEZONE, LogColors

log = logging.getLogger(__name__)

# Configuration pour les appels API Kinos et Next.js
load_dotenv() # S'assurer que .env est chargé pour KINOS_API_KEY et BASE_URL
KINOS_API_URL_BASE = "https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins"
NEXT_JS_BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

# Constantes pour les montants de changement de TrustScore
TRUST_SCORE_SUCCESS_SIMPLE = 1.0
TRUST_SCORE_FAILURE_SIMPLE = -1.0
TRUST_SCORE_SUCCESS_MEDIUM = 2.0
TRUST_SCORE_FAILURE_MEDIUM = -2.0
TRUST_SCORE_SUCCESS_HIGH = 5.0
TRUST_SCORE_FAILURE_HIGH = -5.0
TRUST_SCORE_PROGRESS = 0.5
TRUST_SCORE_MINOR_POSITIVE = 0.2
TRUST_SCORE_MINOR_NEGATIVE = -0.5

def update_trust_score_for_activity(
    tables: Dict[str, Any],
    citizen1_username: str,
    citizen2_username: str,
    trust_change_amount: float,
    activity_type_for_notes: str,
    success: bool,
    notes_detail: Optional[str] = None
) -> None:
    """
    Met à jour le TrustScore entre deux citoyens suite à une activité.
    Crée la relation si elle n'existe pas.
    Ajoute une note sur l'interaction.

    Args:
        tables: Dictionnaire des tables Airtable.
        citizen1_username: Username du premier citoyen.
        citizen2_username: Username du second citoyen.
        trust_change_amount: Montant à ajouter/soustraire au TrustScore.
        activity_type_for_notes: Type d'activité pour la note (ex: 'delivery', 'payment').
        success: Booléen indiquant si l'interaction est un succès.
        notes_detail: Détail optionnel à ajouter à la note.
    """
    if not citizen1_username or not citizen2_username or citizen1_username == citizen2_username:
        log.warning(f"{LogColors.WARNING}Tentative de mise à jour du TrustScore avec des usernames invalides ou identiques: {citizen1_username}, {citizen2_username}{LogColors.ENDC}")
        return

    # Assurer l'ordre alphabétique pour Citizen1 et Citizen2
    user1, user2 = sorted([citizen1_username, citizen2_username])

    log.info(f"{LogColors.OKBLUE}Mise à jour TrustScore entre {user1} et {user2} de {trust_change_amount:.2f} pour activité '{activity_type_for_notes}'.{LogColors.ENDC}")

    try:
        # Chercher une relation existante
        formula = f"AND({{Citizen1}}='{_escape_airtable_value(user1)}', {{Citizen2}}='{_escape_airtable_value(user2)}')"
        existing_relationships = tables['relationships'].all(formula=formula, max_records=1)

        interaction_note_key = f"activity_{activity_type_for_notes}_{'success' if success else 'failure'}"
        if notes_detail:
            interaction_note_key += f"_{notes_detail.replace(' ', '_').lower()}"

        if existing_relationships:
            relationship_record = existing_relationships[0]
            current_trust_score = float(relationship_record['fields'].get('TrustScore', 0.0))
            new_trust_score = current_trust_score + trust_change_amount

            current_notes = relationship_record['fields'].get('Notes', "")
            # Ajout simple, le script quotidien de consolidation des relations pourra nettoyer/agréger
            new_notes_entry = interaction_note_key
            updated_notes = f"{current_notes}, {new_notes_entry}" if current_notes else new_notes_entry
            
            # Éviter les notes trop longues ou trop répétitives rapidement
            if len(updated_notes) > 1000: # Limite arbitraire
                notes_parts = updated_notes.split(',')
                if len(notes_parts) > 20: # Limite arbitraire du nombre de notes
                    updated_notes = ",".join(notes_parts[-20:]) # Garder les 20 dernières

            payload = {
                'TrustScore': new_trust_score,
                'LastInteraction': datetime.now(VENICE_TIMEZONE).isoformat(),
                'Notes': updated_notes
            }
            tables['relationships'].update(relationship_record['id'], payload)
            log.info(f"{LogColors.OKGREEN}TrustScore mis à jour pour {user1}-{user2}: {current_trust_score:.2f} -> {new_trust_score:.2f}. Notes: {interaction_note_key}{LogColors.ENDC}")
        else:
            # Créer une nouvelle relation
            new_trust_score = trust_change_amount # Le score initial est le changement
            payload = {
                'Citizen1': user1,
                'Citizen2': user2,
                'TrustScore': new_trust_score,
                'StrengthScore': 0.0, # Initialiser StrengthScore à 0
                'LastInteraction': datetime.now(VENICE_TIMEZONE).isoformat(),
                'Notes': interaction_note_key,
                'Status': 'Active' # Statut initial
            }
            tables['relationships'].create(payload)
            log.info(f"{LogColors.OKGREEN}Nouvelle relation créée pour {user1}-{user2} avec TrustScore: {new_trust_score:.2f}. Notes: {interaction_note_key}{LogColors.ENDC}")

    except Exception as e:
        log.error(f"{LogColors.FAIL}Erreur lors de la mise à jour du TrustScore pour {user1}-{user2}: {e}{LogColors.ENDC}")
        import traceback
        log.error(traceback.format_exc())
    
    # Déclencher la réaction Kinos si les deux sont des IA
    # citizen1_username est l'acteur, citizen2_username est celui qui subit l'action
    # Donc, citizen2_username (receiver_of_action) réagit en premier.
    _initiate_reaction_dialogue_if_both_ai(
        tables,
        actor_username=citizen1_username, # Celui qui a fait l'action
        receiver_of_action_username=citizen2_username, # Celui qui a "subi" l'action
        activity_type=activity_type_for_notes,
        activity_success=success,
        activity_detail=notes_detail
    )

# --- Fonctions d'assistance pour l'interaction Kinos ---

def _get_kinos_api_key() -> Optional[str]:
    """Récupère la clé API Kinos depuis les variables d'environnement."""
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        log.error(f"{LogColors.FAIL}Clé API Kinos (KINOS_API_KEY) non trouvée.{LogColors.ENDC}")
    return api_key

def _get_citizen_details(tables: Dict[str, Any], username: str) -> Optional[Dict[str, Any]]:
    """Récupère les détails d'un citoyen, notamment IsAI et FirstName."""
    try:
        safe_username = _escape_airtable_value(username)
        # Assurez-vous que les champs IsAI et FirstName sont demandés si ce n'est pas déjà le cas par défaut
        records = tables["citizens"].all(formula=f"{{Username}} = '{safe_username}'", fields=["Username", "IsAI", "FirstName"], max_records=1)
        if records:
            return records[0]['fields']
        log.warning(f"{LogColors.WARNING}Citoyen {username} non trouvé pour les détails.{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Erreur lors de la récupération des détails du citoyen {username}: {e}{LogColors.ENDC}")
        return None

def _generate_kinos_message_content(kin_username: str, channel_username: str, prompt: str, kinos_api_key: str, kinos_model_override: Optional[str] = None) -> Optional[str]:
    """Appelle Kinos pour générer le contenu d'un message."""
    try:
        url = f"{KINOS_API_URL_BASE}/{kin_username}/channels/{channel_username}/messages"
        headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
        payload = {"message": prompt} # addSystem peut être ajouté ici si plus de contexte est nécessaire

        if kinos_model_override:
            payload["model"] = kinos_model_override
            log.info(f"Utilisation du modèle Kinos '{kinos_model_override}' pour {kin_username} -> {channel_username}.")

        log.debug(f"Appel Kinos : URL={url}, Kin={kin_username}, Channel={channel_username}, PayloadKeys={list(payload.keys())}")
        response = requests.post(url, headers=headers, json=payload, timeout=45)

        if response.status_code not in [200, 201]:
            log.error(f"{LogColors.FAIL}Erreur API Kinos (POST {url}): {response.status_code} - {response.text[:200]}{LogColors.ENDC}")
            return None

        # Récupérer la réponse de l'assistant depuis l'historique du canal
        history_response = requests.get(url, headers=headers, timeout=20)
        if history_response.status_code != 200:
            log.error(f"{LogColors.FAIL}Erreur API Kinos (GET {url}): {history_response.status_code} - {history_response.text[:200]}{LogColors.ENDC}")
            return None
        
        messages_data = history_response.json()
        assistant_messages = [msg for msg in messages_data.get("messages", []) if msg.get("role") == "assistant"]
        if not assistant_messages:
            log.warning(f"{LogColors.WARNING}Aucun message d'assistant trouvé dans l'historique Kinos pour {kin_username} -> {channel_username}.{LogColors.ENDC}")
            return None
        
        assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return assistant_messages[0].get("content")

    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Erreur de requête API Kinos pour {kin_username} -> {channel_username}: {e}{LogColors.ENDC}")
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}Erreur dans _generate_kinos_message_content pour {kin_username} -> {channel_username}: {e}{LogColors.ENDC}")
        return None

def _store_message_via_api(sender_username: str, receiver_username: str, content: str) -> bool:
    """Stocke un message en utilisant l'API Next.js /api/messages/send."""
    try:
        api_url = f"{NEXT_JS_BASE_URL}/api/messages/send"
        payload = {
            "sender": sender_username,
            "receiver": receiver_username,
            "content": content,
            "type": "reaction_auto" # Type de message spécifique
        }
        headers = {"Content-Type": "application/json"}
        response = requests.post(api_url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        
        response_data = response.json()
        if response_data.get("success"):
            log.info(f"{LogColors.OKGREEN}Message de {sender_username} à {receiver_username} stocké via API.{LogColors.ENDC}")
            return True
        else:
            log.error(f"{LogColors.FAIL}L'API a échoué à stocker le message de {sender_username} à {receiver_username}: {response_data.get('error')}{LogColors.ENDC}")
            return False
    except requests.exceptions.RequestException as e:
        log.error(f"{LogColors.FAIL}Échec de la requête API lors du stockage du message de {sender_username} à {receiver_username}: {e}{LogColors.ENDC}")
        return False
    except Exception as e:
        log.error(f"{LogColors.FAIL}Erreur lors du stockage du message via API de {sender_username} à {receiver_username}: {e}{LogColors.ENDC}")
        return False

def _construct_activity_description(actor_name: str, receiver_name: str, activity_type: str, success: bool, detail: Optional[str]) -> Tuple[str, str]:
    """Construit des descriptions d'activité pour les prompts Kinos."""
    action_verb = ""
    outcome = "successfully" if success else "unsuccessfully"
    preposition = "with" if success else "with" # Peut être ajusté

    if activity_type == "delivery":
        action_verb = f"{outcome} delivered {detail if detail else 'items'}"
        desc_for_receiver_prompt = f"{actor_name} just {action_verb} to you."
        desc_for_actor_reply_context = f"your {action_verb} to {receiver_name}."
    elif activity_type == "payment":
        action_verb = f"{outcome} attempted to pay {detail if detail else 'an amount'}"
        desc_for_receiver_prompt = f"{actor_name} just {action_verb} to you."
        desc_for_actor_reply_context = f"your {action_verb} to {receiver_name}."
    elif activity_type == "construction_milestone":
        action_verb = f"reached a milestone ({detail if detail else 'progress'}) on a construction project"
        desc_for_receiver_prompt = f"{actor_name} just {action_verb} that affects you." # C2 est le client
        desc_for_actor_reply_context = f"your {action_verb} on the project for {receiver_name}." # C1 est l'ouvrier
    else: # Cas générique
        action_verb = f"{outcome} completed an action '{activity_type}'"
        if detail:
            action_verb += f" regarding '{detail}'"
        desc_for_receiver_prompt = f"{actor_name} just {action_verb} that involved you."
        desc_for_actor_reply_context = f"your {action_verb} involving {receiver_name}."
        
    return desc_for_receiver_prompt, desc_for_actor_reply_context

def _initiate_reaction_dialogue_if_both_ai(
    tables: Dict[str, Any],
    actor_username: str,
    receiver_of_action_username: str,
    activity_type: str,
    activity_success: bool,
    activity_detail: Optional[str]
):
    """Déclenche un dialogue de réaction Kinos si les deux citoyens sont des IA."""
    kinos_api_key = _get_kinos_api_key()
    if not kinos_api_key:
        return

    actor_details = _get_citizen_details(tables, actor_username)
    receiver_details = _get_citizen_details(tables, receiver_of_action_username)

    if not (actor_details and actor_details.get("IsAI") and receiver_details and receiver_details.get("IsAI")):
        log.debug(f"Au moins un des citoyens ({actor_username}, {receiver_of_action_username}) n'est pas une IA ou détails manquants. Pas de dialogue de réaction Kinos.")
        return

    actor_display_name = actor_details.get("FirstName", actor_username)
    receiver_display_name = receiver_details.get("FirstName", receiver_of_action_username)

    desc_for_receiver_prompt, desc_for_actor_reply_context = _construct_activity_description(
        actor_display_name, receiver_display_name, activity_type, activity_success, activity_detail
    )

    log.info(f"Déclenchement du dialogue de réaction Kinos entre {actor_username} (acteur) et {receiver_of_action_username} (receveur).")

    # Étape 1: La réaction du receveur (receiver_of_action_username) à l'acteur (actor_username)
    prompt_for_receiver = (
        f"You are {receiver_display_name}. "
        f"{desc_for_receiver_prompt} "
        f"What is your immediate, brief, and natural reaction or comment TO {actor_display_name}? Keep it short and conversational."
    )
    
    receiver_reaction_content = _generate_kinos_message_content(
        kin_username=receiver_of_action_username,
        channel_username=actor_username,
        prompt=prompt_for_receiver,
        kinos_api_key=kinos_api_key,
        kinos_model_override="local"  # Utiliser le modèle local
    )

    if receiver_reaction_content:
        log.info(f"Réaction de {receiver_of_action_username} (à {actor_username}): '{receiver_reaction_content[:100]}...'")
        _store_message_via_api(
            sender_username=receiver_of_action_username,
            receiver_username=actor_username,
            content=receiver_reaction_content
        )

        # Étape 2: La réponse de l'acteur (actor_username) à la réaction du receveur
        prompt_for_actor_reply = (
            f"You are {actor_display_name}. "
            f"Regarding {desc_for_actor_reply_context}, {receiver_display_name} just said to you: '{receiver_reaction_content}' "
            f"What is your brief, natural reply?"
        )

        actor_reply_content = _generate_kinos_message_content(
            kin_username=actor_username,
            channel_username=receiver_of_action_username,
            prompt=prompt_for_actor_reply,
            kinos_api_key=kinos_api_key,
            kinos_model_override="local"  # Utiliser le modèle local
        )

        if actor_reply_content:
            log.info(f"Réponse de {actor_username} (à {receiver_of_action_username}): '{actor_reply_content[:100]}...'")
            _store_message_via_api(
                sender_username=actor_username,
                receiver_username=receiver_of_action_username,
                content=actor_reply_content
            )
        else:
            log.warning(f"Échec de la génération de la réponse de {actor_username} à la réaction de {receiver_of_action_username}.")
    else:
        log.warning(f"Échec de la génération de la réaction initiale de {receiver_of_action_username} à {actor_username}.")


# Exemple d'utilisation (sera appelé depuis les processeurs d'activité):
# update_trust_score_for_activity(
#     tables, "citizenA", "citizenB", 1.0, "delivery", True, "resource_wood"
# )
# update_trust_score_for_activity(
#     tables, "citizenC", "citizenD", -1.0, "payment", False, "insufficient_funds"
# )
