# La Serenissima: Problem Detection System

This document describes the problem detection system within La Serenissima. This system dynamically identifies various problematic situations affecting citizens and their assets, providing them with information and potential solutions.

## Objectives of the Problem System

- **Inform Players**: Alert players to critical or suboptimal issues concerning their citizens, lands, or buildings.
- **Guide Action**: Suggest concrete solutions that players can undertake to resolve these problems.
- **Enhance Immersion**: Make the game world more dynamic and responsive to player actions (or inactions).
- **Facilitate Strategic Decision-Making**: Help players prioritize their actions based on the severity and impact of the problems.

## Types of Problems Detected

Here are the types of problems currently managed by the system:

### 1. Homeless Citizen

-   **Description**: A citizen is considered homeless if they are not listed as an occupant of any "residential" (home) category building.
-   **Detection**: The system checks each citizen to ensure they are the occupant (`Occupant`) of at least one building whose category (`Category`) is "home".
-   **Impact/Severity**: Medium. Homelessness can affect the citizen's well-being and productivity.
-   **Suggested Solutions**:
    -   Search for available housing on the market.
    -   Ensure sufficient funds to pay rent.
    -   Wait for automatic housing assignment by the daily script (if applicable).

### 2. Homeless Employee Impact

-   **Description**: This problem is reported to an employer if one of their employees is homeless.
-   **Detection**: When a citizen is identified as homeless (see above), the system checks if they have a job. If so, and if the employer (`runBy` in the professional buildings table) is different from the employee, a problem is created for the employer.
-   **Impact/Severity**: Low. The employer is informed that their employee's productivity could be reduced by up to 50%.
-   **Suggested Solutions**:
    -   Discuss housing options with the employee.
    -   Provide assistance if possible.
    -   Monitor performance and consider recruitment alternatives.

### 3. Workless Citizen

-   **Description**: A citizen is considered unemployed if they are not listed as an occupant of any "commercial" (business) category building. This does not apply to citizens of the `Nobili` social class.
-   **Detection**: The system checks each citizen (excluding `Nobili` and system accounts like `ConsiglioDeiDieci` or `SerenissimaBank`) to ensure they are the occupant (`Occupant`) of at least one building whose category (`Category`) is "business".
-   **Impact/Severity**: Low. Unemployment affects the citizen's ability to earn income.
-   **Suggested Solutions**:
    -   Look for job opportunities in available businesses.
    -   Improve skills or social standing.
    -   Wait for automatic job assignment by the daily script (if applicable).

### 4. Hungry Citizen

-   **Description**: A citizen is considered hungry if their last recorded meal (`AteAt` field) was more than 24 hours ago. This problem only applies to citizens currently marked as `inVenice = true`.
-   **Detection**: The system checks each citizen with `inVenice = true`. It parses their `AteAt` timestamp and compares it to the current time. If the difference exceeds 24 hours, a "Hungry Citizen" problem is generated.
-   **Impact/Severity**: Medium. Hunger can affect a citizen's well-being and reduce their work productivity by up to 50%.
-   **Suggested Solutions**:
    -   Ensure the citizen has food resources in their personal inventory.
    -   Ensure the citizen has food resources stored in their home (if applicable, and they own those resources).
    -   Ensure the citizen has sufficient Ducats to purchase a meal at a tavern.
    -   Check if the citizen can pathfind to their home or a tavern if food is available there.
    -   The `createActivities.py` script will attempt to make the citizen eat if `AteAt` is too old, by creating `eat_from_inventory`, `eat_at_home` (possibly after a `goto_home`), or `eat_at_tavern` (possibly after a `goto_tavern`) activities.
    -   Verify that game mechanics for eating are functioning and the `AteAt` field is being updated correctly by the respective "eat" activity processors.
    -   If the citizen is an AI, ensure their behavior scripts (if any beyond the core engine) don't interfere with the engine's eating logic.

### 5. Hungry Employee Impact

-   **Description**: This problem is reported to an employer if one of their employees is hungry.
-   **Detection**: When a citizen is identified as hungry (see above), the system checks if they have a job. If so, and if the employer (`runBy` in the professional buildings table) is different from the employee, a problem is created for the employer.
-   **Impact/Severity**: Low. The employer is informed that their employee's productivity could be significantly reduced due to hunger.
-   **Suggested Solutions**:
    -   Consider if the employee's wages are sufficient for them to afford food.
    -   Discuss the importance of regular meals with the employee, if appropriate for game context.
    -   Monitor performance and consider if systemic issues are preventing employees from eating.

### 6. Vacant Home

-   **Description**: This problem is reported when a residential building (category "home") has an owner but no occupant.
-   **Detection**: The system identifies buildings with `Category` = "home", a valid `Owner`, but an empty `Occupant` field.
-   **Impact/Severity**: Low. An empty home generates no rental income and may fall into disrepair.
-   **Suggested Solutions**:
    -   List the property on the rental market.
    -   Adjust the rent.
    -   Maintain the property.
    -   Sell the property.

### 7. Vacant Business Premises

-   **Description**: This problem is reported when a commercial building (category "business") has an owner but no occupant (worker).
-   **Detection**: The system identifies buildings with `Category` = "business", a valid `Owner`, but an empty `Occupant` field.
-   **Impact/Severity**: Medium. Vacant business premises generate no income and have no economic activity.
-   **Suggested Solutions**:
    -   Lease the premises to an entrepreneur.
    -   Start a new business.
    -   Ensure the property is suitable for common business types.
    -   Sell the property.

### 8. No Active Contracts

-   **Description**: This problem is reported for "commercial" (business) category buildings that are not involved in any active contracts (neither as a buyer `BuyerBuilding` nor as a seller `SellerBuilding`).
-   **Detection**: The system retrieves all "business" category buildings. Then, it retrieves all contracts considered as "active". A contract is active if:
    1.  The current date is between its creation date (`CreatedAt`) and its end date (`EndAt`).
    2.  Its type (`Type`) is not "expired".
    3.  Its status (`Status`) is "active".
    The system then identifies commercial buildings that do not appear as `BuyerBuilding` or `SellerBuilding` in these active contracts.
-   **Impact/Severity**: Medium. A commercial building without active contracts is not participating in the economy, missing revenue or supply opportunities.
-   **Suggested Solutions**:
    -   Create sales contracts for goods or services produced.
    -   Create purchase contracts for necessary raw materials or goods.
    -   Analyze market prices and demand.
    -   Ensure the business is operational with an occupant.

### 9. Zero Rent for Home

-   **Description**: This problem is reported to a building owner if their residential property (category "home") has its rent amount set to 0 Ducats (or is null/undefined).
-   **Detection**: The system identifies buildings with `Category` = "home", a valid `Owner`, and where `RentPrice` is 0, null, or not set.
-   **Impact/Severity**: Low. While potentially intentional (e.g., for personal use), a zero rent means no rental income is generated if the property were leased.
-   **Suggested Solutions**:
    -   If intending to rent, set a competitive rent amount.
    -   If for personal use, this notification can be ignored.
    -   Review property management strategy for income generation.

### 10. Zero Rent for Leased Business

-   **Description**: This problem is reported to a building owner if their commercial property (category "business") has its rent amount set to 0 Ducats (or is null/undefined) AND the building is operated by a different citizen (`Owner` != `RunBy`).
-   **Detection**: The system identifies buildings with `Category` = "business", a valid `Owner`, where `RentPrice` is 0 (or null/undefined), and the `Owner` field is different from the `RunBy` field.
-   **Impact/Severity**: Medium. The owner is missing out on rental income from a business they own but is operated by someone else.
-   **Suggested Solutions**:
    -   Set an appropriate rent amount for the business operator.
    -   Review lease agreements and terms with the operator.
    -   If the zero-rent arrangement is intentional (e.g., special agreement, subsidiary), this notification can be ignored.

### 11. Zero Wages for Business

-   **Description**: This problem is reported to a business operator (`RunBy`) if their commercial property (category "business") has its wages amount set to 0 Ducats (or is null/undefined).
-   **Detection**: The system identifies buildings with `Category` = "business", a valid `RunBy` citizen, and where the `Wages` field (expected to be on the building record, representing the wage rate or total wage pool for that business) is 0, null, or not set.
-   **Impact/Severity**: Medium. Operating a business with zero wages means employees are not being paid. This can lead to severe dissatisfaction, low morale, inability to attract or retain workers, and ultimately business failure.
-   **Suggested Solutions**:
    -   Set an appropriate wage amount for employees working at this business. This could be an hourly rate, a daily rate, or a share of profits, depending on game mechanics.
    -   Review the business's financial model to ensure it can sustainably afford to pay wages.
    -   If the business is not yet operational or currently has no employees, this might be acceptable temporarily. However, a plan to implement wages should be in place once the business becomes active with staff.
    -   Ensure the `Wages` field for the building is correctly configured in Airtable.

### 12. Unchecked Business Operation

-   **Description**: A business building's `CheckedAt` timestamp has not been updated in the last 24 hours. This indicates a lack of simulated active management by its operator (`RunBy`). The `CheckedAt` field is automatically updated when the `RunBy` citizen performs certain activities related to the business, such as arriving at work (via `goto_work`), initiating a `production` cycle, or potentially through a dedicated `check_business_status` activity if implemented.
-   **Detection**: The system checks business category buildings for their `CheckedAt` timestamp. If this timestamp is older than 24 hours, a problem is generated for the `RunBy` citizen.
-   **Impact/Severity**: Medium. A business deemed "unchecked" (due to lack of recent `RunBy` activity updating `CheckedAt`) suffers a 50% reduction in its overall productivity until its `CheckedAt` timestamp is updated again.
-   **Suggested Solutions**:
    -   Ensure the `RunBy` citizen is actively engaged with the business. Their routine activities (like arriving at work, initiating production) should automatically update the `CheckedAt` timestamp.
    -   If the `RunBy` citizen is unable to perform their duties (e.g., stuck, missing, lacking resources for activities that would update `CheckedAt`), address those underlying issues.
    -   Verify that the `RunBy` citizen is correctly assigned and present in Venice if required for their role.
    -   This problem highlights a lapse in the simulated operational oversight necessary for full productivity.

## Problem Management and Display

### Detection

-   Problems are detected via backend scripts and API services.
-   The main script `backend/problems/detectProblems.py` orchestrates the detection of all problem types by calling the corresponding APIs (e.g., `/api/problems/no-buildings`, `/api/problems/homeless`, etc.).
-   Each problem API uses `ProblemService.ts` (in `lib/services/`) to implement specific detection logic.
-   Detected problems are then saved to the `PROBLEMS` table in Airtable via the `saveProblems` utility (in `lib/utils/problemUtils.ts`), which also ensures that old active problems of the same type for the concerned citizen are cleared before inserting new ones.
-   The script `backend/problems/detectSpecificProblems.py` can be used to trigger the detection of a specific problem type, potentially for a given user.

### Display

-   **Problem Markers**: In the isometric view (`PolygonViewer`), active problems for the logged-in player are displayed as small markers (colored exclamation points) positioned on the concerned asset (land or building). The marker color indicates the problem's severity.
    -   Implementation: `components/PolygonViewer/ProblemMarkers.tsx`
-   **Problem Details Panel**: Clicking on a problem marker opens a modal panel displaying detailed information about the problem, including its description, location, severity, and suggested solutions.
    -   Implementation: `components/UI/ProblemDetailsPanel.tsx`
-   **Problems API**:
    -   `/api/problems`: Allows fetching filtered problems (by citizen, asset type, status).
    -   `/api/problems/[problemId]`: Allows fetching details of a specific problem by its `ProblemId`.

## Structure of a Problem

Each problem record in Airtable (and as processed by the system) typically contains the following fields:

-   `ProblemId` (Text): A unique identifier for this problem instance (e.g., `homeless_citizenX_timestamp`).
-   `Citizen` (Text): The username of the citizen concerned by the problem.
-   `AssetType` (Text): The type of asset concerned (e.g., "land", "building", "citizen").
-   `Asset` (Text): The identifier of the concerned asset.
-   `Severity` (Single Select): The severity of the problem (e.g., "low", "medium", "high", "critical").
-   `Status` (Single Select): The current status of the problem (e.g., "active", "resolved", "ignored").
-   `CreatedAt` (Date/Time): The date and time of the problem's creation.
-   `UpdatedAt` (Date/Time): The date and time of the problem's last update (this is usually automatically managed by Airtable if it's a computed field based on last modification time).
-   `Location` (Text): A textual description of the problem's location (e.g., building name, land name).
-   `Position` (Text, JSON): The geographic coordinates (latitude, longitude) of the concerned asset, stored as a JSON string.
-   `Title` (Text): A concise title for the problem (e.g., "No Buildings on Land", "Homeless Citizen").
-   `Description` (Long Text, Markdown): A detailed description of the problem.
-   `Solutions` (Long Text, Markdown): Suggestions for resolving the problem.
-   `Notes` (Long Text): Internal notes or additional information.

This system aims to create a more engaging gaming experience and help players effectively manage their presence in La Serenissima.
