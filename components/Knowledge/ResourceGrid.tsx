import React from 'react';
import { ResourceNode } from '@/lib/utils/resourceUtils';

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
                  // Prevent infinite loops by checking if we've already tried the fallback
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.usedFallback) {
                    target.dataset.usedFallback = 'true';
                    target.src = "https://backend.serenissima.ai/public_assets/images/resources/icons/default.png";
                  }
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
            {resource.subCategory && (
              <div className="flex items-center mt-1">
                <span className="font-medium mr-1">SubCategory:</span>
                {getCategoryDisplayName(resource.subCategory)}
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
