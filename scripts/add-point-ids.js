
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Directory containing polygon data files
const DATA_DIR = path.join(__dirname, '..', 'data');

// Function to generate a unique ID
function generateId(prefix, lat, lng) {
  // Create a deterministic ID based on coordinates with a prefix
  // This ensures the same point always gets the same ID
  return `${prefix}_${lat.toFixed(6)}_${lng.toFixed(6)}`;
}

// Function to process a single polygon file
function processPolygonFile(filePath) {
  console.log(`Processing file: ${filePath}`);
  
  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    const polygon = JSON.parse(data);
    let modified = false;
    
    // Process canalPoints
    if (polygon.canalPoints && Array.isArray(polygon.canalPoints)) {
      polygon.canalPoints.forEach(point => {
        if (point.edge && !point.id) {
          point.id = generateId('dock', point.edge.lat, point.edge.lng);
          modified = true;
        }
      });
    }
    
    // Process bridgePoints
    if (polygon.bridgePoints && Array.isArray(polygon.bridgePoints)) {
      polygon.bridgePoints.forEach(point => {
        if (point.edge && !point.id) {
          point.id = generateId('bridge', point.edge.lat, point.edge.lng);
          modified = true;
        }
      });
    }
    
    // Process buildingPoints
    if (polygon.buildingPoints && Array.isArray(polygon.buildingPoints)) {
      polygon.buildingPoints.forEach(point => {
        if (!point.id) {
          point.id = generateId('building', point.lat, point.lng);
          modified = true;
        }
      });
    }
    
    // Save the file if modified
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(polygon, null, 2), 'utf8');
      console.log(`Updated file: ${filePath}`);
    } else {
      console.log(`No changes needed for: ${filePath}`);
    }
    
    return { success: true, modified, filePath };
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return { success: false, error: error.message, filePath };
  }
}

// Function to recursively find all JSON files in a directory
function findJsonFiles(dir) {
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
}

// Main function
async function main() {
  console.log('Starting to add IDs to polygon points...');
  
  try {
    // Find all JSON files in the data directory
    const jsonFiles = findJsonFiles(DATA_DIR);
    console.log(`Found ${jsonFiles.length} JSON files to process`);
    
    // Process each file
    const results = [];
    for (const file of jsonFiles) {
      results.push(processPolygonFile(file));
    }
    
    // Summarize results
    const successful = results.filter(r => r.success);
    const modified = results.filter(r => r.success && r.modified);
    const failed = results.filter(r => !r.success);
    
    console.log('\nSummary:');
    console.log(`Total files processed: ${results.length}`);
    console.log(`Successfully processed: ${successful.length}`);
    console.log(`Files modified: ${modified.length}`);
    console.log(`Files failed: ${failed.length}`);
    
    if (failed.length > 0) {
      console.log('\nFailed files:');
      failed.forEach(f => console.log(`- ${f.filePath}: ${f.error}`));
    }
    
    console.log('\nProcess completed!');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the script
main().catch(console.error);
