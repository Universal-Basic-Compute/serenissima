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
}

export class RelevancyService {
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
    
    // Generate title and description
    const title = this.generateRelevancyTitle(land, minDistance, isConnected);
    const description = this.generateRelevancyDescription(land, minDistance, isConnected);
    
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
      status
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
   * Generate a title for the relevancy
   */
  private generateRelevancyTitle(land: LandData, distance: number, isConnected: boolean): string {
    return isConnected 
      ? `Connected Land (${Math.round(distance)}m)` 
      : `Nearby Land (${Math.round(distance)}m)`;
  }
  
  /**
   * Generate a descriptive text for the relevancy
   */
  private generateRelevancyDescription(land: LandData, distance: number, isConnected: boolean): string {
    const landName = land.historicalName 
      ? `${land.historicalName}` 
      : 'This land';
    
    const distanceText = `${Math.round(distance)} meters from your nearest property`;
    
    if (isConnected) {
      return `${landName} is ${distanceText} and is connected to your existing properties by bridges. Acquiring this land would strengthen your presence in this district.`;
    } else {
      return `${landName} is ${distanceText}. Acquiring this land would expand your influence to a new area.`;
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
}

// Export a singleton instance
export const relevancyService = new RelevancyService();
