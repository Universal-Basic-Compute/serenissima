# Citizen Activities in La Serenissima

This document explains the citizen activity system that simulates the daily lives of citizens in Renaissance Venice.

## Overview

The activity system tracks what citizens are doing at any given time, creating a living simulation of Venetian life. Both AI and human citizens can engage in various activities. While the core mechanics apply to all, social class influences activity patterns:
-   **Nobili**: Do not seek "jobs" as `Occupant`. Their daytime activities revolve around managing their affairs, political engagements, social interactions, and leisure, including shopping. This makes them active consumers and potential patrons for various businesses.
-   **Cittadini, Popolani, Facchini**: Engage in work, rest, and other daily life activities as described below.
-   **Forestieri**: Primarily engage in visitor-specific activities like lodging at inns and eventually leaving Venice.

Core activities include:

- **Rest**: Sleeping at home during nighttime hours
- **Work**: Working at their assigned businesses during the day
- **Travel**: Moving between locations via walking or gondola. This includes:
    - `goto_home`: Traveling to their residence.
    - `goto_work`: Traveling to their workplace.
    - `goto_inn`: Traveling to an inn (for visitors).
- **Production**: Citizen is at their workplace and actively transforming input resources into output resources according to a recipe.
    - *Processor*: Consumes specified input resources from the building's inventory and adds specified output resources, if conditions (input availability, storage capacity) are met.
- **Fetch Resource**: Citizen travels to a source building (`FromBuilding` in activity) to pick up resources as per a contract. The activity's `ToBuilding` field indicates the ultimate destination for these resources.
    - *Processor (executes upon arrival at `FromBuilding`)*:
        - Calculates the actual amount of the specified `ResourceId` to pick up, limited by contract amount, seller's stock (owned by `RunBy` of `FromBuilding`), citizen's carrying capacity (10 units total), and funds of the *effective buyer*.
        - L'*effective buyer* est :
            - Pour les contrats `public_sell` : l'opérateur (`RunBy`) du `ToBuilding` de l'activité.
            - Pour les autres types de contrats (ex: `recurrent`) : le `Buyer` spécifié dans le contrat.
        - L'*effective buyer* paie le `Seller` (opérateur du `FromBuilding`).
        - La ressource est retirée du stock du `FromBuilding`.
        - La ressource est ajoutée à l'inventaire du citoyen, marquée comme appartenant à l'*effective buyer*.
        - La position du citoyen est mise à jour à `FromBuilding`.
    - *Post-processing*: `createActivities.py` devrait ensuite idéalement créer une nouvelle activité de voyage pour que le citoyen transporte les ressources récupérées de `FromBuilding` vers le `ToBuilding` d'origine (destination finale).
- **Fetch From Galley**: Citizen travels to a `merchant_galley` building to pick up a specific batch of resources (related to an original import contract).
    - *Fields*: `FromBuilding` (galley's Airtable ID), `OriginalContractId` (custom ID of the original import contract), `ResourceId`, `Amount`.
    - *Processor (executes upon arrival at galley)*:
        - Verifies resource availability in the galley (owned by the Merchant).
        - Checks citizen's carrying capacity.
        - Transfers the specified `Amount` of `ResourceId` from the galley's resources to the citizen's inventory. The resources in the citizen's inventory become owned by the `Buyer` of the `OriginalContractId`.
        - Updates the galley's `PendingDeliveriesData` to reflect the picked-up amount.
        - Citizen's position is updated to the galley's position.
    - *Post-processing*: `createActivities.py` should then create a `deliver_resource_batch` activity for the citizen to take these resources from the galley to the original buyer's building.
- **Eating Activities**: Triggered when a citizen's `AteAt` timestamp is older than 12 hours.
    - **`eat_from_inventory`**: Citizen consumes a food item they are carrying.
        - *Processor*: Decrements the food resource from the citizen's personal inventory. Updates `AteAt`.
    - **`eat_at_home`**: Citizen consumes a food item stored in their home building, which they own.
        - *Processor*: Decrements the food resource from the home building's inventory (owned by the citizen). Updates `AteAt`.
    - **`eat_at_tavern`**: Citizen consumes a meal at a tavern.
        - *Processor*: Deducts Ducats from the citizen for the meal cost. Credits the tavern operator. Updates `AteAt`.
    - *Note*: Travel to home (`goto_home`) or tavern (`goto_tavern`, often using `goto_inn` type) might precede `eat_at_home` or `eat_at_tavern` if the citizen is not already at the location. These travel activities are standard.
- **Idle**: Waiting for their next scheduled activity
- **Business Activity & `CheckedAt` Updates**: The `CheckedAt` timestamp on a `BUILDINGS` record is automatically updated when its designated `RunBy` citizen performs relevant operational activities. These include, but are not limited to:
    - Arriving at the business premises (e.g., completion of a `goto_work` activity targeting the business).
    - Initiating a `production` cycle within the business.
    - Potentially, a dedicated `check_business_status` activity if explicitly implemented for certain scenarios.
    If no such updating activity occurs for over 24 hours, the business is considered "unchecked" and suffers a 50% productivity penalty. This reflects a lack of simulated active management.
- **`goto_construction_site`**: Un ouvrier se déplace vers un site de construction.
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

The `createActivities.py` script follows this process:

1. Identify citizens who have no active activities
2. Determine the current time in Venice
3. For each idle citizen:
   - If it's nighttime:
     - If the citizen is a visitor (has `HomeCity`):
       - If at an inn: create `rest` activity at the inn.
       - Else: create `goto_inn` activity to the closest available inn.
     - Else (citizen is a resident):
       - If at home: create `rest` activity at home.
       - Else: create `goto_home` activity.
   - If hungry (AteAt > 12 hours ago):
     - Attempt to create an "eat" activity (from inventory, at home, or at a tavern). This has high priority.
     - If an "eat" activity is created (or a "goto" activity to facilitate eating), the process for this citizen for this cycle may conclude.
   - If not eating, and inventory is > 70% full:
     - If the citizen has a workplace and is not currently there, attempt to create a `goto_work` activity. The `goto_work_processor` will handle depositing resources owned by the workplace operator upon arrival. This is a high-priority action to free up inventory.
   - If not eating, not encumbered (or encumbered but cannot go to work), and the citizen is a Forestiero (visitor with `HomeCity`):
     - If it's daytime, check if conditions are met to `leave_venice` (e.g., in Venice > 12h, last activity ended > 12h ago). If so, create `leave_venice` activity.
     - If it's nighttime:
       - If at an inn: create `rest` activity at the inn.
       - Else: create `goto_inn` activity to the closest available inn.
     - Else (citizen is a resident):
       - If at home: create `rest` activity at home.
       - Else: create `goto_home` activity.
   - If not eating, and it's daytime:
     - If the citizen has a workplace:
       - If at workplace:
         - Attempt to create `production` activity if inputs for a recipe are available.
         - Else, attempt to create `fetch_resource` activity. This involves:
            1. Prioritizing `recurrent` contracts linked to the workplace operator.
            2. If no suitable `recurrent` contract, evaluating `public_sell` contracts using a scoring mechanism: `Score = (PricePerResource * 2) + Distance - TrustScore`. (Voir [documentation des contrats](contracts.md#public_sell-contract-mechanics) pour plus de détails).
         - Else, create `idle` activity.
       - Else (not at workplace): create `goto_work` activity.
     - Else (no workplace): create `idle` activity.
   - If pathfinding for any travel activity fails, or no other suitable activity can be determined (and not eating): create an `idle` activity.

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
