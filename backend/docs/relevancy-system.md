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
- **Asset**: ID of the relevant asset
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

**Global Landowner Profile Records (Global Domination Calculation - `Citizen: "all"`)**
- When global domination is calculated (e.g., via `POST /api/relevancies/domination` with `Citizen: "all"`), one record is created *for each landowner*. These records are relevant to "all" (or a global entity like `ConsiglioDeiDieci`).
- **RelevantToCitizen**: `"all"` (or `ConsiglioDeiDieci`)
- **TargetCitizen**: The landowner being profiled (e.g., `CitizenAlpha`)
- **Asset**: The landowner being profiled (e.g., `CitizenAlpha`)
- **AssetType**: `citizen`
- **Category**: `domination`
- **Type**: `global_landowner_profile`
- **Score**: Numerical score of `CitizenAlpha`'s dominance.
- **Description**: Details of `CitizenAlpha`'s land holdings and building points.
- **Title**: e.g., "Land Domination: CitizenAlpha"

**Peer Domination Profile Records (Specific User Request - `Citizen: "UserA"`)**
- When a specific citizen (e.g., `UserA`) requests domination scores (via `POST /api/relevancies/domination` with `Citizen: "UserA"`), they receive a list of relevancies. Each relevancy in this list details how dominant *another* landowner (`UserB`, `UserC`, etc.) is. These are saved via the `saveRelevancies` utility.
- **RelevantToCitizen**: The requesting citizen (e.g., `UserA`)
- **Asset**: The other landowner being profiled (e.g., `UserB`)
- **AssetType**: `citizen`
- **Category**: `domination`
- **Type**: `peer_dominance_profile` (or the default type used by `saveRelevancies` for citizen assets)
- **TargetCitizen**: The other landowner being profiled (e.g., `UserB`)
- **Score**: Numerical score of `UserB`'s dominance.

## Building Operator Relationship Relevancy

This relevancy identifies relationships where a building's `Owner` is different from its `RunBy` (operator). Two relevancy records are generated for each such case: one for the owner and one for the operator.

### Calculation
- The system iterates through buildings.
- If `Building.Owner !== Building.RunBy`:
    - A record is created for `Building.Owner` (RelevantToCitizen) about `Building.RunBy` (TargetCitizen) operating their building.
    - A record is created for `Building.RunBy` (RelevantToCitizen) about `Building.Owner` (TargetCitizen) whose building they operate.

### Data Structure Example

**For Building Owner (`CitizenA`) whose building is run by `CitizenB`:**
- **RelevantToCitizen**: `CitizenA`
- **TargetCitizen**: `CitizenB`
- **Asset**: Building ID
- **AssetType**: `building`
- **Category**: `operator_relations`
- **Type**: `operator_in_your_building`
- **Title**: "CitizenB Operates Your Market Stall"
- **Description**: Details about CitizenB running the business in CitizenA's building.

**For Building Operator (`CitizenB`) running `CitizenA`'s building:**
- **RelevantToCitizen**: `CitizenB`
- **TargetCitizen**: `CitizenA`
- **Asset**: Building ID
- **AssetType**: `building`
- **Category**: `operator_relations`
- **Type**: `running_in_others_building`
- **Title**: "You Operate CitizenA's Market Stall"
- **Description**: Details about running a business in CitizenA's building.

## Building Occupant Relationship Relevancy

This relevancy identifies relationships between a building's `RunBy` (operator/employer/landlord) and its `Occupant` (employee/renter). It's bidirectional.

### Calculation
- The system iterates through buildings.
- If `Building.RunBy` and `Building.Occupant` are different:
    - **Business Category:**
        - For `RunBy` (Employer): "You Employ [Occupant] at Your [BuildingType]"
        - For `Occupant` (Employee): "You Work for [RunBy] at Their [BuildingType]"
    - **Home Category:**
        - For `RunBy` (Landlord): "[Occupant] Rents Your [BuildingType]"
        - For `Occupant` (Renter): "You Rent a [BuildingType] from [RunBy]"

### Data Structure Example (Employer/Employee)

**For Employer (`CitizenA`) whose business building is occupied (worked at) by `CitizenB`:**
- **RelevantToCitizen**: `CitizenA`
- **TargetCitizen**: `CitizenB`
- **Asset**: Building ID
- **AssetType**: `building`
- **Category**: `occupancy_relations`
- **Type**: `employer_to_employee`
- **Title**: "You Employ CitizenB at Your Workshop"

**For Employee (`CitizenB`) working at `CitizenA`'s business:**
- **RelevantToCitizen**: `CitizenB`
- **TargetCitizen**: `CitizenA`
- **Asset**: Building ID
- **AssetType**: `building`
- **Category**: `occupancy_relations`
- **Type**: `employee_to_employer`
- **Title**: "You Work for CitizenA at Their Workshop"


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
  "Citizen": "citizen_name",
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

If `Citizen` is `"all"` for domination (when calling `/api/relevancies/domination` POST), the response will indicate N global landowner profiles were saved (where N is the number of landowners):
```json
{
  "success": true,
  "username": "all", 
  "relevancyScores": { /* ... scores for all landowners ... */ },
  "detailedRelevancy": { /* ... full data for all landowners ... */ },
  "saved": true,
  "relevanciesSavedCount": N // Number of landowners
}
```

### Command Line Usage

**Using `backend/relevancies/calculateRelevancies.py` (Orchestrator for all types):**
```bash
# Calculate all types of relevancies:
# - Global landowner profiles (one per landowner, relevant to "all")
# - Global housing & job market reports
# - Per-citizen proximity & building ownership relevancies
python backend/relevancies/calculateRelevancies.py

# Calculate proximity relevancies of a specific type (e.g., 'connected') for all citizens, plus other global profiles
python backend/relevancies/calculateRelevancies.py --type connected
```

**Using `backend/relevancies/calculateSpecificRelevancy.py` (For individual types):**
```bash
# Calculate global landowner profiles (creates one record per landowner, relevant to "all")
python backend/relevancies/calculateSpecificRelevancy.py --type domination

# Calculate peer domination profiles and save them TO "CitizenAlpha" (so CitizenAlpha sees how dominant others are)
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

# Calculate building operator relevancies for CitizenAlpha (and the other party involved)
python backend/relevancies/calculateSpecificRelevancy.py --type building_operator --username CitizenAlpha

# Calculate building operator relevancies for all citizens
python backend/relevancies/calculateSpecificRelevancy.py --type building_operator

# Calculate building occupant relationship relevancies for CitizenAlpha
python backend/relevancies/calculateSpecificRelevancy.py --type building_occupant --username CitizenAlpha

# Calculate building occupant relationship relevancies for all citizens
python backend/relevancies/calculateSpecificRelevancy.py --type building_occupant

# Calculate same land neighbor relevancies for all lands/land groups
python backend/relevancies/calculateSpecificRelevancy.py --type same_land_neighbor

# Calculate guild member relevancies for all guilds
python backend/relevancies/calculateSpecificRelevancy.py --type guild_member
```

## Same Land Neighbor Relevancy

This type of relevancy identifies communities of residents living on the same `LandId` (land or distinct land parcel). It aims to foster a sense of local community and highlight shared geographical context.

### Calculation
- The system fetches all buildings categorized as "home".
- It groups the `Occupant` of these homes by their `LandId`.
- For each `LandId` that has two or more occupants, a single relevancy record is created.

### Data Structure
- **Asset**: The `LandId` of the land/land parcel.
- **AssetType**: `land`
- **Category**: `neighborhood`.
- **Type**: `same_land_neighbor`.
- **RelevantToCitizen**: An array of Airtable Record IDs of all citizens residing on this `LandId`.
- **TargetCitizen**: An array of Airtable Record IDs of all citizens residing on this `LandId` (representing the community group itself).
- **Title**: Example: "Neighbors on Land/Land [LandId]".
- **Description**: Example: "You share this land/land area with: [CitizenA], [CitizenB]. Living on the same land fosters local community and shared interests."
- **Score**: A base score (e.g., 50), potentially increasing slightly with the number of neighbors.
- **Status**: Typically "medium" or based on the score.
- **TimeHorizon**: "ongoing".

### Strategic Value
- Highlights local communities to players.
- Can be used by AI or game mechanics to simulate local interactions or events.
- Provides context for players about who their immediate neighbors are.

### API Endpoint
- **POST `/api/relevancies/same-land-neighbor`**:
    - Calculates and saves these group relevancies.
    - Request Body: Empty (for global calculation).
    - Response: Includes `success`, `relevanciesSavedCount` (number of land groups processed).

## Guild Member Relevancy

This type of relevancy identifies communities of players belonging to the same guild. It aims to foster collaboration and highlight shared affiliations.

### Calculation
- The system fetches all guilds and their members.
- For each guild with two or more members, a single relevancy record is created.

### Data Structure
- **Asset**: The `GuildId`.
- **AssetType**: `guild`.
- **Category**: `affiliation`.
- **Type**: `guild_member`.
- **RelevantToCitizen**: A JSON stringified array of all member `Username`s in this guild.
- **TargetCitizen**: A JSON stringified array of all member `Username`s in this guild (UI will use this to pick a `%TARGETCITIZEN%`).
- **Title**: Example: "Membre de la Guilde : %TARGETCITIZEN% dans la Guilde [GuildName]".
- **Description**: Example: "Vous et %TARGETCITIZEN% êtes membres de la **Guilde [GuildName]**.\n\nÊtre dans la même guilde favorise la collaboration et les objectifs communs.\n\nAutres membres de cette guilde : [Liste des membres]."
- **Score**: A base score (e.g., 60), potentially increasing slightly with the number of members.
- **Status**: Typically "medium" or based on the score.
- **TimeHorizon**: "ongoing".

### Strategic Value
- Highlights guild affiliations to players.
- Can be used by AI or game mechanics to simulate guild interactions or events.
- Provides context for players about their guildmates.

### API Endpoint
- **POST `/api/relevancies/guild-member`**:
    - Calculates and saves these group relevancies.
    - Request Body: Empty (for global calculation).
    - Response: Includes `success`, `relevanciesSavedCount` (number of guilds processed).
