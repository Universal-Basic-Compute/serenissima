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
}

export class ContractService {
  private static instance: ContractService;
  private contractsCache: Contract[] | null = null;
  
  public static getInstance(): ContractService {
    if (!ContractService.instance) {
      ContractService.instance = new ContractService();
    }
    return ContractService.instance;
  }
  
  /**
   * Get all contracts for the current citizen and public sell contracts
   */
  public async getContracts(username?: string): Promise<Contract[]> {
    try {
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
      
      // Cache the contracts
      this.contractsCache = data.contracts;
      
      console.log(`Received ${data.contracts.length} contracts`);
      return data.contracts;
    } catch (error) {
      console.error('Error fetching contracts:', error);
      return [];
    }
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
  }
}

// Export a singleton instance
export const contractService = new ContractService();
