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
  hourlyAmount?: number;
  transporter?: string;
}

export class ContractService {
  private static instance: ContractService;
  private contractsCache: Contract[] | null = null;
  private contractsByLocation: Record<string, Contract[]> | null = null;
  private contractsByBuilding: Record<string, Contract[]> | null = null;
  private lastFetchTime: number = 0;
  private fetchPromise: Promise<Contract[]> | null = null;
  
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
    // If we have a fetch in progress, return that promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    
    // If we have cached contracts and they're less than 30 seconds old, return them
    const now = Date.now();
    if (this.contractsCache && now - this.lastFetchTime < 30000) {
      console.log('Using cached contracts data');
      return this.contractsCache;
    }
    
    // Otherwise, fetch new contracts
    try {
      // Create a new promise for this fetch
      this.fetchPromise = this.fetchContractsFromAPI(username);
      const contracts = await this.fetchPromise;
      
      // Update the cache and last fetch time
      this.contractsCache = contracts;
      this.lastFetchTime = now;
      
      // Process contracts for faster lookups
      this.processContracts(contracts);
      
      return contracts;
    } catch (error) {
      console.error('Error fetching contracts:', error);
      // If we have cached data, return it even if it's old
      return this.contractsCache || [];
    } finally {
      // Clear the fetch promise
      this.fetchPromise = null;
    }
  }
  
  /**
   * Fetch contracts from the API
   */
  private async fetchContractsFromAPI(username?: string): Promise<Contract[]> {
    // Build URL with username if available
    const url = username 
      ? `/api/contracts?username=${encodeURIComponent(username)}`
      : '/api/contracts';
    
    console.log(`Fetching contracts from: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch contracts: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Unknown error fetching contracts');
    }
    
    console.log(`Received ${data.contracts.length} contracts`);
    return data.contracts;
  }
  
  /**
   * Process contracts into lookup maps for faster access
   */
  private processContracts(contracts: Contract[]): void {
    // Group contracts by location
    this.contractsByLocation = {};
    this.contractsByBuilding = {};
    
    contracts.forEach(contract => {
      // Process by location
      if (contract.location) {
        const locationKey = `${contract.location.lat.toFixed(6)}_${contract.location.lng.toFixed(6)}`;
        if (!this.contractsByLocation![locationKey]) {
          this.contractsByLocation![locationKey] = [];
        }
        this.contractsByLocation![locationKey].push(contract);
      }
      
      // Process by building
      if (contract.sellerBuilding) {
        if (!this.contractsByBuilding![contract.sellerBuilding]) {
          this.contractsByBuilding![contract.sellerBuilding] = [];
        }
        this.contractsByBuilding![contract.sellerBuilding].push(contract);
      }
    });
  }
  
  /**
   * Get contracts grouped by location
   */
  public async getContractsByLocation(): Promise<Record<string, Contract[]>> {
    // Ensure contracts are loaded
    await this.getContracts();
    return this.contractsByLocation || {};
  }
  
  /**
   * Get contracts for a specific building
   */
  public async getContractsForBuilding(buildingId: string): Promise<Contract[]> {
    // Ensure contracts are loaded
    await this.getContracts();
    return this.contractsByBuilding?.[buildingId] || [];
  }
  
  /**
   * Get contracts for a specific location
   */
  public async getContractsForLocation(lat: number, lng: number): Promise<Contract[]> {
    // Ensure contracts are loaded
    await this.getContracts();
    const locationKey = `${lat.toFixed(6)}_${lng.toFixed(6)}`;
    return this.contractsByLocation?.[locationKey] || [];
  }
  
  /**
   * Get contracts for a specific resource type
   */
  public async getContractsForResourceType(resourceType: string): Promise<Contract[]> {
    // Ensure contracts are loaded
    await this.getContracts();
    
    // Filter contracts by resource type
    return this.contractsCache?.filter(contract => 
      contract.resourceType.toLowerCase() === resourceType.toLowerCase()
    ) || [];
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
   * Clear the cache to force a reload of contracts
   */
  public clearCache(): void {
    this.contractsCache = null;
    this.contractsByLocation = null;
    this.contractsByBuilding = null;
    this.lastFetchTime = 0;
  }
}

// Export a singleton instance
export const contractService = new ContractService();
