import { getApiBaseUrl } from '@/lib/apiUtils';

/**
 * Generates a coat of arms image based on a text description
 * @param description Text description of the coat of arms
 * @param username Username to use for the filename
 * @returns Promise resolving to the URL of the generated image
 */
export async function generateCoatOfArmsImage(description: string, username?: string): Promise<string> {
  if (!description.trim()) {
    throw new Error('Please provide a description for the coat of arms');
  }
  
  // First, generate the image using the AI service
  const generateResponse = await fetch(`${getApiBaseUrl()}/api/generate-coat-of-arms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: description,
      username: username || 'anonymous' // Provide a default if username is not available
    }),
  });
  
  if (!generateResponse.ok) {
    throw new Error('Failed to generate coat of arms image');
  }
  
  const generateData = await generateResponse.json();
  
  if (!generateData.success || !generateData.local_image_url) {
    throw new Error(generateData.error || 'Failed to generate image');
  }
  
  // Return the local image path
  const imagePath = generateData.local_image_url;
  console.log('Using image path:', imagePath);
  return imagePath;
}
