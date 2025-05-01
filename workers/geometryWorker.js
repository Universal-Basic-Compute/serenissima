// Web worker for geometry calculations
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  if (type === 'calculateCentroids') {
    const results = data.polygons.map(polygon => {
      // Calculate centroid
      let sumLat = 0;
      let sumLng = 0;
      const coords = polygon.coordinates;
      
      for (let i = 0; i < coords.length; i++) {
        sumLat += coords[i].lat;
        sumLng += coords[i].lng;
      }
      
      return {
        id: polygon.id,
        centroid: {
          lat: sumLat / coords.length,
          lng: sumLng / coords.length
        }
      };
    });
    
    self.postMessage({ type: 'centroidsCalculated', results });
  }
};
