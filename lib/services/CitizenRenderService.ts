export class CitizenRenderService {
  /**
   * Safely process a citizen object to ensure it only contains primitive values
   * that can be rendered by React
   */
  public static sanitizeCitizen(citizen: any): any {
    if (!citizen) return null;
    
    // Create a safe version with only the properties we need
    const safeCitizen: any = { // Initialize as any to allow adding properties
      id: this.getStringValue(citizen, ['CitizenId', 'citizenId', 'citizenid', 'id']),
      firstName: this.getStringValue(citizen, ['FirstName', 'firstName', 'firstname']),
      lastName: this.getStringValue(citizen, ['LastName', 'lastName', 'lastname']),
      socialClass: this.getStringValue(citizen, ['SocialClass', 'socialClass', 'socialclass']),
      imageUrl: this.getStringValue(citizen, ['ImageUrl', 'imageUrl', 'imageurl', 'profileimage']),
      description: this.getStringValue(citizen, ['Description', 'description']),
      username: this.getStringValue(citizen, ['Username', 'username']),
      isAi: this.getBooleanValue(citizen, ['IsAI', 'isAI', 'isai']),
      ducats: this.getNumberValue(citizen, ['Ducats', 'ducats', 'wealth']),
      createdat: this.getStringValue(citizen, ['CreatedAt', 'createdat']),
      worksFor: this.getStringValue(citizen, ['WorksFor', 'worksFor']),
      color: this.getStringValue(citizen, ['Color', 'color']),
      secondaryColor: this.getStringValue(citizen, ['SecondaryColor', 'secondaryColor']),
      influence: this.getNumberValue(citizen, ['Influence', 'influence']),
      personality: this.getStringValue(citizen, ['Personality', 'personality', 'CorePersonality', 'corePersonality']),
      updatedAt: this.getStringValue(citizen, ['UpdatedAt', 'updatedAt']),
      lastActiveAt: this.getStringValue(citizen, ['LastActiveAt', 'lastActiveAt']),
      familyMotto: this.getStringValue(citizen, ['FamilyMotto', 'familyMotto']),
      coatOfArmsImageUrl: this.getStringValue(citizen, ['CoatOfArmsImageUrl', 'coatOfArmsImageUrl']),
      dailyIncome: this.getNumberValue(citizen, ['DailyIncome', 'dailyIncome']),
      home: this.getStringValue(citizen, ['Home', 'home']),
      work: this.getStringValue(citizen, ['Work', 'work']),
      corePersonality: this.getArrayValue(citizen, ['CorePersonality', 'corePersonality']),
    };
    
    // Handle special objects that need to be processed differently
    if (citizen.position) {
      try {
        let position;
        if (typeof citizen.position === 'string') {
          position = JSON.parse(citizen.position);
        } else {
          position = citizen.position;
        }
        
        if (position && typeof position === 'object') {
          safeCitizen.position = {
            lat: parseFloat(position.lat || position.Lat || 0),
            lng: parseFloat(position.lng || position.Lng || 0)
          };
        } else {
          safeCitizen.position = null;
        }
      } catch (e) {
        safeCitizen.position = null;
      }
    } else {
      safeCitizen.position = null;
    }
    
    // Handle workplace object
    if (citizen.workplace && typeof citizen.workplace === 'object') {
      try {
        safeCitizen.workplace = {
          name: this.getStringValue(citizen.workplace, ['name', 'Name']),
          type: this.getStringValue(citizen.workplace, ['type', 'Type'])
        };
      } catch (e) {
        safeCitizen.workplace = null;
      }
    } else {
      safeCitizen.workplace = null;
    }
    
    return safeCitizen;
  }
  
  /**
   * Helper method to get a string value from multiple possible property names
   */
  private static getStringValue(obj: any, propertyNames: string[]): string {
    if (!obj) return '';
    
    for (const prop of propertyNames) {
      if (obj[prop] !== undefined && obj[prop] !== null) {
        return String(obj[prop]);
      }
    }
    
    return '';
  }
  
  /**
   * Helper method to get a number value from multiple possible property names
   */
  private static getNumberValue(obj: any, propertyNames: string[]): number {
    if (!obj) return 0;
    
    for (const prop of propertyNames) {
      if (obj[prop] !== undefined && obj[prop] !== null) {
        const num = parseFloat(obj[prop]);
        return isNaN(num) ? 0 : num;
      }
    }
    
    return 0;
  }
  
  /**
   * Helper method to get a boolean value from multiple possible property names
   */
  private static getBooleanValue(obj: any, propertyNames: string[]): boolean {
    if (!obj) return false;
    
    for (const prop of propertyNames) {
      if (obj[prop] !== undefined && obj[prop] !== null) {
        return Boolean(obj[prop]);
      }
    }
    
    return false;
  }

  /**
   * Helper method to get an array value from multiple possible property names,
   * parsing from string if necessary.
   */
  private static getArrayValue(obj: any, propertyNames: string[]): string[] | null {
    if (!obj) return null;
    for (const prop of propertyNames) {
      const value = obj[prop];
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) { // Already an array
          return value.every(item => typeof item === 'string') ? value : null;
        }
        if (typeof value === 'string') { // String representation of an array
          try {
            const parsed = JSON.parse(value);
            // Expecting an array of 3 strings for CorePersonality
            if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(item => typeof item === 'string')) {
              return parsed;
            }
            // console.warn(`Parsed value for ${prop} is not a valid string array:`, parsed);
            return null;
          } catch (e) {
            // console.warn(`Failed to parse array string for ${prop}:`, value, e);
            return null;
          }
        }
        return null; // Not an array or a parsable string
      }
    }
    return null;
  }
  
  /**
   * Create a citizen marker on a canvas
   */
  public static createCitizenMarker(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    citizen: any,
    size: number = 20
  ): void {
    // Sanitize the citizen data first
    const safeCitizen = this.sanitizeCitizen(citizen);
    
    // Determine color based on social class
    const fillColor = this.getSocialClassColor(safeCitizen.socialClass);

    // Draw a circular background with color based on social class
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    
    // Add a white border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add the citizen's initials
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get the first letters of the first and last name
    const firstInitial = safeCitizen.firstName.charAt(0).toUpperCase() || '?';
    const lastInitial = safeCitizen.lastName.charAt(0).toUpperCase() || '?';
    ctx.fillText(firstInitial + lastInitial, x, y);
  }
  
  /**
   * Get color based on social class
   */
  private static getSocialClassColor(socialClass: string): string {
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
export const citizenRenderService = new CitizenRenderService();
