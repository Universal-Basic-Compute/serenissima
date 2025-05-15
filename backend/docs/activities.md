# Citizen Activities in La Serenissima

This document explains the citizen activity system that simulates the daily lives of citizens in Renaissance Venice.

## Overview

The activity system tracks what citizens are doing at any given time, creating a living simulation of Venetian life. Citizens can engage in various activities including:

- **Rest**: Sleeping at home during nighttime hours
- **Work**: Working at their assigned businesses during the day
- **Travel**: Moving between locations via walking or gondola
- **Idle**: Waiting for their next scheduled activity

Activities are managed by the `createActivities.py` script, which runs periodically to ensure citizens always have something to do.

## Activity Types

### Rest

Rest activities occur during nighttime hours (10 PM to 6 AM Venice time). When night falls, citizens who are at home will automatically begin resting. Citizens who are not at home will attempt to return home to rest.

Rest activities include:
- Sleeping
- Evening meals
- Family time

### Travel (goto_home)

When citizens need to move from one location to another, they engage in travel activities. The most common travel activity is `goto_home`, which occurs when:

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

- **ActivityId**: Unique identifier for the activity
- **Type**: The type of activity (rest, goto_home, work, idle)
- **CitizenId**: The citizen performing the activity
- **FromBuilding**: Starting location (for travel activities)
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
   - If it's nighttime and the citizen is at home: create a rest activity
   - If it's nighttime and the citizen is not at home: create a goto_home activity
   - If it's daytime and the citizen has a job: create a work activity
   - If none of the above apply: create an idle activity

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
2. **Shopping**: Citizens visiting markets to purchase goods
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
