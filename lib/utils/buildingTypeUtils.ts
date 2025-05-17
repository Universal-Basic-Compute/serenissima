/**
 * Utility functions for working with building types
 */

/**
 * Fetch building types from the API
 */
export async function fetchBuildingTypes(): Promise<any[]> {
  try {
    console.log('Fetching building types from API...');
    
    // Check if we already have cached data in the window object
    if (typeof window !== 'undefined' && (window as any).__buildingTypes) {
      console.log('Using cached building types from window.__buildingTypes');
      return (window as any).__buildingTypes;
    }
    
    // Fetch from API
    const response = await fetch('/api/building-types');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch building types: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.buildingTypes)) {
      console.log(`Successfully fetched ${data.buildingTypes.length} building types`);
      
      // Cache in window object for future use
      if (typeof window !== 'undefined') {
        (window as any).__buildingTypes = data.buildingTypes;
      }
      
      return data.buildingTypes;
    } else {
      console.error('Invalid response format from building-types API:', data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching building types:', error);
    return [];
  }
}

/**
 * Get a specific building type by its type identifier
 */
export async function getBuildingType(type: string): Promise<any | null> {
  try {
    const buildingTypes = await fetchBuildingTypes();
    
    // Find the building type that matches the given type (case insensitive)
    return buildingTypes.find(bt => 
      bt.type.toLowerCase() === type.toLowerCase() || 
      bt.name?.toLowerCase() === type.toLowerCase()
    ) || null;
  } catch (error) {
    console.error(`Error getting building type for ${type}:`, error);
    return null;
  }
}

/**
 * Get building types by category
 */
export async function getBuildingTypesByCategory(category: string): Promise<any[]> {
  try {
    const buildingTypes = await fetchBuildingTypes();
    
    // Filter building types by category (case insensitive)
    return buildingTypes.filter(bt => 
      bt.category?.toLowerCase() === category.toLowerCase()
    );
  } catch (error) {
    console.error(`Error getting building types for category ${category}:`, error);
    return [];
  }
}

/**
 * Get all available building categories
 */
export async function getBuildingCategories(): Promise<string[]> {
  try {
    const buildingTypes = await fetchBuildingTypes();
    
    // Extract unique categories
    const categories = new Set<string>();
    buildingTypes.forEach(bt => {
      if (bt.category) {
        categories.add(bt.category);
      }
    });
    
    return Array.from(categories).sort();
  } catch (error) {
    console.error('Error getting building categories:', error);
    return [];
  }
}
