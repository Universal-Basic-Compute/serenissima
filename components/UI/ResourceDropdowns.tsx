import React, { useState, useEffect } from 'react';
import ResourceDropdown from './ResourceDropdown';
import { ResourceService, ResourceCategory } from '@/lib/services/ResourceService';

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
        
        setCategories(nonEmptyCategories);
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
    <div className="flex flex-wrap gap-2">
      {categories.map(category => (
        <ResourceDropdown 
          key={category.id}
          category={category.id}
          icon={category.icon}
          resources={category.resources}
        />
      ))}
    </div>
  );
};

export default ResourceDropdowns;
