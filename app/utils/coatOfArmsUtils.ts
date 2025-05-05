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
  
  // Now, fetch the generated image and save it to our server
  try {
    // Try to fetch the image from the external URL
    const imageResponse = await fetch(generateData.image_url);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch generated image');
    }
    
    const imageBlob = await imageResponse.blob();
    
    // Create a FormData object to upload the image
    const formData = new FormData();
    formData.append('image', imageBlob, 'coat-of-arms.png');
    
    // Upload to our server
    const uploadResponse = await fetch('/api/upload-coat-of-arms', {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      throw new Error('Failed to save image to server');
    }
    
    const uploadData = await uploadResponse.json();
    
    if (!uploadData.success) {
      throw new Error(uploadData.error || 'Failed to save image');
    }
    
    // Return the local image URL
    return uploadData.image_url;
  } catch (error) {
    // If there's an error with the upload process, try the fetch API directly
    console.error('Error uploading image, trying direct fetch:', error);
    
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
      console.error('Both upload and fetch methods failed:', fetchError);
      // If all else fails, return the original URL (not ideal but better than nothing)
      return generateData.image_url;
    }
  }
}
