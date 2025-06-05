import { calculateDistance } from '../utils/hoverDetectionUtils';

export interface ActivityPath {
  id: string;
  citizenId: string;
  path: {lat: number, lng: number}[];
  type: string;
  startTime: string;
  endTime?: string;
  notes?: string | null; // Add notes field
  transportMode?: string; // Add transportMode field
  fromBuilding?: string | null;
  toBuilding?: string | null;
}

export class ActivityPathService {
  private activityPaths: Record<string, ActivityPath[]> = {};
  private isLoading: boolean = false;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch activity paths for citizens
   * @param forceRefresh - If true, bypasses the cache and re-fetches data.
   * @param ongoing - If true, fetches only ongoing activities.
   */
  public async fetchActivityPaths(forceRefresh: boolean = false, ongoing: boolean = false): Promise<Record<string, ActivityPath[]>> {
    // Return cached data if it's recent enough and not a forced refresh
    if (
      !forceRefresh &&
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
    if (forceRefresh) {
      console.log('ActivityPathService: Forcing refresh of activity paths...');
    } else {
      console.log('Fetching recent activity paths with routes (cache miss or expired)...');
    }
    
    try {
      // Fetch the most recent activities with paths
      let apiUrl = `/api/activities?limit=100&hasPath=true`;
      if (ongoing) {
        apiUrl += `&ongoing=true`;
        console.log('ActivityPathService: Fetching only ongoing activities.');
      }
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.activities && Array.isArray(data.activities)) {
          // Process activities with paths
          const pathsMap: Record<string, ActivityPath[]> = {};
          
          data.activities.forEach((activity: any) => {
            const citizenIdForLog = activity.citizen || activity.citizenId || 'unknown_citizen'; // Use camelCase
            // Use activity.path (camelCase)
            if (activity.path) { 
              let parsedPath; 
              try {
                // Parse path if it's a string
                parsedPath = typeof activity.path === 'string' ? JSON.parse(activity.path) : activity.path;
                
                // Log the raw Notes field from the activity
                //console.log(`[ActivityPathService] Processing activity ${activity.activityId || 'unknown_activity'} for citizen ${citizenIdForLog}. Raw Notes: ${activity.notes}`); // Use camelCase

                // Log the raw path field before parsing (using activity.path)
                //console.log(`[ActivityPathService] Activity ${activity.activityId || 'unknown'}: Raw path field (activity.path):`, activity.path); // Use camelCase

                // Log the parsed path for debugging
                /**console.log(`Parsed path for activity ${activity.activityId || 'unknown'}, citizen ${activity.citizen || activity.citizenId}:`, // Use camelCase
                  parsedPath && Array.isArray(parsedPath) && parsedPath.length > 0 ? `${parsedPath.length} points, first: ${JSON.stringify(parsedPath[0])}` : 'empty or invalid path object');
                */

                // Skip activities without valid paths
                if (!Array.isArray(parsedPath) || parsedPath.length < 2) {
                  console.warn(`Skipping invalid path for activity ${activity.ActivityId || 'unknown'}: not an array or too short. Path data:`, parsedPath);
                  return;
                }
              
                // Validate each point in the path
                const validPath = parsedPath.filter(point => 
                  point && typeof point === 'object' && 
                  'lat' in point && 'lng' in point &&
                  typeof point.lat === 'number' && typeof point.lng === 'number'
                );

                // Log validated path information
                console.log(`[ActivityPathService] Activity ${activity.activityId || 'unknown'}: Validated path has ${validPath.length} points.`); // Use camelCase
                if (validPath.length >= 2) {
                    console.log(`[ActivityPathService] Activity ${activity.activityId || 'unknown'}: First valid point: ${JSON.stringify(validPath[0])}, Last valid point: ${JSON.stringify(validPath[validPath.length - 1])}`); // Use camelCase
                }
              
                if (validPath.length < 2) {
                  console.warn(`Skipping path with insufficient valid points: ${validPath.length} valid out of ${parsedPath.length}. Original path length: ${parsedPath.length}.`);
                  return;
                }
              
                // Use citizen (Username) field first, then fall back to citizenId (camelCase)
                const citizenId = activity.citizen || activity.citizenId; // Use camelCase
              
                if (!citizenId) {
                  console.warn(`Activity ${activity.activityId || 'unknown'} has no citizen or citizenId field, skipping`); // Use camelCase
                  return;
                }
                
                if (!pathsMap[citizenId]) {
                  pathsMap[citizenId] = [];
                }
                
                const activityPath: ActivityPath = {
                  id: activity.activityId || `activity-${Math.random()}`, // Use camelCase
                  citizenId, // Already camelCase from above
                  path: validPath, 
                  type: activity.type || 'unknown', // Use camelCase
                  startTime: activity.startDate || activity.createdAt, // Use camelCase
                  endTime: activity.endDate, // Use camelCase
                  notes: (typeof activity.notes === 'string' && activity.notes.trim()) ? activity.notes.trim() : null, // Use camelCase
                  transportMode: activity.transportMode, // Use camelCase
                  fromBuilding: activity.fromBuilding || null, // Already camelCase
                  toBuilding: activity.toBuilding || null,   // Already camelCase
                };
                
                pathsMap[citizenId].push(activityPath);
              } catch (e) {
                console.warn(`Failed to parse activity path for ${activity.activityId || 'unknown'}:`, e); // Use camelCase
                return;
              }
            } else {
              console.log(`[ActivityPathService] Activity ${activity.ActivityId || 'unknown'} for citizen ${citizenIdForLog} has no Path field or it's falsy.`);
            }
          });
          
          console.log(`Loaded activity paths for ${Object.keys(pathsMap).length} citizens, total paths: ${Object.values(pathsMap).flat().length}`);
          this.activityPaths = pathsMap;
          this.lastFetchTime = Date.now();
          
          // Log the first few paths for debugging
          const allPaths = Object.values(pathsMap).flat();
          if (allPaths.length > 0) {
            console.log('[ActivityPathService] Sample paths processed:', allPaths.slice(0, 3).map(p => ({ id: p.id, citizenId: p.citizenId, pathLength: p.path.length, type: p.type, notes: p.notes })));
          } else {
            console.log('[ActivityPathService] No paths were processed and added to the map.');
          }
        } else {
          console.warn('[ActivityPathService] API response for activities was not successful or data.activities is not an array:', data);
        }
      } else {
        console.error(`[ActivityPathService] Failed to fetch activities. Status: ${response.status}`);
      }
      
      return this.activityPaths;
    } catch (error) {
      console.error('[ActivityPathService] Error fetching activity paths:', error);
      // Return current (possibly outdated or empty) paths to avoid breaking consumers
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
    // If social class is provided and not empty after trimming, use it for coloring
    if (socialClass && socialClass.trim()) {
      // Return color based on social class
      const baseClass = socialClass.trim().toLowerCase();
      
      if (baseClass.includes('nobili')) {
        return 'rgba(218, 165, 32, 0.8)'; // Gold for nobility
      } else if (baseClass.includes('cittadini')) {
        return 'rgba(70, 130, 180, 0.8)'; // Blue for citizens
      } else if (baseClass.includes('popolani')) {
        return 'rgba(205, 133, 63, 0.8)'; // Brown for common people
      } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
        return 'rgba(128, 128, 128, 0.8)'; // Gray for laborers
      } else if (baseClass.includes('forestieri')) {
        return 'rgba(128, 0, 32, 0.8)'; // Burgundy for Forestieri
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
