# Economic Simulation Architecture

This document outlines the architecture for the economic simulation systems in La Serenissima, focusing on land value, rent calculation, and the broader economic ecosystem.

## Overview

The economic simulation layer provides realistic economic mechanics that drive gameplay while maintaining historical authenticity. It models Renaissance Venetian economic principles while ensuring game balance and player engagement.

## Economic Loop Visualization

La Serenissima operates as a closed economic system where value circulates between players and AI-controlled entities. Unlike traditional games with infinite resource generation, wealth must be captured rather than created from nothing.

```ascii
                                  ┌───────────────────┐
                                  │                   │
                                  │  Resource Inputs  │
                                  │                   │
                                  └─────────┬─────────┘
                                            │
                                            ▼
┌───────────────────┐           ┌───────────────────┐           ┌───────────────────┐
│                   │           │                   │           │                   │
│  Player Actions   │◄────────►│   Production &    │◄────────►│   AI Citizens     │
│  & Investments    │           │   Manufacturing   │           │   & Merchants     │
│                   │           │                   │           │                   │
└─────────┬─────────┘           └─────────┬─────────┘           └─────────┬─────────┘
          │                               │                               │
          │                               ▼                               │
          │                     ┌───────────────────┐                     │
          │                     │                   │                     │
          └────────────────────►│   Marketplace    │◄────────────────────┘
                                │   & Trading      │
                                │                   │
                                └─────────┬─────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │                       │
                              │  Taxes, Fees, Rents   │
                              │  & Value Extraction   │
                              │                       │
                              └───────────┬───────────┘
                                          │
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │                       │
                              │  Reinvestment &       │
                              │  Wealth Accumulation  │
                              │                       │
                              └───────────────────────┘
```

### Closed Economy Principles

1. **Zero-Sum Value Capture**: The total amount of $COMPUTE in the system remains relatively constant. Economic success comes from capturing a larger share of the existing value pool rather than generating new value from nothing.

2. **Value Flow Cycles**: $COMPUTE tokens flow through the system in predictable cycles:
   - Players invest in land, buildings, and production
   - These investments generate goods and services
   - AI citizens and other players purchase these goods and services
   - Revenue is collected as profit, rent, or fees
   - Profits are reinvested to expand economic activity

3. **Competitive Advantage**: Players succeed by:
   - Securing strategic locations with higher foot traffic
   - Creating efficient production chains
   - Developing specialized businesses that fill market gaps
   - Building complementary businesses that create synergies
   - Timing investments to match market conditions

4. **Economic Interdependence**: No player can succeed entirely alone:
   - Raw materials must be sourced from specific locations
   - Manufacturing requires specialized buildings and skills
   - Distribution depends on transportation networks
   - Consumption requires a population of AI citizens and other players

This closed economic system creates meaningful economic gameplay where strategic decisions have lasting consequences and where cooperation can be as valuable as competition.


## Land Value and Rent System

### Core Components

1. **Land Value Calculator**: Determines the base value of land parcels based on:
   - Physical attributes (size, shape, waterfront access)
   - Location (proximity to city center, landmarks)
   - Historical significance

2. **Rent Calculation Engine**: Simulates realistic rent for buildings based on:
   - Land area (proportional relationship)
   - Distance from Venice center (scaling factor)
   - Building type and tier
   - Economic conditions

3. **Market Dynamics Simulator**: Adjusts values based on:
   - Supply and demand
   - Player activity
   - Seasonal events
   - Historical economic events

### Implementation Details

The rent calculation system uses the following approach:

```typescript
// Calculate rent based on multiple factors
function calculateRent(parcel, buildingType, economicConditions) {
  // Base calculation from land area
  const baseRent = calculateBaseRent(parcel.areaInSquareMeters);
  
  // Apply location multiplier (1x-5x based on distance from center)
  const locationMultiplier = calculateLocationMultiplier(
    parcel.centroid, 
    VENICE_CENTER
  );
  
  // Apply building type multiplier
  const buildingMultiplier = getBuildingMultiplier(buildingType);
  
  // Apply economic conditions
  const economicMultiplier = getEconomicMultiplier(economicConditions);
  
  // Calculate final rent
  return baseRent * locationMultiplier * buildingMultiplier * economicMultiplier;
}
```

## Economic Balance

The economic simulation is calibrated using the following reference points:

1. **Market Stall**: The basic commercial building (150,000 ducats construction cost, 8,000 ducats daily income)
2. **Land Area**: Typical land parcels range from 20-5000 square meters
3. **Location Premium**: Central locations command up to 5x the rent of peripheral locations

## Integration Points

The economic simulation integrates with:

1. **Land System**: Provides value and rent data for land parcels
2. **Building System**: Calculates operating costs and income for buildings
3. **Player Economy**: Affects player income and expenses
4. **AI Behavior**: Influences NPC economic decisions
5. **Event System**: Responds to and triggers economic events

## Future Expansion

The economic simulation architecture supports future expansion:

1. **Trade Networks**: Simulating goods flow between regions
2. **Banking System**: Loans, interest, and financial instruments (partially implemented)
3. **Guild Mechanics**: Economic effects of guild membership and regulations
4. **Tax System**: Implementation of historically accurate taxation

## Loan System

The loan system provides financial instruments for players to borrow and lend $COMPUTE:

1. **Loan Types**:
   - Treasury Loans: Official loans from the Venetian government
   - Private Loans: Loans between players
   - Specialized Loans: Purpose-specific loans with unique terms

2. **Loan Parameters**:
   - Principal Amount: The amount borrowed
   - Interest Rate: Annual percentage rate
   - Term: Duration in days
   - Payment Schedule: Daily payment amounts

3. **Loan Lifecycle**:
   - Application: Players apply for available loans
   - Approval: Lenders approve loan applications
   - Disbursement: Funds are transferred to borrower
   - Repayment: Borrower makes regular payments
   - Completion: Loan is fully repaid or defaulted

4. **Economic Impact**:
   - Provides capital for development and expansion
   - Creates financial relationships between players
   - Influences land values and economic activity
   - Simulates historical Venetian banking practices

## Technical Implementation

The economic simulation is implemented as:

1. **Server-side API endpoints**: For consistent calculation across all clients
2. **Client-side prediction**: For responsive UI feedback
3. **Cached results**: For performance optimization
4. **Configurable parameters**: For easy balancing and tuning
