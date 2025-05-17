# Relevancy System Documentation

## Overview

The Relevancy System calculates how relevant different assets (lands, buildings, resources) are to AI citizens. This helps AIs make more strategic decisions by prioritizing assets that are most valuable to their specific situation.

## Land Proximity Relevancy

The primary relevancy type currently implemented is Land Proximity Relevancy, which calculates how relevant unowned lands are to an AI based on:

1. **Geographic Proximity**: How close the land is to the AI's existing properties
2. **Connectivity**: Whether the land is connected to the AI's existing properties via bridges
3. **Strategic Value**: The potential value of the land based on its location and features

### Calculation Factors

- **Base Score**: Calculated using an exponential decay function based on distance
  - Score = 100 * e^(-distance/500)
  - This gives a score of 100 at distance 0, ~60 at 250m, ~37 at 500m, etc.

- **Connectivity Bonus**: +30 points if the land is in the same connected group as any of the AI's existing lands

- **Final Score**: Capped at 100 points, with status levels:
  - High: >70 points
  - Medium: 40-70 points
  - Low: <40 points

### Time Horizon

Each relevancy calculation includes a time horizon indicating how soon the AI should consider acting:

- **Short**: For highly relevant, connected lands (immediate opportunities)
- **Medium**: For moderately relevant lands (medium-term opportunities)
- **Long**: For lands with lower current relevancy but potential future value

## Data Structure

Each relevancy record contains:

- **Score**: Numerical relevancy score (0-100)
- **AssetID**: ID of the relevant asset
- **AssetType**: Type of asset (land, building, resource)
- **Category**: Category of relevancy (proximity, economic, strategic)
- **Type**: Specific type of relevancy (connected, geographic)
- **TargetCitizen**: Owner of the closest related asset
- **RelevantToCitizen**: AI citizen for whom this relevancy is calculated
- **TimeHorizon**: When the AI should consider acting (short, medium, long)
- **Title**: Short description of the relevancy
- **Description**: Detailed explanation of why this asset is relevant
- **Status**: Current status of the relevancy (high, medium, low)

## Implementation

The relevancy system is implemented in two main components:

1. **RelevancyService**: A TypeScript service that calculates relevancy scores
2. **calculateRelevancies API**: An API endpoint that triggers calculations and stores results

### Calculation Process

1. For each AI citizen who owns lands:
   - Fetch all lands owned by the AI
   - Fetch all other lands in the system
   - Fetch land connectivity data from the land-groups API
   - Calculate relevancy scores for each unowned land
   - Store the results in the RELEVANCIES table

### Scheduled Execution

The system runs daily via a Python script (`backend/ais/calculateRelevancies.py`) that:
1. Calls the calculateRelevancies API with `calculateAll=true`
2. Processes all AI citizens who own lands
3. Creates an admin notification with the results

## Usage in AI Decision Making

The relevancy scores are used by various AI systems to make more strategic decisions:

1. **Land Bidding**: AIs prioritize bidding on lands with higher relevancy scores
2. **Land Purchasing**: AIs prioritize purchasing lands with higher relevancy scores
3. **Building Construction**: AIs consider land relevancy when deciding where to build

## Future Extensions

The relevancy system is designed to be extensible to other types of relevancy:

1. **Economic Relevancy**: Based on income potential and resource availability
2. **Strategic Relevancy**: Based on control of key areas or trade routes
3. **Social Relevancy**: Based on proximity to important citizens or institutions

## API Reference

### GET /api/calculateRelevancies

Calculate relevancy scores for a specific AI or all AIs.

**Query Parameters:**
- `ai`: (Optional) Username of the AI to calculate relevancies for
- `calculateAll`: (Optional) Set to "true" to calculate for all AIs who own lands

**Response:**
```json
{
  "success": true,
  "aiCount": 5,
  "totalRelevanciesCreated": 120,
  "results": {
    "ai_username": {
      "ownedLandCount": 3,
      "relevanciesCreated": 24
    }
  }
}
```

### POST /api/calculateRelevancies

Calculate and save relevancy scores for a specific AI.

**Request Body:**
```json
{
  "aiUsername": "ai_citizen_name"
}
```

**Response:**
```json
{
  "success": true,
  "ai": "ai_citizen_name",
  "ownedLandCount": 3,
  "relevancyScores": {
    "land_id_1": 85.4,
    "land_id_2": 62.7
  },
  "saved": true
}
```
