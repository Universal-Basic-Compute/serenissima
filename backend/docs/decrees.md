# La Serenissima Decrees System

This document explains the decree system in La Serenissima, which allows the government to implement policies that affect the game economy and citizens.

## Overview

Decrees are official proclamations issued by the Venetian government (the Consiglio dei Dieci or Council of Ten) that establish new rules, responsibilities, or economic policies. These decrees are implemented as automated processes that run at scheduled intervals.

## Active Decrees

### The Vigesima: Land Lease Taxation

**Implementation**: `backend/engine/distributeLeases.py`  
**Schedule**: Daily at 9:00 AM UTC (as part of lease distribution)

This decree establishes a 20% tax known as the Vigesima on all land lease payments.

#### Process:

1. When lease payments are processed daily:
   - 80% of the lease amount goes to the land owner
   - 20% is collected as tax and transferred to the ConsiglioDeiDieci treasury

2. The tax is automatically calculated and collected during the lease distribution process.

3. Both land owners and building owners receive notifications that include information about the tax.

4. A summary notification is sent to administrators with statistics about lease payments and tax collection.

#### Economic Impact:

The Vigesima tax:
- Provides a steady revenue stream for the Republic's treasury
- Funds essential public services and infrastructure
- Influences land lease pricing strategies, as landowners must account for the tax when setting rates
- Creates economic incentives for efficient land use and development

### Land Owner Infrastructure Maintenance Responsibility

**Implementation**: `backend/engine/decrees/affectpublicbuildingstolandowners.py`  
**Schedule**: Daily at 1:00 PM UTC

This decree assigns public infrastructure buildings to land owners, making them responsible for their maintenance and upkeep.

#### Process:

1. The script identifies all buildings of the following types:
   - Bridges
   - Public docks
   - Canal maintenance offices
   - Cisterns
   - Public wells

2. For each building, the system:
   - Determines which land parcel the building is located on
   - Sets the User field of the building to match the land owner
   - Creates notifications for affected land owners

3. Land owners receive notifications about the public infrastructure they are now responsible for maintaining.

4. A summary notification is sent to administrators with statistics about the assignment process.

#### Economic Impact:

This decree creates a responsibility system where land owners must maintain public infrastructure on their land. In the future, this may involve:

- Maintenance costs for the upkeep of these buildings
- Penalties for neglected infrastructure
- Potential revenue from well-maintained public facilities

## Decree Implementation

Decrees are implemented as Python scripts in the `backend/engine/decrees/` directory. Each decree script:

1. Connects to the Airtable database
2. Retrieves the necessary data (buildings, lands, users, etc.)
3. Implements the decree's logic
4. Updates records in the database
5. Creates notifications for affected users
6. Logs the results of the decree implementation

Decrees are scheduled to run automatically using cron jobs set up in the `backend/startup.sh` script.

## Adding New Decrees

To add a new decree:

1. Create a new Python script in the `backend/engine/decrees/` directory
2. Implement the decree's logic following the pattern of existing decree scripts
3. Add a cron job entry in `backend/startup.sh` to schedule the decree's execution
4. Add documentation for the decree in this file

## Technical Implementation

Decrees interact with the game's data stored in Airtable, updating records for buildings, lands, citizens, and other entities. They also generate notifications to keep players informed about changes affecting their assets and citizens.

For detailed implementation of each decree, refer to the source code in the respective script files.
