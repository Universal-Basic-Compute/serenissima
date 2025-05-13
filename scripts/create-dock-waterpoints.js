const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Helper function to create a WaterPoint via API
async function createWaterPoint(position, type = 'dock') {
  try {
    const response = await fetch('http://localhost:3000/api/waterpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        position,
        type,
        depth: 2, // Docks are deeper than regular waterpoints
        connections: []
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.waterpoint;
  } catch (error) {
    console.error('Error creating waterpoint:', error);
    return null;
  }
}

// Main function to create dock waterpoints
async function createDockWaterpoints() {
  try {
    // Read all polygon files
    const polygonsDir = path.join(__dirname, '../data/polygons');
    const files = fs.readdirSync(polygonsDir).filter(file => file.endsWith('.json'));
    
    console.log(`Found ${files.length} polygon files`);
    
    let totalCanalPoints = 0;
    let createdWaterpoints = 0;
    
    // Process each polygon
    for (const file of files) {
      const filePath = path.join(polygonsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (!data.canalPoints || !Array.isArray(data.canalPoints)) {
        console.log(`Skipping ${file}: No dock points found`);
        continue;
      }
      
      console.log(`Processing ${data.canalPoints.length} dock points for polygon ${file}`);
      totalCanalPoints += data.canalPoints.length;
      
      // Create waterpoints for each dock point
      for (const canalPoint of data.canalPoints) {
        // Use the water point (20m outside the polygon)
        const position = canalPoint.water;
        
        // Create a waterpoint at this position
        const waterpoint = await createWaterPoint(position, 'dock');
        
        if (waterpoint) {
          console.log(`Created dock waterpoint: ${waterpoint.id}`);
          createdWaterpoints++;
          
          // Update the dock point with the waterpoint ID
          canalPoint.waterpointId = waterpoint.id;
        }
      }
      
      // Write the updated data back to the file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    
    console.log(`Completed! Created ${createdWaterpoints} waterpoints for ${totalCanalPoints} dock points.`);
  } catch (error) {
    console.error('Error creating dock waterpoints:', error);
  }
}

// Run the function
createDockWaterpoints();
