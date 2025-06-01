# Citizen Activities in La Serenissima

This document explains the citizen activity system that simulates the daily lives of citizens in Renaissance Venice.

## Overview

The activity system tracks what citizens are doing at any given time, creating a living simulation of Venetian life. Both AI and human citizens can engage in various activities. This system now encompasses not only long-duration tasks (like work or rest) but also strategic "actions" (like bidding on land or sending a message), which are now modeled as activities with corresponding records in the `ACTIVITIES` table. This unified approach allows for more complex, multi-step processes even for seemingly discrete actions.

Social class influences activity patterns:
-   **Nobili**: Do not seek "jobs" as `Occupant`. Their daytime activities revolve around managing their affairs, political engagements, social interactions, and leisure, including shopping. This makes them active consumers and potential patrons for various businesses. Their strategic "actions" (now activities) reflect their high-level management.
-   **Cittadini, Popolani, Facchini**: Engage in work, rest, and other daily life activities, including strategic actions modeled as activities.
-   **Forestieri**: Primarily engage in visitor-specific activities like lodging at inns and eventually leaving Venice. Their "actions" might include specific trade interactions.

Core activity categories include:

- **Repos (`rest`)**: Périodes de sommeil et de repos.
- **Travail (`production`, `fetch_resource`, etc.)**: Activités productives.
- **Consommation/Activités de Loisirs**: Repas, achats, socialisation.
- **Voyage (`goto_home`, `goto_work`, `goto_inn`, etc.)**: Déplacement entre les lieux.
- **Actions Stratégiques (maintenant modélisées comme des activités)**: Des `activityType` comme `bid_on_land`, `send_message`, `manage_public_sell_contract`, etc. Celles-ci sont initiées via `POST /api/activities/try-create`. Le moteur Python peut alors créer une ou plusieurs activités séquentielles. Par exemple, un `activityType: "bid_on_land"` pourrait d'abord générer une activité `goto_citizen` (pour rencontrer le vendeur ou l'officiel), et seulement après la complétion de celle-ci, une autre activité (ou une logique directe) pour finaliser l'enchère. Chaque étape pertinente aura un enregistrement dans la table `ACTIVITIES`.

Les activités principales (liste non exhaustive, incluant maintenant des "actions") :
- **Production**: Un citoyen à son lieu de travail transforme des ressources.
- **Fetch Resource**: Un citoyen se déplace pour récupérer des ressources.
- **Activités de Repas (`eat_from_inventory`, `eat_at_home`, `eat_at_tavern`)**.
- **Idle**: Attente ou activité non spécifique.
- **`bid_on_land` (en tant qu'activité)**: Peut impliquer un déplacement (`goto_citizen` ou `goto_notary`), suivi par la logique de l'enchère.
- **`send_message` (en tant qu'activité)**: Pourrait impliquer une courte activité de "rédaction" ou être traitée rapidement, mais aura toujours un enregistrement.
- **Business Activity & `CheckedAt` Updates**: La gestion active d'une entreprise par son `RunBy` met à jour `CheckedAt`.
- **`goto_construction_site`**, **`deliver_construction_materials`**, **`construct_building`**: Activités liées à la construction.
- **`leave_venice`**: Un Forestiero quitte Venise.

Activities are managed by the `createActivities.py` script (pour les activités routinières générées par le moteur) and initiated by AI agents via `POST /api/activities/try-create` (pour les activités et actions décidées par l'IA). Ces systèmes sont maintenant responsables de la création de **chaînes complètes d'activités** si nécessaire. Par exemple, une demande pour "manger à la maison" alors que le citoyen n'y est pas générera une activité `goto_home` suivie d'une activité `eat_at_home`. Tous ces enregistrements sont stockés dans la table `ACTIVITIES` et sont ensuite traités individuellement par `processActivities.py` lorsque leur `EndDate` est atteinte. Ce système s'applique de manière égale aux citoyens IA et humains.

### Unified Citizen Activity Model

The activity system is a core component of La Serenissima's unified citizen model, where AI and human citizens are treated as equal participants in the game world:

1. **Identical Activity Types**: Both AI and human citizens engage in the same types of activities
2. **Shared Scheduling Logic**: The same scheduling algorithms determine when activities occur
3. **Common Visualization**: Activities are displayed the same way on the map for all citizens
4. **Equal Time Constraints**: The same time-based rules apply to activity duration and transitions
5. **Unified Pathfinding**: All citizens use the same navigation system for movement

## Activity Types

### `deliver_resource_batch` (Galley Piloting)
When a merchant galley is ready to depart from a foreign port (simulated by `createimportactivities.py`), an existing AI Forestieri citizen (who is not currently in Venice) is assigned to pilot it.
- **Citizen**: An existing AI Forestieri. Their `InVenice` status is set to `True`.
- **Type**: `deliver_resource_batch`
- **ToBuilding**: The `BuildingId` of the temporary `merchant_galley` building created at a Venetian public dock.
- **Resources**: JSON array of resources and amounts being imported.
- **TransportMode**: `merchant_galley`
- **Notes**: Details the resources and original contract IDs.
- **Status**: `created`
- *Processor (executes upon arrival at the Venetian dock, i.e., when the `merchant_galley` `IsConstructed` becomes `True`)*:
    - The `merchant_galley` building becomes "active" in Venice.
    - The resources listed in the activity are considered to be in the galley, owned by the merchant who owns the galley (a wealthy Forestieri AI).
    - `createActivities.py` will then assign other idle citizens to perform `fetch_from_galley` tasks to unload these resources.
- *Processor (Citizen delivering to a final building, NOT a galley)*:
    - Resources are removed from the citizen's inventory.
    - Resources are added to the `ToBuilding`'s inventory.
    - Ownership of resources in `ToBuilding`:
        - If `ToBuilding` type has `commercialStorage: true` AND has a `RunBy` (operator): resources are owned by `RunBy`.
        - Else: resources are owned by the `Buyer` of the original contract associated with the delivery.
    - Financial transactions occur between the `Buyer` and `Seller` of the original contract.

### Rest

Rest activities occur during nighttime hours (10 PM to 6 AM Venice time). When night falls, citizens who are at home will automatically begin resting. Citizens who are not at home will attempt to return home to rest.

Rest activities include:
- Sleeping
- Evening meals
- Family time

### Travel (goto_home, goto_work, goto_inn)

When citizens need to move from one location to another, they engage in travel activities. These include:

- **`goto_home`**: Occurs when:
    - Night is approaching and citizens need to return home.
    - Citizens have been assigned new housing and need to relocate.
    - *Processor*: Upon arrival, any resources the citizen owns and is carrying are deposited into their home if space permits.

- **`goto_work`**: Occurs when:
    - It's daytime and a citizen needs to travel to their assigned workplace.
    - *Créateur*: Si le citoyen est à la maison et a de la nourriture disponible, il peut en prendre une unité pour son inventaire avant de partir.
    - *Processor*: Upon arrival:
        - If the workplace type has `commercialStorage: true`: The citizen can deposit any resources they are carrying. These resources become owned by the workplace operator (`RunBy`) once deposited.
        - If the workplace type has `commercialStorage: false`: The citizen can only deposit resources they are carrying if those resources are already owned by the workplace operator (`RunBy`).
        - Deposit only occurs if there is sufficient storage space in the workplace.

- **`goto_inn`**: Occurs when:
    - It's nighttime and a citizen marked as a visitor (with a `HomeCity` value) needs to find lodging.
    - *Processor*: Currently no specific processor, but the citizen arrives at the inn.

- Night is approaching and citizens need to return home
- Citizens have been assigned new housing and need to relocate

Travel activities use the transport pathfinding system to create realistic routes through Venice, including:
- Walking paths through streets and over bridges
- Gondola routes through canals

### Work

Citizens with jobs spend their daytime hours working at their assigned businesses. Work activities are created when:
- A citizen has been assigned to a business
- It's daytime and the citizen is not engaged in other activities

### Idle

When citizens have no specific task to perform but are not resting, they enter an idle state. Idle activities typically last for 1 hour before the system attempts to assign a new activity.

## Technical Implementation

### Activity Record Structure

Each activity is stored in the ACTIVITIES table with the following fields:

- **ActivityId**: Unique identifier for the activity (e.g., `goto_work_ctz_..._timestamp`)
- **Type**: The type of activity (e.g., `rest`, `goto_home`, `goto_work`, `goto_inn`, `idle`, `production`, `fetch_resource`, `deliver_resource_batch`, `leave_venice`, `deliver_construction_materials`, `construct_building`, `goto_construction_site`)
- **Citizen**: The `Username` of the citizen performing the activity.
- **FromBuilding**: Airtable Record ID of the starting location (for travel/production activities). Pour `construct_building`, c'est le site de construction. Pour `goto_construction_site`, peut être null si le départ est la position actuelle du citoyen.
- **ToBuilding**: Destination (for travel activities)
- **CreatedAt**: When the activity was created
- **StartDate**: When the activity begins
- **EndDate**: When the activity ends
- **Path**: JSON array of coordinates (for travel activities)
- **Notes**: Additional information about the activity

### Activity Creation Process

Le script `createActivities.py` (via `citizen_general_activities.py`) identifie les citoyens sans activité en cours et tente de leur assigner une nouvelle **séquence d'activités**. La logique de décision principale est encapsulée dans `citizen_general_activities.py` et prend en compte :
1.  L'heure actuelle à Venise.
2.  La classe sociale du citoyen, qui détermine ses plages horaires pour le repos, le travail et les loisirs/consommation.
    *   **Facchini (Journaliers)**: Repos: 21h-5h; Travail: 5h-12h, 13h-19h; Loisirs: 12h-13h, 19h-21h.
    *   **Popolani (Artisans)**: Repos: 22h-6h; Travail: 6h-12h, 14h-18h; Loisirs: 12h-14h, 18h-22h.
    *   **Cittadini (Marchands)**: Repos: 23h-6h; Travail: 7h-12h, 14h-17h; Loisirs: 6h-7h, 12h-14h, 17h-23h.
    *   **Nobili (Nobles)**: Repos: 0h-8h; Loisirs/Gestion: 8h-0h (le reste du temps).
    *   **Forestieri (Marchands Étrangers)**: Repos: 23h-5h; Travail/Commerce: 6h-12h, 13h-20h; Loisirs: 5h-6h, 12h-13h, 20h-23h.
3.  Les besoins urgents du citoyen (faim, inventaire plein).
4.  Son statut (résident, visiteur, sans-abri, employé, etc.).
5.  Sa localisation actuelle et la disponibilité de lieux pertinents (domicile, lieu de travail, auberges, magasins).

**Priorités générales (illustratives, la logique exacte est dans le code) :**
*   **Urgence absolue** : Départ de Venise pour les Forestieri si conditions remplies.
*   **Besoins physiologiques** : Manger (depuis inventaire, domicile, taverne/magasin), généralement pendant les périodes de loisirs. Pêche d'urgence pour les Facchini affamés.
*   **Repos** : Si c'est l'heure de repos pour sa classe, le citoyen cherchera à dormir (domicile ou auberge).
*   **Travail** : Si c'est l'heure de travail :
    *   Déposer un inventaire plein au travail.
    *   Se rendre au travail s'il n'y est pas.
    *   Une fois au travail : tâches de construction, production, réapprovisionnement, pêche (Facchini), gestion (Cittadini/Forestieri).
*   **Loisirs/Consommation** : Si c'est l'heure des loisirs :
    *   Shopping (nourriture ou autres biens).
    *   Autres activités de loisirs (non encore implémentées en détail).
*   **Gestion d'entreprise** (pour les `RunBy`) : Vérifier le statut de l'entreprise si cela n'a pas été fait récemment, pendant les heures actives.
*   **Inactivité (`idle`)** : Si aucune autre activité n'est appropriée ou possible.

### Pathfinding for Travel Activities

Travel activities use the TransportService to calculate realistic paths:

1. Determine the start point (citizen's current location)
2. Determine the end point (destination building)
3. Use the transport API to find the optimal path
4. Store the path coordinates in the activity record
5. Calculate the expected arrival time based on distance and travel mode

### Activity Visualization

The frontend can visualize citizen activities by:
- Displaying citizens at their current locations
- Animating movement along travel paths
- Showing appropriate icons for different activity types
- Providing activity information in the citizen detail view

## AI and Human Citizen Integration

The activity system treats AI and human citizens identically:

1. **Unified Activity Model**: Both AI and human citizens use the same activity data structure and follow the same rules
2. **Shared Visualization**: All citizens appear on the map and can be observed performing their activities
3. **Equal Scheduling**: The activity creation system schedules activities for all citizens regardless of whether they are AI or human
4. **Economic Impact**: Activities for both AI and human citizens have the same economic effects (e.g., working generates income)
5. **Interaction Opportunities**: Human players can encounter and interact with AI citizens performing their activities

The key difference is that AI citizens have their activities automatically determined by the system, while human players can potentially override certain activities through direct gameplay actions. This integration creates a seamless world where AI and human citizens coexist and follow the same daily patterns.

## Integration with Other Systems

The activity system integrates with several other game systems:

### Housing System

- When citizens are assigned new housing, they need to travel to their new homes
- Housing quality affects rest effectiveness
- Housing location affects travel times to work and other destinations

### Employment System

- Citizens travel to their workplaces during work hours
- Work activities generate income for businesses
- Job locations affect citizens' daily travel patterns

### Time System

- Activities are scheduled based on the in-game time
- Day/night cycle affects which activities are appropriate
- Activity durations are calculated based on realistic timeframes

## Future Enhancements

Planned enhancements to the activity system include:

1. **Social Activities**: Citizens visiting friends or attending social gatherings
2. **Shopping**: Citizens visiting contracts to purchase goods
3. **Religious Activities**: Church attendance and religious ceremonies
4. **Entertainment**: Visiting taverns, theaters, and other entertainment venues
5. **Seasonal Activities**: Special activities during festivals and holidays

## Troubleshooting

Common issues with the activity system:

1. **Citizens stuck in idle**: May indicate pathfinding failures or missing home/work assignments
2. **Overlapping activities**: Can occur if the activity creation script runs before previous activities complete
3. **Invalid paths**: May result from changes to the map or building data
4. **Missing activities**: Can occur if the activity creation script fails to run on schedule

To resolve these issues, check the activity creation logs and ensure all related systems (housing, employment, transport) are functioning correctly.

## API-Driven Activity Creation

In addition to the engine-driven activity creation (`createActivities.py`), activities can also be created directly via the `POST /api/actions/create-activity` endpoint. This method is primarily intended for AI agents (like those managed by `autonomouslyRun.py` in unguided mode) or other external systems that require precise control over activity generation.

### Process:

1.  **Client-Side Decision**: The client (e.g., Kinos AI) determines the full details of the activity to be created. This includes:
    *   `citizenUsername`: The target citizen.
    *   `activityType`: The specific type of activity.
    *   `title`: A concise title for the activity.
    *   `description`: A brief description of what the activity entails.
    *   `thought`: A first-person narrative from the citizen about this activity.
    *   `activityDetails`: A JSON object containing all necessary parameters for that activity type.
        *   For travel-related activities (e.g., `goto_work`, `goto_home`, `fetch_resource` from a specific building), the client should provide `toBuildingId` and `fromBuildingId` (if applicable) within `activityDetails`. The `/api/actions/create-activity` endpoint (si utilisé pour une activité de voyage unique) appellera alors en interne `/api/transport` pour déterminer le chemin et la durée.
    *   `notes` (optional): Internal notes or non-displayed information.
2.  **API Request**: The client sends a POST request to `/api/actions/create-activity` with the composed payload for a single activity.
3.  **Server Validation & Pathfinding**: The API endpoint validates the payload. If it's a travel activity requiring pathfinding between specified buildings, the server attempts to find a path. If pathfinding fails, an error is returned.
4.  **Airtable Record Creation**: If validation and any necessary internal pathfinding succeed, a new activity record is created in the `ACTIVITIES` table with `Status: "created"`. The `Path`, `StartDate`, and `EndDate` fields are populated based on the pathfinding results. `Title`, `Description`, `Thought`, and `Notes` are also saved.
5.  **Engine Processing**: The standard `processActivities.py` script will eventually pick up this "created" activity when its `EndDate` is reached and execute its corresponding processor logic to finalize its effects. Il ne créera pas d'activité de suivi.

### Use Cases:

-   **Unguided AI**: Allows AI agents to have fine-grained control over their actions, enabling more complex or emergent behaviors.
-   **External Tools**: Could allow other tools or game masters to inject specific activities into the simulation.
-   **Player-Initiated Complex Actions (Future)**: Could potentially be used by the UI to initiate complex, multi-step actions that are best defined as a specific activity.

### Utility Endpoint: `POST /api/try-read`

To simplify common data retrieval tasks for AI agents, a utility endpoint `POST /api/try-read` is available. This endpoint allows an AI to request predefined GET operations using a simple JSON payload.

**Request Body Example:**
```json
{
  "requestType": "get_my_profile",
  "parameters": { "username": "NLR" }
}
```

**Supported `requestType` values include:**
`get_my_profile`, `get_my_lands`, `get_my_buildings`, `get_my_inventory`, `get_my_active_sell_contracts`, `get_my_active_import_contracts`, `get_my_problems`, `get_my_opportunities`, `get_my_latest_activity`, `get_lands_for_sale`, `get_building_types`, `get_resource_types`, `get_public_builders`, `get_stocked_public_sell_contracts`, `get_global_thoughts`, `get_citizen_thoughts`, `get_all_guilds`, `get_active_decrees`, `get_data_package`, `get_building_details`, `get_building_resources`, `get_land_details`, `get_problem_details`.

Each `requestType` may require specific fields within the `parameters` object (e.g., `username`, `buildingId`). Refer to the main API Reference for details on each underlying GET request.

This endpoint internally calls the relevant GET API and returns its response, wrapped in a success/error structure. It helps abstract away the specific URL construction and parameter formatting for common queries.

### Considerations:

-   The client (AI) is responsible for providing correct building IDs for travel when using `POST /api/actions/create-activity`. The server handles the pathfinding.
-   This method bypasses the prioritized decision logic of `citizen_general_activities.py`.
-   Care must be taken to avoid conflicts if both engine-driven and API-driven activity creation are active for the same citizen.

Refer to the API Reference (`components/Documentation/ApiReference.tsx`) for the detailed payload structure of the `POST /api/actions/create-activity` endpoint (for direct creation of a single activity when all details are known) and `POST /api/activities/try-create` (for AI-initiated endeavors where the engine will build the necessary activity chain).

## API-Driven Activity Creation

In addition to the engine-driven activity creation (`createActivities.py`), activities can also be created directly via the `POST /api/actions/create-activity` endpoint. This method is primarily intended for AI agents (like those managed by `autonomouslyRun.py` in unguided mode) or other external systems that require precise control over activity generation.

### Process:

1.  **Client-Side Decision**: The client (e.g., Kinos AI) determines the full details of the activity to be created. This includes:
    *   `citizenUsername`: The target citizen.
    *   `activityType`: The specific type of activity.
    *   `title`: A concise title for the activity.
    *   `description`: A brief description of what the activity entails.
    *   `thought`: A first-person narrative from the citizen about this activity.
    *   `activityDetails`: A JSON object containing all necessary parameters for that activity type.
        *   For travel-related activities (e.g., `goto_work`, `goto_home`, `fetch_resource` from a specific building), the client should provide `toBuildingId` and `fromBuildingId` (if applicable) within `activityDetails`. The `/api/actions/create-activity` endpoint will then internally call `/api/transport` to determine the path and timing. The client no longer needs to provide `pathData`.
    *   `notes` (optional): Internal notes or non-displayed information.
2.  **API Request**: The client sends a POST request to `/api/actions/create-activity` with the composed payload.
3.  **Server Validation & Pathfinding**: The API endpoint validates the payload. If it's a travel activity requiring pathfinding between specified buildings, the server attempts to find a path. If pathfinding fails, an error is returned.
4.  **Airtable Record Creation**: If validation and any necessary internal pathfinding succeed, a new activity record is created in the `ACTIVITIES` table with `Status: "created"`. The `Path`, `StartDate`, and `EndDate` fields are populated based on the pathfinding results. `Title`, `Description`, `Thought`, and `Notes` are also saved.
5.  **Engine Processing**: The standard `processActivities.py` script will eventually pick up this "created" activity and execute its corresponding processor logic.

### Use Cases:

-   **Unguided AI**: Allows AI agents to have fine-grained control over their actions, enabling more complex or emergent behaviors.
-   **External Tools**: Could allow other tools or game masters to inject specific activities into the simulation.
-   **Player-Initiated Complex Actions (Future)**: Could potentially be used by the UI to initiate complex, multi-step actions that are best defined as a specific activity.

### Considerations:

-   The client (AI) is responsible for providing correct building IDs for travel. The server handles the pathfinding.
-   This method bypasses the prioritized decision logic of `citizen_general_activities.py`.
-   Care must be taken to avoid conflicts if both engine-driven and API-driven activity creation are active for the same citizen.

Refer to the API Reference (`components/Documentation/ApiReference.tsx`) for the detailed payload structure of the `POST /api/actions/create-activity` endpoint.

## API-Driven Activity Creation

In addition to the engine-driven activity creation (`createActivities.py`), activities can also be created directly via the `POST /api/actions/create-activity` endpoint. This method is primarily intended for AI agents (like those managed by `autonomouslyRun.py` in unguided mode) or other external systems that require precise control over activity generation.

### Process:

1.  **Client-Side Decision**: The client (e.g., Kinos AI) determines the full details of the activity to be created. This includes:
    *   `citizenUsername`: The target citizen.
    *   `activityType`: The specific type of activity.
    *   `activityDetails`: A JSON object containing all necessary parameters for that activity type.
        *   For travel-related activities (e.g., `goto_work`, `goto_home`, `fetch_resource` from a specific building), the client should provide `toBuildingId` and `fromBuildingId` (if applicable) within `activityDetails`. The `/api/actions/create-activity` endpoint will then internally call `/api/transport` to determine the path and timing. The client no longer needs to provide `pathData`.
2.  **API Request**: The client sends a POST request to `/api/actions/create-activity` with the composed payload.
3.  **Server Validation & Pathfinding**: The API endpoint validates the payload. If it's a travel activity requiring pathfinding between specified buildings, the server attempts to find a path. If pathfinding fails, an error is returned.
4.  **Airtable Record Creation**: If validation and any necessary internal pathfinding succeed, a new activity record is created in the `ACTIVITIES` table with `Status: "created"`. The `Path`, `StartDate`, and `EndDate` fields are populated based on the pathfinding results.
5.  **Engine Processing**: The standard `processActivities.py` script will eventually pick up this "created" activity and execute its corresponding processor logic.

### Use Cases:

-   **Unguided AI**: Allows AI agents to have fine-grained control over their actions, enabling more complex or emergent behaviors.
-   **External Tools**: Could allow other tools or game masters to inject specific activities into the simulation.
-   **Player-Initiated Complex Actions (Future)**: Could potentially be used by the UI to initiate complex, multi-step actions that are best defined as a specific activity.

### Considerations:

-   The client (AI) is responsible for providing correct building IDs for travel. The server handles the pathfinding.
-   This method bypasses the prioritized decision logic of `citizen_general_activities.py`.
-   Care must be taken to avoid conflicts if both engine-driven and API-driven activity creation are active for the same citizen.

Refer to the API Reference (`components/Documentation/ApiReference.tsx`) for the detailed payload structure of the `POST /api/actions/create-activity` endpoint.
