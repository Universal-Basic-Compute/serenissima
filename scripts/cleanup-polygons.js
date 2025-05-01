// This script cleans up duplicate polygon files
const path = require('path');
const fs = require('fs');

// Import fileUtils directly with the correct path
// Use path.resolve to get the absolute path to the lib directory
const fileUtilsPath = path.resolve(__dirname, '..', 'lib', 'fileUtils.js');
const { cleanupDuplicatePolygons } = require(fileUtilsPath);

console.log('Starting polygon cleanup...');
const result = cleanupDuplicatePolygons();
console.log(`Cleanup complete!`);
console.log(`Total files: ${result.total}`);
console.log(`Deleted duplicates: ${result.deleted}`);
console.log(`Remaining files: ${result.remaining}`);
