# La Serenissima Game Engine

This document explains the automated processes that occur daily in the La Serenissima game engine.

## Daily Automated Processes

The game engine runs several automated processes at scheduled times throughout the day to simulate the living economy of Renaissance Venice. These processes occur without requiring player intervention.

### Treasury Redistribution (8:00 AM UTC)

**Script**: `backend/engine/treasuryRedistribution.py`

Every day at 8:00 AM UTC, the treasury redistribution system allocates funds from the Consiglio dei Dieci to citizens:

1. The script calculates 10% of the ConsiglioDeiDieci's ComputeAmount to redistribute
2. This amount is distributed to citizens based on social class:
   - 40% to Patricians
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
2. For each building with a LeaseAmount, it transfers that amount from the building owner to the land owner
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
     - Canal houses attract Patricians
     - Merchant houses attract Cittadini
     - Artisan houses attract Popolani
     - Fisherman cottages attract Facchini
   - Creates a detailed citizen profile with historically accurate name, description, and characteristics
   - Generates a unique portrait image for the citizen
   - Creates a notification for administrators
4. The system tracks immigration statistics by social class and sends a summary notification to administrators

The immigration process helps maintain population balance in the city and ensures that vacant properties have a chance to be occupied, creating a dynamic housing market.

### Job Assignment (10:00 AM UTC)

**Script**: `backend/engine/citizensgetjobs.py`

Every day at 10:00 AM UTC, the job assignment system finds employment for citizens without jobs:

1. The script identifies all citizens without jobs (Work field is empty)
2. Citizens are sorted by wealth in descending order (wealthier citizens get first pick of jobs)
3. For each citizen, the system finds an available business (not already taken by another worker)
4. Citizens are assigned to businesses with the highest wages
5. When a citizen is assigned to a business:
   - The citizen record is updated with their new job
   - The business record is updated with its new worker and set to active status
   - A notification is created for the business owner about their new employee
6. The system tracks job assignment statistics and sends a summary notification to administrators

This process ensures that citizens find employment based on their wealth and status, creating a stratified labor market similar to historical Venice.

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

### Work Mobility (4:00 PM UTC)

**Script**: `backend/engine/citizenworkmobility.py`

Every day at 4:00 PM UTC, the work mobility system simulates citizens looking for better-paying jobs:

1. The script checks all employed citizens
2. Based on social class, it determines if they look for better-paying jobs:
   - Patrician: 5% chance
   - Cittadini: 10% chance
   - Popolani: 15% chance
   - Facchini: 20% chance
3. If a citizen decides to look, the system finds available businesses with wages above a threshold:
   - Patrician: 15% higher
   - Cittadini: 12% higher
   - Popolani: 10% higher
   - Facchini: 8% higher
4. Citizens are moved to better-paying jobs if found
5. Notifications are sent to:
   - The previous employer about the employee leaving
   - The new employer about the employee joining
   - The citizen about their new job and wage increase
   - Administrators with a summary of all job changes

This process creates a dynamic labor market with citizens seeking better economic opportunities, simulating the mobility of Renaissance Venice's workforce.

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
   - For each building with an occupant, the system transfers the RentAmount from the citizen to the building owner
   - If the citizen has insufficient funds, notifications are sent to both parties about the missed payment

2. Business rent payments:
   - For each business with a building, the system transfers the RentAmount from the business owner to the building owner
   - This only occurs if the business owner is different from the building owner

3. For all successful payments:
   - Transaction records are created
   - Notifications are sent to both the payer and recipient
   - Building owners receive summaries of all rent collected from their properties

4. An admin notification is created with statistics about all rent payments processed

This process simulates the rental economy of Venice, with citizens paying rent for housing and businesses paying rent for commercial spaces.

## Technical Implementation

These automated processes are scheduled using cron jobs set up in the `backend/startup.sh` script. Each process runs independently and handles its own error logging and recovery.

The processes interact with the game's data stored in Airtable, updating records for citizens, buildings, lands, and transactions. They also generate notifications to keep players informed about changes affecting their assets and citizens.

For detailed implementation of each process, refer to the source code in the respective script files.
