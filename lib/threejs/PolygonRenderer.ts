// Properties for coat of arms drag and drop functionality
private isDraggingCoatOfArms: boolean = false;
private draggedCoatOfArmsId: string | null = null;
private draggedSprite: THREE.Sprite | null = null;
private dragPlane: THREE.Plane | null = null;
private dragOffset: THREE.Vector3 | null = null;
private raycaster: THREE.Raycaster = new THREE.Raycaster();
private mouse: THREE.Vector2 = new THREE.Vector2();

/**
 * Initialize drag and drop functionality for coat of arms sprites
 * @param canvas The canvas element for event handling
 */
public initCoatOfArmsDragDrop(canvas: HTMLCanvasElement): void {
  console.log('Initializing coat of arms drag and drop');
  
  // Add mouse event listeners to the canvas
  canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
  canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
  canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
  
  // Also listen for mouseout to handle cases where the mouse leaves the canvas
  canvas.addEventListener('mouseout', this.handleMouseUp.bind(this));
}

/**
 * Handle mouse down event to start dragging
 * @param event The mouse down event
 */
private handleMouseDown(event: MouseEvent): void {
  // Only enable dragging in land view mode
  if (this.activeView !== 'land') return;
  
  // Calculate mouse position in normalized device coordinates
  this.updateMousePosition(event.clientX, event.clientY);
  
  // Find all coat of arms sprites
  const coatOfArmsSprites: THREE.Sprite[] = [];
  this.scene.traverse((object) => {
    if (object instanceof THREE.Sprite && object.userData && object.userData.isCoatOfArms) {
      coatOfArmsSprites.push(object);
    }
  });
  
  // Cast a ray to see if we hit any coat of arms sprite
  this.raycaster.setFromCamera(this.mouse, this.camera);
  const intersects = this.raycaster.intersectObjects(coatOfArmsSprites);
  
  if (intersects.length > 0) {
    // We hit a coat of arms sprite
    const sprite = intersects[0].object as THREE.Sprite;
    const polygonId = sprite.userData.polygonId;
    
    if (polygonId) {
      // Start dragging
      this.isDraggingCoatOfArms = true;
      this.draggedCoatOfArmsId = polygonId;
      this.draggedSprite = sprite;
      
      // Create a drag plane perpendicular to the camera
      const cameraDirection = new THREE.Vector3();
      this.camera.getWorldDirection(cameraDirection);
      this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cameraDirection,
        sprite.position
      );
      
      // Calculate the offset between the sprite position and the mouse position
      const mouseRay = new THREE.Ray(
        this.camera.position,
        this.raycaster.ray.direction
      );
      const intersectionPoint = new THREE.Vector3();
      mouseRay.intersectPlane(this.dragPlane, intersectionPoint);
      
      this.dragOffset = new THREE.Vector3().subVectors(
        sprite.position,
        intersectionPoint
      );
      
      // Prevent other interactions while dragging
      event.stopPropagation();
    }
  }
}

/**
 * Handle mouse move event to update dragging
 * @param event The mouse move event
 */
private handleMouseMove(event: MouseEvent): void {
  // Update mouse position
  this.updateMousePosition(event.clientX, event.clientY);
  
  // If we're dragging a coat of arms
  if (this.isDraggingCoatOfArms && this.draggedCoatOfArmsId && this.draggedSprite && this.dragPlane && this.dragOffset) {
    // Calculate the new position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const mouseRay = new THREE.Ray(
      this.camera.position,
      this.raycaster.ray.direction
    );
    const intersectionPoint = new THREE.Vector3();
    mouseRay.intersectPlane(this.dragPlane, intersectionPoint);
    
    // Apply the offset
    this.draggedSprite.position.copy(intersectionPoint.add(this.dragOffset));
    
    // Prevent other interactions while dragging
    event.stopPropagation();
  }
}

/**
 * Handle mouse up event to end dragging
 * @param event The mouse up event
 */
private handleMouseUp(event: MouseEvent): void {
  // If we were dragging a coat of arms
  if (this.isDraggingCoatOfArms && this.draggedCoatOfArmsId && this.draggedSprite) {
    // Convert the 3D position to lat/lng
    const position = this.draggedSprite.position;
    const latLng = this.convertPositionToLatLng(position);
    
    // Save the new position
    this.saveCoatOfArmsPosition(this.draggedCoatOfArmsId, latLng);
    
    // Reset dragging state
    this.isDraggingCoatOfArms = false;
    this.draggedCoatOfArmsId = null;
    this.draggedSprite = null;
    this.dragPlane = null;
    this.dragOffset = null;
    
    // Prevent other interactions for this event
    event.stopPropagation();
  }
}

/**
 * Helper method to update mouse position
 * @param clientX Mouse X position in client coordinates
 * @param clientY Mouse Y position in client coordinates
 */
private updateMousePosition(clientX: number, clientY: number): void {
  this.mouse.x = (clientX / window.innerWidth) * 2 - 1;
  this.mouse.y = -(clientY / window.innerHeight) * 2 + 1;
}

/**
 * Convert a 3D position to lat/lng coordinates
 * @param position The 3D position to convert
 * @returns The corresponding lat/lng coordinates
 */
private convertPositionToLatLng(position: THREE.Vector3): { lat: number, lng: number } {
  // Get the bounds to determine the scale
  const bounds = this.bounds;
  
  // Calculate the scale factors
  const latScale = (bounds.maxLat - bounds.minLat) / (bounds.maxZ - bounds.minZ);
  const lngScale = (bounds.maxLng - bounds.minLng) / (bounds.maxX - bounds.minX);
  
  // Calculate the lat/lng
  const lat = bounds.minLat + (position.z - bounds.minZ) * latScale;
  const lng = bounds.minLng + (position.x - bounds.minX) * lngScale;
  
  return { lat, lng };
}

/**
 * Save the new coat of arms position to the server
 * @param polygonId The ID of the polygon
 * @param position The new position in lat/lng coordinates
 */
private saveCoatOfArmsPosition(polygonId: string, position: { lat: number, lng: number }): void {
  // Get the API base URL
  const apiBaseUrl = getApiBaseUrl();
  
  console.log(`Saving coat of arms position for polygon ${polygonId}:`, position);
  
  // Send the update to the server
  fetch(`${apiBaseUrl}/api/polygon/update-coat-of-arms-position`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      polygonId,
      position
    }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log(`Coat of arms position updated for polygon ${polygonId}`);
        
        // Update the local polygon data
        const polygon = this.polygons.find(p => p.id === polygonId);
        if (polygon) {
          polygon.coatOfArmsCenter = position;
        }
        
        // Notify about the change using the event bus
        eventBus.emit(EventTypes.POLYGON_UPDATED, {
          polygonId,
          updates: { coatOfArmsCenter: position }
        });
        
        // Force an update of the coat of arms sprites to reflect the new position
        this.updateCoatOfArmsSprites();
      } else {
        console.error('Failed to update coat of arms position:', data.error);
      }
    })
    .catch(error => {
      console.error('Error saving coat of arms position:', error);
    });
}

/**
 * Convert lat/lng to 3D position
 * @param lat Latitude
 * @param lng Longitude
 * @returns 3D position
 */
private convertLatLngToPosition(lat: number, lng: number): THREE.Vector3 {
  // Get the bounds to determine the scale
  const bounds = this.bounds;
  
  // Calculate the scale factors
  const zScale = (bounds.maxZ - bounds.minZ) / (bounds.maxLat - bounds.minLat);
  const xScale = (bounds.maxX - bounds.minX) / (bounds.maxLng - bounds.minLng);
  
  // Calculate the position
  const z = bounds.minZ + (lat - bounds.minLat) * zScale;
  const x = bounds.minX + (lng - bounds.minLng) * xScale;
  
  // Use a fixed height or calculate based on your terrain
  const y = 0; // You might want to adjust this
  
  return new THREE.Vector3(x, y, z);
}
// Add import for getApiBaseUrl and eventBus at the top of the file
import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';

/**
 * Update coat of arms sprites based on current data
 */
public updateCoatOfArmsSprites(): void {
  // Clear the sprite map
  this.coatOfArmsSprites.clear();
  
  // Remove existing coat of arms sprites
  this.scene.traverse((object) => {
    if (object instanceof THREE.Sprite && object.userData && object.userData.isCoatOfArms) {
      this.scene.remove(object);
    }
  });
  
  // Create new coat of arms sprites
  this.polygons.forEach(polygon => {
    if (polygon.owner && this.ownerCoatOfArmsMap[polygon.owner]) {
      // Determine the position - use coatOfArmsCenter if available, otherwise use centroid
      const position = polygon.coatOfArmsCenter || polygon.centroid;
      if (!position) return;
      
      console.log(`Creating coat of arms for polygon ${polygon.id} at position:`, position);
      
      // Create the sprite
      const texture = this.loadCoatOfArmsTexture(this.ownerCoatOfArmsMap[polygon.owner]);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      
      // Set position
      const worldPosition = this.convertLatLngToPosition(position.lat, position.lng);
      sprite.position.copy(worldPosition);
      sprite.position.y += 5; // Adjust height above the polygon
      
      // Set scale
      sprite.scale.set(10, 10, 1);
      
      // Add metadata
      sprite.userData = {
        isCoatOfArms: true,
        polygonId: polygon.id,
        owner: polygon.owner
      };
      
      // Add to scene
      this.scene.add(sprite);
      
      // Store in map
      this.coatOfArmsSprites.set(polygon.id, sprite);
    }
  });
}
