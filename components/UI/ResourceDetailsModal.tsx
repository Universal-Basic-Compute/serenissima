import React, { useRef, useEffect, useState } from 'react';
import { FaTimes, FaCoins, FaArrowRight, FaIndustry, FaArrowDown } from 'react-icons/fa';
import { Resource } from '@/lib/services/ResourceService';

// Extended Resource interface to include production-related properties
export interface ExtendedResource extends Resource {
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
}

interface ResourceDetailsModalProps {
  resource: ExtendedResource;
  onClose: () => void;
}

const ResourceDetailsModal: React.FC<ResourceDetailsModalProps> = ({ resource, onClose }) => {
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
    if (resource.productionProperties?.processorBuilding) {
      return resource.productionProperties.processorBuilding;
    }
    if (resource.productionProperties?.producerBuilding) {
      return resource.productionProperties.producerBuilding;
    }
    return null;
  };

  // Add useEffect for debugging
  useEffect(() => {
    console.log('Resource data:', resource);
  }, [resource]);

  // Helper function to get inputs from different possible structures
  const getInputs = () => {
    if (resource.productionProperties?.inputs && Array.isArray(resource.productionProperties.inputs)) {
      return resource.productionProperties.inputs;
    }
    return [];
  };

  // Helper function to get outputs from different possible structures
  const getOutputs = () => {
    // For resources like bread, we need to create outputs from the resource itself
    if (!resource.productionProperties?.outputs || resource.productionProperties.outputs.length === 0) {
      // If the resource is the output itself (like bread), create a default output
      return [{
        resource: resource.id,
        amount: resource.productionProperties?.batchSize || 1
      }];
    }
    return resource.productionProperties.outputs;
  };

  // Helper function to check if we have any production information
  const hasProductionInfo = () => {
    return (
      getProductionBuilding() || 
      getInputs().length > 0 || 
      resource.productionProperties?.batchSize || // Check for batch size
      (resource.productionChainPosition?.predecessors && resource.productionChainPosition.predecessors.length > 0) ||
      (resource.productionChainPosition?.successors && resource.productionChainPosition.successors.length > 0)
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
                {resource.subcategory && (
                  <div className="mb-1">
                    <span className="font-medium">Subcategory:</span> {formatCategoryName(resource.subcategory)}
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
                    {resource.productionProperties?.processingTime && (
                      <div>
                        <span className="font-medium">Processing Time:</span> {resource.productionProperties.processingTime} minutes
                      </div>
                    )}
                    
                    {resource.productionProperties?.productionTime && (
                      <div>
                        <span className="font-medium">Production Time:</span> {resource.productionProperties.productionTime} minutes
                      </div>
                    )}
                    
                    {resource.productionProperties?.processingComplexity && (
                      <div>
                        <span className="font-medium">Complexity:</span> {resource.productionProperties.processingComplexity}/10
                      </div>
                    )}
                    
                    {resource.productionProperties?.productionComplexity && (
                      <div>
                        <span className="font-medium">Complexity:</span> {resource.productionProperties.productionComplexity}/10
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
                          {input.qualityImpact && (
                            <span className="ml-2 text-xs text-amber-200/70">
                              (Quality impact: {input.qualityImpact * 100}%)
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
                          {formatCategoryName(output.resource)}
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
                
                {resource.productionChainPosition ? (
                  <>
                    {resource.productionChainPosition.predecessors && resource.productionChainPosition.predecessors.length > 0 && (
                      <div className="mb-3">
                        <div className="text-amber-200 font-medium mb-1">Predecessors:</div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {resource.productionChainPosition.predecessors.map((pred: any, index: number) => (
                            <div key={index} className="text-xs bg-amber-800/40 text-amber-100 px-2 py-1 rounded">
                              {formatCategoryName(pred.resource)} 
                              {pred.facility && <span className="text-amber-200/70"> ({formatCategoryName(pred.facility)})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {resource.productionChainPosition.successors && resource.productionChainPosition.successors.length > 0 && (
                      <div>
                        <div className="text-amber-200 font-medium mb-1">Successors:</div>
                        <div className="flex flex-wrap gap-2 ml-6">
                          {resource.productionChainPosition.successors.map((succ: any, index: number) => (
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
