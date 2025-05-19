/**
 * Generates a coat of arms image based on a text description
 * @param description Text description of the coat of arms
 * @param username Username to use for the filename
 * @returns Promise resolving to the URL of the generated image
 */
export async function generateCoatOfArmsImageUrl(description: string, username?: string): Promise<string> {
  if (!description.trim()) {
    throw new Error('Please provide a description for the coat of arms');
  }
  
  // Always use the production URL for coat of arms generation
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
  
  console.log('Generated coat of arms at production URL:', imagePath);
  
  // Now fetch the image and store it locally using our fetch-coat-of-arms API
  try {
    const localFetchResponse = await fetch(`/api/fetch-coat-of-arms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: imagePath,
      }),
    });
    
    if (!localFetchResponse.ok) {
      console.warn('Failed to fetch coat of arms locally, using production URL');
      return imagePath;
    }
    
    const localData = await localFetchResponse.json();
    
    if (localData.success && localData.image_url) {
      console.log('Using locally cached coat of arms:', localData.image_url);
      return localData.image_url;
    } else {
      console.warn('Local fetch returned success=false, using production URL');
      return imagePath;
    }
  } catch (error) {
    console.error('Error fetching coat of arms locally:', error);
    // Fall back to the production URL if local fetch fails
    return imagePath;
  }
}

/**
 * Fetches a coat of arms image from a remote URL and stores it locally
 * @param imageUrl The URL of the coat of arms image
 * @returns Promise resolving to the local URL of the image
 */
export async function fetchCoatOfArmsImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) {
    throw new Error('Please provide a coat of arms image URL');
  }
  
  // Ensure the URL is properly formatted for production
  const productionUrl = 'https://serenissima.ai';
  
  if (!imageUrl.startsWith('http')) {
    // If it's a relative path, ensure it has a leading slash
    if (!imageUrl.startsWith('/')) {
      imageUrl = `/${imageUrl}`;
    }
    
    // Add the production domain
    imageUrl = `${productionUrl}${imageUrl}`;
    console.log('Using production URL for coat of arms:', imageUrl);
  }
  
  try {
    const response = await fetch(`/api/fetch-coat-of-arms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl,
      }),
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch coat of arms locally (status ${response.status}), using original URL`);
      return imageUrl;
    }
    
    const data = await response.json();
    
    if (data.success && data.image_url) {
      console.log(`Using ${data.source === 'local' ? 'locally cached' : 'fetched'} coat of arms:`, data.image_url);
      return data.image_url;
    } else {
      console.warn('Local fetch returned success=false, using original URL');
      return imageUrl;
    }
  } catch (error) {
    console.error('Error fetching coat of arms locally:', error);
    // Fall back to the original URL if local fetch fails
    return imageUrl;
  }
}
