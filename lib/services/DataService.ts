/**
 * DataService
 * Handles data fetching and caching for the isometric view
 */

import { buildingPointsService } from './BuildingPointsService';
import { eventBus, EventTypes } from '../utils/eventBus';

export class DataService {
  // Cache for data
  private polygonsCache: any[] = [];
  private buildingsCache: any[] = [];
  private landOwnersCache: Record<string, string> = {};
  private citizensMapCache: Record<string, any> = {};
  private incomeDataCache: Record<string, number> = {};
  private citizensCache: any[] = [];
  private citizensByBuildingCache: Record<string, any[]> = {};
  
  // Cache status
  private polygonsLoaded: boolean = false;
  private buildingsLoaded: boolean = false;
  private landOwnersLoaded: boolean = false;
  private citizensListLoaded: boolean = false;
  private incomeDataLoaded: boolean = false;
  private citizensLoaded: boolean = false;
  
  // Loading status
  private isLoadingPolygons: boolean = false;
  private isLoadingBuildings: boolean = false;
  private isLoadingLandOwners: boolean = false;
  private isLoadingCitizensList: boolean = false;
  private isLoadingIncomeData: boolean = false;
  private isLoadingCitizens: boolean = false;

  /**
   * Load polygons data
   */
  public async loadPolygons(): Promise<any[]> {
    if (this.polygonsLoaded) {
      return this.polygonsCache;
    }
    
    if (this.isLoadingPolygons) {
      // Wait for the current loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoadingPolygons) {
            clearInterval(checkInterval);
            resolve(this.polygonsCache);
          }
        }, 100);
      });
    }
    
    this.isLoadingPolygons = true;
    
    try {
      const response = await fetch('/api/get-polygons');
      const data = await response.json();
      
      if (data.polygons) {
        this.polygonsCache = data.polygons;
        this.polygonsLoaded = true;
        
        // Store in window for other components
        if (typeof window !== 'undefined') {
          (window as any).__polygonData = data.polygons;
        }
        
        // Emit event to notify other components
        eventBus.emit(EventTypes.POLYGONS_LOADED, this.polygonsCache);
      }
      
      return this.polygonsCache;
    } catch (error) {
      console.error('Error loading polygons:', error);
      return [];
    } finally {
      this.isLoadingPolygons = false;
    }
  }

  /**
   * Load buildings data
   */
  public async loadBuildings(): Promise<any[]> {
    if (this.isLoadingBuildings) {
      // Wait for the current loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoadingBuildings) {
            clearInterval(checkInterval);
            resolve(this.buildingsCache);
          }
        }, 100);
      });
    }
    
    this.isLoadingBuildings = true;
    
    try {
      // First, ensure building points are loaded
      if (!buildingPointsService.isPointsLoaded()) {
        await buildingPointsService.loadBuildingPoints();
      }
      
      const response = await fetch('/api/buildings');
      const data = await response.json();
      
      if (data.buildings) {
        // Process buildings to ensure they all have position data
        this.buildingsCache = data.buildings.map((building: any) => {
          // If building already has a position, use it
          if (building.position && 
              ((typeof building.position === 'object' && 'lat' in building.position && 'lng' in building.position) || 
               (typeof building.position === 'string' && building.position.includes('lat')))) {
            return building;
          }
          
          // If building has a point_id, try to get position from the service
          if (building.point_id) {
            const position = buildingPointsService.getPositionForPoint(building.point_id);
            if (position) {
              return {
                ...building,
                position
              };
            }
          }
          
          // If building has a Point field (new format), try to extract coordinates
          if (building.Point) {
            // Try to extract coordinates from the Point field (format: type_lat_lng)
            const parts = String(building.Point).split('_');
            if (parts.length >= 3) {
              const lat = parseFloat(parts[1]);
              const lng = parseFloat(parts[2]);
              
              if (!isNaN(lat) && !isNaN(lng)) {
                return {
                  ...building,
                  position: { lat, lng }
                };
              }
            }
            
            // If we couldn't extract coordinates directly, try using the service
            const position = buildingPointsService.getPositionForPoint(String(building.Point));
            if (position) {
              return {
                ...building,
                position
              };
            }
          }
          
          // If we couldn't resolve a position, return the building as is
          return building;
        });
        
        this.buildingsLoaded = true;
        
        // Emit event to notify other components
        eventBus.emit(EventTypes.DATA_LOADED, {
          type: 'buildings',
          count: this.buildingsCache.length
        });
        
        // Dispatch event to ensure buildings are visible
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
        }
      }
      
      return this.buildingsCache;
    } catch (error) {
      console.error('Error fetching buildings:', error);
      
      // Emit error event
      eventBus.emit(EventTypes.DATA_LOADING_ERROR, {
        type: 'buildings',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return this.buildingsCache;
    } finally {
      this.isLoadingBuildings = false;
    }
  }

  /**
   * Load land owners data
   */
  public async loadLandOwners(): Promise<Record<string, string>> {
    if (this.landOwnersLoaded) {
      return this.landOwnersCache;
    }
    
    if (this.isLoadingLandOwners) {
      // Wait for the current loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoadingLandOwners) {
            clearInterval(checkInterval);
            resolve(this.landOwnersCache);
          }
        }, 100);
      });
    }
    
    this.isLoadingLandOwners = true;
    
    try {
      const response = await fetch('/api/get-land-owners');
      const data = await response.json();
      
      if (data.lands && Array.isArray(data.lands)) {
        const ownersMap: Record<string, string> = {};
        data.lands.forEach((land: any) => {
          if (land.id && land.owner) {
            ownersMap[land.id] = land.owner;
          }
        });
        
        this.landOwnersCache = ownersMap;
        this.landOwnersLoaded = true;
      }
      
      return this.landOwnersCache;
    } catch (error) {
      console.error('Error fetching land owners:', error);
      return {};
    } finally {
      this.isLoadingLandOwners = false;
    }
  }

  /**
   * Load citizens data
   */
  public async loadCitizens(): Promise<Record<string, any>> {
    if (this.citizensLoaded) {
      return this.citizensMapCache;
    }
    
    if (this.isLoadingCitizens) {
      // Wait for the current loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoadingCitizens) {
            clearInterval(checkInterval);
            resolve(this.citizensMapCache);
          }
        }, 100);
      });
    }
    
    this.isLoadingCitizens = true;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/citizens`);
      
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data)) {
          const citizensMap: Record<string, any> = {};
          data.forEach(citizen => {
            if (citizen.citizen_name) {
              citizensMap[citizen.citizen_name] = citizen;
            }
          });
          
          // Ensure ConsiglioDeiDieci is always present
          if (!citizensMap['ConsiglioDeiDieci']) {
            citizensMap['ConsiglioDeiDieci'] = {
              citizen_name: 'ConsiglioDeiDieci',
              color: '#8B0000', // Dark red
              coat_of_arms_image: null
            }
          }
          
          this.citizensMapCache = citizensMap;
          this.citizensLoaded = true;
        }
      }
      
      return this.citizensMapCache;
    } catch (error) {
      console.warn('Error loading citizens data:', error);
      
      // Create a default ConsiglioDeiDieci citizen as fallback
      const fallbackCitizens = {
        'ConsiglioDeiDieci': {
          citizen_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        }
      };
      
      this.citizensMapCache = fallbackCitizens;
      this.citizensLoaded = true;
      
      return this.citizensMapCache;
    } finally {
      this.isLoadingCitizens = false;
    }
  }

  /**
   * Load income data
   */
  public async loadIncomeData(): Promise<{
    incomeData: Record<string, number>,
    minIncome: number,
    maxIncome: number
  }> {
    if (this.incomeDataLoaded) {
      return {
        incomeData: this.incomeDataCache,
        minIncome: Math.min(...Object.values(this.incomeDataCache)),
        maxIncome: Math.max(...Object.values(this.incomeDataCache))
      };
    }
    
    if (this.isLoadingIncomeData) {
      // Wait for the current loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoadingIncomeData) {
            clearInterval(checkInterval);
            resolve({
              incomeData: this.incomeDataCache,
              minIncome: Math.min(...Object.values(this.incomeDataCache)),
              maxIncome: Math.max(...Object.values(this.incomeDataCache))
            });
          }
        }, 100);
      });
    }
    
    this.isLoadingIncomeData = true;
    
    try {
      const response = await fetch('/api/get-income-data');
      if (response.ok) {
        const data = await response.json();
        if (data.incomeData && Array.isArray(data.incomeData)) {
          // Create a map of polygon ID to income
          const incomeMap: Record<string, number> = {};
          let min = Infinity;
          let max = -Infinity;
          
          data.incomeData.forEach((item: any) => {
            if (item.polygonId && typeof item.income === 'number') {
              incomeMap[item.polygonId] = item.income;
              min = Math.min(min, item.income);
              max = Math.max(max, item.income);
            }
          });
          
          // Set min/max income values (with reasonable defaults if needed)
          const minIncome = min !== Infinity ? min : 0;
          const maxIncome = max !== -Infinity ? max : 1000;
          
          this.incomeDataCache = incomeMap;
          this.incomeDataLoaded = true;
          
          return {
            incomeData: incomeMap,
            minIncome,
            maxIncome
          };
        }
      }
      
      return {
        incomeData: {},
        minIncome: 0,
        maxIncome: 1000
      };
    } catch (error) {
      console.error('Error fetching income data:', error);
      return {
        incomeData: {},
        minIncome: 0,
        maxIncome: 1000
      };
    } finally {
      this.isLoadingIncomeData = false;
    }
  }

  /**
   * Load citizens list data
   */
  public async loadCitizensList(): Promise<{
    citizens: any[],
    citizensByBuilding: Record<string, any[]>
  }> {
    if (this.citizensLoaded) {
      return {
        citizens: this.citizensCache,
        citizensByBuilding: this.citizensByBuildingCache
      };
    }
    
    if (this.isLoadingCitizens) {
      // Wait for the current loading to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.isLoadingCitizens) {
            clearInterval(checkInterval);
            resolve({
              citizens: this.citizensCache,
              citizensByBuilding: this.citizensByBuildingCache
            });
          }
        }, 100);
      });
    }
    
    this.isLoadingCitizens = true;
    
    try {
      const response = await fetch('/api/citizens');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          this.citizensCache = data;
          
          // Group citizens by building
          const byBuilding: Record<string, any[]> = {};
          
          data.forEach(citizen => {
            // Add to home building
            if (citizen.Home) {
              if (!byBuilding[citizen.Home]) {
                byBuilding[citizen.Home] = [];
              }
              byBuilding[citizen.Home].push({
                ...citizen,
                markerType: 'home'
              });
            }
            
            // Add to work building
            if (citizen.Work) {
              if (!byBuilding[citizen.Work]) {
                byBuilding[citizen.Work] = [];
              }
              byBuilding[citizen.Work].push({
                ...citizen,
                markerType: 'work'
              });
            }
          });
          
          this.citizensByBuildingCache = byBuilding;
          this.citizensLoaded = true;
          
          return {
            citizens: this.citizensCache,
            citizensByBuilding: this.citizensByBuildingCache
          };
        }
      }
      
      return {
        citizens: [],
        citizensByBuilding: {}
      };
    } catch (error) {
      console.error('Error loading citizens:', error);
      return {
        citizens: [],
        citizensByBuilding: {}
      };
    } finally {
      this.isLoadingCitizens = false;
    }
  }

  /**
   * Get empty building points
   */
  public getEmptyBuildingPoints(polygons: any[], buildings: any[]): {lat: number, lng: number}[] {
    if (!polygons.length || !buildings.length) return [];
    
    // Collect all building points from all polygons
    const allBuildingPoints: {lat: number, lng: number}[] = [];
    
    polygons.forEach(polygon => {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        polygon.buildingPoints.forEach((point: any) => {
          if (point && typeof point === 'object' && 'lat' in point && 'lng' in point) {
            allBuildingPoints.push({
              lat: point.lat,
              lng: point.lng
            });
          }
        });
      }
    });
    
    // Check which building points don't have buildings on them
    return allBuildingPoints.filter(point => {
      // Check if there's no building at this point
      return !buildings.some(building => {
        if (!building.position) return false;
        
        let position;
        if (typeof building.position === 'string') {
          try {
            position = JSON.parse(building.position);
          } catch (e) {
            return false;
          }
        } else {
          position = building.position;
        }
        
        // Check if position matches the building point
        // Use a small threshold for floating point comparison
        const threshold = 0.0001;
        if ('lat' in position && 'lng' in position) {
          return Math.abs(position.lat - point.lat) < threshold && 
                 Math.abs(position.lng - point.lng) < threshold;
        }
        return false;
      });
    });
  }
  
  /**
   * Get buildings
   */
  public getBuildings(): any[] {
    return this.buildingsCache;
  }
  
  /**
   * Get polygons
   */
  public getPolygons(): any[] {
    return this.polygonsCache;
  }
  
  /**
   * Get land owners
   */
  public getLandOwners(): Record<string, string> {
    return this.landOwnersCache;
  }
  
  /**
   * Get citizens map
   */
  public getCitizensMap(): Record<string, any> {
    return this.citizensMapCache;
  }
  
  /**
   * Get citizens list
   */
  public getCitizensList(): any[] {
    return this.citizensCache;
  }
  
  /**
   * Get citizens by building
   */
  public getCitizensByBuilding(): Record<string, any[]> {
    return this.citizensByBuildingCache;
  }

  /**
   * Find polygon ID for a point
   */
  public findPolygonIdForPoint(point: {lat: number, lng: number}, polygons: any[]): string {
    for (const polygon of polygons) {
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        // Check if this point is in the polygon's buildingPoints
        const found = polygon.buildingPoints.some((bp: any) => {
          const threshold = 0.0001; // Small threshold for floating point comparison
          return Math.abs(bp.lat - point.lat) < threshold && 
                 Math.abs(bp.lng - point.lng) < threshold;
        });
        
        if (found) {
          return polygon.id;
        }
      }
    }
    
    // If we can't find the exact polygon, try to find which polygon contains this point
    for (const polygon of polygons) {
      if (polygon.coordinates && polygon.coordinates.length > 2) {
        if (this.isPointInPolygonCoordinates(point, polygon.coordinates)) {
          return polygon.id;
        }
      }
    }
    
    return 'unknown';
  }

  /**
   * Check if a point is inside polygon coordinates
   */
  private isPointInPolygonCoordinates(point: {lat: number, lng: number}, coordinates: {lat: number, lng: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const xi = coordinates[i].lng, yi = coordinates[i].lat;
      const xj = coordinates[j].lng, yj = coordinates[j].lat;
      
      const intersect = ((yi > point.lat) !== (yj > point.lat))
          && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Reset cache for a specific data type
   */
  public resetCache(dataType: 'polygons' | 'buildings' | 'landOwners' | 'citizens' | 'incomeData' | 'citizens' | 'all'): void {
    if (dataType === 'polygons' || dataType === 'all') {
      this.polygonsCache = [];
      this.polygonsLoaded = false;
    }
    
    if (dataType === 'buildings' || dataType === 'all') {
      this.buildingsCache = [];
      this.buildingsLoaded = false;
    }
    
    if (dataType === 'landOwners' || dataType === 'all') {
      this.landOwnersCache = {};
      this.landOwnersLoaded = false;
    }
    
    if (dataType === 'citizens' || dataType === 'all') {
      this.citizensCache = [];
      this.citizensLoaded = false;
    }
    
    if (dataType === 'incomeData' || dataType === 'all') {
      this.incomeDataCache = {};
      this.incomeDataLoaded = false;
    }
    
    if (dataType === 'citizens' || dataType === 'all') {
      this.citizensCache = [];
      this.citizensByBuildingCache = {};
      this.citizensLoaded = false;
    }
  }
}

// Export a singleton instance
export const dataService = new DataService();
