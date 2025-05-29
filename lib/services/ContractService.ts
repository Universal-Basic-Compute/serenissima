export interface Contract {
  id: string;
  contractId: string;
  type: string;
  buyer: string;
  seller: string;
  resourceType: string;
  buyerBuilding?: string;
  sellerBuilding?: string;
  price: number;
  amount: number;
  createdAt: string;
  endAt: string;
  status: string;
  location?: {
    lat: number;
    lng: number;
  };
  targetAmount?: number;
  transporter?: string;
}

export class ContractService {
  private static instance: ContractService;
  // New cache structure: Map-based for different user/scope contexts
  private contractsDataCache: Map<string, { contracts: Contract[], timestamp: number }> = new Map();
  private activeFetches: Map<string, Promise<Contract[]>> = new Map();
  
  // Lookups will be derived from the currently relevant cache entry
  private contractsByLocation: Record<string, Contract[]> = {};
  private contractsByBuilding: Record<string, Contract[]> = {};
  
  public static getInstance(): ContractService {
    if (!ContractService.instance) {
      ContractService.instance = new ContractService();
    }
    return ContractService.instance;
  }
  
  /**
   * Get all contracts for the current citizen and public sell contracts
   * Uses caching with a 30-second expiry to prevent excessive API calls
   */
  public async getContracts(username?: string): Promise<Contract[]> {
    const cacheKey = username ? `user:${username}` : 'public_stocked';
    const now = Date.now();

    if (this.activeFetches.has(cacheKey)) {
      console.log(`ContractService: Active fetch found for key: ${cacheKey}. Returning promise.`);
      return this.activeFetches.get(cacheKey)!;
    }

    const cachedData = this.contractsDataCache.get(cacheKey);
    if (cachedData && now - cachedData.timestamp < 30000) { // 30-second cache
      console.log(`ContractService: Using cached contracts for key: ${cacheKey}`);
      // Repopulate lookups if cache key changed or they are empty
      // This ensures lookups (contractsByLocation, contractsByBuilding) are for the current context
      this.processContracts(cachedData.contracts);
      return cachedData.contracts;
    }

    console.log(`ContractService: Fetching new contracts for key: ${cacheKey}`);
    const fetchPromise = this._fetchAndCombineContracts(username);
    this.activeFetches.set(cacheKey, fetchPromise);

    try {
      const contracts = await fetchPromise;
      this.contractsDataCache.set(cacheKey, { contracts, timestamp: now });
      this.processContracts(contracts); // Process for byLocation/byBuilding lookups
      console.log(`ContractService: Fetched and cached ${contracts.length} contracts for key: ${cacheKey}`);
      return contracts;
    } catch (error) {
      console.error(`ContractService: Error fetching contracts for key ${cacheKey}:`, error);
      // Return stale cache on error if available
      if (cachedData) {
        console.warn(`ContractService: Returning stale cache for key ${cacheKey} due to fetch error.`);
        this.processContracts(cachedData.contracts);
        return cachedData.contracts;
      }
      return [];
    } finally {
      this.activeFetches.delete(cacheKey);
    }
  }

  private async _fetchAndCombineContracts(username?: string): Promise<Contract[]> {
    let contracts: Contract[] = [];
    const stockedPublicPromise = fetch(`/api/contracts/stocked-public-sell`)
      .then(res => {
        if (!res.ok) return Promise.reject(new Error(`StockedPublicSell fetch failed: ${res.status} ${res.statusText}`));
        return res.json();
      })
      .then(data => {
        if (!data.success) return Promise.reject(new Error(data.error || 'StockedPublicSell API error'));
        console.log(`ContractService: Fetched ${data.contracts.length} stocked public sell contracts.`);
        return data.contracts as Contract[];
      })
      .catch(err => {
        console.error("ContractService: Error fetching stocked public sell contracts:", err);
        return []; // Return empty array on error to allow partial data if user contracts succeed
      });

    if (username) {
      const userSpecificPromise = fetch(`/api/contracts?username=${encodeURIComponent(username)}&scope=userNonPublic`)
        .then(res => {
          if (!res.ok) return Promise.reject(new Error(`UserNonPublic fetch failed: ${res.status} ${res.statusText}`));
          return res.json();
        })
        .then(data => {
          if (!data.success) return Promise.reject(new Error(data.error || 'UserNonPublic API error'));
          console.log(`ContractService: Fetched ${data.contracts.length} user-specific (non-public) contracts for ${username}.`);
          return data.contracts as Contract[];
        })
        .catch(err => {
          console.error(`ContractService: Error fetching user-specific contracts for ${username}:`, err);
          return []; // Return empty array on error
        });
      
      const [stockedPublicContracts, userSpecificContracts] = await Promise.all([
        stockedPublicPromise,
        userSpecificPromise
      ]);

      // Merge: userSpecificContracts + stockedPublicContracts.
      // Deduplicate by 'id' (Airtable record ID), preferring user-specific if somehow an ID overlaps (unlikely for different types).
      // A simpler merge: combine and then filter duplicates, giving preference to stockedPublic if IDs were identical.
      // However, userSpecific should not contain public_sell, so direct combination is likely fine.
      const combined = [...userSpecificContracts];
      const userContractIds = new Set(userSpecificContracts.map(c => c.id));
      stockedPublicContracts.forEach(spc => {
        if (!userContractIds.has(spc.id)) { // Avoid duplicates if any public sell contract was somehow in userSpecific
            combined.push(spc);
        }
      });
      contracts = combined;

    } else {
      // No username, only fetch stocked public sells
      contracts = await stockedPublicPromise;
    }
    console.log(`ContractService: Total combined contracts: ${contracts.length}`);
    return contracts;
  }
  
  /**
   * Process contracts into lookup maps for faster access.
   * This should be called whenever the primary contract list (for the current context) changes.
   */
  private processContracts(contracts: Contract[]): void {
    this.contractsByLocation = {};
    this.contractsByBuilding = {};
    
    contracts.forEach(contract => {
      if (contract.location && typeof contract.location.lat === 'number' && typeof contract.location.lng === 'number') {
        const locationKey = `${contract.location.lat.toFixed(6)}_${contract.location.lng.toFixed(6)}`;
        if (!this.contractsByLocation[locationKey]) {
          this.contractsByLocation[locationKey] = [];
        }
        this.contractsByLocation[locationKey].push(contract);
      }
      
      if (contract.sellerBuilding) {
        if (!this.contractsByBuilding[contract.sellerBuilding]) {
          this.contractsByBuilding[contract.sellerBuilding] = [];
        }
        this.contractsByBuilding[contract.sellerBuilding].push(contract);
      }
    });
    // console.log('ContractService: Processed contracts into byLocation and byBuilding lookups.');
  }
  
  /**
   * Get contracts grouped by location.
   * Assumes getContracts() has been called for the relevant context to populate lookups.
   */
  public async getContractsByLocation(): Promise<Record<string, Contract[]>> {
    // Ensure contracts for the current context (user or public) are loaded and processed
    // The username context for getContracts() here depends on how/when getContractsByLocation is called.
    // Typically, getContracts() would have been called by the UI component first.
    await this.getContracts(this.getCurrentUsername()); // Ensure data for current user context is loaded
    return this.contractsByLocation;
  }
  
  /**
   * Get contracts for a specific building.
   * Assumes getContracts() has been called for the relevant context.
   */
  public async getContractsForBuilding(buildingId: string): Promise<Contract[]> {
    await this.getContracts(this.getCurrentUsername());
    return this.contractsByBuilding[buildingId] || [];
  }
  
  /**
   * Get contracts for a specific location.
   * Assumes getContracts() has been called for the relevant context.
   */
  public async getContractsForLocation(lat: number, lng: number): Promise<Contract[]> {
    await this.getContracts(this.getCurrentUsername());
    const locationKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
    return this.contractsByLocation[locationKey] || [];
  }
  
  /**
   * Get contracts for a specific resource type.
   * This will filter from the currently loaded set of contracts (user-specific + stocked public).
   */
  public async getContractsForResourceType(resourceType: string): Promise<Contract[]> {
    const currentUsername = this.getCurrentUsername();
    const contracts = await this.getContracts(currentUsername); // Ensures cache for current context is active
    
    return contracts.filter(contract => 
      contract.resourceType.toLowerCase() === resourceType.toLowerCase()
    );
  }
  
  /**
   * Get the current citizen's username from localStorage
   */
  public getCurrentUsername(): string | null {
    try {
      if (typeof window === 'undefined') return null;
      
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile && profile.username) {
          return profile.username;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting current username:', error);
      return null;
    }
  }
  
  /**
   * Clear all caches to force a reload of contracts
   */
  public clearCache(): void {
    this.contractsDataCache.clear();
    this.contractsByLocation = {};
    this.contractsByBuilding = {};
    // activeFetches are self-clearing, but good to clear if method is called externally
    this.activeFetches.clear(); 
    console.log('ContractService: All caches cleared.');
  }
}

// Export a singleton instance
export const contractService = new ContractService();
