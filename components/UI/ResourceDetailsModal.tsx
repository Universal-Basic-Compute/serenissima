import React, { useRef, useEffect } from 'react';
import { FaTimes, FaCoins, FaArrowRight, FaIndustry, FaArrowDown } from 'react-icons/fa';
import { Resource } from '@/lib/services/ResourceService';

interface ResourceDetailsModalProps {
  resource: Resource;
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

  // Helper function to get inputs from different possible structures
  const getInputs = () => {
    if (resource.productionProperties?.inputs) {
      return resource.productionProperties.inputs;
    }
    return [];
  };

  // Helper function to get outputs from different possible structures
  const getOutputs = () => {
    if (resource.productionProperties?.outputs) {
      return resource.productionProperties.outputs;
    }
    return [];
  };

  // Helper function to check if we have any production information
  const hasProductionInfo = () => {
    return (
      getProductionBuilding() || 
      getInputs().length > 0 || 
      getOutputs().length > 0 ||
      (resource.productionChainPosition?.predecessors && resource.productionChainPosition.predecessors.length > 0) ||
      (resource.productionChainPosition?.successors && resource.productionChainPosition.successors.length > 0)
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div 
        ref={modalRef}
        className="relative bg-amber-900/90 border-2 border-amber-700 rounded-lg max-w-xs sm:max-w-xl md:max-w-2xl lg:max-w-4xl w-full max-h-[90vh] overflow-auto"
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
          
          {/* Description */}
          {resource.description && (
            <div className="mb-6">
              <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Description</h4>
              <p className="text-amber-100 text-sm mb-2">
                {resource.description}
              </p>
            </div>
          )}
          
          {/* Production Information */}
          <div className="mb-6">
            <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Production Chain</h4>
            
            {/* Production Building */}
            {getProductionBuilding() && (
              <div className="mb-4">
                <div className="flex items-center text-amber-200 font-medium mb-2">
                  <FaIndustry className="mr-2" />
                  <span>Produced in: {formatCategoryName(getProductionBuilding())}</span>
                </div>
                
                {resource.productionProperties?.processingTime && (
                  <div className="text-amber-100 text-sm ml-6 mb-1">
                    <span className="font-medium">Processing Time:</span> {resource.productionProperties.processingTime} minutes
                  </div>
                )}
                
                {resource.productionProperties?.productionTime && (
                  <div className="text-amber-100 text-sm ml-6 mb-1">
                    <span className="font-medium">Production Time:</span> {resource.productionProperties.productionTime} minutes
                  </div>
                )}
                
                {resource.productionProperties?.processingComplexity && (
                  <div className="text-amber-100 text-sm ml-6">
                    <span className="font-medium">Complexity:</span> {resource.productionProperties.processingComplexity}/10
                  </div>
                )}
                
                {resource.productionProperties?.productionComplexity && (
                  <div className="text-amber-100 text-sm ml-6">
                    <span className="font-medium">Complexity:</span> {resource.productionProperties.productionComplexity}/10
                  </div>
                )}
              </div>
            )}
            
            {/* Input Resources */}
            {getInputs().length > 0 && (
              <div className="mb-4">
                <div className="flex items-center text-amber-200 font-medium mb-2">
                  <FaArrowDown className="mr-2" />
                  <span>Inputs</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
                  {getInputs().map((input: any, index: number) => (
                    <div 
                      key={index}
                      className="flex items-center p-2 bg-amber-900/20 rounded border border-amber-700/30"
                    >
                      <div className="mr-2 text-amber-100 text-sm">
                        {input.amount && <span className="font-medium mr-1">{input.amount}×</span>}
                        {formatCategoryName(input.resource)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Output Resources */}
            {getOutputs().length > 0 && (
              <div>
                <div className="flex items-center text-amber-200 font-medium mb-2">
                  <FaArrowRight className="mr-2" />
                  <span>Outputs</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
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
              </div>
            )}
            
            {/* Production Chain Position */}
            {resource.productionChainPosition && (
              <div className="mt-4">
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
              </div>
            )}
            
            {/* Show message if no production information is available */}
            {!hasProductionInfo() && (
              <p className="text-amber-400/70 text-sm italic">No production information available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceDetailsModal;
