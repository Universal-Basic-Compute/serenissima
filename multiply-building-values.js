const fs = require('fs');
const path = require('path');

// Define the multiplier
const MULTIPLIER = 1000;

// Define the directory containing building files
const BUILDINGS_DIR = path.join('data', 'buildings');

// List of building files to process
const buildingFiles = [
  'commercial.json',
  'public&government.json',
  'residential.json',
  'special.json',
  'infrastructure.json',
  'military&defence.json',
  'production.json'
];

// Process each file
buildingFiles.forEach(filename => {
  const filePath = path.join(BUILDINGS_DIR, filename);
  
  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    const buildings = JSON.parse(data);
    
    // Modify each building
    buildings.forEach(building => {
      // Multiply ducats in constructionCosts by 1000
      if (building.constructionCosts && building.constructionCosts.ducats) {
        building.constructionCosts.ducats *= MULTIPLIER;
      }
      
      // Multiply incomeGeneration by 1000
      if (building.incomeGeneration !== undefined) {
        building.incomeGeneration *= MULTIPLIER;
      }
      
      // Multiply maintenanceCost by 1000
      if (building.maintenanceCost !== undefined) {
        building.maintenanceCost *= MULTIPLIER;
      }
    });
    
    // Write the modified data back to the file
    fs.writeFileSync(filePath, JSON.stringify(buildings, null, 2), 'utf8');
    console.log(`Successfully updated ${filename}`);
  } catch (error) {
    console.error(`Error processing ${filename}:`, error);
  }
});

console.log('All building files have been updated.');
