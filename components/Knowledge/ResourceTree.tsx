import React, { useState, useEffect, useRef } from 'react';
import { fetchResources, ResourceNode } from '@/lib/utils/resourceUtils';
import ResourceHeader from './ResourceHeader';
import ResourceSearchBar from './ResourceSearchBar';
import ResourceGrid from './ResourceGrid';
import ResourceListView from './ResourceListView';
import ResourceTreeView from './ResourceTreeView';
import ResourceDetails from './ResourceDetails';
import { FaTimes } from 'react-icons/fa';

interface ResourceListProps {
  onClose: () => void;
}

const ResourceTree: React.FC<ResourceListProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'tree'>('grid');
  const [selectedResource, setSelectedResource] = useState<ResourceNode | null>(null);
  const [resources, setResources] = useState<ResourceNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load resources on component mount
  useEffect(() => {
    const loadResources = async () => {
      try {
        setLoading(true);
        const data = await fetchResources();
        if (Array.isArray(data)) {
          setResources(data);
          setError(null);
        } else {
          throw new Error('Invalid data format received');
        }
      } catch (err) {
        setError('Failed to load resources. Please try again later.');
        console.error('Error loading resources:', err);
        // Set empty array to prevent undefined errors
        setResources([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadResources();
  }, []);

  // Get unique categories for filtering
  const categories = ['all', ...new Set(resources.map(node => node.category))].sort();
  
  // Get unique rarities for filtering
  const rarities = ['all', ...new Set(resources.map(node => node.rarity || 'unknown').filter(Boolean))].sort();
  
  // Filter resources based on search term and filters
  const filteredResources = resources.filter(resource => {
    const matchesSearch = 
      resource.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (resource.description && resource.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || resource.category === selectedCategory;
    const matchesRarity = selectedRarity === 'all' || resource.rarity === selectedRarity;
    
    return matchesSearch && matchesCategory && matchesRarity;
  });
  
  // Get resource by ID
  const getResourceById = (id: string): ResourceNode | undefined => {
    return resources.find(node => node.id === id);
  };
  
  // Get input resources for a given resource
  const getInputResources = (resource: ResourceNode): ResourceNode[] => {
    if (!resource.inputs) return [];
    return resource.inputs.map(id => getResourceById(id)).filter(Boolean) as ResourceNode[];
  };
  
  // Get output resources for a given resource
  const getOutputResources = (resource: ResourceNode): ResourceNode[] => {
    if (!resource.outputs) return [];
    return resource.outputs.map(id => getResourceById(id)).filter(Boolean) as ResourceNode[];
  };
  
  // Get category display name
  const getCategoryDisplayName = (category: string): string => {
    return category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  
  // Get rarity display name and color
  const getRarityInfo = (rarity?: string) => {
    switch(rarity) {
      case 'common':
        return { name: 'Common', color: 'bg-gray-200 text-gray-800' };
      case 'uncommon':
        return { name: 'Uncommon', color: 'bg-green-200 text-green-800' };
      case 'rare':
        return { name: 'Rare', color: 'bg-blue-200 text-blue-800' };
      case 'exotic':
        return { name: 'Exotic', color: 'bg-purple-200 text-purple-800' };
      default:
        return { name: 'Unknown', color: 'bg-gray-200 text-gray-800' };
    }
  };
  
  // Get category color
  const getCategoryColor = (category: string): string => {
    switch(category) {
      case 'raw_materials':
        return 'bg-amber-100 border-amber-300';
      case 'processed_materials':
        return 'bg-blue-100 border-blue-300';
      case 'luxury_goods':
        return 'bg-purple-100 border-purple-300';
      case 'imported_goods':
        return 'bg-red-100 border-red-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col tech-tree-container"
      ref={containerRef}
    >
      <ResourceHeader onClose={onClose} />
      
      <ResourceSearchBar 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedRarity={selectedRarity}
        setSelectedRarity={setSelectedRarity}
        viewMode={viewMode}
        setViewMode={setViewMode}
        categories={categories}
        rarities={rarities}
        getCategoryDisplayName={getCategoryDisplayName}
        getRarityInfo={getRarityInfo}
      />
      
      {/* Main Content Area */}
      <div className="flex-grow flex overflow-hidden">
        {/* Resource Encyclopedia */}
        <div className={`${selectedResource ? 'w-2/3' : 'w-full'} overflow-auto p-6 tech-tree-scroll`}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-amber-500 text-xl">Fetching resources...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-500 text-xl">{error}</div>
            </div>
          ) : viewMode === 'grid' ? (
            <ResourceGrid 
              resources={filteredResources}
              onSelectResource={setSelectedResource}
              getCategoryColor={getCategoryColor}
              getCategoryDisplayName={getCategoryDisplayName}
              getRarityInfo={getRarityInfo}
            />
          ) : viewMode === 'list' ? (
            <ResourceListView 
              resources={filteredResources}
              onSelectResource={setSelectedResource}
              loading={loading}
            />
          ) : viewMode === 'tree' ? (
            <ResourceTreeView
              resources={filteredResources}
              onSelectResource={setSelectedResource}
              loading={loading}
            />
          ) : null}
        </div>
        
        {/* Resource Details Panel - show when a resource is selected */}
        {selectedResource && (
          <ResourceDetails 
            resource={selectedResource}
            onClose={() => setSelectedResource(null)}
            getInputResources={getInputResources}
            getOutputResources={getOutputResources}
            onSelectResource={setSelectedResource}
            getCategoryDisplayName={getCategoryDisplayName}
            getRarityInfo={getRarityInfo}
          />
        )}
      </div>
    </div>
  );
};

export default ResourceTree;
