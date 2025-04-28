import { Island, Canal, Point, VeniceConfig, createSmoothPath } from './utils';

export function generateIslands(canals: Canal[], config: VeniceConfig): Island[] {
  const islands: Island[] = [];
  
  // Create a grid of potential island centers
  const gridSize = 50; // Increase grid size to reduce island density
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
      // Add some randomness to grid positions
      const jitteredX = x + (Math.random() * gridSize * 0.5);
      const jitteredY = y + (Math.random() * gridSize * 0.5);
      potentialCenters.push({ x: jitteredX, y: jitteredY });
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
        
        if (distance < canal.width * 2.5) { // Increased minimum distance from canals
          tooClose = true;
          break;
        }
      }
      
      if (tooClose) break;
    }
    
    // Also check if it's too close to existing islands to prevent overlap
    if (!tooClose) {
      for (const island of islands) {
        const distance = Math.sqrt(
          Math.pow(center.x - island.points[0].x, 2) + 
          Math.pow(center.y - island.points[0].y, 2)
        );
        
        // Prevent islands from being too close to each other
        if (distance < 60) {
          tooClose = true;
          break;
        }
      }
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
  // Determine island size with more variety
  const baseSize = isCampo ? 
    30 + Math.random() * 15 : // Campos are larger
    15 + Math.random() * 20;  // Regular islands have more size variety
  
  const size = baseSize * (0.8 + Math.random() * 0.4);
  
  // Create a polygon with random points around the center
  const numPoints = 6 + Math.floor(Math.random() * 6); // More variety in point count
  const points: Point[] = [];
  
  // Create more varied island shapes
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    // More variation in radius to create more irregular shapes
    const radius = size * (0.7 + Math.random() * 0.6);
    
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  
  // Apply erosion to the edges
  const erodedPoints = applyErosion(points, config.erosionFactor * 1.5); // More erosion
  
  // Create SVG path
  let pathString = `M ${erodedPoints[0].x} ${erodedPoints[0].y}`;
  
  for (let i = 1; i < erodedPoints.length; i++) {
    pathString += ` L ${erodedPoints[i].x} ${erodedPoints[i].y}`;
  }
  
  pathString += ' Z';
  
  // Different fill for campos vs regular islands with more variety
  // Use the pattern textures we defined
  const fill = isCampo ? 'url(#campoTexture)' : 'url(#islandTexture)';
  
  // Add building details with more variety
  let buildingDetails = '';
  
  if (!isCampo) {
    // Add some building rectangles with more variety
    const buildingCount = Math.floor(3 + Math.random() * 5);
    const buildingColors = ['#c4baa8', '#b3aa94', '#d4cebf', '#a39b8c'];
    
    for (let i = 0; i < buildingCount; i++) {
      const bWidth = 4 + Math.random() * 10;
      const bHeight = 4 + Math.random() * 10;
      
      // Distribute buildings better across the island
      const distFromCenter = Math.random() * size * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const bx = center.x + Math.cos(angle) * distFromCenter;
      const by = center.y + Math.sin(angle) * distFromCenter;
      
      // Random rotation for buildings
      const rotation = Math.floor(Math.random() * 360);
      const colorIndex = Math.floor(Math.random() * buildingColors.length);
      
      buildingDetails += `<rect x="${bx - bWidth/2}" y="${by - bHeight/2}" 
                          width="${bWidth}" height="${bHeight}" 
                          fill="${buildingColors[colorIndex]}" 
                          stroke="#a39b8c" stroke-width="0.5"
                          transform="rotate(${rotation} ${bx} ${by})" />`;
    }
  } else if (isCampo) {
    // Add a central feature for campos with more detail
    buildingDetails += `<circle cx="${center.x}" cy="${center.y}" r="${size/5}" 
                        fill="#c4baa8" stroke="#a39b8c" stroke-width="0.5" />`;
    
    // Add some decorative elements to the campo
    const smallFeatures = Math.floor(2 + Math.random() * 4);
    for (let i = 0; i < smallFeatures; i++) {
      const featureSize = 2 + Math.random() * 4;
      const angle = Math.random() * Math.PI * 2;
      const distance = size * 0.3 + Math.random() * (size * 0.2);
      const fx = center.x + Math.cos(angle) * distance;
      const fy = center.y + Math.sin(angle) * distance;
      
      buildingDetails += `<circle cx="${fx}" cy="${fy}" r="${featureSize}" 
                          fill="#b3aa94" stroke="#a39b8c" stroke-width="0.3" />`;
    }
  }
  
  return {
    points: erodedPoints,
    isCampo,
    svgPath: `<path d="${pathString}" fill="${fill}" stroke="#b3aa94" stroke-width="1" />${buildingDetails}`
  };
}

function applyErosion(points: Point[], erosionFactor: number): Point[] {
  const result: Point[] = [];
  
  // For each pair of points, add some intermediate points with noise
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    
    result.push(p1);
    
    // Add 2-4 intermediate points with noise for more detailed coastlines
    const numIntermediatePoints = 2 + Math.floor(Math.random() * 3);
    
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
