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
        const buildingName = building.name || building.type || 'Unnamed Building';

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
            description = `Your residential property, **${buildingName}** (ID: ${buildingId}), is currently unoccupied. An empty home generates no rental income and may fall into disrepair if neglected.`;
            solutions = `Consider the following actions:\n- List the property on the housing market to find a tenant.\n- Adjust the rent to attract occupants.\n- Ensure the property is well-maintained to be appealing.\n- If you no longer wish to manage it, consider selling the property.`;
            severity = 'low';
          } else if (category === 'business') {
            title = 'Vacant Business Premises';
            description = `Your commercial property, **${buildingName}** (ID: ${buildingId}), is currently unoccupied. A vacant business premises means no commercial activity, no income generation, and potential loss of economic value for the area.`;
            solutions = `Consider the following actions:\n- Lease the premises to an entrepreneur or business.\n- Start a new business yourself in this location if you have the resources and a viable idea.\n- Ensure the property is suitable for common business types.\n- If development is not feasible, consider selling the property.`;
            severity = 'medium';
          }

          problems[problemId] = {
            problemId,
            citizen: owner, // Problem is for the building owner
            assetType: 'building',
            assetId: buildingId,
            severity,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: buildingName, // Or a more specific location if available
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
        let effectiveUsername: string | undefined = undefined;
        // Access Username directly from 'c' or '(c as any)'
        const originalPascalUsername = c.Username;
        const camelUsername = (c as any).username;

        if (c.Username && typeof c.Username === 'string' && c.Username.trim() !== '') {
          effectiveUsername = c.Username.trim();
        } else if (camelUsername && typeof camelUsername === 'string' && camelUsername.trim() !== '') {
          effectiveUsername = camelUsername.trim();
          // Normalize to PascalCase for consistent use if found as camelCase
          c.Username = effectiveUsername; 
        }

        // Construct an identifier for logging
        // Access CitizenId directly from 'c' or '(c as any)'
        const logIdentifier = c.CitizenId || (c as any).citizenId || c.id || 'Unknown ID (no Username, CitizenId, or record id)';

        if (!effectiveUsername) {
          console.warn(`[ProblemService] detectHomelessCitizens: Citizen ${logIdentifier} has invalid or missing Username. Checked Username (PascalCase): '${originalPascalUsername}', username (camelCase): '${camelUsername}'. Excluding from homeless check.`);
          return false;
        }
        // If effectiveUsername was found (and potentially normalized to c.Username), we can proceed.

        // Normalize CitizenId onto the citizen object 'c'
        // Access CitizenId directly from 'c' or '(c as any)'
        const originalPascalCitizenId = c.CitizenId;
        const camelCitizenId = (c as any).citizenId;
        let effectiveCitizenId: string | undefined = undefined;

        if (c.CitizenId && typeof c.CitizenId === 'string' && c.CitizenId.trim() !== '') {
          effectiveCitizenId = c.CitizenId.trim();
        } else if (camelCitizenId && typeof camelCitizenId === 'string' && camelCitizenId.trim() !== '') {
          effectiveCitizenId = camelCitizenId.trim();
          // Normalize to PascalCase for consistent use if found as camelCase
          c.CitizenId = effectiveCitizenId;
        }
        
        if (!effectiveCitizenId) {
           // If no effective CitizenId, c.CitizenId remains as it was (likely undefined).
           // The problem creation logic `citizen.CitizenId || citizen.id` will handle this by falling back to c.id.
           console.warn(`[ProblemService] detectHomelessCitizens: Citizen (Username: ${c.Username}, AirtableID: ${c.id}) missing effective CitizenId (checked CitizenId: '${originalPascalCitizenId}', citizenId: '${camelCitizenId}'). Will use Airtable record ID as fallback assetId.`);
        }
        // c.CitizenId is now either the original PascalCase, the normalized camelCase, or undefined.

        // Normalize FirstName
        const originalPascalFirstName = c.FirstName;
        const camelFirstName = (c as any).firstName;
        if (camelFirstName && typeof camelFirstName === 'string' && camelFirstName.trim() !== '') {
            c.FirstName = camelFirstName.trim();
        } else if (originalPascalFirstName && typeof originalPascalFirstName === 'string' && originalPascalFirstName.trim() !== '') {
            c.FirstName = originalPascalFirstName.trim();
        } // else c.FirstName remains as is (could be undefined)

        // Normalize LastName
        const originalPascalLastName = c.LastName;
        const camelLastName = (c as any).lastName;
        if (camelLastName && typeof camelLastName === 'string' && camelLastName.trim() !== '') {
            c.LastName = camelLastName.trim();
        } else if (originalPascalLastName && typeof originalPascalLastName === 'string' && originalPascalLastName.trim() !== '') {
            c.LastName = originalPascalLastName.trim();
        } // else c.LastName remains as is (could be undefined)
        
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
            type: 'homeless_citizen',
            title: 'Homeless Citizen',
            description: this.generateHomelessDescription(citizen),
            solutions: this.generateHomelessSolutions(citizen),
            notes: `Citizen ${citizen.Username} has no building with Category 'home' where they are listed as Occupant.`,
            position: citizen.position || null // Use citizen.position (object) or null
          };

          // Check if this homeless citizen is employed and create a problem for the employer
          const citizenNameForLog = `${citizen.FirstName || citizen.Username} ${citizen.LastName || ''}`.trim();
          console.log(`[ProblemService] Homeless citizen ${citizen.Username} (ID: ${citizen.CitizenId || citizen.id}, Name: ${citizenNameForLog}). Checking for employer problem. Citizen's workplace data from API: ${JSON.stringify(citizen.workplace)}`);

          let workplaceBuilding: any = null;
          let workplaceSource: string = "";

          // Attempt 1: Use citizen.workplace.buildingId if available AND if it's a valid business workplace for this citizen
          if (citizen.workplace && typeof citizen.workplace === 'object' && citizen.workplace.buildingId) {
            const directWorkplaceId = citizen.workplace.buildingId;
            const candidateBuilding = buildings.find(b => b.id === directWorkplaceId || b.buildingId === directWorkplaceId);
            if (candidateBuilding) {
                // Validate if this candidate is actually their current business workplace
                if (candidateBuilding.category?.toLowerCase() === 'business' && candidateBuilding.occupant === citizen.Username) {
                    workplaceBuilding = candidateBuilding; // Valid workplace found directly
                    workplaceSource = `direct lookup (validated citizen.workplace.buildingId '${directWorkplaceId}')`;
                    console.log(`[ProblemService] Validated workplace for ${citizen.Username} via ${workplaceSource}. Building ID: ${workplaceBuilding.id}`);
                } else {
                    console.log(`[ProblemService] Building '${directWorkplaceId}' from citizen.workplace for ${citizen.Username} is not their current business workplace (Category: ${candidateBuilding.category}, Occupant: ${candidateBuilding.occupant}). Will attempt inference.`);
                    // workplaceBuilding remains null, so inference will be attempted below
                }
            } else {
                console.log(`[ProblemService] Workplace buildingId '${directWorkplaceId}' from citizen.workplace not found. Will attempt inference.`);
                // workplaceBuilding remains null
            }
          } else {
            console.log(`[ProblemService] citizen.workplace.buildingId not available for ${citizen.Username}. Will attempt inference.`);
            // workplaceBuilding remains null
          }

          // Attempt 2: Fallback to inferring workplace if not found and validated directly
          if (!workplaceBuilding) {
            const inferredBuilding = buildings.find(b => 
              b.occupant === citizen.Username && 
              b.category?.toLowerCase() === 'business'
            );
            if (inferredBuilding) {
              workplaceBuilding = inferredBuilding;
              workplaceSource = `inference (occupant='${citizen.Username}', category='business')`;
              console.log(`[ProblemService] Found workplace for ${citizen.Username} via ${workplaceSource}. Building ID: ${workplaceBuilding.id}`);
            }
          }

          // If a workplaceBuilding is identified (either directly validated or inferred)
          if (workplaceBuilding) {
            const workplaceId = workplaceBuilding.id || workplaceBuilding.buildingId || 'UnknownWorkplaceID';
            console.log(`[ProblemService] Processing workplace for ${citizen.Username} (Source: ${workplaceSource}): ID='${workplaceId}', Name='${workplaceBuilding.name}', Occupant='${workplaceBuilding.occupant}', RanBy='${workplaceBuilding.ranBy}', Category='${workplaceBuilding.category}'`);
            
            // At this point, workplaceBuilding should be a 'business' where citizen is 'occupant'.
            // The primary remaining checks are for 'ranBy'.
            const employerUsernameRaw = workplaceBuilding.ranBy;
            const employerUsernameTrimmed = employerUsernameRaw && typeof employerUsernameRaw === 'string' ? employerUsernameRaw.trim() : null;
            
            const hasValidEmployerField = employerUsernameRaw !== undefined && employerUsernameRaw !== null;
            const employerIsNonEmptyString = !!(employerUsernameTrimmed && employerUsernameTrimmed !== ''); // Ensure boolean
            const employerIsDifferentFromEmployee = employerIsNonEmptyString && employerUsernameTrimmed !== citizen.Username;

            console.log(`[ProblemService] Employer Check for ${citizen.Username} at workplace ${workplaceId}:`);
            console.log(`  - Raw 'ranBy' from building: '${employerUsernameRaw}' (type: ${typeof employerUsernameRaw})`);
            console.log(`  - Trimmed 'ranBy': '${employerUsernameTrimmed}'`);
            console.log(`  - citizen.Username for comparison: '${citizen.Username}'`);
            console.log(`  - Condition 'hasValidEmployerField' (ranBy is not null/undefined): ${hasValidEmployerField}`);
            console.log(`  - Condition 'employerIsNonEmptyString' (ranBy is non-empty string after trim): ${employerIsNonEmptyString}`);
            console.log(`  - Condition 'employerIsDifferentFromEmployee': ${employerIsDifferentFromEmployee}`);

            if (employerIsNonEmptyString && employerIsDifferentFromEmployee) {
              const employerUsername = employerUsernameTrimmed!; // employerUsernameTrimmed is guaranteed to be a non-empty string here
              // Use normalized citizen.FirstName and citizen.LastName
              const employeeName = `${citizen.FirstName || citizen.Username} ${citizen.LastName || ''}`.trim();
              const employerProblemId = `homeless_employee_impact_${employerUsername}_${citizen.Username}_${Date.now()}`;
              
              problems[employerProblemId] = {
                problemId: employerProblemId,
                citizen: employerUsername, // Problem is for the employer
                assetType: 'employee_performance',
                assetId: citizen.CitizenId || citizen.id, // Asset is the homeless employee
                severity: 'low',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                location: workplaceBuilding.name || workplaceId, // Workplace location
                type: 'homeless_employee_impact',
                title: 'Homeless Employee Impact',
                description: `Your employee, **${employeeName}**, is currently homeless. Homelessness can lead to instability and may result in up to a 50% reduction in productivity.`,
                solutions: `Consider discussing housing options with **${employeeName}** or providing assistance if possible. Monitor their work performance and consider recruitment alternatives if productivity is significantly impacted.`,
                notes: `Homeless Employee: ${citizen.Username} (ID: ${citizen.CitizenId || citizen.id}), Workplace: ${workplaceBuilding.name || workplaceId} (ID: ${workplaceId})`,
                position: workplaceBuilding.position || null // Workplace position
              };
              console.log(`[ProblemService] CREATED 'Homeless Employee Impact' problem for employer '${employerUsername}' regarding employee '${citizen.Username}'.`);
            } else {
              console.log(`[ProblemService] Conditions not met for employer problem for citizen '${citizen.Username}' at workplace ${workplaceId}. Detailed: hasValidEmployerField=${hasValidEmployerField}, employerIsNonEmptyString=${employerIsNonEmptyString}, employerIsDifferentFromEmployee=${employerIsDifferentFromEmployee}.`);
            }
          } else { // This 'else' corresponds to 'if (workplaceBuilding)'
            console.log(`[ProblemService] Citizen '${citizen.Username}' has no identifiable workplace (neither via citizen.workplace.buildingId nor inference). Skipping employer problem.`);
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
        let effectiveUsername: string | undefined = undefined;
        // Access Username directly from 'c' or '(c as any)'
        const originalPascalUsername = c.Username;
        const camelUsername = (c as any).username;

        if (c.Username && typeof c.Username === 'string' && c.Username.trim() !== '') {
          effectiveUsername = c.Username.trim();
        } else if (camelUsername && typeof camelUsername === 'string' && camelUsername.trim() !== '') {
          effectiveUsername = camelUsername.trim();
          // Normalize to PascalCase for consistent use if found as camelCase
          c.Username = effectiveUsername;
        }
        
        // Construct an identifier for logging
        // Access CitizenId directly from 'c' or '(c as any)'
        const logIdentifier = c.CitizenId || (c as any).citizenId || c.id || 'Unknown ID (no Username, CitizenId, or record id)';

        if (!effectiveUsername) {
          console.warn(`[ProblemService] detectWorklessCitizens: Citizen ${logIdentifier} has invalid or missing Username. Checked Username (PascalCase): '${originalPascalUsername}', username (camelCase): '${camelUsername}'. Excluding from workless check.`);
          return false;
        }
        // If effectiveUsername was found (and potentially normalized to c.Username), we can proceed.

        // Normalize CitizenId onto the citizen object 'c'
        // Access CitizenId directly from 'c' or '(c as any)'
        const originalPascalCitizenId = c.CitizenId;
        const camelCitizenId = (c as any).citizenId;
        let effectiveCitizenId: string | undefined = undefined;

        if (c.CitizenId && typeof c.CitizenId === 'string' && c.CitizenId.trim() !== '') {
          effectiveCitizenId = c.CitizenId.trim();
        } else if (camelCitizenId && typeof camelCitizenId === 'string' && camelCitizenId.trim() !== '') {
          effectiveCitizenId = camelCitizenId.trim();
          // Normalize to PascalCase for consistent use if found as camelCase
          c.CitizenId = effectiveCitizenId;
        }
        
        if (!effectiveCitizenId) {
           console.warn(`[ProblemService] detectWorklessCitizens: Citizen (Username: ${c.Username}, AirtableID: ${c.id}) missing effective CitizenId (checked CitizenId: '${originalPascalCitizenId}', citizenId: '${camelCitizenId}'). Will use Airtable record ID as fallback assetId.`);
        }
        // c.CitizenId is now either the original PascalCase, the normalized camelCase, or undefined.

        // Normalize FirstName
        const originalPascalFirstName = c.FirstName;
        const camelFirstName = (c as any).firstName;
        if (camelFirstName && typeof camelFirstName === 'string' && camelFirstName.trim() !== '') {
            c.FirstName = camelFirstName.trim();
        } else if (originalPascalFirstName && typeof originalPascalFirstName === 'string' && originalPascalFirstName.trim() !== '') {
            c.FirstName = originalPascalFirstName.trim();
        } // else c.FirstName remains as is (could be undefined)

        // Normalize LastName
        const originalPascalLastName = c.LastName;
        const camelLastName = (c as any).lastName;
        if (camelLastName && typeof camelLastName === 'string' && camelLastName.trim() !== '') {
            c.LastName = camelLastName.trim();
        } else if (originalPascalLastName && typeof originalPascalLastName === 'string' && originalPascalLastName.trim() !== '') {
            c.LastName = originalPascalLastName.trim();
        } // else c.LastName remains as is (could be undefined)

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
            type: 'workless_citizen',
            title: 'Workless Citizen',
            description: this.generateWorklessDescription(citizen),
            solutions: this.generateWorklessSolutions(citizen),
            notes: `Citizen ${citizen.Username} has no building with Category 'business' where they are listed as Occupant.`,
            position: citizen.position || null // Use citizen.position (object) or null
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
      const createdAt = new Date(contract.CreatedAt);
      const endAt = new Date(contract.EndAt);
      // Ensure Type exists and is a string before calling toLowerCase
      const type = typeof contract.Type === 'string' ? contract.Type.toLowerCase() : '';
      return createdAt <= now && endAt >= now && type !== 'expired'; // Also explicitly filter out 'expired' type if any
    });
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
        if (contract.BuyerBuilding) buildingsWithActiveContracts.add(contract.BuyerBuilding);
        if (contract.SellerBuilding) buildingsWithActiveContracts.add(contract.SellerBuilding);
      });
      console.log(`[ProblemService] detectNoActiveContractsForBusinesses: Found ${activeContracts.length} active contracts. Buildings involved in active contracts: ${buildingsWithActiveContracts.size}`);

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
          const buildingName = building.name || building.type || 'Unnamed Business Building';

          problems[problemId] = {
            problemId,
            citizen: owner,
            assetType: 'building',
            assetId: buildingId,
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: buildingName,
            type: 'no_active_contracts',
            title: 'No Active Contracts',
            description: `Your business premises, **${buildingName}**, currently has no active buy or sell contracts. This means it's not participating in the economy, potentially missing revenue opportunities or failing to secure necessary supplies.`,
            solutions: `To resolve this:\n- Create 'sell' contracts for goods or services your business produces.\n- Create 'buy' contracts for raw materials or goods your business needs.\n- Review market prices and demand to set competitive contract terms.\n- Ensure your business is operational and has an assigned occupant (worker).`,
            notes: `Building Type: ${building.type}. Owner: ${owner}. Category: Business. This building is not a BuyerBuilding or SellerBuilding in any active contract. Building ID: ${buildingId}.`,
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
        // Basic validation similar to other detection methods
        let effectiveUsername: string | undefined = undefined;
        const originalPascalUsername = c.Username;
        const camelUsername = (c as any).username;

        if (c.Username && typeof c.Username === 'string' && c.Username.trim() !== '') {
          effectiveUsername = c.Username.trim();
        } else if (camelUsername && typeof camelUsername === 'string' && camelUsername.trim() !== '') {
          effectiveUsername = camelUsername.trim();
          c.Username = effectiveUsername;
        }
        
        const logIdentifier = c.CitizenId || (c as any).citizenId || c.id || 'Unknown ID';
        if (!effectiveUsername) {
          console.warn(`[ProblemService] detectHungryCitizens: Citizen ${logIdentifier} has invalid/missing Username. Excluding from hunger check.`);
          return false;
        }

        // Normalize CitizenId
        const originalPascalCitizenId = c.CitizenId;
        const camelCitizenId = (c as any).citizenId;
        if (camelCitizenId && typeof camelCitizenId === 'string' && camelCitizenId.trim() !== '') {
          c.CitizenId = camelCitizenId.trim();
        } else if (originalPascalCitizenId && typeof originalPascalCitizenId === 'string' && originalPascalCitizenId.trim() !== '') {
          c.CitizenId = originalPascalCitizenId.trim();
        }

        // Normalize FirstName and LastName
        const nameFields = ['FirstName', 'LastName'];
        nameFields.forEach(field => {
            const pascalCaseField = c[field];
            const camelCaseField = (c as any)[field.charAt(0).toLowerCase() + field.slice(1)];
            if (camelCaseField && typeof camelCaseField === 'string' && camelCaseField.trim() !== '') {
                c[field] = camelCaseField.trim();
            } else if (pascalCaseField && typeof pascalCaseField === 'string' && pascalCaseField.trim() !== '') {
                c[field] = pascalCaseField.trim();
            }
        });
        
        // Ensure inVenice is true. The API should provide 'inVenice' as camelCase.
        const inVeniceStatus = c.inVenice === true; 
        if (!inVeniceStatus) {
            // This log can be very verbose if many citizens are not in Venice.
            // console.log(`[ProblemService] detectHungryCitizens Filter: Citizen ${c.Username || effectiveUsername} (ID: ${c.CitizenId || (c as any).citizenId || c.id}) is NOT in Venice (inVenice field value: ${c.inVenice}). Excluding.`);
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

      const buildings = await this.fetchAllBuildings(); // For employer check
      const problems: Record<string, any> = {};
      const now = new Date().getTime();
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

      citizens.forEach(citizen => {
        // Expect 'ateAt' from camelCased fields from API
        const ateAtTimestamp = citizen.ateAt || (citizen as any).AteAt; // Fallback for PascalCase, though API should provide camelCase
        
        console.log(`[ProblemService] detectHungryCitizens Loop: Processing citizen ${citizen.Username} (ID: ${citizen.CitizenId || citizen.id}). AteAt raw: '${ateAtTimestamp}' (type: ${typeof ateAtTimestamp})`);
        
        let isHungry;
        if (!ateAtTimestamp) { // Covers null, undefined, empty string, 0, false
            console.log(`[ProblemService] detectHungryCitizens: Citizen ${citizen.Username} IS hungry due to missing or falsy ateAtTimestamp ('${ateAtTimestamp}').`);
            isHungry = true;
        } else {
            try {
                const lastMealTime = new Date(ateAtTimestamp).getTime();
                if (isNaN(lastMealTime)) {
                    console.error(`[ProblemService] detectHungryCitizens: Parsed ateAt timestamp '${ateAtTimestamp}' for citizen ${citizen.Username} resulted in NaN. Assuming hungry.`);
                    isHungry = true;
                } else {
                    if (now - lastMealTime > twentyFourHoursInMs) {
                        isHungry = true;
                        console.log(`[ProblemService] detectHungryCitizens: Citizen ${citizen.Username} IS hungry. Last meal: ${new Date(lastMealTime).toISOString()}, Now: ${new Date(now).toISOString()}, Difference (ms): ${now - lastMealTime}`);
                    } else {
                        isHungry = false;
                        console.log(`[ProblemService] detectHungryCitizens: Citizen ${citizen.Username} is NOT hungry. Last meal: ${new Date(lastMealTime).toISOString()}, Now: ${new Date(now).toISOString()}, Difference (ms): ${now - lastMealTime}`);
                    }
                }
            } catch (e) {
                console.error(`[ProblemService] detectHungryCitizens: Error during date processing for ateAt timestamp '${ateAtTimestamp}' for citizen ${citizen.Username}. Assuming hungry. Error: ${e}`);
                isHungry = true;
            }
        }

        if (isHungry) {
          console.log(`[ProblemService] detectHungryCitizens: CONFIRMED HUNGRY - Citizen ${citizen.Username}. Creating problem.`);
          const problemId = `hungry_${citizen.CitizenId || citizen.id}_${Date.now()}`;
          problems[problemId] = {
            problemId,
            citizen: citizen.Username,
            assetType: 'citizen',
            assetId: citizen.CitizenId || citizen.id,
            severity: 'medium',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            location: this.getCitizenLocationString(citizen),
            type: 'hungry_citizen',
            title: 'Hungry Citizen',
            description: this.generateHungryDescription(citizen),
            solutions: this.generateHungrySolutions(citizen),
            notes: `Citizen ${citizen.Username} last ate at ${ateAtTimestamp || 'never/unknown'}. Current time: ${new Date(now).toISOString()}`,
            position: citizen.position || null
          };

          // Check for employer impact
          let workplaceBuilding: any = null;
          let workplaceSource: string = "";

          if (citizen.workplace && typeof citizen.workplace === 'object' && citizen.workplace.buildingId) {
            const directWorkplaceId = citizen.workplace.buildingId;
            const candidateBuilding = buildings.find(b => b.id === directWorkplaceId || b.buildingId === directWorkplaceId);
            if (candidateBuilding) {
                if (candidateBuilding.category?.toLowerCase() === 'business' && candidateBuilding.occupant === citizen.Username) {
                    workplaceBuilding = candidateBuilding;
                    workplaceSource = `direct lookup (validated citizen.workplace.buildingId '${directWorkplaceId}')`;
                }
            }
          }
          
          if (!workplaceBuilding) { // Fallback to inference
            const inferredBuilding = buildings.find(b => 
              b.occupant === citizen.Username && 
              b.category?.toLowerCase() === 'business'
            );
            if (inferredBuilding) {
              workplaceBuilding = inferredBuilding;
              workplaceSource = `inference (occupant='${citizen.Username}', category='business')`;
            }
          }

          if (workplaceBuilding) {
            const workplaceId = workplaceBuilding.id || workplaceBuilding.buildingId || 'UnknownWorkplaceID';
            const employerUsernameRaw = workplaceBuilding.ranBy;
            const employerUsernameTrimmed = employerUsernameRaw && typeof employerUsernameRaw === 'string' ? employerUsernameRaw.trim() : null;
            
            const hasValidEmployerField = employerUsernameRaw !== undefined && employerUsernameRaw !== null;
            const employerIsNonEmptyString = !!(employerUsernameTrimmed && employerUsernameTrimmed !== '');
            const employerIsDifferentFromEmployee = employerIsNonEmptyString && employerUsernameTrimmed !== citizen.Username;

            if (employerIsNonEmptyString && employerIsDifferentFromEmployee) {
              const employerUsername = employerUsernameTrimmed!;
              const employeeName = `${citizen.FirstName || citizen.Username} ${citizen.LastName || ''}`.trim();
              const employerProblemId = `hungry_employee_impact_${employerUsername}_${citizen.Username}_${Date.now()}`;
              
              problems[employerProblemId] = {
                problemId: employerProblemId,
                citizen: employerUsername,
                assetType: 'employee_performance',
                assetId: citizen.CitizenId || citizen.id,
                severity: 'low',
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                location: workplaceBuilding.name || workplaceId,
                type: 'hungry_employee_impact',
                title: 'Hungry Employee Impact',
                description: `Your employee, **${employeeName}**, is currently hungry. Hunger can significantly reduce productivity (up to 50%).`,
                solutions: `Ensure **${employeeName}** has the means and opportunity to eat. Consider if wages are sufficient or if working conditions impede access to food. Monitor their performance.`,
                notes: `Hungry Employee: ${citizen.Username} (ID: ${citizen.CitizenId || citizen.id}), Workplace: ${workplaceBuilding.name || workplaceId} (ID: ${workplaceId}). Last ate: ${ateAtTimestamp || 'never/unknown'}.`,
                position: workplaceBuilding.position || null
              };
              console.log(`[ProblemService] CREATED 'Hungry Employee Impact' problem for employer '${employerUsername}' regarding employee '${citizen.Username}'. Source: ${workplaceSource}`);
            }
          }
        }
      });

      console.log(`[ProblemService] detectHungryCitizens: Created ${Object.keys(problems).length} problems for hungry citizens and their employers (user: ${username || 'all'}).`);
      return problems;
    } catch (error) {
      console.error('[ProblemService] Error detecting hungry citizens:', error);
      return {};
    }
  }

  private generateHungryDescription(citizen: any): string {
    const citizenName = `**${citizen.FirstName || citizen.Username} ${citizen.LastName || ''}**`.trim();
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
