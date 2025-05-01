// This script cleans up duplicate polygon files
const { cleanupDuplicatePolygons } = require('../lib/fileUtils');

console.log('Starting polygon cleanup...');
const result = cleanupDuplicatePolygons();
console.log(`Cleanup complete!`);
console.log(`Total files: ${result.total}`);
console.log(`Deleted duplicates: ${result.deleted}`);
console.log(`Remaining files: ${result.remaining}`);
