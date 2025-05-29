import React, { useState, useEffect } from 'react';
import { ResourceNode } from '@/lib/utils/resourceUtils';
import { FaProjectDiagram, FaChevronRight, FaChevronDown, FaLeaf, FaIndustry, FaGem, FaArrowRight } from 'react-icons/fa';

interface ResourceTreeViewProps {
  resources?: ResourceNode[];
  onSelectResource?: (resource: ResourceNode) => void;
  loading?: boolean;
}

const ResourceTreeView: React.FC<ResourceTreeViewProps> = ({ 
  resources = [], 
  onSelectResource,
  loading = false
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['raw_materials']));
  const [resourceMap, setResourceMap] = useState<Record<string, ResourceNode>>({});
  
  // Build a map of resources by ID for quick lookup
  useEffect(() => {
    if (resources.length > 0) {
      const map: Record<string, ResourceNode> = {};
      resources.forEach(resource => {
        map[resource.id] = resource;
      });
      setResourceMap(map);
    }
  }, [resources]);
  
  // Toggle category expansion
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };
  
  // Get icon for category
  const getCategoryIcon = (category: string) => {
    switch(category) {
      case 'raw_materials':
        return <FaLeaf className="text-green-600" />;
      case 'processed_materials':
        return <FaIndustry className="text-blue-600" />;
      case 'finished_goods':
        return <FaGem className="text-purple-600" />;
      default:
        return <FaProjectDiagram className="text-amber-600" />;
    }
  };
  
  // Format category names for display
  const formatCategoryName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Group resources by category
  const resourcesByCategory = resources.reduce((acc, resource) => {
    const category = resource.category || 'uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(resource);
    return acc;
  }, {} as Record<string, ResourceNode[]>);
  
  if (loading) {
    return (
      <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full flex items-center justify-center">
        <div className="text-amber-300 animate-pulse">Constructing resource tree...</div>
      </div>
    );
  }
  
  if (resources.length === 0) {
    return (
      <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30">
        <div className="text-center text-amber-300 mb-6">
          <h3 className="text-xl font-serif">Production Chains</h3>
          <p className="text-sm mt-1">No resources found to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full">
      <div className="text-center text-amber-300 mb-6">
        <h3 className="text-xl font-serif">Resource Production Chains</h3>
        <p className="text-sm mt-1">Explore how resources are transformed through production chains</p>
      </div>
      
      <div className="overflow-auto max-h-[calc(100vh-200px)] tech-tree-scroll">
        {/* Categories */}
        {Object.keys(resourcesByCategory).sort().map(category => (
          <div key={category} className="mb-6">
            <div 
              className="flex items-center p-2 bg-amber-900/30 rounded-lg cursor-pointer hover:bg-amber-900/40 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <span className="mr-2 text-amber-300">
                {expandedCategories.has(category) ? <FaChevronDown /> : <FaChevronRight />}
              </span>
              <span className="mr-2">{getCategoryIcon(category)}</span>
              <span className="text-amber-200 font-medium">{formatCategoryName(category)}</span>
              <span className="ml-2 text-amber-400/70 text-sm">
                ({resourcesByCategory[category].length} resources)
              </span>
            </div>
            
            {/* Resources in category */}
            {expandedCategories.has(category) && (
              <div className="mt-4 pl-4">
                {resourcesByCategory[category].map(resource => (
                  <div key={resource.id} className="mb-6 bg-amber-900/20 rounded-lg p-4 border border-amber-700/30">
                    {/* Resource header */}
                    <div 
                      className="flex items-center cursor-pointer"
                      onClick={() => onSelectResource && onSelectResource(resource)}
                    >
                      <div className="w-12 h-12 bg-white rounded-full overflow-hidden flex items-center justify-center mr-3 border border-amber-200">
                        <img 
                          src={resource.icon} 
                          alt={resource.name}
                          className="w-10 h-10 object-contain"
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
                        <h4 className="text-lg font-medium text-amber-200">{resource.name}</h4>
                        <p className="text-sm text-amber-300/70">{resource.subCategory ? formatCategoryName(resource.subCategory) : ''}</p>
                      </div>
                    </div>
                    
                    {/* Production chain visualization */}
                    <div className="mt-4">
                      {/* Inputs */}
                      {resource.inputs && resource.inputs.length > 0 && (
                        <div className="mb-3">
                          <div className="text-sm text-amber-300 mb-2">Inputs:</div>
                          <div className="flex flex-wrap gap-2">
                            {resource.inputs.map(inputId => {
                              const inputResource = resourceMap[inputId];
                              if (!inputResource) return null;
                              
                              return (
                                <div 
                                  key={inputId}
                                  className="flex items-center bg-amber-900/30 rounded px-2 py-1 cursor-pointer hover:bg-amber-900/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectResource && onSelectResource(inputResource);
                                  }}
                                >
                                  <div className="w-6 h-6 bg-white rounded-full overflow-hidden flex items-center justify-center mr-1 border border-amber-200">
                                    <img 
                                      src={inputResource.icon} 
                                      alt={inputResource.name}
                                      className="w-4 h-4 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        if (!target.dataset.usedFallback) {
                                          target.dataset.usedFallback = 'true';
                                          target.src = "https://backend.serenissima.ai/public_assets/images/resources/icons/default.png";
                                        }
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-amber-100">{inputResource.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Process arrow */}
                      {(resource.inputs?.length > 0 || resource.outputs?.length > 0) && (
                        <div className="flex justify-center my-2">
                          <div className="bg-amber-700/50 rounded-full p-2">
                            <FaArrowRight className="text-amber-200" />
                          </div>
                        </div>
                      )}
                      
                      {/* Outputs */}
                      {resource.outputs && resource.outputs.length > 0 && (
                        <div className="mt-3">
                          <div className="text-sm text-amber-300 mb-2">Outputs:</div>
                          <div className="flex flex-wrap gap-2">
                            {resource.outputs.map(outputId => {
                              const outputResource = resourceMap[outputId];
                              if (!outputResource) return null;
                              
                              return (
                                <div 
                                  key={outputId}
                                  className="flex items-center bg-amber-900/30 rounded px-2 py-1 cursor-pointer hover:bg-amber-900/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectResource && onSelectResource(outputResource);
                                  }}
                                >
                                  <div className="w-6 h-6 bg-white rounded-full overflow-hidden flex items-center justify-center mr-1 border border-amber-200">
                                    <img 
                                      src={outputResource.icon} 
                                      alt={outputResource.name}
                                      className="w-4 h-4 object-contain"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        if (!target.dataset.usedFallback) {
                                          target.dataset.usedFallback = 'true';
                                          target.src = "https://backend.serenissima.ai/public_assets/images/resources/icons/default.png";
                                        }
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-amber-100">{outputResource.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResourceTreeView;
