import React, { useState, useEffect, useRef } from 'react';
import { ResourceNode } from '../../lib/resourceUtils';
import { FaChevronDown, FaChevronRight, FaArrowRight } from 'react-icons/fa';

interface ResourceTreeViewProps {
  resources: ResourceNode[];
  onSelectResource: (resource: ResourceNode) => void;
  loading?: boolean;
}

const ResourceTreeView: React.FC<ResourceTreeViewProps> = ({
  resources = [],
  onSelectResource,
  loading = false
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [rootResources, setRootResources] = useState<ResourceNode[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Find resources that are at the beginning of production chains (no inputs)
  useEffect(() => {
    if (resources.length > 0) {
      // Find resources that have no inputs or have empty inputs array
      const roots = resources.filter(resource => 
        !resource.inputs || resource.inputs.length === 0
      );
      
      // Sort alphabetically
      roots.sort((a, b) => a.name.localeCompare(b.name));
      
      setRootResources(roots);
    }
  }, [resources]);
  
  // Toggle node expansion
  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };
  
  // Get resource by ID
  const getResourceById = (id: string): ResourceNode | undefined => {
    return resources.find(r => r.id === id);
  };
  
  // Get output resources for a given resource
  const getOutputs = (resource: ResourceNode): ResourceNode[] => {
    if (!resource.outputs || resource.outputs.length === 0) return [];
    
    return resource.outputs
      .map(id => getResourceById(id))
      .filter(Boolean) as ResourceNode[];
  };
  
  // Render a resource node and its children recursively
  const renderResourceNode = (resource: ResourceNode, level: number = 0, path: string[] = []): JSX.Element => {
    const nodeId = resource.id;
    const isExpanded = expandedNodes.has(nodeId);
    const outputs = getOutputs(resource);
    const hasOutputs = outputs.length > 0;
    const indent = level * 24; // Indentation for each level
    
    // Check for circular references to prevent infinite recursion
    const isCircular = path.includes(nodeId);
    
    // Create a new path for children
    const newPath = [...path, nodeId];
    
    return (
      <div key={nodeId} style={{ marginLeft: `${indent}px` }}>
        <div className="flex items-center py-1 hover:bg-amber-900/20 rounded transition-colors">
          {hasOutputs ? (
            <button
              onClick={() => toggleNode(nodeId)}
              className="w-6 h-6 flex items-center justify-center text-amber-400"
            >
              {isExpanded ? <FaChevronDown size={14} /> : <FaChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-6 h-6"></span>
          )}
          
          <div 
            className="flex items-center flex-1 cursor-pointer"
            onClick={() => onSelectResource(resource)}
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
                    target.src = "/assets/resources/icons/default.png";
                  }
                }}
              />
            </div>
            <span className="text-amber-100">{resource.name}</span>
          </div>
        </div>
        
        {isExpanded && hasOutputs && !isCircular && (
          <div className="ml-6 border-l border-amber-700/30">
            {outputs.map(output => renderResourceNode(output, level + 1, newPath))}
          </div>
        )}
        
        {isExpanded && isCircular && (
          <div className="ml-6 py-1 text-amber-500 italic text-sm">
            Circular reference detected
          </div>
        )}
      </div>
    );
  };
  
  if (loading) {
    return (
      <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full flex items-center justify-center">
        <div className="text-amber-300 animate-pulse">Loading resource tree...</div>
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
        <h3 className="text-xl font-serif">Production Chains</h3>
        <p className="text-sm mt-1">Explore how resources are transformed through production chains</p>
      </div>
      
      <div className="overflow-auto max-h-[calc(100vh-200px)] tech-tree-scroll">
        {rootResources.length > 0 ? (
          <div>
            <div className="text-amber-400 mb-2 font-medium">Raw Materials</div>
            {rootResources.map(resource => renderResourceNode(resource))}
          </div>
        ) : (
          <div className="text-amber-400 text-center italic">
            No starting resources found
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceTreeView;
