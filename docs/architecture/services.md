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
6. Implement appropriate caching strategies

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
  public configureCaching(config: Partial<CacheConfig>): void;
  public clearCache(): void;
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

### RoadService

Manages road data persistence and retrieval.

```typescript
export interface RoadData {
  id: string;
  points: { x: number; y: number; z: number }[];
  curvature: number;
  createdBy?: string;
  landId?: string;
  createdAt?: string;
}

export class RoadService {
  public static getInstance(): RoadService;
  public saveRoad(points: THREE.Vector3[], curvature: number, userId?: string, landId?: string): RoadData;
  public getRoads(): RoadData[];
  public getRoadById(id: string): RoadData | undefined;
  public deleteRoad(id: string): boolean;
  public updateRoad(id: string, updates: Partial<RoadData>): RoadData | null;
  public convertPoints(points: THREE.Vector3[]): { x: number; y: number; z: number }[];
  public convertToVector3Points(points: { x: number; y: number; z: number }[]): THREE.Vector3[];
  public saveRoadToServer(roadId: string): Promise<boolean>;
  public loadRoadsFromServer(): Promise<RoadData[]>;
}
```

### BuildingService

Manages building data, including docks.

```typescript
export interface DockData {
  id: string;
  landId: string;
  position: { x: number; y: number; z: number };
  rotation: number; // Rotation in radians
  connectionPoints: { x: number; y: number; z: number }[];
  createdBy: string;
  createdAt: string;
}

export class BuildingService {
  public static getInstance(): BuildingService;
  
  // Building methods
  public getBuildings(type?: string): Promise<any[]>;
  public getBuildingById(id: string): Promise<any | null>;
  public saveBuilding(buildingData: any): Promise<any>;
  
  // Dock-specific methods
  public createDock(landId: string, position: THREE.Vector3, rotation: number): Promise<DockData>;
  public getDocks(): Promise<DockData[]>;
  public getDockById(id: string): Promise<DockData | null>;
}
```

The RoadService follows the singleton pattern and provides methods for:

1. **Data Persistence**: Saving and loading roads from local storage
2. **Data Retrieval**: Getting all roads or specific roads by ID
3. **Data Manipulation**: Creating, updating, and deleting roads
4. **Data Conversion**: Converting between THREE.Vector3 and plain objects
5. **Server Synchronization**: Saving roads to and loading roads from the server

## Service Registration and Discovery

Services are registered and discovered through a simple service locator pattern:

```typescript
// Service registration
ServiceLocator.register('userService', new UserService());

// Service discovery
const userService = ServiceLocator.get<UserService>('userService');
```

## Error Handling

Services use a structured error handling approach with typed errors. All service errors extend from a base `ServiceError` class:

```typescript
// Base error class
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Specific error types
export class ApiError extends ServiceError {
  public status: number;
  public endpoint: string;
  
  constructor(message: string, status: number, endpoint: string) {
    super(`API Error (${status}): ${message} [${endpoint}]`);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}
```

Service methods should:

1. Document which errors they might throw
2. Include context information in errors
3. Catch and convert generic errors to typed errors
4. Log errors appropriately

Example usage:

```typescript
/**
 * Connect wallet
 * @throws {ValidationError} If address is invalid
 * @throws {ApiError} If API request fails
 */
public async connectWallet(address: string): Promise<UserProfile | null> {
  if (!address || address.trim() === '') {
    throw new ValidationError('Wallet address cannot be empty', 'address');
  }
  
  try {
    // API call logic
  } catch (error) {
    if (error instanceof ApiError) {
      log.error(error);
      throw error;
    }
    
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      endpoint
    );
  }
}
```

Consumers should handle these typed errors appropriately:

```typescript
try {
  await userService.connectWallet(address);
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation error
  } else if (error instanceof ApiError) {
    // Handle API error
  } else {
    // Handle unexpected error
  }
}
```

## Testing Services

Services should be designed for testability:

1. Dependencies should be injectable
2. External services should be mockable
3. Side effects should be isolated
4. Asynchronous operations should be properly handled
