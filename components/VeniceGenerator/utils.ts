export interface Point {
  x: number;
  y: number;
}

export interface Canal {
  points: Point[];
  width: number;
  svgPath: string;
}

export interface Island {
  points: Point[];
  isCampo: boolean;
  svgPath: string;
}

export interface Bridge {
  start: Point;
  end: Point;
  width: number;
  svgPath: string;
}

export interface VeniceConfig {
  canalDensity: number;
  merchantDistrictDensity: number;
  residentialDistrictDensity: number;
  bridgeDensity: number;
  campoFrequency: number;
  erosionFactor: number;
  islandDensity?: number; // New option
  buildingDensity?: number; // New option
}

// Utility function to create a smooth path from points
export function createSmoothPath(points: Point[]): string {
  if (points.length < 2) return '';
  
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  
  let path = `M ${points[0].x} ${points[0].y}`;
  
  // Use a more sophisticated curve algorithm for smoother results
  if (points.length === 3) {
    // For 3 points, use a quadratic curve
    const controlX = (points[0].x + points[1].x * 2 + points[2].x) / 4;
    const controlY = (points[0].y + points[1].y * 2 + points[2].y) / 4;
    path += ` Q ${controlX},${controlY} ${points[2].x},${points[2].y}`;
  } else {
    // For more points, use a series of cubic bezier curves
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      
      // Calculate control points using Catmull-Rom to Bezier conversion
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
  }
  
  return path;
}

// Add noise to a line to make it more organic
export function addNoise(points: Point[], noiseFactor: number): Point[] {
  return points.map((point, i) => {
    // Don't add noise to first and last points
    if (i === 0 || i === points.length - 1) return point;
    
    return {
      x: point.x + (Math.random() * 2 - 1) * noiseFactor,
      y: point.y + (Math.random() * 2 - 1) * noiseFactor
    };
  });
}

// Check if two line segments intersect
export function linesIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) return false;
  
  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
  
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

export function pointInsidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function canalIntersectsIsland(canal: Canal, island: Island): boolean {
  // Check if any canal point is inside the island
  for (const canalPoint of canal.points) {
    if (pointInsidePolygon(canalPoint, island.points)) {
      return true;
    }
  }
  
  // Check if any canal segment intersects with any island segment
  for (let i = 0; i < canal.points.length - 1; i++) {
    const canalP1 = canal.points[i];
    const canalP2 = canal.points[i + 1];
    
    for (let j = 0; j < island.points.length; j++) {
      const islandP1 = island.points[j];
      const islandP2 = island.points[(j + 1) % island.points.length];
      
      if (linesIntersect(canalP1, canalP2, islandP1, islandP2)) {
        return true;
      }
    }
  }
  
  return false;
}

export function islandsOverlap(island1: Island, island2: Island): boolean {
  // Check if any point of island1 is inside island2
  for (const point of island1.points) {
    if (pointInsidePolygon(point, island2.points)) {
      return true;
    }
  }
  
  // Check if any point of island2 is inside island1
  for (const point of island2.points) {
    if (pointInsidePolygon(point, island1.points)) {
      return true;
    }
  }
  
  // Check if any edge of island1 intersects with any edge of island2
  for (let i = 0; i < island1.points.length; i++) {
    const p1 = island1.points[i];
    const p2 = island1.points[(i + 1) % island1.points.length];
    
    for (let j = 0; j < island2.points.length; j++) {
      const p3 = island2.points[j];
      const p4 = island2.points[(j + 1) % island2.points.length];
      
      if (linesIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }
  
  return false;
}
