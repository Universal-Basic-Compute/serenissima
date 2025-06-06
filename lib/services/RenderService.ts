/**
 * RenderService
 * Handles canvas drawing operations for the isometric view
 */
import { CoordinateService } from './CoordinateService';
import { buildingService } from './BuildingService';
import { CitizenService } from './CitizenService';
import { incomeService } from './IncomeService';
import { hoverStateService } from './HoverStateService';

export class RenderService {
  /**
   * Draw a polygon on the canvas
   */
  public drawPolygon(
    ctx: CanvasRenderingContext2D,
    coords: {x: number, y: number}[],
    fillColor: string,
    isSelected: boolean = false,
    isHovered: boolean = false
  ): void {
    if (!coords || coords.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.closePath();
    
    // Apply different styles based on state
    if (isSelected) {
      // Selected state: much brighter with a thicker border
      ctx.fillStyle = this.lightenColor(fillColor, 35); // Increased brightness for selection
      ctx.fill();
      ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
      ctx.lineWidth = 3.5;
    } else if (isHovered) {
      // Hover state: slightly brighter with a medium border
      ctx.fillStyle = this.lightenColor(fillColor, 20); // Medium brightness for hover
      ctx.fill();
      ctx.strokeStyle = '#FFA500'; // Orange for hover
      ctx.lineWidth = 2;
    } else {
      // Normal state
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 1;
    }
    
    ctx.stroke();
  }

  /**
   * Draw a building on the canvas
   */
  public drawBuilding(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    typeIndicator: string,
    isSelected: boolean = false,
    shape: 'square' | 'circle' | 'triangle' = 'square',
    isHovered: boolean = false,
    rotation?: number,
    buildingType?: string,
    buildingCategory?: string, // Add buildingCategory parameter
    scaleParam?: number // Renamed from scale to scaleParam to avoid conflict with the scale parameter of the class or module
  ): void {
    // DEBUG: Log current globalAlpha
    // console.log(`[RenderService.drawBuilding] ID: ${typeIndicator} (type: ${buildingType}), isSelected: ${isSelected}, isHovered: ${isHovered}, ctx.globalAlpha: ${ctx.globalAlpha}, color: ${color}`);

    // Determine if it's a bridge for styling AND shape logic
    const isBridgeByType = buildingType && 
                           (buildingType.toLowerCase().includes('bridge') || 
                            buildingType.toLowerCase().includes('ponte'));
    const isBridgeByCategory = buildingCategory && buildingCategory.toLowerCase() === 'bridge';
    const isActuallyABridge = isBridgeByType || isBridgeByCategory;

    // Apply different styles based on state
    if (isSelected) {
      // Selected state: much brighter with a thicker border
      ctx.fillStyle = this.lightenColor(color, 35); // Increased brightness for selection
      ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
      ctx.lineWidth = 3.5;
    } else if (isHovered) {
      // Hover state: slightly brighter with a medium border
      ctx.fillStyle = this.lightenColor(color, 20); // Medium brightness for hover
      ctx.strokeStyle = '#FFA500'; // Orange for hover
      ctx.lineWidth = 2;
    } else {
      // Normal state
      ctx.fillStyle = color;
      ctx.strokeStyle = isActuallyABridge ? '#8B4513' : '#000'; // Brown for bridges, black for others
      ctx.lineWidth = 1;
    }
    
    // Draw the appropriate shape based on the building's point type
    ctx.beginPath();

    // Note: isActuallyABridge and its components (isBridgeByType, isBridgeByCategory)
    // are now defined earlier in this function for styling purposes.
    const isMerchantGalley = buildingType?.toLowerCase() === 'merchant_galley';

    if (isActuallyABridge && rotation !== undefined) {
      // For bridges, 'size' is squareSize = (default building dimension e.g. 20) * scaleParam * 0.6
      // Make bridge width a good portion of this, and height a smaller fraction for a rectangular look.
      const bridgeWidth = size * 0.8; 
      const bridgeHeight = Math.max(2 * (scaleParam || 1), size * 0.25); // Ensure a minimum visible height, e.g. 25% of size

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.rect(-bridgeWidth / 2, -bridgeHeight / 2, bridgeWidth, bridgeHeight);
      ctx.fill();
      ctx.stroke(); // Stroke needs to be inside save/restore if rotation is applied
      ctx.restore();
    } else if (isMerchantGalley && rotation !== undefined) {
      // For merchant galleys, draw an elongated ellipse (boat shape from above)
      // 'size' here is squareSize, use it to determine boat dimensions
      const boatLength = size * 1.5; // Make it longer than it is wide
      const boatWidth = size * 0.6;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation); 
      ctx.beginPath();
      ctx.ellipse(0, 0, boatLength / 2, boatWidth / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      if (shape === 'circle') {
        // Draw circle for canal points
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      } else if (shape === 'triangle') {
        // Draw triangle for bridge points
        const halfSize = size / 2;
        ctx.moveTo(x, y - halfSize);
        ctx.lineTo(x - halfSize, y + halfSize);
        ctx.lineTo(x + halfSize, y + halfSize);
        ctx.closePath();
      } else {
        // Draw square for regular building points (default)
        ctx.rect(
          x - size / 2,
          y - size / 2,
          size,
          size
        );
      }
      ctx.fill();
      ctx.stroke(); // Stroke for non-bridge shapes
    }
    
    // ctx.stroke(); // Stroke was here, moved into conditional blocks (effectively removing the redundant one)
    
    // Add a small indicator for the building type with fixed font size
    // For bridges, we might not want a type indicator, or a different one.
    // For now, keep it for non-bridges.
    // Also, skip text indicator for merchant galleys.
    if (!(isActuallyABridge && rotation !== undefined) && !(buildingType?.toLowerCase() === 'merchant_galley')) {
      ctx.fillStyle = '#000'; // Black text for visibility
      ctx.font = `10px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typeIndicator, x, y);
    }
  }

  /**
   * Draw a circular coat of arms or avatar
   */
  public createCircularImage(
    ctx: CanvasRenderingContext2D, 
    img: HTMLImageElement, 
    x: number, 
    y: number, 
    size: number
  ): void {
    try {
      // Check if the image has loaded successfully
      if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        console.warn(`Image not loaded properly, using default avatar instead`);
        // Use the default avatar as fallback
        this.createDefaultCircularAvatar(ctx, "Unknown", x, y, size);
        return;
      }
      
      // Save the current context state
      ctx.save();
      
      // Create a circular clipping path
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      
      // Add a white border around the circle
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Clip to the circle
      ctx.clip();
      
      // Since we've already resized the image to maintain aspect ratio,
      // we can draw it directly centered in the circle
      const drawX = x - img.width / 2;
      const drawY = y - img.height / 2;
      
      // Draw the pre-resized image
      ctx.drawImage(img, drawX, drawY);
      
      // Restore the context state
      ctx.restore();
    } catch (error) {
      console.error('Error drawing circular image:', error);
      // If drawing fails, use default avatar
      ctx.restore(); // Restore context before trying again
      this.createDefaultCircularAvatar(ctx, "Error", x, y, size);
    }
  }

  /**
   * Create a default circular avatar for owners without coat of arms
   */
  public createDefaultCircularAvatar(
    ctx: CanvasRenderingContext2D, 
    owner: string, 
    x: number, 
    y: number, 
    size: number
  ): void {
    try {
      // Save the current context state
      ctx.save();
      
      // Generate a deterministic color based on the owner name
      const getColorFromString = (str: string): string => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Generate a hue between 0 and 360
        const hue = Math.abs(hash) % 360;
        
        // Use a fixed saturation and lightness for better visibility
        return `hsl(${hue}, 70%, 60%)`;
      };
      
      // Get a color based on the owner name
      const baseColor = getColorFromString(owner);
      
      // Draw a circular background
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = baseColor;
      ctx.fill();
      
      // Add a white border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Add the owner's initials
      ctx.font = `bold ${size * 0.4}px Arial`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Get the first letter of the owner name, handle empty strings
      const initial = owner && owner.length > 0 ? owner.charAt(0).toUpperCase() : '?';
      ctx.fillText(initial, x, y);
      
      // Restore the context state
      ctx.restore();
    } catch (error) {
      console.error('Error creating default avatar:', error);
      
      // Absolute fallback - just draw a gray circle with a question mark
      try {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fillStyle = '#888888';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = `bold ${size * 0.4}px Arial`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x, y);
        ctx.restore();
      } catch (e) {
        // If even this fails, just silently continue
        console.error('Critical error in fallback avatar rendering:', e);
      }
    }
  }

  /**
   * Draw a citizen marker
   */
  public createCitizenMarker(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    citizen: any, 
    markerType: 'home' | 'work',
    size: number = 20,
    isHovered: boolean = false
  ): void {
    // Log the full citizen object for debugging
    console.log('Full citizen object in RenderService.createCitizenMarker:', citizen);

    // Ensure we have the required properties for display
    const firstName = citizen?.firstname || citizen?.FirstName || citizen?.firstName || '';
    const lastName = citizen?.lastname || citizen?.LastName || citizen?.lastName || '';
    const socialClass = citizen?.socialclass || citizen?.SocialClass || citizen?.socialClass || '';
    const citizenId = citizen?.citizenid || citizen?.CitizenId || citizen?.id || '';

    // Determine color based on social class
    const getSocialClassColor = (socialClass: string): string => {
      const baseClass = socialClass?.toLowerCase() || '';
      
      // Base colors for different social classes
      if (baseClass.includes('nobili')) {
        // Gold/yellow for nobility
        return markerType === 'home' 
          ? 'rgba(218, 165, 32, 0.8)'
          : 'rgba(218, 165, 32, 0.8)';
      } else if (baseClass.includes('cittadini')) {
        // Blue for citizens
        return markerType === 'home' 
          ? 'rgba(70, 130, 180, 0.8)'
          : 'rgba(70, 130, 180, 0.8)';
      } else if (baseClass.includes('popolani')) {
        // Brown/amber for common people
        return markerType === 'home' 
          ? 'rgba(205, 133, 63, 0.8)'
          : 'rgba(205, 133, 63, 0.8)';
      } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
        // Gray for laborers
        return markerType === 'home' 
          ? 'rgba(128, 128, 128, 0.8)'
          : 'rgba(128, 128, 128, 0.8)';
      }
      
      // Default colors if social class is unknown or not matched
      return markerType === 'home' 
        ? 'rgba(100, 150, 255, 0.8)'
        : 'rgba(255, 150, 100, 0.8)';
    };

    // Get color based on social class
    const fillColor = getSocialClassColor(socialClass);

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
    const firstInitial = firstName.charAt(0).toUpperCase() || '?';
    const lastInitial = lastName.charAt(0).toUpperCase() || '?';
    ctx.fillText(firstInitial + lastInitial, x, y);
    
    // Add a small icon to indicate home or work
    const iconSize = size / 2;
    const iconX = x + size - iconSize / 2;
    const iconY = y - size + iconSize / 2;
  
    // Draw the icon background
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconSize, 0, Math.PI * 2);
    ctx.fillStyle = markerType === 'home' ? '#4b70e2' : '#e27a4b';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.stroke();
  
    // Draw icon symbol - house for home, tools for work
    if (markerType === 'home') {
      // Draw a house icon instead of just the letter 'H'
      ctx.fillStyle = '#FFFFFF';
    
      // Calculate house dimensions based on icon size
      const houseWidth = iconSize * 0.8;
      const houseHeight = iconSize * 0.6;
      const roofHeight = iconSize * 0.4;
    
      // Draw the roof (triangle)
      ctx.beginPath();
      ctx.moveTo(iconX - houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
      ctx.lineTo(iconX, iconY - houseHeight/2 - roofHeight/2);
      ctx.lineTo(iconX + houseWidth/2, iconY - houseHeight/2 + roofHeight/2);
      ctx.closePath();
      ctx.fill();
    
      // Draw the house body (rectangle)
      ctx.fillRect(
        iconX - houseWidth/2, 
        iconY - houseHeight/2 + roofHeight/2, 
        houseWidth, 
        houseHeight
      );
    
      // Draw a small door
      ctx.fillStyle = '#4b70e2'; // Same as background color
      const doorWidth = houseWidth * 0.4;
      const doorHeight = houseHeight * 0.6;
      ctx.fillRect(
        iconX - doorWidth/2,
        iconY - houseHeight/2 + roofHeight/2 + houseHeight - doorHeight,
        doorWidth,
        doorHeight
      );
    } else {
      // For work, keep the 'W' text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${iconSize * 0.8}px Arial`;
      ctx.fillText('W', iconX, iconY);
    }
  }

  /**
   * Calculate polygons to render
   */
  public calculatePolygonsToRender(
    polygons: any[],
    landOwners: Record<string, string>,
    citizens: Record<string, any>,
    scale: number,
    offset: { x: number, y: number },
    canvasWidth: number,
    canvasHeight: number,
    activeView: string,
    incomeData: Record<string, number>,
    incomeDataLoaded: boolean
  ): any[] {
    return polygons.map(polygon => {
      if (!polygon.coordinates || polygon.coordinates.length < 3) return null;
      
      // Get polygon owner color or income-based color
      let fillColor = '#FFF5D0'; // Default sand color
      if (activeView === 'land') {
        if (incomeDataLoaded && polygon.id && incomeData[polygon.id] !== undefined) {
          // Use income-based color in land view ONLY if income data is loaded
          // Import and use the incomeService instance
          const { incomeService } = require('./IncomeService');
          fillColor = incomeService.getIncomeColor(incomeData[polygon.id]);
        } else if (polygon.id && landOwners[polygon.id]) {
          // Use owner color in land view
          const owner = landOwners[polygon.id];
          const citizen = citizens[owner];
          if (citizen && citizen.color) {
            fillColor = citizen.color;
          }
        }
      }
      // For other views, keep the default yellow color
      
      // Convert lat/lng to isometric coordinates
      const coords = polygon.coordinates.map((coord: {lat: number, lng: number}) => {
        // Convert to world coordinates
        const world = CoordinateService.latLngToWorld(coord.lat, coord.lng);
        
        // Convert to screen coordinates
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvasWidth, canvasHeight
        );
        
        return {
          x: screen.x,
          y: screen.y
        };
      });
      
      // Use the polygon's center property if available, otherwise calculate centroid
      let centerX, centerY;
      
      if (polygon.center && polygon.center.lat && polygon.center.lng) {
        // Use the provided center
        const world = CoordinateService.latLngToWorld(polygon.center.lat, polygon.center.lng);
        const screen = CoordinateService.worldToScreen(
          world.x, world.y, scale, offset, canvasWidth, canvasHeight
        );
        
        centerX = screen.x;
        centerY = screen.y;
      } else {
        // Calculate centroid as fallback
        centerX = 0;
        centerY = 0;
        coords.forEach(coord => {
          centerX += coord.x;
          centerY += coord.y;
        });
        centerX /= coords.length;
        centerY /= coords.length;
      }
      
      return {
        polygon,
        coords,
        fillColor,
        centroidX: centerX, // Store both for compatibility
        centroidY: centerY,
        centerX: centerX,    // Add these explicitly
        centerY: centerY
      };
    }).filter(Boolean);
  }

  /**
   * Draw the entire scene
   */
  public drawScene(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    activeView: string,
    scale: number,
    offset: { x: number, y: number },
    polygonsToRender: any[],
    buildings: any[],
    emptyBuildingPoints: any[],
    interactionState: any,
    transportPath: any[],
    polygons: any[],
    incomeData: Record<string, number>,
    citizensByBuilding: Record<string, any[]>,
    citizensLoaded: boolean,
    coatOfArmsImageUrls: Record<string, HTMLImageElement>,
    renderedCoatOfArmsCache: Record<string, {image: HTMLImageElement | null, x: number, y: number, size: number}>
  ): void {
    // Get current hover state
    const hoverState = hoverStateService.getState();
    // Skip rendering if canvas is not visible
    if (!canvas.offsetParent) {
      return;
    }
    // Performance measurement
    const startTime = performance.now();
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw water background
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw polygons
    this.drawPolygons(ctx, polygonsToRender, interactionState);
    
    // Draw coat of arms for lands with owners (only in land view)
    if (activeView === 'land') {
      this.drawCoatOfArms(ctx, polygonsToRender, coatOfArmsImageUrls, renderedCoatOfArmsCache, scale); // Pass scale
    }
    
    // Draw buildings
    this.drawBuildings(ctx, buildings, scale, offset, canvas.width, canvas.height, interactionState);
    
    // Draw empty building points
    this.drawEmptyBuildingPoints(ctx, emptyBuildingPoints, activeView, scale, offset, canvas.width, canvas.height, interactionState);
    
    // Draw dock and bridge points
    this.drawDockAndBridgePoints(ctx, polygons, activeView, scale, offset, canvas.width, canvas.height, interactionState);
    
    // Draw transport path if available
    if (transportPath.length > 0 && activeView === 'transport') {
      this.drawTransportPath(ctx, transportPath, scale, offset, canvas.width, canvas.height);
    }
    
    // No citizen markers are drawn here - they're handled by the CitizenMarkers component
    
    // Log performance metrics for debugging
    const endTime = performance.now();
    const renderTime = endTime - startTime;
    
    // Only log if rendering takes more than 16ms (60fps threshold)
    if (renderTime > 16) {
      console.debug(`Scene rendering took ${renderTime.toFixed(2)}ms (${(1000/renderTime).toFixed(1)} fps)`);
    }
  }

  /**
   * Draw polygons
   */
  public drawPolygons(
    ctx: CanvasRenderingContext2D,
    polygonsToRender: any[],
    options: {
      selectedPolygonId?: string | null;
      hoveredPolygonId?: string | null;
      fillOpacity?: number;
      strokeOpacity?: number;
    } = {}
  ): void {
    // Get current hover state
    const hoverState = hoverStateService.getState();
    
    polygonsToRender.forEach(({ polygon, coords, fillColor }) => {
      // Determine if this polygon is selected or hovered
      const isSelected = options.selectedPolygonId === polygon.id;
      const isHovered = options.hoveredPolygonId !== undefined 
        ? options.hoveredPolygonId === polygon.id 
        : (hoverState.type === 'polygon' && hoverState.id === polygon.id);
      
      // Save current global alpha
      const currentGlobalAlpha = ctx.globalAlpha;
      
      // Apply custom fill opacity if provided
      if (options.fillOpacity !== undefined) {
        ctx.globalAlpha = options.fillOpacity;
      }
      
      // Draw the polygon
      this.drawPolygon(ctx, coords, fillColor, isSelected, isHovered);
      
      // Apply custom stroke opacity if provided
      if (options.strokeOpacity !== undefined) {
        ctx.globalAlpha = options.strokeOpacity;
      }
      
      // Draw the stroke
      ctx.strokeStyle = isSelected ? '#FFD700' : isHovered ? '#FFFFFF' : '#000000';
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2 : 1;
      ctx.stroke();
      
      // Restore original global alpha
      ctx.globalAlpha = currentGlobalAlpha;
    });
  }

  /**
   * Draw buildings
   */
  public drawBuildings(
    ctx: CanvasRenderingContext2D,
    buildings: any[],
    scale: number,
    offset: { x: number, y: number },
    canvasWidth: number,
    canvasHeight: number,
    interactionState: any
  ): void {
    // Get current hover state
    const hoverState = hoverStateService.getState();
    
    buildings.forEach(building => {
      try {
        if (!building || !building.id || !building.position) return;
        
        // Get building position using buildingService singleton
        const worldPos = buildingService.getBuildingPosition(building);
        if (!worldPos) {
          return; // Skip this building if position can't be determined
        }
        
        // Convert world to screen coordinates
        const screen = CoordinateService.worldToScreen(
          worldPos.x, worldPos.y, scale, offset, canvasWidth, canvasHeight
        );
        
        // Get building size and color using buildingService singleton
        const size = buildingService.getBuildingSize(building.type);
        const color = buildingService.getBuildingColor(building.type);
        
        // Determine if this building is selected or hovered
        const isSelected = interactionState.selectedBuildingId === building.id;
        const isHovered = hoverState.type === 'building' && hoverState.id === building.id;
        
        // Determine the shape based on point_id or Point field
        const pointId = building.point_id || building.Point;
        let buildingShape: 'square' | 'circle' | 'triangle' = 'square'; // Default shape
          
        if (pointId) {
          if (typeof pointId === 'string') {
            if (pointId.startsWith('canal-') || pointId.includes('canal_')) {
              buildingShape = 'circle';
            } else if (pointId.startsWith('bridge-') || pointId.includes('bridge_')) {
              buildingShape = 'triangle';
            }
          }
        }
          
        // Draw the building
        const squareSize = Math.max(size.width, size.depth) * scale * 0.6;
        const typeIndicator = building.type.charAt(0).toUpperCase();
        
        // Determine the effective rotation:
        let effectiveRotation = building.rotation; // Default to building.rotation
        const isBridgeType = building.type && building.type.toLowerCase().includes('bridge');

        if (isBridgeType) {
          // If it's the bridge currently being oriented, use the live orientingBridgeAngle
          if (interactionState.selectedBridgeForOrientationId === building.id && interactionState.orientingBridgeAngle !== null) {
            effectiveRotation = interactionState.orientingBridgeAngle;
            // console.log(`[RenderService] Using orientingBridgeAngle ${effectiveRotation} for bridge ${building.id}`);
          } else if (typeof building.orientation === 'number') {
            // Otherwise, for bridges, prefer building.orientation if it exists
            effectiveRotation = building.orientation;
          }
          // If neither, building.rotation (already set as default) or undefined will be used.
        }
        
        // Pass effectiveRotation, building type, building category, and scale to drawBuilding
        this.drawBuilding(
          ctx, screen.x, screen.y, squareSize, color, typeIndicator, isSelected, buildingShape, isHovered, effectiveRotation, building.type, building.category, scale
        );
      } catch (error) {
        console.error(`Error drawing building ${building?.id || 'unknown'}:`, error);
      }
    });
  }

  /**
   * Draw empty building points
   */
  private drawEmptyBuildingPoints(
    ctx: CanvasRenderingContext2D,
    emptyBuildingPoints: any[],
    activeView: string,
    scale: number,
    offset: { x: number, y: number },
    canvasWidth: number,
    canvasHeight: number,
    interactionState: any
  ): void {
    if (emptyBuildingPoints.length === 0) return;
    
    emptyBuildingPoints.forEach(point => {
      // Convert lat/lng to world coordinates
      const world = CoordinateService.latLngToWorld(point.lat, point.lng);
      
      // Convert to screen coordinates
      const screen = CoordinateService.worldToScreen(
        world.x, world.y, scale, offset, canvasWidth, canvasHeight
      );
      
      // Draw a small circle for empty building points with subtle colors
      const pointSize = activeView === 'buildings' ? 2.2 * scale : 1.8 * scale; // Smaller in non-buildings views
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, pointSize, 0, Math.PI * 2);
  
      // Use a muted, earthy color that blends with the map
      // Make points more visible in buildings view, more subtle in other views
      const baseOpacity = activeView === 'buildings' ? 0.15 : 0.08;
      
      ctx.fillStyle = `rgba(160, 140, 120, ${baseOpacity})`;
      ctx.fill();
    });
  }

  /**
   * Draw dock and bridge points
   */
  private drawDockAndBridgePoints(
    ctx: CanvasRenderingContext2D,
    polygons: any[],
    activeView: string,
    scale: number,
    offset: { x: number, y: number },
    canvasWidth: number,
    canvasHeight: number,
    interactionState: any
  ): void {
    if (polygons.length === 0) return;
    
    // Get current hover state
    const hoverState = hoverStateService.getState();
    
    // Draw dock points with subtle styling
    polygons.forEach(polygon => {
      if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
        polygon.canalPoints.forEach((point: any) => {
          if (!point.edge) return;
          
          // Convert lat/lng to world coordinates
          const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
          
          // Convert to screen coordinates
          const screen = CoordinateService.worldToScreen(
            world.x, world.y, scale, offset, canvasWidth, canvasHeight
          );
          
          // Generate point ID
          const pointId = point.id || `canal-${point.edge.lat}-${point.edge.lng}`;
          
          // Check if this point is hovered
          const isHovered = hoverState.type === 'canalPoint' && hoverState.id === pointId;
          
          // Draw a small, semi-transparent circle for dock points
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, 2 * scale, 0, Math.PI * 2);
          
          // Use a subtle blue color with low opacity
          // Make points more visible in buildings view, more subtle in other views
          let baseOpacity = activeView === 'buildings' ? 0.3 : 0.15;
          
          // Increase opacity for hovered points
          if (isHovered) {
            baseOpacity = 0.8;
            ctx.fillStyle = `rgba(0, 180, 255, ${baseOpacity})`;
          } else {
            ctx.fillStyle = `rgba(0, 120, 215, ${baseOpacity})`;
          }
          
          ctx.fill();
          
          // Add a border
          if (isHovered) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = 'rgba(0, 120, 215, 0.4)';
            ctx.lineWidth = 0.5;
          }
          ctx.stroke();
        });
      }
      
      // Draw bridge points with subtle styling
      if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
        polygon.bridgePoints.forEach((point: any) => {
          if (!point.edge) return;
          
          // Convert lat/lng to world coordinates
          const world = CoordinateService.latLngToWorld(point.edge.lat, point.edge.lng);
          
          // Convert to screen coordinates
          const screen = CoordinateService.worldToScreen(
            world.x, world.y, scale, offset, canvasWidth, canvasHeight
          );
          
          // Generate point ID
          const pointId = point.id || `bridge-${point.edge.lat}-${point.edge.lng}`;
          
          // Check if this point is hovered
          const isHovered = hoverState.type === 'bridgePoint' && hoverState.id === pointId;
          
          // Draw a small, semi-transparent square for bridge points
          const pointSize = 2 * scale;
          
          // Use a subtle orange/brown color with low opacity
          // Make points more visible in buildings view, more subtle in other views
          let baseOpacity = activeView === 'buildings' ? 0.3 : 0.15;
          
          // Increase opacity for hovered points
          if (isHovered) {
            baseOpacity = 0.8;
            ctx.fillStyle = `rgba(220, 150, 80, ${baseOpacity})`;
          } else {
            ctx.fillStyle = `rgba(180, 120, 60, ${baseOpacity})`;
          }
          
          ctx.beginPath();
          ctx.rect(
            screen.x - pointSize/2, 
            screen.y - pointSize/2, 
            pointSize, 
            pointSize
          );
          ctx.fill();
          
          // Add a border
          if (isHovered) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = 'rgba(180, 120, 60, 0.4)';
            ctx.lineWidth = 0.5;
          }
          ctx.stroke();
        });
      }
    });
  }

  /**
   * Draw transport path
   */
  private drawTransportPath(
    ctx: CanvasRenderingContext2D,
    transportPath: any[],
    scale: number,
    offset: { x: number, y: number },
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (transportPath.length === 0) return;
    
    // First draw a subtle shadow/glow effect
    ctx.beginPath();

    // Start at the first point
    const firstPoint = transportPath[0];
    const firstWorld = CoordinateService.latLngToWorld(firstPoint.lat, firstPoint.lng);
    const firstScreen = CoordinateService.worldToScreen(
      firstWorld.x, firstWorld.y, scale, offset, canvasWidth, canvasHeight
    );

    ctx.moveTo(firstScreen.x, firstScreen.y);

    // Connect all points
    for (let i = 1; i < transportPath.length; i++) {
      const point = transportPath[i];
      const world = CoordinateService.latLngToWorld(point.lat, point.lng);
      const screen = CoordinateService.worldToScreen(
        world.x, world.y, scale, offset, canvasWidth, canvasHeight
      );

      ctx.lineTo(screen.x, screen.y);
    }

    // Style the path shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 6 * scale;
    ctx.stroke();

    // Now draw segments with different colors based on transport mode
    for (let i = 0; i < transportPath.length - 1; i++) {
      const point1 = transportPath[i];
      const point2 = transportPath[i + 1];

      const world1 = CoordinateService.latLngToWorld(point1.lat, point1.lng);
      const world2 = CoordinateService.latLngToWorld(point2.lat, point2.lng);
      
      const screen1 = CoordinateService.worldToScreen(
        world1.x, world1.y, scale, offset, canvasWidth, canvasHeight
      );
      const screen2 = CoordinateService.worldToScreen(
        world2.x, world2.y, scale, offset, canvasWidth, canvasHeight
      );

      // For gondola paths, draw simple lines with distinctive color
      if (point1.transportMode === 'gondola') {
        // Draw a simple path for gondolas
        ctx.beginPath();
        ctx.moveTo(screen1.x, screen1.y);
        ctx.lineTo(screen2.x, screen2.y);
        
        // Venetian blue for water transport
        ctx.strokeStyle = 'rgba(0, 102, 153, 0.8)';
        ctx.lineWidth = 4 * scale;
        ctx.stroke();
      } else {
        // For walking paths, draw straight lines with texture
        ctx.beginPath();
        ctx.moveTo(screen1.x, screen1.y);
        ctx.lineTo(screen2.x, screen2.y);

        // Terracotta for walking paths
        ctx.strokeStyle = 'rgba(204, 85, 0, 0.8)';
        ctx.lineWidth = 4 * scale;
        ctx.stroke();

        // Add a subtle texture for walking paths
        ctx.beginPath();
        ctx.setLineDash([2 * scale, 2 * scale]);
        ctx.moveTo(screen1.x, screen1.y);
        ctx.lineTo(screen2.x, screen2.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw waypoints with improved styling
    for (let i = 0; i < transportPath.length; i++) {
      // Skip intermediate points for cleaner visualization
      if (transportPath[i].isIntermediatePoint) continue;

      const point = transportPath[i];
      const world = CoordinateService.latLngToWorld(point.lat, point.lng);
      const screen = CoordinateService.worldToScreen(
        world.x, world.y, scale, offset, canvasWidth, canvasHeight
      );

      // Determine node size based on type
      let nodeSize = 2.5 * scale;
      let nodeColor = 'rgba(218, 165, 32, 0.7)'; // Default gold

      // Color and size based on node type
      if (point.type === 'bridge') {
        nodeSize = 3 * scale;
        nodeColor = 'rgba(180, 100, 50, 0.8)'; // Brown for bridges
      } else if (point.type === 'building') {
        nodeSize = 3 * scale;
        nodeColor = 'rgba(70, 130, 180, 0.8)'; // Steel blue for buildings
      } else if (point.type === 'centroid') {
        nodeSize = 2 * scale;
        nodeColor = 'rgba(0, 102, 153, 0.7)'; // Venetian blue for centroids
      } else if (point.type === 'canal') {
        nodeSize = 3 * scale;
        nodeColor = 'rgba(0, 150, 200, 0.8)'; // Bright blue for canal points
      }

      // Draw a small circle for each waypoint
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, nodeSize, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();

      // Add a subtle white border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }


  /**
   * Draw coat of arms
   */
  private drawCoatOfArms(
    ctx: CanvasRenderingContext2D,
    polygonsToRender: any[],
    coatOfArmsImageUrls: Record<string, HTMLImageElement>,
    renderedCoatOfArmsCache: Record<string, {image: HTMLImageElement | null, x: number, y: number, size: number}>,
    scale: number // Added scale parameter
  ): void {
    polygonsToRender.forEach(({ polygon, centerX, centerY }) => {
      // Check if polygon has an owner
      if (!polygon.owner) return;
      
      // Use a size that scales with the map
      const size = 50 * scale; // Now uses the passed scale
      
      // Use the owner's username for the coat of arms
      const ownerUsername = polygon.owner;
      
      // Check if we already rendered this coat of arms at this position and size
      const cacheKey = `${ownerUsername}_${Math.round(centerX)}_${Math.round(centerY)}_${size}`;
      const cachedCoatOfArms = renderedCoatOfArmsCache[cacheKey];
      
      if (cachedCoatOfArms) {
        // Use the cached version if available
        if (cachedCoatOfArms.image) {
          this.createCircularImage(ctx, cachedCoatOfArms.image, centerX, centerY, size);
        } else {
          this.createDefaultCircularAvatar(ctx, ownerUsername, centerX, centerY, size);
        }
      } else {
        // Check if we have a coat of arms image for this owner
        if (ownerUsername in coatOfArmsImageUrls && coatOfArmsImageUrls[ownerUsername]) {
          // Draw circular coat of arms with error handling
          try {
            this.createCircularImage(ctx, coatOfArmsImageUrls[ownerUsername], centerX, centerY, size);
            // Cache the result
            renderedCoatOfArmsCache[cacheKey] = {
              image: coatOfArmsImageUrls[ownerUsername],
              x: centerX,
              y: centerY,
              size
            };
          } catch (error) {
            console.error(`Error rendering coat of arms for ${ownerUsername}:`, error);
            // Fallback to default avatar
            this.createDefaultCircularAvatar(ctx, ownerUsername, centerX, centerY, size);
            // Cache the fallback
            renderedCoatOfArmsCache[cacheKey] = {
              image: null,
              x: centerX,
              y: centerY,
              size
            };
          }
        } else {
          // Draw default avatar with initial
          this.createDefaultCircularAvatar(ctx, ownerUsername, centerX, centerY, size);
          // Cache the default avatar
          renderedCoatOfArmsCache[cacheKey] = {
            image: null,
            x: centerX,
            y: centerY,
            size
          };
        }
      }
    });
  }

  /**
   * Helper function to lighten a color
   */
  public lightenColor(color: string, percent: number): string {
    // If color doesn't start with #, return a default color
    if (!color.startsWith('#')) {
      return '#FF00FF'; // Bright magenta as fallback
    }
    
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  }

  /**
   * Helper function to darken a color
   */
  public darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    
    return '#' + (
      0x1000000 +
      (R > 0 ? (R < 255 ? R : 255) : 0) * 0x10000 +
      (G > 0 ? (G < 255 ? G : 255) : 0) * 0x100 +
      (B > 0 ? (B < 255 ? B : 255) : 0)
    ).toString(16).slice(1);
  }

  /**
   * Check if a point is inside a polygon
   */
  public isPointInPolygon(x: number, y: number, polygon: {x: number, y: number}[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

// Export a singleton instance
export const renderService = new RenderService();
