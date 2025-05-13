import * as THREE from 'three';
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
    
    // Check citizen images directory
    this.checkCitizenImagesDirectory();
    
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
   * Check if the citizen images directory exists
   */
  private checkCitizenImagesDirectory(): void {
    // Check if the citizen images directory exists
    fetch('/images/citizens/default.png')
      .then(response => {
        if (!response.ok) {
          console.warn('Citizen images directory may not exist or default.png is missing');
          console.warn('Make sure you have created the directory /public/images/citizens/ and added citizen images');
        } else {
          console.log('Citizen images directory exists');
        }
      })
      .catch(error => {
        console.error('Error checking citizen images directory:', error);
      });
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
    
    // Listen for citizen added event
    eventBus.subscribe('CITIZEN_ADDED', (data) => {
      console.log('Citizen added event received:', data);
      this.refreshCitizens();
    });
    
    // Listen for citizen removed event
    eventBus.subscribe('CITIZEN_REMOVED', (data) => {
      console.log('Citizen removed event received:', data);
      this.refreshCitizens();
    });
    
    // Listen for loadCitizens custom event
    window.addEventListener('loadCitizens', () => {
      console.log('CitizenDisplayManager: Received loadCitizens event');
      this.refreshCitizens();
      this.setActive(true);
    });
    
    // Listen for citizens view activation
    eventBus.subscribe(EventTypes.VIEW_MODE_CHANGED, (data) => {
      if (data.viewMode === 'citizens') {
        console.log('CitizenDisplayManager: Citizens view activated');
        this.refreshCitizens();
        this.setActive(true);
      } else if (this.isActive) {
        console.log('CitizenDisplayManager: Deactivating citizens view');
        this.setActive(false);
      }
    });
  }
  
  /**
   * Refresh citizens from the API
   */
  public async refreshCitizens(): Promise<void> {
    console.log('CitizenDisplayManager: Refreshing citizens data');
    
    // Update the last update time
    this.lastUpdateTime = Date.now();
    
    try {
      // Use the correct API URL (Next.js API routes run on the same port as the app)
      const apiUrl = '/api/citizens';
      
      console.log('CitizenDisplayManager: Fetching citizens from API:', apiUrl);
      
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
      
      console.log(`CitizenDisplayManager: Loaded ${this.citizens.length} citizens`);
      
      // Add debug citizens if needed
      this.addDebugCitizensIfNeeded();
      
      // Group citizens by location
      this.groupCitizensByLocation();
      
      // If active, recreate markers
      if (this.isActive) {
        this.removeAllMarkers();
        this.createCitizenMarkers();
        
        // Force citizens to be visible
        this.forceVisibleCitizens();
      }
      
      // Emit event that citizens were loaded
      eventBus.emit(EventTypes.CITIZENS_LOADED, { count: this.citizens.length });
    } catch (error) {
      console.error('CitizenDisplayManager: Error loading citizens:', error);
      
      // Still try to use any existing citizens data
      this.addDebugCitizensIfNeeded();
      this.groupCitizensByLocation();
      
      // If active, recreate markers with whatever data we have
      if (this.isActive) {
        this.removeAllMarkers();
        this.createCitizenMarkers();
        this.forceVisibleCitizens();
      }
    }
  }
  
  /**
   * Force citizens to be visible at specific positions
   */
  public forceVisibleCitizens(): void {
    console.log('CitizenDisplayManager: Forcing citizens to be visible');
    
    // If we don't have any citizens, load them first
    if (this.citizens.length === 0) {
      console.log('CitizenDisplayManager: No citizens loaded, loading from API first');
      this.refreshCitizens().then(() => {
        console.log(`CitizenDisplayManager: Loaded ${this.citizens.length} citizens from API`);
        this.createCitizenMarkers();
        this.debugState();
      }).catch(error => {
        console.error('CitizenDisplayManager: Error loading citizens:', error);
        // Still try to add debug citizens and create markers
        this.addDebugCitizensIfNeeded();
        this.groupCitizensByLocation();
        this.createCitizenMarkers();
        this.debugState();
      });
      return;
    }
    
    // If we don't have any citizen groups, something is wrong with the grouping
    if (this.citizenGroups.size === 0) {
      console.warn('CitizenDisplayManager: No citizen groups after grouping, creating manual groups');
      
      // Create manual groups from citizens
      this.citizens.forEach(citizen => {
        if (!citizen.position) {
          console.warn(`CitizenDisplayManager: Citizen ${citizen.id} has no position, skipping`);
          return;
        }
        
        // Normalize position to lat/lng format
        let lat, lng;
        if (typeof citizen.position === 'object') {
          lat = citizen.position.lat !== undefined ? citizen.position.lat : citizen.position.x;
          lng = citizen.position.lng !== undefined ? citizen.position.lng : citizen.position.z;
        } else {
          console.warn(`CitizenDisplayManager: Citizen ${citizen.id} has invalid position format:`, citizen.position);
          return;
        }
        
        // Create a location key
        const locationKey = `${parseFloat(lat).toFixed(5)}_${parseFloat(lng).toFixed(5)}`;
        
        if (!this.citizenGroups.has(locationKey)) {
          this.citizenGroups.set(locationKey, []);
        }
        
        this.citizenGroups.get(locationKey)?.push({
          ...citizen,
          position: { lat, lng }
        });
      });
    }
    
    // Create markers for all groups
    this.createCitizenMarkers();
    
    // Debug the state
    this.debugState();
  }

  /**
   * Set the active state of the citizen display
   */
  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    
    console.log(`CitizenDisplayManager: Setting active to ${active}`);
    
    this.isActive = active;
    
    if (active) {
      console.log('CitizenDisplayManager: Creating markers and adding event listeners');
      
      // Always refresh citizens when activating the view
      console.log('CitizenDisplayManager: Refreshing citizens on activation');
      this.refreshCitizens();
      
      // Create markers and add event listeners
      this.createCitizenMarkers();
      window.addEventListener('mousemove', this.mouseMoveHandler);
      window.addEventListener('click', this.mouseClickHandler);
      
      // Force citizens to be visible
      setTimeout(() => {
        this.forceVisibleCitizens();
      }, 500);
      
      // Debug the state
      this.debugState();
    } else {
      console.log('CitizenDisplayManager: Removing markers and event listeners');
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
      
      console.log('CitizenDisplayManager: Fetching citizens from API:', apiUrl);
      
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
      
      // Emit event that citizens were loaded
      eventBus.emit(EventTypes.CITIZENS_LOADED, { count: this.citizens.length });
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
    
    // Create building markers for home and work locations
    this.createBuildingMarkers();
    
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
  private createCircularBackground(color: string = 'rgba(200, 200, 255, 0.8)'): THREE.Sprite {
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
    
    // Draw a filled circle with the specified color
    context.beginPath();
    context.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    context.fillStyle = color;
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
          console.warn(`Failed to load texture for citizen image: ${imageUrl}, using generated default`);
          return this.createDefaultCitizenTexture();
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
   * Create a default citizen texture when image loading fails
   */
  private createDefaultCitizenTexture(): THREE.Texture {
    // Create a canvas for the default citizen image
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    
    const context = canvas.getContext('2d');
    if (!context) {
      // Fallback if context creation fails
      return new THREE.Texture();
    }
    
    // Draw a simple face icon
    context.fillStyle = '#4b70e2'; // Blue background
    context.beginPath();
    context.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
    context.fill();
    
    // Draw a white border
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 4;
    context.stroke();
    
    // Draw a simple face
    context.fillStyle = '#FFFFFF';
    
    // Eyes
    context.beginPath();
    context.arc(size/3, size/2.5, size/10, 0, Math.PI * 2);
    context.arc(size*2/3, size/2.5, size/10, 0, Math.PI * 2);
    context.fill();
    
    // Smile
    context.beginPath();
    context.arc(size/2, size/2, size/3, 0.2, Math.PI - 0.2);
    context.lineWidth = 6;
    context.stroke();
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    return texture;
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
   * Show a selection UI for multiple citizens in a building
   */
  private showBuildingCitizensSelection(buildingId: string, citizens: any[]): void {
    // Create a detailed view for the building with all citizens
    const buildingGroup = this.scene.getObjectByName(`building-citizen-group-${buildingId}`) as THREE.Group;
    if (!buildingGroup) return;
    
    // Remove all children
    while (buildingGroup.children.length > 0) {
      buildingGroup.remove(buildingGroup.children[0]);
    }
    
    // Create a background panel
    const backgroundPanel = this.createBackgroundPanel(citizens.length);
    buildingGroup.add(backgroundPanel);
    
    // Create a sprite for each citizen in the building
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
        const radius = 2.5;
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
      
      // Add a circular background with color based on marker type (home/work)
      const backgroundColor = citizen.markerType === 'home' ? 
        'rgba(100, 150, 255, 0.8)' : 'rgba(255, 150, 100, 0.8)';
      const backgroundSprite = this.createCircularBackground(backgroundColor);
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
      
      buildingGroup.add(container);
    });
    
    // Add a title for the building
    const markerType = citizens[0].markerType === 'home' ? 'Residents' : 'Workers';
    const locationTitle = this.createTextSprite(`${markerType} (${citizens.length})`, false, 1.2);
    locationTitle.position.set(0, 3, 0);
    buildingGroup.add(locationTitle);
  }
  
  /**
   * Debug the current state of the CitizenDisplayManager
   */
  private debugState(): void {
    console.log('CitizenDisplayManager Debug State:');
    console.log(`- isActive: ${this.isActive}`);
    console.log(`- citizens loaded: ${this.citizens.length}`);
    console.log(`- citizen groups: ${this.citizenGroups.size}`);
    console.log(`- markers created: ${this.markers.length}`);
    console.log(`- hoveredGroup: ${this.hoveredGroup}`);
    console.log(`- selectedGroup: ${this.selectedGroup}`);
    
    // Log the first few citizens for debugging
    if (this.citizens.length > 0) {
      console.log('Sample citizens:');
      this.citizens.slice(0, 3).forEach((citizen, index) => {
        console.log(`Citizen ${index + 1}:`, {
          id: citizen.id,
          name: citizen.name,
          position: citizen.position
        });
      });
    }
    
    // Log the scene hierarchy
    console.log('Scene hierarchy:');
    let markerCount = 0;
    this.scene.traverse((object) => {
      if (object.userData && object.userData.type === 'citizen-group') {
        markerCount++;
        console.log(`- Citizen group: ${object.name}, position: ${object.position.x}, ${object.position.y}, ${object.position.z}`);
      }
    });
    console.log(`Total citizen groups in scene: ${markerCount}`);
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
    
    // Find intersections with citizen groups and building markers
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersected object that belongs to a citizen group or building marker
    let intersectedGroup: string | null = null;
    let intersectedBuildingId: string | null = null;
    
    for (const intersect of intersects) {
      let obj: THREE.Object3D | null = intersect.object;
      
      // Traverse up to find the group or building marker
      while (obj && (!obj.userData || !obj.userData.type || (obj.userData.type !== 'citizen-group' && obj.userData.type !== 'building-citizen-group'))) {
        obj = obj.parent;
      }
      
      if (obj && obj.userData) {
        if (obj.userData.type === 'citizen-group' && obj.userData.locationKey) {
          intersectedGroup = obj.userData.locationKey;
          break;
        } else if (obj.userData.type === 'building-citizen-group') {
          intersectedBuildingId = obj.userData.buildingId;
          break;
        }
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
    
    // Find intersections with citizen groups and building markers
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    // Find the first intersected object that belongs to a citizen group or building marker
    let clickedGroup: string | null = null;
    let clickedCitizen: any = null;
    let clickedBuildingId: string | null = null;
    let clickedBuildingCitizens: any[] | null = null;
    
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
      
      // Check if this is a building marker or citizen group
      while (obj && (!obj.userData || !obj.userData.type || (obj.userData.type !== 'citizen-group' && obj.userData.type !== 'building-citizen-group'))) {
        obj = obj.parent;
      }
      
      if (obj && obj.userData) {
        if (obj.userData.type === 'citizen-group' && obj.userData.locationKey) {
          clickedGroup = obj.userData.locationKey;
          break;
        } else if (obj.userData.type === 'building-citizen-group') {
          clickedBuildingId = obj.userData.buildingId;
          clickedBuildingCitizens = obj.userData.citizens;
          break;
        }
      }
    }
    
    // Handle selection of citizen groups
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
    } 
    // Handle selection of building markers
    else if (clickedBuildingId && clickedBuildingCitizens) {
      // If there's only one citizen, show their details
      if (clickedBuildingCitizens.length === 1) {
        this.showCitizenDetails(clickedBuildingCitizens[0]);
      } 
      // If there are multiple citizens, show a selection UI
      else if (clickedBuildingCitizens.length > 1) {
        this.showBuildingCitizensSelection(clickedBuildingId, clickedBuildingCitizens);
      }
    } 
    // Handle deselection
    else {
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
  /**
   * Create an icon to indicate home or work
   */
  private createTypeIcon(type: 'home' | 'work'): THREE.Sprite {
    // Create a canvas for the icon
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw a circle background
      context.fillStyle = type === 'home' ? '#4b70e2' : '#e27a4b';
      context.beginPath();
      context.arc(32, 32, 24, 0, Math.PI * 2);
      context.fill();
      
      // Draw the icon
      context.fillStyle = '#ffffff';
      context.beginPath();
      
      if (type === 'home') {
        // Draw a house icon
        context.moveTo(32, 16);
        context.lineTo(48, 32);
        context.lineTo(44, 32);
        context.lineTo(44, 48);
        context.lineTo(20, 48);
        context.lineTo(20, 32);
        context.lineTo(16, 32);
        context.closePath();
      } else {
        // Draw a work/tools icon
        context.moveTo(24, 20);
        context.lineTo(32, 28);
        context.lineTo(40, 20);
        context.lineTo(44, 24);
        context.lineTo(36, 32);
        context.lineTo(44, 40);
        context.lineTo(40, 44);
        context.lineTo(32, 36);
        context.lineTo(24, 44);
        context.lineTo(20, 40);
        context.lineTo(28, 32);
        context.lineTo(20, 24);
        context.closePath();
      }
      
      context.fill();
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
   * Create building markers for home and work locations
   */
  private createBuildingMarkers(): void {
    // Group citizens by building
    const buildingMap = new Map<string, any[]>();
    
    this.citizens.forEach(citizen => {
      // Process home buildings
      if (citizen.Home && citizen.isHome) {
        if (!buildingMap.has(citizen.Home)) {
          buildingMap.set(citizen.Home, []);
        }
        buildingMap.get(citizen.Home)?.push({
          ...citizen,
          markerType: 'home'
        });
      }
      
      // Process work buildings
      if (citizen.Work && citizen.isWork) {
        if (!buildingMap.has(citizen.Work)) {
          buildingMap.set(citizen.Work, []);
        }
        buildingMap.get(citizen.Work)?.push({
          ...citizen,
          markerType: 'work'
        });
      }
    });
    
    // Create markers for each building
    buildingMap.forEach((citizens, buildingId) => {
      // Find the first citizen with a position (should be the same for all citizens in the building)
      const citizenWithPosition = citizens.find(c => c.position);
      if (!citizenWithPosition || !citizenWithPosition.position) return;
      
      // Create a marker for this building
      const marker = this.createBuildingCitizenMarker(buildingId, citizens, citizenWithPosition.position);
      this.markers.push(marker);
      this.scene.add(marker);
    });
  }
  
  /**
   * Create a marker for a building with citizens
   */
  private createBuildingCitizenMarker(buildingId: string, citizens: any[], position: any): THREE.Group {
    // Convert position to lat/lng format if needed
    let lat, lng;
    if (typeof position === 'object') {
      lat = position.lat !== undefined ? position.lat : position.x;
      lng = position.lng !== undefined ? position.lng : position.z;
    } else {
      console.warn(`Invalid position format for building ${buildingId}:`, position);
      return new THREE.Group(); // Return empty group
    }
    
    // Convert lat/lng to scene position
    const scenePosition = this.latLngToScenePosition(lat, lng);
    
    // Create a group to hold the marker
    const group = new THREE.Group();
    group.position.copy(scenePosition);
    group.name = `building-citizen-group-${buildingId}`;
    group.userData = {
      type: 'building-citizen-group',
      buildingId,
      citizens
    };
    
    // Find the ground level at this position
    const groundLevel = this.findGroundLevel(scenePosition);
    if (groundLevel !== null) {
      group.position.y = groundLevel + 2.5; // Position above the building
    } else {
      group.position.y = 2.5; // Default height if ground not found
    }
    
    // Create markers for home and work citizens
    const homeCitizens = citizens.filter(c => c.markerType === 'home');
    const workCitizens = citizens.filter(c => c.markerType === 'work');
    
    // Create home marker if there are home citizens
    if (homeCitizens.length > 0) {
      const homeMarker = this.createBuildingResidentMarker(homeCitizens, 'home');
      homeMarker.position.set(-0.5, 0, 0); // Position slightly to the left
      group.add(homeMarker);
    }
    
    // Create work marker if there are work citizens
    if (workCitizens.length > 0) {
      const workMarker = this.createBuildingResidentMarker(workCitizens, 'work');
      workMarker.position.set(0.5, 0, 0); // Position slightly to the right
      group.add(workMarker);
    }
    
    return group;
  }
  
  /**
   * Create a marker for residents or workers in a building
   */
  private createBuildingResidentMarker(citizens: any[], markerType: 'home' | 'work'): THREE.Group {
    const container = new THREE.Group();
    container.name = `${markerType}-marker`;
    
    // Use the first citizen for the main icon
    const primaryCitizen = citizens[0];
    
    // Create a sprite for the citizen icon
    const sprite = this.createCitizenSprite(primaryCitizen.profileImage || '/images/citizens/default.png');
    sprite.scale.set(1.5, 1.5, 1);
    container.add(sprite);
    
    // Add a circular background with different colors for home vs work
    const backgroundSprite = this.createCircularBackground(
      markerType === 'home' ? 'rgba(100, 150, 255, 0.8)' : 'rgba(255, 150, 100, 0.8)'
    );
    backgroundSprite.scale.set(1.7, 1.7, 1);
    backgroundSprite.renderOrder = 999;
    container.add(backgroundSprite);
    
    // Add an icon to indicate home or work
    const iconSprite = this.createTypeIcon(markerType);
    iconSprite.position.set(0.7, 0.7, 0.1);
    container.add(iconSprite);
    
    // If there are multiple citizens, add a count indicator
    if (citizens.length > 1) {
      const countIndicator = this.createCountIndicator(citizens.length);
      countIndicator.position.set(-0.7, 0.7, 0.1);
      container.add(countIndicator);
    }
    
    return container;
  }
