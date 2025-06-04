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
   * @param forceRefresh - If true, bypasses the isLoaded check and re-fetches data.
   */
  public async loadCitizens(forceRefresh: boolean = false): Promise<void> {
    if (!forceRefresh && (this.isLoaded || this.isLoading)) return;
    
    this.isLoading = true;
    if (forceRefresh) {
      console.log('CitizenService: Forcing refresh of citizens data...');
      this.isLoaded = false; // Reset loaded flag to allow re-fetch
    }
    
    try {
      console.log('Loading citizens data...');
      const response = await fetch('/api/citizens');
      if (response.ok) {
        const responseData = await response.json();
        
        // Check if the response has the expected structure
        if (responseData.success && Array.isArray(responseData.citizens)) {
          // Log the raw data from the API
          console.log('Raw citizens data from API:', responseData.citizens);
          
          // Process citizen positions
          this.citizens = responseData.citizens.map(citizen => {
            // Simple position parsing - assume it works
            let position = citizen.position;
            
            // If position is a string, parse it
            if (typeof position === 'string') {
              position = JSON.parse(position);
            }
            
            // Ensure all required fields are present
            return {
              ...citizen,
              position,
              citizenid: citizen.citizenid || citizen.CitizenId || citizen.id || citizen.username || `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              firstname: citizen.firstname || citizen.FirstName || citizen.firstName || 'Unknown',
              lastname: citizen.lastname || citizen.LastName || citizen.lastName || 'Unknown',
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

          // Log social class distribution
          const socialClassCounts: Record<string, number> = {};
          this.citizens.forEach(c => {
            const sc = c.socialclass || 'Unknown'; // Use the processed socialclass
            socialClassCounts[sc] = (socialClassCounts[sc] || 0) + 1;
          });
          console.log('CitizenService: Social class distribution:', socialClassCounts);

        } else {
          console.error('Invalid response format from citizens API:', responseData);
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
      // Reddish for nobility
      return 'rgba(178, 34, 34, 0.8)';
    } else if (baseClass.includes('cittadini')) {
      // Blue for citizens (unchanged)
      return 'rgba(70, 130, 180, 0.8)';
    } else if (baseClass.includes('popolani')) {
      // Yellowish for common people
      return 'rgba(255, 215, 0, 0.8)';
    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
      // Greyish for laborers
      return 'rgba(128, 128, 128, 0.8)';
    } else if (baseClass.includes('forestieri')) {
      // Greenish for Forestieri
      return 'rgba(60, 179, 113, 0.8)';
    }
    
    // Default color if social class is unknown or not matched
    return 'rgba(100, 150, 255, 0.8)';
  }
}

// Export a singleton instance
export const citizenService = new CitizenService();
