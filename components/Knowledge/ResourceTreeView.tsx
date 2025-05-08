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
  const [treeData, setTreeData] = useState<any>({ nodes: [], links: [] });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Build the tree data when resources change
  useEffect(() => {
    if (resources.length > 0) {
      const { nodes, links } = buildTreeData(resources);
      setTreeData({ nodes, links });
    }
  }, [resources]);
  
  // Get resource by ID
  const getResourceById = (id: string): ResourceNode | undefined => {
    return resources.find(r => r.id === id);
  };
  
  // Build tree data with nodes and links
  const buildTreeData = (resources: ResourceNode[]) => {
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeMap = new Map<string, number>();
    
    // First pass: create nodes and build node map
    resources.forEach((resource, index) => {
      nodeMap.set(resource.id, index);
      
      // Determine node level based on inputs
      let level = 0;
      if (!resource.inputs || resource.inputs.length === 0) {
        level = 0; // Raw materials at level 0
      } else {
        // Find the maximum level of inputs and add 1
        const inputLevels = (resource.inputs || [])
          .map(inputId => {
            const inputResource = resources.find(r => r.id === inputId);
            return inputResource ? calculateLevel(inputResource, resources, new Set()) : 0;
          });
        
        level = Math.max(0, ...inputLevels) + 1;
      }
      
      nodes.push({
        id: resource.id,
        name: resource.name,
        level: level,
        category: resource.category,
        subcategory: resource.subcategory,
        icon: resource.icon,
        inputs: resource.inputs || [],
        outputs: resource.outputs || []
      });
    });
    
    // Sort nodes by level
    nodes.sort((a, b) => a.level - b.level);
    
    // Second pass: create links
    nodes.forEach(node => {
      // Create links from inputs to this node
      (node.inputs || []).forEach(inputId => {
        if (nodeMap.has(inputId)) {
          links.push({
            source: nodeMap.get(inputId),
            target: nodeMap.get(node.id),
            sourceId: inputId,
            targetId: node.id
          });
        }
      });
      
      // Also create links from this node to its outputs for bidirectional visualization
      (node.outputs || []).forEach(outputId => {
        if (nodeMap.has(outputId)) {
          links.push({
            source: nodeMap.get(node.id),
            target: nodeMap.get(outputId),
            sourceId: node.id,
            targetId: outputId
          });
        }
      });
    });
    
    // Position nodes in a grid layout
    const LEVEL_WIDTH = 280;
    const NODE_HEIGHT = 100;
    const LEVEL_PADDING = 50;
    
    // Group nodes by level
    const nodesByLevel: { [level: number]: any[] } = {};
    nodes.forEach(node => {
      if (!nodesByLevel[node.level]) {
        nodesByLevel[node.level] = [];
      }
      nodesByLevel[node.level].push(node);
    });
    
    // Calculate x and y positions
    Object.entries(nodesByLevel).forEach(([level, levelNodes]) => {
      const numNodes = levelNodes.length;
      const levelNum = parseInt(level);
      
      levelNodes.forEach((node, index) => {
        node.x = levelNum * LEVEL_WIDTH + LEVEL_PADDING;
        node.y = index * NODE_HEIGHT + LEVEL_PADDING;
      });
    });
    
    return { nodes, links };
  };
  
  // Calculate the level of a resource based on its inputs
  const calculateLevel = (
    resource: ResourceNode, 
    allResources: ResourceNode[], 
    visited: Set<string>
  ): number => {
    // Prevent circular dependencies
    if (visited.has(resource.id)) return 0;
    visited.add(resource.id);
    
    if (!resource.inputs || resource.inputs.length === 0) {
      return 0;
    }
    
    // Get the maximum level of inputs and add 1
    const inputLevels = (resource.inputs || [])
      .map(inputId => {
        const inputResource = allResources.find(r => r.id === inputId);
        return inputResource ? calculateLevel(inputResource, allResources, new Set(visited)) : 0;
      });
    
    return Math.max(0, ...inputLevels) + 1;
  };
  
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

  // Calculate the content dimensions
  const contentWidth = Math.max(
    ...treeData.nodes.map((node: any) => node.x + 200),
    800
  );
  
  const contentHeight = Math.max(
    ...treeData.nodes.map((node: any) => node.y + 100),
    600
  );

  return (
    <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full" ref={containerRef}>
      <div className="text-center text-amber-300 mb-6">
        <h3 className="text-xl font-serif">Production Chains</h3>
        <p className="text-sm mt-1">Explore how resources are transformed through production chains</p>
      </div>
      
      <div className="overflow-auto max-h-[calc(100vh-200px)] tech-tree-scroll">
        <div style={{ width: `${contentWidth}px`, height: `${contentHeight}px`, position: 'relative' }}>
          {/* SVG for links */}
          <svg 
            width={contentWidth} 
            height={contentHeight} 
            ref={svgRef}
            className="absolute top-0 left-0 pointer-events-none"
          >
            {treeData.links.map((link: any, index: number) => {
              const sourceNode = treeData.nodes[link.source];
              const targetNode = treeData.nodes[link.target];
              
              if (!sourceNode || !targetNode) return null;
              
              // Calculate path points
              const startX = sourceNode.x + 180; // Right side of source node
              const startY = sourceNode.y + 40; // Middle of source node
              const endX = targetNode.x; // Left side of target node
              const endY = targetNode.y + 40; // Middle of target node
              
              // Create a curved path with better curvature
              const controlPointX1 = startX + 50; // First control point closer to source
              const controlPointX2 = endX - 50; // Second control point closer to target
              
              // Determine if this is an input or output link for styling
              const isOutputLink = link.sourceId === sourceNode.id && link.targetId === targetNode.id;
              
              return (
                <g key={`link-${index}`}>
                  <path
                    d={`M${startX},${startY} C${controlPointX1},${startY} ${controlPointX2},${endY} ${endX},${endY}`}
                    stroke={isOutputLink ? "#8B6513" : "#8B4513"} // Different color for output links
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray={isOutputLink ? "3,3" : "5,5"} // Different dash pattern for output links
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })}
            
            {/* Arrow marker definition */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="12"
                markerHeight="8"
                refX="10"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 12 4, 0 8" fill="#8B4513" />
              </marker>
            </defs>
          </svg>
          
          {/* Render nodes */}
          {treeData.nodes.map((node: any) => (
            <div
              key={node.id}
              className="absolute bg-amber-800/20 rounded-lg border border-amber-700/50 p-3 w-44 transition-all hover:shadow-lg hover:bg-amber-800/30"
              style={{ 
                left: `${node.x}px`, 
                top: `${node.y}px`,
                cursor: 'pointer'
              }}
              onClick={() => {
                const resource = getResourceById(node.id);
                if (resource) onSelectResource(resource);
              }}
            >
              <div className="flex items-center">
                <div className="w-10 h-10 bg-white rounded-full overflow-hidden flex items-center justify-center mr-2 border border-amber-200">
                  <img 
                    src={node.icon} 
                    alt={node.name}
                    className="w-8 h-8 object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.dataset.usedFallback) {
                        target.dataset.usedFallback = 'true';
                        target.src = "/assets/resources/icons/default.png";
                      }
                    }}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-amber-100 font-medium text-sm leading-tight">{node.name}</div>
                  <div className="text-amber-300/70 text-xs">
                    {node.category.split('_').map((word: string) => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between mt-2 text-xs">
                <div className="text-amber-200/70">
                  <span className="font-medium">In:</span> {node.inputs.length}
                </div>
                <div className="text-amber-200/70">
                  <span className="font-medium">Out:</span> {node.outputs.length}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ResourceTreeView;
