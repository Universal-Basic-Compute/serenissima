import logging
from typing import Dict, Any, Optional
from datetime import datetime
import pytz # Pour la gestion des fuseaux horaires

# Importer les helpers nécessaires depuis activity_helpers
from .activity_helpers import _escape_airtable_value, VENICE_TIMEZONE, LogColors

log = logging.getLogger(__name__)

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

# Exemple d'utilisation (sera appelé depuis les processeurs d'activité):
# update_trust_score_for_activity(
#     tables, "citizenA", "citizenB", 1.0, "delivery", True, "resource_wood"
# )
# update_trust_score_for_activity(
#     tables, "citizenC", "citizenD", -1.0, "payment", False, "insufficient_funds"
# )
