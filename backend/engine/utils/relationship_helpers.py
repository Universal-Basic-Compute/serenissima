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

# Facteur d'échelle pour la conversion entre scores latents et scores normalisés (0-100)
# Une valeur plus petite signifie une saturation plus rapide des scores normalisés.
# Exemple : si latent_score * scale_factor = 1, le score normalisé est 75.
# Si latent_score * scale_factor = -1, le score normalisé est 25.
# LATENT_SCORE_SCALE_FACTOR = 0.1 # Ajustez au besoin pour la sensibilité désirée - Supprimé, remplacé par RAW_POINT_SCALE_FACTOR
RAW_POINT_SCALE_FACTOR = 0.1 # Facteur pour moduler l'impact des points bruts via atan
DEFAULT_NORMALIZED_SCORE = 50.0 # Score neutre sur l'échelle 0-100 (pour TrustScore)
DEFAULT_NORMALIZED_STRENGTH_SCORE = 0.0 # Score de base pour StrengthScore (0-100)

# Les fonctions convert_latent_to_normalized_score, convert_normalized_to_latent_score,
# convert_latent_strength_to_normalized_score, convert_normalized_strength_to_latent_score
# ne sont plus nécessaires et seront supprimées.

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

def apply_scaled_score_change(current_score: float, raw_delta: float, scale_factor: float = RAW_POINT_SCALE_FACTOR, min_score: float = 0.0, max_score: float = 100.0) -> float:
    """
    Applique un changement de points bruts à un score existant (0-100),
    en utilisant atan pour moduler l'impact de sorte que le score s'approche
    asymptotiquement des bornes min_score/max_score.
    """
    import math # S'assurer que math est importé

    if raw_delta == 0:
        return round(current_score, 2)

    if raw_delta > 0:
        room_to_grow = max_score - current_score
        if room_to_grow <= 1e-4: # Pratiquement à la limite max ou au-dessus
            return round(max(min(current_score, max_score), min_score), 2)
        
        # increment_factor est entre 0 et 1
        increment_factor = (math.atan(raw_delta * scale_factor) / (math.pi / 2))
        actual_increment = room_to_grow * increment_factor
        new_score = current_score + actual_increment
    else: # raw_delta < 0
        room_to_fall = current_score - min_score
        if room_to_fall <= 1e-4: # Pratiquement à la limite min ou en-dessous
            return round(max(min(current_score, max_score), min_score), 2)
            
        # decrement_factor est entre 0 et 1
        decrement_factor = (math.atan(abs(raw_delta) * scale_factor) / (math.pi / 2))
        actual_decrement = room_to_fall * decrement_factor
        new_score = current_score - actual_decrement
        
    return round(max(min_score, min(new_score, max_score)), 2)


# Suppression des anciennes fonctions de conversion (elles étaient ici)
# convert_latent_to_normalized_score
# convert_normalized_to_latent_score
# convert_latent_strength_to_normalized_score
# convert_normalized_strength_to_latent_score
# La nouvelle fonction apply_scaled_score_change est définie plus haut.

def update_trust_score_for_activity(
    tables: Dict[str, Any],
    citizen1_username: str,
    citizen2_username: str,
    trust_change_amount: float,
    activity_type_for_notes: str,
    success: bool,
    notes_detail: Optional[str] = None,
    activity_record_for_kinos: Optional[Dict[str, Any]] = None
) -> None:
    """
    Met à jour le TrustScore (stocké en BDD sur une échelle de 0 à 100) entre deux citoyens suite à une activité.
    L'ajout de points bruts est modulé pour un effet de rendement décroissant.
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
            current_trust_score = float(relationship_record['fields'].get('TrustScore', DEFAULT_NORMALIZED_SCORE))
            
            # Appliquer le changement de points bruts au score actuel
            new_trust_score = apply_scaled_score_change(
                current_trust_score, 
                trust_change_amount, 
                RAW_POINT_SCALE_FACTOR, 
                min_score=0.0, 
                max_score=100.0
            )

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
                'Notes': updated_notes,
                'Status': 'Active'  # Assurer que le statut est Actif lors de la mise à jour
            }
            tables['relationships'].update(relationship_record['id'], payload)
            log.info(f"{LogColors.OKGREEN}TrustScore (0-100) mis à jour pour {user1}-{user2}: {current_trust_score:.2f} -> {new_trust_score:.2f}. Statut défini sur 'Active'. Notes: {interaction_note_key}{LogColors.ENDC}")
        else:
            # Créer une nouvelle relation
            # Commencer avec le score neutre par défaut, puis appliquer le premier changement
            initial_trust_score_base = DEFAULT_NORMALIZED_SCORE
            final_initial_trust_score = apply_scaled_score_change(
                initial_trust_score_base,
                trust_change_amount,
                RAW_POINT_SCALE_FACTOR,
                min_score=0.0,
                max_score=100.0
            )
            
            initial_strength_score = DEFAULT_NORMALIZED_STRENGTH_SCORE # Commence à 0

            payload = {
                'Citizen1': user1,
                'Citizen2': user2,
                'TrustScore': final_initial_trust_score,
                'StrengthScore': initial_strength_score,
                'LastInteraction': datetime.now(VENICE_TIMEZONE).isoformat(),
                'Notes': interaction_note_key,
                'Status': 'Active' # Statut initial
            }
            tables['relationships'].create(payload)
            log.info(f"{LogColors.OKGREEN}Nouvelle relation créée pour {user1}-{user2}. TrustScore (0-100): {final_initial_trust_score:.2f}, StrengthScore (0-100): {initial_strength_score:.2f}. Notes: {interaction_note_key}{LogColors.ENDC}")

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
        activity_record=activity_record_for_kinos # Passer l'enregistrement d'activité complet
    )

# --- Fonctions d'assistance pour l'interaction Kinos ---

# Helpers pour récupérer les données contextuelles pour Kinos via l'API Next.js
def _rh_get_notifications_data_api(username: str, limit: int = 5) -> List[Dict]:
    """RH: Fetches recent notifications for a citizen via the Next.js API."""
    try:
        url = f"{NEXT_JS_BASE_URL}/api/notifications"
        payload = {"citizen": username, "limit": limit}
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "notifications" in data:
            return data["notifications"]
        log.warning(f"{LogColors.WARNING}RH: Failed to get notifications for {username} from API: {data.get('error')}{LogColors.ENDC}")
        return []
    except Exception as e:
        log.error(f"{LogColors.FAIL}RH: API error fetching notifications for {username}: {e}{LogColors.ENDC}")
        return []

def _rh_get_relevancies_data_api(relevant_to_username: str, target_username: Optional[str] = None, limit: int = 5) -> List[Dict]:
    """RH: Fetches recent relevancies for a citizen via the Next.js API."""
    try:
        params = {"relevantToCitizen": relevant_to_username, "limit": str(limit)}
        if target_username:
            params["targetCitizen"] = target_username
        
        url = f"{NEXT_JS_BASE_URL}/api/relevancies"
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "relevancies" in data:
            return data["relevancies"]
        log.warning(f"{LogColors.WARNING}RH: Failed to get relevancies for {relevant_to_username} (target: {target_username}) from API: {data.get('error')}{LogColors.ENDC}")
        return []
    except Exception as e:
        log.error(f"{LogColors.FAIL}RH: API error fetching relevancies for {relevant_to_username} (target: {target_username}): {e}{LogColors.ENDC}")
        return []

def _rh_get_problems_data_api(username: str, limit: int = 5) -> List[Dict]:
    """RH: Fetches active problems for a citizen via the Next.js API."""
    try:
        url = f"{NEXT_JS_BASE_URL}/api/problems?citizen={username}&status=active&limit={limit}"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        if data.get("success") and "problems" in data:
            return data["problems"]
        log.warning(f"{LogColors.WARNING}RH: Failed to get problems for {username} from API: {data.get('error')}{LogColors.ENDC}")
        return []
    except Exception as e:
        log.error(f"{LogColors.FAIL}RH: API error fetching problems for {username}: {e}{LogColors.ENDC}")
        return []

def _rh_get_relationship_data(tables: Dict[str, Any], username1: str, username2: str) -> Optional[Dict[str, Any]]:
    """RH: Fetches relationship data between two citizens from Airtable."""
    try:
        user1, user2 = sorted([_escape_airtable_value(username1), _escape_airtable_value(username2)])
        formula = f"AND({{Citizen1}}='{user1}', {{Citizen2}}='{user2}')"
        records = tables["relationships"].all(formula=formula, max_records=1)
        if records:
            return records[0]['fields']
        return None
    except Exception as e:
        log.error(f"{LogColors.FAIL}RH: Error fetching relationship between {username1} and {username2}: {e}{LogColors.ENDC}")
        return None

def _get_kinos_api_key() -> Optional[str]:
    """Récupère la clé API Kinos depuis les variables d'environnement."""
    api_key = os.getenv("KINOS_API_KEY")
    if not api_key:
        log.error(f"{LogColors.FAIL}Clé API Kinos (KINOS_API_KEY) non trouvée.{LogColors.ENDC}")
    return api_key

def _rh_get_kinos_model_for_citizen(social_class: Optional[str]) -> str:
    """RH: Determines the Kinos model based on social class."""
    if not social_class:
        return "local"
    
    s_class_lower = social_class.lower()
    if s_class_lower == "nobili":
        return "gemini-2.5-pro-preview-05-06"
    elif s_class_lower in ["cittadini", "forestieri"]:
        return "gemini-2.5-flash-preview-05-20"
    elif s_class_lower in ["popolani", "facchini"]:
        return "local"
    else:
        return "local"

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

def _generate_kinos_message_content(
    kin_username: str, 
    channel_username: str, 
    prompt: str, 
    kinos_api_key: str, 
    kinos_model_override: Optional[str] = None,
    add_system_data: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """Appelle Kinos pour générer le contenu d'un message, avec addSystem facultatif."""
    try:
        url = f"{KINOS_API_URL_BASE}/{kin_username}/channels/{channel_username}/messages"
        headers = {"Authorization": f"Bearer {kinos_api_key}", "Content-Type": "application/json"}
        payload = {"message": prompt}

        actual_model_to_use = kinos_model_override
        if not actual_model_to_use:
            # Determine social class from add_system_data if possible, or fetch if necessary
            # This function is generic, so social class might not always be in add_system_data
            # For reaction dialogues, the calling function _initiate_reaction_dialogue_if_both_ai
            # will determine the model based on the kin_username's social class.
            # This function will prioritize kinos_model_override if passed.
            # If kinos_model_override is None, the calling function should have already decided.
            # However, to be robust, if add_system_data contains profile info, we can try to use it.
            # This is a bit complex as the structure of add_system_data can vary.
            # For now, we rely on kinos_model_override being correctly set by the caller.
            # If it's not set, Kinos default will be used.
            # The primary logic for model selection based on social class should be in the functions
            # that *prepare* the call to _generate_kinos_message_content.
            pass # Rely on kinos_model_override or Kinos default if not set.

        if actual_model_to_use: # If an override was provided
            payload["model"] = actual_model_to_use
            log.info(f"Utilisation du modèle Kinos '{actual_model_to_use}' pour {kin_username} -> {channel_username}.")
        # If no override, Kinos default is used. The calling function is responsible for class-based selection.
        
        if add_system_data:
            try:
                payload["addSystem"] = json.dumps(add_system_data)
                log.info(f"Ajout de addSystem data pour {kin_username} -> {channel_username}.")
            except TypeError as te:
                log.error(f"{LogColors.FAIL}Erreur de sérialisation JSON pour addSystem data: {te}. Envoi sans addSystem.{LogColors.ENDC}")


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

def _construct_activity_description(actor_name: str, receiver_name: str, activity_record: Dict[str, Any]) -> Tuple[str, str]:
    """Construit des descriptions d'activité pour les prompts Kinos en utilisant le JSON de l'activité."""
    try:
        # Retirer les champs potentiellement trop volumineux ou non pertinents pour le prompt direct
        # Par exemple, 'Path' dans les activités de déplacement.
        # Créer une copie pour ne pas modifier l'original.
        cleaned_activity_record = activity_record.copy()
        if "Path" in cleaned_activity_record:
            cleaned_activity_record["Path"] = "[path data omitted for brevity]"
        
        activity_json_str = json.dumps(cleaned_activity_record, indent=2, ensure_ascii=False, default=str) # default=str pour les types non sérialisables
    except Exception as e:
        log.error(f"Erreur lors de la sérialisation de activity_record en JSON: {e}")
        activity_json_str = f"{{'error': 'Could not serialize activity details', 'type': '{activity_record.get('Type', 'Unknown')}'}}"

    desc_for_receiver_prompt = (
        f"{actor_name} just performed an activity that involved or affected you. "
        f"Here are the details of the activity:\n```json\n{activity_json_str}\n```"
    )
    desc_for_actor_reply_context = (
        f"your recent activity involving {receiver_name}. "
        f"The details of that activity were:\n```json\n{activity_json_str}\n```"
    )
    return desc_for_receiver_prompt, desc_for_actor_reply_context

def _initiate_reaction_dialogue_if_both_ai(
    tables: Dict[str, Any],
    actor_username: str,
    receiver_of_action_username: str,
    activity_record: Optional[Dict[str, Any]] = None
):
    """Déclenche un dialogue de réaction Kinos si les deux citoyens sont des IA et si activity_record est fourni."""
    if not activity_record:
        log.debug("Aucun activity_record fourni à _initiate_reaction_dialogue_if_both_ai. Pas de dialogue Kinos.")
        return

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

    # Préparer le contexte addSystem
    system_context_data = {
        "initiator_profile": actor_details, # Celui qui a fait l'action originale
        "responder_profile": receiver_details, # Celui qui réagit en premier
        "relationship_between_us": _rh_get_relationship_data(tables, actor_username, receiver_of_action_username),
        "initiator_recent_notifications": _rh_get_notifications_data_api(actor_username),
        "responder_recent_notifications": _rh_get_notifications_data_api(receiver_of_action_username),
        "initiator_recent_problems": _rh_get_problems_data_api(actor_username),
        "responder_recent_problems": _rh_get_problems_data_api(receiver_of_action_username),
        "relevancies_initiator_to_responder": _rh_get_relevancies_data_api(actor_username, receiver_of_action_username),
        "relevancies_responder_to_initiator": _rh_get_relevancies_data_api(receiver_of_action_username, actor_username),
        "triggering_activity_details": activity_record # Le JSON de l'activité
    }

    log.info(f"Déclenchement du dialogue de réaction Kinos entre {actor_username} (acteur) et {receiver_of_action_username} (receveur) concernant l'activité : {activity_record.get('Type', 'Unknown')}.")

    # Étape 1: La réaction du receveur (receiver_of_action_username) à l'acteur (actor_username)
    prompt_for_receiver = (
        f"You are {receiver_display_name}. An activity involving you and {actor_display_name} just occurred. "
        f"Details are in `addSystem.triggering_activity_details`. Your profiles and relationship context are also in `addSystem`.\n"
        f"Based on ALL this context, what is your immediate and natural reaction or comment TO {actor_display_name}? "
        f"Focus on how this interaction could strategically advance your position or goals in Venice. Keep it short, gameplay-focused, and conversational."
    )
    
    # Determine model for receiver
    receiver_social_class = receiver_details.get("SocialClass")
    model_for_receiver = _rh_get_kinos_model_for_citizen(receiver_social_class)

    receiver_reaction_content = _generate_kinos_message_content(
        kin_username=receiver_of_action_username,
        channel_username=actor_username,
        prompt=prompt_for_receiver,
        kinos_api_key=kinos_api_key,
        kinos_model_override=model_for_receiver, # Utiliser le modèle basé sur la classe sociale
        add_system_data=system_context_data # Passer le contexte
    )

    if receiver_reaction_content:
        log.info(f"Réaction de {receiver_of_action_username} (à {actor_username}): '{receiver_reaction_content[:100]}...'")
        _store_message_via_api(
            sender_username=receiver_of_action_username,
            receiver_username=actor_username,
            content=receiver_reaction_content
        )

        # Mettre à jour le contexte pour la réponse de l'acteur
        # L'acteur devient l'initiateur du message, le receveur devient le répondeur
        system_context_data_for_actor_reply = {
            "initiator_profile": receiver_details, # Le receveur de l'action originale est maintenant l'initiateur de ce message de réaction
            "responder_profile": actor_details,    # L'acteur original répond maintenant
            "relationship_between_us": system_context_data["relationship_between_us"], # La relation est la même
            "initiator_recent_notifications": system_context_data["responder_recent_notifications"], # Inverser les rôles pour les notifs/problèmes
            "responder_recent_notifications": system_context_data["initiator_recent_notifications"],
            "initiator_recent_problems": system_context_data["responder_recent_problems"],
            "responder_recent_problems": system_context_data["initiator_recent_problems"],
            "relevancies_initiator_to_responder": system_context_data["relevancies_responder_to_initiator"], # Inverser les relevancies
            "relevancies_responder_to_initiator": system_context_data["relevancies_initiator_to_responder"],
            "triggering_activity_details": activity_record, # L'activité originale reste le contexte principal
            "their_reaction_to_activity": receiver_reaction_content # Ajouter la réaction du receveur au contexte de l'acteur
        }

        # Étape 2: La réponse de l'acteur (actor_username) à la réaction du receveur
        prompt_for_actor_reply = (
            f"You are {actor_display_name}. You recently performed an activity involving {receiver_display_name} (details in `addSystem.triggering_activity_details`).\n"
            f"{receiver_display_name} just reacted to this by saying to you: '{receiver_reaction_content}' (this is also in `addSystem.their_reaction_to_activity`).\n"
            f"Your profiles and relationship context are in `addSystem`.\n"
            f"Based on ALL this context, what is your brief, natural reply? "
            f"Focus on how this interaction could strategically advance your position or goals in Venice. Keep it short, gameplay-focused, and conversational."
        )

        # Determine model for actor
        actor_social_class = actor_details.get("SocialClass")
        model_for_actor_reply = _rh_get_kinos_model_for_citizen(actor_social_class)

        actor_reply_content = _generate_kinos_message_content(
            kin_username=actor_username,
            channel_username=receiver_of_action_username,
            prompt=prompt_for_actor_reply,
            kinos_api_key=kinos_api_key,
            kinos_model_override=model_for_actor_reply, # Utiliser le modèle basé sur la classe sociale
            add_system_data=system_context_data_for_actor_reply # Passer le contexte mis à jour
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
#     tables, "citizenA", "citizenB", 1.0, "delivery", True, "resource_wood", 
#     activity_record_for_kinos={"Type": "delivery", "FromBuilding": "bldgX", "ToBuilding": "bldgY", "ResourceId": "resource_wood", "Amount": 10}
# )
# update_trust_score_for_activity(
#     tables, "citizenC", "citizenD", -1.0, "payment", False, "insufficient_funds",
#     activity_record_for_kinos={"Type": "payment", "Amount": 50, "Reason": "insufficient_funds"}
# )
