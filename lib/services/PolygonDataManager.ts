import { Polygon, ViewMode } from '../../components/PolygonViewer/types';
import { eventBus, EventTypes } from '../eventBus';

/**
 * Manages polygon data separately from rendering logic
 */
export class PolygonDataManager {
  private polygons: Polygon[] = [];
  private ownerColorMap: Record<string, string> = {};
  private ownerCoatOfArmsMap: Record<string, string> = {};
  private users: Record<string, any> = {};
  
  constructor(polygons: Polygon[] = [], users: Record<string, any> = {}) {
    this.polygons = polygons;
    this.users = users;
    
    // Process user data to extract colors and coat of arms
    this.processUserData(users);
    
    // Ensure ConsiglioDeiDieci always has a color
    if (!this.ownerColorMap['ConsiglioDeiDieci']) {
      this.ownerColorMap['ConsiglioDeiDieci'] = '#8B0000'; // Dark red
      console.log('Added missing ConsiglioDeiDieci color in PolygonDataManager');
    }
  }
  
  /**
   * Process user data to extract colors and coat of arms
   */
  private processUserData(users: Record<string, any>): void {
    Object.values(users).forEach(user => {
      if (user.user_name) {
        // Store coat of arms image if available
        if (user.coat_of_arms_image) {
          this.ownerCoatOfArmsMap[user.user_name] = user.coat_of_arms_image;
        }
        
        // Store color if available - ensure we check for null/undefined
        if (user.color) {
          this.ownerColorMap[user.user_name] = user.color;
          console.log(`Stored color for ${user.user_name}: ${user.color}`);
        } else if (user.user_name === 'ConsiglioDeiDieci') {
          // Provide a default color for ConsiglioDeiDieci if missing
          this.ownerColorMap[user.user_name] = '#8B0000'; // Dark red
          console.log(`Assigned default color for ConsiglioDeiDieci: #8B0000`);
        }
      }
    });
    
    console.log(`Processed ${Object.keys(this.ownerCoatOfArmsMap).length} coat of arms and ${Object.keys(this.ownerColorMap).length} colors from users data`);
  }
  
  /**
   * Get all polygons
   */
  public getPolygons(): Polygon[] {
    return this.polygons;
  }
  
  /**
   * Get a polygon by ID
   */
  public getPolygonById(id: string): Polygon | undefined {
    return this.polygons.find(p => p.id === id);
  }
  
  /**
   * Get the color for an owner
   */
  public getOwnerColor(owner: string): string | null {
    if (this.ownerColorMap[owner]) {
      return this.ownerColorMap[owner];
    } else if (this.users[owner] && this.users[owner].color) {
      const color = this.users[owner].color;
      // Cache for future use
      this.ownerColorMap[owner] = color;
      return color;
    } else if (owner === 'ConsiglioDeiDieci') {
      // Special case for ConsiglioDeiDieci
      return '#8B0000'; // Dark red
    }
    
    // Default color
    return '#7cac6a'; // Default green color
  }
  
  /**
   * Get coat of arms URL for an owner
   */
  public getOwnerCoatOfArmsUrl(owner: string): string | null {
    return this.ownerCoatOfArmsMap[owner] || null;
  }
  
  /**
   * Update colors for owners
   */
  public updateOwnerColors(colorMap: Record<string, string>): void {
    console.log('updateOwnerColors called with data:', colorMap);
    
    // Update the owner color map
    this.ownerColorMap = { ...this.ownerColorMap, ...colorMap };
    
    // Update the users data with color information
    Object.entries(colorMap).forEach(([owner, color]) => {
      if (this.users[owner]) {
        this.users[owner].color = color;
      } else {
        // Create user entry if it doesn't exist
        this.users[owner] = { 
          user_name: owner,
          color: color
        };
      }
    });
    
    console.log('Owner color map now has', Object.keys(this.ownerColorMap).length, 'entries');
    
    // Notify listeners about the change
    eventBus.emit(EventTypes.OWNER_COLORS_UPDATED, colorMap);
  }
  
  /**
   * Update coat of arms for owners
   */
  public updateOwnerCoatOfArms(ownerCoatOfArmsMap: Record<string, string>): void {
    console.log('updateOwnerCoatOfArms called with data:', ownerCoatOfArmsMap);
    
    // Update the coat of arms map
    this.ownerCoatOfArmsMap = { ...this.ownerCoatOfArmsMap, ...ownerCoatOfArmsMap };
    
    // Update the users data with coat of arms information
    Object.entries(ownerCoatOfArmsMap).forEach(([owner, url]) => {
      if (this.users[owner]) {
        this.users[owner].coat_of_arms_image = url;
      } else {
        // Create user entry if it doesn't exist
        this.users[owner] = { 
          user_name: owner,
          coat_of_arms_image: url
        };
      }
    });
    
    console.log('Combined coat of arms map now has', Object.keys(this.ownerCoatOfArmsMap).length, 'entries');
    
    // Notify listeners about the change
    eventBus.emit(EventTypes.OWNER_COAT_OF_ARMS_UPDATED, ownerCoatOfArmsMap);
  }
  
  /**
   * Update the owner of a polygon
   */
  public updatePolygonOwner(polygonId: string, newOwner: string): void {
    console.log(`PolygonDataManager.updatePolygonOwner called for ${polygonId} with new owner ${newOwner}`);
    
    // Find the polygon in our list
    const polygon = this.polygons.find(p => p.id === polygonId);
    if (!polygon) {
      console.warn(`Polygon ${polygonId} not found in polygons list`);
      return;
    }
    
    // Update the polygon's owner
    polygon.owner = newOwner;
    console.log(`Updated polygon ${polygonId} owner to ${newOwner} in data model`);
    
    // Notify listeners about the change
    eventBus.emit(EventTypes.POLYGON_OWNER_UPDATED, {
      polygonId,
      newOwner,
      ownerColor: this.getOwnerColor(newOwner),
      ownerCoatOfArmsUrl: this.getOwnerCoatOfArmsUrl(newOwner)
    });
  }
}
