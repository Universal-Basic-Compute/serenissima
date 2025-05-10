/**
 * Building Points Counter Script
 * 
 * This script:
 * 1. Fetches all land polygons from Airtable
 * 2. Counts the number of building points in each polygon's JSON data
 * 3. Updates the BuildingPointsCount field in the LANDS table
 * 
 * Usage: node scripts/count-building-points.js [--dry-run]
 */

require('dotenv').config();
const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Set up logging
const log = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARNING] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`)
};

/**
 * Count building points in a polygon's JSON data
 * @param {Object} polygonData - The polygon data object
 * @returns {number} - The number of building points
 */
function countBuildingPoints(polygonData) {
  try {
    // Check if polygonData has buildingPoints property
    if (!polygonData || !polygonData.buildingPoints) {
      return 0;
    }

    // Count the number of building points
    return Array.isArray(polygonData.buildingPoints) ? polygonData.buildingPoints.length : 0;
  } catch (error) {
    log.error(`Error counting building points: ${error.message}`);
    return 0;
  }
}

/**
 * Parse JSON safely
 * @param {string} jsonString - The JSON string to parse
 * @returns {Object|null} - The parsed object or null if invalid
 */
function safeJsonParse(jsonString) {
  try {
    return jsonString ? JSON.parse(jsonString) : null;
  } catch (error) {
    log.error(`Error parsing JSON: ${error.message}`);
    return null;
  }
}

/**
 * Read polygon data from file
 * @param {string} polygonId - The polygon ID
 * @returns {Object|null} - The polygon data or null if not found
 */
function readPolygonData(polygonId) {
  try {
    const filePath = path.join(__dirname, '..', 'data', `${polygonId}.json`);
    
    if (!fs.existsSync(filePath)) {
      log.warn(`Polygon file not found: ${filePath}`);
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return safeJsonParse(fileContent);
  } catch (error) {
    log.error(`Error reading polygon file: ${error.message}`);
    return null;
  }
}

/**
 * Process all lands and update building points count
 * @param {boolean} dryRun - Whether to run in dry-run mode (no updates)
 */
async function processLands(dryRun = false) {
  log.info(`Starting building points count process${dryRun ? ' (DRY RUN)' : ''}`);
  
  try {
    // Fetch all lands from Airtable
    const lands = await base('LANDS').select().all();
    log.info(`Fetched ${lands.length} lands from Airtable`);
    
    // Track statistics
    const stats = {
      processed: 0,
      updated: 0,
      failed: 0,
      unchanged: 0,
      totalPoints: 0
    };
    
    // Process each land
    for (const land of lands) {
      try {
        const landId = land.id;
        const landName = land.fields.HistoricalName || land.fields.EnglishName || land.fields.LandId || landId;
        const polygonId = land.fields.LandId;
        const currentCount = land.fields.BuildingPointsCount || 0;
        
        // Skip if no polygon ID
        if (!polygonId) {
          log.warn(`Land ${landName} has no LandId, skipping`);
          stats.failed++;
          continue;
        }
        
        // First try to get polygon data from PolygonJSON field
        let polygonData = null;
        if (land.fields.PolygonJSON) {
          polygonData = safeJsonParse(land.fields.PolygonJSON);
          if (polygonData) {
            log.info(`Using PolygonJSON field for land ${landName}`);
          }
        }
        
        // If no polygon data from field, try to read from file
        if (!polygonData) {
          polygonData = readPolygonData(polygonId);
          if (!polygonData) {
            log.warn(`Land ${landName} (${polygonId}) has no polygon data, skipping`);
            stats.failed++;
            continue;
          }
          log.info(`Using polygon data file for land ${landName}`);
        }
        
        // Count building points
        const buildingPointsCount = countBuildingPoints(polygonData);
        stats.totalPoints += buildingPointsCount;
        
        log.info(`Land ${landName}: ${buildingPointsCount} building points`);
        
        // Check if count has changed
        if (buildingPointsCount === currentCount) {
          log.info(`Land ${landName} already has correct count (${currentCount}), skipping update`);
          stats.unchanged++;
          stats.processed++;
          continue;
        }
        
        // Update the land record
        if (!dryRun) {
          await base('LANDS').update(landId, {
            BuildingPointsCount: buildingPointsCount
          });
          
          log.info(`Updated land ${landName} building points count from ${currentCount} to ${buildingPointsCount}`);
          stats.updated++;
        } else {
          log.info(`[DRY RUN] Would update land ${landName} building points count from ${currentCount} to ${buildingPointsCount}`);
          stats.updated++;
        }
        
        stats.processed++;
      } catch (error) {
        log.error(`Error processing land: ${error.message}`);
        stats.failed++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Log summary
    log.info('\nProcess complete!');
    log.info(`Processed: ${stats.processed} lands`);
    log.info(`Updated: ${stats.updated} lands`);
    log.info(`Unchanged: ${stats.unchanged} lands`);
    log.info(`Failed: ${stats.failed} lands`);
    log.info(`Total building points: ${stats.totalPoints}`);
    
  } catch (error) {
    log.error(`Error in building points count process: ${error.message}`);
  }
}

// Check for dry run flag
const dryRun = process.argv.includes('--dry-run');

// Run the script
processLands(dryRun).catch(error => {
  log.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});
