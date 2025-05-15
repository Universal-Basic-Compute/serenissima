import { CoordinateService } from './CoordinateService';
import { buildingService } from './BuildingService';
import { eventBus, EventTypes } from '../utils/eventBus';

export class CitizenService {
  private citizens: any[] = [];
  private citizensByBuilding: Record<string, any[]> = {};
  private isLoaded: boolean = false;
  private isLoading: boolean = false;

  /**
   * Load citizens data
   */
  public async loadCitizens(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;
    
    this.isLoading = true;
    
    try {
      console.log('Loading citizens data...');
      const response = await fetch('/api/citizens');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          // Process citizen positions
          this.citizens = data.map(citizen => {
            // Ensure position is properly formatted
            let position = citizen.position;
            
            // If position is a string, try to parse it
            if (typeof position === 'string') {
              try {
                position = JSON.parse(position);
              } catch (e) {
                console.warn(`Invalid position string for citizen ${citizen.id || citizen.CitizenId}:`, position);
                position = null;
              }
            }
            
            // Validate position object
            if (position && typeof position === 'object' && 
                'lat' in position && 'lng' in position &&
                typeof position.lat === 'number' && typeof position.lng === 'number') {
              // Position is valid
            } else {
              console.warn(`Invalid position for citizen ${citizen.id || citizen.CitizenId}:`, position);
              
              // Try to use the position from the API response directly
              if (citizen.position && typeof citizen.position === 'object' &&
                  'lat' in citizen.position && 'lng' in citizen.position) {
                position = citizen.position;
              } else {
                position = null;
              }
            }
            
            return {
              ...citizen,
              position
            };
          });
          
          console.log(`Loaded ${this.citizens.length} citizens, ${this.citizens.filter(c => c.position).length} with valid positions`);
          
          // Group citizens by building
          const byBuilding: Record<string, any[]> = {};
          
          this.citizens.forEach(citizen => {
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
          
          this.citizensByBuilding = byBuilding;
          this.isLoaded = true;
          
          console.log(`Citizens grouped by buildings: ${Object.keys(byBuilding).length} buildings have citizens`);
          
          // Emit event to notify other components
          eventBus.emit(EventTypes.CITIZENS_LOADED, {
            citizens: this.citizens,
            citizensByBuilding: this.citizensByBuilding
          });
        }
      }
    } catch (error) {
      console.error('Error loading citizens:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get citizens data
   */
  public getCitizens(): any[] {
    return this.citizens;
  }

  /**
   * Get citizens grouped by building
   */
  public getCitizensByBuilding(): Record<string, any[]> {
    return this.citizensByBuilding;
  }

  /**
   * Check if citizens are loaded
   */
  public isDataLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Get social class color for a citizen
   */
  public getSocialClassColor(socialClass: string, markerType: 'home' | 'work'): string {
    const baseClass = socialClass?.toLowerCase() || '';
    
    // Base colors for different social classes
    if (baseClass.includes('nobili')) {
      // Gold/yellow for nobility
      return markerType === 'home' 
        ? 'rgba(218, 165, 32, 0.8)'
        : 'rgba(218, 165, 32, 0.8)';
    } else if (baseClass.includes('cittadini')) {
      // Blue for citizens
      return markerType === 'home' 
        ? 'rgba(70, 130, 180, 0.8)'
        : 'rgba(70, 130, 180, 0.8)';
    } else if (baseClass.includes('popolani')) {
      // Brown/amber for common people
      return markerType === 'home' 
        ? 'rgba(205, 133, 63, 0.8)'
        : 'rgba(205, 133, 63, 0.8)';
    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
      // Gray for laborers
      return markerType === 'home' 
        ? 'rgba(128, 128, 128, 0.8)'
        : 'rgba(128, 128, 128, 0.8)';
    }
    
    // Default colors if social class is unknown or not matched
    return markerType === 'home' 
      ? 'rgba(100, 150, 255, 0.8)'
      : 'rgba(255, 150, 100, 0.8)';
  }
}

// Export a singleton instance
export const citizenService = new CitizenService();
