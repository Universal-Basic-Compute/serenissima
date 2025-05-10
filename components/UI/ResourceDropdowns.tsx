import React, { useState, useEffect, useCallback } from 'react';
import ResourceDropdown from './ResourceDropdown';
import { ResourceService, ResourceCategory } from '@/lib/services/ResourceService';
import { getWalletAddress } from '@/lib/walletUtils';

// Define the desired order of categories
const CATEGORY_ORDER = ['raw_materials', 'processed_materials', 'finished_goods', 'utility_resources'];

// Add a styled console log function
const logInfo = (message: string, data?: any) => {
  console.log(`%c[ResourceDropdowns] ${message}`, 'color: #22c55e; font-weight: bold;', data || '');
};

const logError = (message: string, error?: any) => {
  console.log(`%c[ResourceDropdowns] ERROR: ${message}`, 'color: #ef4444; font-weight: bold;', error || '');
};

const ResourceDropdowns: React.FC = () => {
  logInfo('Component rendering');
  
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create a memoized function to load resource categories with counts
  const loadResourceCategories = useCallback(async () => {
    logInfo('Loading resource categories...');
    try {
      setLoading(true);
      const resourceService = ResourceService.getInstance();
      
      // Clear the cache to force a fresh load if we've had errors
      if (error) {
        logInfo('Clearing cache due to previous error');
        resourceService.clearCache();
      }
      
      // Get the current wallet address
      const walletAddress = getWalletAddress();
      logInfo('Current wallet address:', walletAddress);
      
      // Get resource counts for the current user
      logInfo('Fetching resource counts');
      const resources = await resourceService.getResourceCounts(walletAddress);
      logInfo(`Received ${resources.length} resources`);
      
      // Group resources by category
      const categoriesMap = new Map<string, ResourceCategory>();
      
      resources.forEach(resource => {
        const category = resource.category || 'raw_materials';
        
        if (!categoriesMap.has(category)) {
          // Format category name for display
          const categoryName = category
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          
          categoriesMap.set(category, {
            id: category,
            name: categoryName,
            resources: []
          });
        }
        
        // Add resource to its category
        categoriesMap.get(category).resources.push(resource);
      });
      
      // Convert map to array and sort resources within each category
      const loadedCategories = Array.from(categoriesMap.values()).map(category => ({
        ...category,
        resources: category.resources.sort((a, b) => a.name.localeCompare(b.name))
      }));
      
      // Filter out categories with no resources
      const nonEmptyCategories = loadedCategories.filter(category => 
        category.resources && category.resources.length > 0
      );
      
      // Log category statistics
      nonEmptyCategories.forEach(category => {
        logInfo(`Category ${category.id} has ${category.resources.length} resources after filtering`);
      });
      
      // Sort categories according to the predefined order
      const sortedCategories = [...nonEmptyCategories].sort((a, b) => {
        const indexA = CATEGORY_ORDER.indexOf(a.id);
        const indexB = CATEGORY_ORDER.indexOf(b.id);
        
        // If both categories are in our order array, sort by their position
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        
        // If only one category is in our order array, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        // For categories not in our order array, sort alphabetically
        return a.name.localeCompare(b.name);
      });
      
      logInfo(`Setting ${sortedCategories.length} categories`);
      setCategories(sortedCategories);
      setError(null);
    } catch (err) {
      logError('Error loading resource categories:', err);
      setError('Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [error]);
  
  useEffect(() => {
    // Load resource categories on component mount
    logInfo('Component mounted, loading categories');
    loadResourceCategories();
    
    // Refresh periodically (every 30 seconds)
    logInfo('Setting up refresh interval');
    const intervalId = setInterval(() => {
      logInfo('Refreshing categories (interval)');
      loadResourceCategories();
    }, 30000);
    
    return () => {
      logInfo('Component unmounting, clearing interval');
      clearInterval(intervalId);
    };
  }, [loadResourceCategories]);
  
  if (loading && categories.length === 0) {
    logInfo('Rendering loading state');
    return <div className="text-amber-300 text-sm">Loading resources...</div>;
  }
  
  if (error && categories.length === 0) {
    logError('Rendering error state:', error);
    return <div className="text-red-400 text-sm">Error: {error}</div>;
  }
  
  logInfo(`Rendering ${categories.length} resource categories`);
  return (
    <div className="flex flex-wrap gap-2 relative z-30">
      {categories.map(category => (
        <ResourceDropdown 
          key={category.id}
          category={category.id}
          resources={category.resources || []}
        />
      ))}
    </div>
  );
};

export default ResourceDropdowns;
