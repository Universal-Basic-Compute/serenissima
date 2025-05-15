import { CoordinateService } from './CoordinateService';
import { eventBus, EventTypes } from '../utils/eventBus';

export class TransportService {
  private transportStartPoint: {lat: number, lng: number} | null = null;
  private transportEndPoint: {lat: number, lng: number} | null = null;
  private transportPath: any[] = [];
  private calculatingPath: boolean = false;
  private waterOnlyMode: boolean = false;
  private transportMode: boolean = false;

  /**
   * Set transport start point
   */
  public setStartPoint(point: {lat: number, lng: number} | null): void {
    this.transportStartPoint = point;
    eventBus.emit(EventTypes.TRANSPORT_START_POINT_SET, point);
  }

  /**
   * Set transport end point
   */
  public setEndPoint(point: {lat: number, lng: number} | null): void {
    this.transportEndPoint = point;
    eventBus.emit(EventTypes.TRANSPORT_END_POINT_SET, point);
    
    // If we have both start and end points, calculate the route
    if (this.transportStartPoint && point) {
      this.calculateRoute(this.transportStartPoint, point);
    }
  }

  /**
   * Calculate transport route
   */
  public async calculateRoute(start: {lat: number, lng: number}, end: {lat: number, lng: number}): Promise<void> {
    try {
      // Set calculating state to true to show loading indicator
      this.calculatingPath = true;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATING, true);
      
      console.log('Calculating transport route from', start, 'to', end);
      
      const response = await fetch('/api/transport', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startPoint: start,
          endPoint: end
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Transport route calculated:', data);
        
        if (data.success && data.path) {
          this.transportPath = data.path;
          // Set water-only mode if the API indicates it's a water-only route
          this.waterOnlyMode = !!data.waterOnly;
          
          // Emit event with the calculated path
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
            path: data.path,
            waterOnly: this.waterOnlyMode
          });
        } else {
          console.error('Failed to calculate route:', data.error);
          
          // If the error is about points not being within polygons, try to use water-only pathfinding
          if (data.error === 'Start or end point is not within any polygon') {
            console.log('Points not within polygons, attempting water-only pathfinding');
            
            // Show a message to the user
            alert('Points are not on land. Attempting to find a water route...');
            
            // Make a direct request to the water-only pathfinding endpoint
            const waterResponse = await fetch('/api/transport/water-only', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                startPoint: start,
                endPoint: end
              }),
            });
            
            if (waterResponse.ok) {
              const waterData = await waterResponse.json();
              
              if (waterData.success && waterData.path) {
                this.transportPath = waterData.path;
                this.waterOnlyMode = true;
                
                // Emit event with the calculated path
                eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATED, {
                  path: waterData.path,
                  waterOnly: true
                });
                return;
              }
            }
          }
          
          // If we get here, both regular and water-only pathfinding failed
          alert(`Could not find a route: ${data.error || 'Unknown error'}`);
          // Reset end point to allow trying again
          this.transportEndPoint = null;
          eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, data.error || 'Unknown error');
        }
      } else {
        console.error('API error:', response.status);
        alert('Error calculating route. Please try again.');
        this.transportEndPoint = null;
        eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, 'API error: ' + response.status);
      }
    } catch (error) {
      console.error('Error calculating transport route:', error);
      alert('Error calculating route. Please try again.');
      this.transportEndPoint = null;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_ERROR, error);
    } finally {
      // Set calculating state to false to hide loading indicator
      this.calculatingPath = false;
      eventBus.emit(EventTypes.TRANSPORT_ROUTE_CALCULATING, false);
    }
  }

  /**
   * Reset transport state
   */
  public reset(): void {
    this.transportStartPoint = null;
    this.transportEndPoint = null;
    this.transportPath = [];
    this.calculatingPath = false;
    this.waterOnlyMode = false;
    
    // Emit reset event
    eventBus.emit(EventTypes.TRANSPORT_RESET, null);
  }
  
  /**
   * Set transport mode
   */
  public setTransportMode(active: boolean): void {
    this.transportMode = active;
    
    // Emit event
    eventBus.emit(EventTypes.TRANSPORT_MODE_CHANGED, { active });
  }
  
  /**
   * Get transport mode
   */
  public getTransportMode(): boolean {
    return this.transportMode;
  }
  
  /**
   * Handle point selection for transport
   */
  public handlePointSelected(point: {lat: number, lng: number}): void {
    if (!this.transportMode) return;
    
    if (!this.transportStartPoint) {
      this.setStartPoint(point);
    } else {
      this.setEndPoint(point);
    }
  }

  /**
   * Get current transport state
   */
  public getState(): {
    startPoint: {lat: number, lng: number} | null;
    endPoint: {lat: number, lng: number} | null;
    path: any[];
    calculatingPath: boolean;
    waterOnlyMode: boolean;
  } {
    return {
      startPoint: this.transportStartPoint,
      endPoint: this.transportEndPoint,
      path: this.transportPath,
      calculatingPath: this.calculatingPath,
      waterOnlyMode: this.waterOnlyMode
    };
  }

  /**
   * Calculate distance between two points in meters
   */
  public calculateDistance(point1: {lat: number, lng: number}, point2: {lat: number, lng: number}): number {
    return CoordinateService.calculateDistance(point1, point2);
  }
}

// Export a singleton instance
export const transportService = new TransportService();
