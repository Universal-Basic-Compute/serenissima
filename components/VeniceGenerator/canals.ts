import { Canal, Point, VeniceConfig, createSmoothPath, addNoise, linesIntersect } from './utils';

export function generateCanals(width: number, height: number, config: VeniceConfig): Canal[] {
  const canals: Canal[] = [];
  
  // Create main Grand Canal
  const grandCanal = createGrandCanal(width, height, config);
  canals.push(grandCanal);
  
  // Create secondary canals
  const secondaryCanals = createSecondaryCanals(width, height, grandCanal, config);
  canals.push(...secondaryCanals);
  
  // Create smaller connecting canals
  const tertiaryCanals = createTertiaryCanals(width, height, [...secondaryCanals, grandCanal], config);
  canals.push(...tertiaryCanals);
  
  // Create additional small canals
  const quaternaryCanals = createQuaternaryCanals(width, height, [...tertiaryCanals, ...secondaryCanals, grandCanal], config);
  canals.push(...quaternaryCanals);
  
  // Add even more fine canals (new)
  const fineCanals = createFineCanals(width, height, [...quaternaryCanals, ...tertiaryCanals, ...secondaryCanals, grandCanal], config);
  canals.push(...fineCanals);
  
  return canals;
}

// Add a new function to create even finer canals
function createFineCanals(
  width: number,
  height: number,
  existingCanals: Canal[],
  config: VeniceConfig
): Canal[] {
  const canals: Canal[] = [];
  const numCanals = Math.floor(30 + config.canalDensity * 20); // Many fine canals
  
  // Create a grid of potential canal start points focused on the center
  const gridSize = width / 12; // Smaller grid for more potential points
  const potentialPoints: Point[] = [];
  
  // Calculate center of the map
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  existingCanals.forEach(canal => {
    canal.points.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Focus heavily on the center area
  for (let x = centerX - width * 0.4; x < centerX + width * 0.4; x += gridSize) {
    for (let y = centerY - height * 0.4; y < centerY + height * 0.4; y += gridSize) {
      // Calculate distance from center (normalized 0-1)
      const distFromCenter = Math.sqrt(
        Math.pow((x - centerX) / (width * 0.4), 2) + 
        Math.pow((y - centerY) / (height * 0.4), 2)
      );
      
      // Higher probability near center
      if (Math.random() > distFromCenter * 0.7) {
        potentialPoints.push({
          x: x + (Math.random() * gridSize * 0.8),
          y: y + (Math.random() * gridSize * 0.8)
        });
      }
    }
  }
  
  // For each potential point, try to create a small canal
  for (let i = 0; i < Math.min(numCanals, potentialPoints.length); i++) {
    const startPoint = potentialPoints[i];
    
    // Find the closest canal
    let closestCanal: Canal | null = null;
    let closestPoint: Point | null = null;
    let minDistance = Infinity;
    
    for (const canal of existingCanals) {
      for (const point of canal.points) {
        const distance = Math.sqrt(
          Math.pow(startPoint.x - point.x, 2) + Math.pow(startPoint.y - point.y, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestCanal = canal;
          closestPoint = point;
        }
      }
    }
    
    // If we found a close canal and the distance is reasonable
    if (closestCanal && closestPoint && minDistance < width * 0.12 && minDistance > width * 0.02) {
      // Create a small canal from the point to the closest canal
      const angle = Math.atan2(
        closestPoint.y - startPoint.y,
        closestPoint.x - startPoint.x
      );
      
      // Create a slightly curved path
      const midPoint = {
        x: startPoint.x + (closestPoint.x - startPoint.x) * 0.5 + (Math.random() * 2 - 1) * width * 0.015,
        y: startPoint.y + (closestPoint.y - startPoint.y) * 0.5 + (Math.random() * 2 - 1) * height * 0.015
      };
      
      const canalPoints = [
        startPoint,
        midPoint,
        closestPoint
      ];
      
      const pathString = createSmoothPath(canalPoints);
      
      canals.push({
        points: canalPoints,
        width: width * 0.003, // Very thin canals
        svgPath: `<path d="${pathString}" stroke="#a4cbe8" stroke-width="${width * 0.003}" fill="none" />`
      });
    }
  }
  
  return canals;
}

function createGrandCanal(width: number, height: number, config: VeniceConfig): Canal {
  // Create a more curved S-shaped grand canal
  const controlPoints: Point[] = [
    { x: width * 0.05, y: height * 0.5 },
    { x: width * 0.2, y: height * 0.3 },  // More extreme curve
    { x: width * 0.5, y: height * 0.7 },  // More extreme curve
    { x: width * 0.8, y: height * 0.3 },  // More extreme curve
    { x: width * 0.95, y: height * 0.5 }
  ];
  
  // Less noise for smoother curves
  const noisyPoints = addNoise(controlPoints, width * 0.01); // Reduced noise further
  
  // Interpolate more points for smoother curve
  const points: Point[] = [];
  for (let i = 0; i < noisyPoints.length - 1; i++) {
    const p1 = noisyPoints[i];
    const p2 = noisyPoints[i + 1];
    
    points.push(p1);
    
    // Add more intermediate points for smoother curves
    for (let j = 1; j < 12; j++) { // Increased from 8 to 12 for smoother curves
      const t = j / 12;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
      });
    }
  }
  points.push(noisyPoints[noisyPoints.length - 1]);
  
  const pathString = createSmoothPath(points);
  
  return {
    points,
    width: width * 0.035, // Increased from 0.015 to 0.035 (more than doubled)
    svgPath: `<path d="${pathString}" stroke="#a4cbe8" stroke-width="${width * 0.035}" fill="none" />`
  };
}

function createSecondaryCanals(
  width: number, 
  height: number, 
  grandCanal: Canal, 
  config: VeniceConfig
): Canal[] {
  const canals: Canal[] = [];
  const numCanals = Math.floor(8 + Math.random() * 4); // Increased from 6 to 8
  
  // Create canals that branch off from the grand canal
  for (let i = 0; i < numCanals; i++) {
    // Pick a point on the grand canal to branch from
    const index = Math.floor(grandCanal.points.length * (0.1 + 0.8 * i / numCanals));
    const startPoint = grandCanal.points[index];
    
    // Determine direction (left or right of grand canal)
    const prevPoint = grandCanal.points[Math.max(0, index - 1)];
    const nextPoint = grandCanal.points[Math.min(grandCanal.points.length - 1, index + 1)];
    
    // Calculate perpendicular direction
    const dx = nextPoint.x - prevPoint.x;
    const dy = nextPoint.y - prevPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize and rotate 90 degrees
    const dirX = -dy / length;
    const dirY = dx / length;
    
    // Alternate sides with some randomness
    const side = (i % 2 === 0 || Math.random() < 0.3) ? 1 : -1;
    
    // Create canal points
    const canalPoints: Point[] = [startPoint];
    const canalLength = width * (0.25 + Math.random() * 0.35); // Longer canals
    const segments = 8 + Math.floor(Math.random() * 4); // More segments for smoother curves
    
    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      // Less noise for smoother shapes
      const noise = (Math.random() * 2 - 1) * width * 0.02; // Reduced from 0.04
      
      canalPoints.push({
        x: startPoint.x + dirX * side * canalLength * t + noise,
        y: startPoint.y + dirY * side * canalLength * t + noise
      });
    }
    
    const pathString = createSmoothPath(canalPoints);
    
    canals.push({
      points: canalPoints,
      width: width * 0.008, // Reduced from 0.01 to 0.008
      svgPath: `<path d="${pathString}" stroke="#a4cbe8" stroke-width="${width * 0.008}" fill="none" />`
    });
  }
  
  return canals;
}

function createTertiaryCanals(
  width: number, 
  height: number, 
  existingCanals: Canal[], 
  config: VeniceConfig
): Canal[] {
  const canals: Canal[] = [];
  const numCanals = Math.floor(20 + config.canalDensity * 15); // Increased from 15 to 20
  
  for (let i = 0; i < numCanals; i++) {
    // Select two random points from existing canals to connect
    const canal1 = existingCanals[Math.floor(Math.random() * existingCanals.length)];
    let canal2 = existingCanals[Math.floor(Math.random() * existingCanals.length)];
    
    // Try to find a different second canal
    let attempts = 0;
    while (canal1 === canal2 && attempts < 5) {
      canal2 = existingCanals[Math.floor(Math.random() * existingCanals.length)];
      attempts++;
    }
    
    if (canal1 === canal2) continue;
    
    const point1 = canal1.points[Math.floor(Math.random() * canal1.points.length)];
    const point2 = canal2.points[Math.floor(Math.random() * canal2.points.length)];
    
    // Don't create canals that are too short
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
    );
    
    if (distance < width * 0.1 || distance > width * 0.5) continue; // Allow longer canals
    
    // Create a curved path between the points with more control points for smoothness
    const canalPoints = [point1];
    
    // Add more intermediate points for smoother curves
    const numIntermediatePoints = 3 + Math.floor(Math.random() * 2);
    for (let j = 1; j <= numIntermediatePoints; j++) {
      const t = j / (numIntermediatePoints + 1);
      // Less noise for smoother curves
      const noiseX = (Math.random() * 2 - 1) * width * 0.03;
      const noiseY = (Math.random() * 2 - 1) * height * 0.03;
      
      canalPoints.push({
        x: point1.x + (point2.x - point1.x) * t + noiseX,
        y: point1.y + (point2.y - point1.y) * t + noiseY
      });
    }
    
    canalPoints.push(point2);
    
    const pathString = createSmoothPath(canalPoints);
    
    canals.push({
      points: canalPoints,
      width: width * 0.005, // Reduced from 0.007 to 0.005
      svgPath: `<path d="${pathString}" stroke="#a4cbe8" stroke-width="${width * 0.005}" fill="none" />`
    });
  }
  
  return canals;
}
// New function to create even more small canals
function createQuaternaryCanals(
  width: number,
  height: number,
  existingCanals: Canal[],
  config: VeniceConfig
): Canal[] {
  const canals: Canal[] = [];
  const numCanals = Math.floor(25 + config.canalDensity * 15); // Increased from 15 to 25
  
  // Create a grid of potential canal start points
  const gridSize = width / 8;
  const potentialPoints: Point[] = [];
  
  // Calculate center of the map
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  existingCanals.forEach(canal => {
    canal.points.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });
  
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Focus more on the center area
  for (let x = centerX - width * 0.3; x < centerX + width * 0.3; x += gridSize) {
    for (let y = centerY - height * 0.3; y < centerY + height * 0.3; y += gridSize) {
      potentialPoints.push({
        x: x + (Math.random() * gridSize * 0.8),
        y: y + (Math.random() * gridSize * 0.8)
      });
    }
  }
  
  // For each potential point, try to create a small canal
  for (let i = 0; i < Math.min(numCanals, potentialPoints.length); i++) {
    const startPoint = potentialPoints[i];
    
    // Find the closest canal
    let closestCanal: Canal | null = null;
    let closestPoint: Point | null = null;
    let minDistance = Infinity;
    
    for (const canal of existingCanals) {
      for (const point of canal.points) {
        const distance = Math.sqrt(
          Math.pow(startPoint.x - point.x, 2) + Math.pow(startPoint.y - point.y, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestCanal = canal;
          closestPoint = point;
        }
      }
    }
    
    // If we found a close canal and the distance is reasonable
    if (closestCanal && closestPoint && minDistance < width * 0.15 && minDistance > width * 0.03) {
      // Create a small canal from the point to the closest canal
      const angle = Math.atan2(
        closestPoint.y - startPoint.y,
        closestPoint.x - startPoint.x
      );
      
      // Create a slightly curved path
      const midPoint = {
        x: startPoint.x + (closestPoint.x - startPoint.x) * 0.5 + (Math.random() * 2 - 1) * width * 0.02,
        y: startPoint.y + (closestPoint.y - startPoint.y) * 0.5 + (Math.random() * 2 - 1) * height * 0.02
      };
      
      const canalPoints = [
        startPoint,
        midPoint,
        closestPoint
      ];
      
      const pathString = createSmoothPath(canalPoints);
      
      canals.push({
        points: canalPoints,
        width: width * 0.004, // Reduced from 0.005 to 0.004
        svgPath: `<path d="${pathString}" stroke="#a4cbe8" stroke-width="${width * 0.004}" fill="none" />`
      });
    }
  }
  
  return canals;
}
