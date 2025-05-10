import * as THREE from 'three';
import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';

export interface CitizenDisplayOptions {
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

export class CitizenDisplayManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private bounds: any;
  private citizens: any[] = [];
  private citizenGroups: Map<string, any[]> = new Map();
  private markers: THREE.Group[] = [];
  private hoveredGroup: string | null = null;
  private selectedGroup: string | null = null;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private textureCache: Map<string, THREE.Texture> = new Map();
  private isActive: boolean = false;
  private mouseMoveHandler: (event: MouseEvent) => void;
  private mouseClickHandler: (event: MouseEvent) => void;
  private lastUpdateTime: number = 0;
  private updateInterval: number = 30000; // 30 seconds

  constructor(options: CitizenDisplayOptions) {
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
  }

  /**
   * Initialize the citizen display
   */
  public async initialize(): Promise<void> {
    console.log('Initializing CitizenDisplayManager');
    
    // Load citizens
    await this.loadCitizens();
    
    // Add debug citizens if needed
    this.addDebugCitizensIfNeeded();
    
    // Group citizens by location
    this.groupCitizensByLocation();
    
    // Set up auto-refresh
    this.setupAutoRefresh();
    
    // Subscribe to citizen-related events
    this.subscribeToEvents();
    
    console.log(`Initialized with ${this.citizens.length} citizens in ${this.citizenGroups.size} groups`);
  }
  
  /**
   * Add debug citizens if none are loaded
   */
  private addDebugCitizensIfNeeded(): void {
    // Only add debug citizens if we have none
    if (this.citizens.length === 0) {
      console.log('No citizens loaded, adding debug citizens');
      
      // Add some debug citizens at different locations in Venice
      const debugCitizens = [
        {
          id: 'debug-citizen-1',
          name: 'Marco Polo',
          profileImage: '/images/citizens/citizen1.png',
          position: { lat: 45.4371, lng: 12.3358 },
          occupation: 'Explorer',
          owner: 'system',
          landId: 'polygon-1',
          createdAt: new Date().toISOString()
        },
        {
          id: 'debug-citizen-2',
          name: 'Antonio Vivaldi',
          profileImage: '/images/citizens/citizen2.png',
          position: { lat: 45.4375, lng: 12.3368 },
          occupation: 'Composer',
          owner: 'system',
          landId: 'polygon-2',
          createdAt: new Date().toISOString()
        },
        {
          id: 'debug-citizen-3',
          name: 'Caterina Cornaro',
          profileImage: '/images/citizens/citizen3.png',
          position: { lat: 45.4365, lng: 12.3348 },
          occupation: 'Queen of Cyprus',
          owner: 'system',
          landId: 'polygon-3',
          createdAt: new Date().toISOString()
        },
        {
          id: 'debug-citizen-4',
          name: 'Giacomo Casanova',
          profileImage: '/images/citizens/citizen4.png',
          position: { lat: 45.4380, lng: 12.3378 },
          occupation: 'Adventurer',
          owner: 'system',
          landId: 'polygon-4',
          createdAt: new Date().toISOString()
        },
        {
          id: 'debug-citizen-5',
          name: 'Elena Cornaro Piscopia',
          profileImage: '/images/citizens/citizen5.png',
          position: { lat: 45.4368, lng: 12.3362 },
          occupation: 'Philosopher',
          owner: 'system',
          landId: 'polygon-5',
          createdAt: new Date().toISOString()
        }
      ];
      
      this.citizens = debugCitizens;
    }
  }
  
  /**
   * Set up auto-refresh for citizens
   */
  private setupAutoRefresh(): void {
    // Set the last update time to now
    this.lastUpdateTime = Date.now();
    
    // Set up an interval to check if we need to refresh
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastUpdateTime > this.updateInterval) {
        this.refreshCitizens();
      }
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Subscribe to citizen-related events
   */
  private subscribeToEvents(): void {
    // Listen for citizens loaded event
    eventBus.subscribe(EventTypes.CITIZENS_LOADED, (data) => {
      console.log('Citizens loaded event received:', data);
      this.refreshCitizens();
    });
    
    // Listen for citizen hover event
    eventBus.subscribe(EventTypes.CITIZEN_HOVER, (data) => {
      console.log('Citizen hover event received:', data);
      this.refreshCitizens();
    });
  }
  
  /**
   * Refresh citizens from the API
   */
  public async refreshCitizens(): Promise<void> {
    // Update the last update time
    this.lastUpdateTime = Date.now();
    
    // Load citizens
    await this.loadCitizens();
    
    // Group citizens by location
    this.groupCitizensByLocation();
    
    // If active, recreate markers
    if (this.isActive) {
      this.removeAllMarkers();
      this.createCitizenMarkers();
    }
  }

  /**
   * Set the active state of the citizen display
   */
  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    
    this.isActive = active;
    
    if (active) {
      // Create markers and add event listeners
      this.createCitizenMarkers();
      window.addEventListener('mousemove', this.mouseMoveHandler);
      window.addEventListener('click', this.mouseClickHandler);
      
      // Check if we need to refresh citizens
      const now = Date.now();
      if (now - this.lastUpdateTime > this.updateInterval) {
        this.refreshCitizens();
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
   * Load citizens from the API
   */
  private async loadCitizens(): Promise<void> {
    try {
      // Use the correct API URL (Next.js API routes run on the same port as the app)
      const apiUrl = '/api/citizens';
      
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
        this.citizens = data;
      } else if (data && Array.isArray(data.citizens)) {
        this.citizens = data.citizens;
      } else {
        console.warn('Unexpected API response format:', data);
        this.citizens = [];
      }
      
      console.log(`Loaded ${this.citizens.length} citizens`);
    } catch (error) {
      console.error('Error loading citizens:', error);
      this.citizens = [];
    }
  }

  /**
   * Group citizens by location
   */
  private groupCitizensByLocation(): void {
    this.citizenGroups.clear();
    
    this.citizens.forEach(citizen => {
      if (!citizen.position) return;
      
      // Handle different position formats
      let position = citizen.position;
      
      // If position is a string, try to parse it
      if (typeof position === 'string') {
        try {
          position = JSON.parse(position);
        } catch (error) {
          console.warn(`Failed to parse position string for citizen ${citizen.id}:`, error);
          return;
        }
      }
      
      // Check if we have valid coordinates
      if (!position || 
          (position.lat === undefined && position.x === undefined) || 
          (position.lng === undefined && position.z === undefined)) {
        console.warn(`Invalid position format for citizen ${citizen.id}:`, position);
        return;
      }
      
      // Normalize position to lat/lng format
      const lat = position.lat !== undefined ? position.lat : position.x;
      const lng = position.lng !== undefined ? position.lng : position.z;
      
      // Create a location key based on position (with reduced precision to group nearby citizens)
      const locationKey = `${parseFloat(lat).toFixed(5)}_${parseFloat(lng).toFixed(5)}`;
      
      if (!this.citizenGroups.has(locationKey)) {
        this.citizenGroups.set(locationKey, []);
      }
      
      this.citizenGroups.get(locationKey)?.push({
        ...citizen,
        position: { lat, lng } // Normalize position format
      });
    });
  }

  /**
   * Create citizen markers for all citizen groups
   */
  private createCitizenMarkers(): void {
    // Remove existing markers first
    this.removeAllMarkers();
    
    // Create a marker for each citizen group
    this.citizenGroups.forEach((citizens, locationKey) => {
      const marker = this.createCitizenGroupMarker(locationKey, citizens);
      this.markers.push(marker);
      this.scene.add(marker);
    });
    
    // If we have a previously selected group, try to reselect it
    if (this.selectedGroup && this.citizenGroups.has(this.selectedGroup)) {
      this.createDetailedExpandedView(this.selectedGroup);
    }
  }

  /**
   * Create a marker for a citizen group
   */
  private createCitizenGroupMarker(locationKey: string, citizens: any[]): THREE.Group {
    const [latStr, lngStr] = locationKey.split('_');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    
    // Convert lat/lng to scene coordinates
    const position = this.latLngToScenePosition(lat, lng);
    
    // Create a group to hold the marker
    const group = new THREE.Group();
    group.position.copy(position);
    group.name = `citizen-group-${locationKey}`;
    group.userData = {
      type: 'citizen-group',
      locationKey,
      citizens
    };
    
    // Find the ground level at this position
    const groundLevel = this.findGroundLevel(position);
    if (groundLevel !== null) {
      group.position.y = groundLevel + 0.5; // Position slightly above ground
    } else {
      group.position.y = 0.5; // Default height if ground not found
    }
    
    // Add a base marker (collapsed view)
    const baseMarker = this.createBaseMarker(citizens);
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
          !object.userData.isCitizenMarker && 
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
   * Create a base marker for a citizen group (collapsed view)
   */
  private createBaseMarker(citizens: any[]): THREE.Object3D {
    // Use the first citizen for the icon
    const primaryCitizen = citizens[0];
    
    // Create a container for the marker
    const container = new THREE.Group();
    container.name = 'base-marker';
    container.userData = { isCitizenMarker: true };
    
    // Create a sprite for the citizen icon
    const sprite = this.createCitizenSprite(primaryCitizen.profileImage || '/images/citizens/default.png');
    sprite.scale.set(2, 2, 1);
    container.add(sprite);
    
    // Add a circular background for better visibility
    const backgroundSprite = this.createCircularBackground();
    backgroundSprite.scale.set(2.2, 2.2, 1); // Slightly larger than the icon
    backgroundSprite.renderOrder = 999; // Render behind the icon
    container.add(backgroundSprite);
    
    // If there are multiple citizens, add a count indicator
    if (citizens.length > 1) {
      const countIndicator = this.createCountIndicator(citizens.length);
      countIndicator.position.set(0.7, 0.7, 0.1);
      container.add(countIndicator);
    }
    
    // Make the marker always face the camera
    container.renderOrder = 1000;
    
    return container;
  }
  
  /**
   * Create a circular background for a citizen icon
   */
  private createCircularBackground(): THREE.Sprite {
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
    
    // Draw a filled circle with a gradient
    const gradient = context.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.7, 'rgba(200, 200, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(150, 150, 255, 0.6)');
    
    context.beginPath();
    context.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    context.fillStyle = gradient;
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
   * Create a sprite for a citizen icon
   */
  private createCitizenSprite(imageUrl: string): THREE.Sprite {
    // Try to get from cache first
    let texture = this.textureCache.get(imageUrl);
    
    if (!texture) {
      // Load the texture
      const loader = new THREE.TextureLoader();
      
      // Try multiple paths to find the citizen image
      const tryLoadTexture = (paths: string[]) => {
        if (paths.length === 0) {
          console.warn(`Failed to load texture for citizen image: ${imageUrl}, using fallback`);
          return loader.load('/images/citizens/default.png');
        }
        
        return loader.load(paths[0], 
          // Success callback
          (loadedTexture) => {
            this.textureCache.set(imageUrl, loadedTexture);
          },
          // Progress callback
          undefined,
          // Error callback
          () => {
            console.warn(`Failed to load texture from ${paths[0]}, trying next path...`);
            // Try the next path
            texture = tryLoadTexture(paths.slice(1));
          }
        );
      };
      
      // Try multiple possible paths for the citizen image
      texture = tryLoadTexture([
        imageUrl,
        `/images/citizens/default.png`
      ]);
    }
    
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false
    });
    
    return new THREE.Sprite(material);
  }

  /**
   * Create a count indicator for multiple citizens
   */
  private createCountIndicator(count: number): THREE.Sprite {
    // Create a canvas to draw the count
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw a circle background
      context.fillStyle = '#4b70e2';
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
   * Create an expanded view for a citizen group (hover state)
   */
  private createExpandedView(locationKey: string): void {
    const group = this.scene.getObjectByName(`citizen-group-${locationKey}`) as THREE.Group;
    if (!group) return;
    
    const citizens = group.userData.citizens as any[];
    
    // Remove all children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    
    // Create a sprite for each citizen in the group
    citizens.forEach((citizen, index) => {
      // Calculate position in a circle
      const angle = (index / citizens.length) * Math.PI * 2;
      const radius = 1.5; // Smaller radius than before
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // Create a container for this citizen
      const container = new THREE.Group();
      container.position.set(x, 0, z);
      container.userData = { 
        citizenId: citizen.id,
        citizen: citizen
      };
      
      // Create a sprite for the citizen icon
      const sprite = this.createCitizenSprite(citizen.profileImage || '/images/citizens/default.png');
      sprite.scale.set(1.5, 1.5, 1);
      container.add(sprite);
      
      // Add a circular background for better visibility
      const backgroundSprite = this.createCircularBackground();
      backgroundSprite.scale.set(1.7, 1.7, 1); // Slightly larger than the icon
      backgroundSprite.renderOrder = 999; // Render behind the icon
      container.add(backgroundSprite);
      
      // Add citizen name
      const nameIndicator = this.createTextSprite(citizen.name || 'Unknown Citizen', true);
      nameIndicator.position.set(0, 0.9, 0.1);
      container.add(nameIndicator);
      
      group.add(container);
    });
  }
  
  /**
   * Create a detailed expanded view for a citizen group (selected state)
   */
  private createDetailedExpandedView(locationKey: string): void {
    const group = this.scene.getObjectByName(`citizen-group-${locationKey}`) as THREE.Group;
    if (!group) return;
    
    const citizens = group.userData.citizens as any[];
    
    // Remove all children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    
    // Create a background panel
    const backgroundPanel = this.createBackgroundPanel(citizens.length);
    group.add(backgroundPanel);
    
    // Create a sprite for each citizen in the group
    citizens.forEach((citizen, index) => {
      // Calculate position in a grid or circle based on count
      let x, z;
      
      if (citizens.length <= 4) {
        // For 1-4 citizens, arrange in a 2x2 grid
        const row = Math.floor(index / 2);
        const col = index % 2;
        x = (col - 0.5) * 2.5;
        z = (row - 0.5) * 2.5;
      } else {
        // For more citizens, arrange in a circle
        const angle = (index / citizens.length) * Math.PI * 2;
        const radius = 2.5; // Larger radius for selected state
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
      }
      
      // Create a container for this citizen
      const container = new THREE.Group();
      container.position.set(x, 0, z);
      container.userData = { 
        citizenId: citizen.id,
        citizen: citizen
      };
      
      // Create a sprite for the citizen icon
      const sprite = this.createCitizenSprite(citizen.profileImage || '/images/citizens/default.png');
      sprite.scale.set(2, 2, 1);
      container.add(sprite);
      
      // Add a circular background for better visibility
      const backgroundSprite = this.createCircularBackground();
      backgroundSprite.scale.set(2.2, 2.2, 1);
      backgroundSprite.renderOrder = 999;
      container.add(backgroundSprite);
      
      // Add citizen name
      const nameIndicator = this.createTextSprite(citizen.name || 'Unknown Citizen', false);
      nameIndicator.position.set(0, 1.2, 0.1);
      container.add(nameIndicator);
      
      // Add occupation if available
      if (citizen.occupation) {
        const occupationIndicator = this.createTextSprite(
          citizen.occupation, 
          true, 
          0.7
        );
        occupationIndicator.position.set(0, 1.6, 0.1);
        container.add(occupationIndicator);
      }
      
      group.add(container);
    });
    
    // Add a title for the location
    const locationTitle = this.createTextSprite(`Citizens (${citizens.length})`, false, 1.2);
    locationTitle.position.set(0, 3, 0);
    group.add(locationTitle);
  }
  
  /**
   * Create a background panel for the expanded view
   */
  private createBackgroundPanel(citizenCount: number): THREE.Mesh {
    // Determine panel size based on citizen count
    const size = Math.max(6, citizenCount * 1.5);
    
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
   * Create a text sprite
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
   * Show detailed information about a citizen
   */
  private showCitizenDetails(citizen: any): void {
    console.log('Citizen details:', citizen.id);
    
    // Emit through the event bus
    eventBus.emit(EventTypes.SHOW_CITIZEN_DETAILS, {
      citizen: citizen
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
      const latCorrectionFactor = this.bounds.latCorrectionFactor || 0.7; // Default to 0.7 if not specified
      x = (lng - this.bounds.centerLng) * this.bounds.scale * latCorrectionFactor; // Apply correction to longitude
      z = -(lat - this.bounds.centerLat) * this.bounds.scale;
    } else if (this.bounds.center && this.bounds.width !== undefined) {
      // Alternative format from SimplePolygonRenderer
      const centerLat = this.bounds.center.lat || 0;
      const centerLng = this.bounds.center.lng || 0;
      const scale = this.bounds.width ? this.bounds.width / 0.01 : 1000; // Approximate scale from width
      const latCorrectionFactor = 0.7; // Use standard correction factor
      x = (lng - centerLng) * scale * latCorrectionFactor; // Apply correction to longitude
      z = -(lat - centerLat) * scale;
    } else {
      // Fallback to default values
      console.warn('Invalid bounds format, using default values');
      x = lng * 1000 * 0.7; // Apply correction factor to longitude
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
    
    // Find intersections with citizen groups
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersected object that belongs to a citizen group
    let intersectedGroup: string | null = null;
    
    for (const intersect of intersects) {
      let obj: THREE.Object3D | null = intersect.object;
      
      // Traverse up to find the group
      while (obj && (!obj.userData || !obj.userData.type || obj.userData.type !== 'citizen-group')) {
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
        const group = this.scene.getObjectByName(`citizen-group-${this.hoveredGroup}`) as THREE.Group;
        if (group) {
          // Remove all children
          while (group.children.length > 0) {
            group.remove(group.children[0]);
          }
          
          // Add back the base marker
          const baseMarker = this.createBaseMarker(group.userData.citizens);
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
    
    // Find intersections with citizen groups
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersected object that belongs to a citizen group
    let clickedGroup: string | null = null;
    let clickedCitizen: any = null;
    
    for (const intersect of intersects) {
      let obj: THREE.Object3D | null = intersect.object;
      
      // Check if this is a citizen item in an expanded view
      if (obj.userData && obj.userData.citizenId) {
        clickedCitizen = obj.userData.citizen;
        
        // Find the parent group
        while (obj && (!obj.userData || !obj.userData.type || obj.userData.type !== 'citizen-group')) {
          obj = obj.parent;
        }
        
        if (obj && obj.userData && obj.userData.locationKey) {
          clickedGroup = obj.userData.locationKey;
          break;
        }
      }
      
      // Otherwise check if it's a citizen group
      while (obj && (!obj.userData || !obj.userData.type || obj.userData.type !== 'citizen-group')) {
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
        const group = this.scene.getObjectByName(`citizen-group-${clickedGroup}`) as THREE.Group;
        if (group) {
          // Remove all children
          while (group.children.length > 0) {
            group.remove(group.children[0]);
          }
          
          // Add back the base marker
          const baseMarker = this.createBaseMarker(group.userData.citizens);
          group.add(baseMarker);
        }
        
        // If it's still hovered, expand it again
        if (this.hoveredGroup === clickedGroup) {
          this.createExpandedView(clickedGroup);
        }
      } else {
        // If a different group was previously selected, collapse it
        if (this.selectedGroup) {
          const previousGroup = this.scene.getObjectByName(`citizen-group-${this.selectedGroup}`) as THREE.Group;
          if (previousGroup) {
            // Remove all children
            while (previousGroup.children.length > 0) {
              previousGroup.remove(previousGroup.children[0]);
            }
            
            // Add back the base marker
            const baseMarker = this.createBaseMarker(previousGroup.userData.citizens);
            previousGroup.add(baseMarker);
          }
        }
        
        // Select the new group
        this.selectedGroup = clickedGroup;
        
        // Create a detailed expanded view
        this.createDetailedExpandedView(clickedGroup);
        
        // If a specific citizen was clicked, show details
        if (clickedCitizen) {
          this.showCitizenDetails(clickedCitizen);
        }
      }
    } else {
      // Clicked outside any citizen group, deselect current selection
      if (this.selectedGroup) {
        const group = this.scene.getObjectByName(`citizen-group-${this.selectedGroup}`) as THREE.Group;
        if (group) {
          // Remove all children
          while (group.children.length > 0) {
            group.remove(group.children[0]);
          }
          
          // Add back the base marker
          const baseMarker = this.createBaseMarker(group.userData.citizens);
          group.add(baseMarker);
        }
        
        this.selectedGroup = null;
      }
    }
  }

  /**
   * Remove all citizen markers from the scene
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
    window.removeEventListener('click', this.mouseClickHandler);
    
    // Remove all markers
    this.removeAllMarkers();
    
    // Clear texture cache
    this.textureCache.forEach(texture => {
      texture.dispose();
    });
    this.textureCache.clear();
  }
}
