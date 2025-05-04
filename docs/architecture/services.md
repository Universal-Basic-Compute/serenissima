# Service Layer Architecture

The service layer in La Serenissima provides a clean interface for business logic and data access. It abstracts away implementation details and provides a consistent API for components.

## Service Categories

1. **Data Services**: Handle data fetching, caching, and persistence
2. **Domain Services**: Implement business logic
3. **Integration Services**: Connect to external systems
4. **Utility Services**: Provide common functionality

## Service Implementation

Services are implemented as TypeScript classes with well-defined interfaces. Each service should:

1. Have a clear responsibility
2. Expose a public API
3. Hide implementation details
4. Be testable in isolation
5. Follow the singleton pattern when appropriate

## Core Services

### UserService

Responsible for user authentication, profile management, and preferences.

```typescript
export interface UserProfile {
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImage: string | null;
  familyMotto?: string;
  familyCoatOfArms?: string;
  color?: string;
  computeAmount?: number;
  walletAddress?: string;
}

export class UserService {
  public getCurrentUser(): UserProfile | null;
  public getWalletAddress(): string | null;
  public connectWallet(address: string): Promise<UserProfile | null>;
  public disconnectWallet(): void;
  public updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile | null>;
}
```

### PolygonService

Manages polygon data, ownership, and interactions.

```typescript
export class PolygonService {
  public loadPolygons(): Promise<Polygon[]>;
  public loadLandOwners(): Promise<Record<string, string>>;
  public getPolygons(): Polygon[];
  public getPolygonById(id: string): Polygon | undefined;
  public getLandOwners(): Record<string, string>;
  public getLandOwner(landId: string): string | undefined;
  public updateLandOwner(landId: string, newOwner: string): void;
}
```

### TransactionService

Handles marketplace transactions and token transfers.

```typescript
export class TransactionService {
  public getAvailableTransactions(): Promise<Transaction[]>;
  public getTransactionById(id: string): Promise<Transaction | null>;
  public createTransaction(data: TransactionData): Promise<Transaction>;
  public executeTransaction(id: string, buyer: string): Promise<Transaction>;
  public cancelTransaction(id: string): Promise<boolean>;
}
```

### WalletService

Manages wallet connections and blockchain interactions.

```typescript
export class WalletService {
  public connect(): Promise<string | null>;
  public disconnect(): void;
  public isConnected(): boolean;
  public getAddress(): string | null;
  public transferTokens(amount: number): Promise<string>;
  public withdrawTokens(amount: number): Promise<string>;
}
```

## Service Registration and Discovery

Services are registered and discovered through a simple service locator pattern:

```typescript
// Service registration
ServiceLocator.register('userService', new UserService());

// Service discovery
const userService = ServiceLocator.get<UserService>('userService');
```

## Error Handling

Services should handle errors gracefully and provide meaningful error messages. Errors should be:

1. Typed with TypeScript
2. Include context information
3. Be catchable by consumers
4. Not expose implementation details

## Testing Services

Services should be designed for testability:

1. Dependencies should be injectable
2. External services should be mockable
3. Side effects should be isolated
4. Asynchronous operations should be properly handled
