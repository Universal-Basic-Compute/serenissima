const fs = require('fs');
const path = require('path');

// Define the directory where resource JSON files are stored
const resourcesDir = path.join(process.cwd(), 'data', 'resources');

// Fields to keep in each resource JSON
const fieldsToKeep = [
  'id',
  'name',
  'category',
  'subcategory',
  'description',
  'productionProperties',
  'varieties',
  'productionChainPosition',
  'historicalNotes',
  'soundEffect',
  'lore',
  'variants',
  'sources'
];

// Function to process a single resource file
function processResourceFile(filePath) {
  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    
    // Parse the JSON
    const resource = JSON.parse(data);
    
    // Create a new object with only the fields to keep
    const filteredResource = {};
    fieldsToKeep.forEach(field => {
      if (resource.hasOwnProperty(field)) {
        filteredResource[field] = resource[field];
      }
    });
    
    // Write the updated JSON back to the file
    fs.writeFileSync(filePath, JSON.stringify(filteredResource, null, 2), 'utf8');
    console.log(`Updated ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

// Main function to process all resource files
function processAllResourceFiles() {
  try {
    // Ensure the directory exists
    if (!fs.existsSync(resourcesDir)) {
      console.error(`Directory ${resourcesDir} does not exist`);
      return;
    }
    
    // Get all JSON files in the directory
    const files = fs.readdirSync(resourcesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(resourcesDir, file));
    
    console.log(`Found ${files.length} resource JSON files`);
    
    // Process each file
    files.forEach(processResourceFile);
    
    console.log('All resource files processed successfully');
  } catch (error) {
    console.error('Error processing resource files:', error);
  }
}

// Run the script
processAllResourceFiles();
