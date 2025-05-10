import React, { useState, useEffect } from 'react';
import ResourceDropdown from './ResourceDropdown';
import { ResourceService, ResourceCategory } from '@/lib/services/ResourceService';

// Define the desired order of categories
const CATEGORY_ORDER = ['raw_materials', 'processed_materials', 'finished_goods', 'utility_resources'];

const ResourceDropdowns: React.FC = () => {
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Load resource categories on component mount
    const loadResourceCategories = async () => {
      try {
        setLoading(true);
        const resourceService = ResourceService.getInstance();
        const loadedCategories = await resourceService.getResourceCategories();
        
        // Filter out categories with no resources
        const nonEmptyCategories = loadedCategories.filter(category => 
          category.resources && category.resources.length > 0
        );
        
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
        
        setCategories(sortedCategories);
        setError(null);
      } catch (err) {
        console.error('Error loading resource categories:', err);
        setError('Failed to load resources');
      } finally {
        setLoading(false);
      }
    };
    
    loadResourceCategories();
    
    // Refresh periodically (every 30 seconds)
    const intervalId = setInterval(loadResourceCategories, 30000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  if (loading && categories.length === 0) {
    return <div className="text-amber-300 text-sm">Loading resources...</div>;
  }
  
  if (error && categories.length === 0) {
    return <div className="text-red-400 text-sm">Error: {error}</div>;
  }
  
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
