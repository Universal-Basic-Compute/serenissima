# La Serenissima Game Engine

This document explains the automated processes that occur daily in the La Serenissima game engine.

## Daily Automated Processes

The game engine runs several automated processes at scheduled times throughout the day to simulate the living economy of Renaissance Venice. These processes occur without requiring player intervention.

### Immigration (11:00 AM UTC)

**Script**: `backend/engine/immigration.py`

Every day at 11:00 AM UTC, the immigration system checks for vacant housing buildings in Venice and potentially brings new citizens to the city:

1. The script identifies all vacant housing buildings (canal houses, merchant houses, artisan houses, and fisherman cottages)
2. For each vacant building, there is a 20% chance it will attract a new citizen
3. When a building attracts a citizen, the system:
   - Generates a new citizen of the appropriate social class based on the building type:
     - Canal houses attract Patricians
     - Merchant houses attract Cittadini
     - Artisan houses attract Popolani
     - Fisherman cottages attract Facchini
   - Creates a detailed citizen profile with historically accurate name, description, and characteristics
   - Generates a unique portrait image for the citizen
   - Creates a notification for administrators
4. The system tracks immigration statistics by social class and sends a summary notification to administrators

The immigration process helps maintain population balance in the city and ensures that vacant properties have a chance to be occupied, creating a dynamic housing market.

### Housing Assignment (12:00 PM UTC)

**Script**: `backend/engine/househomelesscitizens.py`

At noon UTC each day, the housing assignment system finds homes for citizens who don't currently have one:

1. The script identifies all homeless citizens and sorts them by wealth (descending)
2. For each citizen, it finds an appropriate building based on their social class:
   - Patricians are assigned to canal houses
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
   - Patrician: 10% chance
   - Cittadini: 20% chance
   - Popolani: 30% chance
   - Facchini: 40% chance
3. If a citizen decides to look, the system finds available housing of the appropriate type with rent below a threshold:
   - Patrician: 12% cheaper
   - Cittadini: 8% cheaper
   - Popolani: 6% cheaper
   - Facchini: 4% cheaper
4. Citizens are moved to cheaper housing if found
5. Notifications are sent to:
   - The previous landlord about the tenant moving out
   - The new landlord about the tenant moving in
   - The citizen about their new home and rent savings
   - Administrators with a summary of all housing changes

This process creates a dynamic housing market with citizens seeking better economic opportunities, simulating the mobility of Renaissance Venice's population.

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

### Income Distribution (4:00 PM UTC)

**Script**: `backend/distributeIncome.py`

Every afternoon at 4:00 PM UTC, the income distribution system allocates income from land ownership:

1. The script identifies all lands that generate income
2. For each income-generating land:
   - It calculates the daily income based on the land's properties
   - It identifies the land owner
   - It transfers the appropriate amount of compute tokens to the owner's account
3. A portion of all income is collected as taxes by the Consiglio dei Dieci (Council of Ten)
4. Transaction records are created for all income transfers
5. Notifications are sent to land owners about their income

This process simulates the economic activity of Venice, with land ownership providing passive income to players and tax revenue to the government.

## Technical Implementation

These automated processes are scheduled using cron jobs set up in the `backend/startup.sh` script. Each process runs independently and handles its own error logging and recovery.

The processes interact with the game's data stored in Airtable, updating records for citizens, buildings, lands, and transactions. They also generate notifications to keep players informed about changes affecting their assets and citizens.

For detailed implementation of each process, refer to the source code in the respective script files.
