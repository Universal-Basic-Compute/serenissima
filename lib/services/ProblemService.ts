// Define interfaces for better type safety
interface Problem {
  problemId: string;
  citizen: string;
  assetType: string;
  asset: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'ignored';
  createdAt: string;
  updatedAt: string;
  location: string;
  type?: string; // Added type field
  title: string;
  description: string;
  position?: { lat: number, lng: number } | null; // Added position field
  solutions: string;
  notes?: string;
}

export class ProblemService {
  /**
   * Get base URL for API calls
   */
  private getBaseUrl(): string {
    return typeof window !== 'undefined' 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  }

  /**
   * Detect vacant buildings (homes or businesses without occupants)
   */
  public async detectVacantBuildings(username?: string): Promise<Record<string, any>> {
    try {
      const buildings = await this.fetchAllBuildings();
      console.log(`[ProblemService] detectVacantBuildings: Fetched ${buildings.length} buildings to check for vacancy.`);
      if (buildings.length === 0) {
        return {};
      }

      const problems: Record<string, any> = {};
      let processedCount = 0;

      buildings.forEach(building => {
        // Ensure building has an owner and no occupant
        const owner = building.owner && typeof building.owner === 'string' ? building.owner.trim() : null;
        const occupant = building.occupant && typeof building.occupant === 'string' ? building.occupant.trim() : null;
        const category = building.category && typeof building.category === 'string' ? building.category.toLowerCase() : null;
        const buildingId = building.id || building.buildingId || `unknown_building_${Date.now()}_${Math.random()}`;
        const buildingName = building.name || building.type || 'Unnamed Building'; // Use building.name (from API)

        if (processedCount < 5) {
            console.log(`[ProblemService] detectVacantBuildings: Checking Building ${buildingId} (Name: ${buildingName}, Owner: ${owner}, Occupant: ${occupant}, Category: ${category})`);
        }
        processedCount++;

        if (owner && !occupant && (category === 'home' || category === 'business')) {
          // If a specific username is provided, only create problems for that owner
          if (username && owner !== username) {
            return; // Skip if not owned by the specified user
          }

          const problemBaseId = `vacant_${category}_${buildingId}`;
          const problemId = `${problemBaseId}_${Date.now()}`;
          
          let title = '';
          let description = '';
          let solutions = '';
          let severity = 'low';

          if (category === 'home') {
            title = 'Vacant Home';
            description = `Your residential property, **${buildingName}**, is currently unoccupied. An empty home generates no rental income and may fall into disrepair if neglected.`;
            solutions = `Consider the following actions:\n- List the property on the housing market to find a tenant.\n- Adjust the rent to attract occupants.\n- Ensure the property is well-maintained to be appealing.\n- If you no longer wish to manage it, consider selling the property.`;
            severity = 'low';
          } else if (category === 'business') {
            title = 'Vacant Business Premises';
            description = `Your commercial property, **${buildingName}**, is currently unoccupied. A vacant business premises means no commercial activity, no income generation, and potential loss of economic value for the area.`;
            solutions = `Consider the following actions:\n- Lease the premises to an entrepreneur or business.\n- Start a new business yourself in this location if you have the resources and a viable idea.\n- Ensure the property is suitable for common business types.\n- If development is not feasible, consider selling the property.`;
            severity = 'medium';
          }

          problems[problemId] = {
            problemId,
            citizen: owner, // Problem is for the building owner
            assetType: 'building',
            asset: buildingId,
            severity,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: buildingName, // Use buildingName which includes fallback to building.type
            type: category === 'home' ? 'vacant_home' : 'vacant_business',
            title,
            description,
            solutions,
            notes: `Building Category: ${category}. Owner: ${owner}. No occupant.`,
            position: building.position || null // Use building.position or null
          };
        }
      });

      const numProblems = Object.keys(problems).length;
      console.log(`[ProblemService] detectVacantBuildings: Created ${numProblems} problems for vacant buildings (target user: ${username || 'all'}).`);
      if (buildings.length > 0 && numProblems === 0 && username) {
        console.log(`[ProblemService] detectVacantBuildings: No vacant buildings found for user ${username}.`);
      } else if (buildings.length > 0 && numProblems === 0 && !username) {
        console.log(`[ProblemService] detectVacantBuildings: No vacant buildings found for any owner.`);
      }
      return problems;
    } catch (error) {
      console.error('Error detecting vacant buildings:', error);
      return {};
    }
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
        // APIs are expected to return camelCase.
        // Perform basic validation for essential fields.
        const citizenUsername = c.username; // Expect camelCase
        const citizenId = c.citizenId; // Expect camelCase

        if (!citizenUsername || typeof citizenUsername !== 'string' || citizenUsername.trim() === '') {
          const logIdentifier = citizenId || c.id || 'Unknown ID';
          console.warn(`[ProblemService] detectHomelessCitizens: Citizen ${logIdentifier} has invalid/missing username ('${citizenUsername}'). Excluding from homeless check.`);
          return false;
        }
        // Exclude Forestieri
        if (c.socialClass === 'Forestieri') {
          console.log(`[ProblemService] detectHomelessCitizens: SKIPPING citizen ${citizenUsername} because they are Forestieri.`);
          return false;
        }
        // Exclude if not in Venice
        if (c.inVenice !== true) {
          console.log(`[ProblemService] detectHomelessCitizens: SKIPPING citizen ${citizenUsername} because inVenice is not true (value: ${c.inVenice}).`);
          return false;
        }
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No eligible citizens (valid username, not Forestieri, inVenice=true) to check for homelessness (user: ${username || 'all'}). Original count: ${allFetchedCitizens.length}`);
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
        // Use camelCase: citizen.username
        const citizenUsername = citizen.username; // Already validated as non-empty string in filter

        if (citizensChecked < 5) { // Log for the first 5 citizens
          console.log(`[ProblemService] detectHomelessCitizens: Checking citizen ${citizensChecked + 1}/${citizens.length}: Username='${citizenUsername}', In homesByOccupant: ${!!homesByOccupant[citizenUsername]}`);
        }
        citizensChecked++;

        if (!homesByOccupant[citizenUsername]) {
          const problemId = `homeless_${citizen.citizenId || citizen.id}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: citizenUsername,
            assetType: 'citizen',
            asset: citizen.citizenId || citizen.id, // Prefer citizenId
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: this.getCitizenLocationString(citizen),
            type: 'homeless_citizen',
            title: 'Homeless Citizen',
            description: this.generateHomelessDescription(citizen),
            solutions: this.generateHomelessSolutions(citizen),
            notes: `Citizen ${citizenUsername} has no building with Category 'home' where they are listed as Occupant.`,
            position: citizen.position || null
          };

          // Check if this homeless citizen is employed and create a problem for the employer
          const citizenNameForLog = `${citizen.firstName || citizenUsername} ${citizen.lastName || ''}`.trim();
          console.log(`[ProblemService] Homeless citizen ${citizenUsername} (ID: ${citizen.citizenId || citizen.id}, Name: ${citizenNameForLog}). Checking for employer problem. Citizen's workplace data from API: ${JSON.stringify(citizen.workplace)}`);

          let workplaceBuilding: any = null;
          let workplaceSource: string = "";

          // Attempt 1: Use citizen.workplace.buildingId (camelCase)
          if (citizen.workplace && typeof citizen.workplace === 'object' && citizen.workplace.buildingId) {
            const directWorkplaceId = citizen.workplace.buildingId;
            // Building objects from API are expected to be camelCased
            const candidateBuilding = buildings.find(b => b.id === directWorkplaceId || b.buildingId === directWorkplaceId);
            if (candidateBuilding) {
                if (candidateBuilding.category?.toLowerCase() === 'business' && candidateBuilding.occupant === citizenUsername) {
                    workplaceBuilding = candidateBuilding;
                    workplaceSource = `direct lookup (validated citizen.workplace.buildingId '${directWorkplaceId}')`;
                    console.log(`[ProblemService] Validated workplace for ${citizenUsername} via ${workplaceSource}. Building ID: ${workplaceBuilding.id}`);
                } else {
                    console.log(`[ProblemService] Building '${directWorkplaceId}' from citizen.workplace for ${citizenUsername} is not their current business workplace (Category: ${candidateBuilding.category}, Occupant: ${candidateBuilding.occupant}). Will attempt inference.`);
                }
            } else {
                console.log(`[ProblemService] Workplace buildingId '${directWorkplaceId}' from citizen.workplace not found. Will attempt inference.`);
            }
          } else {
            console.log(`[ProblemService] citizen.workplace.buildingId not available for ${citizenUsername}. Will attempt inference.`);
          }

          // Attempt 2: Fallback to inferring workplace
          if (!workplaceBuilding) {
            const inferredBuilding = buildings.find(b => 
              b.occupant === citizenUsername && 
              b.category?.toLowerCase() === 'business'
            );
            if (inferredBuilding) {
              workplaceBuilding = inferredBuilding;
              workplaceSource = `inference (occupant='${citizenUsername}', category='business')`;
              console.log(`[ProblemService] Found workplace for ${citizenUsername} via ${workplaceSource}. Building ID: ${workplaceBuilding.id}`);
            }
          }

          if (workplaceBuilding) {
            const workplaceId = workplaceBuilding.id || workplaceBuilding.buildingId || 'UnknownWorkplaceID';
            // Access building properties with camelCase
            console.log(`[ProblemService] Processing workplace for ${citizenUsername} (Source: ${workplaceSource}): ID='${workplaceId}', Name='${workplaceBuilding.name}', Occupant='${workplaceBuilding.occupant}', RunBy='${workplaceBuilding.runBy}', Category='${workplaceBuilding.category}'`);
            
            const employerUsernameRaw = workplaceBuilding.runBy; // Expect runBy to be camelCase from API
            const employerUsernameTrimmed = employerUsernameRaw && typeof employerUsernameRaw === 'string' ? employerUsernameRaw.trim() : null;
            
            const hasValidEmployerField = employerUsernameRaw !== undefined && employerUsernameRaw !== null;
            const employerIsNonEmptyString = !!(employerUsernameTrimmed && employerUsernameTrimmed !== '');
            const employerIsDifferentFromEmployee = employerIsNonEmptyString && employerUsernameTrimmed !== citizenUsername;

            console.log(`[ProblemService] Employer Check for ${citizenUsername} at workplace ${workplaceId}:`);
            console.log(`  - Raw 'runBy' from building: '${employerUsernameRaw}' (type: ${typeof employerUsernameRaw})`);
            console.log(`  - Trimmed 'runBy': '${employerUsernameTrimmed}'`);
            console.log(`  - citizen.username for comparison: '${citizenUsername}'`);
            console.log(`  - Condition 'hasValidEmployerField' (runBy is not null/undefined): ${hasValidEmployerField}`); // runBy is camelCase
            console.log(`  - Condition 'employerIsNonEmptyString' (runBy is non-empty string after trim): ${employerIsNonEmptyString}`);
            console.log(`  - Condition 'employerIsDifferentFromEmployee': ${employerIsDifferentFromEmployee}`);

            if (employerIsNonEmptyString && employerIsDifferentFromEmployee) {
              const employerUsername = employerUsernameTrimmed!;
              // Use camelCase: citizen.firstName, citizen.lastName
              const employeeName = `${citizen.firstName || citizenUsername} ${citizen.lastName || ''}`.trim();
              const employerProblemId = `homeless_employee_impact_${employerUsername}_${citizenUsername}_${Date.now()}`;
              
              problems[employerProblemId] = {
                problemId: employerProblemId,
                citizen: employerUsername,
                assetType: 'employee_performance',
                asset: citizen.citizenId || citizen.id, // Asset is the homeless employee
                severity: 'low',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                location: workplaceBuilding.name || workplaceId,
                type: 'homeless_employee_impact',
                title: 'Homeless Employee Impact',
                description: `Your employee, **${employeeName}**, is currently homeless. Homelessness can lead to instability and may result in up to a 50% reduction in productivity.`,
                solutions: `Consider discussing housing options with **${employeeName}** or providing assistance if possible. Monitor their work performance and consider recruitment alternatives if productivity is significantly impacted.`,
                notes: `Homeless Employee: ${citizenUsername} (ID: ${citizen.citizenId || citizen.id}), Workplace: ${workplaceBuilding.name || workplaceId} (ID: ${workplaceId})`,
                position: workplaceBuilding.position || null
              };
              console.log(`[ProblemService] CREATED 'Homeless Employee Impact' problem for employer '${employerUsername}' regarding employee '${citizenUsername}'.`);
            } else {
              console.log(`[ProblemService] Conditions not met for employer problem for citizen '${citizenUsername}' at workplace ${workplaceId}. Detailed: hasValidEmployerField=${hasValidEmployerField}, employerIsNonEmptyString=${employerIsNonEmptyString}, employerIsDifferentFromEmployee=${employerIsDifferentFromEmployee}.`);
            }
          } else { 
            console.log(`[ProblemService] Citizen '${citizenUsername}' has no identifiable workplace (neither via citizen.workplace.buildingId nor inference). Skipping employer problem.`);
          }
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
  public async detectWorklessCitizens(username?: string, excludedSocialClasses?: string[]): Promise<Record<string, any>> {
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
        // APIs are expected to return camelCase.
        // Perform basic validation for essential fields.
        const citizenUsername = c.username; // Expect camelCase
        const citizenId = c.citizenId; // Expect camelCase

        if (!citizenUsername || typeof citizenUsername !== 'string' || citizenUsername.trim() === '') {
          const logIdentifier = citizenId || c.id || 'Unknown ID';
          console.warn(`[ProblemService] detectWorklessCitizens: Citizen ${logIdentifier} has invalid/missing username ('${citizenUsername}'). Excluding from workless check.`);
          return false;
        }
        // Exclude if not in Venice - This is a general filter applied before specific class checks
        if (c.inVenice !== true) {
          console.log(`[ProblemService] detectWorklessCitizens: SKIPPING citizen ${citizenUsername} (initial filter) because inVenice is not true (value: ${c.inVenice}).`);
          return false;
        }
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No eligible citizens (valid username, inVenice=true) to check for worklessness (user: ${username || 'all'}). Original count: ${allFetchedCitizens.length}`);
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
        // Use camelCase: citizen.username
        const citizenUsername = citizen.username; // Already validated

        // Exclude system accounts from being flagged as workless
        if (citizenUsername === 'ConsiglioDeiDieci' || citizenUsername === 'SerenissimaBank') {
            return; 
        }

        // Exclude Forestieri (hardcoded exclusion for workless problem type)
        if (citizen.socialClass === 'Forestieri') {
            if (worklessCitizensChecked < 10) {
                console.log(`[ProblemService] detectWorklessCitizens: SKIPPING citizen ${citizenUsername} because they are Forestieri.`);
            }
            return; // Skip this citizen
        }

        // Exclude Nobili (hardcoded exclusion for workless problem type)
        if (citizen.socialClass === 'Nobili') {
            if (worklessCitizensChecked < 10) {
                console.log(`[ProblemService] detectWorklessCitizens: SKIPPING citizen ${citizenUsername} because they are Nobili (hardcoded exclusion).`);
            }
            return; // Skip this citizen
        }

        // Exclude citizens based on social class if provided by the API call (e.g., "Nobili")
        // Ensure citizen.socialClass is accessed using camelCase, as per API response structure
        if (excludedSocialClasses && citizen.socialClass && excludedSocialClasses.includes(citizen.socialClass)) {
            if (worklessCitizensChecked < 10) { // Log for the first few excluded by class
                 console.log(`[ProblemService] detectWorklessCitizens: SKIPPING citizen ${citizenUsername} due to social class '${citizen.socialClass}' being in API-provided exclusion list: ${excludedSocialClasses.join(', ')}.`);
            }
            return; // Skip this citizen
        }

        if (worklessCitizensChecked < 5) { // Log for the first 5 citizens
            console.log(`[ProblemService] detectWorklessCitizens: Checking citizen ${worklessCitizensChecked + 1}/${citizens.length}: Username='${citizenUsername}', In workplacesByOccupant: ${!!workplacesByOccupant[citizenUsername]}`);
        }
        worklessCitizensChecked++;
        
        if (!workplacesByOccupant[citizenUsername]) {
          const problemId = `workless_${citizen.citizenId || citizen.id}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: citizenUsername,
            assetType: 'citizen',
            asset: citizen.citizenId || citizen.id, // Prefer citizenId
            severity: 'low', 
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: this.getCitizenLocationString(citizen),
            type: 'workless_citizen',
            title: 'Workless Citizen',
            description: this.generateWorklessDescription(citizen),
            solutions: this.generateWorklessSolutions(citizen),
            notes: `Citizen ${citizenUsername} has no building with Category 'business' where they are listed as Occupant.`,
            position: citizen.position || null
          };
        }
      });

      console.log(`[ProblemService] detectWorklessCitizens: Created ${Object.keys(problems).length} problems for workless citizens (user: ${username || 'all'})`);
      return problems;
    } catch (error) {
      console.error('Error detecting workless citizens:', error);
      return {};
    }
  }

  private async fetchAllCitizens(username?: string): Promise<any[]> { // Using any for now for citizen structure
    const apiUrl = username
      ? `${this.getBaseUrl()}/api/citizens/${encodeURIComponent(username)}` // Corrected URL for single citizen
      : `${this.getBaseUrl()}/api/citizens`; // Fetches all citizens
    const response = await fetch(apiUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch citizens: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    // For single user, API /api/citizens/[username] returns { success: true, citizen: {...} }
    // For all users, API /api/citizens returns { success: true, citizens: [...] }
    const citizensList = username && data.citizen ? [data.citizen] : (data.citizens || []);
    
    console.log(`[ProblemService] fetchAllCitizens: API URL: ${apiUrl}`);
    console.log(`[ProblemService] fetchAllCitizens: Received ${citizensList.length} citizen records from API.`);
    if (citizensList.length > 0) {
      // Log the first citizen if list is not empty, otherwise log that it's empty.
      console.log(`[ProblemService] fetchAllCitizens: Sample of first citizen record (raw from API): ${JSON.stringify(citizensList[0], null, 2)}`);
    } else {
      console.log(`[ProblemService] fetchAllCitizens: No citizen records returned from API.`);
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

  private async fetchAllBuildingTypes(): Promise<any[]> {
    const response = await fetch(`${this.getBaseUrl()}/api/building-types`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch building types: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    // The API returns { success: true, buildingTypes: [...] }
    return data.buildingTypes || [];
  }

  private async fetchAllActiveContracts(): Promise<any[]> {
    // Fetches all contracts and filters for active ones client-side.
    const response = await fetch(`${this.getBaseUrl()}/api/contracts`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to fetch all contracts: ${response.status} ${await response.text()}`);
    }
    const data = await response.json();
    const contracts = data.contracts || []; 

    const now = new Date();
    return contracts.filter(contract => {
      // Use PascalCase for field access, matching Airtable schema
      const createdAtValue = contract.CreatedAt || contract.createdAt;
      const endAtValue = contract.EndAt || contract.endAt;
      const statusValue = contract.Status || contract.status;

      const createdAt = createdAtValue ? new Date(createdAtValue) : null;
      const endAt = endAtValue ? new Date(endAtValue) : null;
      const status = typeof statusValue === 'string' ? statusValue.toLowerCase() : '';

      if (!createdAt || !endAt) { // If dates are invalid or missing, contract cannot be active by date range
        console.warn(`[ProblemService] Contract ${contract.id || contract.ContractId} skipped due to missing/invalid dates: CreatedAt='${createdAtValue}', EndAt='${endAtValue}'`);
        return false;
      }

      // A contract is active if its date range is valid AND its status is 'active'
      const isActive = createdAt <= now && endAt >= now && status === 'active';
      if (!isActive && (status === 'active')) { // Log if status is active but dates are out of range
        // console.log(`[ProblemService] Contract ${contract.id || contract.ContractId} with status 'active' is not date-active. CreatedAt: ${createdAt.toISOString()}, EndAt: ${endAt.toISOString()}, Now: ${now.toISOString()}`);
      }
      return isActive;
    });
  }

  /**
   * Detect buildings with zero rent amount.
   * For Homes: if rentPrice is 0, null, or undefined.
   * For Businesses: if rentPrice is 0, null, or undefined AND Owner is not RunBy.
   */
  public async detectZeroRentPriceBuildings(username?: string): Promise<Record<string, Problem>> {
    try {
      const buildings = await this.fetchAllBuildings();
      console.log(`[ProblemService] detectZeroRentPriceBuildings: Fetched ${buildings.length} buildings to check for zero rent.`);
      if (buildings.length === 0) {
        return {};
      }

      const problems: Record<string, Problem> = {};
      let processedCount = 0;

      buildings.forEach(building => {
        processedCount++; // Increment for every building processed

        const owner = building.owner && typeof building.owner === 'string' ? building.owner.trim() : null;
        const category = building.category && typeof building.category === 'string' ? building.category.toLowerCase() : null;
        const buildingId = building.id || building.buildingId || `unknown_building_${Date.now()}_${Math.random()}`;
        const buildingName = building.name || building.type || 'Unnamed Building'; // Use building.name (from API)
        const rentPrice = building.rentPrice; // Can be number, null, or undefined
        const runBy = building.runBy && typeof building.runBy === 'string' ? building.runBy.trim() : null;
        const occupant = building.occupant && typeof building.occupant === 'string' ? building.occupant.trim() : null; // Get and trim occupant

        let skipReason = "";

        if (!owner) {
          skipReason = "No owner";
        } else if (!(category === 'home' || category === 'business')) {
          skipReason = `Invalid category: '${category}'`;
        } else if (rentPrice !== undefined && rentPrice !== null && rentPrice > 0) {
          skipReason = `Rent is positive: ${rentPrice}`;
        } else if (username && owner !== username) { // This check applies if a specific username is targeted
          skipReason = `Owner '${owner}' does not match target username '${username}'`;
        }

        if (skipReason) {
          // Log more skipped items if a specific user is targeted, or fewer for "all users" run.
          if (username || processedCount < 10) { 
            console.log(`[ProblemService] detectZeroRentPriceBuildings (Processed: ${processedCount}): SKIPPING Building ${buildingId} (Name: ${buildingName}, Owner: ${owner}, Category: ${category}, RentPrice: ${rentPrice}, RunBy: ${runBy}). Reason: ${skipReason}`);
          }
          return; // Skip this building
        }
        
        // Log for buildings that PASS the initial skip checks and are being further evaluated.
        // Log more if a username is specified, or fewer for "all" (e.g., first few passing, or first few problems found).
        const problemsFoundCount = Object.keys(problems).length;
        if (username || processedCount < 10 || (problemsFoundCount < 5 && processedCount < 50) ) { 
            console.log(`[ProblemService] detectZeroRentPriceBuildings (Processed: ${processedCount}, ProblemsFoundSoFar: ${problemsFoundCount}): CHECKING Building ${buildingId} (Name: ${buildingName}, Owner: ${owner}, Category: ${category}, RentPrice: ${rentPrice}, RunBy: ${runBy}) for problem generation.`);
        }
        
        let problemTypeSpecific = '';
        let title = '';
        let description = '';
        let solutions = '';
        let severity: Problem['severity'] = 'low';
        let generateProblem = false;

        if (category === 'home') {
          if (rentPrice === 0 || rentPrice === null || rentPrice === undefined) {
            if (owner === occupant) {
              // Log if owner is occupant and rent is zero - this is fine, not a problem.
              if (username || processedCount < 10 || (Object.keys(problems).length < 5 && processedCount < 50)) {
                console.log(`[ProblemService] detectZeroRentPriceBuildings (Processed: ${processedCount}): SKIPPING Zero Rent for Home problem for Building ${buildingId} (Name: ${buildingName}, Owner: ${owner}) because Owner is also Occupant ('${occupant}'). Rent is ${rentPrice}.`);
              }
            } else {
              problemTypeSpecific = 'zero_rent_home';
              title = 'Zero Rent for Home';
              description = `Your residential property, **${buildingName}**, currently has its rent set to 0 Ducats. This property is not occupied by you. While this might be intentional (e.g., for a friend/family), it means you are not generating rental income if the property were to be leased to another citizen. If you intend to use it personally, ensure you are listed as the occupant.`;
              solutions = `Consider the following actions:\n- If you intend to rent this property to someone else, set a competitive rent amount.\n- If the property is for your personal use, ensure your citizen record is set as the 'Occupant' of this building. Then, this notification can be ignored.\n- If this is a special arrangement (e.g., free housing for an ally), you can ignore this notification.\n- Review your property management strategy.`;
              severity = 'low';
              generateProblem = true;
            }
          }
        } else if (category === 'business') {
          // For businesses, problem only if Owner is not RunBy
          if ((rentPrice === 0 || rentPrice === null || rentPrice === undefined) && owner && runBy && owner !== runBy) {
            problemTypeSpecific = 'zero_rent_business_leased';
            title = 'Zero Rent for Leased Business';
            description = `Your commercial property, **${buildingName}**, is being run by **${runBy}** but has its rent set to 0 Ducats. This means you are not collecting rent from the business operator, missing potential income.`;
            solutions = `Consider the following actions:\n- Set an appropriate rent amount for the business operator (**${runBy}**) to pay.\n- Review the lease agreement and terms with the operator.\n- If this zero-rent arrangement is intentional (e.g., a special agreement or subsidiary), you may ignore this notification.`;
            severity = 'medium';
            generateProblem = true;
          }
        }

        if (generateProblem) {
          const problemId = `${problemTypeSpecific}_${buildingId}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: owner!, // Owner is confirmed to be non-null by this point
            assetType: 'building',
            asset: buildingId,
            severity,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: buildingName, // Use buildingName which includes fallback to building.type
            type: problemTypeSpecific,
            title,
            description,
            solutions,
            notes: `Building Category: ${category}. Owner: ${owner}. Occupant: ${occupant || 'N/A'}. RunBy: ${runBy || 'N/A'}. RentPrice: ${rentPrice === undefined ? 'undefined' : rentPrice === null ? 'null' : rentPrice}.`,
            position: building.position || null,
          };
        }
      });

      const numProblems = Object.keys(problems).length;
      console.log(`[ProblemService] detectZeroRentPriceBuildings: Created ${numProblems} 'Zero Rent Amount' problems (target user: ${username || 'all'}).`);
      return problems;
    } catch (error) {
      console.error('[ProblemService] Error detecting zero rent amount buildings:', error);
      return {};
    }
  }

  /**
   * Detect business buildings with zero wages.
   * Problem is for RunBy if Wages is 0, null, or undefined.
   */
  public async detectZeroWagesBusinesses(username?: string): Promise<Record<string, Problem>> {
    try {
      const buildings = await this.fetchAllBuildings();
      console.log(`[ProblemService] detectZeroWagesBusinesses: Fetched ${buildings.length} buildings to check for zero wages.`);
      if (buildings.length === 0) {
        return {};
      }

      const problems: Record<string, Problem> = {};
      let processedCount = 0;

      buildings.forEach(building => {
        processedCount++;

        const runBy = building.runBy && typeof building.runBy === 'string' ? building.runBy.trim() : null;
        const category = building.category && typeof building.category === 'string' ? building.category.toLowerCase() : null;
        const buildingId = building.id || building.buildingId || `unknown_building_${Date.now()}_${Math.random()}`;
        const buildingName = building.name || building.type || 'Unnamed Building'; // Use building.name (from API)
        
        let numericWages: number | null = null;
        if (building.wages !== undefined && building.wages !== null) {
            // Attempt to parse building.wages as a number.
            // String(building.wages) handles cases where it might already be a number.
            const parsedWages = parseFloat(String(building.wages));
            if (!isNaN(parsedWages)) {
                numericWages = parsedWages;
            } else {
                // Log if parsing failed for a non-null/undefined value
                console.warn(`[ProblemService] detectZeroWagesBusinesses: Building ${buildingId} (Name: ${buildingName}) has unparseable Wages value: '${building.wages}'. Treating as zero/null wages.`);
            }
        }
        // Now, numericWages is either a number or null.

        let skipReason = "";

        if (category !== 'business') {
          skipReason = `Not a business category: '${category}'`;
        } else if (!runBy) {
          skipReason = "No RunBy citizen";
        } else if (numericWages !== null && numericWages > 0) {
          skipReason = `Wages are positive: ${numericWages}`;
        } else if (username && runBy !== username) {
          skipReason = `RunBy '${runBy}' does not match target username '${username}'`;
        }

        if (skipReason) {
          if (username || processedCount < 10) {
            console.log(`[ProblemService] detectZeroWagesBusinesses (Processed: ${processedCount}): SKIPPING Building ${buildingId} (Name: ${buildingName}, RunBy: ${runBy}, Category: ${category}, ParsedWages: ${numericWages}, OriginalWages: ${building.wages}). Reason: ${skipReason}`);
          }
          return;
        }

        const problemsFoundCount = Object.keys(problems).length;
        if (username || processedCount < 10 || (problemsFoundCount < 5 && processedCount < 50)) {
            console.log(`[ProblemService] detectZeroWagesBusinesses (Processed: ${processedCount}, ProblemsFoundSoFar: ${problemsFoundCount}): CHECKING Building ${buildingId} (Name: ${buildingName}, RunBy: ${runBy}, Category: ${category}, ParsedWages: ${numericWages}, OriginalWages: ${building.wages}) for problem generation.`);
        }
        
        const problemTypeSpecific = 'zero_wages_business';
        const title = 'Zero Wages for Business';
        const description = `Your business, **${buildingName}**, currently has its wages set to 0 Ducats. This means employees are not being paid, which can lead to dissatisfaction, low morale, and potential departure of workers.`;
        const solutions = `Consider the following actions:\n- Set appropriate wages for employees working at this business.\n- Review your business finances to ensure you can afford to pay wages.\n- If the business is not yet operational or currently has no employees, this might be acceptable temporarily, but plan to set wages once it becomes active with staff.`;
        const severity: Problem['severity'] = 'medium';

        const problemId = `${problemTypeSpecific}_${buildingId}_${Date.now()}`;
        problems[problemId] = {
          problemId,
          citizen: runBy!, // runBy is confirmed to be non-null by this point
          assetType: 'building',
          asset: buildingId,
          severity,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          location: buildingName, // Use buildingName which includes fallback to building.type
          type: problemTypeSpecific,
          title,
          description,
          solutions,
          notes: `Business Building: ${buildingName} (ID: ${buildingId}). RunBy: ${runBy}. Parsed Wages: ${numericWages === null ? 'null/undefined/unparseable' : numericWages} (Original: ${building.wages}).`,
          position: building.position || null,
        };
      });

      const numProblems = Object.keys(problems).length;
      console.log(`[ProblemService] detectZeroWagesBusinesses: Created ${numProblems} 'Zero Wages for Business' problems (target user: ${username || 'all'}).`);
      return problems;
    } catch (error) {
      console.error('[ProblemService] Error detecting zero wages for businesses:', error);
      return {};
    }
  }

  public async detectNoActiveContractsForBusinesses(username?: string): Promise<Record<string, Problem>> {
    try {
      console.log(`[ProblemService] detectNoActiveContractsForBusinesses: Starting detection (user: ${username || 'all'}).`);

      const allBuildings = await this.fetchAllBuildings();
      const businessBuildings = allBuildings.filter(b => {
        const category = b.category && typeof b.category === 'string' ? b.category.toLowerCase() : null;
        return category === 'business' &&
               (!username || (b.owner && typeof b.owner === 'string' && b.owner.trim() === username));
      });

      if (businessBuildings.length === 0) {
        console.log(`[ProblemService] detectNoActiveContractsForBusinesses: No business buildings found (user: ${username || 'all'}).`);
        return {};
      }
      console.log(`[ProblemService] detectNoActiveContractsForBusinesses: Found ${businessBuildings.length} business buildings to check (user: ${username || 'all'}).`);

      const activeContracts = await this.fetchAllActiveContracts();
      const buildingsWithActiveContracts = new Set<string>();
      activeContracts.forEach(contract => {
        // Use PascalCase for field access, matching Airtable schema
        const buyerBuilding = contract.BuyerBuilding || contract.buyerBuilding;
        const sellerBuilding = contract.SellerBuilding || contract.sellerBuilding;

        if (buyerBuilding) buildingsWithActiveContracts.add(buyerBuilding);
        if (sellerBuilding) buildingsWithActiveContracts.add(sellerBuilding);
      });
      console.log(`[ProblemService] detectNoActiveContractsForBusinesses: Found ${activeContracts.length} active contracts. Buildings involved in active contracts: ${buildingsWithActiveContracts.size}`);
      if (activeContracts.length > 0 && buildingsWithActiveContracts.size === 0) {
        console.warn(`[ProblemService] detectNoActiveContractsForBusinesses: ${activeContracts.length} active contracts found, but no buildings extracted. Check BuyerBuilding/SellerBuilding fields in API response and contract data.`);
        activeContracts.slice(0, 5).forEach(c => console.log(`Sample active contract: ID=${c.id || c.ContractId}, BuyerBuilding=${c.BuyerBuilding || c.buyerBuilding}, SellerBuilding=${c.SellerBuilding || c.sellerBuilding}`));
      }


      const problems: Record<string, Problem> = {};
      let processedCount = 0;

      businessBuildings.forEach(building => {
        const buildingId = building.id || building.buildingId; // Prefer custom ID if available
        const owner = building.owner && typeof building.owner === 'string' ? building.owner.trim() : null;

        if (processedCount < 5) {
            console.log(`[ProblemService] detectNoActiveContractsForBusinesses: Checking business building ${buildingId} (Owner: ${owner}, Type: ${building.type}). Has active contract: ${buildingsWithActiveContracts.has(buildingId)}`);
        }
        processedCount++;

        if (owner && !buildingsWithActiveContracts.has(buildingId)) {
          const problemId = `no_active_contracts_${buildingId}_${Date.now()}`;
          const buildingName = building.name || building.type || 'Unnamed Business Building'; // Use building.name (from API)

          problems[problemId] = {
            problemId,
            citizen: owner,
            assetType: 'building',
            asset: buildingId,
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: buildingName, // Use buildingName which includes fallback to building.type
            type: 'no_active_contracts',
            title: 'No Active Contracts',
            description: `Your business premises, **${buildingName}**, currently has no active buy or sell contracts. This means it's not participating in the economy, potentially missing revenue opportunities or failing to secure necessary supplies.`,
            solutions: `To resolve this:\n- Create 'sell' contracts for goods or services your business produces.\n- Create 'buy' contracts for raw materials or goods your business needs.\n- Review market prices and demand to set competitive contract terms.\n- Ensure your business is operational and has an assigned occupant (worker).`,
            notes: `Building Type: ${building.type}. Owner: ${owner}. Category: Business. This building is not a BuyerBuilding or SellerBuilding in any active contract. Building Name: ${buildingName}.`,
            position: building.position || null,
          };
        }
      });

      const numProblems = Object.keys(problems).length;
      console.log(`[ProblemService] detectNoActiveContractsForBusinesses: Created ${numProblems} 'No Active Contracts' problems (user: ${username || 'all'}).`);
      return problems;

    } catch (error) {
      console.error('[ProblemService] Error detecting no active contracts for businesses:', error);
      return {};
    }
  }

  private getCitizenLocationString(citizen: any): string {
    // Expect citizen.position to be an object {lat, lng} or null/undefined
    // Expect citizen.firstName, citizen.username to be camelCase
    let location = "Venice";
    if (citizen.position && typeof citizen.position === 'object' && citizen.position.lat && citizen.position.lng) {
        location = `Near ${citizen.position.lat.toFixed(4)}, ${citizen.position.lng.toFixed(4)}`;
    }
    return citizen.firstName ? `${citizen.firstName}'s last known area` : `${citizen.username}'s last known area`;
  }

  private generateHomelessDescription(citizen: any): string {
    // Expect citizen.firstName, citizen.username, citizen.lastName to be camelCase
    const citizenName = `**${citizen.firstName || citizen.username} ${citizen.lastName || ''}**`.trim();
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
    // Expect citizen.firstName, citizen.username, citizen.lastName to be camelCase
    const citizenName = `**${citizen.firstName || citizen.username} ${citizen.lastName || ''}**`.trim();
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

  /**
   * Detect hungry citizens
   */
  public async detectHungryCitizens(username?: string): Promise<Record<string, any>> {
    try {
      const allFetchedCitizens = await this.fetchAllCitizens(username);
      console.log(`[ProblemService] detectHungryCitizens: Starting with ${allFetchedCitizens.length} fetched citizens (user: ${username || 'all'}).`);
      if (allFetchedCitizens.length === 0) {
        console.log(`No citizens found to check for hunger (user: ${username || 'all'}).`);
        return {};
      }

      const citizens = allFetchedCitizens.filter(c => {
        // APIs are expected to return camelCase.
        const citizenUsername = c.username; // Expect camelCase
        const citizenId = c.citizenId; // Expect camelCase

        if (!citizenUsername || typeof citizenUsername !== 'string' || citizenUsername.trim() === '') {
          const logIdentifier = citizenId || c.id || 'Unknown ID';
          console.warn(`[ProblemService] detectHungryCitizens: Citizen ${logIdentifier} has invalid/missing username ('${citizenUsername}'). Excluding from hunger check.`);
          return false;
        }
        
        // Ensure inVenice is true. API provides 'inVenice' as camelCase.
        const inVeniceStatus = c.inVenice === true; 
        if (!inVeniceStatus) {
            // console.log(`[ProblemService] detectHungryCitizens Filter: Citizen ${citizenUsername} (ID: ${citizenId || c.id}) is NOT in Venice (inVenice field value: ${c.inVenice}). Excluding.`);
            return false;
        }
        // console.log(`[ProblemService] detectHungryCitizens Filter: Citizen ${c.Username || effectiveUsername} (ID: ${c.CitizenId || (c as any).citizenId || c.id}) IS in Venice (inVenice field value: ${c.inVenice}). Proceeding with hunger check.`);
        return true;
      });

      if (citizens.length === 0) {
        console.log(`No citizens in Venice with valid Usernames to check for hunger (user: ${username || 'all'}). Original count from API: ${allFetchedCitizens.length}. Check 'inVenice' status in Airtable and API response.`);
        return {};
      }
      console.log(`[ProblemService] detectHungryCitizens: Processing ${citizens.length} citizens in Venice with valid usernames.`);
      
      console.log(`[ProblemService] detectHungryCitizens: STEP 1 - About to fetch buildings.`);
      const buildings = await this.fetchAllBuildings(); // For employer check
      console.log(`[ProblemService] detectHungryCitizens: STEP 2 - Fetched ${buildings ? buildings.length : 'null/undefined'} buildings. Sample of first building (if any): ${buildings && buildings.length > 0 ? JSON.stringify(buildings[0]) : 'No buildings fetched or empty array.'}`);

      const problems: Record<string, any> = {};
      const now = new Date().getTime();
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

      console.log(`[ProblemService] detectHungryCitizens: STEP 3 - About to loop over ${citizens.length} citizens.`);
      let citizensProcessedInLoop = 0;

      citizens.forEach(citizen => {
        citizensProcessedInLoop++;
        // Minimal first log inside the loop
        console.log(`[ProblemService] detectHungryCitizens Loop START: Citizen ${citizensProcessedInLoop}/${citizens.length}. Username: ${citizen.username || 'N/A'}`);

        // Use camelCase: citizen.username, citizen.citizenId, citizen.ateAt
        const citizenUsername = citizen.username; // Should be valid due to filter
        const ateAtTimestamp = citizen.ateAt; 
        
        console.log(`[ProblemService] detectHungryCitizens Loop Details: Citizen ${citizenUsername} (ID: ${citizen.citizenId || citizen.id || 'N/A'}). AteAt raw: '${ateAtTimestamp}' (type: ${typeof ateAtTimestamp})`);
        
        let isHungry;
        if (!ateAtTimestamp) { 
            console.log(`[ProblemService] detectHungryCitizens: Citizen ${citizenUsername} IS hungry due to missing or falsy ateAtTimestamp ('${ateAtTimestamp}').`);
            isHungry = true;
        } else {
            try {
                const lastMealTime = new Date(ateAtTimestamp).getTime();
                if (isNaN(lastMealTime)) {
                    console.error(`[ProblemService] detectHungryCitizens: Parsed ateAt timestamp '${ateAtTimestamp}' for citizen ${citizenUsername} resulted in NaN. Assuming hungry.`);
                    isHungry = true;
                } else {
                    if (now - lastMealTime > twentyFourHoursInMs) {
                        isHungry = true;
                        console.log(`[ProblemService] detectHungryCitizens: Citizen ${citizenUsername} IS hungry. Last meal: ${new Date(lastMealTime).toISOString()}, Now: ${new Date(now).toISOString()}, Difference (ms): ${now - lastMealTime}`);
                    } else {
                        isHungry = false;
                        console.log(`[ProblemService] detectHungryCitizens: Citizen ${citizenUsername} is NOT hungry. Last meal: ${new Date(lastMealTime).toISOString()}, Now: ${new Date(now).toISOString()}, Difference (ms): ${now - lastMealTime}`);
                    }
                }
            } catch (e) {
                console.error(`[ProblemService] detectHungryCitizens: Error during date processing for ateAt timestamp '${ateAtTimestamp}' for citizen ${citizenUsername}. Assuming hungry. Error: ${e}`);
                isHungry = true;
            }
        }

        if (isHungry) {
          console.log(`[ProblemService] detectHungryCitizens: CONFIRMED HUNGRY - Citizen ${citizenUsername}. Creating problem.`);
          const problemId = `hungry_${citizen.citizenId || citizen.id}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: citizenUsername,
            assetType: 'citizen',
            asset: citizen.citizenId || citizen.id,
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: this.getCitizenLocationString(citizen),
            type: 'hungry_citizen',
            title: 'Hungry Citizen',
            description: this.generateHungryDescription(citizen),
            solutions: this.generateHungrySolutions(citizen),
            notes: `Citizen ${citizenUsername} last ate at ${ateAtTimestamp || 'never/unknown'}. Current time: ${new Date(now).toISOString()}`,
            position: citizen.position || null
          };

          // Check for employer impact
          let workplaceBuilding: any = null;
          let workplaceSource: string = "";

          // Use camelCase: citizen.workplace.buildingId
          if (citizen.workplace && typeof citizen.workplace === 'object' && citizen.workplace.buildingId) {
            const directWorkplaceId = citizen.workplace.buildingId;
            const candidateBuilding = buildings.find(b => b.id === directWorkplaceId || b.buildingId === directWorkplaceId);
            if (candidateBuilding) {
                if (candidateBuilding.category?.toLowerCase() === 'business' && candidateBuilding.occupant === citizenUsername) {
                    workplaceBuilding = candidateBuilding;
                    workplaceSource = `direct lookup (validated citizen.workplace.buildingId '${directWorkplaceId}')`;
                }
            }
          }
          
          if (!workplaceBuilding) { 
            const inferredBuilding = buildings.find(b => 
              b.occupant === citizenUsername && 
              b.category?.toLowerCase() === 'business'
            );
            if (inferredBuilding) {
              workplaceBuilding = inferredBuilding;
              workplaceSource = `inference (occupant='${citizenUsername}', category='business')`;
            }
          }

          if (workplaceBuilding) {
            const workplaceId = workplaceBuilding.id || workplaceBuilding.buildingId || 'UnknownWorkplaceID';
            const employerUsernameRaw = workplaceBuilding.runBy; // Expect runBy from API to be camelCase
            const employerUsernameTrimmed = employerUsernameRaw && typeof employerUsernameRaw === 'string' ? employerUsernameRaw.trim() : null;
            
            const hasValidEmployerField = employerUsernameRaw !== undefined && employerUsernameRaw !== null;
            const employerIsNonEmptyString = !!(employerUsernameTrimmed && employerUsernameTrimmed !== '');
            const employerIsDifferentFromEmployee = employerIsNonEmptyString && employerUsernameTrimmed !== citizenUsername;

            if (employerIsNonEmptyString && employerIsDifferentFromEmployee) {
              const employerUsername = employerUsernameTrimmed!;
              // Use camelCase: citizen.firstName, citizen.lastName
              const employeeName = `${citizen.firstName || citizenUsername} ${citizen.lastName || ''}`.trim();
              const employerProblemId = `hungry_employee_impact_${employerUsername}_${citizenUsername}_${Date.now()}`;
              
              problems[employerProblemId] = {
                problemId: employerProblemId,
                citizen: employerUsername,
                assetType: 'employee_performance',
                asset: citizen.citizenId || citizen.id,
                severity: 'low',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                location: workplaceBuilding.name || workplaceId,
                type: 'hungry_employee_impact',
                title: 'Hungry Employee Impact',
                description: `Your employee, **${employeeName}**, is currently hungry. Hunger can significantly reduce productivity (up to 50%).`,
                solutions: `Ensure **${employeeName}** has the means and opportunity to eat. Consider if wages are sufficient or if working conditions impede access to food. Monitor their performance.`,
                notes: `Hungry Employee: ${citizenUsername} (ID: ${citizen.citizenId || citizen.id}), Workplace: ${workplaceBuilding.name || workplaceId} (ID: ${workplaceId}). Last ate: ${ateAtTimestamp || 'never/unknown'}.`,
                position: workplaceBuilding.position || null
              };
              console.log(`[ProblemService] CREATED 'Hungry Employee Impact' problem for employer '${employerUsername}' regarding employee '${citizenUsername}'. Source: ${workplaceSource}`);
            }
          }
        }
      });

      console.log(`[ProblemService] detectHungryCitizens: STEP 4 - Finished loop. Actual citizens processed in loop: ${citizensProcessedInLoop}.`);
      console.log(`[ProblemService] detectHungryCitizens: Created ${Object.keys(problems).length} problems for hungry citizens and their employers (user: ${username || 'all'}).`);
      return problems;
    } catch (error) {
      // Make the catch block more specific to this function
      console.error('[ProblemService] Error in detectHungryCitizens main try block:', error);
      return {};
    }
  }

  private generateHungryDescription(citizen: any): string {
    // Expect citizen.firstName, citizen.username, citizen.lastName to be camelCase
    const citizenName = `**${citizen.firstName || citizen.username} ${citizen.lastName || ''}**`.trim();
    return `${citizenName} has not eaten in over 24 hours and is now hungry. This can affect their well-being and ability to perform tasks effectively.\n\n` +
           `### Impact\n` +
           `- Reduced energy and focus.\n` +
           `- If employed, work productivity may be reduced by up to 50%.\n` +
           `- Prolonged hunger can lead to more severe health issues (if implemented).`;
  }

  private generateHungrySolutions(citizen: any): string {
    return `### Recommended Solutions\n` +
           `- Ensure the citizen consumes food. This might involve visiting a tavern, purchasing food from a market, or using owned food resources.\n` +
           `- Check if the citizen has sufficient Ducats to afford food.\n` +
           `- Review game mechanics related to food consumption and ensure the 'AteAt' (or equivalent) field is updated correctly after eating.`;
  }
}

// Export a singleton instance
export const problemService = new ProblemService();
