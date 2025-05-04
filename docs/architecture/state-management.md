# State Management Architecture

La Serenissima uses a centralized state management approach to maintain a single source of truth for application state.

## State Management Principles

1. **Single Source of Truth**: All application state is stored in a central store
2. **Read-Only State**: State is never directly modified
3. **Changes through Actions**: State changes are made through explicit actions
4. **Predictable Updates**: State updates are predictable and traceable

## State Structure

The application state is organized into domains:

```typescript
interface RootState {
  user: UserState;
  polygons: PolygonState;
  transactions: TransactionState;
  ui: UIState;
}

interface UserState {
  profile: UserProfile | null;
  walletAddress: string | null;
  loading: boolean;
  error: string | null;
}

interface PolygonState {
  polygons: Polygon[];
  landOwners: Record<string, string>;
  selectedPolygonId: string | null;
  hoveredPolygonId: string | null;
  activeView: ViewMode;
  loading: boolean;
  error: string | null;
}

interface BuildingState {
  categories: BuildingCategory[];
  selectedBuilding: Building | null;
  selectedVariant: string;
  availableVariants: string[];
  placeableBuilding: { name: string; variant: string } | null;
  loading: boolean;
  error: string | null;
}

interface TransactionState {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
}

interface UIState {
  modals: {
    landPurchase: boolean;
    transferCompute: boolean;
    buildingMenu: boolean;
  };
  notifications: Notification[];
  performanceMode: boolean;
}
```

## State Management Implementation

We use Zustand for state management, which provides:

1. Simple API with hooks
2. TypeScript support
3. Minimal boilerplate
4. Good performance characteristics
5. DevTools integration

## Store Implementation

Each domain has its own store:

```typescript
// User store
export const useUserStore = create<UserState & UserActions>((set) => ({
  profile: null,
  walletAddress: null,
  loading: false,
  error: null,
  
  setProfile: (profile) => set({ profile }),
  setWalletAddress: (address) => set({ walletAddress: address }),
  clearUser: () => set({ profile: null, walletAddress: null }),
  // ...other actions
}));

// Polygon store
export const usePolygonStore = create<PolygonState & PolygonActions>((set, get) => ({
  polygons: [],
  landOwners: {},
  selectedPolygonId: null,
  hoveredPolygonId: null,
  activeView: 'land',
  loading: false,
  error: null,
  
  setPolygons: (polygons) => set({ polygons }),
  setLandOwners: (landOwners) => set({ landOwners }),
  setSelectedPolygonId: (id) => set({ selectedPolygonId: id }),
  setHoveredPolygonId: (id) => set({ hoveredPolygonId: id }),
  setActiveView: (view) => set({ activeView: view }),
  // ...other actions
}));

// Building store
export const useBuildingStore = create<BuildingState & BuildingActions>((set, get) => ({
  categories: [],
  selectedBuilding: null,
  selectedVariant: 'model',
  availableVariants: [],
  placeableBuilding: null,
  loading: false,
  error: null,
  
  loadBuildingCategories: async () => {
    set({ loading: true, error: null });
    try {
      // Fetch building data from API
      // ...
      set({ categories: loadedCategories, loading: false });
      return loadedCategories;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  setSelectedBuilding: (building) => set({ selectedBuilding: building }),
  setSelectedVariant: (variant) => set({ selectedVariant: variant }),
  // ...other actions
}));

// Transaction store
export const useTransactionStore = create<TransactionState & TransactionActions>((set) => ({
  transactions: [],
  loading: false,
  error: null,
  
  setTransactions: (transactions) => set({ transactions }),
  // ...other actions
}));

// UI store
export const useUIStore = create<UIState & UIActions>((set) => ({
  modals: {
    landPurchase: false,
    transferCompute: false,
    buildingMenu: false,
  },
  notifications: [],
  performanceMode: false,
  
  showModal: (modal) => set((state) => ({
    modals: { ...state.modals, [modal]: true }
  })),
  hideModal: (modal) => set((state) => ({
    modals: { ...state.modals, [modal]: false }
  })),
  // ...other actions
}));
```

## State Access in Components

Components access state through hooks:

```typescript
const MyComponent = () => {
  const { profile, walletAddress } = useUserStore();
  const { selectedPolygonId, setSelectedPolygonId } = usePolygonStore();
  
  // Component logic
};
```

## State Updates

State is updated through actions defined in the store:

```typescript
const MyComponent = () => {
  const { setSelectedPolygonId } = usePolygonStore();
  
  const handlePolygonClick = (id) => {
    setSelectedPolygonId(id);
  };
  
  // Component logic
};
```

## Async State Updates

Async state updates are handled through async actions:

```typescript
export const usePolygonStore = create<PolygonState & PolygonActions>((set, get) => ({
  // ...state
  
  loadPolygons: async () => {
    set({ loading: true, error: null });
    try {
      const polygons = await polygonService.loadPolygons();
      set({ polygons, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
  
  // ...other actions
}));
```

## State Persistence

Critical state is persisted to localStorage:

```typescript
export const useUserStore = create<UserState & UserActions>(
  persist(
    (set) => ({
      // ...state and actions
    }),
    {
      name: 'user-storage',
      getStorage: () => localStorage,
    }
  )
);
```

## State Synchronization

State is synchronized with the server through services:

```typescript
const updateProfile = async (profile) => {
  set({ loading: true, error: null });
  try {
    const updatedProfile = await userService.updateUserProfile(profile);
    set({ profile: updatedProfile, loading: false });
  } catch (error) {
    set({ error: error.message, loading: false });
  }
};
```
