import { CoordinateService } from './CoordinateService';

export class BridgeService {
  /**
   * Calculate bridge orientation based on polygon center
   * @param bridgePosition The position of the bridge
   * @param polygonCenter The center of the polygon
   * @returns Orientation in radians
   */
  public calculateBridgeOrientation(
    bridgePosition: { lat: number, lng: number },
    polygonCenter: { lat: number, lng: number }
  ): number {
    if (!bridgePosition || !polygonCenter) {
      console.warn('Missing position data for bridge orientation calculation');
      return 0; // Default orientation
    }

    try {
      // Calculate angle from bridge to polygon center
      const dx = polygonCenter.lng - bridgePosition.lng;
      const dy = polygonCenter.lat - bridgePosition.lat;
      
      // Calculate the angle in radians
      let angle = Math.atan2(dy, dx);
      
      // Add 90 degrees (π/2 radians) to make the bridge perpendicular to the line
      angle += Math.PI / 2;
      
      console.log(`Calculated bridge orientation: ${angle} radians (${angle * 180 / Math.PI} degrees)`);
      return angle;
    } catch (error) {
      console.error('Error calculating bridge orientation:', error);
      return 0; // Default orientation on error
    }
  }

  /**
   * Calculate bridge orientation based on polygon segment
   * This is a more accurate method that finds the closest polygon edge
   * @param bridgePosition The position of the bridge
   * @param polygonCoordinates The coordinates of the polygon
   * @returns Orientation in radians
   */
  public calculateBridgeOrientationFromSegment(
    bridgePosition: { lat: number, lng: number },
    polygonCoordinates: { lat: number, lng: number }[]
  ): number {
    if (!bridgePosition || !polygonCoordinates || polygonCoordinates.length < 3) {
      console.warn('Missing or invalid data for bridge orientation calculation');
      return 0; // Default orientation
    }

    try {
      // Find the closest segment to the bridge point
      let closestSegmentStart = null;
      let closestSegmentEnd = null;
      let minDistance = Infinity;
      
      // Loop through polygon coordinates to find the closest segment
      for (let i = 0; i < polygonCoordinates.length; i++) {
        const start = polygonCoordinates[i];
        const end = polygonCoordinates[(i + 1) % polygonCoordinates.length];
        
        // Calculate distance from bridge point to this segment
        const distance = this.distanceToSegment(
          bridgePosition.lat, bridgePosition.lng,
          start.lat, start.lng,
          end.lat, end.lng
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestSegmentStart = start;
          closestSegmentEnd = end;
        }
      }
      
      // If we found the closest segment, calculate orientation perpendicular to it
      if (closestSegmentStart && closestSegmentEnd) {
        // Calculate segment direction
        const dx = closestSegmentEnd.lng - closestSegmentStart.lng;
        const dy = closestSegmentEnd.lat - closestSegmentStart.lat;
        
        // Calculate angle of the segment
        const segmentAngle = Math.atan2(dy, dx);
        
        // Perpendicular angle is segment angle + 90 degrees (π/2 radians)
        const orientation = segmentAngle + Math.PI/2;
        
        console.log(`Calculated bridge orientation from segment: ${orientation} radians (${orientation * 180 / Math.PI} degrees)`);
        return orientation;
      }
      
      // Fallback to default orientation if no segment found
      return 0;
    } catch (error) {
      console.error('Error calculating bridge orientation from segment:', error);
      return 0; // Default orientation on error
    }
  }

  /**
   * Calculate distance from a point to a line segment
   * @param pointLat Point latitude
   * @param pointLng Point longitude
   * @param startLat Segment start latitude
   * @param startLng Segment start longitude
   * @param endLat Segment end latitude
   * @param endLng Segment end longitude
   * @returns Distance in coordinate units
   */
  private distanceToSegment(
    pointLat: number, pointLng: number,
    startLat: number, startLng: number,
    endLat: number, endLng: number
  ): number {
    // Convert to Cartesian coordinates for simplicity
    // This is an approximation that works for small distances
    const scale = Math.cos(pointLat * Math.PI / 180);
    const x = pointLng * scale;
    const y = pointLat;
    const x1 = startLng * scale;
    const y1 = startLat;
    const x2 = endLng * scale;
    const y2 = endLat;
    
    // Calculate squared length of segment
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    
    // If segment is a point, return distance to the point
    if (l2 === 0) return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
    
    // Calculate projection of point onto line containing segment
    const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2));
    
    // Calculate closest point on segment
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    
    // Return distance to closest point
    return Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));
  }
}

// Export a singleton instance
export const bridgeService = new BridgeService();
