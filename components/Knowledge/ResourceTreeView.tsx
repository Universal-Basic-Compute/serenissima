import React, { useState, useEffect, useRef } from 'react';
import { ResourceNode } from '../../lib/resourceUtils';
import * as d3 from 'd3';

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
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [simulation, setSimulation] = useState<d3.Simulation<any, any> | null>(null);
  
  // Update dimensions when container size changes
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  
  // Create and update the force-directed graph
  useEffect(() => {
    if (!svgRef.current || resources.length === 0) return;
    
    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();
    
    // Prepare data for the graph
    const nodes = resources.map(resource => ({
      id: resource.id,
      name: resource.name,
      category: resource.category,
      icon: resource.icon,
      resource: resource,
      x: 0,
      y: 0
    }));
    
    // Create links between resources
    const links: { source: string; target: string; type: string }[] = [];
    
    resources.forEach(resource => {
      // Add links from inputs to this resource
      if (resource.inputs) {
        resource.inputs.forEach(inputId => {
          // Check if the input resource exists in our dataset before creating a link
          if (resources.some(r => r.id === inputId)) {
            links.push({
              source: inputId,
              target: resource.id,
              type: 'input'
            });
          } else {
            console.warn(`Input resource not found: ${inputId} for resource ${resource.id}`);
          }
        });
      }
      
      // Add links from this resource to its outputs
      if (resource.outputs) {
        resource.outputs.forEach(outputId => {
          // Check if the output resource exists in our dataset before creating a link
          if (resources.some(r => r.id === outputId)) {
            links.push({
              source: resource.id,
              target: outputId,
              type: 'output'
            });
          } else {
            console.warn(`Output resource not found: ${outputId} for resource ${resource.id}`);
          }
        });
      }
    });
    
    // Create SVG element
    const svg = d3.select(svgRef.current);
    
    // Create a group for the graph
    const g = svg.append("g");
    
    // Add zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    
    svg.call(zoom as any);
    
    // Reset zoom to center the graph
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(dimensions.width / 2, dimensions.height / 2).scale(0.8));
    
    // Define node type for simulation
    interface SimulationNode {
      id: string;
      name: string;
      category: string;
      icon: string;
      resource: ResourceNode;
      x: number;
      y: number;
      fx?: number | null;
      fy?: number | null;
    }

    // Create the simulation with proper typing
    const sim = d3.forceSimulation<SimulationNode>(nodes as SimulationNode[])
      .force("link", d3.forceLink<SimulationNode, {source: string; target: string; type: string}>(links)
        .id(d => d.id)
        .distance(100)
        .strength((link: any) => {
          // Return 0 strength for links with missing nodes
          const sourceExists = nodes.some((node: SimulationNode) => 
            node.id === (typeof link.source === 'string' ? link.source : link.source.id));
          const targetExists = nodes.some((node: SimulationNode) => 
            node.id === (typeof link.target === 'string' ? link.target : link.target.id));
          return sourceExists && targetExists ? 1 : 0;
        }))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide(40));
    
    // Create links
    const link = g.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2)
      .attr("stroke", d => d.type === 'input' ? "#8B4513" : "#8B6513")
      .attr("stroke-dasharray", d => d.type === 'input' ? "5,5" : "3,3")
      .attr("marker-end", "url(#arrowhead)");
    
    // Define arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 20)
      .attr("refY", 5)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 10 5 L 0 10 z")
      .attr("fill", "#8B4513");
    
    // Create node groups
    const node = g.append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any)
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectResource(d.resource);
      });
    
    // Add circular background for nodes
    node.append("circle")
      .attr("r", 30)
      .attr("fill", d => getCategoryColor(d.category))
      .attr("stroke", "#8B4513")
      .attr("stroke-width", 2);
    
    // Add white circle for icon background
    node.append("circle")
      .attr("r", 24)
      .attr("fill", "white")
      .attr("stroke", "#8B4513")
      .attr("stroke-width", 1);
    
    // Add resource icons
    node.append("image")
      .attr("xlink:href", d => d.icon)
      .attr("x", -16)
      .attr("y", -16)
      .attr("width", 32)
      .attr("height", 32)
      .attr("clip-path", "circle(16px at 0 0)")
      .on("error", function() {
        d3.select(this).attr("xlink:href", "/assets/resources/icons/default.png");
      });
    
    // Add resource names
    node.append("text")
      .attr("dy", 45)
      .attr("text-anchor", "middle")
      .attr("fill", "#FFF")
      .attr("stroke", "#000")
      .attr("stroke-width", 0.5)
      .attr("font-size", "10px")
      .text(d => d.name);
    
    // Update positions on simulation tick
    sim.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);
      
      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Drag functions with proper typing
    function dragstarted(event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d: SimulationNode) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d: SimulationNode) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>, d: SimulationNode) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    
    // Store simulation for cleanup
    setSimulation(sim);
    
    // Cleanup function
    return () => {
      if (simulation) simulation.stop();
    };
  }, [resources, dimensions, onSelectResource]);
  
  // Get color based on category
  const getCategoryColor = (category: string): string => {
    switch(category) {
      case 'raw_materials':
        return 'rgba(52, 211, 153, 0.8)'; // Green
      case 'processed_materials':
        return 'rgba(59, 130, 246, 0.8)'; // Blue
      case 'finished_goods':
        return 'rgba(139, 92, 246, 0.8)'; // Purple
      case 'luxury_goods':
        return 'rgba(236, 72, 153, 0.8)'; // Pink
      case 'imported_goods':
        return 'rgba(239, 68, 68, 0.8)'; // Red
      default:
        return 'rgba(249, 115, 22, 0.8)'; // Amber
    }
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
    <div className="bg-amber-50/10 rounded-lg p-6 border border-amber-700/30 h-full" ref={containerRef}>
      <div className="text-center text-amber-300 mb-6">
        <h3 className="text-xl font-serif">Production Chains</h3>
        <p className="text-sm mt-1">Explore how resources are transformed through production chains</p>
        <p className="text-xs mt-1 text-amber-400/70">Drag nodes to rearrange • Scroll to zoom • Click a resource to view details</p>
      </div>
      
      <div className="w-full h-[calc(100vh-250px)]">
        <svg 
          ref={svgRef}
          width={dimensions.width} 
          height={dimensions.height}
          className="w-full h-full bg-amber-950/30 rounded-lg"
        />
      </div>
    </div>
  );
};

export default ResourceTreeView;
