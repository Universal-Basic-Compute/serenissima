import React, { useRef, useEffect, useState } from 'react';
import { FaTimes, FaCoins, FaArrowRight, FaIndustry, FaArrowDown } from 'react-icons/fa';
import { Resource } from '@/lib/services/ResourceService';

// Extended Resource interface to include production-related properties
export interface ExtendedResource extends Omit<Resource, 'id'> {
  id?: string; // Make id optional in ExtendedResource
  productionProperties?: {
    producerBuilding?: string;
    processorBuilding?: string;
    productionComplexity?: number;
    processingComplexity?: number;
    requiredSkill?: string;
    productionTime?: number;
    processingTime?: number;
    batchSize?: number;
    inputs?: Array<{
      resource: string;
      amount: number;
      qualityImpact?: number;
    }>;
    outputs?: Array<{
      resource: string;
      amount: number;
    }>;
  };
  productionChainPosition?: {
    predecessors?: Array<{
      resource: string;
      facility?: string;
    }>;
    successors?: Array<{
      resource: string;
      facility?: string;
    }>;
  };
  baseProperties?: {
    baseValue?: number;
    weight?: number;
    volume?: number;
    stackSize?: number;
    perishable?: boolean;
    perishTime?: number;
    nutritionValue?: number;
  };
  // Production chain properties
  producedFrom?: Array<{
    inputs: Array<{
      resource: string;
      amount: number;
      qualityImpact?: number;
    }>;
    building?: string;
    processingTime?: number;
  }>;
  usedIn?: Array<{
    outputs: Array<{
      resource: string;
      amount: number;
    }>;
    building?: string;
    processingTime?: number;
  }>;
}

interface ResourceDetailsModalProps {
  resource: Resource & Partial<ExtendedResource>;
  onClose: () => void;
}

const ResourceDetailsModal: React.FC<ResourceDetailsModalProps> = ({ resource, onClose }) => {
  // Ensure resource is treated as ExtendedResource
  const extendedResource = resource as Resource & ExtendedResource;
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Close when clicking outside the modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Format category name for display
  const formatCategoryName = (name: string) => {
    return name.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Get rarity color
  const getRarityColor = (rarity?: string) => {
    switch(rarity) {
      case 'common': return 'bg-gray-200 text-gray-800';
      case 'uncommon': return 'bg-green-200 text-green-800';
      case 'rare': return 'bg-blue-200 text-blue-800';
      case 'exotic': return 'bg-purple-200 text-purple-800';
      default: return 'bg-gray-200 text-gray-800';
    }
  };
  
  // Helper function to get production building from different possible structures
  const getProductionBuilding = () => {
    if (extendedResource.productionProperties?.processorBuilding) {
      return extendedResource.productionProperties.processorBuilding;
    }
    if (extendedResource.productionProperties?.producerBuilding) {
      return extendedResource.productionProperties.producerBuilding;
    }
    return null;
  };

  // Add useEffect for debugging
  useEffect(() => {
    console.log('Resource data:', extendedResource);
    console.log('Inputs:', getInputs());
    console.log('Outputs:', getOutputs());
  }, [extendedResource]);
  
  // Helper function to get proper icon path with fallback
  const getIconPath = (iconName: string) => {
    // Check if the icon path already starts with a slash or http
    if (iconName.startsWith('/') || iconName.startsWith('http')) {
      return iconName;
    }
    
    // Otherwise, ensure it starts with a slash for public directory
    return `https://backend.serenissima.ai/public_assets/images/resources/${iconName}`;
  };

  // Helper function to get inputs from different possible structures
  const getInputs = () => {
    // Check for productionProperties.inputs
    if (extendedResource.productionProperties?.inputs && 
        Array.isArray(extendedResource.productionProperties.inputs) &&
        extendedResource.productionProperties.inputs.length > 0) {
      return extendedResource.productionProperties.inputs;
    }
    
    // Check for producedFrom structure
    if (extendedResource.producedFrom && 
        Array.isArray(extendedResource.producedFrom) && 
        extendedResource.producedFrom.length > 0) {
      // Get inputs from the first production method
      const firstMethod = extendedResource.producedFrom[0];
      if (firstMethod.inputs && Array.isArray(firstMethod.inputs)) {
        return firstMethod.inputs;
      }
    }
    
    return [];
  };

  // Helper function to get outputs from different possible structures
  const getOutputs = () => {
    // Check for productionProperties.outputs
    if (extendedResource.productionProperties?.outputs && 
        Array.isArray(extendedResource.productionProperties.outputs) &&
        extendedResource.productionProperties.outputs.length > 0) {
      return extendedResource.productionProperties.outputs;
    }
    
    // Check for usedIn structure
    if (extendedResource.usedIn && 
        Array.isArray(extendedResource.usedIn) && 
        extendedResource.usedIn.length > 0) {
      // Get outputs from the first usage method
      const firstUsage = extendedResource.usedIn[0];
      if (firstUsage.outputs && Array.isArray(firstUsage.outputs)) {
        return firstUsage.outputs;
      }
    }
    
    // If there are no explicit outputs but there's a batch size, the resource itself is the output
    if (extendedResource.productionProperties?.batchSize) {
      return [{
        resource: extendedResource.id || extendedResource.name.toLowerCase(),
        amount: extendedResource.productionProperties.batchSize
      }];
    }
    
    return [];
  };

  // Helper function to check if we have any production information
  const hasProductionInfo = () => {
    return (
      getProductionBuilding() || 
      getInputs().length > 0 || 
      extendedResource.productionProperties?.batchSize || // Check for batch size
      (extendedResource.productionChainPosition?.predecessors && extendedResource.productionChainPosition.predecessors.length > 0) ||
      (extendedResource.productionChainPosition?.successors && extendedResource.productionChainPosition.successors.length > 0)
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div 
        ref={modalRef}
        className="relative bg-amber-900/90 border-2 border-amber-700 rounded-lg w-full max-w-xs sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
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
                src={getIconPath(resource.icon)} 
                alt={resource.name}
                className="w-20 h-20 object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.fallback) {
                    target.dataset.fallback = 'true';
                    target.src = "https://backend.serenissima.ai/public_assets/images/resources/default.png";
                    // If that fails too, use a placeholder
                    target.onerror = () => {
                      target.src = `https://via.placeholder.com/80?text=${resource.name.charAt(0).toUpperCase()}`;
                      target.onerror = null; // Prevent infinite loop
                    };
                  }
                }}
              />
            </div>
            <div>
              <div className="flex items-center mb-2">
                {resource.rarity && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getRarityColor(resource.rarity)}`}>
                    {resource.rarity.charAt(0).toUpperCase() + resource.rarity.slice(1)}
                  </span>
                )}
              </div>
              <div className="text-amber-300 text-sm">
                <div className="mb-1">
                  <span className="font-medium">Category:</span> {formatCategoryName(resource.category)}
                </div>
                {resource.subCategory && (
                  <div className="mb-1">
                    <span className="font-medium">SubCategory:</span> {formatCategoryName(resource.subCategory)}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-3 mt-2">
                  {resource.amount !== undefined && (
                    <div className="flex items-center text-amber-200">
                      <FaCoins className="mr-1" size={12} />
                      <span>Amount: {resource.amount}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Multi-column layout for content sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Description - always in first column */}
            <div className="space-y-6">
              {resource.description && (
                <div>
                  <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Description</h4>
                  <p className="text-amber-100 text-sm mb-2">
                    {resource.description}
                  </p>
                </div>
              )}
              
              {/* Production Building */}
              {getProductionBuilding() && (
                <div>
                  <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Production</h4>
                  <div className="flex items-center text-amber-200 font-medium mb-2">
                    <FaIndustry className="mr-2" />
                    <span>Produced in: {formatCategoryName(getProductionBuilding())}</span>
                  </div>
                  
                  <div className="text-amber-100 text-sm ml-6 space-y-1">
                    {extendedResource.productionProperties?.processingTime && (
                      <div>
                        <span className="font-medium">Processing Time:</span> {extendedResource.productionProperties.processingTime} minutes
                      </div>
                    )}
                    
                    {extendedResource.productionProperties?.productionTime && (
                      <div>
                        <span className="font-medium">Production Time:</span> {extendedResource.productionProperties.productionTime} minutes
                      </div>
                    )}
                    
                    {extendedResource.productionProperties?.processingComplexity && (
                      <div>
                        <span className="font-medium">Complexity:</span> {extendedResource.productionProperties.processingComplexity}/10
                      </div>
                    )}
                    
                    {extendedResource.productionProperties?.productionComplexity && (
                      <div>
                        <span className="font-medium">Complexity:</span> {extendedResource.productionProperties.productionComplexity}/10
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Input/Output Resources - second column */}
            <div className="space-y-6">
              {/* Input Resources */}
              <div>
                <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Inputs</h4>
                {getInputs().length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {getInputs().map((input: any, index: number) => (
                      <div 
                        key={index}
                        className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30"
                      >
                        <div className="mr-2 text-amber-100 text-sm">
                          {input.amount && <span className="font-medium mr-1">{input.amount}×</span>}
                          {formatCategoryName(input.resource)}
                          {input.qualityImpact !== undefined && (
                            <span className="ml-2 text-xs text-amber-200/70">
                              (Quality impact: {(input.qualityImpact * 100).toFixed(0)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-amber-400/70 text-sm italic">No input resources required</p>
                )}
              </div>
              
              {/* Output Resources */}
              <div>
                <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Outputs</h4>
                {getOutputs().length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {getOutputs().map((output: any, index: number) => (
                      <div 
                        key={index}
                        className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30"
                      >
                        <div className="mr-2 text-amber-100 text-sm">
                          {output.amount && <span className="font-medium mr-1">{output.amount}×</span>}
                          {output.resource === extendedResource.id || output.resource === extendedResource.name.toLowerCase() 
                            ? extendedResource.name 
                            : formatCategoryName(output.resource)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-amber-400/70 text-sm italic">No output resources</p>
                )}
              </div>
            </div>
            
            {/* Production Chain Position - third column */}
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Production Chain</h4>
                
                {extendedResource.productionChainPosition ? (
                  <>
                    {extendedResource.productionChainPosition.predecessors && extendedResource.productionChainPosition.predecessors.length > 0 && (
                      <div className="mb-3">
                        <div className="text-amber-200 font-medium mb-1">Predecessors:</div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {extendedResource.productionChainPosition.predecessors.map((pred: any, index: number) => (
                            <div key={index} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-1 rounded">
                              {formatCategoryName(pred.resource)} 
                              {pred.facility && <span className="text-amber-200/70"> ({formatCategoryName(pred.facility)})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {extendedResource.productionChainPosition.successors && extendedResource.productionChainPosition.successors.length > 0 && (
                      <div>
                        <div className="text-amber-200 font-medium mb-1">Successors:</div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {extendedResource.productionChainPosition.successors.map((succ: any, index: number) => (
                            <div key={index} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-1 rounded">
                              {formatCategoryName(succ.resource)}
                              {succ.facility && <span className="text-amber-200/70"> ({formatCategoryName(succ.facility)})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-amber-400/70 text-sm italic">No production chain information available</p>
                )}
              </div>
              
              {/* Show message if no production information is available */}
              {!hasProductionInfo() && (
                <p className="text-amber-400/70 text-sm italic">No production information available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceDetailsModal;
