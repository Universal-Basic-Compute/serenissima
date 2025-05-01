// Calculate centroid of a polygon
function calculateCentroid(coordinates) {
  if (!coordinates || coordinates.length < 3) {
    return null;
  }

  let sumLat = 0;
  let sumLng = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    sumLat += coordinates[i].lat;
    sumLng += coordinates[i].lng;
  }

  return {
    lat: sumLat / n,
    lng: sumLng / n
  };
}

// Process messages from main thread
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  if (type === 'calculateCentroids') {
    // Process polygons in smaller chunks to avoid blocking
    const polygons = data.polygons;
    const results = [];
    
    // Process in chunks of 5 polygons
    const chunkSize = 5;
    let processedCount = 0;
    
    function processChunk() {
      const endIdx = Math.min(processedCount + chunkSize, polygons.length);
      
      for (let i = processedCount; i < endIdx; i++) {
        const polygon = polygons[i];
        if (polygon.coordinates && polygon.coordinates.length > 2) {
          const centroid = calculateCentroid(polygon.coordinates);
          if (centroid) {
            results.push({
              id: polygon.id,
              centroid: centroid
            });
          }
        }
      }
      
      processedCount = endIdx;
      
      if (processedCount < polygons.length) {
        // Schedule next chunk with a small delay
        setTimeout(processChunk, 0);
      } else {
        // All done, send results back
        self.postMessage({
          type: 'centroidsCalculated',
          results: results
        });
      }
    }
    
    // Start processing
    processChunk();
  }
};
