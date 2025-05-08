import React from 'react';
import { FaTimes, FaWeight, FaCube, FaCoins, FaHistory, FaBuilding } from 'react-icons/fa';
import { ResourceNode } from '../../lib/resourceUtils';

interface ResourceDetailsProps {
  resource: ResourceNode;
  onClose: () => void;
  getInputResources: (resource: ResourceNode) => ResourceNode[];
  getOutputResources: (resource: ResourceNode) => ResourceNode[];
  onSelectResource: (resource: ResourceNode) => void;
  getCategoryDisplayName: (category: string) => string;
  getRarityInfo: (rarity?: string) => { name: string; color: string };
}

const ResourceDetails: React.FC<ResourceDetailsProps> = ({
  resource,
  onClose,
  getInputResources,
  getOutputResources,
  onSelectResource,
  getCategoryDisplayName,
  getRarityInfo
}) => {
  return (
    <div className="w-1/3 bg-amber-900/30 border-l border-amber-700 overflow-auto p-6 tech-tree-scroll" key={`detail-${resource.id}`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-2xl font-serif text-amber-300">{resource.name}</h3>
        <button 
          onClick={onClose}
          className="text-amber-400 hover:text-amber-200 p-1"
        >
          <FaTimes />
        </button>
      </div>
      
      <div className="flex items-center mb-6">
        <div className="w-24 h-24 bg-white rounded-lg overflow-hidden flex items-center justify-center mr-4 border-2 border-amber-600">
          <img 
            src={resource.icon} 
            alt={resource.name}
            className="w-20 h-20 object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.dataset.usedFallback) {
                target.dataset.usedFallback = 'true';
                target.src = "/assets/resources/icons/default.png";
              }
            }}
          />
        </div>
        <div>
          <div className="flex items-center mb-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getRarityInfo(resource.rarity).color}`}>
              {getRarityInfo(resource.rarity).name}
            </span>
            <span className="ml-2 text-amber-200 font-medium">
              {resource.baseValue} <span className="italic">ducats</span>
            </span>
          </div>
          <div className="text-amber-300 text-sm">
            <div className="mb-1">
              <span className="font-medium">Category:</span> {getCategoryDisplayName(resource.category)}
            </div>
            {resource.subcategory && (
              <div className="mb-1">
                <span className="font-medium">Subcategory:</span> {getCategoryDisplayName(resource.subcategory)}
              </div>
            )}
            
            {/* Physical properties */}
            <div className="flex flex-wrap gap-3 mt-2">
              {resource.weight && (
                <div className="flex items-center text-amber-200">
                  <FaWeight className="mr-1" size={12} />
                  <span>{resource.weight} kg</span>
                </div>
              )}
              {resource.volume && (
                <div className="flex items-center text-amber-200">
                  <FaCube className="mr-1" size={12} />
                  <span>{resource.volume} m³</span>
                </div>
              )}
              {resource.baseValue && (
                <div className="flex items-center text-amber-200">
                  <FaCoins className="mr-1" size={12} />
                  <span>{resource.baseValue} ducats</span>
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
          {resource.description || "No description available."}
        </p>
      </div>
      
      {/* Varieties */}
      {resource.varieties && resource.varieties.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Varieties</h4>
          <div className="grid grid-cols-1 gap-2">
            {resource.varieties.map((variety, index) => (
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
          {getInputResources(resource).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {getInputResources(resource).map(input => (
                <div 
                  key={input.id}
                  className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30 cursor-pointer hover:bg-amber-900/40"
                  onClick={() => onSelectResource(input)}
                >
                  <div className="w-8 h-8 bg-white rounded overflow-hidden flex items-center justify-center mr-2 border border-amber-200">
                    <img 
                      src={input.icon} 
                      alt={input.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.usedFallback) {
                          target.dataset.usedFallback = 'true';
                          target.src = "/assets/resources/icons/default.png";
                        }
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
          {getOutputResources(resource).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {getOutputResources(resource).map(output => (
                <div 
                  key={output.id}
                  className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30 cursor-pointer hover:bg-amber-900/40"
                  onClick={() => onSelectResource(output)}
                >
                  <div className="w-8 h-8 bg-white rounded overflow-hidden flex items-center justify-center mr-2 border border-amber-200">
                    <img 
                      src={output.icon} 
                      alt={output.name}
                      className="w-6 h-6 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.dataset.usedFallback) {
                          target.dataset.usedFallback = 'true';
                          target.src = "/assets/resources/icons/default.png";
                        }
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
        {resource.buildings && resource.buildings.length > 0 ? (
          <div className="space-y-2">
            {resource.buildings.map(building => (
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
                      Produces {resource.name}
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
      {resource.historicalNotes && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
            <div className="flex items-center">
              <FaHistory className="mr-2" />
              Historical Context
            </div>
          </h4>
          <div className="bg-amber-900/20 p-3 rounded border border-amber-700/30 text-amber-100 text-sm italic">
            {resource.historicalNotes.historicalSignificance || 
             resource.historicalNotes.culturalContext || 
             "No historical notes available."}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceDetails;
