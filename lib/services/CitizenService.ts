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
          // Log the raw data from the API
          console.log('Raw citizens data from API:', data);
          
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
              //console.log(`Valid position for citizen ${citizen.id || citizen.CitizenId}:`, position);
            } else {
              console.warn(`Invalid position for citizen ${citizen.id || citizen.CitizenId}:`, position);
              
              // Try to use the position from the API response directly
              if (citizen.position && typeof citizen.position === 'object' &&
                  'lat' in citizen.position && 'lng' in citizen.position) {
                position = citizen.position;
                console.log(`Using direct position object for ${citizen.id || citizen.CitizenId}:`, position);
              } else {
                // Create a random position in Venice
                position = {
                  lat: 45.4371 + (Math.random() * 0.01),
                  lng: 12.3326 + (Math.random() * 0.01)
                };
                console.log(`Created fallback position for ${citizen.id || citizen.CitizenId}:`, position);
                
                // Log detailed debug information
                console.error(`Citizen without valid position:`, {
                  id: citizen.id || citizen.CitizenId,
                  name: `${citizen.FirstName || citizen.firstName || ''} ${citizen.LastName || citizen.lastName || ''}`,
                  rawPosition: citizen.position,
                  citizenData: citizen
                });
              }
            }
            
            // Ensure all required fields are present
            return {
              ...citizen,
              position,
              citizenid: citizen.citizenid || citizen.CitizenId || citizen.id || `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              firstname: citizen.firstname || citizen.FirstName || citizen.firstName || 'Unknown',
              lastname: citizen.lastname || citizen.LastName || citizen.lastName || 'Citizen',
              socialclass: citizen.socialclass || citizen.SocialClass || citizen.socialClass || 'Popolani'
            };
          });
          
          // Log statistics about positions
          const citizensWithPositions = this.citizens.filter(c => c.position);
          console.log(`Loaded ${this.citizens.length} citizens, ${citizensWithPositions.length} with valid positions, ${this.citizens.length - citizensWithPositions.length} without positions`);
          
          // Clear the building associations completely
          this.citizensByBuilding = {};
          this.isLoaded = true;
          
          // Emit event to notify other components
          eventBus.emit(EventTypes.CITIZENS_LOADED, {
            citizens: this.citizens,
            citizensByBuilding: {} // Empty object for building associations
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
  public getSocialClassColor(socialClass: string): string {
    const baseClass = socialClass?.toLowerCase() || '';
    
    // Base colors for different social classes
    if (baseClass.includes('nobili')) {
      // Gold/yellow for nobility
      return 'rgba(218, 165, 32, 0.8)';
    } else if (baseClass.includes('cittadini')) {
      // Blue for citizens
      return 'rgba(70, 130, 180, 0.8)';
    } else if (baseClass.includes('popolani')) {
      // Brown/amber for common people
      return 'rgba(205, 133, 63, 0.8)';
    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
      // Gray for laborers
      return 'rgba(128, 128, 128, 0.8)';
    }
    
    // Default color if social class is unknown or not matched
    return 'rgba(100, 150, 255, 0.8)';
  }
}

// Export a singleton instance
export const citizenService = new CitizenService();
