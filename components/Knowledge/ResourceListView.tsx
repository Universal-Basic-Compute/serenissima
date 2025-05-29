import React, { useState, useEffect } from 'react';
import { FaProjectDiagram, FaChevronRight, FaChevronDown, FaLeaf, FaIndustry, FaGem } from 'react-icons/fa';
import { ResourceNode } from '@/lib/utils/resourceUtils';

interface ResourceListViewProps {
  resources?: ResourceNode[];
  onSelectResource?: (resource: ResourceNode) => void;
  loading?: boolean;
}

const ResourceListView: React.FC<ResourceListViewProps> = ({ 
  resources = [], 
  onSelectResource,
  loading = false
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['raw_materials']));
  const [ResourceList, setResourceList] = useState<any>({});
  
  // Build the resource tree when resources change
  useEffect(() => {
    if (resources.length > 0) {
      const tree = buildResourceList(resources);
      setResourceList(tree);
    }
  }, [resources]);
  
  // Build a hierarchical list from flat resource data
  const buildResourceList = (resources: ResourceNode[]) => {
    const tree: Record<string, any> = {};
    
    // Group resources by category
    resources.forEach(resource => {
      const category = resource.category || 'uncategorized';
      const subCategory = resource.subCategory || 'general';
      
      if (!tree[category]) {
        tree[category] = {
          name: formatCategoryName(category),
          subcategories: {}
        };
      }
      
      if (!tree[category].subcategories[subCategory]) {
        tree[category].subcategories[subCategory] = {
          name: formatCategoryName(subCategory),
          resources: []
        };
      }
      
      tree[category].subcategories[subCategory].resources.push(resource);
    });
    
    return tree;
  };
  
  // Format category names for display
  const formatCategoryName = (name: string): string => {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
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
  
  if (loading) {
    return (
      <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full flex items-center justify-center">
        <div className="text-amber-300 animate-pulse">Building resource tree...</div>
      </div>
    );
  }
  
  if (resources.length === 0) {
    return (
      <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30">
        <div className="text-center text-amber-300 mb-6">
          <h3 className="text-xl font-serif">Resource Production Chains</h3>
          <p className="text-sm mt-1">No resources found to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full">
      <div className="text-center text-amber-300 mb-6">
        <h3 className="text-xl font-serif">Resource Production Chains</h3>
        <p className="text-sm mt-1">Visualizing the relationships between resources in the Venetian economy</p>
      </div>
      
      <div className="overflow-auto max-h-[calc(100vh-200px)] tech-tree-scroll">
        {Object.keys(ResourceList).sort().map(category => (
          <div key={category} className="mb-2">
            <div 
              className="flex items-center p-2 bg-amber-900/30 rounded-lg cursor-pointer hover:bg-amber-900/40 transition-colors"
              onClick={() => toggleCategory(category)}
            >
              <span className="mr-2 text-amber-300">
                {expandedCategories.has(category) ? <FaChevronDown /> : <FaChevronRight />}
              </span>
              <span className="mr-2">{getCategoryIcon(category)}</span>
              <span className="text-amber-200 font-medium">{ResourceList[category].name}</span>
              <span className="ml-2 text-amber-400/70 text-sm">
                ({Object.keys(ResourceList[category].subcategories).reduce(
                  (count, subcat) => count + ResourceList[category].subcategories[subcat].resources.length, 
                  0
                )} resources)
              </span>
            </div>
            
            {expandedCategories.has(category) && (
              <div className="ml-6 mt-2">
                {Object.keys(ResourceList[category].subcategories).sort().map(subCategory => (
                  <div key={`${category}-${subCategory}`} className="mb-2">
                    <div className="text-amber-300 font-medium p-1 border-b border-amber-700/30">
                      {ResourceList[category].subcategories[subCategory].name}
                    </div>
                    
                    <div className="ml-4 mt-1">
                      {ResourceList[category].subcategories[subCategory].resources.sort((a: ResourceNode, b: ResourceNode) => 
                        a.name.localeCompare(b.name)
                      ).map((resource: ResourceNode) => (
                        <div 
                          key={resource.id}
                          className="flex items-center p-1 hover:bg-amber-900/20 rounded cursor-pointer transition-colors"
                          onClick={() => onSelectResource && onSelectResource(resource)}
                        >
                          <div className="w-6 h-6 bg-white rounded-full overflow-hidden flex items-center justify-center mr-2 border border-amber-200">
                            <img 
                              src={resource.icon} 
                              alt={resource.name}
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
                          <span className="text-amber-100">{resource.name}</span>
                        </div>
                      ))}
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

export default ResourceListView;
