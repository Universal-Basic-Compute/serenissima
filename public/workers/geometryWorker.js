// Add error handling to the worker
self.addEventListener('error', function(e) {
  console.error('Worker error:', e);
  self.postMessage({
    type: 'error',
    error: e.message
  });
});

// Calculate centroid of a polygon with error handling
function calculateCentroid(coordinates) {
  try {
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
  } catch (error) {
    console.error('Error calculating centroid:', error);
    return null;
  }
}

// Process messages from main thread with better error handling
self.onmessage = function(e) {
  try {
    const { type, data } = e.data;
    
    if (type === 'calculateCentroids') {
      // Process polygons in smaller chunks to avoid blocking
      const polygons = data.polygons;
      const results = [];
      
      // Process all at once for small batches
      if (polygons.length <= 5) {
        for (let i = 0; i < polygons.length; i++) {
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
        
        // Send results back immediately
        self.postMessage({
          type: 'centroidsCalculated',
          results: results
        });
        return;
      }
      
      // For larger batches, process in chunks
      const chunkSize = 5;
      let processedCount = 0;
      
      function processChunk() {
        try {
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
        } catch (error) {
          console.error('Error processing chunk:', error);
          // Send partial results
          self.postMessage({
            type: 'centroidsCalculated',
            results: results,
            error: error.message
          });
        }
      }
      
      // Start processing
      processChunk();
    }
  } catch (error) {
    console.error('Error in worker message handler:', error);
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};
