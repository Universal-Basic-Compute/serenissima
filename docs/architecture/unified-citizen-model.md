# Unified Citizen Model Architecture

La Serenissima implements a unified approach to AI and human citizens, treating them as equal participants in the game's economic ecosystem. This document outlines the architecture, components, and principles of this unified citizen model.

## System Overview

The unified citizen model follows a consistent architecture where both AI and human citizens are processed through the same systems:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Unified Citizen System                            │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │                                     │
┌───────────────▼───────────────┐     ┌───────────────▼───────────────────┐
│      Data Layer               │     │      Behavior Layer                │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   Citizen Database      │  │     │  │     Activity System        │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │  Economic Transactions   │  │     │  │     Decision Making        │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
│                               │     │                                    │
│  ┌─────────────────────────┐  │     │  ┌────────────────────────────┐   │
│  │   Property Ownership    │  │     │  │     Messaging System       │   │
│  └─────────────────────────┘  │     │  └────────────────────────────┘   │
└───────────────────────────────┘     └────────────────────────────────────┘
                │                                     │
                │                                     │
┌───────────────▼─────────────────────────────────────▼───────────────────┐
│                         Visualization Layer                              │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │  Map Presence   │  │  UI Interaction │  │  Notification Display   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Principles

### 1. Shared Database Structure

Both AI and human citizens are stored in the same database tables with identical schema:

- The `CITIZENS` table stores all citizens with an `IsAI` flag to distinguish AI-controlled citizens
- All economic data (compute balance, properties owned, etc.) uses the same structure
- Relationships between citizens (employer/employee, landlord/tenant) use the same data model

### 2. Common Economic Processes

All economic engine scripts process citizens regardless of their AI status:

- Income distribution applies equally to AI and human citizens
- Rent and lease payments follow identical rules
- Maintenance costs and taxes are calculated the same way
- Loan applications and payments use the same validation and processing

### 3. Unified Activity System

Both AI and human citizens participate in the same activity system:

- Activities like rest, work, and travel are scheduled for all citizens
- The same pathfinding algorithms determine routes through Venice
- Activity visualization on the map is consistent for all citizens
- Time-based constraints apply equally to all activities

### 4. Shared Notification System

The notification system treats all citizens equally:

- Both AI and human citizens receive notifications about economic events
- Notifications trigger appropriate responses based on citizen type
- The same notification templates are used for all citizens
- Notification history is maintained for all citizens

## Technical Implementation

### Citizen Data Model

The core citizen data model is identical for both AI and human citizens:

```typescript
interface Citizen {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  walletAddress?: string;  // May be empty for AI citizens
  ducats: number;
  socialClass: 'Nobili' | 'Cittadini' | 'Popolani' | 'Facchini';
  isAI: boolean;
  home?: string;  // Reference to housing building
  work?: string;  // Reference to workplace
  familyMotto?: string;
  coatOfArms?: string;
  coatOfArmsImageUrl?: string;
  color?: string;
  // Additional properties...
}
```

### Decision Making

The key difference between AI and human citizens is in decision making:

1. **Human Citizens**: Make decisions through UI interactions
   - Land purchases via marketplace UI
   - Building placement via building menu
   - Economic decisions via various UI panels

2. **AI Citizens**: Make decisions through automated scripts
   - Land bidding via `bidonlands.py`
   - Building construction via `buildbuildings.py`
   - Lease/rent adjustments via adjustment scripts

The underlying economic rules and constraints remain identical, ensuring fair competition and consistent behavior.

### Activity System Integration

The activity system creates a unified approach to citizen movement and daily routines:

1. **Activity Creation**: Both AI and human citizens have activities created by `createActivities.py`
2. **Activity Types**: All citizens can engage in rest, work, travel, and idle activities
3. **Activity Visualization**: The same visualization system shows all citizens on the map
4. **Activity Constraints**: Time and location constraints apply equally to all citizens

### Messaging System

The messaging system allows communication between all citizens:

1. **Message Storage**: All messages use the same database structure
2. **AI Responses**: AI citizens respond to messages through `answertomessages.py`
3. **Message History**: Complete message history is maintained for all citizens
4. **UI Integration**: The same UI components display messages for all citizens

## Benefits of the Unified Approach

### 1. Technical Efficiency

- Single codebase for all citizen processing
- Reduced duplication of logic
- Simplified testing and validation
- Consistent behavior across the system

### 2. Economic Realism

- Contract forces apply equally to all participants
- No artificial advantages for either citizen type
- Realistic competition and cooperation
- Emergent economic behaviors from interactions

### 3. Scalability

- Game world maintains appropriate population density regardless of player count
- Economic systems remain balanced with varying human player numbers
- New features automatically apply to both citizen types
- Performance optimizations benefit the entire system

### 4. Historical Authenticity

- Better simulation of Renaissance Venice's social dynamics
- Realistic population density and economic activity
- Authentic social stratification and mobility
- Historically accurate economic relationships

## Implementation Challenges and Solutions

### Challenge: Balancing AI Competitiveness

**Solution**: AI citizens are programmed with varying levels of economic aggressiveness based on their social class and personality traits. This creates a spectrum of AI behaviors from highly competitive to more passive, ensuring human players always have opportunities while still facing meaningful competition.

### Challenge: Preventing AI Domination

**Solution**: The system includes checks and balances to prevent AI citizens from dominating the economy:
- AI citizens have resource constraints just like human players
- They make occasional suboptimal decisions to create opportunities for humans
- Their decision-making includes reasonable delays to give human players time to act

### Challenge: Creating Meaningful AI Personalities

**Solution**: Each AI citizen has:
- A unique personality profile that influences their economic decisions
- Consistent response patterns in messaging
- A personal history that affects their goals and preferences
- Social connections with other citizens (both AI and human)

### Challenge: Performance Optimization

**Solution**: The system uses:
- Batched processing for AI citizen actions
- Priority-based scheduling that focuses computational resources on AI citizens currently interacting with human players
- Simplified simulation for AI citizens in areas with no recent human activity

## Integration with Other Systems

The unified citizen model integrates with several other game systems:

### Economic Simulation

- Both citizen types participate equally in the economic simulation
- The same economic rules apply to all citizens
- Economic transactions between any citizen types follow identical processing

### Navigation System

- All citizens use the same navigation graph for pathfinding
- The same transportation options are available to all citizens
- Movement visualization is consistent across citizen types

### Building System

- Building ownership, construction, and maintenance follow the same rules
- Building placement validation is identical for all citizens
- Building income and expenses are calculated consistently

### Resource Management

- Resource gathering, production, and consumption use the same mechanics
- Resource ownership and transfer follow identical rules
- Resource visualization is consistent across citizen types

## Future Directions

The unified citizen system will continue to evolve with:

1. **More Complex AI Behaviors**: Expanding the range and sophistication of AI economic decisions
2. **Deeper Social Interactions**: Enhancing the messaging system with more nuanced AI responses
3. **Political Participation**: Involving AI citizens in governance mechanics and political decisions
4. **Learning AI**: Implementing systems where AI citizens learn from successful human strategies
5. **Citizen Relationships**: Creating more complex relationship networks between AI and human citizens

## Conclusion

The unified approach to AI and human citizens in La Serenissima creates a rich, dynamic, and historically authentic simulation of Renaissance Venice. By treating all citizens as equal participants in the economic ecosystem, the game provides a more immersive and realistic experience while maintaining balance and creating meaningful opportunities for human players.

This approach transforms La Serenissima from a simple game into a living laboratory for economic principles, where the interactions between AI and human citizens create emergent behaviors and unexpected outcomes that mirror the complexity of real-world economies.
