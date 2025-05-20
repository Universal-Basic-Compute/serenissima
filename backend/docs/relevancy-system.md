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
- **RelevantToCitizen**: Citizen for whom this relevancy is calculated
- **TimeHorizon**: When the citizen should consider acting (short, medium, long)
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

The system runs daily via a Python script (`backend/relevancies/calculateRelevancies.py`) that:
1. Calls the relevant API endpoints to calculate global and per-citizen relevancies.
2. Processes all relevant citizens (e.g., landowners for proximity).
3. Creates an admin notification with the summary of calculations.

## Usage in AI Decision Making

The relevancy scores are used by various AI systems (and can be used by human players via UI) to make more strategic decisions:

1. **Land Bidding**: AIs prioritize bidding on lands with higher relevancy scores
2. **Land Purchasing**: AIs prioritize purchasing lands with higher relevancy scores
3. **Building Construction**: AIs consider land relevancy when deciding where to build

## Land Domination Relevancy

In addition to land proximity, the system calculates Land Domination Relevancy, which identifies the most significant landowners in Venice:

### Calculation Factors

- **Land Count**: Number of lands owned by each citizen (60% weight)
- **Building Points**: Total building points across all owned lands (40% weight)
- **Normalization**: Scores are normalized against the citizen with the most lands/points

### Scoring

- Scores range from 0-100, with higher scores indicating greater land dominance
- Status levels:
  - High: >70 points (major landowner)
  - Medium: 40-70 points (significant landowner)
  - Low: <40 points (minor landowner)

### Strategic Value

Land domination relevancy helps AIs and administrators:
- Identify major competitors in the real estate market.
- Recognize potential allies or threats.
- Understand the overall land ownership landscape.
- Make strategic decisions about land acquisition and development.

### Data Structure

**Global Land Domination Record (`RelevantToCitizen: "all"`)**
- This is a single record summarizing the overall land domination.
- **AssetID**: `venice_land_domination`
- **AssetType**: `city_metric`
- **Category**: `domination`
- **Type**: `overall_land_dominance`
- **TargetCitizen**: `ConsiglioDeiDieci` (or `all`)
- **RelevantToCitizen**: `all`
- **Score**: `100` (indicating a complete report)
- **Description**: Contains a summary of the top N most dominant landowners.

**Per-Citizen Land Domination Records (when requested for a specific citizen)**
- These records show a specific citizen how dominant other landowners are.
- **AssetType**: 'citizen'
- **Category**: 'domination'
- **Type**: 'landowner_profile' (or similar to distinguish from the global one)
- **TargetCitizen**: The citizen whose dominance is being described.
- **RelevantToCitizen**: The citizen for whom this relevancy is calculated.
- **Score**: Numerical score based on land count and building points of the `TargetCitizen`.

## Future Extensions

The relevancy system is designed to be extensible to other types of relevancy:

1. **Economic Relevancy**: Based on income potential and resource availability
2. **Strategic Relevancy**: Based on control of key areas or trade routes
3. **Social Relevancy**: Based on proximity to important citizens or institutions

## API Reference

### GET /api/calculateRelevancies

Calculates and returns relevancy scores for a specific citizen or all citizens who own lands. This endpoint is more for direct calculation without saving, primarily for proximity. Other relevancy types have their own dedicated GET/POST routes.

**Query Parameters:**
- `username`: (Optional) Username of the citizen to calculate relevancies for.
- `ai`: (Optional, legacy) Same as `username`.
- `calculateAll`: (Optional) Set to "true" to calculate for all citizens who own lands. (Note: This can be resource-intensive and might be better handled by specific calculation scripts).
- `type`: (Optional) Filter relevancies by type (e.g., 'connected', 'geographic') for proximity calculations.

**Response (Example for a specific citizen):**
```json
{
  "success": true,
  "username": "citizen_name",
  "ownedLandCount": 3,
  "relevancyScores": { /* simple scores */ },
  "detailedRelevancy": { /* detailed scores */ }
}
```

### POST /api/calculateRelevancies

Calculates and saves relevancy scores (proximity and land domination) for a specific citizen.

**Request Body:**
```json
{
  "citizenUsername": "citizen_name",
  "typeFilter": "connected" // Optional: Filter by type for proximity
}
```

**Response:**
```json
{
  "success": true,
  "citizen": "citizen_name",
  "ownedLandCount": 3,
  "relevancyScores": {
    "land_id_1": 85.4,
    "land_id_2": 62.7
  },
  "detailedRelevancy": { /* ... full data ... */ },
  "saved": true,
  "relevanciesSavedCount": 2 // Example for proximity
}
```

If `citizenUsername` is `"all"` for domination (when calling `/api/relevancies/domination` POST), the response will indicate 1 global record saved:
```json
{
  "success": true,
  "username": "all", 
  "relevancyScores": { /* ... scores for all landowners ... */ },
  "detailedRelevancy": { /* ... full data for all landowners ... */ },
  "saved": true,
  "relevanciesSavedCount": 1 
}
```

### Command Line Usage

**Using `backend/relevancies/calculateRelevancies.py` (Orchestrator for all types):**
```bash
# Calculate all types of relevancies (global domination, housing, jobs, and per-citizen proximity & building ownership)
python backend/relevancies/calculateRelevancies.py

# Calculate proximity relevancies of a specific type (e.g., 'connected') for all citizens, plus other global relevancies
python backend/relevancies/calculateRelevancies.py --type connected
```

**Using `backend/relevancies/calculateSpecificRelevancy.py` (For individual types):**
```bash
# Calculate global land domination (creates 1 record RelevantToCitizen: "all")
python backend/relevancies/calculateSpecificRelevancy.py --type domination

# Calculate land domination scores and save them TO "CitizenAlpha" (so CitizenAlpha sees how dominant others are)
python backend/relevancies/calculateSpecificRelevancy.py --type domination --username CitizenAlpha

# Calculate proximity relevancies for CitizenAlpha
python backend/relevancies/calculateSpecificRelevancy.py --type proximity --username CitizenAlpha

# Calculate proximity relevancies for all landowners (iterates and makes one API call per landowner)
python backend/relevancies/calculateSpecificRelevancy.py --type proximity 

# Calculate global housing situation (creates 1 record RelevantToCitizen: "all")
python backend/relevancies/calculateSpecificRelevancy.py --type housing

# Calculate global job market situation (creates 1 record RelevantToCitizen: "all")
python backend/relevancies/calculateSpecificRelevancy.py --type jobs

# Calculate building ownership relevancies for CitizenAlpha
python backend/relevancies/calculateSpecificRelevancy.py --type building_ownership --username CitizenAlpha
```
