import * as THREE from 'three';
import { getWalletAddress } from '../walletUtils';
import { getApiBaseUrl } from '../apiUtils';

export interface ResourceDisplayOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bounds: {
    centerLat: number;
    centerLng: number;
    scale: number;
    latCorrectionFactor: number;
  };
}

export class ResourceDisplayManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private bounds: any;
  private resources: any[] = [];
  private resourceGroups: Map<string, any[]> = new Map();
  private markers: THREE.Group[] = [];
  private hoveredGroup: string | null = null;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private textureCache: Map<string, THREE.Texture> = new Map();
  private isActive: boolean = false;
  private mouseMoveHandler: (event: MouseEvent) => void;

  constructor(options: ResourceDisplayOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.bounds = options.bounds;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Create mouse move handler
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
  }

  /**
   * Initialize the resource display
   */
  public async initialize(): Promise<void> {
    // Load resources
    await this.loadResources();
    
    // Group resources by location
    this.groupResourcesByLocation();
  }

  /**
   * Set the active state of the resource display
   */
  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    
    this.isActive = active;
    
    if (active) {
      // Create markers and add event listeners
      this.createResourceMarkers();
      window.addEventListener('mousemove', this.mouseMoveHandler);
    } else {
      // Remove markers and event listeners
      this.removeAllMarkers();
      window.removeEventListener('mousemove', this.mouseMoveHandler);
      this.hoveredGroup = null;
    }
  }

  /**
   * Load resources from the API
   */
  private async loadResources(): Promise<void> {
    try {
      const walletAddress = getWalletAddress();
      if (!walletAddress) {
        console.log('No wallet address found, using default resources');
        this.resources = [];
        return;
      }

      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/resources?owner=${walletAddress}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch resources: ${response.status}`);
      }
      
      const data = await response.json();
      this.resources = data;
      
      console.log(`Loaded ${this.resources.length} resources for wallet ${walletAddress}`);
    } catch (error) {
      console.error('Error loading resources:', error);
      this.resources = [];
    }
  }

  /**
   * Group resources by location
   */
  private groupResourcesByLocation(): void {
    this.resourceGroups.clear();
    
    this.resources.forEach(resource => {
      if (!resource.position) return;
      
      // Create a location key based on position
      const locationKey = `${resource.position.lat.toFixed(6)}_${resource.position.lng.toFixed(6)}`;
      
      if (!this.resourceGroups.has(locationKey)) {
        this.resourceGroups.set(locationKey, []);
      }
      
      this.resourceGroups.get(locationKey)?.push(resource);
    });
    
    console.log(`Grouped resources into ${this.resourceGroups.size} locations`);
  }

  /**
   * Create resource markers for all resource groups
   */
  private createResourceMarkers(): void {
    // Remove existing markers first
    this.removeAllMarkers();
    
    // Create a marker for each resource group
    this.resourceGroups.forEach((resources, locationKey) => {
      const marker = this.createResourceGroupMarker(locationKey, resources);
      this.markers.push(marker);
      this.scene.add(marker);
    });
  }

  /**
   * Create a marker for a resource group
   */
  private createResourceGroupMarker(locationKey: string, resources: any[]): THREE.Group {
    const [latStr, lngStr] = locationKey.split('_');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    
    // Convert lat/lng to scene coordinates
    const position = this.latLngToScenePosition(lat, lng);
    
    // Create a group to hold the marker
    const group = new THREE.Group();
    group.position.copy(position);
    group.name = `resource-group-${locationKey}`;
    group.userData = {
      type: 'resource-group',
      locationKey,
      resources
    };
    
    // Add a base marker (collapsed view)
    const baseMarker = this.createBaseMarker(resources);
    group.add(baseMarker);
    
    return group;
  }

  /**
   * Create a base marker for a resource group (collapsed view)
   */
  private createBaseMarker(resources: any[]): THREE.Object3D {
    // Use the first resource for the icon
    const primaryResource = resources[0];
    
    // Create a container for the marker
    const container = new THREE.Group();
    container.name = 'base-marker';
    
    // Create a sprite for the resource icon
    const sprite = this.createResourceSprite(primaryResource.type);
    sprite.scale.set(2, 2, 1);
    container.add(sprite);
    
    // If there are multiple resources, add a count indicator
    if (resources.length > 1) {
      const countIndicator = this.createCountIndicator(resources.length);
      countIndicator.position.set(0.7, 0.7, 0.1);
      container.add(countIndicator);
    }
    
    // Add a count indicator for the resource amount
    if (primaryResource.count && primaryResource.count > 1) {
      const amountIndicator = this.createAmountIndicator(primaryResource.count);
      amountIndicator.position.set(-0.7, -0.7, 0.1);
      container.add(amountIndicator);
    }
    
    // Make the marker always face the camera
    container.renderOrder = 1000;
    
    return container;
  }

  /**
   * Create an expanded view for a resource group
   */
  private createExpandedView(locationKey: string): void {
    const group = this.scene.getObjectByName(`resource-group-${locationKey}`) as THREE.Group;
    if (!group) return;
    
    const resources = group.userData.resources as any[];
    
    // Remove all children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    
    // Create a sprite for each resource in the group
    resources.forEach((resource, index) => {
      // Calculate position in a circle
      const angle = (index / resources.length) * Math.PI * 2;
      const radius = 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // Create a container for this resource
      const container = new THREE.Group();
      container.position.set(x, 0, z);
      
      // Create a sprite for the resource icon
      const sprite = this.createResourceSprite(resource.type);
      sprite.scale.set(1.5, 1.5, 1);
      container.add(sprite);
      
      // Add a count indicator if needed
      if (resource.count && resource.count > 1) {
        const countIndicator = this.createAmountIndicator(resource.count);
        countIndicator.position.set(0, -0.7, 0.1);
        container.add(countIndicator);
      }
      
      // Add resource name
      const nameIndicator = this.createTextSprite(resource.name || resource.type);
      nameIndicator.position.set(0, 0.7, 0.1);
      container.add(nameIndicator);
      
      group.add(container);
    });
  }

  /**
   * Create a sprite for a resource icon
   */
  private createResourceSprite(resourceType: string): THREE.Sprite {
    // Try to get from cache first
    let texture = this.textureCache.get(resourceType);
    
    if (!texture) {
      // Load the texture
      const loader = new THREE.TextureLoader();
      texture = loader.load(`/images/resources/${resourceType}.png`, 
        // Success callback
        (loadedTexture) => {
          this.textureCache.set(resourceType, loadedTexture);
        },
        // Progress callback
        undefined,
        // Error callback
        () => {
          console.warn(`Failed to load texture for resource type: ${resourceType}, using fallback`);
          // Use a fallback texture
          texture = loader.load('/images/resources/default.png');
          this.textureCache.set(resourceType, texture);
        }
      );
    }
    
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    return new THREE.Sprite(material);
  }

  /**
   * Create a count indicator for multiple resources
   */
  private createCountIndicator(count: number): THREE.Sprite {
    // Create a canvas to draw the count
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw a circle background
      context.fillStyle = '#ff0000';
      context.beginPath();
      context.arc(32, 32, 24, 0, Math.PI * 2);
      context.fill();
      
      // Draw the count text
      context.fillStyle = '#ffffff';
      context.font = 'bold 32px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(count.toString(), 32, 32);
    }
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.7, 0.7, 1);
    
    return sprite;
  }

  /**
   * Create an amount indicator for resource count
   */
  private createAmountIndicator(amount: number): THREE.Sprite {
    // Create a canvas to draw the amount
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw a rounded rectangle background
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.roundRect(context, 0, 0, 128, 64, 16);
      context.fill();
      
      // Draw the amount text
      context.fillStyle = '#ffffff';
      context.font = 'bold 32px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(amount.toString(), 64, 32);
    }
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1, 0.5, 1);
    
    return sprite;
  }

  /**
   * Create a text sprite
   */
  private createTextSprite(text: string): THREE.Sprite {
    // Create a canvas to draw the text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw a rounded rectangle background
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.roundRect(context, 0, 0, 256, 64, 16);
      context.fill();
      
      // Draw the text
      context.fillStyle = '#ffffff';
      context.font = '24px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      
      // Truncate text if too long
      let displayText = text;
      if (text.length > 20) {
        displayText = text.substring(0, 17) + '...';
      }
      
      context.fillText(displayText, 128, 32);
    }
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    
    return sprite;
  }

  /**
   * Helper function to draw a rounded rectangle
   */
  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Convert lat/lng coordinates to scene position
   */
  private latLngToScenePosition(lat: number, lng: number): THREE.Vector3 {
    // Calculate position relative to center
    const x = (lng - this.bounds.centerLng) * this.bounds.scale;
    const z = -(lat - this.bounds.centerLat) * this.bounds.scale * this.bounds.latCorrectionFactor;
    
    // Set y position slightly above the ground
    const y = 1.5;
    
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Handle mouse move events for hover interactions
   */
  private handleMouseMove(event: MouseEvent): void {
    if (!this.isActive) return;
    
    // Calculate mouse position in normalized device coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find intersections with resource groups
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersected object that belongs to a resource group
    let intersectedGroup: string | null = null;
    
    for (const intersect of intersects) {
      let obj: THREE.Object3D | null = intersect.object;
      
      // Traverse up to find the group
      while (obj && (!obj.userData || !obj.userData.type || obj.userData.type !== 'resource-group')) {
        obj = obj.parent;
      }
      
      if (obj && obj.userData && obj.userData.locationKey) {
        intersectedGroup = obj.userData.locationKey;
        break;
      }
    }
    
    // Handle hover state changes
    if (intersectedGroup !== this.hoveredGroup) {
      // Collapse the previously hovered group
      if (this.hoveredGroup) {
        const group = this.scene.getObjectByName(`resource-group-${this.hoveredGroup}`) as THREE.Group;
        if (group) {
          // Remove all children
          while (group.children.length > 0) {
            group.remove(group.children[0]);
          }
          
          // Add back the base marker
          const baseMarker = this.createBaseMarker(group.userData.resources);
          group.add(baseMarker);
        }
      }
      
      // Expand the newly hovered group
      if (intersectedGroup) {
        this.createExpandedView(intersectedGroup);
      }
      
      this.hoveredGroup = intersectedGroup;
    }
  }

  /**
   * Remove all resource markers from the scene
   */
  private removeAllMarkers(): void {
    this.markers.forEach(marker => {
      this.scene.remove(marker);
    });
    
    this.markers = [];
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    // Remove event listeners
    window.removeEventListener('mousemove', this.mouseMoveHandler);
    
    // Remove all markers
    this.removeAllMarkers();
    
    // Clear texture cache
    this.textureCache.forEach(texture => {
      texture.dispose();
    });
    this.textureCache.clear();
  }
}
