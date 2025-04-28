import { Island, Canal, Point, VeniceConfig, createSmoothPath } from './utils';

export function generateIslands(canals: Canal[], config: VeniceConfig): Island[] {
  const islands: Island[] = [];
  
  // Create a grid of potential island centers
  const gridSize = 50;
  const potentialCenters: Point[] = [];
  
  // Get the bounds from canals
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  canals.forEach(canal => {
    canal.points.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });
  
  // Add some padding
  minX -= 50;
  minY -= 50;
  maxX += 50;
  maxY += 50;
  
  // Create grid of potential island centers
  for (let x = minX; x <= maxX; x += gridSize) {
    for (let y = minY; y <= maxY; y += gridSize) {
      potentialCenters.push({ x, y });
    }
  }
  
  // For each potential center, check if it's not too close to a canal
  potentialCenters.forEach(center => {
    // Check distance to nearest canal
    let tooClose = false;
    
    for (const canal of canals) {
      for (const point of canal.points) {
        const distance = Math.sqrt(
          Math.pow(center.x - point.x, 2) + Math.pow(center.y - point.y, 2)
        );
        
        if (distance < canal.width * 1.5) {
          tooClose = true;
          break;
        }
      }
      
      if (tooClose) break;
    }
    
    if (!tooClose) {
      // Create an island around this center
      const isCampo = Math.random() < config.campoFrequency;
      const island = createIsland(center, canals, isCampo, config);
      islands.push(island);
    }
  });
  
  return islands;
}

function createIsland(
  center: Point, 
  canals: Canal[], 
  isCampo: boolean, 
  config: VeniceConfig
): Island {
  // Determine island size
  const baseSize = isCampo ? 40 : 30;
  const size = baseSize + Math.random() * 20;
  
  // Create a polygon with random points around the center
  const numPoints = 8 + Math.floor(Math.random() * 5);
  const points: Point[] = [];
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const radius = size * (0.8 + Math.random() * 0.4);
    
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  
  // Apply erosion to the edges
  const erodedPoints = applyErosion(points, config.erosionFactor);
  
  // Create SVG path
  let pathString = `M ${erodedPoints[0].x} ${erodedPoints[0].y}`;
  
  for (let i = 1; i < erodedPoints.length; i++) {
    pathString += ` L ${erodedPoints[i].x} ${erodedPoints[i].y}`;
  }
  
  pathString += ' Z';
  
  // Different fill for campos vs regular islands
  const fill = isCampo ? '#e9e5dc' : '#d4cebf';
  
  return {
    points: erodedPoints,
    isCampo,
    svgPath: `<path d="${pathString}" fill="${fill}" stroke="#b3aa94" stroke-width="1" />`
  };
}

function applyErosion(points: Point[], erosionFactor: number): Point[] {
  const result: Point[] = [];
  
  // For each pair of points, add some intermediate points with noise
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    
    result.push(p1);
    
    // Add 1-3 intermediate points with noise
    const numIntermediatePoints = 1 + Math.floor(Math.random() * 3);
    
    for (let j = 1; j <= numIntermediatePoints; j++) {
      const t = j / (numIntermediatePoints + 1);
      const noise = erosionFactor * (Math.random() * 2 - 1) * 10;
      
      result.push({
        x: p1.x + (p2.x - p1.x) * t + noise,
        y: p1.y + (p2.y - p1.y) * t + noise
      });
    }
  }
  
  return result;
}
