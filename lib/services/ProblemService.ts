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
      
      console.log(`Found ${lands.length} lands to check for buildings`);
      
      // Fetch all buildings
      const buildingsResponse = await fetch(`${this.getBaseUrl()}/api/buildings`);
      if (!buildingsResponse.ok) {
        throw new Error(`Failed to fetch buildings: ${buildingsResponse.status}`);
      }
      
      const buildingsData = await buildingsResponse.json();
      const buildings = buildingsData.buildings || [];
      
      console.log(`Found ${buildings.length} buildings total`);
      
      // Group buildings by landId for quick lookup
      const buildingsByLand: Record<string, any[]> = {};
      buildings.forEach((building: any) => {
        const landId = building.landId; // This is the field from the BUILDING record (e.g., "L001")
        if (landId && typeof landId === 'string') { // Ensure landId is a valid string
          if (!buildingsByLand[landId]) {
            buildingsByLand[landId] = [];
          }
          buildingsByLand[landId].push(building);
        } else {
          // Optionally log buildings with missing or invalid landId
           console.warn(`Building ${building.id || building.Name || 'Unknown ID'} (Type: ${building.Type}) has missing or invalid landId: '${landId}'`);
        }
      });
      
      console.log(`Grouped buildings by landId, found ${Object.keys(buildingsByLand).length} distinct landIds with buildings`);
      
      // Debug: Log the first few land IDs and their building counts
      const landIds = Object.keys(buildingsByLand).slice(0, 5);
      landIds.forEach(landId => {
        console.log(`Land ${landId} has ${buildingsByLand[landId].length} buildings`);
      });
      
      // Create problems for lands with no buildings
      const problems: Record<string, any> = {};
      
      // Enhanced logging for debugging
      console.log(`[ProblemService] Sample of first 3 land objects from API: ${JSON.stringify(lands.slice(0,3).map(l => ({ id: l.id, landId: l.landId, LandId: (l as any).LandId, owner: l.owner, historicalName: l.historicalName })), null, 2)}`);
      console.log(`[ProblemService] Sample of first 3 building objects (relevant fields) used to build buildingsByLand: ${JSON.stringify(buildings.slice(0,3).map(b => ({id: b.id, land_id: b.land_id, type: b.type})), null, 2)}`);
      const buildingsByLandKeysSample = Object.keys(buildingsByLand).slice(0,10);
      console.log(`[ProblemService] Sample keys in buildingsByLand map (${buildingsByLandKeysSample.length} sample keys): ${buildingsByLandKeysSample.join(', ')}`);
      if (buildingsByLandKeysSample.length > 0 && buildingsByLand[buildingsByLandKeysSample[0]]) {
        console.log(`[ProblemService] Example: buildingsByLand['${buildingsByLandKeysSample[0]}'] has ${buildingsByLand[buildingsByLandKeysSample[0]].length} buildings.`);
      }


      lands.forEach(land => {
        // Attempt to get the custom land ID, checking common property names/casing
        // land.landId (expected camelCase from a well-structured API)
        // (land as any).LandId (PascalCase, as it might be named in Airtable and directly passed by a simpler API)
        const customLandId = land.landId || (land as any).LandId; 
        const airtableRecordId = land.id; // Airtable record ID, for fallback asset ID

        if (!customLandId) {
          console.warn(`[ProblemService] Land with Airtable ID ${airtableRecordId} is missing its custom land identifier (checked land.landId and land.LandId). Owner: ${land.owner}. HistoricalName: ${land.historicalName}`);
        }
        
        // Use customLandId for lookup if available.
        // buildingsByLand is keyed by building.land_id, which should be the custom LandId.
        const buildingsOnLand = customLandId ? (buildingsByLand[customLandId] || []) : [];
        
        // Log details for each land processed for easier debugging
        // console.log(`[ProblemService] Processing Land (Airtable ID: ${airtableRecordId}, Custom ID used: '${customLandId}', Owner: ${land.owner}): Found ${buildingsOnLand.length} buildings via buildingsByLand map.`);

        if (!customLandId || buildingsOnLand.length === 0) {
          if (customLandId && buildingsOnLand.length === 0) {
            // This means customLandId was found on the land record, but no matching entry in buildingsByLand
            // Check for potential case-insensitivity or whitespace issues if this log appears often
            const lowerCustomLandId = customLandId.toLowerCase().trim();
            const foundCaseInsensitive = Object.keys(buildingsByLand).find(k => k.toLowerCase().trim() === lowerCustomLandId);
            if (foundCaseInsensitive && foundCaseInsensitive !== customLandId) {
                console.warn(`[ProblemService] Potential case/whitespace mismatch for landId '${customLandId}'. Found similar key '${foundCaseInsensitive}' in buildingsByLand map.`);
            } else if (!foundCaseInsensitive) {
                // console.log(`[ProblemService] Land with customLandId '${customLandId}' had 0 buildings. No case-insensitive match found in buildingsByLand keys either.`);
            }
          }
          // Determine the assetId for the problem. Prefer customLandId, fallback to airtableRecordId.
          const problemAssetId = customLandId || airtableRecordId;
          const problemId = `no_buildings_${problemAssetId}_${Date.now()}`;
          const landOwner = land.owner || 'Unknown';
          
          problems[problemId] = {
            problemId,
            citizen: landOwner, // Use the land owner as the citizen
            assetType: 'land',
            assetId: problemAssetId,
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: land.historicalName || `Land #${problemAssetId}`,
            title: `No Buildings on Land`,
            description: this.generateNoBuildingsDescription(land),
            solutions: this.generateNoBuildingsSolutions(land),
            notes: `Land has ${land.buildingPoints?.length || 0} building points available`,
            center: land.center // Include the center field from the land data
          };
        }
      });
      
      console.log(`Created ${Object.keys(problems).length} problems for lands with no buildings`);
      
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

  /**
   * Detect homeless citizens
   */
  public async detectHomelessCitizens(username?: string): Promise<Record<string, any>> {
    try {
      const allFetchedCitizens = await this.fetchAllCitizens(username);
      if (allFetchedCitizens.length === 0) {
        console.log(`No citizens found to check for homelessness (user: ${username || 'all'})`);
        return {};
      }

      const citizens = allFetchedCitizens.filter(c => {
        if (!c.Username || typeof c.Username !== 'string' || c.Username.trim() === '') {
          console.warn(`[ProblemService] detectHomelessCitizens: Citizen ${c.CitizenId || c.id || 'Unknown ID'} has invalid or missing Username ('${c.Username}'). Excluding from homeless check.`);
          return false;
        }
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No citizens with valid Usernames to check for homelessness (user: ${username || 'all'}). Original count: ${allFetchedCitizens.length}`);
        return {};
      }

      const buildings = await this.fetchAllBuildings();
      const homesByOccupant: Record<string, boolean> = {};
      buildings.forEach(building => {
        if (building.Category?.toLowerCase() === 'home' && building.Occupant) {
          homesByOccupant[building.Occupant] = true;
        }
      });

      const problems: Record<string, any> = {};
      citizens.forEach(citizen => {
        if (!homesByOccupant[citizen.Username]) {
          const problemId = `homeless_${citizen.CitizenId || citizen.id}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: citizen.Username,
            assetType: 'citizen',
            assetId: citizen.CitizenId || citizen.id, // Prefer CitizenId
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: this.getCitizenLocationString(citizen),
            title: 'Homeless Citizen',
            description: this.generateHomelessDescription(citizen),
            solutions: this.generateHomelessSolutions(citizen),
            notes: `Citizen ${citizen.Username} has no building with Category 'home' where they are listed as Occupant.`,
            position: citizen.Position || '' // Assumes Position is a JSON string {lat, lng}
          };
        }
      });

      console.log(`Created ${Object.keys(problems).length} problems for homeless citizens (user: ${username || 'all'})`);
      return problems;
    } catch (error) {
      console.error('Error detecting homeless citizens:', error);
      return {};
    }
  }

  /**
   * Detect workless citizens
   */
  public async detectWorklessCitizens(username?: string): Promise<Record<string, any>> {
    try {
      const allFetchedCitizens = await this.fetchAllCitizens(username);
      if (allFetchedCitizens.length === 0) {
        console.log(`No citizens found to check for worklessness (user: ${username || 'all'})`);
        return {};
      }

      const citizens = allFetchedCitizens.filter(c => {
        if (!c.Username || typeof c.Username !== 'string' || c.Username.trim() === '') {
          console.warn(`[ProblemService] detectWorklessCitizens: Citizen ${c.CitizenId || c.id || 'Unknown ID'} has invalid or missing Username ('${c.Username}'). Excluding from workless check.`);
          return false;
        }
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No citizens with valid Usernames to check for worklessness (user: ${username || 'all'}). Original count: ${allFetchedCitizens.length}`);
        return {};
      }

      const buildings = await this.fetchAllBuildings();
      const workplacesByOccupant: Record<string, boolean> = {};
      buildings.forEach(building => {
        if (building.Category?.toLowerCase() === 'business' && building.Occupant) {
          workplacesByOccupant[building.Occupant] = true;
        }
      });

      const problems: Record<string, any> = {};
      citizens.forEach(citizen => {
        // Exclude system accounts from being flagged as workless
        if (citizen.Username === 'ConsiglioDeiDieci' || citizen.Username === 'SerenissimaBank') {
            return; 
        }
        if (!workplacesByOccupant[citizen.Username]) {
          const problemId = `workless_${citizen.CitizenId || citizen.id}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: citizen.Username,
            assetType: 'citizen',
            assetId: citizen.CitizenId || citizen.id, // Prefer CitizenId
            severity: 'low', 
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: this.getCitizenLocationString(citizen),
            title: 'Workless Citizen',
            description: this.generateWorklessDescription(citizen),
            solutions: this.generateWorklessSolutions(citizen),
            notes: `Citizen ${citizen.Username} has no building with Category 'business' where they are listed as Occupant.`,
            position: citizen.Position || '' // Assumes Position is a JSON string {lat, lng}
          };
        }
      });

      console.log(`Created ${Object.keys(problems).length} problems for workless citizens (user: ${username || 'all'})`);
      return problems;
    } catch (error) {
      console.error('Error detecting workless citizens:', error);
      return {};
    }
  }

  private async fetchAllCitizens(username?: string): Promise<any[]> { // Using any for now for citizen structure
    const apiUrl = username
      ? `${this.getBaseUrl()}/api/citizens?username=${encodeURIComponent(username)}`
      : `${this.getBaseUrl()}/api/citizens`; // Fetches all citizens
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch citizens: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    if (username && data.citizen) return [data.citizen]; // API returns single citizen under 'citizen' key
    return data.citizens || []; // API returns multiple citizens under 'citizens' key
  }

  private async fetchAllBuildings(): Promise<any[]> { // Using any for now for building structure
    const response = await fetch(`${this.getBaseUrl()}/api/buildings`); // Fetches all buildings
    if (!response.ok) {
      throw new Error(`Failed to fetch buildings: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    return data.buildings || [];
  }

  private getCitizenLocationString(citizen: any): string {
    // Basic location string. Could be enhanced if Sestiere or more specific location data is available.
    let location = "Venice";
    if (citizen.Position) {
        try {
            const pos = JSON.parse(citizen.Position);
            if (pos && pos.lat && pos.lng) {
                location = `Near ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
            }
        } catch (e) { /* ignore parsing error, use default */ }
    }
    return citizen.FirstName ? `${citizen.FirstName}'s last known area` : `${citizen.Username}'s last known area`;
  }

  private generateHomelessDescription(citizen: any): string {
    const citizenName = `**${citizen.FirstName || citizen.Username} ${citizen.LastName || ''}**`.trim();
    return `${citizenName} is currently without a registered home. This can lead to instability and difficulties in daily life.\n\n` +
           `### Social Impact\n` +
           `- Lack of stable housing affects well-being and social standing.\n` +
           `- May face difficulties accessing services or participating in civic life.`;
  }

  private generateHomelessSolutions(citizen: any): string {
    return `### Recommended Solutions\n` +
           `- Seek available housing through the housing market (check vacant buildings with 'home' category).\n` +
           `- Ensure sufficient funds to pay rent.\n` +
           `- The daily housing assignment script (12:00 PM UTC) may assign housing if available and criteria are met.`;
  }

  private generateWorklessDescription(citizen: any): string {
    const citizenName = `**${citizen.FirstName || citizen.Username} ${citizen.LastName || ''}**`.trim();
    return `${citizenName} is currently without a registered place of work. This impacts their ability to earn income and contribute to the economy.\n\n` +
           `### Economic Impact\n` +
           `- No regular income from wages.\n` +
           `- May struggle to afford housing, goods, and services.`;
  }

  private generateWorklessSolutions(citizen: any): string {
    return `### Recommended Solutions\n` +
           `- Seek employment opportunities at available businesses (check buildings with 'business' category for occupant vacancies).\n` +
           `- Improve skills or social standing to access better jobs.\n` +
           `- The daily job assignment script (10:00 AM UTC) may assign a job if available and criteria are met.`;
  }
}

// Export a singleton instance
export const problemService = new ProblemService();
