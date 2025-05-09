const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Path to the canals data file
const canalsFilePath = path.join(process.cwd(), 'data', 'canals', 'canals.json');

// Function to calculate intersection between two line segments
function calculateIntersection(line1Start, line1End, line2Start, line2End) {
  // Calculate coefficients of line equations
  const a1 = line1End.lng - line1Start.lng;
  const b1 = line1Start.lat - line1End.lat;
  const c1 = a1 * line1Start.lat + b1 * line1Start.lng;
  
  const a2 = line2End.lng - line2Start.lng;
  const b2 = line2Start.lat - line2End.lat;
  const c2 = a2 * line2Start.lat + b2 * line2Start.lng;
  
  const determinant = a1 * b2 - a2 * b1;
  
  // If determinant is close to zero, lines are parallel
  if (Math.abs(determinant) < 0.0000001) {
    return null;
  }
  
  // Calculate intersection point
  const lat = (b2 * c1 - b1 * c2) / determinant;
  const lng = (a1 * c2 - a2 * c1) / determinant;
  
  // Check if intersection point is on both segments
  const onLine1 = isPointOnSegment(line1Start, line1End, { lat, lng });
  const onLine2 = isPointOnSegment(line2Start, line2End, { lat, lng });
  
  if (onLine1 && onLine2) {
    return { lat, lng };
  }
  
  return null;
}

// Function to check if a point is on a segment
function isPointOnSegment(segStart, segEnd, point) {
  // Check if point is within the bounding rectangle of the segment
  const minLat = Math.min(segStart.lat, segEnd.lat);
  const maxLat = Math.max(segStart.lat, segEnd.lat);
  const minLng = Math.min(segStart.lng, segEnd.lng);
  const maxLng = Math.max(segStart.lng, segEnd.lng);
  
  return (
    point.lat >= minLat - 0.0000001 &&
    point.lat <= maxLat + 0.0000001 &&
    point.lng >= minLng - 0.0000001 &&
    point.lng <= maxLng + 0.0000001
  );
}

// Main function to find all intersections
function findAllIntersections() {
  try {
    // Read the canals data file
    const canalsData = JSON.parse(fs.readFileSync(canalsFilePath, 'utf8'));
    const { canals, transferPoints } = canalsData;
    
    // Check if we have enough canals to process
    if (!canals || canals.length < 2) {
      console.log('Not enough canals to find intersections.');
      return;
    }
    
    console.log(`Analyzing ${canals.length} canals to find intersections...`);
    
    // Store newly found intersections
    const newTransferPoints = [];
    
    // Iterate through all canals
    for (let i = 0; i < canals.length; i++) {
      const canal1 = canals[i];
      
      // Get points of the first canal
      const points1 = typeof canal1.points === 'string' 
        ? JSON.parse(canal1.points) 
        : canal1.points;
      
      // Iterate through segments of the first canal
      for (let j = 0; j < points1.length - 1; j++) {
        const segment1Start = points1[j];
        const segment1End = points1[j + 1];
        
        // Compare with all other canals
        for (let k = i + 1; k < canals.length; k++) {
          const canal2 = canals[k];
          
          // Get points of the second canal
          const points2 = typeof canal2.points === 'string' 
            ? JSON.parse(canal2.points) 
            : canal2.points;
          
          // Iterate through segments of the second canal
          for (let l = 0; l < points2.length - 1; l++) {
            const segment2Start = points2[l];
            const segment2End = points2[l + 1];
            
            // Calculate intersection
            const intersection = calculateIntersection(
              segment1Start, segment1End, segment2Start, segment2End
            );
            
            // If an intersection is found
            if (intersection) {
              console.log(`Intersection found between canal ${canal1.id} and canal ${canal2.id}`);
              
              // Check if this intersection already exists in transferPoints
              const existingPoint = transferPoints.find(tp => {
                // Check if coordinates are close
                const latDiff = Math.abs(tp.position.lat - intersection.lat);
                const lngDiff = Math.abs(tp.position.lng - intersection.lng);
                return latDiff < 0.0000001 && lngDiff < 0.0000001;
              });
              
              if (!existingPoint) {
                // Create a new transfer point
                const newTransferPoint = {
                  id: `transfer-point-${uuidv4()}`,
                  position: {
                    lat: intersection.lat,
                    lng: intersection.lng,
                    // Add an approximate z value (can be adjusted as needed)
                    z: 0.1
                  },
                  connectedRoadIds: [canal1.id, canal2.id],
                  createdAt: new Date().toISOString(),
                  isIntersection: true
                };
                
                newTransferPoints.push(newTransferPoint);
              } else {
                // Update existing point if necessary
                if (!existingPoint.connectedRoadIds.includes(canal1.id)) {
                  existingPoint.connectedRoadIds.push(canal1.id);
                }
                if (!existingPoint.connectedRoadIds.includes(canal2.id)) {
                  existingPoint.connectedRoadIds.push(canal2.id);
                }
                existingPoint.isIntersection = true;
              }
            }
          }
        }
      }
    }
    
    // Add new transfer points
    transferPoints.push(...newTransferPoints);
    
    console.log(`${newTransferPoints.length} new intersections found.`);
    
    // Write updated data to file
    fs.writeFileSync(canalsFilePath, JSON.stringify(canalsData, null, 2));
    
    console.log('Canals file updated with intersections.');
    
  } catch (error) {
    console.error('Error calculating intersections:', error);
  }
}

// Execute the main function
findAllIntersections();
