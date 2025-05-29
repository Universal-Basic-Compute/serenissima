/**
 * Extracts readable text content from the current page
 * @returns Text content from the page
 */
export function extractPageText(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  
  try {
    // Get the main content area - we'll try to be smart about what we extract
    // First, look for main content areas
    const mainContent = document.querySelector('main') || 
                        document.querySelector('.main-content') || 
                        document.querySelector('#content');
    
    if (mainContent) {
      // If we found a main content area, extract text from it
      return cleanText(mainContent.textContent || '');
    }
    
    // If no main content area, get text from the body but exclude scripts, styles, etc.
    const bodyText = Array.from(document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, div:not(:has(*))'))
      .map(el => el.textContent)
      .filter(Boolean)
      .join('\n');
    
    return cleanText(bodyText);
  } catch (error) {
    console.error('Error extracting page text:', error);
    return '';
  }
}

/**
 * Cleans up extracted text
 * @param text Raw text to clean
 * @returns Cleaned text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
    .replace(/\n\s*\n/g, '\n')  // Replace multiple newlines with single newline
    .trim()
    .substring(0, 5000);  // Limit to 5000 chars to avoid token limits
}
