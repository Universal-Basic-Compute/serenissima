const fs = require('fs');
const path = require('path');

// Function to convert snake_case to camelCase
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

// Function to process a JSON object recursively
function processCamelCase(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processCamelCase(item));
  }
  
  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // Convert the key to camelCase
      const camelKey = toCamelCase(key);
      // Process the value recursively
      newObj[camelKey] = processCamelCase(obj[key]);
    }
  }
  return newObj;
}

// Function to process all JSON files in a directory recursively
function processDirectory(directory) {
  try {
    const items = fs.readdirSync(directory, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(directory, item.name);
      
      if (item.isDirectory()) {
        processDirectory(itemPath);
      } else if (item.isFile() && path.extname(itemPath).toLowerCase() === '.json') {
        try {
          console.log(`Processing file: ${itemPath}`);
          
          // Read the file
          const content = fs.readFileSync(itemPath, 'utf8');
          const jsonData = JSON.parse(content);
          
          // Convert to camelCase
          const camelCaseData = processCamelCase(jsonData);
          
          // Write back to the file with pretty formatting
          fs.writeFileSync(
            itemPath, 
            JSON.stringify(camelCaseData, null, 2)
          );
          
          console.log(`Successfully processed: ${itemPath}`);
        } catch (error) {
          console.error(`Error processing ${itemPath}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error(`Error accessing directory ${directory}:`, error.message);
  }
}

// Main execution
const directories = [
  path.join(process.cwd(), 'data', 'buildings'),
  path.join(process.cwd(), 'data', 'resources')
];

console.log('Starting conversion process...');

for (const dir of directories) {
  if (fs.existsSync(dir)) {
    console.log(`Processing directory: ${dir}`);
    processDirectory(dir);
  } else {
    console.warn(`Directory does not exist: ${dir}`);
  }
}

console.log('Conversion complete!');
