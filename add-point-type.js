const fs = require('fs');
const path = require('path');

// Function to recursively find all JSON files in a directory
function findJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

// Function to process a JSON file and add pointType if needed
function processJsonFile(filePath) {
  try {
    // Read the file
    const data = fs.readFileSync(filePath, 'utf8');
    let jsonData;
    
    try {
      jsonData = JSON.parse(data);
    } catch (parseError) {
      console.error(`Error parsing JSON in file ${filePath}:`, parseError.message);
      return false;
    }
    
    // Check if it's a building file (has a name property)
    if (jsonData && typeof jsonData === 'object' && jsonData.name) {
      // Check if pointType is already defined
      if (jsonData.pointType === undefined) {
        // Find the position of the name property to insert after it
        const keys = Object.keys(jsonData);
        const nameIndex = keys.indexOf('name');
        
        if (nameIndex !== -1) {
          // Create a new object with properties in the desired order
          const newJsonData = {};
          
          keys.forEach((key, index) => {
            newJsonData[key] = jsonData[key];
            
            // Insert pointType after name
            if (index === nameIndex) {
              newJsonData.pointType = "building";
            }
          });
          
          // Write the updated JSON back to the file
          fs.writeFileSync(filePath, JSON.stringify(newJsonData, null, 2));
          console.log(`Added pointType to ${filePath}`);
          return true;
        } else {
          // If name property not found, just add pointType at the beginning
          jsonData.pointType = "building";
          fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
          console.log(`Added pointType to ${filePath} (no name property found)`);
          return true;
        }
      } else {
        console.log(`File ${filePath} already has pointType defined: ${jsonData.pointType}`);
        return false;
      }
    } else {
      console.log(`File ${filePath} doesn't appear to be a building definition (no name property)`);
      return false;
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
    return false;
  }
}

// Main function
function main() {
  const dataDir = path.join(process.cwd(), 'data', 'buildings');
  
  // Check if the directory exists
  if (!fs.existsSync(dataDir)) {
    console.error(`Directory ${dataDir} does not exist`);
    return;
  }
  
  console.log(`Searching for building JSON files in ${dataDir}...`);
  
  // Find all JSON files
  const jsonFiles = findJsonFiles(dataDir);
  console.log(`Found ${jsonFiles.length} JSON files`);
  
  // Process each file
  let modifiedCount = 0;
  
  jsonFiles.forEach(filePath => {
    const modified = processJsonFile(filePath);
    if (modified) {
      modifiedCount++;
    }
  });
  
  console.log(`\nSummary:`);
  console.log(`Total files processed: ${jsonFiles.length}`);
  console.log(`Files modified: ${modifiedCount}`);
}

// Run the script
main();
