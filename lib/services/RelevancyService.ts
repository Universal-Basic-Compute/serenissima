import { CoordinateService } from './CoordinateService';

export class RelevancyService {
  /**
   * Calculate proximity-based relevancy scores for lands relative to an AI owner
   * @param aiLands Lands owned by the AI
   * @param allLands All lands in the system
   * @returns Map of land IDs to relevancy scores
   */
  public calculateLandProximityRelevancy(
    aiLands: any[],
    allLands: any[]
  ): Record<string, number> {
    const relevancyScores: Record<string, number> = {};
    
    // Skip calculation if AI has no lands or there are no other lands
    if (!aiLands.length || !allLands.length) {
      return relevancyScores;
    }
    
    // Calculate the centroid of all AI-owned lands
    const aiCentroids = aiLands.map(land => this.getLandCentroid(land));
    
    // For each land not owned by the AI, calculate its relevancy score
    allLands.forEach(land => {
      // Skip lands already owned by the AI
      if (aiLands.some(aiLand => aiLand.id === land.id)) {
        return;
      }
      
      const landCentroid = this.getLandCentroid(land);
      if (!landCentroid) return;
      
      // Calculate minimum distance to any AI-owned land
      let minDistance = Infinity;
      for (const aiCentroid of aiCentroids) {
        if (!aiCentroid) continue;
        
        const distance = this.calculateDistance(
          landCentroid.lat, landCentroid.lng,
          aiCentroid.lat, aiCentroid.lng
        );
        
        minDistance = Math.min(minDistance, distance);
      }
      
      // Convert distance to relevancy score (closer = higher score)
      // Using an exponential decay function: score = 100 * e^(-distance/500)
      // This gives a score of 100 at distance 0, ~60 at 250m, ~37 at 500m, etc.
      const relevancyScore = 100 * Math.exp(-minDistance / 500);
      
      // Store the score
      relevancyScores[land.id] = parseFloat(relevancyScore.toFixed(2));
    });
    
    return relevancyScores;
  }
  
  /**
   * Get the centroid of a land polygon
   */
  private getLandCentroid(land: any): { lat: number, lng: number } | null {
    // First try to use the land's center property if available
    if (land.center && typeof land.center.lat === 'number' && typeof land.center.lng === 'number') {
      return {
        lat: land.center.lat,
        lng: land.center.lng
      };
    }
    
    // Otherwise calculate from coordinates
    if (land.coordinates && Array.isArray(land.coordinates) && land.coordinates.length > 0) {
      const sumLat = land.coordinates.reduce((sum: number, coord: any) => sum + coord.lat, 0);
      const sumLng = land.coordinates.reduce((sum: number, coord: any) => sum + coord.lng, 0);
      
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
}

// Export a singleton instance
export const relevancyService = new RelevancyService();
