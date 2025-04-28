import { Bridge, Canal, Island, Point, VeniceConfig } from './utils';

export function placeBridges(
  canals: Canal[], 
  islands: Island[], 
  config: VeniceConfig
): Bridge[] {
  const bridges: Bridge[] = [];
  const maxBridges = Math.floor(10 * config.bridgeDensity);
  
  // Find potential bridge locations
  const potentialBridges: { start: Point; end: Point; canal: Canal; distance: number }[] = [];
  
  // For each canal, find nearby islands to connect
  canals.forEach(canal => {
    // Sample points along the canal
    const samplePoints = sampleCanalPoints(canal);
    
    samplePoints.forEach(point => {
      // Find closest points on islands
      islands.forEach(island => {
        const closestPoint = findClosestPointOnIsland(point, island);
        const distance = Math.sqrt(
          Math.pow(point.x - closestPoint.x, 2) + Math.pow(point.y - closestPoint.y, 2)
        );
        
        // Only consider bridges that are not too long or too short
        if (distance > canal.width * 0.8 && distance < canal.width * 3) {
          potentialBridges.push({
            start: point,
            end: closestPoint,
            canal,
            distance
          });
        }
      });
    });
  });
  
  // Sort potential bridges by distance (shorter bridges first)
  potentialBridges.sort((a, b) => a.distance - b.distance);
  
  // Place bridges, ensuring they're not too close to each other
  const minBridgeDistance = 50;
  
  for (const potential of potentialBridges) {
    if (bridges.length >= maxBridges) break;
    
    // Check if this bridge is too close to existing bridges
    let tooClose = false;
    
    for (const bridge of bridges) {
      const distToStart = Math.sqrt(
        Math.pow(potential.start.x - bridge.start.x, 2) + 
        Math.pow(potential.start.y - bridge.start.y, 2)
      );
      
      if (distToStart < minBridgeDistance) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      // Create a bridge
      const bridgeWidth = 5 + Math.random() * 3;
      
      // Calculate perpendicular direction for bridge arch
      const dx = potential.end.x - potential.start.x;
      const dy = potential.end.y - potential.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      
      // Create SVG path for arched bridge
      const midX = (potential.start.x + potential.end.x) / 2;
      const midY = (potential.start.y + potential.end.y) / 2;
      const archHeight = length * 0.2;
      
      const pathString = `
        M ${potential.start.x} ${potential.start.y}
        Q ${midX} ${midY - archHeight} ${potential.end.x} ${potential.end.y}
      `;
      
      bridges.push({
        start: potential.start,
        end: potential.end,
        width: bridgeWidth,
        svgPath: `
          <path d="${pathString}" stroke="#d4cebf" stroke-width="${bridgeWidth + 2}" fill="none" stroke-linecap="round" />
          <path d="${pathString}" stroke="#8c7e6b" stroke-width="${bridgeWidth}" fill="none" stroke-opacity="0.8" stroke-linecap="round" />
          <path d="${pathString}" stroke="#f5f2e8" stroke-width="${bridgeWidth * 0.5}" fill="none" stroke-opacity="0.6" stroke-linecap="round" />
        `
      });
    }
  }
  
  return bridges;
}

function sampleCanalPoints(canal: Canal): Point[] {
  const samples: Point[] = [];
  const numSamples = Math.max(5, Math.floor(canal.points.length / 3));
  
  for (let i = 0; i < numSamples; i++) {
    const index = Math.floor((i / numSamples) * canal.points.length);
    samples.push(canal.points[index]);
  }
  
  return samples;
}

function findClosestPointOnIsland(point: Point, island: Island): Point {
  let closestPoint = island.points[0];
  let minDistance = Infinity;
  
  island.points.forEach(islandPoint => {
    const distance = Math.sqrt(
      Math.pow(point.x - islandPoint.x, 2) + Math.pow(point.y - islandPoint.y, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = islandPoint;
    }
  });
  
  return closestPoint;
}
