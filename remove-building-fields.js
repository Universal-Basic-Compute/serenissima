const fs = require('fs');
const path = require('path');

// Define the directory where building JSON files are stored
const buildingsDir = path.join(process.cwd(), 'data', 'buildings');

// Fields to remove from each building JSON
const fieldsToRemove = [
  'incomeGeneration',
  'employmentCapacity',
  'locationRequirements',
  'constructionPhase3DPrompt',
  'completedBuilding3DPrompt',
  'gameplayInformation'
];

// Function to process a single building file
function processBuildingFile(filePath) {
  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    
    // Parse the JSON
    const building = JSON.parse(data);
    
    // Remove the specified fields
    fieldsToRemove.forEach(field => {
      if (building.hasOwnProperty(field)) {
        delete building[field];
        console.log(`Removed ${field} from ${path.basename(filePath)}`);
      }
    });
    
    // Write the updated JSON back to the file
    fs.writeFileSync(filePath, JSON.stringify(building, null, 2), 'utf8');
    console.log(`Updated ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

// Main function to process all building files
function processAllBuildingFiles() {
  try {
    // Ensure the directory exists
    if (!fs.existsSync(buildingsDir)) {
      console.error(`Directory ${buildingsDir} does not exist`);
      return;
    }
    
    // Get all JSON files in the directory
    const files = fs.readdirSync(buildingsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(buildingsDir, file));
    
    console.log(`Found ${files.length} building JSON files`);
    
    // Process each file
    files.forEach(processBuildingFile);
    
    console.log('All building files processed successfully');
  } catch (error) {
    console.error('Error processing building files:', error);
  }
}

// Run the script
processAllBuildingFiles();
