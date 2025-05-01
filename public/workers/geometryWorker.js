// Simple function to calculate centroid
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

// Simple message handler with no chunking or complex logic
self.onmessage = function(e) {
  try {
    const { type, data } = e.data;
    
    if (type === 'calculateCentroids') {
      const polygons = data.polygons;
      const results = [];
      
      // Process all polygons at once - keep it simple
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
    }
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      type: 'error',
      error: error.message || 'Unknown error in worker'
    });
  }
};
