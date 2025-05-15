/**
 * RenderService
 * Handles canvas drawing operations for the isometric view
 */

export class RenderService {
  /**
   * Draw a polygon on the canvas
   */
  public drawPolygon(
    ctx: CanvasRenderingContext2D,
    coords: {x: number, y: number}[],
    fillColor: string,
    isHovered: boolean = false,
    isSelected: boolean = false
  ): void {
    if (!coords || coords.length < 3) return;

    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.closePath();
    
    // Apply different styles for hover and selected states
    if (isSelected) {
      // Selected state: much brighter with a thicker border
      ctx.fillStyle = this.lightenColor(fillColor, 35); // Increased brightness for selection
      ctx.fill();
      ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
      ctx.lineWidth = 3.5;
    } else if (isHovered) {
      // Hover state: significantly brighter with a more vibrant border
      ctx.fillStyle = this.lightenColor(fillColor, 25); // Increased brightness for hover
      ctx.fill();
      ctx.strokeStyle = '#FFCC00'; // Bright yellow for hover
      ctx.lineWidth = 3; // Thicker border
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
    isHovered: boolean = false,
    isSelected: boolean = false,
    shape: 'square' | 'circle' | 'triangle' = 'square'
  ): void {
    // Apply different styles for hover and selected states
    if (isSelected) {
      // Selected state: much brighter with a thicker border
      ctx.fillStyle = this.lightenColor(color, 35); // Increased brightness for selection
      ctx.strokeStyle = '#FF3300'; // Bright red-orange for selected
      ctx.lineWidth = 3.5;
    } else if (isHovered) {
      // Make hover state MUCH more dramatic
      ctx.fillStyle = '#FF00FF'; // Bright magenta for hover - very obvious
      ctx.strokeStyle = '#FFFF00'; // Bright yellow border
      ctx.lineWidth = 5; // Extra thick border
    } else {
      // Normal state
      ctx.fillStyle = color;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
    }
    
    // Draw the appropriate shape based on the building's point type
    ctx.beginPath();
    
    if (shape === 'circle') {
      // Draw circle for canal points
      ctx.arc(x, y, size/2, 0, Math.PI * 2);
    } else if (shape === 'triangle') {
      // Draw triangle for bridge points
      const halfSize = size/2;
      ctx.moveTo(x, y - halfSize);
      ctx.lineTo(x - halfSize, y + halfSize);
      ctx.lineTo(x + halfSize, y + halfSize);
      ctx.closePath();
    } else {
      // Draw square for regular building points (default)
      ctx.rect(
        x - size/2, 
        y - size/2, 
        size, 
        size
      );
    }
    
    ctx.fill();
    ctx.stroke();
    
    // Add a small indicator for the building type with fixed font size
    ctx.fillStyle = isHovered ? '#FFFFFF' : '#000'; // White text on hover for better visibility
    ctx.font = `10px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typeIndicator, x, y);
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
    // Determine color based on social class
    const getSocialClassColor = (socialClass: string): string => {
      const baseClass = socialClass?.toLowerCase() || '';
      
      // Base colors for different social classes
      if (baseClass.includes('nobili')) {
        // Gold/yellow for nobility
        return markerType === 'home' 
          ? (isHovered ? 'rgba(255, 215, 0, 0.9)' : 'rgba(218, 165, 32, 0.8)')
          : (isHovered ? 'rgba(255, 215, 0, 0.9)' : 'rgba(218, 165, 32, 0.8)');
      } else if (baseClass.includes('cittadini')) {
        // Blue for citizens
        return markerType === 'home' 
          ? (isHovered ? 'rgba(70, 130, 180, 0.9)' : 'rgba(70, 130, 180, 0.8)')
          : (isHovered ? 'rgba(70, 130, 180, 0.9)' : 'rgba(70, 130, 180, 0.8)');
      } else if (baseClass.includes('popolani')) {
        // Brown/amber for common people
        return markerType === 'home' 
          ? (isHovered ? 'rgba(205, 133, 63, 0.9)' : 'rgba(205, 133, 63, 0.8)')
          : (isHovered ? 'rgba(205, 133, 63, 0.9)' : 'rgba(205, 133, 63, 0.8)');
      } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
        // Gray for laborers
        return markerType === 'home' 
          ? (isHovered ? 'rgba(128, 128, 128, 0.9)' : 'rgba(128, 128, 128, 0.8)')
          : (isHovered ? 'rgba(128, 128, 128, 0.9)' : 'rgba(128, 128, 128, 0.8)');
      }
      
      // Default colors if social class is unknown or not matched
      return markerType === 'home' 
        ? (isHovered ? 'rgba(120, 170, 255, 0.9)' : 'rgba(100, 150, 255, 0.8)')
        : (isHovered ? 'rgba(255, 170, 120, 0.9)' : 'rgba(255, 150, 100, 0.8)');
    };

    // Get color based on social class
    const fillColor = getSocialClassColor(citizen.SocialClass || citizen.socialClass);

    // Draw a circular background with color based on social class
    ctx.beginPath();
    ctx.arc(x, y, size + (isHovered ? 2 : 0), 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    
    // Add a white border, thicker when hovered
    ctx.strokeStyle = isHovered ? '#FFFF00' : '#FFFFFF';
    ctx.lineWidth = isHovered ? 3 : 2;
    ctx.stroke();
    
    // Add the citizen's initials
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Get the first letters of the first and last name
    const firstInitial = (citizen.FirstName || citizen.firstName || '').charAt(0).toUpperCase();
    const lastInitial = (citizen.LastName || citizen.lastName || '').charAt(0).toUpperCase();
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
