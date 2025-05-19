// Define interfaces for better type safety
interface Problem {
  problemId: string;
  citizen: string;
  assetType: string;
  assetId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'ignored';
  createdAt: string;
  updatedAt: string;
  location: string;
  title: string;
  description: string;
  solutions: string;
  notes?: string;
}

export class ProblemService {
  /**
   * Detect lands with no buildings
   */
  public async detectLandsWithNoBuildings(username: string): Promise<Record<string, any>> {
    try {
      // Fetch lands owned by the citizen
      const lands = await this.fetchLands(username);
      
      if (lands.length === 0) {
        console.log(`Citizen ${username} does not own any lands`);
        return {};
      }
      
      // Fetch buildings on these lands
      const buildingsResponse = await fetch(`${this.getBaseUrl()}/api/buildings`);
      if (!buildingsResponse.ok) {
        throw new Error(`Failed to fetch buildings: ${buildingsResponse.status}`);
      }
      
      const buildingsData = await buildingsResponse.json();
      const buildings = buildingsData.buildings || [];
      
      // Group buildings by land_id
      const buildingsByLand: Record<string, any[]> = {};
      buildings.forEach((building: any) => {
        const landId = building.land_id;
        if (!buildingsByLand[landId]) {
          buildingsByLand[landId] = [];
        }
        buildingsByLand[landId].push(building);
      });
      
      // Find lands with no buildings
      const problems: Record<string, any> = {};
      
      lands.forEach(land => {
        const landId = land.id;
        const buildingsOnLand = buildingsByLand[landId] || [];
        
        if (buildingsOnLand.length === 0) {
          // Create a problem for this land
          const problemId = `no_buildings_${landId}_${Date.now()}`;
          
          problems[problemId] = {
            problemId,
            citizen: username,
            assetType: 'land',
            assetId: landId,
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: land.historicalName || `Land #${landId}`,
            title: `No Buildings on Land`,
            description: this.generateNoBuildingsDescription(land),
            solutions: this.generateNoBuildingsSolutions(land),
            notes: `Land has ${land.buildingPoints || 0} building points available`
          };
        }
      });
      
      return problems;
    } catch (error) {
      console.error('Error detecting lands with no buildings:', error);
      return {};
    }
  }
  
  /**
   * Fetch lands owned by a citizen
   */
  private async fetchLands(owner?: string): Promise<any[]> {
    try {
      // Construct the URL with optional owner filter
      const url = owner 
        ? `${this.getBaseUrl()}/api/lands?owner=${encodeURIComponent(owner)}` 
        : `${this.getBaseUrl()}/api/lands`;
      
      console.log(`Fetching lands from API: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch lands: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.lands)) {
        console.log(`Successfully fetched ${data.lands.length} lands from API`);
        return data.lands;
      } else {
        console.error('Invalid response format from lands API:', data);
        return [];
      }
    } catch (error) {
      console.error('Error fetching lands:', error);
      return [];
    }
  }
  
  /**
   * Generate description for no buildings problem
   */
  private generateNoBuildingsDescription(land: any): string {
    const landName = land.historicalName 
      ? `**${land.historicalName}**` 
      : `**Land #${land.id}**`;
    
    const buildingPoints = land.buildingPoints || 0;
    
    return `${landName} has no buildings constructed on it. This land has **${buildingPoints} building points** available for construction.\n\n` +
           `### Economic Impact\n` +
           `- Undeveloped land is subject to higher Vigesima Variabilis tax rates\n` +
           `- You are not generating any income from this property\n` +
           `- The land's potential is not being utilized`;
  }
  
  /**
   * Generate solutions for no buildings problem
   */
  private generateNoBuildingsSolutions(land: any): string {
    return `### Recommended Solutions\n` +
           `- Construct buildings on this land to generate income\n` +
           `- Consider building types that match the district's character\n` +
           `- If you lack funds to develop, consider selling or leasing the land\n` +
           `- Visit the building menu to see construction options`;
  }
  
  /**
   * Get base URL for API calls
   */
  private getBaseUrl(): string {
    return typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  }
}

// Export a singleton instance
export const problemService = new ProblemService();
