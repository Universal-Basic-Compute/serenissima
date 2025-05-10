const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Define citizen interface
interface Citizen {
  id: string;
  socialClass: 'Patrician' | 'Cittadini' | 'Popolani' | 'Laborer';
  firstName: string;
  lastName: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  wealth: number;
  createdAt: string;
}

// Ideogram API configuration
const IDEOGRAM_API_KEY = process.env.IDEOGRAM_API_KEY;

// Path to citizens data and image directory
const CITIZENS_DATA_PATH = path.join(process.cwd(), 'data', 'citizens.json');
const CITIZENS_IMAGE_DIR = path.join(process.cwd(), 'public', 'images', 'citizens');

// Ensure the images directory exists
if (!fs.existsSync(CITIZENS_IMAGE_DIR)) {
  fs.mkdirSync(CITIZENS_IMAGE_DIR, { recursive: true });
}

// Load citizens data
function loadCitizens(): Citizen[] {
  try {
    const data = fs.readFileSync(CITIZENS_DATA_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading citizens data:', error);
    return [];
  }
}

// Save updated citizens data
function saveCitizens(citizens: Citizen[]): void {
  try {
    fs.writeFileSync(CITIZENS_DATA_PATH, JSON.stringify(citizens, null, 2));
    console.log(`Saved updated citizens data to ${CITIZENS_DATA_PATH}`);
  } catch (error) {
    console.error('Error saving citizens data:', error);
  }
}

// Enhance image prompt with style guidelines
function enhanceImagePrompt(citizen: Citizen): string {
  const basePrompt = citizen.imagePrompt;
  
  // Add style guidelines based on social class
  let styleAddition = '';
  
  switch (citizen.socialClass) {
    case 'Patrician':
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

// Generate image using Ideogram API
async function generateImage(prompt: string, citizenId: string): Promise<string | null> {
  try {
    console.log(`Sending prompt to Ideogram API: ${prompt.substring(0, 100)}...`);
    
    // Create form data for multipart request
    const FormData = require('form-data');
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
    
    return `/images/citizens/${citizenId}.jpg`;
  } catch (error) {
    console.error(`Error generating image for citizen ${citizenId}:`, error);
    return null;
  }
}

// Main function to generate images for all citizens
async function generateCitizenImages(limit: number = 0): Promise<void> {
  const citizens = loadCitizens();
  let updatedCount = 0;
  let processedCount = 0;
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    
    // Skip if citizen already has an image
    if (citizen.imageUrl) {
      console.log(`Citizen ${citizen.id} already has an image, skipping...`);
      continue;
    }
    
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
      // Update citizen with image URL
      citizens[i].imageUrl = imageUrl;
      updatedCount++;
      
      // Save after each successful generation to avoid losing progress
      saveCitizens(citizens);
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
