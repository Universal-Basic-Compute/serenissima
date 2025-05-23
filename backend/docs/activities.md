# Citizen Activities in La Serenissima

This document explains the citizen activity system that simulates the daily lives of citizens in Renaissance Venice.

## Overview

The activity system tracks what citizens are doing at any given time, creating a living simulation of Venetian life. Both AI and human citizens can engage in various activities including:

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
        - Calculates the actual amount of the specified `ResourceId` to pick up, limited by contract amount, seller's stock, citizen's carrying capacity (10 units total), and buyer's funds.
        - Buyer (from contract) pays Seller (operator of `FromBuilding`).
        - Resource is removed from `FromBuilding`'s stock.
        - Resource is added to the citizen's inventory, marked as owned by the contract's `Buyer`.
        - Citizen's position is updated to `FromBuilding`.
    - *Post-processing*: `createActivities.py` should then ideally create a new travel activity for the citizen to take the fetched resources from `FromBuilding` to the original `ToBuilding` (ultimate destination).
- **Fetch From Galley**: Citizen travels to a `merchant_galley` building to pick up a specific batch of resources (related to an original import contract).
    - *Fields*: `FromBuilding` (galley's Airtable ID), `OriginalContractId` (custom ID of the original import contract), `ResourceId`, `Amount`.
    - *Processor (executes upon arrival at galley)*:
        - Verifies resource availability in the galley (owned by "Italia").
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

Activities are managed by the `createActivities.py` script, which runs periodically to ensure citizens always have something to do. This system applies equally to both AI and human citizens, creating a unified simulation where all citizens follow the same daily patterns and routines.

The `createActivities.py` script also handles the creation of `fetch_from_galley` activities. When a `merchant_galley` arrives (created by `createimportactivities.py`), it contains `PendingDeliveriesData` listing the resources and their original contract details. `createActivities.py` will assign idle citizens to go to these galleys, pick up the specified resources, and then subsequently create `deliver_resource_batch` activities to take these resources to their final buyer destinations.

### Unified Citizen Activity Model

The activity system is a core component of La Serenissima's unified citizen model, where AI and human citizens are treated as equal participants in the game world:

1. **Identical Activity Types**: Both AI and human citizens engage in the same types of activities
2. **Shared Scheduling Logic**: The same scheduling algorithms determine when activities occur
3. **Common Visualization**: Activities are displayed the same way on the map for all citizens
4. **Equal Time Constraints**: The same time-based rules apply to activity duration and transitions
5. **Unified Pathfinding**: All citizens use the same navigation system for movement

## Activity Types

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
    - *Processor*: Upon arrival, if the citizen is carrying resources owned by the workplace operator (`RunBy`) and there's storage space, these resources are deposited into the workplace.

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
- **Type**: The type of activity (e.g., `rest`, `goto_home`, `goto_work`, `goto_inn`, `idle`, `production`, `fetch_resource`, `deliver_resource_batch`)
- **Citizen**: The `Username` of the citizen performing the activity.
- **FromBuilding**: Airtable Record ID of the starting location (for travel/production activities).
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
   - If not eating, and it's nighttime:
     - If the citizen is a visitor (has `HomeCity`):
       - If at an inn: create `rest` activity at the inn.
       - Else: create `goto_inn` activity to the closest available inn.
     - Else (citizen is a resident):
       - If at home: create `rest` activity at home.
       - Else: create `goto_home` activity.
   - If not eating, and it's daytime:
     - If the citizen has a workplace:
       - If at workplace:
         - Attempt to create `production` activity if inputs for a recipe are available.
         - Else, attempt to create `fetch_resource` activity based on active contracts.
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
