/**
 * Bootstrap Human Citizens Script
 * 
 * This script creates a CITIZENS record for each user in the USERS table
 * that doesn't already have a corresponding citizen.
 */

require('dotenv').config();
const Airtable = require('airtable');
const path = require('path');
const fs = require('fs');

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// Table names
const USERS_TABLE = 'USERS';
const CITIZENS_TABLE = 'CITIZENS';

// Default position for new citizens in Venice
const DEFAULT_POSITION = {
  lat: 45.440840,
  lng: 12.327785
};

// Function to generate a unique citizen ID
function generateCitizenId() {
  return `ctz_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// Function to create a citizen record from a user record
async function createCitizenFromUser(userRecord) {
  const fields = userRecord.fields;
  
  // Skip if no username
  if (!fields.Username) {
    console.log(`Skipping user ${userRecord.id} - no username`);
    return null;
  }
  
  // Check if a citizen with this username already exists
  try {
    const existingCitizens = await base(CITIZENS_TABLE)
      .select({
        filterByFormula: `{Username} = "${fields.Username}"`,
        maxRecords: 1
      })
      .firstPage();
    
    if (existingCitizens && existingCitizens.length > 0) {
      console.log(`Citizen already exists for user ${fields.Username}`);
      return existingCitizens[0];
    }
    
    // Create new citizen record
    const citizenId = generateCitizenId();
    
    // Prepare citizen fields
    const citizenFields = {
      CitizenId: citizenId,
      Username: fields.Username,
      FirstName: fields.FirstName || fields.Username,
      LastName: fields.LastName || 'Citizen',
      SocialClass: 'Facchini', // Default social class
      Description: `A citizen of Venice who recently arrived in the city.`,
      Position: JSON.stringify(DEFAULT_POSITION),
      Wealth: fields.Ducats || 0,
      Prestige: 0,
      CreatedAt: new Date().toISOString()
    };
    
    // Add image URL if coat of arms is available
    if (fields.CoatOfArmsImage) {
      citizenFields.ImageUrl = fields.CoatOfArmsImage;
    }
    
    // Create the citizen record
    const newCitizen = await base(CITIZENS_TABLE).create(citizenFields);
    console.log(`Created new citizen ${citizenId} for user ${fields.Username}`);
    
    return newCitizen;
  } catch (error) {
    console.error(`Error creating citizen for user ${fields.Username}:`, error);
    return null;
  }
}

// Main function to process all users
async function bootstrapHumanCitizens() {
  try {
    console.log('Starting bootstrap of human citizens...');
    
    // Get all users
    const users = await base(USERS_TABLE).select().all();
    console.log(`Found ${users.length} users in the USERS table`);
    
    // Process each user
    const results = {
      total: users.length,
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0
    };
    
    for (const user of users) {
      try {
        results.processed++;
        
        // Create citizen if needed
        const citizen = await createCitizenFromUser(user);
        
        if (citizen) {
          if (citizen._table.name === CITIZENS_TABLE) {
            // This is a newly created citizen
            results.created++;
          } else {
            // This is an existing citizen
            results.skipped++;
          }
        } else {
          results.skipped++;
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        results.errors++;
      }
      
      // Log progress every 10 users
      if (results.processed % 10 === 0 || results.processed === results.total) {
        console.log(`Progress: ${results.processed}/${results.total} users processed`);
      }
    }
    
    // Log final results
    console.log('\nBootstrap complete!');
    console.log(`Total users: ${results.total}`);
    console.log(`Citizens created: ${results.created}`);
    console.log(`Users skipped: ${results.skipped}`);
    console.log(`Errors: ${results.errors}`);
    
  } catch (error) {
    console.error('Error bootstrapping human citizens:', error);
  }
}

// Run the script
bootstrapHumanCitizens()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
