import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();
// Initialize Airtable base
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

// Define citizen interface
interface Citizen {
  id: string;
  socialClass: 'Nobili' | 'Cittadini' | 'Popolani' | 'Laborer';
  firstName: string;
  lastName: string;
  description: string;
  imagePrompt: string;
  ducats: number;
  createdAt: string;
}

// Claude API configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Path to store citizens data
const citizensDataPath = path.join(process.cwd(), 'data', 'citizens.json');

// Ensure the data directory exists
if (!fs.existsSync(path.dirname(citizensDataPath))) {
  fs.mkdirSync(path.dirname(citizensDataPath), { recursive: true });
}

// Load citizens from Airtable
async function loadCitizensFromAirtable(): Promise<Citizen[]> {
  try {
    console.log('Loading existing citizens from Airtable...');
    
    // Verify we have the API key (without showing it in logs)
    if (!process.env.AIRTABLE_API_KEY) {
      throw new Error('AIRTABLE_API_KEY environment variable is not set');
    }
    
    const citizens: Citizen[] = [];
    
    // Fetch records from Airtable with pagination
    await new Promise((resolve, reject) => {
      airtableBase('CITIZENS').select({
        // Optionally specify fields to retrieve
        // fields: ['CitizenId', 'SocialClass', 'FirstName', 'LastName', 'Description', 'ImagePrompt', 'Ducats', 'CreatedAt'],
        // Optionally specify a view
        // view: "Grid view"
      }).eachPage(
        function page(records, fetchNextPage) {
          // Process each page of records
          records.forEach(record => {
            const fields = record.fields;
            citizens.push({
              id: fields.CitizenId?.toString() || record.id,
              socialClass: fields.SocialClass as 'Nobili' | 'Cittadini' | 'Popolani' | 'Laborer',
              firstName: fields.FirstName?.toString() || '',
              lastName: fields.LastName?.toString() || '',
              description: fields.Description?.toString() || '',
              imagePrompt: fields.ImagePrompt?.toString() || '',
              ducats: Number(fields.Ducats) || 0, // Ensure conversion to number
              createdAt: fields.CreatedAt?.toString() || new Date().toISOString()
            });
          });
          
          // Get the next page of records
          fetchNextPage();
        },
        function done(err) {
          if (err) {
            console.error('Error loading citizens from Airtable:', err);
            reject(err);
            return;
          }
          
          console.log(`Successfully loaded ${citizens.length} citizens from Airtable`);
          resolve(citizens);
        }
      );
    });
    
    return citizens;
  } catch (error) {
    console.error('Error in loadCitizensFromAirtable:', error);
    // Return empty array on error, so we can fall back to local file
    return [];
  }
}

// Load existing citizens or create empty array
async function loadExistingCitizens(): Promise<Citizen[]> {
  try {
    // First try to load from Airtable
    const airtableCitizens = await loadCitizensFromAirtable();
    
    if (airtableCitizens.length > 0) {
      console.log(`Loaded ${airtableCitizens.length} citizens from Airtable`);
      return airtableCitizens;
    }
    
    // Fall back to local file if Airtable loading failed or returned empty
    console.log('No citizens found in Airtable or error occurred, falling back to local file...');
    
    if (fs.existsSync(citizensDataPath)) {
      const data = fs.readFileSync(citizensDataPath, 'utf8');
      const localCitizens = JSON.parse(data);
      console.log(`Loaded ${localCitizens.length} citizens from local file`);
      return localCitizens;
    }
  } catch (error) {
    console.error('Error loading existing citizens:', error);
  }
  
  console.log('No existing citizens found, starting fresh');
  return [];
}

// Save citizens to file
function saveCitizens(citizens: Citizen[]): void {
  try {
    fs.writeFileSync(citizensDataPath, JSON.stringify(citizens, null, 2));
    console.log(`Saved ${citizens.length} citizens to ${citizensDataPath}`);
  } catch (error) {
    console.error('Error saving citizens:', error);
  }
}

// Save citizens to Airtable
async function saveCitizensToAirtable(citizens: Citizen[]): Promise<void> {
  try {
    console.log(`Attempting to save ${citizens.length} citizens to Airtable...`);
    console.log(`Using Airtable base ID: ${process.env.AIRTABLE_BASE_ID}`);
    
    // Verify we have the API key (without showing it in logs)
    if (!process.env.AIRTABLE_API_KEY) {
      throw new Error('AIRTABLE_API_KEY environment variable is not set');
    }
    
    // Prepare records for Airtable with capitalized field names
    const records = citizens.map(citizen => ({
      fields: {
        CitizenId: citizen.id, // This is now the username
        Username: citizen.id,  // Also populate the Username field with the username
        SocialClass: citizen.socialClass,
        FirstName: citizen.firstName,
        LastName: citizen.lastName,
        Description: citizen.description,
        ImagePrompt: citizen.imagePrompt,
        Ducats: citizen.ducats,
        CreatedAt: citizen.createdAt
      }
    }));
    
    // Log the first record structure (without sensitive data)
    console.log('Sample record structure:', JSON.stringify({
      fields: {
        CitizenId: 'sample-id',
        SocialClass: 'sample-class',
        // other fields...
      }
    }));
    
    // Split records into chunks of 10 (Airtable's limit for batch operations)
    const chunks = [];
    for (let i = 0; i < records.length; i += 10) {
      chunks.push(records.slice(i, i + 10));
    }
    
    console.log(`Split into ${chunks.length} chunks for processing`);
    
    // Process each chunk with proper promise handling
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i+1} of ${chunks.length} (${chunk.length} records)`);
      
      try {
        await new Promise((resolve, reject) => {
          airtableBase('CITIZENS').create(chunk, function(err: any, records: any) {
            if (err) {
              console.error('Error saving chunk to Airtable:', err);
              reject(err);
              return;
            }
            console.log(`Successfully saved chunk ${i+1} with ${records.length} citizens to Airtable`);
            resolve(records);
          });
        });
      } catch (chunkError) {
        console.error(`Error processing chunk ${i+1}:`, chunkError);
        // Continue with next chunk instead of failing the entire operation
        continue;
      }
      
      // Add a small delay between chunks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('Successfully completed Airtable save operation');
  } catch (error) {
    console.error('Error in saveCitizensToAirtable:', error);
    throw error; // Re-throw to allow the calling function to handle it
  }
}

// Generate a system prompt with context and existing names
function generateSystemPrompt(existingCitizens: Citizen[]): string {
  // Extract existing names to avoid duplicates
  const existingNames = existingCitizens.map(citizen => 
    `${citizen.firstName} ${citizen.lastName}`
  );
  
  return `You are a historical expert on Renaissance Venice (1400-1600) helping to create citizens for a historically accurate economic simulation game called La Serenissima.

ABOUT THE GAME:
La Serenissima is a sophisticated economic simulation set in Renaissance Venice where players participate in a historically authentic recreation of Venetian commerce, politics, and society. The game features:
- A closed economic system where wealth must be captured rather than created from nothing
- Land ownership, building construction, and resource management
- Social hierarchies and political influence
- AI citizens who participate in the economy as consumers, workers, and entrepreneurs

CITIZEN SOCIAL CLASSES:
1. Nobili - The noble families who control Venice's government. Ducatsy, politically powerful, and often involved in long-distance trade.
2. Cittadini - Ducatsy non-noble citizens, including successful merchants, professionals, and high-ranking bureaucrats.
3. Popolani - Common citizens including craftsmen, shopkeepers, and skilled workers.
4. Laborers - Unskilled workers, servants, gondoliers, and the working poor.

EXISTING CITIZENS (DO NOT DUPLICATE THESE NAMES):
${existingNames.join(', ')}

TASK:
Create 10 unique Venetian citizens with historically accurate names, descriptions, and characteristics. For each citizen, provide:
1. SocialClass - One of: Nobili, Cittadini, Popolani, or Laborer
2. FirstName - Historically accurate Venetian first name
3. LastName - Historically accurate Venetian family name (ensure nobili have notable Venetian noble family names)
4. Description - One sentence about personality, traits, and remarkable things about this person
5. ImagePrompt - A detailed prompt for generating an image of this person, including physical appearance, clothing appropriate to their social class, and setting
6. Ducats - Approximate wealth in Ducats, appropriate to their social class

DISTRIBUTION GUIDELINES:
- Nobili: Create 1, wealth range 5,000-50,000 ducats
- Cittadini: Create 2, wealth range 1,000-5,000 ducats
- Popolani: Create 4, wealth range 100-1,000 ducats
- Laborers: Create 3, wealth range 10-100 ducats

FORMAT:
Return the data as a valid JSON array with 10 objects, each containing the fields listed above.`;
}

// Generate the citizen prompt for Claude
function generateCitizenPrompt(): string {
  return `Please generate 10 unique Venetian citizens for our game. 
  
Each citizen should have these fields:
- socialClass (Nobili, Cittadini, Popolani, or Laborer)
- firstName (historically accurate Venetian name)
- lastName (historically accurate Venetian family name)
- description (one sentence about personality, traits, and remarkable things)
- imagePrompt (detailed prompt for generating an image of this person)
- wealth (in Ducats, appropriate to their social class)

Please ensure the distribution roughly follows the guidelines in the system prompt, and that all names are historically accurate and not duplicates of existing citizens.

Return ONLY a valid JSON array with no additional text.`;
}

// Utility function for exponential backoff
async function executeWithBackoff(fn: () => Promise<any>, maxRetries: number = 5): Promise<any> {
  let retries = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      if (retries > maxRetries) {
        console.error(`Failed after ${maxRetries} retries:`, error);
        throw error;
      }
      
      // Calculate exponential backoff time with jitter
      const baseWaitTime = Math.pow(2, retries) * 1000; // 2^retries seconds
      const jitter = Math.random() * 0.5 + 0.75; // Random between 0.75 and 1.25
      const waitTime = baseWaitTime * jitter;
      
      console.warn(`Attempt ${retries} failed. Retrying in ${Math.round(waitTime/1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Call Claude API to generate citizens
async function generateCitizensWithClaude(existingCitizens: Citizen[]): Promise<Citizen[]> {
  return executeWithBackoff(async () => {
    try {
      const response = await axios.post(
        CLAUDE_API_URL,
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: generateSystemPrompt(existingCitizens),
          messages: [
            {
              role: "citizen",
              content: generateCitizenPrompt()
            }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          }
        }
      );

      // Extract the JSON from Claude's response
      const content = response.data.content[0].text;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (!jsonMatch) {
        throw new Error('Could not extract JSON from Claude response');
      }
      
      const jsonString = jsonMatch[0];
      const newCitizensFromClaude: Omit<Citizen, 'id' | 'createdAt'>[] = JSON.parse(jsonString);

      const allCurrentIds = existingCitizens.map(c => c.id); // Existing IDs

      return newCitizensFromClaude.map(rawCitizen => {
        // Generate username from FirstName and LastName
        const firstInitial = rawCitizen.firstName ? rawCitizen.firstName.charAt(0) : '';
        const lastNameSanitized = rawCitizen.lastName ? rawCitizen.lastName.replace(/[^a-zA-Z0-9]/g, '') : 'Citizen';
        let baseUsername = (firstInitial + lastNameSanitized).toLowerCase();

        if (!baseUsername || baseUsername.length === 0) { // Fallback if name parts are empty
            baseUsername = 'newcitizen';
        }

        let username = baseUsername;
        let counter = 1;
        // Ensure username is unique against existing citizens and those already processed in this batch
        while (allCurrentIds.includes(username)) {
            username = `${baseUsername}${counter}`;
            counter++;
        }
        allCurrentIds.push(username); // Add to current batch's IDs to ensure uniqueness within the batch

        return {
          ...rawCitizen,
          id: username, // Set citizen.id to the generated username
          createdAt: new Date().toISOString()
        };
      });
      
    } catch (error) {
      console.error('Error generating citizens with Claude:', error);
      throw error;
    }
  });
}

// Generate a unique ID for each citizen
function generateUniqueId(): string {
  return 'ctz_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Main function to generate citizens
async function generateCitizens(batchCount: number = 1): Promise<void> {
  try {
    const existingCitizens = await loadExistingCitizens();
    console.log(`Loaded ${existingCitizens.length} existing citizens`);
    
    let newCitizens: Citizen[] = [];
    
    let allCitizens = [...existingCitizens];
    
    for (let i = 0; i < batchCount; i++) {
      console.log(`Generating batch ${i + 1} of ${batchCount}...`);
      
      // Use executeWithBackoff for the entire batch generation process
      const batchCitizens = await executeWithBackoff(() => generateCitizensWithClaude([...allCitizens]));
      
      // Validate new citizens in this batch
      validateCitizens(batchCitizens);
      
      // Add batch citizens to our tracking arrays
      newCitizens = [...newCitizens, ...batchCitizens];
      allCitizens = [...allCitizens, ...batchCitizens];
      
      console.log(`Generated ${batchCitizens.length} citizens in batch ${i + 1}`);
      
      // Save this batch to Airtable immediately
      try {
        console.log(`Saving batch ${i + 1} to Airtable...`);
        await saveCitizensToAirtable(batchCitizens);
        console.log(`Successfully saved batch ${i + 1} to Airtable`);
      } catch (airtableError) {
        console.error(`Failed to save batch ${i + 1} to Airtable:`, airtableError);
        console.log('Continuing with local file save only for this batch');
      }
      
      // Save all citizens to local file after each batch
      saveCitizens(allCitizens);
      console.log(`Saved all ${allCitizens.length} citizens to local file after batch ${i + 1}`);
      
      // Add a delay between batches with some randomization to avoid predictable patterns
      if (i < batchCount - 1) {
        const delay = 2000 + Math.random() * 1000;
        console.log(`Waiting ${Math.round(delay/1000)} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.log(`Successfully generated ${newCitizens.length} new citizens across ${batchCount} batches`);
    console.log(`Total citizens: ${allCitizens.length}`);
    
  } catch (error) {
    console.error('Error in generateCitizens:', error);
  }
}

// Validate citizens data
function validateCitizens(citizens: Citizen[]): void {
  const issues: string[] = [];
  
  citizens.forEach((citizen, index) => {
    if (!citizen.socialClass) issues.push(`Citizen ${index} missing socialClass`);
    if (!citizen.firstName) issues.push(`Citizen ${index} missing firstName`);
    if (!citizen.lastName) issues.push(`Citizen ${index} missing lastName`);
    if (!citizen.description) issues.push(`Citizen ${index} missing description`);
    if (!citizen.imagePrompt) issues.push(`Citizen ${index} missing imagePrompt`);
    if (citizen.ducats === undefined) issues.push(`Citizen ${index} missing wealth`);
    
    // Validate social class
    if (citizen.socialClass && !['Nobili', 'Cittadini', 'Popolani', 'Laborer'].includes(citizen.socialClass)) {
      issues.push(`Citizen ${index} has invalid socialClass: ${citizen.socialClass}`);
    }
    
    // Validate wealth ranges
    if (citizen.ducats !== undefined) {
      const wealthRanges = {
        'Nobili': [5000, 50000],
        'Cittadini': [1000, 5000],
        'Popolani': [100, 1000],
        'Laborer': [10, 100]
      };
      
      if (citizen.socialClass && wealthRanges[citizen.socialClass]) {
        const [min, max] = wealthRanges[citizen.socialClass];
        if (citizen.ducats < min || citizen.ducats > max) {
          issues.push(`Citizen ${index} (${citizen.socialClass}) has wealth ${citizen.ducats} outside expected range ${min}-${max}`);
        }
      }
    }
  });
  
  if (issues.length > 0) {
    console.warn('Validation issues found:');
    issues.forEach(issue => console.warn(`- ${issue}`));
  } else {
    console.log('All citizens passed validation');
  }
}

// Command line interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const batchCount = args.length > 0 ? parseInt(args[0]) : 1;
  
  if (isNaN(batchCount) || batchCount < 1) {
    console.error('Please provide a valid batch count (positive integer)');
    process.exit(1);
  }
  
  console.log(`Starting citizen generation: ${batchCount} batch(es) of 10 citizens each`);
  await generateCitizens(batchCount);
}

// Run the script
main().catch(console.error);
