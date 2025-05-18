const fs = require('fs');
const path = require('path');
const Airtable = require('airtable');
require('dotenv').config();

// Configure Airtable
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_CITIZENS_TABLE = 'CITIZENS';

// Initialize Airtable
const initAirtable = () => {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    throw new Error('Airtable credentials not configured');
  }
  
  Airtable.configure({
    apiKey: AIRTABLE_API_KEY
  });
  
  return Airtable.base(AIRTABLE_BASE_ID);
};

// Path to citizens images directory
const CITIZENS_IMAGES_DIR = path.join(__dirname, '../public/images/citizens');

// Main function
async function refactorCitizenImages() {
  try {
    console.log('Starting citizen image refactoring...');
    
    // Check if the citizens images directory exists
    if (!fs.existsSync(CITIZENS_IMAGES_DIR)) {
      console.error(`Citizens images directory not found: ${CITIZENS_IMAGES_DIR}`);
      return;
    }
    
    // Initialize Airtable
    const base = initAirtable();
    
    // Fetch AI citizens from Airtable
    console.log('Fetching AI citizens from Airtable...');
    const records = await base(AIRTABLE_CITIZENS_TABLE)
      .select({
        fields: ['CitizenId', 'Username', 'IsAI'],
        filterByFormula: '{IsAI} = TRUE()'
      })
      .all();
    
    console.log(`Found ${records.length} AI citizens in Airtable`);
    
    // Process each AI citizen
    let successCount = 0;
    let errorCount = 0;
    
    for (const record of records) {
      const citizenId = record.get('CitizenId');
      const username = record.get('Username');
      
      if (!citizenId || !username) {
        console.warn(`Skipping citizen with missing CitizenId or Username: ${record.id}`);
        errorCount++;
        continue;
      }
      
      const sourceFile = path.join(CITIZENS_IMAGES_DIR, `${citizenId}.jpg`);
      const targetFile = path.join(CITIZENS_IMAGES_DIR, `${username}.jpg`);
      
      // Check if source file exists
      if (!fs.existsSync(sourceFile)) {
        console.warn(`Source image not found for citizen ${citizenId} (${username}): ${sourceFile}`);
        errorCount++;
        continue;
      }
      
      // Check if target file already exists
      if (fs.existsSync(targetFile)) {
        console.warn(`Target file already exists for ${username}, skipping: ${targetFile}`);
        errorCount++;
        continue;
      }
      
      try {
        // Copy the file (using copy instead of rename to avoid issues if files are on different drives)
        fs.copyFileSync(sourceFile, targetFile);
        console.log(`Copied ${citizenId}.jpg to ${username}.jpg`);
        
        // Optionally remove the original file
        // Uncomment the next line if you want to delete the original files
        // fs.unlinkSync(sourceFile);
        // console.log(`Deleted original file: ${sourceFile}`);
        
        successCount++;
      } catch (error) {
        console.error(`Error processing image for ${citizenId} (${username}):`, error);
        errorCount++;
      }
    }
    
    console.log('\nImage refactoring completed:');
    console.log(`- Successfully processed: ${successCount} images`);
    console.log(`- Errors/skipped: ${errorCount} images`);
    
  } catch (error) {
    console.error('Error in refactorCitizenImages:', error);
  }
}

// Run the main function
refactorCitizenImages();
