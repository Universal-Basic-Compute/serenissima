import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaSearch, FaFilter, FaThLarge, FaProjectDiagram, FaInfoCircle, FaBuilding, FaWeight, FaCube, FaCoins, FaHistory } from 'react-icons/fa';
import { fetchResources, ResourceNode } from '../../lib/resourceUtils';

interface ResourceTreeProps {
  onClose: () => void;
}

const ResourceTree: React.FC<ResourceTreeProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('grid');
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
        setResources(data);
        setError(null);
      } catch (err) {
        setError('Failed to load resources. Please try again later.');
        console.error('Error loading resources:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadResources();
  }, []);

  // Load resources on component mount
  useEffect(() => {
    const loadResources = async () => {
      try {
        setLoading(true);
        const data = await fetchResources();
        setResources(data);
        setError(null);
      } catch (err) {
        setError('Failed to load resources. Please try again later.');
        console.error('Error loading resources:', err);
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
      <div className="flex justify-between items-center p-4 border-b border-amber-700">
        <h2 className="text-3xl font-serif text-amber-500 px-4">
          Resource Encyclopedia of Venice
        </h2>
        <button 
          onClick={onClose}
          className="text-white hover:text-amber-200 transition-colors p-2 rounded-full hover:bg-amber-900/30"
          aria-label="Close"
        >
          <FaTimes size={24} />
        </button>
      </div>
      
      {/* Search and Filter Controls */}
      <div className="bg-amber-900/50 p-4 border-b border-amber-700">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-grow">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaSearch className="text-amber-500" />
            </div>
            <input
              type="text"
              placeholder="Search resources..."
              className="w-full pl-10 pr-4 py-2 bg-amber-950/50 border border-amber-700 rounded-lg text-amber-100 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-4">
            <div className="relative">
              <select
                className="appearance-none bg-amber-950/50 border border-amber-700 rounded-lg px-4 py-2 pr-8 text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>
                {categories.filter(c => c !== 'all').map(category => (
                  <option key={category} value={category}>
                    {getCategoryDisplayName(category)}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <FaFilter className="text-amber-500" />
              </div>
            </div>
            
            <div className="relative">
              <select
                className="appearance-none bg-amber-950/50 border border-amber-700 rounded-lg px-4 py-2 pr-8 text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={selectedRarity}
                onChange={(e) => setSelectedRarity(e.target.value)}
              >
                <option value="all">All Rarities</option>
                {rarities.filter(r => r !== 'all').map(rarity => (
                  <option key={rarity} value={rarity}>
                    {getRarityInfo(rarity).name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <FaFilter className="text-amber-500" />
              </div>
            </div>
            
            <div className="flex rounded-lg overflow-hidden border border-amber-700">
              <button
                className={`px-3 py-2 flex items-center ${viewMode === 'grid' ? 'bg-amber-700 text-white' : 'bg-amber-950/50 text-amber-300 hover:bg-amber-800/50'}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <FaThLarge className="mr-1" /> Grid
              </button>
              <button
                className={`px-3 py-2 flex items-center ${viewMode === 'tree' ? 'bg-amber-700 text-white' : 'bg-amber-950/50 text-amber-300 hover:bg-amber-800/50'}`}
                onClick={() => setViewMode('tree')}
                title="Tree View"
              >
                <FaProjectDiagram className="mr-1" /> Tree
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-grow flex overflow-hidden">
        {/* Resource List */}
        <div className={`${selectedResource ? 'w-2/3' : 'w-full'} overflow-auto p-6 tech-tree-scroll`}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-amber-500 text-xl">Loading resources...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-500 text-xl">{error}</div>
            </div>
          ) : viewMode === 'grid' ? (
            <>
              <div className="mb-4 text-amber-300">
                <span className="font-medium">{filteredResources.length}</span> resources found
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredResources.map(resource => (
                <div 
                  key={resource.id}
                  className={`border-2 rounded-lg overflow-hidden shadow-md cursor-pointer transition-transform hover:scale-105 hover:shadow-lg ${getCategoryColor(resource.category)}`}
                  onClick={() => setSelectedResource(resource)}
                >
                  <div className="p-4 flex items-center">
                    <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex items-center justify-center mr-4 border border-amber-200">
                      <img 
                        src={resource.icon} 
                        alt={resource.name}
                        className="w-12 h-12 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://via.placeholder.com/64?text=${resource.name.charAt(0)}`;
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-serif text-amber-900 font-medium">{resource.name}</h3>
                      <div className="flex items-center mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getRarityInfo(resource.rarity).color}`}>
                          {getRarityInfo(resource.rarity).name}
                        </span>
                        <span className="text-xs text-amber-700 ml-2">
                          {resource.baseValue} <span className="italic">ducats</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pb-3 text-xs text-amber-800">
                    <div className="flex items-center">
                      <span className="font-medium mr-1">Category:</span> 
                      {getCategoryDisplayName(resource.category)}
                    </div>
                    {resource.subcategory && (
                      <div className="flex items-center mt-1">
                        <span className="font-medium mr-1">Subcategory:</span>
                        {getCategoryDisplayName(resource.subcategory)}
                      </div>
                    )}
                    {resource.inputs && resource.inputs.length > 0 && (
                      <div className="flex items-center mt-1">
                        <span className="font-medium mr-1">Inputs:</span>
                        <span>{resource.inputs.length} resources</span>
                      </div>
                    )}
                    {resource.outputs && resource.outputs.length > 0 && (
                      <div className="flex items-center mt-1">
                        <span className="font-medium mr-1">Outputs:</span>
                        <span>{resource.outputs.length} resources</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30">
              <div className="text-center text-amber-300 mb-6">
                <h3 className="text-xl font-serif">Resource Production Chains</h3>
                <p className="text-sm mt-1">Visualizing the relationships between resources in the Venetian economy</p>
              </div>
              
              {/* Simple tree visualization - in a real implementation, this would use a proper graph visualization library */}
              <div className="flex justify-center">
                <div className="relative w-full max-w-4xl h-[600px] bg-amber-950/30 rounded-lg border border-amber-700/50">
                  {/* This is a simplified placeholder for a proper tree visualization */}
                  {/* In a real implementation, you would use a library like react-flow or d3.js */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-amber-400 text-center">
                      <FaProjectDiagram size={48} className="mx-auto mb-4 opacity-50" />
                      <p>Tree visualization would be implemented here with a proper graph library.</p>
                      <p className="mt-2 text-sm">Please use the Grid view to explore resources for now.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Resource Details Panel */}
        {selectedResource && (
          <div className="w-1/3 bg-amber-900/30 border-l border-amber-700 overflow-auto p-6 tech-tree-scroll">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-serif text-amber-300">{selectedResource.name}</h3>
              <button 
                onClick={() => setSelectedResource(null)}
                className="text-amber-400 hover:text-amber-200 p-1"
              >
                <FaTimes />
              </button>
            </div>
            
            <div className="flex items-center mb-6">
              <div className="w-24 h-24 bg-white rounded-lg overflow-hidden flex items-center justify-center mr-4 border-2 border-amber-600">
                <img 
                  src={selectedResource.icon} 
                  alt={selectedResource.name}
                  className="w-20 h-20 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://via.placeholder.com/96?text=${selectedResource.name.charAt(0)}`;
                  }}
                />
              </div>
              <div>
                <div className="flex items-center mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getRarityInfo(selectedResource.rarity).color}`}>
                    {getRarityInfo(selectedResource.rarity).name}
                  </span>
                  <span className="ml-2 text-amber-200 font-medium">
                    {selectedResource.baseValue} <span className="italic">ducats</span>
                  </span>
                </div>
                <div className="text-amber-300 text-sm">
                  <div className="mb-1">
                    <span className="font-medium">Category:</span> {getCategoryDisplayName(selectedResource.category)}
                  </div>
                  {selectedResource.subcategory && (
                    <div className="mb-1">
                      <span className="font-medium">Subcategory:</span> {getCategoryDisplayName(selectedResource.subcategory)}
                    </div>
                  )}
                  
                  {/* Physical properties */}
                  <div className="flex flex-wrap gap-3 mt-2">
                    {selectedResource.weight && (
                      <div className="flex items-center text-amber-200">
                        <FaWeight className="mr-1" size={12} />
                        <span>{selectedResource.weight} kg</span>
                      </div>
                    )}
                    {selectedResource.volume && (
                      <div className="flex items-center text-amber-200">
                        <FaCube className="mr-1" size={12} />
                        <span>{selectedResource.volume} m³</span>
                      </div>
                    )}
                    {selectedResource.baseValue && (
                      <div className="flex items-center text-amber-200">
                        <FaCoins className="mr-1" size={12} />
                        <span>{selectedResource.baseValue} ducats</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Description */}
            <div className="mb-6">
              <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Description</h4>
              <p className="text-amber-100 text-sm">
                {selectedResource.description || "No description available."}
              </p>
            </div>
            
            {/* Varieties */}
            {selectedResource.varieties && selectedResource.varieties.length > 0 && (
              <div className="mb-6">
                <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Varieties</h4>
                <div className="grid grid-cols-1 gap-2">
                  {selectedResource.varieties.map((variety, index) => (
                    <div key={index} className="bg-amber-900/20 rounded p-2 border border-amber-700/30">
                      <div className="font-medium text-amber-200">{getCategoryDisplayName(variety.type)}</div>
                      <div className="text-xs text-amber-100 mt-1">
                        {variety.appearance && (
                          <div><span className="font-medium">Appearance:</span> {getCategoryDisplayName(variety.appearance)}</div>
                        )}
                        {variety.valueMultiplier && (
                          <div><span className="font-medium">Value:</span> {variety.valueMultiplier}x</div>
                        )}
                        {variety.primaryUse && (
                          <div><span className="font-medium">Primary Use:</span> {getCategoryDisplayName(variety.primaryUse)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Production Chain */}
            <div className="mb-6">
              <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Production Chain</h4>
              
              {/* Input Resources */}
              <div className="mb-4">
                <h5 className="text-amber-300 font-medium mb-2">Inputs</h5>
                {getInputResources(selectedResource).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {getInputResources(selectedResource).map(input => (
                      <div 
                        key={input.id}
                        className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30 cursor-pointer hover:bg-amber-900/40"
                        onClick={() => setSelectedResource(input)}
                      >
                        <div className="w-8 h-8 bg-white rounded overflow-hidden flex items-center justify-center mr-2 border border-amber-200">
                          <img 
                            src={input.icon} 
                            alt={input.name}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://via.placeholder.com/32?text=${input.name.charAt(0)}`;
                            }}
                          />
                        </div>
                        <span className="text-amber-100 text-sm">{input.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-amber-400/70 text-sm italic">No input resources required</p>
                )}
              </div>
              
              {/* Output Resources */}
              <div>
                <h5 className="text-amber-300 font-medium mb-2">Outputs</h5>
                {getOutputResources(selectedResource).length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {getOutputResources(selectedResource).map(output => (
                      <div 
                        key={output.id}
                        className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30 cursor-pointer hover:bg-amber-900/40"
                        onClick={() => setSelectedResource(output)}
                      >
                        <div className="w-8 h-8 bg-white rounded overflow-hidden flex items-center justify-center mr-2 border border-amber-200">
                          <img 
                            src={output.icon} 
                            alt={output.name}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://via.placeholder.com/32?text=${output.name.charAt(0)}`;
                            }}
                          />
                        </div>
                        <span className="text-amber-100 text-sm">{output.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-amber-400/70 text-sm italic">No output resources</p>
                )}
              </div>
            </div>
            
            {/* Buildings */}
            <div className="mb-6">
              <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Production Buildings</h4>
              {selectedResource.buildings && selectedResource.buildings.length > 0 ? (
                <div className="space-y-2">
                  {selectedResource.buildings.map(building => (
                    <div 
                      key={building}
                      className="p-2 bg-amber-900/20 rounded border border-amber-700/30"
                    >
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-amber-800/50 rounded-full flex items-center justify-center mr-3">
                          <FaBuilding className="text-amber-300" />
                        </div>
                        <div>
                          <div className="text-amber-200 font-medium">
                            {building.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </div>
                          <div className="text-amber-400/70 text-xs">
                            Produces {selectedResource.name}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-amber-400/70 text-sm italic">No specific buildings required</p>
              )}
            </div>
            
            {/* Historical Notes */}
            {selectedResource.historicalNotes && (
              <div className="mb-6">
                <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
                  <div className="flex items-center">
                    <FaHistory className="mr-2" />
                    Historical Context
                  </div>
                </h4>
                <div className="bg-amber-900/20 p-3 rounded border border-amber-700/30 text-amber-100 text-sm italic">
                  {selectedResource.historicalNotes.historicalSignificance || 
                   selectedResource.historicalNotes.culturalContext || 
                   "No historical notes available."}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceTree;
