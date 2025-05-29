import React from 'react';
import { FaTimes, FaWeight, FaCube, FaCoins, FaHistory, FaBuilding, FaShip, FaWarehouse, FaExchangeAlt, FaChartLine, FaCalendarAlt } from 'react-icons/fa';
import { ResourceNode } from '@/lib/utils/resourceUtils';

// Étendre l'interface ResourceNode pour inclure les propriétés spécifiques
interface ExtendedResourceNode extends ResourceNode {
  substitutes?: Array<{
    resourceId: string;
    efficiency?: number;
    qualityPenalty?: number;
    context?: string;
  }>;
}

interface ResourceDetailsProps {
  resource: ExtendedResourceNode;
  onClose: () => void;
  getInputResources: (resource: ExtendedResourceNode) => ResourceNode[];
  getOutputResources: (resource: ExtendedResourceNode) => ResourceNode[];
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
  // Helper function to render object properties in a readable format
  const renderProperties = (obj: any, excludeKeys: string[] = []): React.ReactNode => {
    if (!obj) return null;
    
    return Object.entries(obj)
      .filter(([key]) => !excludeKeys.includes(key))
      .map(([key, value]) => {
        // Skip if value is an object or array (we'll handle these separately)
        if (typeof value === 'object' && value !== null) return null;
        
        return (
          <div key={key} className="mb-1">
            <span className="font-medium">{getCategoryDisplayName(key)}:</span>{' '}
            {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
          </div>
        );
      });
  };

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
                target.src = "https://backend.serenissima.ai/public_assets/images/resources/icons/default.png";
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
            {resource.subCategory && (
              <div className="mb-1">
                <span className="font-medium">SubCategory:</span> {getCategoryDisplayName(resource.subCategory)}
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
              {resource.stackSize && (
                <div className="flex items-center text-amber-200">
                  <span className="mr-1 text-xs">×</span>
                  <span>{resource.stackSize}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Description */}
      <div className="mb-6">
        <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Description</h4>
        <p className="text-amber-100 text-sm mb-2">
          {resource.description || "No description available."}
        </p>
        {resource.longDescription && (
          <p className="text-amber-100/80 text-sm italic">
            {resource.longDescription}
          </p>
        )}
      </div>
      
      {/* Base Properties */}
      {resource.baseProperties && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Properties</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-amber-100">
            {renderProperties(resource.baseProperties)}
            {resource.perishable && (
              <div className="col-span-2 mt-1 text-amber-200 italic">
                This resource is perishable and will deteriorate over time.
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Source Properties */}
      {resource.storageProperties && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Source</h4>
          <div className="bg-amber-900/20 rounded p-3 border border-amber-700/30">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-amber-100">
              {resource.storageProperties.source && (
                <div className="col-span-2 mb-1">
                  <span className="font-medium">Source:</span> {getCategoryDisplayName(resource.storageProperties.source)}
                </div>
              )}
              {resource.storageProperties.harvestMethod && (
                <div className="col-span-2 mb-1">
                  <span className="font-medium">Harvest Method:</span> {getCategoryDisplayName(resource.storageProperties.harvestMethod)}
                </div>
              )}
              {resource.storageProperties.availability && (
                <div>
                  <span className="font-medium">Availability:</span> {getCategoryDisplayName(resource.storageProperties.availability)}
                </div>
              )}
              {resource.storageProperties.seasonality && (
                <div>
                  <span className="font-medium">Seasonality:</span> {getCategoryDisplayName(resource.storageProperties.seasonality)}
                </div>
              )}
            </div>
            
            {resource.storageProperties.locations && resource.storageProperties.locations.length > 0 && (
              <div className="mt-2">
                <span className="font-medium text-sm text-amber-100">Locations:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {resource.storageProperties.locations.map((location: string) => (
                    <span key={location} className="text-xs bg-amber-800/50 text-amber-200 px-2 py-0.5 rounded">
                      {getCategoryDisplayName(location)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Varieties */}
      {resource.varieties && resource.varieties.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Varieties</h4>
          <div className="grid grid-cols-1 gap-2">
            {resource.varieties.map((variety, index) => (
              <div key={index} className="bg-amber-900/20 rounded p-3 border border-amber-700/30">
                <div className="font-medium text-amber-200">{getCategoryDisplayName(variety.type)}</div>
                <div className="text-xs text-amber-100 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                  {variety.appearance && (
                    <div><span className="font-medium">Appearance:</span> {getCategoryDisplayName(variety.appearance)}</div>
                  )}
                  {variety.valueMultiplier && (
                    <div><span className="font-medium">Value:</span> {variety.valueMultiplier}×</div>
                  )}
                  {variety.primaryUse && (
                    <div className="col-span-2"><span className="font-medium">Primary Use:</span> {getCategoryDisplayName(variety.primaryUse)}</div>
                  )}
                  {variety.primarilyUsedFor && (
                    <div className="col-span-2"><span className="font-medium">Used For:</span> {getCategoryDisplayName(variety.primarilyUsedFor)}</div>
                  )}
                  {variety.durability && (
                    <div><span className="font-medium">Durability:</span> {getCategoryDisplayName(variety.durability)}</div>
                  )}
                  {variety.popularity && (
                    <div><span className="font-medium">Popularity:</span> {getCategoryDisplayName(variety.popularity)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Quality Variations */}
      {resource.qualityVariations && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Quality Levels</h4>
          
          {resource.qualityVariations.availableQualities && resource.qualityVariations.availableQualities.length > 0 && (
            <div className="mb-3">
              <div className="text-sm text-amber-100 mb-1">Available Qualities:</div>
              <div className="flex flex-wrap gap-1">
                {resource.qualityVariations.availableQualities.map((quality: string) => (
                  <span 
                    key={quality} 
                    className={`text-xs px-2 py-0.5 rounded ${
                      quality === resource.qualityVariations.defaultQuality 
                        ? 'bg-amber-600 text-white' 
                        : 'bg-amber-800/40 text-amber-200'
                    }`}
                  >
                    {getCategoryDisplayName(quality)}
                    {quality === resource.qualityVariations.defaultQuality && ' (Default)'}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {resource.qualityVariations.qualityMultipliers && (
            <div className="bg-amber-900/20 rounded p-3 border border-amber-700/30 mb-3">
              <div className="text-sm text-amber-200 font-medium mb-2">Quality Effects</div>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(resource.qualityVariations.qualityMultipliers).map(([quality, multipliers]) => (
                  <div key={quality} className="text-xs">
                    <div className="text-amber-100 font-medium mb-1">{getCategoryDisplayName(quality)}:</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 pl-2 text-amber-100/90">
                      {Object.entries(multipliers as Record<string, number>).map(([attribute, value]) => (
                        <div key={attribute}>
                          <span className="font-medium">{getCategoryDisplayName(attribute)}:</span> {value}×
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {resource.qualityVariations.qualityFactors && resource.qualityVariations.qualityFactors.length > 0 && (
            <div>
              <div className="text-sm text-amber-100 mb-1">Quality Factors:</div>
              <div className="grid grid-cols-1 gap-1">
                {resource.qualityVariations.qualityFactors.map((factor: any, index: number) => (
                  <div key={index} className="flex justify-between text-xs bg-amber-900/10 p-2 rounded">
                    <span className="text-amber-200">{getCategoryDisplayName(factor.factor)}</span>
                    <span className="text-amber-100">{factor.weight * 100}% impact</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Production Chain */}
      <div className="mb-6">
        <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Production Chain</h4>
        
        {/* Production Properties */}
        {resource.productionProperties && (
          <div className="mb-4 bg-amber-900/20 rounded p-3 border border-amber-700/30">
            <div className="text-sm text-amber-200 font-medium mb-2">Production Details</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-100">
              {resource.productionProperties.processorBuilding && (
                <div className="col-span-2 mb-1">
                  <span className="font-medium">Produced in:</span> {getCategoryDisplayName(resource.productionProperties.processorBuilding)}
                </div>
              )}
              {resource.productionProperties.processingTime && (
                <div>
                  <span className="font-medium">Processing Time:</span> {resource.productionProperties.processingTime} minutes
                </div>
              )}
              {resource.productionProperties.processingComplexity && (
                <div>
                  <span className="font-medium">Complexity:</span> {resource.productionProperties.processingComplexity}/10
                </div>
              )}
              {resource.productionProperties.requiredSkill && (
                <div className="col-span-2">
                  <span className="font-medium">Required Skill:</span> {getCategoryDisplayName(resource.productionProperties.requiredSkill)}
                </div>
              )}
            </div>
          </div>
        )}
        
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
                          target.src = "https://backend.serenissima.ai/public_assets/images/resources/icons/default.png";
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
                          target.src = "https://backend.serenissima.ai/public_assets/images/resources/icons/default.png";
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
      
      {/* Transport Properties */}
      {resource.transportProperties && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
            <div className="flex items-center">
              <FaShip className="mr-2" />
              Transportation
            </div>
          </h4>
          
          {resource.transportProperties.transportMethods && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-2">Transport Methods</h5>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(resource.transportProperties.transportMethods).map(([method, details]) => (
                  <div key={method} className="bg-amber-900/20 rounded p-2 border border-amber-700/30">
                    <div className="text-amber-100 font-medium text-sm">{getCategoryDisplayName(method)}</div>
                    <div className="grid grid-cols-3 gap-1 mt-1 text-xs text-amber-100/90">
                      {Object.entries(details as Record<string, any>).map(([property, value]) => (
                        <div key={property}>
                          <span className="font-medium">{getCategoryDisplayName(property)}:</span> {property === 'risk' ? `${(value as number) * 100}%` : value}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {resource.transportProperties.specialRequirements && resource.transportProperties.specialRequirements.length > 0 && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-1">Special Requirements</h5>
              <div className="flex flex-wrap gap-1">
                {resource.transportProperties.specialRequirements.map((req: string) => (
                  <span key={req} className="text-xs bg-amber-800/40 text-amber-200 px-2 py-0.5 rounded">
                    {getCategoryDisplayName(req)}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {resource.transportProperties.routeRestrictions && resource.transportProperties.routeRestrictions.length > 0 && (
            <div>
              <h5 className="text-sm text-amber-200 font-medium mb-1">Route Restrictions</h5>
              <div className="flex flex-wrap gap-1">
                {resource.transportProperties.routeRestrictions.map((restriction: string) => (
                  <span key={restriction} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-0.5 rounded">
                    {getCategoryDisplayName(restriction)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Storage Properties */}
      {resource.storageProperties && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
            <div className="flex items-center">
              <FaWarehouse className="mr-2" />
              Storage
            </div>
          </h4>
          
          {resource.storageProperties.storageFacilities && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-2">Storage Facilities</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(resource.storageProperties.storageFacilities).map(([facility, details]) => (
                  <div key={facility} className="bg-amber-900/20 rounded p-2 border border-amber-700/30">
                    <div className="text-amber-100 font-medium text-sm">{getCategoryDisplayName(facility)}</div>
                    <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-amber-100/90">
                      {Object.entries(details as Record<string, any>).map(([property, value]) => (
                        <div key={property}>
                          <span className="font-medium">{getCategoryDisplayName(property)}:</span> {value}×
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {resource.storageProperties.storageRequirements && resource.storageProperties.storageRequirements.length > 0 && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-1">Storage Requirements</h5>
              <div className="flex flex-wrap gap-1">
                {resource.storageProperties.storageRequirements.map((req: string) => (
                  <span key={req} className="text-xs bg-amber-800/40 text-amber-200 px-2 py-0.5 rounded">
                    {getCategoryDisplayName(req)}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {resource.storageProperties.specialRisks && resource.storageProperties.specialRisks.length > 0 && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-1">Storage Risks</h5>
              <div className="flex flex-wrap gap-1">
                {resource.storageProperties.specialRisks.map((risk: string) => (
                  <span key={risk} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-0.5 rounded">
                    {getCategoryDisplayName(risk)}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {resource.storageProperties.maxStorageTime && (
            <div className="text-sm text-amber-100">
              <span className="font-medium">Maximum Storage Time:</span>{' '}
              {resource.storageProperties.maxStorageTime === 'unlimited' 
                ? 'Unlimited' 
                : `${resource.storageProperties.maxStorageTime} hours`}
            </div>
          )}
        </div>
      )}
      
      {/* Contract Dynamics */}
      {resource.contractDynamics && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
            <div className="flex items-center">
              <FaChartLine className="mr-2" />
              Contract Dynamics
            </div>
          </h4>
          
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-amber-100 mb-3">
            {resource.contractDynamics.baseAvailability !== undefined && (
              <div>
                <span className="font-medium">Base Availability:</span> {resource.contractDynamics.baseAvailability * 100}%
              </div>
            )}
            {resource.contractDynamics.demandLevel && (
              <div>
                <span className="font-medium">Demand Level:</span> {getCategoryDisplayName(resource.contractDynamics.demandLevel)}
              </div>
            )}
            {resource.contractDynamics.priceVolatility !== undefined && (
              <div>
                <span className="font-medium">Price Volatility:</span> {resource.contractDynamics.priceVolatility * 100}%
              </div>
            )}
          </div>
          
          {resource.contractDynamics.influencedBy && resource.contractDynamics.influencedBy.length > 0 && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-1">Price Influenced By</h5>
              <div className="flex flex-wrap gap-1">
                {resource.contractDynamics.influencedBy.map((factor: string) => (
                  <span key={factor} className="text-xs bg-amber-800/40 text-amber-200 px-2 py-0.5 rounded">
                    {getCategoryDisplayName(factor)}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {resource.contractDynamics.regionalFactors && resource.contractDynamics.regionalFactors.length > 0 && (
            <div>
              <h5 className="text-sm text-amber-200 font-medium mb-1">Regional Factors</h5>
              <div className="grid grid-cols-1 gap-1">
                {resource.contractDynamics.regionalFactors.map((factor: any, index: number) => (
                  <div key={index} className="flex justify-between text-xs bg-amber-900/10 p-2 rounded">
                    <span className="text-amber-200">{getCategoryDisplayName(factor.region)}</span>
                    <div className="text-amber-100">
                      {factor.availabilityModifier && (
                        <span className="mr-2">Availability: {factor.availabilityModifier}×</span>
                      )}
                      {factor.priceModifier && (
                        <span>Price: {factor.priceModifier}×</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
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
      
      {/* Substitutes and Complements */}
      {(resource.substitutes || resource.complements) && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
            <div className="flex items-center">
              <FaExchangeAlt className="mr-2" />
              Related Resources
            </div>
          </h4>
          
          {resource.substitutes && resource.substitutes.length > 0 && (
            <div className="mb-3">
              <h5 className="text-sm text-amber-200 font-medium mb-2">Substitutes</h5>
              <div className="space-y-2">
                {resource.substitutes!.map((substitute: any, index: number) => (
                  <div key={index} className="bg-amber-900/20 rounded p-2 border border-amber-700/30">
                    <div className="text-amber-100 font-medium text-sm">{getCategoryDisplayName(substitute.resourceId)}</div>
                    <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-amber-100/90">
                      {substitute.efficiency !== undefined && (
                        <div>
                          <span className="font-medium">Efficiency:</span> {substitute.efficiency * 100}%
                        </div>
                      )}
                      {substitute.qualityPenalty !== undefined && (
                        <div>
                          <span className="font-medium">Quality Penalty:</span> {substitute.qualityPenalty}
                        </div>
                      )}
                      {substitute.context && (
                        <div className="col-span-2">
                          <span className="font-medium">Context:</span> {getCategoryDisplayName(substitute.context)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {resource.complements && resource.complements.length > 0 && (
            <div>
              <h5 className="text-sm text-amber-200 font-medium mb-1">Complementary Resources</h5>
              <div className="flex flex-wrap gap-1">
                {resource.complements.map((complement: string, index: number) => (
                  <span key={index} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-0.5 rounded">
                    {getCategoryDisplayName(complement)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Historical Notes */}
      {resource.historicalNotes && (
        <div className="mb-6">
          <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">
            <div className="flex items-center">
              <FaHistory className="mr-2" />
              Historical Context
            </div>
          </h4>
          
          <div className="space-y-3">
            {resource.historicalNotes.introductionYear && (
              <div className="flex items-start">
                <FaCalendarAlt className="text-amber-400 mt-1 mr-2" />
                <div>
                  <div className="text-sm text-amber-200 font-medium">Introduction</div>
                  <div className="text-sm text-amber-100">
                    {resource.historicalNotes.introductionYear === 'ancient' 
                      ? 'Used since ancient times' 
                      : `Introduced in ${resource.historicalNotes.introductionYear}`}
                  </div>
                </div>
              </div>
            )}
            
            {resource.historicalNotes.historicalSignificance && (
              <div className="bg-amber-900/20 p-3 rounded border border-amber-700/30 text-amber-100 text-sm italic">
                {resource.historicalNotes.historicalSignificance}
              </div>
            )}
            
            {resource.historicalNotes.culturalContext && resource.historicalNotes.historicalSignificance !== resource.historicalNotes.culturalContext && (
              <div className="bg-amber-900/20 p-3 rounded border border-amber-700/30 text-amber-100 text-sm italic">
                {resource.historicalNotes.culturalContext}
              </div>
            )}
            
            {resource.historicalNotes.notableProducers && resource.historicalNotes.notableProducers.length > 0 && (
              <div>
                <div className="text-sm text-amber-200 font-medium mb-1">Notable Producers</div>
                <div className="flex flex-wrap gap-1">
                  {resource.historicalNotes.notableProducers.map((producer: string, index: number) => (
                    <span key={index} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-0.5 rounded">
                      {producer}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {resource.historicalNotes.historicalContracts && resource.historicalNotes.historicalContracts.length > 0 && (
              <div>
                <div className="text-sm text-amber-200 font-medium mb-1">Historical Contracts</div>
                <div className="flex flex-wrap gap-1">
                  {resource.historicalNotes.historicalContracts.map((contract: string, index: number) => (
                    <span key={index} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-0.5 rounded">
                      {contract}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceDetails;
