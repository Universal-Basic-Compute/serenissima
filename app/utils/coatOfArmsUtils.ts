import { getApiBaseUrl } from '@/lib/apiUtils';

/**
 * Generates a coat of arms image based on a text description
 * @param description Text description of the coat of arms
 * @returns Promise resolving to the URL of the generated image
 */
export async function generateCoatOfArmsImage(description: string): Promise<string> {
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
      description: description
    }),
  });
  
  if (!generateResponse.ok) {
    throw new Error('Failed to generate coat of arms image');
  }
  
  const generateData = await generateResponse.json();
  
  if (!generateData.success || !generateData.image_url) {
    throw new Error(generateData.error || 'Failed to generate image');
  }
  
  // Skip the direct fetch attempt and go straight to the server-side proxy
  try {
    const fetchResponse = await fetch('/api/fetch-coat-of-arms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: generateData.image_url
      }),
    });
    
    if (!fetchResponse.ok) {
      throw new Error('Failed to fetch and save image');
    }
    
    const fetchData = await fetchResponse.json();
    
    if (!fetchData.success) {
      throw new Error(fetchData.error || 'Failed to save fetched image');
    }
    
    return fetchData.image_url;
  } catch (fetchError) {
    console.error('Failed to fetch image via proxy:', fetchError);
    // If all else fails, return the original URL (not ideal but better than nothing)
    return generateData.image_url;
  }
}
