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
  
  return canals;
}

function createGrandCanal(width: number, height: number, config: VeniceConfig): Canal {
  // Create an S-shaped grand canal
  const controlPoints: Point[] = [
    { x: width * 0.1, y: height * 0.5 },
    { x: width * 0.3, y: height * 0.4 },
    { x: width * 0.5, y: height * 0.6 },
    { x: width * 0.7, y: height * 0.4 },
    { x: width * 0.9, y: height * 0.5 }
  ];
  
  // Add some noise to make it more organic
  const noisyPoints = addNoise(controlPoints, width * 0.03);
  
  // Interpolate more points for smoother curve
  const points: Point[] = [];
  for (let i = 0; i < noisyPoints.length - 1; i++) {
    const p1 = noisyPoints[i];
    const p2 = noisyPoints[i + 1];
    
    points.push(p1);
    
    // Add intermediate points
    for (let j = 1; j < 5; j++) {
      const t = j / 5;
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
    width: width * 0.05, // Grand Canal is wider
    svgPath: `<path d="${pathString}" stroke="#6ba4c9" stroke-width="${width * 0.05}" fill="none" />`
  };
}

function createSecondaryCanals(
  width: number, 
  height: number, 
  grandCanal: Canal, 
  config: VeniceConfig
): Canal[] {
  const canals: Canal[] = [];
  const numCanals = Math.floor(4 + Math.random() * 3); // 4-6 secondary canals
  
  // Create canals that branch off from the grand canal
  for (let i = 0; i < numCanals; i++) {
    // Pick a point on the grand canal to branch from
    const index = Math.floor(grandCanal.points.length * (0.2 + 0.6 * i / numCanals));
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
    
    // Alternate sides
    const side = i % 2 === 0 ? 1 : -1;
    
    // Create canal points
    const canalPoints: Point[] = [startPoint];
    const canalLength = width * (0.2 + Math.random() * 0.2);
    const segments = 5;
    
    for (let j = 1; j <= segments; j++) {
      const t = j / segments;
      const noise = (Math.random() * 2 - 1) * width * 0.03;
      
      canalPoints.push({
        x: startPoint.x + dirX * side * canalLength * t + noise,
        y: startPoint.y + dirY * side * canalLength * t + noise
      });
    }
    
    const pathString = createSmoothPath(canalPoints);
    
    canals.push({
      points: canalPoints,
      width: width * 0.025, // Secondary canals are narrower
      svgPath: `<path d="${pathString}" stroke="#6ba4c9" stroke-width="${width * 0.025}" fill="none" />`
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
  const numCanals = Math.floor(10 + config.canalDensity * 10);
  
  for (let i = 0; i < numCanals; i++) {
    // Select two random points from existing canals to connect
    const canal1 = existingCanals[Math.floor(Math.random() * existingCanals.length)];
    const canal2 = existingCanals[Math.floor(Math.random() * existingCanals.length)];
    
    if (canal1 === canal2) continue;
    
    const point1 = canal1.points[Math.floor(Math.random() * canal1.points.length)];
    const point2 = canal2.points[Math.floor(Math.random() * canal2.points.length)];
    
    // Don't create canals that are too short
    const distance = Math.sqrt(
      Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2)
    );
    
    if (distance < width * 0.1) continue;
    
    // Create a curved path between the points
    const midPoint = {
      x: (point1.x + point2.x) / 2 + (Math.random() * 2 - 1) * width * 0.1,
      y: (point1.y + point2.y) / 2 + (Math.random() * 2 - 1) * height * 0.1
    };
    
    const canalPoints = [
      point1,
      {
        x: (point1.x + midPoint.x) / 2 + (Math.random() * 2 - 1) * width * 0.02,
        y: (point1.y + midPoint.y) / 2 + (Math.random() * 2 - 1) * height * 0.02
      },
      midPoint,
      {
        x: (midPoint.x + point2.x) / 2 + (Math.random() * 2 - 1) * width * 0.02,
        y: (midPoint.y + point2.y) / 2 + (Math.random() * 2 - 1) * height * 0.02
      },
      point2
    ];
    
    const pathString = createSmoothPath(canalPoints);
    
    canals.push({
      points: canalPoints,
      width: width * 0.015, // Tertiary canals are the narrowest
      svgPath: `<path d="${pathString}" stroke="#6ba4c9" stroke-width="${width * 0.015}" fill="none" />`
    });
  }
  
  return canals;
}
