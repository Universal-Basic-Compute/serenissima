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
    
    let totalDockPoints = 0;
    let createdWaterpoints = 0;
    
    // Process each polygon
    for (const file of files) {
      const filePath = path.join(polygonsDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (!data.dockPoints || !Array.isArray(data.dockPoints)) {
        console.log(`Skipping ${file}: No dock points found`);
        continue;
      }
      
      console.log(`Processing ${data.dockPoints.length} dock points for polygon ${file}`);
      totalDockPoints += data.dockPoints.length;
      
      // Create waterpoints for each dock point
      for (const dockPoint of data.dockPoints) {
        // Use the water point (20m outside the polygon)
        const position = dockPoint.water;
        
        // Create a waterpoint at this position
        const waterpoint = await createWaterPoint(position, 'dock');
        
        if (waterpoint) {
          console.log(`Created dock waterpoint: ${waterpoint.id}`);
          createdWaterpoints++;
          
          // Update the dock point with the waterpoint ID
          dockPoint.waterpointId = waterpoint.id;
        }
      }
      
      // Write the updated data back to the file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    
    console.log(`Completed! Created ${createdWaterpoints} waterpoints for ${totalDockPoints} dock points.`);
  } catch (error) {
    console.error('Error creating dock waterpoints:', error);
  }
}

// Run the function
createDockWaterpoints();
