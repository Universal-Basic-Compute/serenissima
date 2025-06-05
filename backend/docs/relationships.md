# Relationship System Documentation

## Explication Simplifiée du Scoring

Le système de scoring pour les relations (`StrengthScore` et `TrustScore`) fonctionne comme suit :

1.  **Scores Visibles** :
    *   **`TrustScore` (0-100)**:
        *   **0**: Méfiance totale.
        *   **50**: Neutre.
        *   **100**: Confiance totale.
    *   **`StrengthScore` (Interprété sur 0-100)**:
        *   Le score `StrengthScore` est stocké en interne sur une base qui se traduit par une échelle normalisée de [50-100] (où 50 est une force latente de 0, et 100 est une force latente maximale).
        *   Pour l'utilisation et l'affichage, ce score [50-100] est souvent remappé linéairement sur une échelle de **0 à 100** :
            *   Un score interne de **50** (force latente nulle) devient **0** (force affichée nulle).
            *   Un score interne de **75** devient **50** (force affichée moyenne).
            *   Un score interne de **100** (force latente maximale) devient **100** (force affichée maximale).
        *   La formule de remappage est : `StrengthScoreAffiché = (StrengthScoreInterne - 50) * 2`.

2.  **Impact Dégressif** : Pour les deux scores, l'effet de chaque point "latent" ajouté/retiré diminue à mesure que le score normalisé (interne) s'approche de ses extrêmes. Il est plus facile d'influencer un score proche du point de départ (latent 0 / normalisé 50) qu'un score déjà très élevé ou très bas.

3.  **Mécanisme Interne** : Pour cela, le système convertit le score (0-100) en une valeur "latente", applique les changements à cette valeur, puis la reconvertit en score (0-100). Cette double conversion (utilisant `atan` et `tan`) crée l'effet d'impact dégressif.

Pour plus de détails techniques sur le calcul, voir la section "Mécanisme de Mise à Jour des Scores (0-100 via Espace Latent)" plus bas.

## Overview

The Relationship System in La Serenissima is designed to quantify and track the dynamic connections between citizens. It establishes two primary metrics: `StrengthScore` and `TrustScore`, which evolve based on shared relevancies and direct interactions. These scores influence AI behavior, particularly in communication, and provide insights into the social fabric of Venice.

Relationships are always stored between two citizens, with `Citizen1` being alphabetically before `Citizen2` to ensure uniqueness.

## Data Structure (RELATIONSHIPS Table)

Each record in the `RELATIONSHIPS` table represents a unique bond between two citizens and contains the following key fields:

-   **`Citizen1`**: Text - The username of the first citizen (alphabetically).
-   **`Citizen2`**: Text - The username of the second citizen (alphabetically).
-   **`StrengthScore`**: Number (Float) - Score normalisé interne sur une échelle de 50 à 100. Ce score est souvent remappé en 0-100 pour l'affichage/utilisation (où 50 interne = 0 affiché, 100 interne = 100 affiché).
-   **`TrustScore`**: Number (Float) - Score normalisé sur une échelle de 0 à 100 qui quantifie le niveau de confiance. Un score de 50 est neutre.
-   **`LastInteraction`**: DateTime - Timestamp of the last time this relationship record was updated by the scoring script.
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
    *   **Déclin** : Le `StrengthScore` et le `TrustScore` actuels (0-100) sont d'abord convertis en un score "latent". Ce score latent est ensuite multiplié par un facteur de déclin (ex: 0.75 pour un déclin de 25%).
    *   **Calcul des Ajouts aux Scores Latents** :
        *   **StrengthScore**: Les "points bruts" de chaque pertinence récente sont ajoutés au `StrengthScore` latent (déjà décliné).
        *   **TrustScore**: Les "points bruts" calculés à partir des interactions directes (voir section suivante) sont ajoutés au `TrustScore` latent (déjà décliné).
    *   **Reconversion et Mise à Jour** :
        *   Les nouveaux scores latents (après déclin et ajouts) sont reconvertis en scores normalisés (0-100) en utilisant une fonction `atan`.
        *   Ces scores normalisés sont ensuite écrits dans Airtable.
        *   Si aucune relation n'existe, une nouvelle est créée. Le `StrengthScore` et `TrustScore` initiaux (0-100) sont calculés en convertissant les premiers points bruts (de pertinence ou d'interaction) via l'espace latent. Si aucun point n'est ajouté, ils commencent à 50 (neutre).
3.  **Admin Notification**: A summary notification is sent to administrators detailing the number of citizens processed, relevancies fetched, and relationships updated/created.

### Mécanisme de Mise à Jour des Scores (0-100 via Espace Latent)

Pour obtenir l'effet de rendement décroissant souhaité tout en stockant des scores sur une échelle de 0 à 100, le système utilise un espace de calcul "latent" :

1.  **Lecture du Score (0-100)** : Le score actuel (`StrengthScore` ou `TrustScore`) est lu depuis Airtable.
2.  **Conversion en Score Latent** : Ce score (0-100) est transformé en un score latent en utilisant l'inverse de la fonction `atan` :
    `ScoreLatent = tan( ((ScoreNormalisé / 50) - 1) * (pi/2) ) / k`
    Où `k` est le `LATENT_SCORE_SCALE_FACTOR` (ex: 0.1). Un score normalisé de 50 devient un score latent de 0.
3.  **Application du Déclin au Score Latent** : Le score latent est multiplié par le `DECAY_FACTOR` (ex: 0.75).
4.  **Ajout de Points Bruts au Score Latent** : Les "points bruts" (ex: `+1.0` pour une interaction positive) sont ajoutés à ce score latent décliné.
5.  **Reconversion en Score Normalisé (0-100)** : Le nouveau score latent est reconverti en une échelle de 0 à 100 pour stockage :
    `NouveauScoreNormalisé = ( (atan(NouveauScoreLatent * k) / (pi/2)) + 1 ) * 50`
6.  **Écriture en BDD** : Ce `NouveauScoreNormalisé` est écrit dans Airtable.

Ce processus garantit que l'impact de l'ajout de points bruts diminue à mesure que le score normalisé s'approche de 0 ou 100.

### Interaction Contributions (Points Bruts pour Score Latent)

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
