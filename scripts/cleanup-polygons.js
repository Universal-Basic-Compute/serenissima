// This script cleans up duplicate polygon files
const path = require('path');
const fs = require('fs');

// Import fileUtils directly with the correct path
const { cleanupDuplicatePolygons } = require(path.join(process.cwd(), 'lib', 'fileUtils'));

console.log('Starting polygon cleanup...');
const result = cleanupDuplicatePolygons();
console.log(`Cleanup complete!`);
console.log(`Total files: ${result.total}`);
console.log(`Deleted duplicates: ${result.deleted}`);
console.log(`Remaining files: ${result.remaining}`);
