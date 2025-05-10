import * as THREE from 'three';
import { getWalletAddress } from '../walletUtils';
import { getUserName } from '../userUtils';
import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';

// Add missing event types
declare module '../eventBus' {
  interface EventTypes {
    RESOURCE_ADDED: string;
    RESOURCE_REMOVED: string;
    SHOW_RESOURCE_DETAILS: string;
  }
}

export interface ResourceDisplayOptions {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bounds: {
    centerLat?: number;
    centerLng?: number;
    scale?: number;
    latCorrectionFactor?: number;
    center?: { lat: number, lng: number };
    width?: number;
    height?: number;
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
  private selectedGroup: string | null = null;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private textureCache: Map<string, THREE.Texture> = new Map();
  private isActive: boolean = false;
  private mouseMoveHandler: (event: MouseEvent) => void;
  private mouseClickHandler: (event: MouseEvent) => void;
  private categoryColors: Record<string, number> = {
    raw_materials: 0x8B4513, // Brown
    food: 0x228B22,          // Forest Green
    crafted_goods: 0xB8860B, // Dark Goldenrod
    luxury_goods: 0x9932CC,  // Dark Orchid
    building_materials: 0x708090, // Slate Gray
    tools: 0x4682B4,         // Steel Blue
    textiles: 0xCD5C5C,      // Indian Red
    spices: 0xFF8C00,        // Dark Orange
    unknown: 0x808080        // Gray
  };
  private lastUpdateTime: number = 0;
  private updateInterval: number = 30000; // 30 seconds

  constructor(options: ResourceDisplayOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.bounds = options.bounds || {
      centerLat: 45.4371,
      centerLng: 12.3326,
      scale: 1000,
      latCorrectionFactor: 1.0
    };
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Create event handlers
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
    this.mouseClickHandler = this.handleMouseClick.bind(this);
    
    // Log the bounds for debugging
    console.log('ResourceDisplayManager initialized with bounds:', this.bounds);
  }

  /**
   * Initialize the resource display
   */
  public async initialize(): Promise<void> {
    console.log('Initializing ResourceDisplayManager');
    
    // Load resources
    await this.loadResources();
    
    // Group resources by location
    this.groupResourcesByLocation();
    
    // Set up auto-refresh
    this.setupAutoRefresh();
    
    // Subscribe to resource-related events
    this.subscribeToEvents();
    
    console.log(`Initialized with ${this.resources.length} resources in ${this.resourceGroups.size} groups`);
  }
  
  /**
   * Set up auto-refresh for resources
   */
  private setupAutoRefresh(): void {
    // Set the last update time to now
    this.lastUpdateTime = Date.now();
    
    // Set up an interval to check if we need to refresh
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastUpdateTime > this.updateInterval) {
        this.refreshResources();
      }
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Subscribe to resource-related events
   */
  private subscribeToEvents(): void {
    // Listen for resource added event
    eventBus.subscribe('RESOURCE_ADDED', (data) => {
      console.log('Resource added event received:', data);
      this.refreshResources();
    });
    
    // Listen for resource removed event
    eventBus.subscribe('RESOURCE_REMOVED', (data) => {
      console.log('Resource removed event received:', data);
      this.refreshResources();
    });
  }
  
  /**
   * Refresh resources from the API
   */
  public async refreshResources(): Promise<void> {
    console.log('Refreshing resources');
    
    // Update the last update time
    this.lastUpdateTime = Date.now();
    
    // Load resources
    await this.loadResources();
    
    // Group resources by location
    this.groupResourcesByLocation();
    
    // If active, recreate markers
    if (this.isActive) {
      this.removeAllMarkers();
      this.createResourceMarkers();
    }
  }

  /**
   * Set the active state of the resource display
   */
  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    
    console.log(`Setting ResourceDisplayManager active: ${active}`);
    this.isActive = active;
    
    if (active) {
      // Create markers and add event listeners
      this.createResourceMarkers();
      window.addEventListener('mousemove', this.mouseMoveHandler);
      window.addEventListener('click', this.mouseClickHandler);
      
      // Check if we need to refresh resources
      const now = Date.now();
      if (now - this.lastUpdateTime > this.updateInterval) {
        this.refreshResources();
      }
    } else {
      // Remove markers and event listeners
      this.removeAllMarkers();
      window.removeEventListener('mousemove', this.mouseMoveHandler);
      window.removeEventListener('click', this.mouseClickHandler);
      this.hoveredGroup = null;
      this.selectedGroup = null;
    }
  }

  /**
   * Load resources from the API
   */
  private async loadResources(): Promise<void> {
    try {
      // Get the username instead of wallet address
      const username = getUserName();
      let queryParams = '';
      
      if (username) {
        queryParams = `?owner=${username}`;
        console.log(`Loading resources for user ${username}`);
      } else {
        console.log('No username found, loading all resources');
      }

      // Use the correct API URL (Next.js API routes run on the same port as the app)
      const apiUrl = '/api/resources' + queryParams;
      console.log(`Fetching resources from: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API returned error status ${response.status}: ${errorText}`);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        this.resources = data;
      } else if (data && Array.isArray(data.resources)) {
        this.resources = data.resources;
      } else {
        console.warn('Unexpected API response format:', data);
        this.resources = [];
      }
      
      console.log(`Loaded ${this.resources.length} resources${username ? ` for user ${username}` : ''}`);
      
      // Log a sample resource for debugging
      if (this.resources.length > 0) {
        console.log('Sample resource:', this.resources[0]);
      }
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
      
      // Handle different position formats
      let position = resource.position;
      
      // If position is a string, try to parse it
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
        } catch (error) {
          console.warn(`Failed to parse position string for resource ${resource.id}:`, error);
          return;
        }
      }
      
      // Check if we have valid coordinates
      if (!position || 
          (position.lat === undefined && position.x === undefined) || 
          (position.lng === undefined && position.z === undefined)) {
        console.warn(`Invalid position format for resource ${resource.id}:`, position);
        return;
      }
      
      // Normalize position to lat/lng format
      const lat = position.lat !== undefined ? position.lat : position.x;
      const lng = position.lng !== undefined ? position.lng : position.z;
      
      // Create a location key based on position (with reduced precision to group nearby resources)
      const locationKey = `${parseFloat(lat).toFixed(5)}_${parseFloat(lng).toFixed(5)}`;
      
      if (!this.resourceGroups.has(locationKey)) {
        this.resourceGroups.set(locationKey, []);
      }
      
      this.resourceGroups.get(locationKey)?.push({
        ...resource,
        position: { lat, lng } // Normalize position format
      });
    });
    
    console.log(`Grouped resources into ${this.resourceGroups.size} locations`);
    
    // Log the first group for debugging
    if (this.resourceGroups.size > 0) {
      const firstKey = Array.from(this.resourceGroups.keys())[0];
      const firstGroup = this.resourceGroups.get(firstKey);
      console.log(`Sample group at ${firstKey} has ${firstGroup?.length} resources:`, 
        firstGroup?.map(r => `${r.type} (${r.count || 1})`).join(', '));
    }
  }

  /**
   * Create resource markers for all resource groups
   */
  private createResourceMarkers(): void {
    // Remove existing markers first
    this.removeAllMarkers();
    
    console.log(`Creating markers for ${this.resourceGroups.size} resource groups`);
    
    // Create a marker for each resource group
    this.resourceGroups.forEach((resources, locationKey) => {
      const marker = this.createResourceGroupMarker(locationKey, resources);
      this.markers.push(marker);
      this.scene.add(marker);
    });
    
    // If we have a previously selected group, try to reselect it
    if (this.selectedGroup && this.resourceGroups.has(this.selectedGroup)) {
      this.createDetailedExpandedView(this.selectedGroup);
    }
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
    
    // Find the ground level at this position
    const groundLevel = this.findGroundLevel(position);
    if (groundLevel !== null) {
      group.position.y = groundLevel + 0.1; // Position slightly above ground
    } else {
      group.position.y = 0.1; // Default height if ground not found
    }
    
    // Add a base marker (collapsed view)
    const baseMarker = this.createBaseMarker(resources);
    group.add(baseMarker);
    
    return group;
  }
  
  /**
   * Find the ground level at a position
   */
  private findGroundLevel(position: THREE.Vector3): number | null {
    // Create a raycaster pointing down
    const raycaster = new THREE.Raycaster();
    const rayOrigin = new THREE.Vector3(position.x, 10, position.z);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayOrigin, rayDirection);
    
    // Find all meshes in the scene that could be land
    const landMeshes: THREE.Object3D[] = [];
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh && 
          !object.userData.isResourceMarker && 
          !object.userData.isWater) {
        landMeshes.push(object);
      }
    });
    
    // Find intersections with land
    const intersects = raycaster.intersectObjects(landMeshes);
    
    if (intersects.length > 0) {
      return intersects[0].point.y;
    }
    
    return null;
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
    container.userData = { isResourceMarker: true };
    
    // Create a sprite for the resource icon
    const sprite = this.createResourceSprite(primaryResource.type);
    sprite.scale.set(1.5, 1.5, 1); // Slightly smaller than before
    container.add(sprite);
    
    // Add a circular background for better visibility
    const backgroundSprite = this.createCircularBackground(primaryResource.category);
    backgroundSprite.scale.set(1.8, 1.8, 1); // Slightly larger than the icon
    backgroundSprite.renderOrder = 999; // Render behind the icon
    container.add(backgroundSprite);
    
    // If there are multiple resources, add a count indicator
    if (resources.length > 1) {
      const countIndicator = this.createCountIndicator(resources.length);
      countIndicator.position.set(0.7, 0.7, 0.1);
      container.add(countIndicator);
    }
    
    // Add a count indicator for the resource amount
    const totalCount = resources.reduce((sum, resource) => sum + (resource.count || 1), 0);
    if (totalCount > 1) {
      const amountIndicator = this.createAmountIndicator(totalCount);
      amountIndicator.position.set(-0.7, -0.7, 0.1);
      container.add(amountIndicator);
    }
    
    // Make the marker always face the camera
    container.renderOrder = 1000;
    
    return container;
  }
  
  /**
   * Create a circular background for a resource icon
   */
  private createCircularBackground(category: string): THREE.Sprite {
    // Create a canvas for the background
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    
    const context = canvas.getContext('2d');
    if (!context) {
      // Fallback if context creation fails
      const material = new THREE.SpriteMaterial({ color: 0xFFFFFF });
      return new THREE.Sprite(material);
    }
    
    // Get color based on category
    const color = this.categoryColors[category] || this.categoryColors.unknown;
    const hexColor = '#' + color.toString(16).padStart(6, '0');
    
    // Draw a filled circle
    context.beginPath();
    context.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    context.fillStyle = hexColor;
    context.fill();
    
    // Add a white border
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 4;
    context.stroke();
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    // Create a sprite material
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    // Create and return the sprite
    return new THREE.Sprite(material);
  }

  /**
   * Create an expanded view for a resource group (hover state)
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
      const radius = 1.5; // Smaller radius than before
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // Create a container for this resource
      const container = new THREE.Group();
      container.position.set(x, 0, z);
      container.userData = { 
        resourceId: resource.id,
        resource: resource
      };
      
      // Create a sprite for the resource icon
      const sprite = this.createResourceSprite(resource.type);
      sprite.scale.set(1.2, 1.2, 1); // Slightly smaller than before
      container.add(sprite);
      
      // Add a circular background for better visibility
      const backgroundSprite = this.createCircularBackground(resource.category);
      backgroundSprite.scale.set(1.5, 1.5, 1); // Slightly larger than the icon
      backgroundSprite.renderOrder = 999; // Render behind the icon
      container.add(backgroundSprite);
      
      // Add a count indicator if needed
      if (resource.count && resource.count > 1) {
        const countIndicator = this.createAmountIndicator(resource.count);
        countIndicator.position.set(0, -0.7, 0.1);
        container.add(countIndicator);
      }
      
      // Add resource name (shorter version for hover state)
      const nameIndicator = this.createTextSprite(resource.name || resource.type, true);
      nameIndicator.position.set(0, 0.7, 0.1);
      container.add(nameIndicator);
      
      group.add(container);
    });
  }
  
  /**
   * Create a detailed expanded view for a resource group (selected state)
   * This method is called by expandResourceGroup
   */
  private createDetailedExpandedView(locationKey: string): void {
    const group = this.scene.getObjectByName(`resource-group-${locationKey}`) as THREE.Group;
    if (!group) return;
    
    const resources = group.userData.resources as any[];
    
    // Remove all children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    
    // Create a background panel
    const backgroundPanel = this.createBackgroundPanel(resources.length);
    group.add(backgroundPanel);
    
    // Create a sprite for each resource in the group
    resources.forEach((resource, index) => {
      // Calculate position in a grid or circle based on count
      let x, z;
      
      if (resources.length <= 4) {
        // For 1-4 resources, arrange in a 2x2 grid
        const row = Math.floor(index / 2);
        const col = index % 2;
        x = (col - 0.5) * 2;
        z = (row - 0.5) * 2;
      } else {
        // For more resources, arrange in a circle
        const angle = (index / resources.length) * Math.PI * 2;
        const radius = 2.5; // Larger radius for selected state
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      }
      
      // Create a container for this resource
      const container = new THREE.Group();
      container.position.set(x, 0, z);
      container.userData = { 
        resourceId: resource.id,
        resource: resource
      };
      
      // Create a sprite for the resource icon
      const sprite = this.createResourceSprite(resource.type);
      sprite.scale.set(1.5, 1.5, 1);
      container.add(sprite);
      
      // Add a circular background for better visibility
      const backgroundSprite = this.createCircularBackground(resource.category);
      backgroundSprite.scale.set(1.8, 1.8, 1);
      backgroundSprite.renderOrder = 999;
      container.add(backgroundSprite);
      
      // Add a count indicator if needed
      if (resource.count && resource.count > 1) {
        const countIndicator = this.createAmountIndicator(resource.count);
        countIndicator.position.set(0, -0.9, 0.1);
        container.add(countIndicator);
      }
      
      // Add resource name (full version for selected state)
      const nameIndicator = this.createTextSprite(resource.name || resource.type, false);
      nameIndicator.position.set(0, 0.9, 0.1);
      container.add(nameIndicator);
      
      // Add category indicator
      const categoryIndicator = this.createTextSprite(
        this.formatCategory(resource.category), 
        true, 
        0.7
      );
      categoryIndicator.position.set(0, 1.3, 0.1);
      container.add(categoryIndicator);
      
      group.add(container);
    });
    
    // Add a title for the location
    const locationTitle = this.createTextSprite(`Resources (${resources.length})`, false, 1.2);
    locationTitle.position.set(0, 3, 0);
    group.add(locationTitle);
  }
  
  /**
   * Format a category name for display
   */
  private formatCategory(category: string): string {
    if (!category) return 'Unknown';
    
    // Convert snake_case to Title Case
    return category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  /**
   * Create a background panel for the expanded view
   */
  private createBackgroundPanel(resourceCount: number): THREE.Mesh {
    // Determine panel size based on resource count
    const size = Math.max(6, resourceCount * 1.5);
    
    // Create a circular disc geometry
    const geometry = new THREE.CircleGeometry(size, 32);
    
    // Create a semi-transparent material
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    // Create the mesh
    const panel = new THREE.Mesh(geometry, material);
    
    // Rotate to lie flat
    panel.rotation.x = -Math.PI / 2;
    
    // Position slightly below other elements
    panel.position.y = -0.05;
    
    // Set render order to be behind other elements
    panel.renderOrder = 990;
    
    return panel;
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
   * @param text The text to display
   * @param compact Whether to use a compact style (for hover state)
   * @param scale Scale factor for the sprite (default: 1.0)
   */
  private createTextSprite(text: string, compact: boolean = false, scale: number = 1.0): THREE.Sprite {
    // Create a canvas to draw the text
    const canvas = document.createElement('canvas');
    const width = compact ? 192 : 256;
    const height = compact ? 48 : 64;
    canvas.width = width;
    canvas.height = height;
    
    const context = canvas.getContext('2d');
    if (!context) return new THREE.Sprite(new THREE.SpriteMaterial());
    
    // Draw a rounded rectangle background
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.roundRect(context, 0, 0, width, height, 16);
    context.fill();
    
    // Add a border
    context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    context.lineWidth = 2;
    this.roundRect(context, 1, 1, width - 2, height - 2, 15);
    context.stroke();
    
    // Draw the text
    context.fillStyle = '#ffffff';
    context.font = compact ? '18px Arial' : '24px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Truncate text if too long
    let displayText = text;
    const maxLength = compact ? 15 : 20;
    if (text.length > maxLength) {
      displayText = text.substring(0, maxLength - 3) + '...';
    }
    
    context.fillText(displayText, width / 2, height / 2);
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    const sprite = new THREE.Sprite(material);
    const aspectRatio = width / height;
    sprite.scale.set(2 * scale * aspectRatio, 0.5 * scale * aspectRatio, 1);
    
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
   * Show detailed information about a resource
   */
  private showResourceDetails(resource: any): void {
    console.log('Showing details for resource:', resource);
    
    // Create a custom event with resource details
    const event = new CustomEvent('showResourceDetails', {
      detail: {
        resource: resource
      }
    });
    
    // Dispatch the event
    window.dispatchEvent(event);
    
    // Also emit through the event bus
    eventBus.emit('SHOW_RESOURCE_DETAILS', {
      resource: resource
    });
  }

  /**
   * Convert lat/lng coordinates to scene position
   */
  private latLngToScenePosition(lat: number, lng: number): THREE.Vector3 {
    // Calculate position relative to center
    let x, z;
    
    // Handle both bounds formats
    if (this.bounds.centerLat !== undefined && this.bounds.centerLng !== undefined && this.bounds.scale !== undefined) {
      // Original format
      const latCorrectionFactor = this.bounds.latCorrectionFactor || 1.0;
      x = (lng - this.bounds.centerLng) * this.bounds.scale;
      z = -(lat - this.bounds.centerLat) * this.bounds.scale * latCorrectionFactor;
    } else if (this.bounds.center && this.bounds.width !== undefined) {
      // Alternative format from SimplePolygonRenderer
      const centerLat = this.bounds.center.lat || 0;
      const centerLng = this.bounds.center.lng || 0;
      const scale = this.bounds.width ? this.bounds.width / 0.01 : 1000; // Approximate scale from width
      x = (lng - centerLng) * scale;
      z = -(lat - centerLat) * scale;
    } else {
      // Fallback to default values
      console.warn('Invalid bounds format, using default values');
      x = lng * 1000;
      z = -lat * 1000;
    }
    
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
      // If we have a selected group, don't collapse it on hover changes
      if (this.hoveredGroup && this.hoveredGroup !== this.selectedGroup) {
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
      
      // Expand the newly hovered group if it's not the selected group
      if (intersectedGroup && intersectedGroup !== this.selectedGroup) {
        this.createExpandedView(intersectedGroup);
      }
      
      this.hoveredGroup = intersectedGroup;
      
      // Update cursor style
      document.body.style.cursor = intersectedGroup ? 'pointer' : 'default';
    }
  }
  
  /**
   * Handle mouse click events for selection
   */
  private handleMouseClick(event: MouseEvent): void {
    if (!this.isActive) return;
    
    // Calculate mouse position in normalized device coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Find intersections with resource groups
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersected object that belongs to a resource group
    let clickedGroup: string | null = null;
    let clickedResource: any = null;
    
    for (const intersect of intersects) {
      let obj: THREE.Object3D | null = intersect.object;
      
      // Check if this is a resource item in an expanded view
      if (obj.userData && obj.userData.resourceId) {
        clickedResource = obj.userData.resource;
        
        // Find the parent group
        while (obj && (!obj.userData || !obj.userData.type || obj.userData.type !== 'resource-group')) {
          obj = obj.parent;
        }
        
        if (obj && obj.userData && obj.userData.locationKey) {
          clickedGroup = obj.userData.locationKey;
          break;
        }
      }
      
      // Otherwise check if it's a resource group
      while (obj && (!obj.userData || !obj.userData.type || obj.userData.type !== 'resource-group')) {
        obj = obj.parent;
      }
      
      if (obj && obj.userData && obj.userData.locationKey) {
        clickedGroup = obj.userData.locationKey;
        break;
      }
    }
    
    // Handle selection
    if (clickedGroup) {
      // If clicking on the already selected group, deselect it
      if (clickedGroup === this.selectedGroup) {
        this.selectedGroup = null;
        
        // Collapse the group
        const group = this.scene.getObjectByName(`resource-group-${clickedGroup}`) as THREE.Group;
        if (group) {
          // Remove all children
          while (group.children.length > 0) {
            group.remove(group.children[0]);
          }
          
          // Add back the base marker
          const baseMarker = this.createBaseMarker(group.userData.resources);
          group.add(baseMarker);
        }
        
        // If it's still hovered, expand it again
        if (this.hoveredGroup === clickedGroup) {
          this.createExpandedView(clickedGroup);
        }
      } else {
        // If a different group was previously selected, collapse it
        if (this.selectedGroup) {
          const previousGroup = this.scene.getObjectByName(`resource-group-${this.selectedGroup}`) as THREE.Group;
          if (previousGroup) {
            // Remove all children
            while (previousGroup.children.length > 0) {
              previousGroup.remove(previousGroup.children[0]);
            }
            
            // Add back the base marker
            const baseMarker = this.createBaseMarker(previousGroup.userData.resources);
            previousGroup.add(baseMarker);
          }
        }
        
        // Select the new group
        this.selectedGroup = clickedGroup;
        
        // Create a detailed expanded view
        this.createDetailedExpandedView(clickedGroup);
        
        // If a specific resource was clicked, show details
        if (clickedResource) {
          this.showResourceDetails(clickedResource);
        }
      }
    } else {
      // Clicked outside any resource group, deselect current selection
      if (this.selectedGroup) {
        const group = this.scene.getObjectByName(`resource-group-${this.selectedGroup}`) as THREE.Group;
        if (group) {
          // Remove all children
          while (group.children.length > 0) {
            group.remove(group.children[0]);
          }
          
          // Add back the base marker
          const baseMarker = this.createBaseMarker(group.userData.resources);
          group.add(baseMarker);
        }
        
        this.selectedGroup = null;
      }
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
