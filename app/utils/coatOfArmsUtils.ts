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
  
  // Always use the production URL for coat of arms
  const productionUrl = 'https://serenissima.ai';
  
  // First, generate the image using the AI service
  const generateResponse = await fetch(`${productionUrl}/api/generate-coat-of-arms`, {
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
  
  // Ensure the image URL uses the production domain
  let imagePath = generateData.local_image_url;
  
  // If the path is relative, prepend the production URL
  if (imagePath.startsWith('/')) {
    imagePath = `${productionUrl}${imagePath}`;
  } else if (!imagePath.startsWith('http')) {
    imagePath = `${productionUrl}/${imagePath}`;
  }
  
  console.log('Using image path:', imagePath);
  return imagePath;
}
