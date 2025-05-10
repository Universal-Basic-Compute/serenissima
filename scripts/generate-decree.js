const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

// Get the Claude API key from environment variables
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
if (!CLAUDE_API_KEY) {
  console.error('Error: CLAUDE_API_KEY environment variable is not set');
  process.exit(1);
}

// Function to generate a decree using Claude
async function generateDecree(input) {
  console.log('Generating decree based on input...');
  
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-7-sonnet-latest',
        max_tokens: 4000,
        system: `You are a decree generator for La Serenissima, a digital recreation of Renaissance Venice. 
        Your task is to create a historically plausible decree based on the user's input.
        
        Generate a JSON object with the following fields:
        - DecreeId: A unique identifier (use a UUID format)
        - Type: One of [Economic, Social, Political, Military, Religious, Cultural]
        - Title: A formal title for the decree in Renaissance Venetian style
        - Description: A detailed description of what the decree does
        - Rationale: The official reasoning behind the decree
        - Status: Always "Under Review"
        - Category: A broad category for the decree
        - Subcategory: A more specific subcategory
        - Proposer: Always "ConsiglioDeiDieci" (The Council of Ten)
        - FlavorText: A quote or saying related to the decree
        - HistoricalInspiration: A brief note about any real historical precedent
        - Notes: Any additional implementation notes or considerations
        
        Make sure the decree is historically plausible for Renaissance Venice (1400-1600).
        The output should be valid JSON only, with no additional text or explanation.`,
        messages: [
          {
            role: 'user',
            content: `Create a decree based on the following input: "${input}"`
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
    
    // Parse the JSON
    try {
      const decree = JSON.parse(content);
      console.log('Successfully generated decree');
      return decree;
    } catch (parseError) {
      console.error('Error parsing Claude response as JSON:', parseError);
      console.log('Raw response:', content);
      throw new Error('Failed to parse Claude response as JSON');
    }
  } catch (error) {
    console.error('Error calling Claude API:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw new Error('Failed to generate decree with Claude');
  }
}

// Function to save decree to jsontoairtable.json
function saveDecreeToJson(decree) {
  console.log('Saving decree to jsontoairtable.json...');
  
  const filePath = path.join(__dirname, '..', 'jsontoairtable.json');
  
  try {
    // Read the existing file
    let jsonData = { DECREES: [] };
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      jsonData = JSON.parse(fileContent);
      
      // Ensure DECREES array exists
      if (!jsonData.DECREES) {
        jsonData.DECREES = [];
      }
    }
    
    // Add the new decree to the beginning of the array (after the example item)
    if (jsonData.DECREES.length > 0) {
      // Keep the first item (example) and add the new decree after it
      jsonData.DECREES = [
        jsonData.DECREES[0],
        decree,
        ...jsonData.DECREES.slice(1)
      ];
    } else {
      // If there are no items, add an example item first
      const exampleDecree = {
        DecreeId: "example-decree-id",
        Type: "Economic",
        Title: "Example Decree (DO NOT SYNC)",
        Description: "This is an example decree. It will not be synced to Airtable.",
        Rationale: "This serves as a template for the decree structure.",
        Status: "Example",
        Category: "Example",
        Subcategory: "Template",
        Proposer: "System",
        FlavorText: "Examples illuminate the path forward.",
        HistoricalInspiration: "None - this is just an example.",
        Notes: "This first item is always skipped during synchronization."
      };
      
      jsonData.DECREES = [exampleDecree, decree];
    }
    
    // Write the updated data back to the file
    fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
    console.log('Decree saved successfully');
    
    return true;
  } catch (error) {
    console.error('Error saving decree to JSON file:', error);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Get user input from command line arguments
    const userInput = process.argv.slice(2).join(' ');
    
    if (!userInput) {
      console.error('Please provide a description for the decree');
      console.log('Usage: node generate-decree.js "Your decree description here"');
      process.exit(1);
    }
    
    // Generate the decree
    const decree = await generateDecree(userInput);
    
    // Save the decree to jsontoairtable.json
    saveDecreeToJson(decree);
    
    console.log('\nDecree generated successfully and saved to jsontoairtable.json');
    console.log('\nTo push to Airtable, run:');
    console.log('node jsontoairtable.js jsontoairtable.json');
    
  } catch (error) {
    console.error('Error in decree generation process:', error);
    process.exit(1);
  }
}

// Run the main function
main();
