#!/usr/bin/env python3
import os
import sys
import json
import random
import requests
import time
from datetime import datetime, timezone, timedelta # Ajout de timezone, timedelta
from dotenv import load_dotenv
from pyairtable import Api, Table

# Ajouter le répertoire parent au chemin Python
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importer les fonctions utilitaires
from backend.engine.utils.activity_helpers import LogColors, log_header

# Charger les variables d'environnement
load_dotenv()

# Configuration
AIRTABLE_API_KEY = os.getenv("AIRTABLE_API_KEY")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")
KINOS_API_KEY = os.getenv("KINOS_API_KEY")
KINOS_BLUEPRINT = os.getenv("KINOS_BLUEPRINT", "serenissima-ai")
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000')

def initialize_airtable():
    """Initialiser la connexion à Airtable."""
    if not AIRTABLE_API_KEY or not AIRTABLE_BASE_ID:
        print(f"{LogColors.FAIL}Erreur: Identifiants Airtable manquants. Définissez AIRTABLE_API_KEY et AIRTABLE_BASE_ID.{LogColors.ENDC}")
        sys.exit(1)
    
    try:
        api = Api(AIRTABLE_API_KEY)
        tables = {
            "citizens": api.table(AIRTABLE_BASE_ID, "CITIZENS"),
            "relationships": api.table(AIRTABLE_BASE_ID, "RELATIONSHIPS"),
            "relevancies": api.table(AIRTABLE_BASE_ID, "RELEVANCIES"),
            "problems": api.table(AIRTABLE_BASE_ID, "PROBLEMS")
        }
        print(f"{LogColors.OKGREEN}Connexion à Airtable initialisée avec succès.{LogColors.ENDC}")
        return tables
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors de l'initialisation d'Airtable: {e}{LogColors.ENDC}")
        sys.exit(1)

def _escape_airtable_value(value):
    """Échappe les apostrophes et les guillemets pour les formules Airtable."""
    if not isinstance(value, str):
        value = str(value)
    return value.replace("'", "\\'").replace('"', '\\"')

def get_citizen_data(tables, username):
    """Récupérer les données d'un citoyen."""
    try:
        safe_username = _escape_airtable_value(username)
        records = tables["citizens"].all(formula=f"{{Username}} = '{safe_username}'", max_records=1)
        if records:
            return records[0]
        
        # Si non trouvé par Username, essayer par CitizenId comme fallback
        records = tables["citizens"].all(formula=f"{{CitizenId}} = '{safe_username}'", max_records=1)
        if records:
            print(f"Citoyen {username} trouvé par CitizenId au lieu de Username")
            return records[0]
            
        # Essayer par Wallet comme dernier recours
        records = tables["citizens"].all(formula=f"{{Wallet}} = '{safe_username}'", max_records=1)
        if records:
            print(f"Citoyen {username} trouvé par Wallet au lieu de Username")
            return records[0]
            
        print(f"Citoyen non trouvé: {username}")
        return None
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors de la récupération des données du citoyen {username}: {e}{LogColors.ENDC}")
        import traceback
        traceback.print_exc()
        return None

def get_relevancies_data(tables, username1, username2):
    """Récupérer les pertinences entre deux citoyens via l'API."""
    try:
        params = {
            "relevantToCitizen": username1,
            "targetCitizen": username2,
            "limit": "50"
        }
        api_url = f"{BASE_URL}/api/relevancies"
        response = requests.get(api_url, params=params, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        if data.get("success") and "relevancies" in data:
            print(f"Récupéré {len(data['relevancies'])} pertinences pour {username1} -> {username2} via API.")
            return data["relevancies"]
        else:
            print(f"L'API a échoué à récupérer les pertinences pour {username1} -> {username2}: {data.get('error', 'Erreur inconnue')}")
            return []
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors de la récupération des pertinences pour {username1} -> {username2}: {e}{LogColors.ENDC}")
        return []

def get_problems_data(tables, username1, username2):
    """Récupérer les problèmes pour deux citoyens via l'API."""
    problems_list = []
    try:
        # Récupérer les problèmes pour username1
        params1 = {"citizen": username1, "status": "active", "limit": "50"}
        api_url = f"{BASE_URL}/api/problems"
        response1 = requests.get(api_url, params=params1, timeout=15)
        response1.raise_for_status()
        data1 = response1.json()
        if data1.get("success") and "problems" in data1:
            problems_list.extend(data1["problems"])
        
        # Récupérer les problèmes pour username2
        if username1 != username2:
            params2 = {"citizen": username2, "status": "active", "limit": "50"}
            response2 = requests.get(api_url, params=params2, timeout=15)
            response2.raise_for_status()
            data2 = response2.json()
            if data2.get("success") and "problems" in data2:
                # Éviter les doublons
                existing_problem_ids = {p.get('problemId') or p.get('id') for p in problems_list}
                for problem in data2["problems"]:
                    problem_id = problem.get('problemId') or problem.get('id')
                    if problem_id not in existing_problem_ids:
                        problems_list.append(problem)
        
        # Trier par date de création (plus récent d'abord)
        problems_list.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        print(f"Récupéré {len(problems_list)} problèmes pour {username1} ou {username2} via API.")
        return problems_list[:50]  # Limiter à 50 problèmes
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors de la récupération des problèmes: {e}{LogColors.ENDC}")
        return problems_list

def assess_relationship_with_kinos(tables, relationship_record, kinos_model="local"):
    """Évaluer une relation en utilisant KinOS."""
    if not KINOS_API_KEY:
        print(f"{LogColors.FAIL}Erreur: Clé API KinOS manquante. Définissez KINOS_API_KEY.{LogColors.ENDC}")
        return None
    
    fields = relationship_record.get('fields', {})
    citizen1 = fields.get('Citizen1')
    citizen2 = fields.get('Citizen2')
    
    if not citizen1 or not citizen2:
        print(f"{LogColors.FAIL}Erreur: Relation sans citoyens valides: {relationship_record.get('id')}{LogColors.ENDC}")
        return None
    
    # Récupérer les données des citoyens
    citizen1_data = get_citizen_data(tables, citizen1)
    citizen2_data = get_citizen_data(tables, citizen2)
    
    if not citizen1_data or not citizen2_data:
        print(f"{LogColors.FAIL}Erreur: Impossible de récupérer les données des citoyens pour la relation.{LogColors.ENDC}")
        return None
    
    # Vérifier si au moins un des citoyens est une IA
    citizen1_is_ai = citizen1_data.get('fields', {}).get('IsAI', False)
    citizen2_is_ai = citizen2_data.get('fields', {}).get('IsAI', False)
    
    if not citizen1_is_ai and not citizen2_is_ai:
        print(f"{LogColors.OKCYAN}Relation entre deux humains, acceptée: {citizen1} et {citizen2}{LogColors.ENDC}")
    
    # Choisir aléatoirement quel citoyen IA va évaluer la relation
    if citizen1_is_ai and citizen2_is_ai:
        # Si les deux sont des IA, choisir aléatoirement
        evaluator, target = random.choice([(citizen1, citizen2), (citizen2, citizen1)])
    elif citizen1_is_ai:
        evaluator, target = citizen1, citizen2
    else:
        evaluator, target = citizen2, citizen1
    
    print(f"{LogColors.HEADER}Évaluation de la relation entre {citizen1} et {citizen2} par {evaluator} (modèle: {kinos_model}){LogColors.ENDC}")
    
    # Récupérer les pertinences et problèmes
    relevancies_evaluator_to_target = get_relevancies_data(tables, evaluator, target)
    relevancies_target_to_evaluator = get_relevancies_data(tables, target, evaluator)
    problems = get_problems_data(tables, evaluator, target)
    
    # Construire le contexte pour KinOS
    system_context = {
        "evaluator_citizen": citizen1_data if evaluator == citizen1 else citizen2_data,
        "target_citizen": citizen2_data if target == citizen2 else citizen1_data,
        "relationship": relationship_record,
        "relevancies_evaluator_to_target": relevancies_evaluator_to_target,
        "relevancies_target_to_evaluator": relevancies_target_to_evaluator,
        "problems_involving_both": problems
    }
    
    # Build the prompt for KinOS
    prompt = (
        f"[SYSTEM] You are {evaluator}, a citizen of Venice. I'm asking you to evaluate your relationship with {target}. "
        f"Analyze the data provided in the system context (addSystem) to understand your current relationship. "
        f"This data includes:\n"
        f"- Your respective profiles\n"
        f"- The details of your existing relationship:\n"
        f"  - TrustScore: 0-100 scale (0=total distrust, 50=neutral, 100=total trust).\n"
        f"  - StrengthScore: 0-100 scale (0=no strength/relevance, 100=maximum strength/relevance).\n"
        f"- The mutual relevancies between you\n"
        f"- The problems that concern both of you\n\n"
        f"Respond with only a JSON object containing two fields:\n"
        f"1. 'title': A short title (2-4 words) describing your relationship (e.g., 'Trusted Business Partners', 'Suspicious Competitors', 'Reluctant Political Allies')\n"
        f"2. 'description': A detailed description (2-3 sentences) explaining the nature of your relationship (don't invent facts, use the discussion/data), formulated with \"We\". Keep it immersive but gameplay-focused.\n"
        f"Example of a valid response:\n"
        f"```json\n"
        f"{{\n"
        f"  \"title\": \"Trusted Business Partners\",\n"
        f"  \"description\": \"They have proven their reliability through years of successful ventures together, never failing to deliver quality goods on time or honor their agreements. When your bottega ran short of Murano glass during Carnival season, they diverted their own shipment to keep your workshop running, knowing you'd do the same. They extend credit during your cash shortages, share valuable market intelligence that has saved you from bad deals, and keep your business secrets as carefully as their own. Their word is their bond—you conduct thousand-ducat transactions on a handshake, and they have keys to your warehouse for after-hours deliveries when their goods arrive late from the mainland. In Venice's treacherous commercial waters, they are the one merchant you can count on completely, whether for emergency supplies of silk and dyes, honest warnings about the Silk Guild's new regulations, or introductions to their trusted suppliers in Constantinople.\"\n"
        f"}}\n"
        f"```\n\n"
        f"IMPORTANT: Your response must be ONLY a valid JSON object, with no text before or after. "
        f"Make sure the title and description accurately reflect the relationship as it appears in the data. "
        f"StrengthScore is 0-100 (0=none, 100=max). TrustScore is 0-100 (50=neutral).\n"
        f"Current StrengthScore: {fields.get('StrengthScore', 0):.1f}/100. Current TrustScore: {fields.get('TrustScore', 50):.1f}/100.[/SYSTEM]"
    )
    
    # Appeler l'API KinOS
    url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT}/kins/{evaluator}/channels/{target}/messages"
    headers = {
        "Authorization": f"Bearer {KINOS_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "message": prompt,
        "addSystem": json.dumps(system_context),
        "history_length": 75,
        "model": kinos_model
    }
    
    try:
        print(f"{LogColors.OKCYAN}Envoi de la requête à KinOS pour évaluer la relation...{LogColors.ENDC}")
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        
        if response.status_code == 200 or response.status_code == 201:
            # Récupérer le dernier message de l'assistant
            messages_url = f"https://api.kinos-engine.ai/v2/blueprints/{KINOS_BLUEPRINT}/kins/{evaluator}/channels/{target}/messages"
            messages_response = requests.get(messages_url, headers=headers, timeout=60)
            
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                assistant_messages = [
                    msg for msg in messages_data.get("messages", [])
                    if msg.get("role") == "assistant"
                ]
                
                if assistant_messages:
                    assistant_messages.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
                    content = assistant_messages[0].get("content", "")
                    
                    # Extraire le JSON de la réponse
                    try:
                        # Nettoyer la réponse pour extraire uniquement le JSON
                        content = content.strip()
                        
                        # Supprimer les balises <think>...</think> et leur contenu
                        import re
                        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
                        content = content.strip()
                        
                        # Extraire le JSON entre les premières accolades { et }
                        json_match = re.search(r'({.*})', content, re.DOTALL)
                        if json_match:
                            json_content = json_match.group(1)
                            # Analyser le JSON
                            relationship_assessment = json.loads(json_content)
                            
                            # Vérifier que les champs requis sont présents
                            if "title" in relationship_assessment and "description" in relationship_assessment:
                                print(f"{LogColors.OKGREEN}Évaluation de la relation réussie:{LogColors.ENDC}")
                                print(f"Titre: {relationship_assessment['title']}")
                                print(f"Description: {relationship_assessment['description']}")
                                return relationship_assessment
                            else:
                                print(f"{LogColors.FAIL}Réponse JSON incomplète: {relationship_assessment}{LogColors.ENDC}")
                        else:
                            # Si aucun JSON n'est trouvé avec la regex, essayer les méthodes précédentes
                            if "```json" in content:
                                content = content.split("```json")[1].split("```")[0].strip()
                            elif "```" in content:
                                content = content.split("```")[1].split("```")[0].strip()
                            
                            # Analyser le JSON
                            relationship_assessment = json.loads(content)
                            
                            # Vérifier que les champs requis sont présents
                            if "title" in relationship_assessment and "description" in relationship_assessment:
                                print(f"{LogColors.OKGREEN}Évaluation de la relation réussie:{LogColors.ENDC}")
                                print(f"Titre: {relationship_assessment['title']}")
                                print(f"Description: {relationship_assessment['description']}")
                                return relationship_assessment
                            else:
                                print(f"{LogColors.FAIL}Réponse JSON incomplète: {relationship_assessment}{LogColors.ENDC}")
                    except json.JSONDecodeError as e:
                        print(f"{LogColors.FAIL}Erreur lors de l'analyse du JSON: {e}{LogColors.ENDC}")
                        print(f"Contenu reçu: {content}")
                        # Tenter une dernière approche en cherchant juste le JSON entre accolades
                        try:
                            import re
                            json_match = re.search(r'({.*})', content, re.DOTALL)
                            if json_match:
                                json_content = json_match.group(1)
                                relationship_assessment = json.loads(json_content)
                                if "title" in relationship_assessment and "description" in relationship_assessment:
                                    print(f"{LogColors.OKGREEN}Évaluation de la relation réussie (après récupération):{LogColors.ENDC}")
                                    print(f"Titre: {relationship_assessment['title']}")
                                    print(f"Description: {relationship_assessment['description']}")
                                    return relationship_assessment
                        except Exception as inner_e:
                            print(f"{LogColors.FAIL}Échec de la récupération de secours: {inner_e}{LogColors.ENDC}")
                else:
                    print(f"{LogColors.FAIL}Aucun message de l'assistant trouvé dans l'historique.{LogColors.ENDC}")
            else:
                print(f"{LogColors.FAIL}Erreur lors de la récupération des messages: {messages_response.status_code} - {messages_response.text}{LogColors.ENDC}")
        else:
            print(f"{LogColors.FAIL}Erreur de l'API KinOS: {response.status_code} - {response.text}{LogColors.ENDC}")
        
        return None
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors de l'appel à KinOS: {e}{LogColors.ENDC}")
        return None

def update_relationship(tables, relationship_id, assessment):
    """Mettre à jour la relation avec l'évaluation de KinOS."""
    try:
        # Mettre à jour les champs Title et Description
        update_data = {
            "Title": assessment["title"],
            "Description": assessment["description"],
            "QualifiedAt": datetime.now(timezone.utc).isoformat() # Mettre à jour QualifiedAt
        }
        
        tables["relationships"].update(relationship_id, update_data)
        print(f"{LogColors.OKGREEN}Relation {relationship_id} mise à jour avec succès.{LogColors.ENDC}")
        return True
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors de la mise à jour de la relation {relationship_id}: {e}{LogColors.ENDC}")
        return False

def process_relationships(tables, limit=None, min_strength=None, max_per_run=None, kinos_model="local", new_only=False):
    """Traiter les relations pour les qualifier avec KinOS."""
    try:
        # Récupérer les relations, triées par force décroissante
        print(f"{LogColors.HEADER}Récupération des relations depuis Airtable...{LogColors.ENDC}")
        
        fields_to_fetch = ["Citizen1", "Citizen2", "StrengthScore", "TrustScore", "LastInteraction", "Notes", "Title", "QualifiedAt"]
        
        if new_only:
            # En mode newOnly, on cible les relations qui n'ont jamais été qualifiées ou qui n'ont pas de titre.
            formula = "OR({Title} = BLANK(), {QualifiedAt} = BLANK())"
            print(f"{LogColors.OKBLUE}Mode 'newOnly': Formule = {formula}{LogColors.ENDC}")
            all_relationships_raw = tables["relationships"].all(formula=formula, fields=fields_to_fetch, sort=["-StrengthScore"])
        else:
            # En mode par défaut, on récupère toutes les relations (ou un sous-ensemble si min_strength est utilisé)
            # et on filtre en Python.
            formula_parts = []
            if min_strength is not None:
                formula_parts.append(f"{{StrengthScore}} >= {min_strength}")
            
            base_formula = " AND ".join(formula_parts) if formula_parts else ""
            print(f"{LogColors.OKBLUE}Mode par défaut. Formule de base Airtable = '{base_formula}' (si non vide). Le filtrage fin se fera en Python.{LogColors.ENDC}")
            all_relationships_raw = tables["relationships"].all(formula=base_formula, fields=fields_to_fetch, sort=["-StrengthScore"])

        print(f"{LogColors.OKBLUE}Récupéré {len(all_relationships_raw)} relations brutes depuis Airtable.{LogColors.ENDC}")

        relationships_to_process = []
        if not new_only:
            now_utc = datetime.now(timezone.utc)
            fourteen_days_ago = now_utc - timedelta(days=14)
            seven_days_ago = now_utc - timedelta(days=7)

            for rel in all_relationships_raw:
                fields = rel.get('fields', {})
                qualified_at_str = fields.get('QualifiedAt')
                last_interaction_str = fields.get('LastInteraction')

                should_process = False
                if not qualified_at_str: # Jamais qualifiée
                    should_process = True
                else:
                    try:
                        qualified_at_dt = datetime.fromisoformat(qualified_at_str.replace('Z', '+00:00'))
                        if qualified_at_dt < fourteen_days_ago: # Plus de 14 jours
                            if last_interaction_str:
                                last_interaction_dt = datetime.fromisoformat(last_interaction_str.replace('Z', '+00:00'))
                                if last_interaction_dt > seven_days_ago: # Moins de 7 jours
                                    should_process = True
                            # Si LastInteraction est vide, on ne requalifie pas une ancienne qualification.
                    except ValueError:
                        print(f"{LogColors.WARNING}Format de date invalide pour QualifiedAt ou LastInteraction pour la relation {rel.get('id')}. Elle sera traitée comme 'jamais qualifiée'.{LogColors.ENDC}")
                        should_process = True # Traiter en cas d'erreur de date, comme si elle n'avait jamais été qualifiée.
                
                if should_process:
                    relationships_to_process.append(rel)
            print(f"{LogColors.OKBLUE}Après filtrage Python (mode par défaut), {len(relationships_to_process)} relations à évaluer.{LogColors.ENDC}")
        else: # new_only mode, all fetched records are to be processed
            relationships_to_process = all_relationships_raw
            print(f"{LogColors.OKBLUE}Mode 'newOnly': {len(relationships_to_process)} relations à évaluer (pas de filtrage Python supplémentaire).{LogColors.ENDC}")

        # Limiter le nombre de relations à traiter si spécifié (après filtrage Python pour le mode par défaut)
        if limit is not None and limit > 0:
            relationships_to_process = relationships_to_process[:limit]
            print(f"{LogColors.OKBLUE}Limité à {limit} relations après filtrage.{LogColors.ENDC}")
        
        if max_per_run is not None and max_per_run > 0:
            relationships_to_process = relationships_to_process[:max_per_run]
            print(f"{LogColors.OKBLUE}Limité à {max_per_run} relations par exécution après filtrage.{LogColors.ENDC}")
        
        # Compteurs pour les statistiques
        total = len(relationships_to_process)
        success_count = 0
        error_count = 0
        
        # Traiter chaque relation
        for i, relationship in enumerate(relationships_to_process, 1):
            relationship_id = relationship.get('id')
            fields = relationship.get('fields', {})
            citizen1 = fields.get('Citizen1')
            citizen2 = fields.get('Citizen2')
            strength = fields.get('StrengthScore', 0)
            trust = fields.get('TrustScore', 0)
            qualified_at_display = fields.get('QualifiedAt', 'Jamais')
            last_interaction_display = fields.get('LastInteraction', 'Jamais')
            
            print(f"\n{LogColors.HEADER}[{i}/{total}] Traitement de la relation {relationship_id} entre {citizen1} et {citizen2} (Force: {strength:.1f}, Confiance: {trust:.1f}, Qualifié: {qualified_at_display}, Interagi: {last_interaction_display}){LogColors.ENDC}")
            
            # Évaluer la relation avec KinOS
            assessment = assess_relationship_with_kinos(tables, relationship, kinos_model)
            
            if assessment:
                # Mettre à jour la relation avec l'évaluation
                if update_relationship(tables, relationship_id, assessment):
                    success_count += 1
                else:
                    error_count += 1
            else:
                error_count += 1
            
            # No pause between requests - process relationships as quickly as possible
            if i < total:
                print(f"{LogColors.OKCYAN}Traitement de la relation suivante sans pause...{LogColors.ENDC}")
        
        # Afficher les statistiques finales
        print(f"\n{LogColors.HEADER}=== Résumé de l'exécution ==={LogColors.ENDC}")
        print(f"Total des relations traitées: {total}")
        print(f"Succès: {success_count}")
        print(f"Erreurs: {error_count}")
        print(f"Taux de réussite: {(success_count / total * 100) if total > 0 else 0:.1f}%")
        
    except Exception as e:
        print(f"{LogColors.FAIL}Erreur lors du traitement des relations: {e}{LogColors.ENDC}")
        import traceback
        traceback.print_exc()

def main():
    """Point d'entrée principal du script."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Qualifier les relations entre citoyens en utilisant KinOS.")
    parser.add_argument("--limit", type=int, help="Nombre maximum de relations à traiter")
    parser.add_argument("--min-strength", type=int, help="Force minimale de la relation pour être traitée")
    parser.add_argument("--max-per-run", type=int, help="Nombre maximum de relations à traiter par exécution")
    parser.add_argument("--model", type=str, default="local", help="Modèle KinOS à utiliser (défaut: 'local')")
    parser.add_argument("--newOnly", action="store_true", help="Traiter uniquement les relations sans titre")
    args = parser.parse_args()
    
    log_header("Qualification des Relations avec KinOS", LogColors.HEADER)
    print(f"Démarrage à {datetime.now().isoformat()}")
    print(f"Modèle KinOS: {args.model}")
    if args.newOnly:
        print(f"{LogColors.OKBLUE}Mode: Traitement uniquement des relations sans titre{LogColors.ENDC}")
    
    # Initialiser la connexion à Airtable
    tables = initialize_airtable()
    
    # Traiter les relations
    process_relationships(tables, args.limit, args.min_strength, args.max_per_run, args.model, args.newOnly)
    
    print(f"{LogColors.HEADER}=== Fin de l'exécution ==={LogColors.ENDC}")
    print(f"Terminé à {datetime.now().isoformat()}")

if __name__ == "__main__":
    main()
