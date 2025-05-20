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
      console.log(`[ProblemService] detectHomelessCitizens: Starting with ${allFetchedCitizens.length} fetched citizens (user: ${username || 'all'}).`);
      if (allFetchedCitizens.length > 0) {
        console.log(`[ProblemService] detectHomelessCitizens: Sample of first 2 fetched citizens before filtering: ${JSON.stringify(allFetchedCitizens.slice(0, 2), null, 2)}`);
      }

      if (allFetchedCitizens.length === 0) {
        console.log(`No citizens found to check for homelessness (user: ${username || 'all'}) - fetchAllCitizens returned empty or API provided no citizens.`);
        return {};
      }

      const citizens = allFetchedCitizens.filter(c => {
        const fields = c.fields || {}; // Ensure fields object exists
        let effectiveUsername: string | undefined = undefined;
        const originalPascalUsername = fields.Username;
        const camelUsername = (fields as any).username;

        if (fields.Username && typeof fields.Username === 'string' && fields.Username.trim() !== '') {
          effectiveUsername = fields.Username.trim();
        } else if (camelUsername && typeof camelUsername === 'string' && camelUsername.trim() !== '') {
          effectiveUsername = camelUsername.trim();
        }

        // Normalize Username onto the citizen object 'c'
        if (effectiveUsername) {
          c.Username = effectiveUsername;
        } else {
          // Construct an identifier for logging even if username is missing
          const logIdentifier = fields.CitizenId || (fields as any).citizenId || c.id || 'Unknown ID (no Username, CitizenId, or record id)';
          console.warn(`[ProblemService] detectHomelessCitizens: Citizen ${logIdentifier} has invalid or missing Username. Checked Username (PascalCase): '${originalPascalUsername}', username (camelCase): '${camelUsername}'. Excluding from homeless check.`);
          return false;
        }

        // Normalize CitizenId onto the citizen object 'c'
        const originalPascalCitizenId = fields.CitizenId;
        const camelCitizenId = (fields as any).citizenId;
        let effectiveCitizenId: string | undefined = undefined;

        if (fields.CitizenId && typeof fields.CitizenId === 'string' && fields.CitizenId.trim() !== '') {
          effectiveCitizenId = fields.CitizenId.trim();
        } else if (camelCitizenId && typeof camelCitizenId === 'string' && camelCitizenId.trim() !== '') {
          effectiveCitizenId = camelCitizenId.trim();
        }
        
        if (effectiveCitizenId) {
          c.CitizenId = effectiveCitizenId;
        } else {
           // If no effective CitizenId, c.CitizenId remains as it was (likely undefined).
           // The problem creation logic `citizen.CitizenId || citizen.id` will handle this by falling back to c.id.
           console.warn(`[ProblemService] detectHomelessCitizens: Citizen (Username: ${c.Username}, AirtableID: ${c.id}) missing effective CitizenId (checked CitizenId: '${originalPascalCitizenId}', citizenId: '${camelCitizenId}'). Will use Airtable record ID as fallback assetId.`);
        }
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No citizens with valid Usernames to check for homelessness (user: ${username || 'all'}). Original count: ${allFetchedCitizens.length}`);
        return {};
      }
      console.log(`[ProblemService] detectHomelessCitizens: Processing ${citizens.length} citizens with valid usernames.`);

      const buildings = await this.fetchAllBuildings();
      console.log(`[ProblemService] detectHomelessCitizens: Fetched ${buildings.length} buildings.`);

      const homesByOccupant: Record<string, boolean> = {};
      let homeBuildingCount = 0;
      buildings.forEach(building => {
        // Access fields using camelCase as returned by the API
        const occupantKey = building.occupant && typeof building.occupant === 'string' ? building.occupant.trim() : null;
        const category = building.category && typeof building.category === 'string' ? building.category.toLowerCase() : null;

        if (category === 'home' && occupantKey) {
          homesByOccupant[occupantKey] = true;
          homeBuildingCount++;
        } else if (category === 'home' && !occupantKey) {
          console.warn(`[ProblemService] detectHomelessCitizens: Building ${building.id || building.name || 'Unknown ID'} is 'home' category but has invalid/missing occupant: '${building.occupant}'`);
        }
      });
      console.log(`[ProblemService] detectHomelessCitizens: Populated homesByOccupant with ${Object.keys(homesByOccupant).length} entries from ${homeBuildingCount} relevant home buildings.`);
      if (Object.keys(homesByOccupant).length > 0) {
        console.log(`[ProblemService] detectHomelessCitizens: Sample homesByOccupant keys: ${Object.keys(homesByOccupant).slice(0, 5).join(', ')}`);
      }

      const problems: Record<string, any> = {};
      let citizensChecked = 0;
      citizens.forEach(citizen => {
        // Ensure citizen.Username is a valid string before using it as a key
        const usernameKey = citizen.Username && typeof citizen.Username === 'string' ? citizen.Username.trim() : null;

        if (citizensChecked < 5) { // Log for the first 5 citizens
          console.log(`[ProblemService] detectHomelessCitizens: Checking citizen ${citizensChecked + 1}/${citizens.length}: Username='${usernameKey}', In homesByOccupant: ${usernameKey ? !!homesByOccupant[usernameKey] : 'N/A (invalid username)'}`);
        }
        citizensChecked++;

        if (usernameKey && !homesByOccupant[usernameKey]) {
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

      const finalProblemCount = Object.keys(problems).length;
      console.log(`[ProblemService] detectHomelessCitizens: Created ${finalProblemCount} problems for homeless citizens (user: ${username || 'all'})`);
      if (citizens.length > 0 && finalProblemCount === 0) {
        console.warn(`[ProblemService] detectHomelessCitizens: No homeless problems created, but processed ${citizens.length} citizens. This implies all processed citizens were found in homesByOccupant.`);
      } else if (citizens.length > 0 && finalProblemCount === citizens.length && citizens.length > Object.keys(homesByOccupant).length) {
        // Added a more specific condition for the "all homeless" warning
        console.warn(`[ProblemService] detectHomelessCitizens: All ${citizens.length} processed citizens were marked as homeless. This implies homesByOccupant (size: ${Object.keys(homesByOccupant).length}) might be empty or not matching citizen usernames.`);
      }
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
      console.log(`[ProblemService] detectWorklessCitizens: Starting with ${allFetchedCitizens.length} fetched citizens (user: ${username || 'all'}).`);
      if (allFetchedCitizens.length > 0) {
        console.log(`[ProblemService] detectWorklessCitizens: Sample of first 2 fetched citizens before filtering: ${JSON.stringify(allFetchedCitizens.slice(0, 2), null, 2)}`);
      }
      
      if (allFetchedCitizens.length === 0) {
        console.log(`No citizens found to check for worklessness (user: ${username || 'all'}) - fetchAllCitizens returned empty or API provided no citizens.`);
        return {};
      }

      const citizens = allFetchedCitizens.filter(c => {
        const fields = c.fields || {}; // Ensure fields object exists
        let effectiveUsername: string | undefined = undefined;
        const originalPascalUsername = fields.Username;
        const camelUsername = (fields as any).username;

        if (fields.Username && typeof fields.Username === 'string' && fields.Username.trim() !== '') {
          effectiveUsername = fields.Username.trim();
        } else if (camelUsername && typeof camelUsername === 'string' && camelUsername.trim() !== '') {
          effectiveUsername = camelUsername.trim();
        }

        // Normalize Username onto the citizen object 'c'
        if (effectiveUsername) {
          c.Username = effectiveUsername;
        } else {
          // Construct an identifier for logging even if username is missing
          const logIdentifier = fields.CitizenId || (fields as any).citizenId || c.id || 'Unknown ID (no Username, CitizenId, or record id)';
          console.warn(`[ProblemService] detectWorklessCitizens: Citizen ${logIdentifier} has invalid or missing Username. Checked Username (PascalCase): '${originalPascalUsername}', username (camelCase): '${camelUsername}'. Excluding from workless check.`);
          return false;
        }

        // Normalize CitizenId onto the citizen object 'c'
        const originalPascalCitizenId = fields.CitizenId;
        const camelCitizenId = (fields as any).citizenId;
        let effectiveCitizenId: string | undefined = undefined;

        if (fields.CitizenId && typeof fields.CitizenId === 'string' && fields.CitizenId.trim() !== '') {
          effectiveCitizenId = fields.CitizenId.trim();
        } else if (camelCitizenId && typeof camelCitizenId === 'string' && camelCitizenId.trim() !== '') {
          effectiveCitizenId = camelCitizenId.trim();
        }
        
        if (effectiveCitizenId) {
          c.CitizenId = effectiveCitizenId;
        } else {
           console.warn(`[ProblemService] detectWorklessCitizens: Citizen (Username: ${c.Username}, AirtableID: ${c.id}) missing effective CitizenId (checked CitizenId: '${originalPascalCitizenId}', citizenId: '${camelCitizenId}'). Will use Airtable record ID as fallback assetId.`);
        }
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No citizens with valid Usernames to check for worklessness (user: ${username || 'all'}). Original count: ${allFetchedCitizens.length}`);
        return {};
      }

      const buildings = await this.fetchAllBuildings();
      const workplacesByOccupant: Record<string, boolean> = {};
      let businessBuildingCount = 0;
      buildings.forEach(building => {
        // Access fields using camelCase as returned by the API
        const occupantKey = building.occupant && typeof building.occupant === 'string' ? building.occupant.trim() : null;
        const category = building.category && typeof building.category === 'string' ? building.category.toLowerCase() : null;

        if (category === 'business' && occupantKey) {
          workplacesByOccupant[occupantKey] = true;
          businessBuildingCount++;
        } else if (category === 'business' && !occupantKey) {
          console.warn(`[ProblemService] detectWorklessCitizens: Building ${building.id || building.name || 'Unknown ID'} is 'business' category but has invalid/missing occupant: '${building.occupant}'`);
        }
      });
      console.log(`[ProblemService] detectWorklessCitizens: Populated workplacesByOccupant with ${Object.keys(workplacesByOccupant).length} entries from ${businessBuildingCount} relevant business buildings.`);
      if (Object.keys(workplacesByOccupant).length > 0) {
        console.log(`[ProblemService] detectWorklessCitizens: Sample workplacesByOccupant keys: ${Object.keys(workplacesByOccupant).slice(0, 5).join(', ')}`);
      }

      const problems: Record<string, any> = {};
      let worklessCitizensChecked = 0;
      citizens.forEach(citizen => {
        // Exclude system accounts from being flagged as workless
        if (citizen.Username === 'ConsiglioDeiDieci' || citizen.Username === 'SerenissimaBank') {
            return; 
        }

        // Ensure citizen.Username is a valid string before using it as a key
        const usernameKey = citizen.Username && typeof citizen.Username === 'string' ? citizen.Username.trim() : null;

        if (worklessCitizensChecked < 5) { // Log for the first 5 citizens
            console.log(`[ProblemService] detectWorklessCitizens: Checking citizen ${worklessCitizensChecked + 1}/${citizens.length}: Username='${usernameKey}', In workplacesByOccupant: ${usernameKey ? !!workplacesByOccupant[usernameKey] : 'N/A (invalid username)'}`);
        }
        worklessCitizensChecked++;
        
        if (usernameKey && !workplacesByOccupant[usernameKey]) {
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
    const response = await fetch(apiUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch citizens: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    const citizensList = username && data.citizen ? [data.citizen] : (data.citizens || []);

    console.log(`[ProblemService] fetchAllCitizens: Received ${citizensList.length} citizen records from API.`);
    if (citizensList.length > 0) {
      console.log(`[ProblemService] fetchAllCitizens: Sample of first 2 citizen records (raw from API): ${JSON.stringify(citizensList.slice(0, 2), null, 2)}`);
    }

    return citizensList;
  }

  private async fetchAllBuildings(): Promise<any[]> { // Using any for now for building structure
    const response = await fetch(`${this.getBaseUrl()}/api/buildings`, { cache: 'no-store' }); // Fetches all buildings
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
