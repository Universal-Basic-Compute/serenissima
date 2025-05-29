# Relationship System Documentation

## Overview

The Relationship System in La Serenissima is designed to quantify and track the dynamic connections between citizens. It establishes two primary metrics: `StrengthScore` and `TrustScore`, which evolve based on shared relevancies and direct interactions. These scores influence AI behavior, particularly in communication, and provide insights into the social fabric of Venice.

Relationships are always stored between two citizens, with `Citizen1` being alphabetically before `Citizen2` to ensure uniqueness.

## Data Structure (RELATIONSHIPS Table)

Each record in the `RELATIONSHIPS` table represents a unique bond between two citizens and contains the following key fields:

-   **`Citizen1`**: Text - The username of the first citizen (alphabetically).
-   **`Citizen2`**: Text - The username of the second citizen (alphabetically).
-   **`StrengthScore`**: Number (Float) - Quantifies the relationship's strength based on shared relevancies and common interests.
-   **`TrustScore`**: Number (Float) - Quantifies the level of trust built through direct positive interactions.
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
    *   **Apply Decay**:
        *   Existing `StrengthScore` is decayed by 25% (multiplied by 0.75).
        *   Existing `TrustScore` is decayed by 25% (multiplied by 0.75).
    *   **Calculate StrengthScore Additions**:
        *   The `score` from each recent relevancy is added to the decayed `StrengthScore` for the relationship between the source citizen and the `TargetCitizen`(s) of the relevancy.
        *   The `type` of the relevancy (e.g., `proximity`, `guild_member`) is noted for the `Notes` field.
    *   **Calculate TrustScore Additions**:
        *   The script calls an internal helper function `_calculate_trust_score_contributions_from_interactions` for the source citizen and each target citizen they have a relevancy with (or an existing relationship).
        *   This function calculates new trust points based on direct interactions (see "Interaction Contributions to TrustScore" below).
        *   These new points are added to the decayed `TrustScore`.
        *   The types of interactions (e.g., `messages_interaction`) are noted for the `Notes` field.
    *   **Update/Create Relationship Record**:
        *   If a relationship record exists, it's updated with the new `StrengthScore`, `TrustScore`, `LastInteraction` (current timestamp), and consolidated `Notes`.
        *   If no record exists, a new one is created with `Citizen1` and `Citizen2` set alphabetically, the calculated scores, `LastInteraction`, and `Notes`.
3.  **Admin Notification**: A summary notification is sent to administrators detailing the number of citizens processed, relevancies fetched, and relationships updated/created.

### Interaction Contributions to `TrustScore`

The `_calculate_trust_score_contributions_from_interactions` function aggregates points from the following activities between two citizens:

*   **Messages**:
    *   Adds **+1.0** to `TrustScore` for each message sent between the two citizens in the last 24 hours (based on `MESSAGES.CreatedAt`).
    *   Logged in `Notes` as: `messages_interaction`.
*   **Active Loans**:
    *   Adds **`PrincipalAmount / 100,000`** to `TrustScore` for each loan between them where `LOANS.Status` is "active".
    *   Logged in `Notes` as: `loans_interaction`.
*   **Active Contracts**:
    *   Adds **`(PricePerResource * TargetAmount) / 100`** to `TrustScore` for each contract where the two citizens are `Buyer` and `Seller` (or vice-versa) and `CONTRACTS.EndAt` is in the future.
    *   Logged in `Notes` as: `contracts_interaction`.
*   **Recent Transactions**:
    *   Adds **`Price / 10,000`** to `TrustScore` for each transaction between them in the last 24 hours (based on `TRANSACTIONS.ExecutedAt`).
    *   Logged in `Notes` as: `transactions_interaction`.
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
`id`, `citizen1`, `citizen2`, `strengthScore`, `title`, `description`, `tier`, `trustScore`, `status`, `lastInteraction`, `notes`, `createdAt`.

## AI Usage

The relationship scores, particularly `TrustScore` and the combined `StrengthScore + TrustScore`, are used by AI systems:

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
