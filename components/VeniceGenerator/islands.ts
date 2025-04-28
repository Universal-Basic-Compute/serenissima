import { Island, Canal, Point, VeniceConfig, createSmoothPath } from './utils';

export function generateIslands(canals: Canal[], config: VeniceConfig): Island[] {
  const islands: Island[] = [];
  
  // Create a grid of potential island centers
  const gridSize = 60; // Larger grid size for fewer islands
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
  
  // Calculate center of the map
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  
  // Add some padding
  minX -= 50;
  minY -= 50;
  maxX += 50;
  maxY += 50;
  
  // Create grid of potential island centers with higher density near the center
  for (let x = minX; x <= maxX; x += gridSize) {
    for (let y = minY; y <= maxY; y += gridSize) {
      // Calculate distance from center (normalized 0-1)
      const distFromCenter = Math.sqrt(
        Math.pow((x - centerX) / (maxX - minX), 2) + 
        Math.pow((y - centerY) / (maxY - minY), 2)
      );
      
      // Higher probability of islands near the center
      if (Math.random() > distFromCenter * 0.8) {
        // Add some randomness to grid positions
        const jitteredX = x + (Math.random() * gridSize * 0.7);
        const jitteredY = y + (Math.random() * gridSize * 0.7);
        potentialCenters.push({ x: jitteredX, y: jitteredY });
      }
    }
  }
  
  // For each potential center, check if it's not too close to a canal
  potentialCenters.forEach(center => {
    // Check distance to nearest canal
    let tooClose = false;
    let nearestCanalDist = Infinity;
    let nearestCanal = null;
    
    for (const canal of canals) {
      for (const point of canal.points) {
        const distance = Math.sqrt(
          Math.pow(center.x - point.x, 2) + Math.pow(center.y - point.y, 2)
        );
        
        if (distance < nearestCanalDist) {
          nearestCanalDist = distance;
          nearestCanal = canal;
        }
        
        if (distance < canal.width * 1.8) { // Reduced minimum distance from canals
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
        // Allow smaller distances for smaller islands
        const minDistance = 40 + (island.points.length > 10 ? 30 : 0);
        if (distance < minDistance) {
          tooClose = true;
          break;
        }
      }
    }
    
    if (!tooClose) {
      // Create an island around this center
      const isCampo = Math.random() < config.campoFrequency;
      
      // Size variation based on distance from center
      const distFromCenter = Math.sqrt(
        Math.pow(center.x - centerX, 2) + Math.pow(center.y - centerY, 2)
      ) / Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2));
      
      // Larger islands in the center, smaller on the edges
      const sizeMultiplier = 1.5 - distFromCenter;
      
      const island = createIsland(center, canals, isCampo, config, sizeMultiplier, nearestCanal, nearestCanalDist);
      islands.push(island);
    }
  });
  
  return islands;
}

function createIsland(
  center: Point, 
  canals: Canal[], 
  isCampo: boolean, 
  config: VeniceConfig,
  sizeMultiplier: number = 1,
  nearestCanal: Canal | null = null,
  nearestCanalDist: number = Infinity
): Island {
  // Much more size variation
  const baseSize = isCampo ? 
    35 + Math.random() * 25 : // Campos are larger
    10 + Math.pow(Math.random(), 0.7) * 35;  // More small islands, fewer large ones
  
  const size = baseSize * sizeMultiplier;
  
  // Create a polygon with random points around the center
  // Fewer points for smoother islands
  const numPoints = 5 + Math.floor(Math.random() * 4);
  const points: Point[] = [];
  
  // Create smoother island shapes with less variation in radius
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    // Less variation in radius for smoother shapes
    const radius = size * (0.85 + Math.random() * 0.3);
    
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    });
  }
  
  // Apply erosion to the edges - more points but less noise
  const erodedPoints = applyErosion(points, config.erosionFactor * 0.8);
  
  // Create SVG path
  let pathString = `M ${erodedPoints[0].x} ${erodedPoints[0].y}`;
  
  for (let i = 1; i < erodedPoints.length; i++) {
    pathString += ` L ${erodedPoints[i].x} ${erodedPoints[i].y}`;
  }
  
  pathString += ' Z';
  
  // Different fill for campos vs regular islands
  const fill = isCampo ? 'url(#campoTexture)' : 'url(#islandTexture)';
  
  // Add building details with more variety
  let buildingDetails = '';
  
  // Determine building density based on island size
  const buildingDensity = Math.min(1, size / 30) * (config.buildingDensity || 0.7);
  
  if (!isCampo) {
    // Add some building rectangles with more variety
    const buildingCount = Math.floor(2 + buildingDensity * 6);
    const buildingColors = ['#c4baa8', '#b3aa94', '#d4cebf', '#a39b8c'];
    
    for (let i = 0; i < buildingCount; i++) {
      // Smaller buildings
      const bWidth = 3 + Math.random() * 8;
      const bHeight = 3 + Math.random() * 8;
      
      // Distribute buildings better across the island - more towards the center
      const distFromCenter = Math.random() * size * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const bx = center.x + Math.cos(angle) * distFromCenter;
      const by = center.y + Math.sin(angle) * distFromCenter;
      
      // Random rotation for buildings - align somewhat with island shape
      const rotation = Math.floor(Math.random() * 45) * (Math.random() > 0.5 ? 1 : -1);
      const colorIndex = Math.floor(Math.random() * buildingColors.length);
      
      buildingDetails += `<rect x="${bx - bWidth/2}" y="${by - bHeight/2}" 
                          width="${bWidth}" height="${bHeight}" 
                          fill="${buildingColors[colorIndex]}" 
                          stroke="#a39b8c" stroke-width="0.3"
                          transform="rotate(${rotation} ${bx} ${by})" />`;
    }
  } else if (isCampo) {
    // Add a central feature for campos with more detail
    buildingDetails += `<circle cx="${center.x}" cy="${center.y}" r="${size/6}" 
                        fill="#c4baa8" stroke="#a39b8c" stroke-width="0.5" />`;
    
    // Add some decorative elements to the campo
    const smallFeatures = Math.floor(3 + Math.random() * 5);
    for (let i = 0; i < smallFeatures; i++) {
      const featureSize = 2 + Math.random() * 3;
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
    svgPath: `<path d="${pathString}" fill="${fill}" stroke="#b3aa94" stroke-width="0.8" />${buildingDetails}`
  };
}

function applyErosion(points: Point[], erosionFactor: number): Point[] {
  const result: Point[] = [];
  
  // For each pair of points, add some intermediate points with noise
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    
    result.push(p1);
    
    // Add 2-3 intermediate points with less noise for smoother coastlines
    const numIntermediatePoints = 2 + Math.floor(Math.random() * 2);
    
    for (let j = 1; j <= numIntermediatePoints; j++) {
      const t = j / (numIntermediatePoints + 1);
      // Less noise for smoother coastlines
      const noise = erosionFactor * (Math.random() * 2 - 1) * 5;
      
      result.push({
        x: p1.x + (p2.x - p1.x) * t + noise,
        y: p1.y + (p2.y - p1.y) * t + noise
      });
    }
  }
  
  return result;
}
