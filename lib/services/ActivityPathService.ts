import { calculateDistance } from '../utils/hoverDetectionUtils';

export interface ActivityPath {
  id: string;
  citizenId: string;
  path: {lat: number, lng: number}[];
  type: string;
  startTime: string;
  endTime?: string;
}

export class ActivityPathService {
  private activityPaths: Record<string, ActivityPath[]> = {};
  private isLoading: boolean = false;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch activity paths for citizens
   */
  public async fetchActivityPaths(): Promise<Record<string, ActivityPath[]>> {
    // Return cached data if it's recent enough
    if (
      Object.keys(this.activityPaths).length > 0 && 
      Date.now() - this.lastFetchTime < this.CACHE_DURATION
    ) {
      return this.activityPaths;
    }

    if (this.isLoading) {
      // Wait for the current fetch to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(checkInterval);
            resolve(this.activityPaths);
          }
        }, 100);
      });
    }

    this.isLoading = true;
    console.log('Fetching recent activity paths with routes...');
    
    try {
      // Fetch the most recent activities with paths
      const response = await fetch(`/api/activities?limit=100&hasPath=true`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.activities && Array.isArray(data.activities)) {
          // Process activities with paths
          const pathsMap: Record<string, ActivityPath[]> = {};
          
          data.activities.forEach((activity: any) => {
            if (activity.Path) {
              let path;
              try {
                // Parse path if it's a string
                path = typeof activity.Path === 'string' ? JSON.parse(activity.Path) : activity.Path;
                
                // Log the parsed path for debugging
                console.log(`Parsed path for activity ${activity.ActivityId || 'unknown'}, citizen ${activity.Citizen || activity.CitizenId}:`, 
                  path.length > 0 ? `${path.length} points, first: ${JSON.stringify(path[0])}` : 'empty path');
              
                // Skip activities without valid paths
                if (!Array.isArray(path) || path.length < 2) {
                  console.warn(`Skipping invalid path for activity ${activity.ActivityId || 'unknown'}: not an array or too short`);
                  return;
                }
              
                // Validate each point in the path
                const validPath = path.filter(point => 
                  point && typeof point === 'object' && 
                  'lat' in point && 'lng' in point &&
                  typeof point.lat === 'number' && typeof point.lng === 'number'
                );
              
                if (validPath.length < 2) {
                  console.warn(`Skipping path with insufficient valid points: ${validPath.length} valid out of ${path.length}`);
                  return;
                }
              
                // Use Citizen (Username) field first, then fall back to CitizenId
                const citizenId = activity.Citizen || activity.CitizenId;
              
                if (!citizenId) {
                  console.warn(`Activity ${activity.ActivityId || 'unknown'} has no Citizen or CitizenId field, skipping`);
                  return;
                }
                
                if (!pathsMap[citizenId]) {
                  pathsMap[citizenId] = [];
                }
                
                const activityPath: ActivityPath = {
                  id: activity.ActivityId || `activity-${Math.random()}`,
                  citizenId,
                  path: validPath, // Use the validated path
                  type: activity.Type || 'unknown',
                  startTime: activity.StartDate || activity.CreatedAt,
                  endTime: activity.EndDate
                };
                
                pathsMap[citizenId].push(activityPath);
              } catch (e) {
                console.warn(`Failed to parse activity path for ${activity.ActivityId || 'unknown'}:`, e);
                return;
              }
            }
          });
          
          console.log(`Loaded activity paths for ${Object.keys(pathsMap).length} citizens, total paths: ${Object.values(pathsMap).flat().length}`);
          this.activityPaths = pathsMap;
          this.lastFetchTime = Date.now();
          
          // Log the first few paths for debugging
          const allPaths = Object.values(pathsMap).flat();
          if (allPaths.length > 0) {
            console.log('Sample paths:', allPaths.slice(0, 3));
          }
        }
      }
      
      return this.activityPaths;
    } catch (error) {
      console.error('Error fetching activity paths:', error);
      return this.activityPaths;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get activity paths for a specific citizen
   */
  public getPathsForCitizen(citizenId: string): ActivityPath[] {
    return this.activityPaths[citizenId] || [];
  }

  /**
   * Get all activity paths
   */
  public getAllPaths(): ActivityPath[] {
    return Object.values(this.activityPaths).flat();
  }

  /**
   * Get activity paths map
   */
  public getPathsMap(): Record<string, ActivityPath[]> {
    return this.activityPaths;
  }

  /**
   * Calculate position along a path based on progress (0-1)
   */
  public calculatePositionAlongPath(path: {lat: number, lng: number}[], progress: number): {lat: number, lng: number} | null {
    if (!path || path.length < 2) return null;
    
    // Calculate total path length
    let totalDistance = 0;
    const segments: {start: number, end: number, distance: number}[] = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const distance = calculateDistance(path[i], path[i+1]);
      segments.push({
        start: totalDistance,
        end: totalDistance + distance,
        distance
      });
      totalDistance += distance;
    }
    
    // Find the segment where the progress falls
    const targetDistance = progress * totalDistance;
    const segment = segments.find(seg => targetDistance >= seg.start && targetDistance <= seg.end);
    
    if (!segment) return path[0]; // Default to start if no segment found
    
    // Calculate position within the segment
    const segmentProgress = (targetDistance - segment.start) / segment.distance;
    const segmentIndex = segments.indexOf(segment);
    
    const p1 = path[segmentIndex];
    const p2 = path[segmentIndex + 1];
    
    // Interpolate between the two points
    return {
      lat: p1.lat + (p2.lat - p1.lat) * segmentProgress,
      lng: p1.lng + (p2.lng - p1.lng) * segmentProgress
    };
  }

  /**
   * Calculate the total distance of a path
   */
  public calculateTotalDistance(path: {lat: number, lng: number}[]): number {
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      totalDistance += calculateDistance(path[i], path[i + 1]);
    }
    return totalDistance;
  }

  /**
   * Get activity path color based on type
   */
  public getActivityPathColor(activity: ActivityPath, socialClass?: string): string {
    // If social class is provided, use it for coloring
    if (socialClass) {
      // Return color based on social class
      const baseClass = socialClass.toLowerCase();
      
      if (baseClass.includes('nobili')) {
        return 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
      } else if (baseClass.includes('cittadini')) {
        return 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
      } else if (baseClass.includes('popolani')) {
        return 'rgba(205, 133, 63, 0.8)'; // Brown for common people
      } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
        return 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
      }
    }
  
    // Fallback to activity type-based colors
    const lowerType = activity.type.toLowerCase();
  
    if (lowerType.includes('transport') || lowerType.includes('move')) {
      return '#4b70e2'; // Blue
    } else if (lowerType.includes('trade') || lowerType.includes('buy') || lowerType.includes('sell')) {
      return '#e27a4b'; // Orange
    } else if (lowerType.includes('work') || lowerType.includes('labor')) {
      return '#4be27a'; // Green
    } else if (lowerType.includes('craft') || lowerType.includes('create') || lowerType.includes('produce')) {
      return '#e24b7a'; // Pink
    }
  
    return '#aaaaaa'; // Default gray
  }
}

// Export a singleton instance
export const activityPathService = new ActivityPathService();
