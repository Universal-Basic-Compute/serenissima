# Economic Simulation Architecture

This document outlines the architecture for the economic simulation systems in La Serenissima, focusing on land value, rent calculation, and the broader economic ecosystem.

## Overview

The economic simulation layer provides realistic economic mechanics that drive gameplay while maintaining historical authenticity. It models Renaissance Venetian economic principles while ensuring game balance and player engagement.

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
2. **Banking System**: Loans, interest, and financial instruments
3. **Guild Mechanics**: Economic effects of guild membership and regulations
4. **Tax System**: Implementation of historically accurate taxation

## Technical Implementation

The economic simulation is implemented as:

1. **Server-side API endpoints**: For consistent calculation across all clients
2. **Client-side prediction**: For responsive UI feedback
3. **Cached results**: For performance optimization
4. **Configurable parameters**: For easy balancing and tuning
