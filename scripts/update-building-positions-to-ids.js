
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

// Airtable API setup
const Airtable = require('airtable');
require('dotenv').config();

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const buildingsTable = base(process.env.AIRTABLE_BUILDINGS_TABLE || 'BUILDINGS');

// Function to load all polygon data
async function loadPolygonData() {
  console.log('Loading polygon data...');
  const polygonsDir = path.join(__dirname, '..', 'data');
  
  // Find all JSON files in the data directory and its subdirectories
  const findJsonFiles = (dir) => {
    let results = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        results = results.concat(findJsonFiles(itemPath));
      } else if (item.endsWith('.json')) {
        // Add JSON files to results
        results.push(itemPath);
      }
    }
    
    return results;
  };
  
  const jsonFiles = findJsonFiles(polygonsDir);
  console.log(`Found ${jsonFiles.length} JSON files`);
  
  // Load and parse each file
  const polygons = [];
  for (const file of jsonFiles) {
    try {
      const data = await readFileAsync(file, 'utf8');
      const polygon = JSON.parse(data);
      
      // Only include files that have buildingPoints
      if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
        polygons.push(polygon);
      }
    } catch (error) {
      console.error(`Error loading polygon from ${file}:`, error);
    }
  }
  
  console.log(`Loaded ${polygons.length} polygons with building points`);
  return polygons;
}

// Function to create a position lookup map
function createPositionLookup(polygons) {
  console.log('Creating position lookup map...');
  const positionMap = new Map();
  
  // For each polygon, process its building points
  polygons.forEach(polygon => {
    if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
      polygon.buildingPoints.forEach(point => {
        if (point.lat && point.lng && point.id) {
          // Create a key based on the position
          const posKey = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
          positionMap.set(posKey, point.id);
        }
      });
    }
  });
  
  console.log(`Created lookup map with ${positionMap.size} building points`);
  return positionMap;
}

// Function to find the closest building point
function findClosestBuildingPoint(position, positionMap) {
  // If the position is already a string (possibly an ID), return it
  if (typeof position === 'string') {
    // Check if it looks like a position string (contains comma)
    if (position.includes(',')) {
      // Try to parse it as a position
      const [lat, lng] = position.split(',').map(parseFloat);
      if (!isNaN(lat) && !isNaN(lng)) {
        const posKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        if (positionMap.has(posKey)) {
          return positionMap.get(posKey);
        }
        
        // If exact match not found, look for closest point
        let closestPoint = null;
        let minDistance = Infinity;
        
        for (const [key, id] of positionMap.entries()) {
          const [pointLat, pointLng] = key.split(',').map(parseFloat);
          const distance = Math.sqrt(
            Math.pow(lat - pointLat, 2) + Math.pow(lng - pointLng, 2)
          );
          
          if (distance < minDistance) {
            minDistance = distance;
            closestPoint = id;
          }
        }
        
        // Only return if the point is reasonably close (threshold: 0.0001 degrees)
        if (minDistance < 0.0001) {
          return closestPoint;
        }
      }
    }
    return position; // Return as is if it doesn't look like a position
  }
  
  // If position is an object with lat and lng
  if (position && typeof position === 'object' && position.lat && position.lng) {
    const posKey = `${position.lat.toFixed(6)},${position.lng.toFixed(6)}`;
    if (positionMap.has(posKey)) {
      return positionMap.get(posKey);
    }
    
    // If exact match not found, look for closest point
    let closestPoint = null;
    let minDistance = Infinity;
    
    for (const [key, id] of positionMap.entries()) {
      const [pointLat, pointLng] = key.split(',').map(parseFloat);
      const distance = Math.sqrt(
        Math.pow(position.lat - pointLat, 2) + Math.pow(position.lng - pointLng, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = id;
      }
    }
    
    // Only return if the point is reasonably close (threshold: 0.0001 degrees)
    if (minDistance < 0.0001) {
      return closestPoint;
    }
  }
  
  // If we couldn't find a match, return the original position stringified
  if (position && typeof position === 'object' && position.lat && position.lng) {
    return `${position.lat},${position.lng}`;
  }
  
  return position;
}

// Main function to update building positions
async function updateBuildingPositions() {
  try {
    console.log('Starting building position update process...');
    
    // Load polygon data and create position lookup
    const polygons = await loadPolygonData();
    const positionMap = createPositionLookup(polygons);
    
    // Fetch all buildings from Airtable
    console.log('Fetching buildings from Airtable...');
    const buildings = await new Promise((resolve, reject) => {
      const buildings = [];
      buildingsTable.select({
        view: 'Grid view'
      }).eachPage(
        function page(records, fetchNextPage) {
          buildings.push(...records);
          fetchNextPage();
        },
        function done(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(buildings);
        }
      );
    });
    
    console.log(`Fetched ${buildings.length} buildings from Airtable`);
    
    // Process each building
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const building of buildings) {
      try {
        const position = building.get('Position');
        
        // Skip if no position
        if (!position) {
          console.log(`Skipping building ${building.id}: No position data`);
          skippedCount++;
          continue;
        }
        
        // Parse position if it's a string
        let positionObj = position;
        if (typeof position === 'string') {
          try {
            positionObj = JSON.parse(position);
          } catch (e) {
            // If it's not valid JSON, it might be a comma-separated string or already an ID
            if (position.includes(',')) {
              const [lat, lng] = position.split(',').map(parseFloat);
              if (!isNaN(lat) && !isNaN(lng)) {
                positionObj = { lat, lng };
              }
            }
          }
        }
        
        // Find the building point ID for this position
        const buildingPointId = findClosestBuildingPoint(positionObj, positionMap);
        
        // Skip if the position is already an ID that doesn't look like coordinates
        if (typeof position === 'string' && !position.includes(',') && 
            (position.startsWith('building_') || position.startsWith('point_'))) {
          console.log(`Skipping building ${building.id}: Position already appears to be an ID (${position})`);
          skippedCount++;
          continue;
        }
        
        // Skip if we couldn't find a building point ID
        if (!buildingPointId || (typeof buildingPointId === 'string' && buildingPointId.includes(','))) {
          console.log(`Skipping building ${building.id}: Could not find matching building point for position ${JSON.stringify(position)}`);
          skippedCount++;
          continue;
        }
        
        // Update the building record
        console.log(`Updating building ${building.id}: Position ${JSON.stringify(position)} -> ${buildingPointId}`);
        await buildingsTable.update(building.id, {
          'Position': buildingPointId
        });
        
        updatedCount++;
      } catch (error) {
        console.error(`Error processing building ${building.id}:`, error);
        errorCount++;
      }
    }
    
    console.log('\nSummary:');
    console.log(`Total buildings processed: ${buildings.length}`);
    console.log(`Buildings updated: ${updatedCount}`);
    console.log(`Buildings skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Error in updateBuildingPositions:', error);
  }
}

// Run the script
updateBuildingPositions()
  .then(() => console.log('Building position update completed'))
  .catch(err => console.error('Error running script:', err));
