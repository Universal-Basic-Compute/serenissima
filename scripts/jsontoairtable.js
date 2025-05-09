const fs = require('fs');
const path = require('path');
const Airtable = require('airtable');
require('dotenv').config();

// Configure Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Map of collection names to Airtable table names
const TABLE_MAP = {
  'DECREES': 'Decrees',
  'USERS': 'Users',
  'TRANSACTIONS': 'Transactions',
  'BUILDINGS': 'Buildings',
  'LOANS': 'Loans',
  'WATER_ROADS': 'WaterRoads',
  // Add more mappings as needed
};

// Field mappings for each table (if needed)
const FIELD_MAPPINGS = {
  'DECREES': {
    // If field names in JSON don't match Airtable, map them here
    // 'jsonField': 'airtableField'
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
      
      console.log(`Processing ${items.length} items in collection: ${collectionName} -> ${tableName}`);
      
      // Track successfully processed items
      const successfulItems = [];
      
      // Process items in batches to avoid Airtable API limits
      const BATCH_SIZE = 10;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        
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
        // Filter out successful items
        jsonData[collectionName] = items.filter(item => 
          !successfulItems.some(successItem => areItemsEqual(item, successItem))
        );
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
 * Create a record in Airtable
 * @param {string} tableName - The Airtable table name
 * @param {Object} data - The data to insert
 * @returns {Promise<Object>} - The created record
 */
async function createAirtableRecord(tableName, data) {
  return new Promise((resolve, reject) => {
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
