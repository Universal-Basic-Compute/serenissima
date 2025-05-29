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
  
  // Production URL for the AI service that generates images
  const aiServiceUrl = 'https://serenissima.ai';
  // Base URL for where coat of arms are stored and served from
  const coatOfArmsStorageBaseUrl = 'https://backend.serenissima.ai/public_assets/images/coat-of-arms';
  
  // First, generate the image using the AI service
  const generateResponse = await fetch(`${aiServiceUrl}/api/generate-coat-of-arms`, {
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
  
  // Construct the full URL to the initially generated image on the AI service domain
  let generatedImageUrlOnAiService = generateData.local_image_url;
  if (generatedImageUrlOnAiService.startsWith('/')) {
    generatedImageUrlOnAiService = `${aiServiceUrl}${generatedImageUrlOnAiService}`;
  } else if (!generatedImageUrlOnAiService.startsWith('http')) {
    // Assuming it's a filename relative to a standard path on the AI service
    generatedImageUrlOnAiService = `${aiServiceUrl}/public_assets/images/coat-of-arms/${generatedImageUrlOnAiService}`;
  }
  
  console.log('Generated coat of arms at AI service URL:', generatedImageUrlOnAiService);
  
  // Now fetch the image and store it locally (on backend.serenissima.ai) using our fetch-coat-of-arms API
  try {
    const localFetchResponse = await fetch(`/api/fetch-coat-of-arms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: generatedImageUrlOnAiService, // Fetch from the AI service URL
      }),
    });
    
    if (!localFetchResponse.ok) {
      const errorText = await localFetchResponse.text();
      console.warn(`Failed to fetch/cache coat of arms locally (status: ${localFetchResponse.status}, error: ${errorText}). Falling back.`);
      // Fallback: Construct URL pointing to backend.serenissima.ai using the original filename from generateData.local_image_url
      const filename = generateData.local_image_url.substring(generateData.local_image_url.lastIndexOf('/') + 1);
      const fallbackUrl = `${coatOfArmsStorageBaseUrl}/${filename}`;
      console.log('Using constructed backend fallback URL for generated image:', fallbackUrl);
      return fallbackUrl;
    }
    
    const localData = await localFetchResponse.json();
    
    if (localData.success && localData.image_url) {
      console.log('Using locally cached coat of arms (from backend.serenissima.ai):', localData.image_url);
      return localData.image_url; // This URL should be backend.serenissima.ai based
    } else {
      console.warn('Local fetch/cache returned success=false. Falling back.');
      const filename = generateData.local_image_url.substring(generateData.local_image_url.lastIndexOf('/') + 1);
      const fallbackUrl = `${coatOfArmsStorageBaseUrl}/${filename}`;
      console.log('Using constructed backend fallback URL for generated image:', fallbackUrl);
      return fallbackUrl;
    }
  } catch (error) {
    console.error('Error fetching/caching coat of arms locally:', error);
    const filename = generateData.local_image_url.substring(generateData.local_image_url.lastIndexOf('/') + 1);
    const fallbackUrl = `${coatOfArmsStorageBaseUrl}/${filename}`;
    console.log('Using constructed backend fallback URL due to exception for generated image:', fallbackUrl);
    return fallbackUrl;
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
  
  const backendStorageBaseUrl = 'https://backend.serenissima.ai/public_assets/images/coat-of-arms';
  let processedImageUrl = imageUrl;

  if (!processedImageUrl.startsWith('http')) {
    // Handle relative URLs: assume they are relative to the backend storage base path
    if (processedImageUrl.startsWith('/public_assets/images/coat-of-arms/')) {
      // Path is like /public_assets/images/coat-of-arms/filename.png
      processedImageUrl = `https://backend.serenissima.ai${processedImageUrl}`;
    } else if (processedImageUrl.startsWith('/')) {
      // Path is like /filename.png or /other_folder/filename.png
      const filename = processedImageUrl.substring(processedImageUrl.lastIndexOf('/') + 1);
      processedImageUrl = `${backendStorageBaseUrl}/${filename}`;
    } else {
      // Path is just filename.png
      processedImageUrl = `${backendStorageBaseUrl}/${processedImageUrl}`;
    }
    console.log('Processed relative imageUrl to:', processedImageUrl);
  }
  
  // Now fetch the image (which might involve caching it via /api/fetch-coat-of-arms)
  try {
    const response = await fetch(`/api/fetch-coat-of-arms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrl: processedImageUrl, // Use the processed URL
      }),
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch/cache coat of arms locally (status ${response.status}), using processed URL as fallback: ${processedImageUrl}`);
      return processedImageUrl; // Fallback to the processed URL
    }
    
    const data = await response.json();
    
    if (data.success && data.image_url) {
      console.log(`Using ${data.source === 'local' ? 'locally cached' : 'fetched from backend'} coat of arms:`, data.image_url);
      return data.image_url; // This should be a backend.serenissima.ai URL
    } else {
      console.warn('Local fetch/cache returned success=false, using processed URL as fallback:', processedImageUrl);
      return processedImageUrl; // Fallback to the processed URL
    }
  } catch (error) {
    console.error('Error fetching/caching coat of arms locally:', error);
    // Fall back to the processed URL if local fetch/cache fails
    return processedImageUrl;
  }
}
