# La Serenissima Game Engine

This document explains the automated processes that occur daily in the La Serenissima game engine.

## Daily Automated Processes

The game engine runs several automated processes at scheduled times throughout the day to simulate the living economy of Renaissance Venice. These processes occur without requiring player intervention and apply equally to both AI and human citizens, creating a unified economic system where all participants follow the same rules.

### Unified Citizen Processing

All engine processes treat AI and human citizens as equal participants in the economy:

1. **Identical Processing Logic**: The same code processes both AI and human citizens. For instance, the operational status of a business, indicated by its `CheckedAt` timestamp, affects its productivity. This timestamp is updated automatically when the designated `RunBy` citizen (AI or human-controlled) engages in relevant activities at the business (e.g., arriving for work, starting production). If such simulated activity doesn't occur for over 24 hours, productivity is halved, reflecting a lapse in active management.
2. **Equal Economic Rules**: The same economic rules apply to all citizens regardless of type
3. **Shared Notification System**: All citizens receive notifications about economic events
4. **Common Database Structure**: All citizens are stored in the same database tables
5. **Unified Transaction Records**: Economic transactions are recorded the same way for all citizens

This unified approach ensures that the game world remains consistent and fair for all participants, while creating a dynamic and realistic simulation of Renaissance Venice's economy.

### Building Maintenance Collection (7:00 AM UTC)

**Script**: `backend/engine/pay_building_maintenance.py`

Every day at 7:00 AM UTC, the building maintenance collection system processes maintenance costs for all buildings:

1. The script identifies all buildings in the system
2. For each building:
   - It looks up the building type's JSON file to find the maintenance cost
   - It identifies the building owner
   - It deducts the maintenance cost from the owner's Ducats balance
   - It transfers the maintenance cost to the Consiglio dei Dieci
3. If an owner has insufficient funds, the system logs the missed payment
4. Transaction records are created for all maintenance payments
5. Notifications are sent to:
   - Building owners summarizing maintenance costs paid for their buildings
   - Administrators with statistics about total maintenance collected

This process simulates the ongoing costs of maintaining buildings in Renaissance Venice, ensuring that building ownership requires financial responsibility beyond the initial construction cost.

### Treasury Redistribution (8:00 AM UTC)

**Script**: `backend/engine/treasuryRedistribution.py`

Every day at 8:00 AM UTC, the treasury redistribution system allocates funds from the Consiglio dei Dieci to citizens:

1. The script calculates 10% of the ConsiglioDeiDieci's Ducats to redistribute
2. This amount is distributed to citizens based on social class:
   - 40% to Nobili
   - 30% to Cittadini
   - 20% to Popolani
   - 10% to Facchini
3. Within each social class, the funds are distributed equally among all citizens
4. Transaction records are created for all payments
5. Notifications are sent to:
   - Each citizen receiving funds
   - Administrators with statistics about the redistribution

This process simulates the Republic's welfare system, providing a basic income to citizens while maintaining the social hierarchy of Renaissance Venice.

### Lease Distribution (9:00 AM UTC)

**Script**: `backend/engine/distributeLeases.py`

Every day at 9:00 AM UTC, the lease distribution system processes payments from building owners to land owners:

1. For each land with an owner, the script identifies all buildings on that land
2. For each building with a LeasePrice, it transfers that amount from the building owner to the land owner
3. Transaction records are created for all payments
4. Notifications are sent to:
   - Land owners summarizing all lease payments received for each of their lands
   - Building owners summarizing all lease payments made for their buildings
   - Administrators with statistics including top gainers and losers

This process simulates the economic relationship between land owners and building owners, where building owners must pay for the right to build on land they don't own.

### Immigration (11:00 AM UTC)

**Script**: `backend/engine/immigration.py`

Every day at 11:00 AM UTC, the immigration system checks for vacant housing buildings in Venice and potentially brings new citizens to the city:

1. The script identifies all vacant housing buildings (canal houses, merchant houses, artisan houses, and fisherman cottages)
2. For each vacant building, there is a 20% chance it will attract a new citizen
3. When a building attracts a citizen, the system:
   - Generates a new citizen of the appropriate social class based on the building type:
     - Canal houses attract Nobili
     - Merchant houses attract Cittadini
     - Artisan houses attract Popolani
     - Fisherman cottages attract Facchini
   - Creates a detailed citizen profile with historically accurate name, description, and characteristics
   - Generates a unique portrait image for the citizen
   - Sets the `IsAI` flag to true for these new citizens, making them automated participants
   - Creates a notification for administrators
4. The system tracks immigration statistics by social class and sends a summary notification to administrators

The immigration process helps maintain population balance in the city and ensures that vacant properties have a chance to be occupied, creating a dynamic housing contract. These new AI citizens become full participants in the economy, following the same rules and processes as human players.

### Job Assignment (10:00 AM UTC)

**Script**: `backend/engine/citizensgetjobs.py`

Every day at 10:00 AM UTC, the job assignment system finds employment for citizens without jobs:

1. The script identifies all citizens without jobs (Work field is empty), excluding `Forestieri`. `Nobili` are also excluded as ils ne cherchent pas d'emploi en tant qu'`Occupant`. Leur temps est consacré à la gestion de leurs affaires, à la politique, au commerce et aux loisirs (y compris le shopping) pendant leurs longues périodes d'"activités/consommation".
2. Eligible citizens (non-Nobili, non-Forestieri) are sorted by wealth in descending order (wealthier citizens get first pick of jobs).
3. For each eligible citizen, the system finds an available business. Available businesses exclude those `RunBy` (opérées par) des `Nobili`, as these businesses operate under different staffing models or are managed directly by the Nobili family and their retainers, rather than through publicly listed job openings filled by this script.
4. Citizens are assigned to suitable available businesses with the highest wages.
5. When a citizen is assigned to a business:
   - The citizen record is updated with their new job
   - The business record is updated with its new worker and set to active status
   - A notification is created for the business owner about their new employee
   - For human citizens, this creates a new activity in their schedule
6. The system tracks job assignment statistics and sends a summary notification to administrators

This process ensures that citizens find employment based on their wealth and status, creating a stratified labor contract similar to historical Venice. Both AI and human citizens participate in the same job contract, creating a unified economy where all participants follow the same rules.

### Housing Assignment (12:00 PM UTC)

**Script**: `backend/engine/househomelesscitizens.py`

At noon UTC each day, the housing assignment system finds homes for citizens who don't currently have one:

1. The script identifies all homeless citizens and sorts them by wealth (descending)
2. For each citizen, it finds an appropriate building based on their social class:
   - Nobili are assigned to canal houses
   - Cittadini are assigned to merchant houses
   - Popolani are assigned to artisan houses
   - Facchini are assigned to fisherman cottages
3. Citizens are assigned to the building with the lowest rent in their appropriate category
4. When a citizen is housed:
   - The citizen record is updated with their new home
   - The building record is updated with its new occupant
   - A notification is created for the citizen about their new home
5. The system tracks housing statistics by building type and sends a summary notification to administrators

This process ensures that citizens find appropriate housing based on their social class and wealth, creating a stratified society similar to historical Venice.

### Housing Mobility (2:00 PM UTC)

**Script**: `backend/engine/citizenhousingmobility.py`

Every day at 2:00 PM UTC, the housing mobility system simulates citizens looking for more affordable housing:

1. The script checks all housed citizens
2. Based on social class, it determines if they look for cheaper housing:
   - Nobili: 10% chance
   - Cittadini: 20% chance
   - Popolani: 30% chance
   - Facchini: 40% chance
3. If a citizen decides to look, the system finds available housing of the appropriate type with rent below a threshold:
   - Nobili: 12% cheaper
   - Cittadini: 8% cheaper
   - Popolani: 6% cheaper
   - Facchini: 4% cheaper
4. Citizens are moved to cheaper housing if found
5. Notifications are sent to:
   - The previous landlord about the tenant moving out
   - The new landlord about the tenant moving in
   - The citizen about their new home and rent savings
   - Administrators with a summary of all housing changes

This process creates a dynamic housing contract with citizens seeking better economic opportunities, simulating the mobility of Renaissance Venice's population.

### Social Class Updates (1:00 PM UTC)

**Script**: `backend/engine/updateSocialClass.py`

Every day at 1:00 PM UTC, the social class update system evaluates citizens for potential social mobility:

1. The script checks all citizens and updates their social class based on:
   - Entrepreneur status (citizens who run at least one building)
   - Daily income (citizens with >100000 Ducats daily income become Cittadini)
   - Influence (citizens with >10000 Influence become Nobili)
2. The system applies rules in order of precedence:
   - Highest priority: Citizens with Influence > 10000 become Nobili
   - Second priority: Citizens with DailyIncome > 100000 become Cittadini (if not already Nobili)
   - Third priority: Entrepreneurs must be at least Popolani
3. When a citizen's social class changes:
   - Their citizen record is updated with the new social class
   - A notification is sent explaining their elevation in status
   - The reason for the change is included in the notification details
4. The system tracks social mobility statistics and sends a summary notification to administrators

This process simulates the social mobility of Renaissance Venice, where wealth, entrepreneurship, and influence could elevate a citizen's social standing. It creates a dynamic society where citizens can rise through the social ranks based on their economic achievements and contributions to the city.

### Work Mobility (4:00 PM UTC)

**Script**: `backend/engine/citizenworkmobility.py`

Every day at 4:00 PM UTC, the work mobility system simulates citizens looking for better-paying jobs:

1. The script checks all employed citizens
2. Based on social class, it determines if they look for better-paying jobs:
   - Nobili: 5% chance
   - Cittadini: 10% chance
   - Popolani: 15% chance
   - Facchini: 20% chance
3. If a citizen decides to look, the system finds available businesses with wages above a threshold:
   - Nobili: 15% higher
   - Cittadini: 12% higher
   - Popolani: 10% higher
   - Facchini: 8% higher
4. Citizens are moved to better-paying jobs if found
5. Notifications are sent to:
   - The previous employer about the employee leaving
   - The new employer about the employee joining
   - The citizen about their new job and wage increase
   - Administrators with a summary of all job changes

This process creates a dynamic labor contract with citizens seeking better economic opportunities, simulating the mobility of Renaissance Venice's workforce.

### Loan Payments (3:00 PM UTC)

**Script**: `backend/engine/dailyloanpayments.py`

Every day at 3:00 PM UTC, the loan payment system processes payments for all active loans:

1. The script identifies all active loans in the system
2. For each active loan:
   - It deducts the daily payment amount from the borrower's compute balance
   - It adds the payment amount to the lender's compute balance
   - It updates the loan's remaining balance
   - It marks the loan as "paid" if the remaining balance reaches zero
3. Transaction records are created for all payments
4. Notifications are sent to borrowers and lenders about the payments
5. If a borrower has insufficient funds, a notification is sent about the missed payment

This process simulates the banking system of Renaissance Venice, with regular loan payments ensuring the flow of capital between citizens and institutions.

### Wage Payments (5:00 PM UTC)

**Script**: `backend/engine/dailywages.py`

Every day at 5:00 PM UTC, the wage payment system processes payments from business owners to their employees:

1. The script identifies all citizens with jobs (Work field is not empty)
2. For each citizen, it retrieves their workplace (business) details
3. It transfers the Wages amount from the business owner to the citizen
4. When a wage payment is processed:
   - The business owner's compute balance is reduced by the wage amount
   - The citizen's wealth is increased by the wage amount
   - A transaction record is created documenting the payment
5. An admin notification is created with statistics about all wage payments processed

This process simulates the labor economy of Venice, with business owners paying wages to their workers on a daily basis. The wealth accumulated by citizens affects their ability to pay rent and potentially move to better housing.

### Rent Payments (6:00 PM UTC)

**Script**: `backend/engine/dailyrentpayments.py`

Every day at 6:00 PM UTC, the rent payment system processes two types of rent payments:

1. Housing rent payments:
   - For each building with an occupant, the system transfers the RentPrice from the citizen to the building owner
   - If the citizen has insufficient funds, notifications are sent to both parties about the missed payment

2. Business rent payments:
   - For each business with a building, the system transfers the RentPrice from the business owner to the building owner
   - This only occurs if the business owner is different from the building owner

3. For all successful payments:
   - Transaction records are created
   - Notifications are sent to both the payer and recipient
   - Building owners receive summaries of all rent collected from their properties

4. An admin notification is created with statistics about all rent payments processed

This process simulates the rental economy of Venice, with citizens paying rent for housing and businesses paying rent for commercial spaces.

### AI Land Bidding (7:00 PM UTC)

**Script**: `backend/ais/bidonlands.py`

Every day at 7:00 PM UTC, the AI land bidding system allows AI citizens to participate in the land contract:

1. The script identifies all citizens marked as AI in the system
2. For each AI citizen, it checks their compute balance and existing bids
3. For lands with income potential, AI citizens will:
   - Place new bids (at 30x the land's last income) if they have sufficient compute
   - Increase existing bids by 14% if they already have a bid on the land
4. AI citizens only bid if they have at least twice the bid amount in their compute balance
5. An admin notification is created with statistics about all bidding activity

This process creates a dynamic land contract with AI participation, ensuring that valuable lands receive competitive bids even without human players bidding on them.

### AI Building Construction (8:00 PM UTC)

**Script**: `backend/ais/buildbuildings.py`

Every day at 8:00 PM UTC, the AI building construction system allows AI citizens to develop lands they own:

1. The script identifies all citizens marked as AI in the system
2. For each AI citizen, it checks their compute balance and lands they own
3. For each land with available building points, AI citizens will:
   - Evaluate which building types can fit within the remaining points
   - Prioritize buildings with higher income potential
   - Construct buildings if they have sufficient compute
4. AI citizens only build if they have at least twice the building cost in their compute balance
5. An admin notification is created with statistics about all building activity

This process encourages land development and creates a more dynamic game world, with AI citizens actively improving their properties and generating income through building operations.

### AI Lease Adjustments (Rule-Based) (9:30 PM UTC / 21:30 Venice Time)

**Script**: `backend/ais/automated_adjustleases.py --strategy standard`

This script allows AI citizens who own land to automatically adjust the `LeasePrice` for buildings situated on their land, based on a specified strategy.

#### Process:
1.  Identifies AI land owners.
2.  For each building on their land (not owned by the AI land owner itself, and of category 'home' or 'business'):
    *   Calculates a new `LeasePrice` based on:
        *   Median global `LeasePrice` for similar building types.
        *   Median local `LeasePrice` on the same `LandId`.
        *   A target based on a percentage of the building's `RentPrice`.
        *   The chosen `--strategy` (low, standard, high) applies a multiplier.
    *   Applies sanity checks (e.g., lease price not exceeding 50% of `RentPrice`, change limits).
3.  Updates the building's `LeasePrice` if significantly changed.
4.  Notifies the building owner of the change.
5.  Sends an admin summary.

#### Economic Impact:
-   Provides a rule-driven mechanism for AI land owners to manage `LeasePrice`.
-   Aligns `LeasePrice` with building profitability and market conditions.
-   Creates more dynamic land markets.

### AI Lease Adjustments (Kinos-driven) (9:00 PM UTC / 22:00 Venice Time)

**Script**: `backend/ais/adjustleases.py`

Every day at 9:00 PM UTC, the AI lease adjustment system allows AI citizens to optimize lease amounts for buildings on their lands:

1. The script identifies all citizens marked as AI in the system
2. For each AI citizen, it analyzes their lands, buildings, and financial situation
3. The AI makes strategic decisions about lease adjustments based on:
   - Building income and maintenance costs
   - Land value and location
   - Contract rates for similar buildings
   - Overall financial goals
4. When lease adjustments are made:
   - Building records are updated with new lease amounts
   - Building owners receive notifications about the changes
   - Reasons for adjustments are provided to maintain transparency
5. An admin notification is created with statistics about all lease adjustments

This process creates a more dynamic real estate contract with AI landowners actively managing their properties, providing contract signals about the value of different locations, and encouraging strategic building placement by players.

### AI Rent Adjustments (10:00 PM UTC)

**Script**: `backend/ais/adjustrents.py`

Every day at 10:00 PM UTC, the AI rent adjustment system allows AI citizens to optimize rent amounts for buildings they own:

1. The script identifies all citizens marked as AI in the system
2. For each AI citizen, it analyzes their buildings and occupants
3. The AI makes strategic decisions about rent adjustments based on:
   - Building income and maintenance costs
   - Occupant social class and wealth
   - Occupancy status (vacant or occupied)
   - Contract rates for similar housing
   - Overall financial goals
4. When rent adjustments are made:
   - Building records are updated with new rent amounts
   - Building occupants receive notifications about the changes
   - Reasons for adjustments are provided to maintain transparency
5. An admin notification is created with statistics about all rent adjustments

This process creates a more dynamic housing contract with AI building owners actively managing their properties, providing contract signals about the value of different housing types, and encouraging citizens to seek affordable housing based on their wealth and social class.

### Citizen Income and Turnover Calculation (7:00 PM UTC)

**Script**: `backend/engine/calculateIncomeAndTurnover.py`

Every day at 7:00 PM UTC, this script calculates financial metrics for all citizens:

1.  The script fetches all citizens and all transactions from Airtable.
2.  For each citizen, it calculates their total income and turnover (expenses) over the last 24 hours, 7 days, and 30 days.
    *   **Income** is tallied from transactions where the citizen is a seller, receives a deposit (e.g., from the Treasury or loan disbursement), or is the recipient in a direct transfer.
    *   **Turnover** (expenses) is tallied from transactions where the citizen is a buyer, makes an injection (e.g., to the Treasury), or is the sender in a direct transfer.
3.  The script then updates each citizen's record in the `CITIZENS` table with the following calculated fields:
    *   `DailyIncome`
    *   `DailyTurnover`
    *   `WeeklyIncome`
    *   `WeeklyTurnover`
    *   `MonthlyIncome`
    *   `MonthlyTurnover`
4.  This provides an up-to-date financial overview for each citizen, which can be used for display, analysis, or by other game systems.

This process helps in understanding the economic activity and financial health of citizens over different periods.

### AI Wage Adjustments (11:00 PM UTC)

**Script**: `backend/ais/adjustwages.py`

Every day at 11:00 PM UTC, the AI wage adjustment system allows AI citizens to optimize wage amounts for businesses they own:

1. The script identifies all citizens marked as AI in the system
2. For each AI citizen, it analyzes their businesses and employees
3. The AI makes strategic decisions about wage adjustments based on:
   - Business income and expenses
   - Employee social class and wealth
   - Labor contract conditions
   - Need to attract and retain quality workers
   - Overall financial goals
4. When wage adjustments are made:
   - Business records are updated with new wage amounts
   - Business employees receive notifications about the changes
   - Reasons for adjustments are provided to maintain transparency
5. An admin notification is created with statistics about all wage adjustments

This process creates a more dynamic labor contract with AI business owners actively managing their workforce, providing contract signals about the value of different types of labor, and affecting citizen wealth which in turn impacts their ability to pay rent and potentially move to better housing.

### AI Message Responses (Every 2.4 hours)

**Script**: `backend/ais/answertomessages.py`

Ten times per day (approximately every 2.4 hours), the AI message response system allows AI citizens to respond to messages they receive:

1. The script identifies all citizens marked as AI in the system
2. For each AI citizen, it checks for unread messages addressed to them
3. For each unread message, the AI:
   - Marks the message as read
   - Generates a contextually appropriate response using the Kinos Engine API
   - Creates a new message record with the AI's response to the sender
4. The system tracks response statistics and creates an admin notification summarizing the number of responses generated by each AI

This process creates a more interactive and responsive game world, allowing players to communicate with AI characters and receive meaningful responses. It simulates a living community of Venetian citizens and merchants, enhancing immersion and providing opportunities for roleplaying and storytelling.

## Technical Implementation

These automated processes are scheduled using cron jobs set up in the `backend/startup.sh` script. Each process runs independently and handles its own error logging and recovery.

The processes interact with the game's data stored in Airtable, updating records for citizens, buildings, lands, and transactions. They also generate notifications to keep players informed about changes affecting their assets and citizens.

For detailed implementation of each process, refer to the source code in the respective script files.

## Engine-Driven vs. AI-Initiated Endeavors (Activities & Actions)

Il est important de distinguer les processus décrits ci-dessus, qui sont généralement des routines globales appliquées à tous les citoyens éligibles par le "moteur de jeu" (scripts Python dans `backend/engine/` et `backend/ais/`), des activités (y compris les actions stratégiques) initiées par les IA elles-mêmes.

-   **Processus du Moteur (Engine-Driven)**: Ce sont les scripts listés dans ce document (`pay_building_maintenance.py`, `citizensgetjobs.py`, etc.). Ils appliquent des règles de jeu et des simulations à grande échelle. Ils peuvent créer des activités pour les citoyens (via `createActivities.py`) ou modifier directement l'état du jeu.

-   **Entreprises Initiées par l'IA (AI-Initiated Endeavors)**: Les IA, notamment via `autonomouslyRun.py`, peuvent décider de s'engager dans des activités spécifiques (ex: `rest`, `production`, `fetch_resource`) ou des actions stratégiques (ex: `bid_on_land`, `send_message`). Elles le font en appelant :
    *   `POST /api/activities/try-create`: C'est le point d'entrée principal pour l'IA pour initier *toute* forme d'entreprise. L'IA spécifie un `activityType` (qui peut être une activité traditionnelle ou une action stratégique) et des `activityParameters`. Le moteur Python est alors responsable de créer le ou les enregistrements d'activité nécessaires dans la table `ACTIVITIES`.
    *   `POST /api/actions/create-activity`: Cet endpoint reste disponible pour les cas où l'IA (ou un autre système) a déjà déterminé *tous* les détails d'une activité spécifique *unique* (y compris les actions stratégiques modélisées comme activités) et souhaite la créer directement dans la table `ACTIVITIES`. Pour des séquences ou des actions nécessitant une orchestration (comme un déplacement préalable), `/api/activities/try-create` est la méthode privilégiée.

Toutes les entreprises initiées par l'IA qui résultent en un ou plusieurs enregistrements dans la table `ACTIVITIES` sont ensuite gérées et traitées individuellement par le script `processActivities.py` lorsque leur `EndDate` respective est atteinte. `processActivities.py` se concentre désormais sur la finalisation des effets d'une activité terminée et ne crée plus d'activités de suivi.
