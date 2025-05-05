// Add import for getApiBaseUrl and eventBus at the top of the file
import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';

/**
 * Update coat of arms sprites based on current data
 */
public updateCoatOfArmsSprites(): void {
  console.log('Updating coat of arms sprites');
  
  // Debug: Log polygons with coatOfArmsCenter
  const polygonsWithCoatOfArms = this.polygons.filter(p => p.coatOfArmsCenter);
  console.log(`Found ${polygonsWithCoatOfArms.length} polygons with coatOfArmsCenter:`, 
    polygonsWithCoatOfArms.map(p => ({ id: p.id, position: p.coatOfArmsCenter })));
  
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
      // Use centroid for positioning
      const position = polygon.centroid;
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
