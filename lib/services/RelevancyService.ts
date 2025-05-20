import { CoordinateService } from './CoordinateService';

// Define interfaces for better type safety
interface LandData {
  id: string;
  owner?: string;
  center?: { lat: number, lng: number } | null;
  coordinates?: { lat: number, lng: number }[];
  historicalName?: string | null;
  buildingPoints?: number;
}

interface RelevancyScore {
  score: number;
  assetId: string;
  assetType: string;
  category: string;
  type: string;
  distance: number;
  closestLandId: string;
  isConnected: boolean;
  connectivityBonus: number;
  title: string;
  description: string;
  timeHorizon: string;
  status: string;
  targetCitizen?: string | string[]; // The primary citizen(s)/asset this relevancy is about
  relevantToCitizen?: string | string[]; // The citizen(s) for whom this relevancy is generated/saved
}

interface BuildingData {
  id: string; // Airtable record ID of the building
  buildingId?: string; // Custom BuildingId field if exists
  owner?: string;
  runBy?: string;
  occupant?: string;
  landId?: string;
  category?: string;
  type?: string;
  // Add other building fields if needed by relevancy calculations
}

export class RelevancyService {
  /**
   * Fetch all lands from the API
   */
  public async fetchLands(owner?: string): Promise<LandData[]> {
    try {
      // Construct the URL with optional owner filter
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      const url = owner 
        ? `${baseUrl}/api/lands?owner=${encodeURIComponent(owner)}` 
        : `${baseUrl}/api/lands`;
      
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
   * Calculate relevancy scores using the API data
   */
  public async calculateRelevancyWithApiData(Citizen: string): Promise<Record<string, RelevancyScore>> {
    try {
      // Fetch lands owned by the citizen
      const citizenLands = await this.fetchLands(Citizen);
      
      if (citizenLands.length === 0) {
        console.log(`Citizen ${Citizen} does not own any lands`);
        return {};
      }
      
      // Fetch all lands
      const allLands = await this.fetchLands();
      
      // Fetch land groups for connectivity analysis
      const landGroups = await this.fetchLandGroups();
      
      // Calculate relevancy scores
      const relevancyScores = this.calculateLandProximityRelevancy(citizenLands, allLands, landGroups);
      
      return relevancyScores;
    } catch (error) {
      console.error('Error calculating relevancy with API data for citizen:', Citizen, error);
      return {};
    }
  }

  /**
   * Fetch land groups for connectivity analysis
   */
  public async fetchLandGroups(): Promise<Record<string, string>> {
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/land-groups?includeUnconnected=true&minSize=1`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch land groups: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.landGroups) {
        console.log(`Loaded ${data.landGroups.length} land groups for connectivity analysis`);
        
        // Create a mapping of polygon ID to group ID
        const groupMapping: Record<string, string> = {};
        data.landGroups.forEach((group: any) => {
          if (group.lands && Array.isArray(group.lands)) {
            group.lands.forEach((landId: string) => {
              groupMapping[landId] = group.groupId;
            });
          }
        });
        
        return groupMapping;
      }
      
      return {};
    } catch (error) {
      console.error('Error fetching land groups:', error);
      return {};
    }
  }

  /**
   * Calculate proximity-based relevancy scores for lands relative to an AI owner
   */
  public calculateLandProximityRelevancy(
    aiLands: LandData[],
    allLands: LandData[],
    landGroups?: Record<string, string>
  ): Record<string, RelevancyScore> {
    // Skip calculation if AI has no lands or there are no other lands
    if (!aiLands.length || !allLands.length) {
      return {};
    }
    
    // Get AI land centroids and groups
    const aiCentroids = this.getValidCentroids(aiLands);
    const aiLandGroups = this.getAILandGroups(aiLands, landGroups);
    
    // Calculate relevancy for each land not owned by the AI
    const relevancyScores: Record<string, RelevancyScore> = {};
    
    allLands.forEach(land => {
      // Skip lands already owned by the AI
      if (aiLands.some(aiLand => aiLand.id === land.id)) {
        return;
      }
      
      // Calculate relevancy for this land
      const relevancy = this.calculateSingleLandRelevancy(
        land, 
        aiLands, 
        aiCentroids, 
        aiLandGroups, 
        landGroups
      );
      
      if (relevancy) {
        relevancyScores[land.id] = relevancy;
      }
    });
    
    return relevancyScores;
  }
  
  /**
   * Calculate relevancy for a single land
   */
  private calculateSingleLandRelevancy(
    land: LandData,
    aiLands: LandData[],
    aiCentroids: { lat: number, lng: number }[],
    aiLandGroups: Set<string>,
    landGroups?: Record<string, string>
  ): RelevancyScore | null {
    const landCentroid = this.getLandCentroid(land);
    if (!landCentroid) return null;
    
    // Find closest AI land and minimum distance
    const { minDistance, closestAiLand } = this.findClosestAILand(
      landCentroid, 
      aiCentroids, 
      aiLands
    );
    
    // Calculate base score from distance
    let score = this.calculateBaseScore(minDistance);
    
    // Check connectivity and apply bonus if connected
    const { isConnected, connectivityBonus } = this.checkConnectivity(
      land, 
      aiLandGroups, 
      landGroups
    );
    
    // Apply connectivity bonus
    score += connectivityBonus;
    
    // Cap score at 100
    score = Math.min(100, score);
    
    // Round to 2 decimal places
    const numericScore = parseFloat(score.toFixed(2));
    
    // Determine status and time horizon
    const status = this.determineStatus(numericScore);
    const timeHorizon = isConnected ? 'short' : 'medium';
    
    const landOwnerName = land.owner || '';

    // Generate title and description
    const title = this.generateRelevancyTitle(land, minDistance, isConnected, landOwnerName);
    const description = this.generateRelevancyDescription(land, minDistance, isConnected, landOwnerName);
    
    // Return the complete relevancy score object
    return {
      score: numericScore,
      assetId: land.id,
      assetType: 'land',
      category: 'proximity',
      type: isConnected ? 'connected' : 'geographic',
      distance: Math.round(minDistance),
      closestLandId: closestAiLand?.id || '',
      isConnected,
      connectivityBonus,
      title,
      description,
      timeHorizon,
      status,
      targetCitizen: landOwnerName // Owner of the target land
    };
  }
  
  /**
   * Get valid centroids from lands
   */
  private getValidCentroids(lands: LandData[]): { lat: number, lng: number }[] {
    return lands
      .map(land => this.getLandCentroid(land))
      .filter(Boolean) as { lat: number, lng: number }[];
  }
  
  /**
   * Get the set of land groups that the AI owns lands in
   */
  private getAILandGroups(aiLands: LandData[], landGroups?: Record<string, string>): Set<string> {
    const aiLandGroups = new Set<string>();
    
    if (landGroups) {
      aiLands.forEach(land => {
        const groupId = landGroups[land.id];
        if (groupId) {
          aiLandGroups.add(groupId);
        }
      });
    }
    
    return aiLandGroups;
  }
  
  /**
   * Find the closest AI land and minimum distance
   */
  private findClosestAILand(
    landCentroid: { lat: number, lng: number },
    aiCentroids: { lat: number, lng: number }[],
    aiLands: LandData[]
  ): { minDistance: number, closestAiLand: LandData | null } {
    let minDistance = Infinity;
    let closestAiLandIndex = -1;
    
    for (let i = 0; i < aiCentroids.length; i++) {
      const aiCentroid = aiCentroids[i];
      
      const distance = this.calculateDistance(
        landCentroid.lat, landCentroid.lng,
        aiCentroid.lat, aiCentroid.lng
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestAiLandIndex = i;
      }
    }
    
    return {
      minDistance,
      closestAiLand: closestAiLandIndex >= 0 ? aiLands[closestAiLandIndex] : null
    };
  }
  
  /**
   * Calculate base score from distance using exponential decay
   */
  private calculateBaseScore(distance: number): number {
    // Using an exponential decay function: score = 100 * e^(-distance/500)
    // This gives a score of 100 at distance 0, ~60 at 250m, ~37 at 500m, etc.
    return 100 * Math.exp(-distance / 500);
  }
  
  /**
   * Check if land is connected to AI lands and calculate connectivity bonus
   */
  private checkConnectivity(
    land: LandData,
    aiLandGroups: Set<string>,
    landGroups?: Record<string, string>
  ): { isConnected: boolean, connectivityBonus: number } {
    let isConnected = false;
    let connectivityBonus = 0;
    
    if (landGroups && landGroups[land.id]) {
      const landGroupId = landGroups[land.id];
      if (aiLandGroups.has(landGroupId)) {
        // Apply a significant bonus for lands in the same group
        connectivityBonus = 30;
        isConnected = true;
      }
    }
    
    return { isConnected, connectivityBonus };
  }
  
  /**
   * Determine status based on score
   */
  private determineStatus(score: number): string {
    if (score > 70) return 'high';
    if (score > 40) return 'medium';
    return 'low';
  }
  
  /**
   * Generate a title for the relevancy with better formatting
   */
  private generateRelevancyTitle(land: LandData, distance: number, isConnected: boolean, landOwnerName?: string): string {
    const landName = land.historicalName ? land.historicalName : 'Land';
    const ownerInfo = landOwnerName ? ` (Owned by ${landOwnerName})` : '';
    
    return isConnected 
      ? `Connected: ${landName}${ownerInfo} (${Math.round(distance)}m)` 
      : `Nearby: ${landName}${ownerInfo} (${Math.round(distance)}m)`;
  }
  
  /**
   * Generate a descriptive text for the relevancy with markdown formatting
   */
  private generateRelevancyDescription(land: LandData, distance: number, isConnected: boolean, landOwnerName?: string): string {
    const landName = land.historicalName 
      ? `**${land.historicalName}**` 
      : '**This land**';
    const ownerInfo = landOwnerName ? `, owned by **${landOwnerName}**,` : '';
    
    const distanceText = `**${Math.round(distance)} meters** from your nearest property`;
    
    if (isConnected) {
      return `${landName}${ownerInfo} is ${distanceText} and is **connected to your existing properties by bridges**.\n\n` +
             `### Strategic Value\n` +
             `- Acquiring this land would **strengthen your presence** in this district\n` +
             `- Connected lands allow for **easier resource transport**\n` +
             `- Provides **contiguous territory** for your holdings`;
    } else {
      return `${landName}${ownerInfo} is ${distanceText}.\n\n` +
             `### Strategic Value\n` +
             `- Acquiring this land would **expand your influence** to a new area\n` +
             `- Creates a **new foothold** in this district\n` +
             `- Potential for **future connections** to your existing properties`;
    }
  }
  
  /**
   * Get the centroid of a land polygon
   */
  private getLandCentroid(land: LandData): { lat: number, lng: number } | null {
    // First try to use the land's center property if available
    if (land.center && typeof land.center.lat === 'number' && typeof land.center.lng === 'number') {
      return {
        lat: land.center.lat,
        lng: land.center.lng
      };
    }
    
    // Otherwise calculate from coordinates
    if (land.coordinates && Array.isArray(land.coordinates) && land.coordinates.length > 0) {
      const sumLat = land.coordinates.reduce((sum, coord) => sum + coord.lat, 0);
      const sumLng = land.coordinates.reduce((sum, coord) => sum + coord.lng, 0);
      
      return {
        lat: sumLat / land.coordinates.length,
        lng: sumLng / land.coordinates.length
      };
    }
    
    return null;
  }
  
  /**
   * Calculate the distance between two points using the Haversine formula
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  }
  
  /**
   * Calculate land domination relevancy scores for all citizens
   * This measures how dominant citizens are in terms of land ownership and building potential
   */
  public calculateLandDominationRelevancy(
    allCitizens: any[],
    allLands: LandData[]
  ): Record<string, RelevancyScore> {
    // Skip calculation if there are no lands or citizens
    if (!allLands.length || !allCitizens.length) {
      return {};
    }
    
    // Calculate land counts and building points for each citizen
    const citizenLandCounts: Record<string, number> = {};
    const citizenBuildingPoints: Record<string, number> = {};
    
    allLands.forEach(land => {
      if (land.owner) {
        // Count lands
        citizenLandCounts[land.owner] = (citizenLandCounts[land.owner] || 0) + 1;
        
        // Count building points - use BuildingPointsCount if available
        let buildingPointsCount = 0;
        if (land.BuildingPointsCount !== undefined) {
          // If BuildingPointsCount is available, use it directly
          buildingPointsCount = land.BuildingPointsCount;
        } else if (land.buildingPointsCount !== undefined) {
          // Try camelCase version
          buildingPointsCount = land.buildingPointsCount;
        } else if (land.buildingPoints && Array.isArray(land.buildingPoints)) {
          // Fallback to array length if available
          buildingPointsCount = land.buildingPoints.length;
        } else if (typeof land.buildingPoints === 'number') {
          // Fallback to direct number if available
          buildingPointsCount = land.buildingPoints;
        }
        
        // Add to the citizen's total
        citizenBuildingPoints[land.owner] = (citizenBuildingPoints[land.owner] || 0) + buildingPointsCount;
      }
    });
    
    // Find maximum values for normalization
    const maxLandCount = Math.max(...Object.values(citizenLandCounts), 1);
    const maxBuildingPoints = Math.max(...Object.values(citizenBuildingPoints), 1);
    
    // Calculate relevancy for each citizen who owns land
    const relevancyScores: Record<string, RelevancyScore> = {};
    
    // Get list of citizens who own land
    const landOwners = Object.keys(citizenLandCounts);
    
    landOwners.forEach(username => {
      // Calculate land domination score
      // 60% weight on land count, 40% weight on building points
      const landCountScore = (citizenLandCounts[username] / maxLandCount) * 60;
      const buildingPointsScore = (citizenBuildingPoints[username] / maxBuildingPoints) * 40;
      
      // Combined score
      const score = landCountScore + buildingPointsScore;
      
      // Round to 2 decimal places
      const numericScore = parseFloat(score.toFixed(2));
      
      // Determine status based on score
      let status = 'low';
      if (numericScore > 70) status = 'high';
      else if (numericScore > 40) status = 'medium';
      
      // Find citizen details if available
      const citizen = allCitizens.find(c => 
        (c.username === username) || (c.Username === username)
      );
      
      const firstName = citizen?.firstName || citizen?.FirstName || '';
      const lastName = citizen?.lastName || citizen?.LastName || '';
      const fullName = firstName && lastName ? `${firstName} ${lastName}` : username;
      
      // Generate title and description with markdown formatting
      const title = `Land Domination: ${fullName}`;
      const description = `**${fullName}** owns **${citizenLandCounts[username]} lands** with **${citizenBuildingPoints[username]} building points**.\n\n` +
                         `### Strategic Assessment\n` +
                         `- This makes them a **significant landowner** in Venice\n` +
                         `- Their holdings represent **${Math.round((citizenLandCounts[username] / maxLandCount) * 100)}%** of the most extensive land portfolio\n` +
                         `- Their building capacity is **${Math.round((citizenBuildingPoints[username] / maxBuildingPoints) * 100)}%** of the largest building portfolio\n\n` +
                         `Consider their influence when making strategic land acquisition decisions.`;
      
      // Create the relevancy score object
      relevancyScores[username] = {
        score: numericScore,
        assetId: username, // Using username as the asset ID for citizen-based relevancies
        assetType: 'citizen',
        category: 'domination',
        type: 'landowner',
        distance: 0, // Not applicable for this relevancy type
        closestLandId: '', // Not applicable for this relevancy type
        isConnected: false, // Not applicable for this relevancy type
        connectivityBonus: 0, // Not applicable for this relevancy type
        title,
        description,
        timeHorizon: 'medium',
        status,
        targetCitizen: "all" // Use "all" instead of individual citizens
      };
    });
    
    return relevancyScores;
  }

  /**
   * Calculate relevancy scores in batches to avoid memory issues
   */
  public calculateRelevancyInBatches(
    aiLands: LandData[],
    allLands: LandData[],
    landGroups?: Record<string, string>,
    batchSize: number = 100
  ): Record<string, RelevancyScore> {
    // Skip calculation if AI has no lands
    if (!aiLands.length) {
      return {};
    }
    
    const relevancyScores: Record<string, RelevancyScore> = {};
    const totalLands = allLands.length;
    
    // Process in batches
    for (let i = 0; i < totalLands; i += batchSize) {
      const batch = allLands.slice(i, Math.min(i + batchSize, totalLands));
      const batchResults = this.calculateLandProximityRelevancy(aiLands, batch, landGroups);
      
      // Merge batch results
      Object.assign(relevancyScores, batchResults);
    }
    
    return relevancyScores;
  }

  /**
   * Calculate relevancy scores for a specific type
   * @param aiLands - Lands owned by the AI
   * @param allLands - All lands in the system
   * @param landGroups - Land connectivity groups
   * @param typeFilter - The specific type to filter by (e.g., 'connected', 'geographic')
   */
  public calculateRelevancyByType(
    aiLands: LandData[],
    allLands: LandData[],
    landGroups?: Record<string, string>,
    typeFilter?: string
  ): Record<string, RelevancyScore> {
    // Get all relevancy scores first
    const allRelevancies = this.calculateLandProximityRelevancy(aiLands, allLands, landGroups);
    
    // If no type filter is provided, return all relevancies
    if (!typeFilter) {
      return allRelevancies;
    }
    
    // Filter relevancies by the specified type
    const filteredRelevancies: Record<string, RelevancyScore> = {};
    
    Object.entries(allRelevancies).forEach(([landId, relevancy]) => {
      if (relevancy.type === typeFilter) {
        filteredRelevancies[landId] = relevancy;
      }
    });
    
    return filteredRelevancies;
  }

  /**
   * Calculate housing situation relevancy for all citizens
   */
  public async calculateHousingRelevancy(): Promise<any> {
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/relevancies/housing`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch housing relevancy: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('Successfully calculated housing relevancy');
        return data.housingRelevancy;
      } else {
        console.error('Error calculating housing relevancy:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Error calculating housing relevancy:', error);
      return null;
    }
  }

  /**
   * Calculate job market situation relevancy for all citizens
   */
  public async calculateJobMarketRelevancy(): Promise<any> {
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      const response = await fetch(`${baseUrl}/api/relevancies/jobs`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch job market relevancy: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('Successfully calculated job market relevancy');
        return data.jobMarketRelevancy;
      } else {
        console.error('Error calculating job market relevancy:', data.error);
        return null;
      }
    } catch (error) {
      console.error('Error calculating job market relevancy:', error);
      return null;
    }
  }

  /**
   * Calculate building-land ownership relevancy scores
   * This identifies when a citizen owns buildings on land owned by other citizens
   */
  public async calculateBuildingLandOwnershipRelevancy(
    username: string // This is the building owner being processed
  ): Promise<RelevancyScore[]> {
    const createdRelevancies: RelevancyScore[] = [];
    try {
      // Fetch buildings owned by this citizen (username)
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      console.log(`[RelevancyService] Calculating building/land ownership for ${username}`);
      const buildingsResponse = await fetch(`${baseUrl}/api/buildings?owner=${encodeURIComponent(username)}`);
      
      if (!buildingsResponse.ok) {
        console.error(`[RelevancyService] Failed to fetch buildings for ${username}: ${buildingsResponse.status}`);
        return {};
      }
      
      const buildingsData = await buildingsResponse.json();
      const buildings = buildingsData.buildings || [];
      console.log(`[RelevancyService] Fetched ${buildings.length} buildings for ${username}`);
      
      // Skip if no buildings
      if (!buildings.length) {
        console.log(`[RelevancyService] Citizen ${username} does not own any buildings. No building ownership relevancies.`);
        return {};
      }
      
      // Fetch all lands to get owner information
      const landsResponse = await fetch(`${baseUrl}/api/lands`);
      
      if (!landsResponse.ok) {
        console.error(`[RelevancyService] Failed to fetch all lands: ${landsResponse.status}`);
        return {};
      }
      
      const landsData = await landsResponse.json();
      const lands = landsData.lands || [];
      console.log(`[RelevancyService] Fetched ${lands.length} total lands for checking ownership.`);
      
      // Create a map of land ID to land data for quick lookup
      const landMap: Record<string, LandData> = {};
      console.log(`[RelevancyService] Building landMap. Total lands fetched: ${lands.length} for user ${username}`);
      lands.forEach((land: LandData) => {
        const idToUse = land.landId || land.id; 
        if (!idToUse) {
          console.warn(`[RelevancyService] Land record (Airtable ID: ${land.id}, landId: ${land.landId}) has no usable ID for landMap for user ${username}. Skipping.`);
          return;
        }
        // The following log can be very verbose if there are many lands. Enable if needed for deep debugging.
        // console.log(`[RelevancyService] Adding to landMap for user ${username}: Key=${idToUse}, Owner=${land.owner}, landId=${land.landId}, RecordID=${land.id}`);
        landMap[idToUse] = land;
      });
      console.log(`[RelevancyService] landMap created with ${Object.keys(landMap).length} entries for user ${username}.`);
      
      // Calculate relevancy for each building on land owned by another citizen
      
      buildings.forEach(building => {
        // Safeguard: Ensure the building being processed is actually owned by the 'username'
        // for whom this function was called. This protects against issues if the upstream
        // /api/buildings?owner=X filter isn't perfect.
        if (building.owner !== username) {
          console.warn(`[RelevancyService] Safeguard: Building ${building.buildingId} (owner: ${building.owner}) does not match current processing user (${username}). Skipping.`);
          return;
        }

        console.log(`[RelevancyService] Processing building ${building.buildingId} (type: ${building.type}) for building owner: ${username}`);
        const landId = building.landId; // This should be the landId like 'poly_xxx'
        if (!landId) {
          console.log(`[RelevancyService] Building ${building.buildingId} has no land_id. Skipping.`);
          return;
        }
        
        const land = landMap[landId];
        if (!land) {
          console.log(`[RelevancyService] Land ${landId} for building ${building.buildingId} not found in landMap. Skipping.`);
          return;
        }
        
        console.log(`[RelevancyService] Building ${building.buildingId} is on land ${landId} (Owner: ${land.owner}, landId: ${land.landId}, RecordID: ${land.id})`);

        // Skip if land has no owner or is owned by the same citizen
        if (!land.owner) {
          console.log(`[RelevancyService] Land ${landId} for building ${building.buildingId} has no owner. Skipping.`);
          return;
        }
        if (land.owner === username) {
          console.log(`[RelevancyService] Land ${landId} for building ${building.buildingId} is owned by the same user (${username}). Skipping.`);
          return;
        }
        
        console.log(`[RelevancyService] CREATING relevancy for building ${building.buildingId} on land ${landId} (owned by ${land.owner}, building owner ${username})`);
        // Create a unique ID for this relevancy
        const relevancyId = `${building.buildingId}_${landId}`;
        
        // Calculate score based on building type and importance
        // Base score of 70 for all buildings on others' land
        let score = 70;
        
        // Adjust score based on building type if needed
        // For example, business buildings might be more important
        if (building.category === 'business') {
          score += 15;
        }
        
        // Cap score at 100
        score = Math.min(100, score);
        
        // Generate title and description
        const buildingType = this.formatBuildingType(building.type);
        const title = `Your ${buildingType} on ${land.owner}'s Land`;
        
        const description = `You own a **${buildingType}** on land owned by **${land.owner}**.\n\n` +
                           `### Strategic Considerations\n` +
                           `- You pay lease fees to this landowner\n` +
                           `- Your building operations depend on this relationship\n` +
                           `- Consider maintaining good relations with this landowner`;
        
        // Determine status based on score
        const status = this.determineStatus(score);
        
        // 1. Relevancy for the Building Owner (username)
        createdRelevancies.push({
          score: parseFloat(score.toFixed(2)),
          assetId: building.buildingId, // ID of the building
          assetType: 'building',
          category: 'ownership_conflict',
          type: 'building_on_others_land',
          distance: 0, 
          closestLandId: landId, // ID of the land the building is on
          isConnected: false, 
          connectivityBonus: 0, 
          title, // "Your ${buildingType} on ${land.owner}'s Land"
          description,
          timeHorizon: 'medium',
          status,
          targetCitizen: land.owner, // The owner of the land
          relevantToCitizen: username // This relevancy is FOR the building owner
        });

        // 2. Relevancy for the Land Owner (land.owner)
        const landOwnerScore = score; // Score can be the same or adjusted
        const landOwnerStatus = status;
        const landOwnerTitle = `${username}'s ${buildingType} on Your Land`;
        const landOwnerDescription = `**${username}** owns a **${buildingType}** on your land.\n\n` +
                                     `### Strategic Considerations\n` +
                                     `- You likely receive lease fees from this building owner.\n` +
                                     `- Their building operations are on your property.\n` +
                                     `- Monitor this situation for any changes or opportunities.`;
        
        createdRelevancies.push({
          score: parseFloat(landOwnerScore.toFixed(2)),
          assetId: building.buildingId, // The asset is still the building
          assetType: 'building',
          category: 'ownership_conflict',
          type: 'others_building_on_your_land', // Different type for landowner's perspective
          distance: 0,
          closestLandId: landId,
          isConnected: false,
          connectivityBonus: 0,
          title: landOwnerTitle,
          description: landOwnerDescription,
          timeHorizon: 'medium',
          status: landOwnerStatus,
          targetCitizen: username, // The owner of the building
          relevantToCitizen: land.owner // This relevancy is FOR the land owner
        });
      });
      
      console.log(`[RelevancyService] Generated ${createdRelevancies.length} building/land ownership relevancy objects originating from building owner ${username} (includes relevancies for landowners).`);
      return createdRelevancies;
    } catch (error) {
      console.error(`[RelevancyService] Error calculating building-land ownership relevancy for building owner ${username}:`, error);
      return [];
    }
  }

  /**
   * Format building type for display
   */
  private formatBuildingType(type: string): string {
    if (!type) return 'Building';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  }

  /**
   * Calculate building-operator relevancy scores
   * This identifies when a citizen owns a building run by another citizen, or runs a building owned by another.
   */
  public async calculateBuildingOperatorRelevancy(
    citizenUsername: string // The citizen for whom this specific calculation is initiated
  ): Promise<RelevancyScore[]> {
    const createdRelevancies: RelevancyScore[] = [];
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      console.log(`[RelevancyService] Calculating building/operator relevancy related to ${citizenUsername}`);
      
      const buildingsResponse = await fetch(`${baseUrl}/api/buildings`); 
      
      if (!buildingsResponse.ok) {
        console.error(`[RelevancyService] Failed to fetch buildings for operator relevancy: ${buildingsResponse.status}`);
        return [];
      }
      
      const buildingsData = await buildingsResponse.json();
      const allBuildings = buildingsData.buildings || [];
      console.log(`[RelevancyService] Fetched ${allBuildings.length} total buildings for checking operator relationships.`);

      for (const building of allBuildings) {
        const buildingOwner = building.owner;
        const buildingOperator = building.runBy; 

        if (!buildingOwner || !buildingOperator || buildingOwner === buildingOperator) {
          continue; 
        }

        const buildingType = this.formatBuildingType(building.type);
        const score = 80; 
        const status = this.determineStatus(score);

        if (buildingOwner === citizenUsername) {
          createdRelevancies.push({
            score,
            assetId: building.id,
            assetType: 'building',
            category: 'operator_relations',
            type: 'operator_in_your_building', 
            distance: 0,
            closestLandId: building.landId || '',
            isConnected: false,
            connectivityBonus: 0,
            title: `${buildingOperator} Operates Your ${buildingType}`,
            description: `**${buildingOperator}** is currently operating your **${buildingType}**.\n\n` +
                         `### Relationship Details:\n` +
                         `- You own this building, and they manage its operations.\n` +
                         `- This relationship is key to the building's productivity and your income from it.`,
            timeHorizon: 'ongoing',
            status,
            targetCitizen: buildingOperator, 
            relevantToCitizen: citizenUsername 
          });
        }
        else if (buildingOperator === citizenUsername) {
          createdRelevancies.push({
            score,
            assetId: building.id,
            assetType: 'building',
            category: 'operator_relations',
            type: 'running_in_others_building', 
            distance: 0,
            closestLandId: building.landId || '',
            isConnected: false,
            connectivityBonus: 0,
            title: `You Operate ${buildingOwner}'s ${buildingType}`,
            description: `You are currently operating the **${buildingType}** owned by **${buildingOwner}**.\n\n` +
                         `### Relationship Details:\n` +
                         `- They own this building, and you manage its operations.\n` +
                         `- This relationship is key to your business activities.`,
            timeHorizon: 'ongoing',
            status,
            targetCitizen: buildingOwner, 
            relevantToCitizen: citizenUsername 
          });
        }
      }
      
      console.log(`[RelevancyService] Generated ${createdRelevancies.length} building/operator relevancy objects for ${citizenUsername}.`);
      return createdRelevancies;
    } catch (error) {
      console.error(`[RelevancyService] Error calculating building/operator relevancy for ${citizenUsername}:`, error);
      return [];
    }
  }

  /**
   * Calculate building-occupant relationship relevancy scores
   * This identifies employer/employee or landlord/renter relationships.
   */
  public async calculateBuildingOccupantRelationshipRelevancy(
    citizenUsername: string // The citizen for whom this specific calculation is initiated
  ): Promise<RelevancyScore[]> {
    const createdRelevancies: RelevancyScore[] = [];
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      console.log(`[RelevancyService] Calculating building/occupant relationship relevancy related to ${citizenUsername}`);
      
      const buildingsResponse = await fetch(`${baseUrl}/api/buildings`);
      if (!buildingsResponse.ok) {
        console.error(`[RelevancyService] Failed to fetch buildings for occupant relationship relevancy: ${buildingsResponse.status}`);
        return [];
      }
      
      const buildingsData = await buildingsResponse.json();
      const allBuildings = buildingsData.buildings || [];
      console.log(`[RelevancyService] Fetched ${allBuildings.length} total buildings for checking occupant relationships.`);

      for (const building of allBuildings) {
        const buildingRunBy = building.runBy; // Employer or Landlord
        const buildingOccupant = building.occupant; // Employee or Renter
        const buildingCategory = building.category?.toLowerCase(); // 'business' or 'home'
        const buildingType = this.formatBuildingType(building.type);

        if (!buildingRunBy || !buildingOccupant || buildingRunBy === buildingOccupant || !buildingCategory) {
          continue; // Relationship not fully defined or no conflict
        }

        const score = 75; // Base score for these relationships
        const status = this.determineStatus(score);

        // Case 1: citizenUsername is the RunBy (Employer/Landlord)
        if (buildingRunBy === citizenUsername) {
          if (buildingCategory === 'business') {
            createdRelevancies.push({
              score, assetId: building.id, assetType: 'building', category: 'occupancy_relations', type: 'employer_to_employee',
              distance: 0, closestLandId: building.landId || '', isConnected: false, connectivityBonus: 0,
              title: `You Employ ${buildingOccupant} at Your ${buildingType}`,
              description: `**${buildingOccupant}** works at your **${buildingType}**.\n\n` +
                           `### Employer-Employee Relationship:\n` +
                           `- You are the employer providing this job.\n` +
                           `- Their work contributes to your business's success.`,
              timeHorizon: 'ongoing', status, targetCitizen: buildingOccupant, relevantToCitizen: citizenUsername
            });
          } else if (buildingCategory === 'home') {
            createdRelevancies.push({
              score, assetId: building.id, assetType: 'building', category: 'occupancy_relations', type: 'landlord_to_renter',
              distance: 0, closestLandId: building.landId || '', isConnected: false, connectivityBonus: 0,
              title: `${buildingOccupant} Rents Your ${buildingType}`,
              description: `**${buildingOccupant}** is renting your **${buildingType}**.\n\n` +
                           `### Landlord-Renter Relationship:\n` +
                           `- You are the landlord for this property.\n` +
                           `- This generates rental income for you.`,
              timeHorizon: 'ongoing', status, targetCitizen: buildingOccupant, relevantToCitizen: citizenUsername
            });
          }
        }
        // Case 2: citizenUsername is the Occupant (Employee/Renter)
        else if (buildingOccupant === citizenUsername) {
          if (buildingCategory === 'business') {
            createdRelevancies.push({
              score, assetId: building.id, assetType: 'building', category: 'occupancy_relations', type: 'employee_to_employer',
              distance: 0, closestLandId: building.landId || '', isConnected: false, connectivityBonus: 0,
              title: `You Work for ${buildingRunBy} at Their ${buildingType}`,
              description: `You are employed at the **${buildingType}** run by **${buildingRunBy}**.\n\n` +
                           `### Employee-Employer Relationship:\n` +
                           `- This is your place of employment.\n` +
                           `- Your work contributes to this business.`,
              timeHorizon: 'ongoing', status, targetCitizen: buildingRunBy, relevantToCitizen: citizenUsername
            });
          } else if (buildingCategory === 'home') {
            createdRelevancies.push({
              score, assetId: building.id, assetType: 'building', category: 'occupancy_relations', type: 'renter_to_landlord',
              distance: 0, closestLandId: building.landId || '', isConnected: false, connectivityBonus: 0,
              title: `You Rent a ${buildingType} from ${buildingRunBy}`,
              description: `You are renting a **${buildingType}** from **${buildingRunBy}**.\n\n` +
                           `### Renter-Landlord Relationship:\n` +
                           `- This is your rented accommodation.\n` +
                           `- You pay rent to this landlord.`,
              timeHorizon: 'ongoing', status, targetCitizen: buildingRunBy, relevantToCitizen: citizenUsername
            });
          }
        }
      }
      
      console.log(`[RelevancyService] Generated ${createdRelevancies.length} building/occupant relationship relevancy objects for ${citizenUsername}.`);
      return createdRelevancies;
    } catch (error) {
      console.error(`[RelevancyService] Error calculating building/occupant relationship relevancy for ${citizenUsername}:`, error);
      return [];
    }
  }

  /**
   * Calculate "same island neighbor" relevancy.
   * Identifies groups of citizens living on the same LandId.
   * Returns an array of RelevancyScore objects, one for each island/land with multiple occupants.
   */
  public async calculateSameIslandNeighborRelevancy(): Promise<RelevancyScore[]> {
    const createdRelevancies: RelevancyScore[] = [];
    try {
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      console.log(`[RelevancyService] Calculating same island neighbor relevancy`);
      
      // Fetch all buildings. Ensure API returns LandId, Occupant, Category.
      const buildingsResponse = await fetch(`${baseUrl}/api/buildings`); 
      if (!buildingsResponse.ok) {
        console.error(`[RelevancyService] Failed to fetch buildings for same island neighbor relevancy: ${buildingsResponse.status}`);
        return [];
      }
      const buildingsData = await buildingsResponse.json();
      const allBuildings: BuildingData[] = buildingsData.buildings || [];
      console.log(`[RelevancyService] Fetched ${allBuildings.length} total buildings for same island neighbor relevancy.`);

      // Group occupants by LandId for home category buildings
      const occupantsByLandId: Record<string, string[]> = {};
      allBuildings.forEach(building => {
        if (building.category?.toLowerCase() === 'home' && building.occupant && building.landId) {
          if (!occupantsByLandId[building.landId]) {
            occupantsByLandId[building.landId] = [];
          }
          // Avoid duplicate occupants if one person somehow occupies multiple homes on the same landId
          if (!occupantsByLandId[building.landId].includes(building.occupant)) {
            occupantsByLandId[building.landId].push(building.occupant);
          }
        }
      });

      // Create relevancy for each LandId with multiple occupants
      for (const landId in occupantsByLandId) {
        const occupants = occupantsByLandId[landId];
        if (occupants.length > 1) { // Only create relevancy if there are actual neighbors
          const score = 50 + Math.min(occupants.length * 2, 30); // Score increases slightly with more neighbors, capped
          const status = this.determineStatus(score);
          const buildingType = "Island Community"; // Generic term
          
          // Fetch land details for better title/description if possible (optional enhancement)
          // For now, use LandId
          const landName = `Island/Land ${landId}`;

          const title = `Neighbors on ${landName}`;
          const description = `You share **${landName}** with other residents, fostering a local community.\n\n` +
                             `### Community Members:\n` +
                             `- ${occupants.join('\n- ')}\n\n` +
                             `Living in close proximity offers opportunities for interaction and shared local interests.`;
          
          createdRelevancies.push({
            score: parseFloat(score.toFixed(2)),
            assetId: landId, // The LandId is the asset
            assetType: 'land_group', // New asset type
            category: 'neighborhood',
            type: 'same_island_neighbor',
            distance: 0,
            closestLandId: landId,
            isConnected: true, // Assuming living on the same land implies connection
            connectivityBonus: 0, // Not distance-based
            title,
            description,
            timeHorizon: 'ongoing',
            status,
            relevantToCitizen: occupants, // Array of usernames living on this land
            targetCitizen: occupants,   // Array of usernames (the group itself)
          });
        }
      }
      
      console.log(`[RelevancyService] Generated ${createdRelevancies.length} 'same_island_neighbor' group relevancy objects.`);
      return createdRelevancies;
    } catch (error) {
      console.error(`[RelevancyService] Error calculating 'same_island_neighbor' relevancy:`, error);
      return [];
    }
  }
}

// Export a singleton instance
export const relevancyService = new RelevancyService();
