import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Airtable from 'airtable';
import FormData from 'form-data';

dotenv.config();
// Initialize Airtable base connection
const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID || '');

// Define citizen interface
interface Citizen {
  id: string;
  socialClass: 'Nobili' | 'Cittadini' | 'Popolani' | 'Laborer';
  firstName: string;
  lastName: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  ducats: number;
  createdAt: string;
}

// Ideogram API configuration
const IDEOGRAM_API_KEY = process.env.IDEOGRAM_API_KEY;

// Path to image directory (we don't need CITIZENS_DATA_PATH in this file)
const CITIZENS_IMAGE_DIR = path.join(process.cwd(), 'public', 'images', 'citizens');

// Ensure the images directory exists
if (!fs.existsSync(CITIZENS_IMAGE_DIR)) {
  fs.mkdirSync(CITIZENS_IMAGE_DIR, { recursive: true });
}

// Fetch citizens from Airtable that need images
async function fetchCitizensNeedingImages(): Promise<Citizen[]> {
  try {
    console.log('Fetching citizens from Airtable that need images...');
    
    const citizens: Citizen[] = [];
    
    // Fetch records from Airtable with pagination, filtering for records where ImageUrl is empty
    await new Promise((resolve, reject) => {
      airtableBase('CITIZENS').select({
        filterByFormula: '{ImageUrl} = ""', // Only get records with empty ImageUrl
        // Optionally specify fields to retrieve
        fields: ['CitizenId', 'SocialClass', 'FirstName', 'LastName', 'Description', 'ImagePrompt', 'Ducats', 'CreatedAt']
      }).eachPage(
        function page(records, fetchNextPage) {
          // Process each page of records
          records.forEach(record => {
            const fields = record.fields;
            citizens.push({
              id: fields.CitizenId as string || record.id,
              socialClass: fields.SocialClass as 'Nobili' | 'Cittadini' | 'Popolani' | 'Laborer',
              firstName: fields.FirstName as string,
              lastName: fields.LastName as string,
              description: fields.Description as string,
              imagePrompt: fields.ImagePrompt as string,
              ducats: Number(fields.Ducats) || 0,
              createdAt: String(fields.CreatedAt) || new Date().toISOString()
            });
          });
          
          // Get the next page of records
          fetchNextPage();
        },
        function done(err) {
          if (err) {
            console.error('Error fetching citizens from Airtable:', err);
            reject(err);
            return;
          }
          
          console.log(`Successfully fetched ${citizens.length} citizens needing images from Airtable`);
          resolve(citizens);
        }
      );
    });
    
    return citizens;
  } catch (error) {
    console.error('Error in fetchCitizensNeedingImages:', error);
    return []; // Return empty array on error
  }
}

// Enhance image prompt with style guidelines
function enhanceImagePrompt(citizen: Citizen): string {
  const basePrompt = citizen.imagePrompt;
  
  // Add style guidelines based on social class
  let styleAddition = '';
  
  switch (citizen.socialClass) {
    case 'Nobili':
      styleAddition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with Rembrandt lighting. Rich color palette with deep reds and gold tones. --ar 1:1';
      break;
    case 'Cittadini':
      styleAddition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with warm Rembrandt lighting. Warm amber tones. --ar 1:1';
      break;
    case 'Popolani':
      styleAddition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with directional lighting. Muted earth tones. --ar 1:1';
      break;
    case 'Laborer':
      styleAddition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition with natural lighting. Subdued color palette. --ar 1:1';
      break;
    default:
      styleAddition = 'Renaissance portrait style with realistic details. 3/4 view portrait composition. --ar 1:1';
  }
  
  // Combine original prompt with style guidelines
  return `${basePrompt} ${styleAddition}`;
}

// Update Airtable with image URL
async function updateAirtableImageUrl(citizenId: string, imageUrl: string): Promise<boolean> {
  try {
    console.log(`Updating Airtable record for citizen ${citizenId} with image URL: ${imageUrl}`);
    
    // Find the record by CitizenId
    const records = await airtableBase('CITIZENS').select({
      filterByFormula: `{CitizenId} = '${citizenId}'`
    }).firstPage();
    
    if (records.length === 0) {
      console.error(`No Airtable record found for citizen ID: ${citizenId}`);
      return false;
    }
    
    // Update the record with the new image URL
    const recordId = records[0].id;
    await airtableBase('CITIZENS').update(recordId, {
      ImageUrl: imageUrl
    });
    
    console.log(`Successfully updated Airtable record for citizen ${citizenId}`);
    return true;
  } catch (error) {
    console.error(`Error updating Airtable record for citizen ${citizenId}:`, error);
    return false;
  }
}

// Generate image using Ideogram API
async function generateImage(prompt: string, citizenId: string): Promise<string | null> {
  try {
    console.log(`Sending prompt to Ideogram API: ${prompt.substring(0, 100)}...`);
    
    // Create form data for multipart request
    const form = new FormData();
    
    // Add required parameters
    form.append('prompt', prompt);
    form.append('style_type', 'REALISTIC');
    form.append('rendering_speed', 'DEFAULT');
    
    const response = await axios.post(
      'https://api.ideogram.ai/v1/ideogram-v3/generate',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Api-Key': IDEOGRAM_API_KEY
        }
      }
    );
    
    // Extract image URL from response
    const imageUrl = response.data.data[0].url;
    
    // Download the image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imagePath = path.join(CITIZENS_IMAGE_DIR, `${citizenId}.jpg`);
    fs.writeFileSync(imagePath, imageResponse.data);
    
    console.log(`Generated and saved image for citizen ${citizenId}`);
    
    // Create the public URL path
    const publicImageUrl = `/images/citizens/${citizenId}.jpg`;
    
    // Update the image URL in Airtable
    await updateAirtableImageUrl(citizenId, publicImageUrl);
    
    return publicImageUrl;
  } catch (error) {
    console.error(`Error generating image for citizen ${citizenId}:`, error);
    return null;
  }
}

// Main function to generate images for all citizens
async function generateCitizenImages(limit: number = 0): Promise<void> {
  // Fetch citizens from Airtable that need images
  const citizens = await fetchCitizensNeedingImages();
  
  if (citizens.length === 0) {
    console.log('No citizens found that need images. Exiting.');
    return;
  }
  
  console.log(`Found ${citizens.length} citizens that need images`);
  
  let updatedCount = 0;
  let processedCount = 0;
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    
    // Stop if we've reached the limit (if specified)
    if (limit > 0 && processedCount >= limit) {
      console.log(`Reached limit of ${limit} images, stopping.`);
      break;
    }
    
    console.log(`Generating image for citizen ${i+1}/${citizens.length}: ${citizen.firstName} ${citizen.lastName}`);
    
    // Enhance the image prompt with style guidelines
    const enhancedPrompt = enhanceImagePrompt(citizen);
    
    // Generate the image
    const imageUrl = await generateImage(enhancedPrompt, citizen.id);
    
    if (imageUrl) {
      updatedCount++;
    }
    
    processedCount++;
    
    // Add a delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`Generated images for ${updatedCount} citizens out of ${processedCount} processed`);
}

// Command line interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = args.length > 0 ? parseInt(args[0]) : 0;
  
  if (args.length > 0 && isNaN(limit)) {
    console.error('Please provide a valid limit (positive integer)');
    process.exit(1);
  }
  
  console.log(`Starting citizen image generation${limit > 0 ? ` with limit of ${limit} images` : ''}`);
  await generateCitizenImages(limit);
}

// Run the script
main().catch(console.error);
