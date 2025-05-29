const fs = require('fs');
const path = require('path');

// Define the buildings directory
const BUILDINGS_DIR = path.join(process.cwd(), 'public', 'images', 'buildings');

// Function to ensure a directory exists
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Function to recursively find all image files in subdirectories
function findImageFiles(dir) {
  let results = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        console.log(`Scanning subdirectory: ${itemPath}`);
        const subResults = findImageFiles(itemPath);
        results = results.concat(subResults);
      } else if (isImageFile(item)) {
        // Add image files to results
        console.log(`Found image file: ${itemPath}`);
        results.push(itemPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return results;
}

// Function to check if a file is an image based on extension
function isImageFile(filename) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
}

// Main function to move all images to the root buildings directory
function flattenBuildingImages() {
  console.log(`Starting to flatten building images from: ${BUILDINGS_DIR}`);
  
  // Ensure the buildings directory exists
  ensureDirectoryExists(BUILDINGS_DIR);
  
  // Find all image files in subdirectories
  const imageFiles = findImageFiles(BUILDINGS_DIR);
  console.log(`Found ${imageFiles.length} image files in subdirectories`);
  
  // Move each image file to the root directory
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  
  for (const imagePath of imageFiles) {
    // Skip files that are already in the root directory
    if (path.dirname(imagePath) === BUILDINGS_DIR) {
      console.log(`Skipping file already in root: ${imagePath}`);
      skipCount++;
      continue;
    }
    
    const fileName = path.basename(imagePath);
    const destPath = path.join(BUILDINGS_DIR, fileName);
    
    try {
      // Check if a file with the same name already exists in the destination
      if (fs.existsSync(destPath)) {
        console.log(`File already exists in destination, adding unique suffix: ${fileName}`);
        // Add a unique suffix to avoid overwriting
        const fileNameWithoutExt = path.basename(fileName, path.extname(fileName));
        const fileExt = path.extname(fileName);
        const uniqueFileName = `${fileNameWithoutExt}_${Date.now()}${fileExt}`;
        const uniqueDestPath = path.join(BUILDINGS_DIR, uniqueFileName);
        
        fs.copyFileSync(imagePath, uniqueDestPath);
        fs.unlinkSync(imagePath); // Remove the original file
        console.log(`Moved with unique name: ${imagePath} -> ${uniqueDestPath}`);
      } else {
        // Move the file (copy then delete)
        fs.copyFileSync(imagePath, destPath);
        fs.unlinkSync(imagePath); // Remove the original file
        console.log(`Moved: ${imagePath} -> ${destPath}`);
      }
      
      successCount++;
    } catch (error) {
      console.error(`Error moving file ${imagePath}:`, error);
      errorCount++;
    }
  }
  
  console.log('\nSummary:');
  console.log(`Total images found: ${imageFiles.length}`);
  console.log(`Successfully moved: ${successCount}`);
  console.log(`Skipped (already in root): ${skipCount}`);
  console.log(`Errors: ${errorCount}`);
  
  // Clean up empty directories
  cleanupEmptyDirectories(BUILDINGS_DIR);
}

// Function to remove empty directories
function cleanupEmptyDirectories(dir) {
  if (dir === BUILDINGS_DIR) {
    // Don't delete the root directory
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        cleanupEmptyDirectories(itemPath);
      }
    }
  } else {
    try {
      const items = fs.readdirSync(dir);
      
      // Recursively clean up subdirectories first
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          cleanupEmptyDirectories(itemPath);
        }
      }
      
      // Check if directory is now empty
      const remainingItems = fs.readdirSync(dir);
      if (remainingItems.length === 0) {
        fs.rmdirSync(dir);
        console.log(`Removed empty directory: ${dir}`);
      }
    } catch (error) {
      console.error(`Error cleaning up directory ${dir}:`, error);
    }
  }
}

// Run the script
flattenBuildingImages();
