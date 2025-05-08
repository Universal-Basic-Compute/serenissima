import React from 'react';
import { ResourceNode } from '../../lib/resourceUtils';

interface ResourceGridProps {
  resources: ResourceNode[];
  onSelectResource: (resource: ResourceNode) => void;
  getCategoryColor: (category: string) => string;
  getCategoryDisplayName: (category: string) => string;
  getRarityInfo: (rarity?: string) => { name: string; color: string };
}

const ResourceGrid: React.FC<ResourceGridProps> = ({
  resources,
  onSelectResource,
  getCategoryColor,
  getCategoryDisplayName,
  getRarityInfo
}) => {
  return (
    <>
      <div className="mb-4 text-amber-300">
        <span className="font-medium">{resources.length}</span> resources found
      </div>
      <div className="mb-6">
        <h3 className="text-xl font-serif text-amber-500 mb-4 border-b border-amber-300 pb-2">Articles & Guides</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
            <div className="h-48 overflow-hidden">
              <img 
                src="/images/strategies-article.png" 
                alt="Strategies Article" 
                className="w-full h-full object-cover transition-transform hover:scale-105"
                onError={(e) => {
                  // Fallback if image doesn't exist
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Strategies';
                }}
              />
            </div>
            <div className="p-6">
              <h3 className="text-xl font-serif text-amber-800 mb-2">20 Strategies to Get Ahead</h3>
              <p className="text-gray-600 mb-4">
                Learn essential strategies for economic success in the competitive markets of La Serenissima.
              </p>
              <button 
                onClick={() => {}}
                className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                Read Article
              </button>
            </div>
          </div>
        </div>
        
        <h3 className="text-xl font-serif text-amber-500 mb-4 border-b border-amber-300 pb-2">Resource Encyclopedia</h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" key="resource-grid">
        {resources.map(resource => (
          <div 
            key={resource.id}
            className={`border-2 rounded-lg overflow-hidden shadow-md cursor-pointer transition-transform hover:scale-105 hover:shadow-lg ${getCategoryColor(resource.category)}`}
            onClick={() => onSelectResource(resource)}
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
    </>
  );
};

export default ResourceGrid;
