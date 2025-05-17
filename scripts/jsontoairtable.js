const fs = require('fs');
const path = require('path');
const Airtable = require('airtable');
require('dotenv').config();

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Map of collection names to Airtable table names
const TABLE_MAP = {
  'DECREES': 'Decrees',
  'CITIZENS': 'Citizens',
  'TRANSACTIONS': 'Transactions',
  'BUILDINGS': 'Buildings',
  'LOANS': 'Loans',
  'CANALS': 'Canals',
  'WATERPOINTS': 'WaterPoints',
  'WATERPOINTCONNECTIONS': 'WaterPointConnections',
  // Add more mappings as needed
};

// Field mappings for each table (if needed)
const FIELD_MAPPINGS = {
  'DECREES': {
    // If field names in JSON don't match Airtable, map them here
    // 'jsonField': 'airtableField'
  },
  'CANALS': {
    'id': 'Id',
    'points': 'Points',
    'width': 'Width',
    'depth': 'Depth',
    'color': 'Color',
    'createdAt': 'CreatedAt',
    'curvature': 'Curvature'
  },
  'WATERPOINTS': {
    'id': 'Id',
    'position': 'Position',
    'connections': 'Connections',
    'depth': 'Depth',
    'type': 'Type',
    'createdAt': 'CreatedAt'
  },
  // Add more mappings as needed
};

/**
 * Process a JSON file and push its contents to Airtable
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<void>}
 */
async function processJsonFile(filePath) {
  try {
    // Read and parse the JSON file
    const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Track changes to write back to the file
    let hasChanges = false;
    
    // Process each collection in the JSON
    for (const [collectionName, items] of Object.entries(jsonData)) {
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`Skipping empty or invalid collection: ${collectionName}`);
        continue;
      }
      
      // Get the corresponding Airtable table name
      const tableName = TABLE_MAP[collectionName];
      if (!tableName) {
        console.log(`No table mapping found for collection: ${collectionName}`);
        continue;
      }
      
      // Skip the first item in the collection (it's an example)
      const itemsToProcess = items.slice(1);
      
      console.log(`Processing ${itemsToProcess.length} items in collection: ${collectionName} -> ${tableName} (skipped first item as example)`);
      
      // If there are no items to process after skipping the first one, continue to next collection
      if (itemsToProcess.length === 0) {
        console.log(`No items to process in collection: ${collectionName} after skipping example`);
        continue;
      }
      
      // Track successfully processed items
      const successfulItems = [];
      
      // Process items in batches to avoid Airtable API limits
      const BATCH_SIZE = 10;
      for (let i = 0; i < itemsToProcess.length; i += BATCH_SIZE) {
        const batch = itemsToProcess.slice(i, i + BATCH_SIZE);
        
        // Process each item in the batch
        const batchPromises = batch.map(async (item) => {
          try {
            // Map fields if needed
            const mappedItem = mapFields(item, collectionName);
            
            // Create record in Airtable
            const result = await createAirtableRecord(tableName, mappedItem);
            
            console.log(`Successfully added item to ${tableName}: ${result.id}`);
            return { success: true, item };
          } catch (error) {
            console.error(`Error adding item to ${tableName}:`, error.message);
            return { success: false, error: error.message };
          }
        });
        
        // Wait for all items in the batch to be processed
        const results = await Promise.all(batchPromises);
        
        // Track successful items
        results.forEach(result => {
          if (result.success) {
            successfulItems.push(result.item);
          }
        });
        
        // Add a small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < items.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Remove successful items from the collection
      if (successfulItems.length > 0) {
        // Filter out successful items, but keep the first item (example)
        const firstItem = items[0];
        jsonData[collectionName] = [
          firstItem, // Keep the example item
          ...items.slice(1).filter(item => 
            !successfulItems.some(successItem => areItemsEqual(item, successItem))
          )
        ];
        hasChanges = true;
        
        console.log(`Removed ${successfulItems.length} successfully processed items from ${collectionName}`);
      }
    }
    
    // Write the updated JSON back to the file if changes were made
    if (hasChanges) {
      fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
      console.log(`Updated ${filePath} with remaining items`);
    } else {
      console.log(`No changes made to ${filePath}`);
    }
    
  } catch (error) {
    console.error('Error processing JSON file:', error);
    process.exit(1);
  }
}

/**
 * Map fields from JSON format to Airtable format if needed
 * @param {Object} item - The item to map
 * @param {string} collectionName - The collection name
 * @returns {Object} - The mapped item
 */
function mapFields(item, collectionName) {
  const mappings = FIELD_MAPPINGS[collectionName] || {};
  
  // Create a copy of the item to avoid modifying the original
  const mappedItem = { ...item };
  
  // Special handling for date fields with "None" value
  if (collectionName === 'DECREES' && mappedItem.ExpiresAt === 'None') {
    // Set to null which Airtable accepts for empty date fields
    mappedItem.ExpiresAt = null;
  }
  
  // Special handling for CANALS collection
  if (collectionName === 'CANALS') {
    // Convert points array to a string for Airtable
    if (mappedItem.points && Array.isArray(mappedItem.points)) {
      mappedItem.Points = JSON.stringify(mappedItem.points);
      delete mappedItem.points;
    }
    
    // Ensure createdAt is in ISO format
    if (!mappedItem.createdAt) {
      mappedItem.CreatedAt = new Date().toISOString();
    } else {
      mappedItem.CreatedAt = mappedItem.createdAt;
      delete mappedItem.createdAt;
    }
    
    // Ensure other fields follow proper capitalization
    if (mappedItem.width !== undefined) {
      mappedItem.Width = mappedItem.width;
      delete mappedItem.width;
    }
    
    if (mappedItem.depth !== undefined) {
      mappedItem.Depth = mappedItem.depth;
      delete mappedItem.depth;
    }
    
    if (mappedItem.color !== undefined) {
      mappedItem.Color = mappedItem.color;
      delete mappedItem.color;
    }
    
    if (mappedItem.curvature !== undefined) {
      mappedItem.Curvature = mappedItem.curvature;
      delete mappedItem.curvature;
    }
    
    if (mappedItem.id !== undefined) {
      mappedItem.Id = mappedItem.id;
      delete mappedItem.id;
    }
  }
  
  // If there are field mappings, apply them
  if (Object.keys(mappings).length > 0) {
    for (const [jsonField, airtableField] of Object.entries(mappings)) {
      if (item[jsonField] !== undefined) {
        mappedItem[airtableField] = item[jsonField];
        delete mappedItem[jsonField];
      }
    }
  }
  
  return mappedItem;
}

/**
 * Process water point connections to ensure they're properly formatted
 * @param {Array} waterPoints - Array of water points
 * @param {Array} connections - Array of connections
 * @returns {Array} - Processed water points with connections
 */
function processWaterPointConnections(waterPoints, connections) {
  // Create a map of water points by ID for quick lookup
  const waterPointsMap = {};
  waterPoints.forEach(wp => {
    waterPointsMap[wp.id] = wp;
  });
  
  // Process each connection
  connections.forEach(connection => {
    // Find the source water point
    const sourceWaterPoint = waterPointsMap[connection.sourceId];
    if (sourceWaterPoint) {
      // Initialize connections array if it doesn't exist
      if (!sourceWaterPoint.connections) {
        sourceWaterPoint.connections = [];
      } else if (typeof sourceWaterPoint.connections === 'string') {
        // Parse connections if they're stored as a string
        try {
          sourceWaterPoint.connections = JSON.parse(sourceWaterPoint.connections);
        } catch (error) {
          console.warn(`Invalid connections JSON for water point ${sourceWaterPoint.id}:`, error.message);
          sourceWaterPoint.connections = [];
        }
      }
      
      // Add the connection if it doesn't already exist
      const connectionExists = sourceWaterPoint.connections.some(
        conn => conn.targetId === connection.targetId
      );
      
      if (!connectionExists) {
        sourceWaterPoint.connections.push({
          targetId: connection.targetId,
          width: connection.width,
          depth: connection.depth
        });
      }
      
      // Convert connections back to string for storage
      sourceWaterPoint.connections = JSON.stringify(sourceWaterPoint.connections);
    }
  });
  
  return waterPoints;
}

/**
 * Create a record in Airtable
 * @param {string} tableName - The Airtable table name
 * @param {Object} data - The data to insert
 * @returns {Promise<Object>} - The created record
 */
async function createAirtableRecord(tableName, data) {
  return new Promise((resolve, reject) => {
    // Process transferPoints field if it exists and is a string
    if (data.transferPoints && typeof data.transferPoints === 'string') {
      try {
        // Parse the JSON string to ensure it's valid
        JSON.parse(data.transferPoints);
      } catch (error) {
        console.warn(`Invalid transferPoints JSON for ${tableName} record:`, error.message);
        // Set to empty array string if invalid
        data.transferPoints = '[]';
      }
    }
    
    // Process connections field for water points
    if (tableName === 'WaterPoints' && data.connections && typeof data.connections === 'string') {
      try {
        // Parse the connections string to ensure it's valid
        JSON.parse(data.connections);
      } catch (error) {
        console.warn(`Invalid connections JSON for WaterPoint record:`, error.message);
        // Set to empty array string if invalid
        data.connections = '[]';
      }
    }
    
    base(tableName).create(data, (err, record) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(record);
    });
  });
}

/**
 * Compare two items to determine if they are the same
 * @param {Object} item1 - First item
 * @param {Object} item2 - Second item
 * @returns {boolean} - True if items are considered equal
 */
function areItemsEqual(item1, item2) {
  // For simple objects, JSON.stringify comparison works
  // For more complex objects, you might need a more sophisticated comparison
  return JSON.stringify(item1) === JSON.stringify(item2);
}

/**
 * Main function
 */
async function main() {
  // Get the file path from command line arguments
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Please provide a path to the JSON file');
    console.log('Usage: node jsontoairtable.js <path-to-json-file>');
    process.exit(1);
  }
  
  const filePath = path.resolve(args[0]);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`Processing file: ${filePath}`);
  await processJsonFile(filePath);
  console.log('Processing complete');
}

// Run the script
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
