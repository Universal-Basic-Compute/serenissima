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
  public async detectLandsWithNoBuildings(username: string = ''): Promise<Record<string, any>> {
    try {
      // Fetch all lands or lands owned by the specified username if provided
      const apiUrl = username 
        ? `${this.getBaseUrl()}/api/lands?owner=${encodeURIComponent(username)}`
        : `${this.getBaseUrl()}/api/lands`;
      
      const landsResponse = await fetch(apiUrl);
      if (!landsResponse.ok) {
        throw new Error(`Failed to fetch lands: ${landsResponse.status}`);
      }
      
      const landsData = await landsResponse.json();
      const lands = landsData.lands || [];
      
      if (lands.length === 0) {
        console.log('No lands found');
        return {};
      }
      
      // Fetch all buildings
      const buildingsResponse = await fetch(`${this.getBaseUrl()}/api/buildings`);
      if (!buildingsResponse.ok) {
        throw new Error(`Failed to fetch buildings: ${buildingsResponse.status}`);
      }
      
      const buildingsData = await buildingsResponse.json();
      const buildings = buildingsData.buildings || [];
      
      // Group buildings by land_id for quick lookup
      const buildingsByLand: Record<string, any[]> = {};
      buildings.forEach((building: any) => {
        const landId = building.land_id;
        if (!buildingsByLand[landId]) {
          buildingsByLand[landId] = [];
        }
        buildingsByLand[landId].push(building);
      });
      
      // Create problems for lands with no buildings
      const problems: Record<string, any> = {};
      
      lands.forEach(land => {
        const landId = land.id;
        const landOwner = land.owner || 'Unknown';
        const buildingsOnLand = buildingsByLand[landId] || [];
        
        if (buildingsOnLand.length === 0) {
          // Create a problem for this land
          const problemId = `no_buildings_${landId}_${Date.now()}`;
          
          problems[problemId] = {
            problemId,
            citizen: landOwner, // Use the land owner as the citizen
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
            notes: `Land has ${land.buildingPoints?.length || 0} building points available`,
            center: land.center // Include the center field from the land data
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
