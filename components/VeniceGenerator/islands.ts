import { Island, Canal, Point, VeniceConfig, createSmoothPath } from './utils';

export function generateIslands(canals: Canal[], config: VeniceConfig): Island[] {
  const islands: Island[] = [];
  
  // Create a grid of potential island centers - much larger grid for fewer, bigger islands
  const gridSize = 120; // Increase from 80 to 120 for fewer islands
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
  
  // Create grid of potential island centers with much higher density near the center
  for (let x = minX; x <= maxX; x += gridSize) {
    for (let y = minY; y <= maxY; y += gridSize) {
      // Calculate distance from center (normalized 0-1)
      const distFromCenter = Math.sqrt(
        Math.pow((x - centerX) / (maxX - minX), 2) + 
        Math.pow((y - centerY) / (maxY - minY), 2)
      );
      
      // Much higher probability of islands near the center, almost none at edges
      // Use a much steeper falloff function to concentrate islands more in the center
      if (Math.random() > Math.pow(distFromCenter, 0.2) * 0.7) { // Changed from 0.3 to 0.2 for steeper falloff
        // Add some randomness to grid positions but keep closer to center
        const jitterAmount = gridSize * 0.4 * (1 - distFromCenter); // Less jitter for points near center
        const jitteredX = x + (Math.random() * jitterAmount * 2 - jitterAmount);
        const jitteredY = y + (Math.random() * jitterAmount * 2 - jitterAmount);
        
        // Add stronger bias toward the center for all points
        const centerBias = 0.4; // Increased from 0.2 to 0.4
        const biasedX = jitteredX + (centerX - jitteredX) * centerBias;
        const biasedY = jitteredY + (centerY - jitteredY) * centerBias;
        
        potentialCenters.push({ x: biasedX, y: biasedY });
      }
    }
  }
  
  // Track campos separately to ensure they don't overlap
  const campoPositions: Point[] = [];
  
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
        
        if (distance < canal.width * 1.5) { // Reduced from 1.8 to allow islands closer to canals
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
        const minDistance = 50 + (island.points.length > 10 ? 30 : 0); // Increased from 40 to 50
        if (distance < minDistance) {
          tooClose = true;
          break;
        }
      }
    }
    
    // Check if this would be a campo and ensure it's not too close to other campos
    const wouldBeCampo = Math.random() < config.campoFrequency;
    if (!tooClose && wouldBeCampo) {
      for (const campo of campoPositions) {
        const distance = Math.sqrt(
          Math.pow(center.x - campo.x, 2) + Math.pow(center.y - campo.y, 2)
        );
        
        // Ensure campos are well-separated
        if (distance < 150) { // Large minimum distance between campos
          tooClose = true;
          break;
        }
      }
    }
    
    if (!tooClose) {
      // Create an island around this center
      const isCampo = wouldBeCampo;
      
      if (isCampo) {
        campoPositions.push(center);
      }
      
      // Size variation based on distance from center
      const distFromCenter = Math.sqrt(
        Math.pow(center.x - centerX, 2) + Math.pow(center.y - centerY, 2)
      ) / Math.sqrt(Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2));
      
      // Larger islands in the center, smaller on the edges
      const sizeMultiplier = 2.2 - distFromCenter; // Increased from 1.8 to 2.2
      
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
  // Much more size variation with larger base sizes
  const baseSize = isCampo ? 
    60 + Math.random() * 40 : // Campos are larger (increased from 45 to 60)
    20 + Math.pow(Math.random(), 0.4) * 70;  // More extreme size variation (increased max from 45 to 70)
  
  const size = baseSize * sizeMultiplier;
  
  // Create a polygon with random points around the center
  // Even fewer points for smoother islands
  const numPoints = isCampo ? 
    6 + Math.floor(Math.random() * 2) : // Campos are more regular
    4 + Math.floor(Math.random() * 3);  // Regular islands have fewer points for smoother shapes
  
  // Create different island shape types
  const shapeType = Math.floor(Math.random() * 6); // 0-5 different shape types (increased from 4)
  let points: Point[] = [];
  
  if (shapeType === 0) {
    // Standard rounded shape
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      // Less variation in radius for smoother shapes
      const radius = size * (0.9 + Math.random() * 0.2); // Reduced variation (0.85-1.15 to 0.9-1.1)
      
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
  } else if (shapeType === 1) {
    // Elongated shape
    const angle = Math.random() * Math.PI; // Random orientation
    const aspectRatio = 1.5 + Math.random() * 1; // 1.5 to 2.5 times longer in one direction
    
    for (let i = 0; i < numPoints; i++) {
      const pointAngle = (i / numPoints) * Math.PI * 2;
      const radius = size * (0.9 + Math.random() * 0.2);
      
      // Apply aspect ratio transformation
      const stretchedX = Math.cos(pointAngle) * radius * aspectRatio;
      const stretchedY = Math.sin(pointAngle) * radius;
      
      // Rotate the point
      const rotatedX = stretchedX * Math.cos(angle) - stretchedY * Math.sin(angle);
      const rotatedY = stretchedX * Math.sin(angle) + stretchedY * Math.cos(angle);
      
      points.push({
        x: center.x + rotatedX,
        y: center.y + rotatedY
      });
    }
  } else if (shapeType === 2) {
    // Curved/crescent shape
    const angle = Math.random() * Math.PI * 2; // Random orientation
    const curveFactor = 0.2 + Math.random() * 0.3; // How curved the island is
    
    for (let i = 0; i < numPoints; i++) {
      const pointAngle = (i / numPoints) * Math.PI * 2;
      const radius = size * (0.9 + Math.random() * 0.2);
      
      // Apply curve transformation
      const curveX = Math.cos(pointAngle) * radius;
      const curveY = Math.sin(pointAngle) * radius;
      
      // Add curve by shifting points based on their angle
      const shiftFactor = Math.sin(pointAngle) * curveFactor * size;
      
      // Rotate the point
      const rotatedX = (curveX + shiftFactor) * Math.cos(angle) - curveY * Math.sin(angle);
      const rotatedY = (curveX + shiftFactor) * Math.sin(angle) + curveY * Math.cos(angle);
      
      points.push({
        x: center.x + rotatedX,
        y: center.y + rotatedY
      });
    }
  } else if (shapeType === 3) {
    // Irregular blob shape
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      // More variation but with a pattern
      const radius = size * (0.8 + 0.4 * Math.sin(angle * 3) * Math.sin(angle * 2));
      
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
  } else if (shapeType === 4) {
    // Triangular shape with rounded corners
    const angle = Math.random() * Math.PI * 2; // Random orientation
    const points1 = Math.floor(numPoints / 3);
    const points2 = Math.floor(numPoints / 3);
    const points3 = numPoints - points1 - points2;
    
    // Create three segments with different radii
    for (let i = 0; i < numPoints; i++) {
      const pointAngle = (i / numPoints) * Math.PI * 2 + angle;
      let radius;
      
      if (i < points1) {
        radius = size * (1.1 + Math.random() * 0.2);
      } else if (i < points1 + points2) {
        radius = size * (0.9 + Math.random() * 0.2);
      } else {
        radius = size * (1.0 + Math.random() * 0.2);
      }
      
      points.push({
        x: center.x + Math.cos(pointAngle) * radius,
        y: center.y + Math.sin(pointAngle) * radius
      });
    }
  } else if (shapeType === 5) {
    // Complex multi-lobe shape
    const lobes = 2 + Math.floor(Math.random() * 3); // 2-4 lobes
    
    for (let i = 0; i < numPoints; i++) {
      const pointAngle = (i / numPoints) * Math.PI * 2;
      // Create a shape with multiple lobes
      const radius = size * (0.7 + 0.6 * Math.pow(Math.abs(Math.cos(pointAngle * lobes)), 0.7));
      
      points.push({
        x: center.x + Math.cos(pointAngle) * radius,
        y: center.y + Math.sin(pointAngle) * radius
      });
    }
  }
  
  // Apply erosion to the edges - more points but less noise
  const erodedPoints = applyErosion(points, config.erosionFactor * 0.6); // Reduced noise (0.8 to 0.6)
  
  // Create SVG path - use bezier curves for smoother islands
  let pathString = '';
  
  if (erodedPoints.length > 2) {
    pathString = `M ${erodedPoints[0].x} ${erodedPoints[0].y}`;
    
    for (let i = 0; i < erodedPoints.length; i++) {
      const p1 = erodedPoints[i];
      const p2 = erodedPoints[(i + 1) % erodedPoints.length];
      const p3 = erodedPoints[(i + 2) % erodedPoints.length];
      
      // Calculate control points for smooth curve
      const cp1x = p1.x + (p2.x - p1.x) * 0.5;
      const cp1y = p1.y + (p2.y - p1.y) * 0.5;
      const cp2x = p2.x + (p3.x - p2.x) * 0.5;
      const cp2y = p2.y + (p3.y - p2.y) * 0.5;
      
      pathString += ` S ${cp1x} ${cp1y}, ${p2.x} ${p2.y}`;
    }
    
    pathString += ' Z';
  }
  
  // Different fill for campos vs regular islands
  const fill = isCampo ? 'url(#campoTexture)' : 'url(#islandTexture)';
  
  // Add building details with more variety
  let buildingDetails = '';
  
  // Determine building density based on island size
  const buildingDensity = Math.min(1, size / 40) * (config.buildingDensity || 0.7);
  
  if (!isCampo) {
    // Add some building rectangles with more variety
    const buildingCount = Math.floor(3 + buildingDensity * 8);
    const buildingColors = ['#c4baa8', '#b3aa94', '#d4cebf', '#a39b8c'];
    
    for (let i = 0; i < buildingCount; i++) {
      // Smaller buildings
      const bWidth = 3 + Math.random() * 7;
      const bHeight = 3 + Math.random() * 7;
      
      // Distribute buildings better across the island - more towards the center
      const distFromCenter = Math.random() * size * 0.6;
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
    buildingDetails += `<circle cx="${center.x}" cy="${center.y}" r="${size/7}" 
                        fill="#c4baa8" stroke="#a39b8c" stroke-width="0.5" />`;
    
    // Add some decorative elements to the campo
    const smallFeatures = Math.floor(4 + Math.random() * 6);
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
    
    // Add 1-2 intermediate points with less noise for smoother coastlines
    const numIntermediatePoints = 1 + Math.floor(Math.random() * 2);
    
    for (let j = 1; j <= numIntermediatePoints; j++) {
      const t = j / (numIntermediatePoints + 1);
      // Less noise for smoother coastlines
      const noise = erosionFactor * (Math.random() * 2 - 1) * 3; // Reduced from 5 to 3
      
      result.push({
        x: p1.x + (p2.x - p1.x) * t + noise,
        y: p1.y + (p2.y - p1.y) * t + noise
      });
    }
  }
  
  return result;
}
