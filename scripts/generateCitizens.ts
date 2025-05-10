import axios from 'axios';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Define citizen interface
interface Citizen {
  id: string;
  socialClass: 'Patrician' | 'Cittadini' | 'Popolani' | 'Laborer';
  firstName: string;
  lastName: string;
  description: string;
  imagePrompt: string;
  wealth: number;
  createdAt: string;
}

// Claude API configuration
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

// Path to store citizens data
const CITIZENS_DATA_PATH = path.join(process.cwd(), 'data', 'citizens.json');

// Ensure the data directory exists
if (!fs.existsSync(path.dirname(CITIZENS_DATA_PATH))) {
  fs.mkdirSync(path.dirname(CITIZENS_DATA_PATH), { recursive: true });
}

// Load existing citizens or create empty array
function loadExistingCitizens(): Citizen[] {
  try {
    if (fs.existsSync(CITIZENS_DATA_PATH)) {
      const data = fs.readFileSync(CITIZENS_DATA_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading existing citizens:', error);
  }
  return [];
}

// Save citizens to file
function saveCitizens(citizens: Citizen[]): void {
  try {
    fs.writeFileSync(CITIZENS_DATA_PATH, JSON.stringify(citizens, null, 2));
    console.log(`Saved ${citizens.length} citizens to ${CITIZENS_DATA_PATH}`);
  } catch (error) {
    console.error('Error saving citizens:', error);
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
1. Patricians - The noble families who control Venice's government. Wealthy, politically powerful, and often involved in long-distance trade.
2. Cittadini - Wealthy non-noble citizens, including successful merchants, professionals, and high-ranking bureaucrats.
3. Popolani - Common citizens including craftsmen, shopkeepers, and skilled workers.
4. Laborers - Unskilled workers, servants, gondoliers, and the working poor.

EXISTING CITIZENS (DO NOT DUPLICATE THESE NAMES):
${existingNames.join(', ')}

TASK:
Create 10 unique Venetian citizens with historically accurate names, descriptions, and characteristics. For each citizen, provide:
1. SocialClass - One of: Patrician, Cittadini, Popolani, or Laborer
2. FirstName - Historically accurate Venetian first name
3. LastName - Historically accurate Venetian family name (ensure patricians have notable Venetian noble family names)
4. Description - One sentence about personality, traits, and remarkable things about this person
5. ImagePrompt - A detailed prompt for generating an image of this person, including physical appearance, clothing appropriate to their social class, and setting
6. Wealth - Approximate wealth in Ducats, appropriate to their social class

DISTRIBUTION GUIDELINES:
- Patricians: 10% of population, wealth range 5,000-50,000 ducats
- Cittadini: 20% of population, wealth range 1,000-5,000 ducats
- Popolani: 40% of population, wealth range 100-1,000 ducats
- Laborers: 30% of population, wealth range 10-100 ducats

FORMAT:
Return the data as a valid JSON array with 10 objects, each containing the fields listed above.`;
}

// Generate the user prompt for Claude
function generateUserPrompt(): string {
  return `Please generate 10 unique Venetian citizens for our game. 
  
Each citizen should have these fields:
- socialClass (Patrician, Cittadini, Popolani, or Laborer)
- firstName (historically accurate Venetian name)
- lastName (historically accurate Venetian family name)
- description (one sentence about personality, traits, and remarkable things)
- imagePrompt (detailed prompt for generating an image of this person)
- wealth (in Ducats, appropriate to their social class)

Please ensure the distribution roughly follows the guidelines in the system prompt, and that all names are historically accurate and not duplicates of existing citizens.

Return ONLY a valid JSON array with no additional text.`;
}

// Call Claude API to generate citizens
async function generateCitizensWithClaude(existingCitizens: Citizen[]): Promise<Citizen[]> {
  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: "claude-3-7-sonnet-latest",
        max_tokens: 4000,
        system: generateSystemPrompt(existingCitizens),
        messages: [
          {
            role: "user",
            content: generateUserPrompt()
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
    const newCitizens: Citizen[] = JSON.parse(jsonString);
    
    // Add IDs and creation timestamp
    return newCitizens.map(citizen => ({
      ...citizen,
      id: generateUniqueId(),
      createdAt: new Date().toISOString()
    }));
    
  } catch (error) {
    console.error('Error generating citizens with Claude:', error);
    throw error;
  }
}

// Generate a unique ID for each citizen
function generateUniqueId(): string {
  return 'ctz_' + Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Main function to generate citizens
async function generateCitizens(batchCount: number = 1): Promise<void> {
  try {
    const existingCitizens = loadExistingCitizens();
    console.log(`Loaded ${existingCitizens.length} existing citizens`);
    
    let newCitizens: Citizen[] = [];
    
    for (let i = 0; i < batchCount; i++) {
      console.log(`Generating batch ${i + 1} of ${batchCount}...`);
      const batchCitizens = await generateCitizensWithClaude([...existingCitizens, ...newCitizens]);
      newCitizens = [...newCitizens, ...batchCitizens];
      console.log(`Generated ${batchCitizens.length} citizens in batch ${i + 1}`);
      
      // Optional: Add a delay between batches to avoid API rate limits
      if (i < batchCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Validate new citizens
    validateCitizens(newCitizens);
    
    // Add new citizens to existing ones and save
    const allCitizens = [...existingCitizens, ...newCitizens];
    saveCitizens(allCitizens);
    
    console.log(`Successfully generated ${newCitizens.length} new citizens`);
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
    if (citizen.wealth === undefined) issues.push(`Citizen ${index} missing wealth`);
    
    // Validate social class
    if (citizen.socialClass && !['Patrician', 'Cittadini', 'Popolani', 'Laborer'].includes(citizen.socialClass)) {
      issues.push(`Citizen ${index} has invalid socialClass: ${citizen.socialClass}`);
    }
    
    // Validate wealth ranges
    if (citizen.wealth !== undefined) {
      const wealthRanges = {
        'Patrician': [5000, 50000],
        'Cittadini': [1000, 5000],
        'Popolani': [100, 1000],
        'Laborer': [10, 100]
      };
      
      if (citizen.socialClass && wealthRanges[citizen.socialClass]) {
        const [min, max] = wealthRanges[citizen.socialClass];
        if (citizen.wealth < min || citizen.wealth > max) {
          issues.push(`Citizen ${index} (${citizen.socialClass}) has wealth ${citizen.wealth} outside expected range ${min}-${max}`);
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
