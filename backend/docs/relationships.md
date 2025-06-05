# Relationship System Documentation

## Explication Simplifiée du Scoring

Le système de scoring pour les relations (`StrengthScore` et `TrustScore`) fonctionne comme suit :

1.  **Scores Visibles (0-100)** : Les scores affichés et stockés vont de 0 à 100.
    *   **`TrustScore`**:
        *   **0**: Méfiance totale.
        *   **50**: Neutre.
        *   **100**: Confiance totale.
    *   **`StrengthScore`**:
        *   **0**: Aucune force/pertinence.
        *   **100**: Force/pertinence maximale.

2.  **Impact Dégressif des Points Bruts** : L'effet de chaque "point brut" ajouté ou retiré à un score diminue à mesure que ce score s'approche des extrêmes (0 ou 100). Il est plus facile d'influencer un score proche du point de départ/neutre qu'un score déjà très bon ou très mauvais.

3.  **Mécanisme Interne** :
    *   **Déclin (Decay)**:
        *   `StrengthScore` décline vers 0 (multiplié par un facteur < 1).
        *   `TrustScore` décline vers 50 (point neutre).
    *   **Ajout/Retrait de Points**: La fonction `apply_scaled_score_change` est utilisée. Elle prend le score actuel (0-100), les points bruts à ajouter/retirer, et utilise `atan` pour calculer le changement effectif. Ce changement est proportionnel à "l'espace disponible" avant d'atteindre les bornes 0 ou 100.

Pour plus de détails techniques sur le calcul, voir la section "Mécanisme de Mise à Jour des Scores" plus bas.

## Overview

The Relationship System in La Serenissima is designed to quantify and track the dynamic connections between citizens. It establishes two primary metrics: `StrengthScore` and `TrustScore`, which evolve based on shared relevancies and direct interactions. These scores influence AI behavior, particularly in communication, and provide insights into the social fabric of Venice.

Relationships are always stored between two citizens, with `Citizen1` being alphabetically before `Citizen2` to ensure uniqueness.

## Data Structure (RELATIONSHIPS Table)

Each record in the `RELATIONSHIPS` table represents a unique bond between two citizens and contains the following key fields:

-   **`Citizen1`**: Text - The username of the first citizen (alphabetically).
-   **`Citizen2`**: Text - The username of the second citizen (alphabetically).
-   **`StrengthScore`**: Number (Float) - Score normalisé sur une échelle de 0 à 100. 0 indique une absence de force/pertinence, 100 indique une force maximale.
-   **`TrustScore`**: Number (Float) - Score normalisé sur une échelle de 0 à 100 qui quantifie le niveau de confiance. Un score de 50 est neutre.
-   **`LastInteraction`**: DateTime - Timestamp of the last time this relationship record was updated by the scoring script. (Heure de Venise)
-   **`QualifiedAt`**: DateTime - Timestamp of the last successful qualification by `qualifyRelationships.py`. (UTC)
-   **`Notes`**: Long Text - A comma-separated list of keywords indicating the sources that contributed to the scores (e.g., "Sources: proximity_relevancy, messages_interaction, loans_interaction").
-   **`Title`**: Text (Optional) - A descriptive title for the relationship (e.g., "Close Allies", "Business Partners"). Can be manually set or potentially by future systems.
-   **`Description`**: Long Text (Optional) - A more detailed description of the relationship.
-   **`Tier`**: Single Select (Optional) - A category for the relationship's overall level (e.g., "Tier 1", "Tier 2").
-   **`Status`**: Single Select (Optional) - Current status of the relationship (e.g., "Active", "Dormant", "Hostile").
-   **`CreatedAt`**: DateTime - Timestamp of when the relationship record was first created.

## Score Calculation (`backend/relationships/updateRelationshipStrengthScores.py`)

The `updateRelationshipStrengthScores.py` script runs daily to update both `StrengthScore` and `TrustScore` for all citizens.

### General Process:

1.  **Fetch Citizens**: The script retrieves all citizens.
2.  **Iterate per Citizen (Source Citizen)**: For each citizen:
    *   **Fetch Recent Relevancies**: It calls the `/api/relevancies` endpoint to get relevancies where the source citizen is `RelevantToCitizen`. These relevancies must have been created in the last 24 hours. Relevancies where `RelevantToCitizen` is "all" are excluded.
    *   **Fetch Existing Relationships**: It retrieves all existing relationship records involving the source citizen.
    *   **Application du Déclin**:
        *   `StrengthScore` existant (0-100) est multiplié par `RELATIONSHIP_STRENGTH_DECAY_FACTOR` (ex: 0.75), tendant vers 0.
        *   `TrustScore` existant (0-100) est ajusté pour tendre vers 50 (neutre) : `ScoreNeutre (50) + (ScoreActuel - ScoreNeutre) * RELATIONSHIP_TRUST_DECAY_FACTOR`.
    *   **Calcul des Ajouts de Points Bruts**:
        *   **StrengthScore**: Les "points bruts" de chaque pertinence récente sont collectés.
        *   **TrustScore**: Les "points bruts" des interactions directes sont calculés (voir section suivante).
    *   **Application des Points Bruts et Mise à Jour**:
        *   Les points bruts (positifs ou négatifs) sont ajoutés aux scores déclinés en utilisant la fonction `apply_scaled_score_change`. Cette fonction module l'impact des points bruts pour que le score s'approche asymptotiquement de 0 ou 100.
        *   Les nouveaux scores (0-100) sont écrits dans Airtable.
        *   Si aucune relation n'existe, une nouvelle est créée. Le `StrengthScore` initial commence à 0 et le `TrustScore` à 50, puis les premiers points bruts sont appliqués via `apply_scaled_score_change`.
3.  **Admin Notification**: A summary notification is sent to administrators detailing the number of citizens processed, relevancies fetched, and relationships updated/created.

### Mécanisme de Mise à Jour des Scores

Les scores sont stockés et lus sur une échelle de 0 à 100.

1.  **Lecture du Score Actuel (0-100)** : Le `StrengthScore` et `TrustScore` sont lus depuis Airtable.
    *   `StrengthScore` par défaut si inexistant : 0.0 (`DEFAULT_NORMALIZED_STRENGTH_SCORE`).
    *   `TrustScore` par défaut si inexistant : 50.0 (`DEFAULT_NORMALIZED_SCORE`).

2.  **Application du Déclin (Decay)** :
    *   Pour `StrengthScore`: `ScoreDécliné = ScoreActuel * RELATIONSHIP_STRENGTH_DECAY_FACTOR`. Le score est borné à 0.
    *   Pour `TrustScore`: `ScoreDécliné = PointNeutre (50) + (ScoreActuel - PointNeutre) * RELATIONSHIP_TRUST_DECAY_FACTOR`.

3.  **Calcul des Points Bruts d'Interaction/Pertinence**:
    *   Les points bruts sont déterminés par la logique métier (ex: +1.0 pour un message, score de pertinence, etc.).

4.  **Application des Points Bruts avec Échelle `atan`**:
    *   La fonction `apply_scaled_score_change(score_actuel, delta_brut, scale_factor, min_score, max_score)` est utilisée.
    *   `score_actuel` est le score après déclin.
    *   `delta_brut` sont les points bruts calculés à l'étape 3.
    *   `scale_factor` (ex: `RAW_POINT_SCALE_FACTOR = 0.1`) module l'impact des `delta_brut`.
    *   `min_score` et `max_score` sont typiquement 0 et 100.
    *   La fonction calcule un `increment_factor` (ou `decrement_factor`) basé sur `atan(delta_brut * scale_factor)`. Ce facteur (entre 0 et 1) est ensuite multiplié par "l'espace disponible" pour que le score change (`max_score - score_actuel` ou `score_actuel - min_score`).
    *   `NouveauScore = score_actuel + (espace_disponible * increment_factor)`.

5.  **Écriture en BDD** : Le `NouveauScore` (entre 0 et 100) est écrit dans Airtable.

Ce processus garantit que l'impact de l'ajout de points bruts diminue à mesure que le score s'approche de 0 ou 100.

### Interaction Contributions (Points Bruts)

The `_calculate_trust_score_contributions_from_interactions` function aggregates points from the following activities between two citizens:

*   **Messages**:
    *   Adds **+1.0** to `TrustScore` for each message sent between the two citizens in the last 24 hours (based on `MESSAGES.CreatedAt`).
    *   Logged in `Notes` as: `messages_interaction`.
*   **Active Loans**:
    *   Adds **`PrincipalAmount / 100,000`** to `TrustScore` for each loan between them where `LOANS.Status` is "active".
    *   Logged in `Notes` as: `loans_interaction`.
*   **Active Contracts (General)**:
    *   Adds **`(PricePerResource * TargetAmount) / 100`** to `TrustScore` for each contract where the two citizens are `Buyer` and `Seller` (or vice-versa) and `CONTRACTS.EndAt` is in the future.
    *   Logged in `Notes` as: `contracts_interaction`.
*   **Recent Transactions (General)**:
    *   Adds **`Price / 10,000`** to `TrustScore` for each transaction between them in the last 24 hours (based on `TRANSACTIONS.ExecutedAt`).
    *   Logged in `Notes` as: `transactions_interaction`.
*   **Activity-Based Interactions (New)**:
    *   Specific activities now directly influence `TrustScore` upon their successful completion or failure. The magnitude of change depends on the activity's nature and outcome.
    *   Examples:
        *   `deliver_resource_batch`: Successful delivery & payment increases trust between deliverer/recipient and payer/seller. Failures decrease it.
        *   `fetch_resource`: Successful fetch & payment increases trust between fetcher/buyer and buyer/seller. Failures decrease it.
        *   `fetch_for_logistics_client`: Successful service increases trust between porter/client and client/goods_seller & client/porter_guild. Failures decrease it.
        *   `construct_building`: Project completion significantly increases trust between worker/client. Progress offers minor increases.
        *   `eat_at_tavern`: Successful purchase increases trust between citizen/tavern_operator. Insufficient funds decrease it.
    *   Logged in `Notes` with specific tags like: `activity_delivery_success`, `activity_fetch_failure`, `activity_construction_milestone`, etc.
*   **Employee Fed (Employee to Employer)**:
    *   If Citizen A is an employee of Citizen B (Citizen B is the employer):
        *   Checks `CITIZENS.AteAt` for Citizen A (the employee).
        *   If `AteAt` is within the last 24 hours: **+2.0** to `TrustScore` (between A and B). Logged as `employee_fed`.
        *   Otherwise (or no `AteAt` record): **-15.0** to `TrustScore`. Logged as `employee_hungry` or `employee_hungry_no_record`.
*   **Employee Housed (Employer to Employee)**:
    *   If Citizen A is an employee of Citizen B (Citizen B is the employer):
        *   Checks if Citizen A (the employee) is listed as `Occupant` in any `BUILDINGS` record where `Category` is 'home'.
        *   If housed: **+3.0** to `TrustScore` (between A and B). Logged as `employee_housed`.
        *   Otherwise: **-20.0** to `TrustScore`. Logged as `employee_homeless`.
*   **Employee Paid (Employer to Employee)**:
    *   If Citizen A is an employee of Citizen B (Citizen B is the employer):
        *   Checks the `TRANSACTIONS` table for the most recent `wage_payment` from Citizen B (Seller/Payer) to Citizen A (Buyer/Recipient).
        *   If the `ExecutedAt` timestamp of this payment is within the last 24 hours and the `Price` (wage amount) was greater than 0: **+15.0** to `TrustScore`. Logged as `employee_paid_recently`.
        *   Otherwise (no recent payment, payment was 0, or no payment record found): **-30.0** to `TrustScore`. Logged as `employee_wage_issue_late_or_zero`, `employee_wage_issue_no_timestamp`, or `employee_wage_issue_none_found`.
*   **Public Welfare (Citizen with ConsiglioDeiDieci)**:
    *   This applies to the relationship between any citizen and "ConsiglioDeiDieci".
    *   **Hunger**: If the citizen's `CITIZENS.AteAt` timestamp is older than 24 hours (or missing).
    *   **Homelessness**: If the citizen is not listed as `Occupant` in any `BUILDINGS` record where `Category` is 'home'.
    *   Trust Score Adjustments:
        *   If Hungry AND Homeless: **-25.0** to `TrustScore`. Logged as `public_welfare_suffering`.
        *   If Hungry (but not homeless): **-10.0** to `TrustScore`. Logged as `public_welfare_hungry`.
        *   If Homeless (but not hungry): **-15.0** to `TrustScore`. Logged as `public_welfare_homeless`.

### `Notes` Field

The `Notes` field is automatically generated and updated. It aims to provide a transparent audit trail of what factors are influencing the relationship scores.
It typically looks like: `Sources: relevancy_type_A, relevancy_type_B, messages_interaction, loans_interaction`
The list of sources is sorted alphabetically.

## API Endpoints

### `GET /api/relationships`

This endpoint is used to fetch relationship data.

*   **No parameters**:
    *   Returns the top 100 strongest relationships globally, sorted by `StrengthScore` in descending order.
*   **With `citizen1` and `citizen2` query parameters**:
    *   Returns the specific relationship record between the two named citizens.
    *   The endpoint handles determining the correct alphabetical order for `Citizen1` and `Citizen2` before querying Airtable.
    *   If no relationship exists, it returns `null` for the relationship object.

**Response Fields (for each relationship object):**
`id`, `citizen1`, `citizen2`, `strengthScore` (0-100), `title`, `description`, `tier`, `trustScore` (0-100), `status`, `lastInteraction`, `notes`, `createdAt`.
Les scores en base de données sont directement sur l'échelle 0-100.

## AI Usage

The relationship scores, `TrustScore` (0-100) and the combined (`StrengthScore` (0-100) + `TrustScore` (0-100)), are used by AI systems:

1.  **`backend/ais/answertomessages.py`**:
    *   When an AI citizen generates a response to a message, the script fetches contextual data including the relationship record with the sender.
    *   This data (`StrengthScore`, `TrustScore`, `Notes`, etc.) is passed to the Kinos Engine API to help generate a more contextually appropriate and personalized response.

2.  **`backend/ais/messagesInitiatives.py`**:
    *   This script allows AI citizens to proactively initiate conversations.
    *   It fetches the AI's top relationships based on a combined score (`StrengthScore + TrustScore`).
    *   The probability of an AI initiating a message with another citizen is proportional to this combined score relative to their highest combined score.
    *   If the target is also an AI, this probability is halved.
    *   The relationship data is also used to provide context to the Kinos Engine for generating the initiative message.

## Scheduling

The `updateRelationshipStrengthScores.py` script is intended to be run daily as part of the scheduled tasks, ensuring that relationship dynamics are regularly updated.
The `messagesInitiatives.py` script also runs on a schedule (e.g., multiple times a day) to allow AIs to start conversations.
The `answertomessages.py` script runs frequently (e.g., every few hours) to ensure timely AI responses.
