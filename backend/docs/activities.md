# Citizen Activities in La Serenissima

This document explains the citizen activity system that simulates the daily lives of citizens in Renaissance Venice.

## Overview

The activity system tracks what citizens are doing at any given time, creating a living simulation of Venetian life. Both AI and human citizens can engage in various activities. While the core mechanics apply to all, social class influences activity patterns:
-   **Nobili**: Do not seek "jobs" as `Occupant`. Their daytime activities revolve around managing their affairs, political engagements, social interactions, and leisure, including shopping. This makes them active consumers and potential patrons for various businesses.
-   **Cittadini, Popolani, Facchini**: Engage in work, rest, and other daily life activities as described below.
-   **Forestieri**: Primarily engage in visitor-specific activities like lodging at inns and eventually leaving Venice.

Core activities include:

- **Repos (`rest`)**: Périodes de sommeil et de repos, généralement au domicile du citoyen ou dans une auberge pour les visiteurs. Les horaires varient considérablement selon la classe sociale.
- **Travail (`production`, `fetch_resource`, etc.)**: Activités productives réalisées pendant les heures de travail désignées pour chaque classe sociale. Cela inclut le travail dans les ateliers, la pêche pour les Facchini, la gestion des affaires pour les Cittadini, etc. Les Nobili n'ont pas de blocs de "travail" formels ; leurs activités de gestion et d'influence se déroulent pendant leurs longues périodes de loisirs.
- **Consommation/Activités de Loisirs**: Périodes dédiées aux repas, aux achats, à la socialisation, et à d'autres activités non liées directement au repos ou au travail productif. Les achats sont une activité principale pendant ces périodes si les besoins et les moyens le permettent.
- **Voyage (`goto_home`, `goto_work`, `goto_inn`, etc.)**: Déplacement entre les lieux. Les horaires de ces voyages sont déterminés par la nécessité d'atteindre un lieu pour la prochaine période d'activité (repos, travail, loisir).

Les activités principales incluent :
- **Production**: Un citoyen à son lieu de travail transforme des ressources. Se produit pendant les heures de travail.
- **Fetch Resource**: Un citoyen se déplace pour récupérer des ressources. Se produit généralement pendant les heures de travail ou de loisirs si cela concerne des besoins personnels.
    - *Processeur (à l'arrivée à `FromBuilding`)*:
        - Calcule la quantité réelle de `ResourceId` à récupérer, limitée par le contrat, le stock du vendeur, la capacité de transport du citoyen, et les fonds de l'acheteur effectif.
        - L'acheteur effectif paie le vendeur.
        - La ressource est retirée du stock de `FromBuilding` et ajoutée à l'inventaire du citoyen (appartenant à l'acheteur effectif).
- **Fetch From Galley**: Un citoyen récupère des marchandises d'une galère marchande.
- **Activités de Repas (`eat_from_inventory`, `eat_at_home`, `eat_at_tavern`)**: Déclenchées par la faim, généralement pendant les périodes de loisirs/consommation.
- **Idle**: Attente ou activité non spécifique, généralement lorsque aucune tâche prioritaire n'est disponible pendant une période d'activité donnée (travail ou loisir).
- **Business Activity & `CheckedAt` Updates**: La gestion active d'une entreprise par son `RunBy` (par exemple, être présent pendant les heures de travail, lancer une production) met à jour `CheckedAt`. Une absence de gestion simulée pendant plus de 24h entraîne une pénalité de productivité.
- **`goto_construction_site`**: Un ouvrier se déplace vers un site de construction pendant ses heures de travail.
    - *Champs*: `ToBuilding` (site de construction), `ContractId`, `BuildingToConstruct` (ID du bâtiment cible), `WorkDurationMinutes` (durée de travail prévue après arrivée).
    - *Processeur (à l'arrivée sur `ToBuilding`)*:
        - Crée une activité `construct_building` pour commencer le travail.
- **`deliver_construction_materials`**: Un ouvrier d'un atelier de construction transporte des matériaux de l'atelier (`FromBuilding`) vers un site de construction (`ToBuilding`).
    - *Créateur (dans `construction_logic.py`)*:
        - Avant de créer l'activité, l'ouvrier prend les `ResourcesToDeliver` de l'inventaire de l'atelier.
        - Ces ressources sont ajoutées à l'inventaire de l'ouvrier, mais leur `Owner` reste l'opérateur de l'atelier (`RunBy` de `FromBuilding`).
        - La quantité est limitée par la capacité de transport de l'ouvrier.
    - *Champs*: `FromBuilding` (atelier), `ToBuilding` (site de construction), `ResourcesToDeliver` (JSON: `[{"type": "timber", "amount": 50}, ...]`, reflète ce que l'ouvrier transporte réellement), `ContractId` (ID du `construction_project`).
    - *Processeur (à l'arrivée sur `ToBuilding`)*:
        - Transfère les `ResourcesToDeliver` de l'inventaire du citoyen (celles appartenant à l'opérateur de l'atelier) vers l'inventaire du `ToBuilding`.
        - Les ressources dans `ToBuilding` deviennent la propriété du `Buyer` du contrat de construction.
        - Met à jour le contrat `construction_project` (statut, notes sur les matériaux livrés). Si tous les matériaux sont livrés, le statut du contrat passe à `materials_delivered`.
- **`construct_building`**: Un ouvrier travaille sur un site de construction.
    - *Champs*: `Citizen`, `BuildingToConstruct` (ID du site, qui est aussi `FromBuilding` et `ToBuilding` pour cette activité), `WorkDurationMinutes`, `ContractId`.
    - *Processeur (à la fin de l'activité)*:
        - Soustrait `WorkDurationMinutes` du champ `ConstructionMinutesRemaining` du `BuildingToConstruct`.
        - Si `ConstructionMinutesRemaining` <= 0:
            - Met à jour `BuildingToConstruct`: `IsConstructed = True`, `ConstructionDate = now()`, `ConstructionMinutesRemaining = 0`.
            - Met à jour le contrat `construction_project`: `Status = 'completed'`.
- **`leave_venice`**: A Forestiero (visitor) travels to an exit point (e.g., a public dock) to leave Venice.
    - *Processor (executes upon arrival at exit point)*:
        - Deletes any `merchant_galley` building owned by the Forestiero.
        - Liquidates all resources owned by the Forestiero:
            - Calculates value based on `importPrice`.
            - Adds total value to Forestiero's Ducats.
            - Subtracts total value from "Italia" citizen's Ducats.
            - Deletes resource records.
            - Creates transaction records for the "sale" to Italia.
        - Updates the Forestiero's citizen record: `InVenice` set to `FALSE`, `Position` cleared.

Activities are managed by the `createActivities.py` script, which runs periodically to ensure citizens always have something to do. This system applies equally to both AI and human citizens, creating a unified simulation where all citizens follow the same daily patterns and routines.

The `createActivities.py` script also handles the creation of `fetch_from_galley` activities. When a `merchant_galley` arrives (its `deliver_resource_batch` activity concludes and `IsConstructed` becomes `True`), its resources (owned by the galley's merchant owner) become available. `createActivities.py` will assign idle citizens to go to these galleys, pick up the specified resources (as per the original import contracts now linked to the galley merchant), and then subsequently create `deliver_resource_batch` activities (this time for citizens, not galleys) to take these resources to their final buyer destinations.

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

Le script `createActivities.py` identifie les citoyens sans activité en cours et tente de leur en assigner une nouvelle. La logique de décision principale est encapsulée dans `citizen_general_activities.py` et prend en compte :
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
