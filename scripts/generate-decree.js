const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
require('dotenv').config();

// Get the Gemini API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Function to generate a decree using Gemini
async function generateDecree(input) {
  console.log('Generating decree based on input using Gemini...');
  
  try {
    // Load article content for context
    const articleContext = `
    ECONOMIC SYSTEM ARTICLE EXCERPTS:
    La Serenissima features a sophisticated economic simulation based on historical Venetian commerce. It operates as a zero-sum economy where wealth must be captured rather than created from nothing. Every ducat in circulation represents real value within the system.
    
    Value flows through a continuous cycle: Land is leased to Building owners, who rent space to Businesses, which produce Resources, which supply Citizens and Players. Money flows in the opposite direction: Business owners pay rent to Building owners, who pay land leases to Land owners, and all pay taxes to the Republic—completing the economic loop.
    
    The Republic reinvests 10% of its total treasury daily back into its citizens through direct transfers of Ducats. This represents grain subsidies, public investments, economic stimulus, and social stability measures.
    
    GOVERNANCE ARTICLE EXCERPTS:
    In La Serenissima, unlike traditional games where rules are fixed, the governance system itself is part of the gameplay. As players rise in wealth and status, they gain the ability to shape the very rules that govern the economic simulation.
    
    The governance structure includes The Great Council (nobili nobility only), The Senate (handles economic matters), The Council of Ten (security and important matters), The Collegio (day-to-day administration), The Doge (elected leader), and Guild Leadership (industry regulation).
    
    Decree types include Economic Decrees (tax adjustments, trade regulations, guild charters, price controls, citizen subsidies), Infrastructure Decrees (building permits, canal improvements, public works, district development), and Social Decrees (public celebrations, religious patronage, educational initiatives, public health measures).
    
    LAND OWNERSHIP ARTICLE EXCERPTS:
    Land in Venice is not merely property—it is power. The closed economic system of La Serenissima means that wealth must be captured rather than created from nothing. As a landowner, you stand at the beginning of the economic cycle.
    
    All land leases in Venice are subject to a 20% tax known as the Vigesima (literally "twentieth"). This tax is automatically collected by the Republic on all lease income, reducing your net revenue to 80% of the gross lease amount.
    
    BUILDING OWNERSHIP ARTICLE EXCERPTS:
    Buildings are the nexus where all economic activity converges. They provide space for businesses to operate and generate wealth, house citizens who provide labor and consume resources, create value from land through development, generate ongoing income through rents and fees, and serve as physical manifestations of wealth and status.
    
    BUSINESS OWNERSHIP ARTICLE EXCERPTS:
    In Renaissance Venice, business partnerships are rarely just about commerce—they're about creating alliances, securing access to new resources, and consolidating influence. Form partnerships with players who control complementary assets or skills.
    
    STRATEGIES ARTICLE EXCERPTS:
    In Renaissance Venice, true power was rarely achieved through direct means. The most successful nobili understood that manipulation of people, systems, and perceptions was far more effective than brute economic force.
    
    By strategically acquiring land that forms natural chokepoints, you can effectively blockade parts of Venice from ground transportation. This forces competitors to rely on more expensive water transportation, increasing their costs while your own goods flow freely.
    `;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro-latest", // Or "gemini-1.5-flash-latest"
      generationConfig: {
        responseMimeType: "application/json", // Request JSON output
      },
      safetySettings: [ // Adjust safety settings as needed
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });

    const systemInstruction = `You are a decree generator for La Serenissima, a digital recreation of Renaissance Venice. 
Your task is to create a historically plausible decree based on the citizen's input.

ABOUT LA SERENISSIMA:
La Serenissima is a blockchain-based economic simulation set in Renaissance Venice (1400-1600).
The game features a closed economic system where wealth circulates rather than being created from nothing.
Players can own land, construct buildings, operate businesses, and participate in governance.
The economy includes AI citizens who work, consume goods, and participate in the economy.
The currency is $COMPUTE (represented as Ducats in-game), which flows through all economic activities.

KEY ECONOMIC ELEMENTS:
- Land is leased to building owners who pay land leases
- Buildings are rented to businesses who pay rent
- Businesses produce resources and goods
- Resources supply both players and AI citizens
- The Republic collects taxes and redistributes 10% of its treasury daily to citizens
- Guilds regulate various industries and crafts
- Transportation networks (canals, bridges, roads) affect commerce

GOVERNANCE STRUCTURE:
- The Great Council (nobili nobility only)
- The Senate (handles economic matters)
- The Council of Ten (security and important matters)
- The Collegio (day-to-day administration)
- The Doge (elected leader)
- Guild Leadership (industry regulation)

${articleContext}

Generate a JSON object with the following fields:
- DecreeId: A unique identifier (use a UUID format)
- Type: One of [Economic, Social, Political, Military, Religious, Cultural]
- Title: A formal title for the decree in English (not Italian)
- Description: A detailed description of what the decree does
- Rationale: The official reasoning behind the decree
- Status: Always "Under Review"
- Category: A broad category for the decree
- SubCategory: A more specific subCategory
- Proposer: Always "ConsiglioDeiDieci" (The Council of Ten)
- FlavorText: A quote or saying related to the decree
- HistoricalInspiration: A brief note about any real historical precedent
- Notes: Any additional implementation notes or considerations

Make sure the decree is historically plausible for Renaissance Venice (1400-1600).
The output should be valid JSON only, with no additional text or explanation.
Important: The Title must be in English, not Italian.`;
    
    const prompt = `Create a decree based on the following input: "${input}"`;

    const result = await model.generateContent([systemInstruction, prompt]);
    const response = await result.response;
    const text = response.text();
    
    // Parse the JSON
    try {
      const decree = JSON.parse(text);
      console.log('Successfully generated decree with Gemini');
      return decree;
    } catch (parseError) {
      console.error('Error parsing Gemini response as JSON:', parseError);
      console.log('Raw response from Gemini:', text);
      throw new Error('Failed to parse Gemini response as JSON');
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error.message || error);
    if (error.response) { // Axios-like error structure
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw new Error('Failed to generate decree with Gemini');
  }
}

// Function to push decree directly to Airtable
async function pushDecreeToAirtable(decree) {
  console.log('Pushing decree directly to Airtable...');
  
  try {
    // Get Airtable configuration
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable API key or base ID not configured');
    }
    
    // Initialize Airtable
    const Airtable = require('airtable');
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Create the decree record in Airtable
    const record = await base('DECREES').create({
      DecreeId: decree.DecreeId,
      Type: decree.Type,
      Title: decree.Title,
      Description: decree.Description,
      Rationale: decree.Rationale,
      Status: decree.Status,
      Category: decree.Category,
      SubCategory: decree.SubCategory,
      Proposer: decree.Proposer,
      FlavorText: decree.FlavorText,
      HistoricalInspiration: decree.HistoricalInspiration,
      Notes: decree.Notes,
      CreatedAt: new Date().toISOString()
    });
    
    console.log(`Successfully created decree in Airtable with ID: ${record.id}`);
    return record.id;
  } catch (error) {
    console.error('Error pushing decree to Airtable:', error);
    throw new Error('Failed to push decree to Airtable');
  }
}

// Function to create notifications for all citizens about the new decree
async function createDecreeNotifications(decree) {
  console.log('Creating notifications for all citizens about the new decree...');
  
  try {
    // Get Airtable configuration
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
    
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      throw new Error('Airtable API key or base ID not configured');
    }
    
    // Initialize Airtable
    const Airtable = require('airtable');
    const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
    
    // Get all citizens from Airtable
    const citizens = await base('CITIZENS').select().all();
    console.log(`Found ${citizens.length} citizens to notify`);
    
    // Log sample citizen record to understand structure
    if (citizens.length > 0) {
      console.log('Sample citizen record structure:', JSON.stringify(citizens[0], null, 2));
    }
    
    // Create notification content
    const notificationContent = `New Decree Proposed: ${decree.Title}`;
    const notificationDetails = {
      decreeId: decree.DecreeId,
      type: decree.Type,
      category: decree.Category,
      subCategory: decree.SubCategory,
      description: decree.Description.substring(0, 100) + (decree.Description.length > 100 ? '...' : '')
    };
    
    // Create notifications for each citizen
    const notificationPromises = citizens.map(citizen => {
      return base('NOTIFICATIONS').create({
        NotificationId: `decree-${decree.DecreeId}-citizen-${citizen.id}`,
        Type: 'Decree',
        Citizen: citizen.id, // Use citizen ID directly instead of array
        Content: notificationContent,
        Details: JSON.stringify(notificationDetails),
        ReadAt: null,
        CreatedAt: new Date().toISOString()
      });
    });
    
    // Wait for all notifications to be created
    await Promise.all(notificationPromises);
    console.log(`Created ${citizens.length} notifications for the new decree`);
    
    return true;
  } catch (error) {
    console.error('Error creating decree notifications:', error);
    return false;
  }
}

// Function to send a Telegram notification with the decree
async function sendTelegramNotification(decree) {
  console.log('Sending Telegram notification about the new decree...');
  
  try {
    // Get Telegram configuration
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = "-1002585507870"; // The chat ID you specified
    
    if (!TELEGRAM_BOT_TOKEN) {
      // throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
      console.warn('Warning: TELEGRAM_BOT_TOKEN environment variable is not set. Skipping Telegram notification.');
      return false;
    }
    
    // Create the message text
    const messageText = `🔰 *NEW DECREE* 🔰\n\n` +
      `*${decree.Title}*\n\n` +
      `*Type:* ${decree.Type}\n` +
      `*Category:* ${decree.Category} - ${decree.SubCategory}\n\n` +
      `*Description:*\n${decree.Description}\n\n` +
      `*Rationale:*\n${decree.Rationale}\n\n` +
      `*Proposed by:* ${decree.Proposer}\n\n` +
      `"${decree.FlavorText}"`;
    
    // Send the message via Telegram API
    const axios = require('axios'); // Ensure axios is required if not already at the top
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: messageText,
        parse_mode: 'Markdown'
      }
    );
    
    if (response.data.ok) {
      console.log('Telegram notification sent successfully');
      return true;
    } else {
      throw new Error(`Telegram API error: ${response.data.description}`);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Get citizen input from command line arguments
    const citizenInput = process.argv.slice(2).join(' ');
    
    if (!citizenInput) {
      console.error('Please provide a description for the decree');
      console.log('Usage: node generate-decree.js "Your decree description here"');
      process.exit(1);
    }
    
    // Generate the decree
    const decree = await generateDecree(citizenInput);
    
    // Push the decree directly to Airtable
    const recordId = await pushDecreeToAirtable(decree);
    
    // Create notifications for all citizens
    await createDecreeNotifications(decree);
    
    // Send Telegram notification
    await sendTelegramNotification(decree);
    
    console.log('\nDecree generated successfully and pushed to Airtable');
    console.log('Notifications created for all citizens');
    console.log('Telegram notification sent to chat');
    console.log(`Airtable Record ID: ${recordId}`);
    
  } catch (error) {
    console.error('Error in decree generation process:', error);
    process.exit(1);
  }
}

// Run the main function
main();
