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
        - The Great Council (patrician nobility only)
        - The Senate (handles economic matters)
        - The Council of Ten (security and important matters)
        - The Collegio (day-to-day administration)
        - The Doge (elected leader)
        - Guild Leadership (industry regulation)
        
        Generate a JSON object with the following fields:
        - DecreeId: A unique identifier (use a UUID format)
        - Type: One of [Economic, Social, Political, Military, Religious, Cultural]
        - Title: A formal title for the decree in English (not Italian)
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
        The output should be valid JSON only, with no additional text or explanation.
        Important: The Title must be in English, not Italian.`,
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
      // Extract JSON content more reliably by finding the first { and last }
      let jsonContent = content;
      const startIndex = content.indexOf('{');
      const endIndex = content.lastIndexOf('}');
      
      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        jsonContent = content.substring(startIndex, endIndex + 1);
      } else if (content.startsWith('```json')) {
        jsonContent = content.replace(/```json\n|\n```/g, '');
      } else if (content.startsWith('```')) {
        jsonContent = content.replace(/```\n|\n```/g, '');
      }
      
      const decree = JSON.parse(jsonContent);
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
      Subcategory: decree.Subcategory,
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

// Function to create notifications for all users about the new decree
async function createDecreeNotifications(decree) {
  console.log('Creating notifications for all users about the new decree...');
  
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
    
    // Get all users from Airtable
    const users = await base('USERS').select().all();
    console.log(`Found ${users.length} users to notify`);
    
    // Log sample user record to understand structure
    if (users.length > 0) {
      console.log('Sample user record structure:', JSON.stringify(users[0], null, 2));
    }
    
    // Create notification content
    const notificationContent = `New Decree Proposed: ${decree.Title}`;
    const notificationDetails = {
      decreeId: decree.DecreeId,
      type: decree.Type,
      category: decree.Category,
      subcategory: decree.Subcategory,
      description: decree.Description.substring(0, 100) + (decree.Description.length > 100 ? '...' : '')
    };
    
    // Create notifications for each user
    const notificationPromises = users.map(user => {
      return base('NOTIFICATIONS').create({
        NotificationId: `decree-${decree.DecreeId}-user-${user.id}`,
        Type: 'Decree',
        User: user.id, // Use user ID directly instead of array
        Content: notificationContent,
        Details: JSON.stringify(notificationDetails),
        ReadAt: null,
        CreatedAt: new Date().toISOString()
      });
    });
    
    // Wait for all notifications to be created
    await Promise.all(notificationPromises);
    console.log(`Created ${users.length} notifications for the new decree`);
    
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
      throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
    }
    
    // Create the message text
    const messageText = `🔰 *NEW DECREE* 🔰\n\n` +
      `*${decree.Title}*\n\n` +
      `*Type:* ${decree.Type}\n` +
      `*Category:* ${decree.Category} - ${decree.Subcategory}\n\n` +
      `*Description:*\n${decree.Description}\n\n` +
      `*Rationale:*\n${decree.Rationale}\n\n` +
      `*Proposed by:* ${decree.Proposer}\n\n` +
      `"${decree.FlavorText}"`;
    
    // Send the message via Telegram API
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
    // Get user input from command line arguments
    const userInput = process.argv.slice(2).join(' ');
    
    if (!userInput) {
      console.error('Please provide a description for the decree');
      console.log('Usage: node generate-decree.js "Your decree description here"');
      process.exit(1);
    }
    
    // Generate the decree
    const decree = await generateDecree(userInput);
    
    // Push the decree directly to Airtable
    const recordId = await pushDecreeToAirtable(decree);
    
    // Create notifications for all users
    await createDecreeNotifications(decree);
    
    // Send Telegram notification
    await sendTelegramNotification(decree);
    
    console.log('\nDecree generated successfully and pushed to Airtable');
    console.log('Notifications created for all users');
    console.log('Telegram notification sent to chat');
    console.log(`Airtable Record ID: ${recordId}`);
    
  } catch (error) {
    console.error('Error in decree generation process:', error);
    process.exit(1);
  }
}

// Run the main function
main();
