import React, { useState, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import Image from 'next/image';

interface TechNode {
  id: string;
  title: string;
  description: string;
  image: string;
  link?: string;
  dependencies?: string[];
  position?: { x: number; y: number };
}

interface TechTreeProps {
  onClose: () => void;
}

const TechTree: React.FC<TechTreeProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);
  // Tech tree data
  const techNodes: TechNode[] = [
    {
      id: 'terrain',
      title: 'Terrain',
      description: 'The foundational geography of La Serenissima, including land and water.',
      image: '/images/tech-tree/terrain.jpg',
      link: '/docs/terrain.pdf',
    },
    {
      id: 'lands',
      title: 'Lands',
      description: 'Parcels of land that can be owned, developed, and traded.',
      image: '/images/tech-tree/lands.jpg',
      link: '/docs/lands.pdf',
      dependencies: ['terrain'],
    },
    {
      id: 'loans',
      title: 'Loans',
      description: 'Financial instruments for borrowing and lending ducats.',
      image: '/images/tech-tree/loans.jpg',
      link: '/docs/loans.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'docks',
      title: 'Docks',
      description: 'Water access points for transportation and trade.',
      image: '/images/tech-tree/docks.jpg',
      link: '/docs/docks.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'bridges',
      title: 'Bridges',
      description: 'Structures connecting land parcels across water.',
      image: '/images/tech-tree/bridges.jpg',
      link: '/docs/bridges.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'roads',
      title: 'Roads',
      description: 'Transportation infrastructure connecting properties.',
      image: '/images/tech-tree/roads.jpg',
      link: '/docs/roads.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'market',
      title: 'Market',
      description: 'System for buying and selling land and resources.',
      image: '/images/tech-tree/market.jpg',
      link: '/docs/market.pdf',
      dependencies: ['lands', 'loans'],
    },
    {
      id: 'buildings',
      title: 'Buildings',
      description: 'Structures that can be built on land parcels.',
      image: '/images/tech-tree/buildings.jpg',
      link: '/docs/buildings.pdf',
      dependencies: ['lands', 'roads'],
    },
    {
      id: 'transport',
      title: 'Transport',
      description: 'Systems for moving people and goods around the city.',
      image: '/images/tech-tree/transport.jpg',
      link: '/docs/transport.pdf',
      dependencies: ['roads', 'docks', 'bridges'],
    },
    {
      id: 'rent',
      title: 'Rent',
      description: 'Income generated from owned properties.',
      image: '/images/tech-tree/rent.jpg',
      link: '/docs/rent.pdf',
      dependencies: ['buildings'],
    },
    {
      id: 'businesses',
      title: 'Businesses',
      description: 'Commercial enterprises that generate income.',
      image: '/images/tech-tree/businesses.jpg',
      link: '/docs/businesses.pdf',
      dependencies: ['buildings', 'market'],
    },
    {
      id: 'pay',
      title: 'Pay',
      description: 'System for compensating workers and service providers.',
      image: '/images/tech-tree/pay.jpg',
      link: '/docs/pay.pdf',
      dependencies: ['businesses'],
    },
    {
      id: 'resources',
      title: 'Resources',
      description: 'Raw materials used in construction and production.',
      image: '/images/tech-tree/resources.jpg',
      link: '/docs/resources.pdf',
      dependencies: ['transport'],
    },
    {
      id: 'economy',
      title: 'Economy',
      description: 'The overall economic system of La Serenissima.',
      image: '/images/tech-tree/economy.jpg',
      link: '/docs/economy.pdf',
      dependencies: ['market', 'businesses', 'rent'],
    },
    {
      id: 'consumption',
      title: 'Consumption',
      description: 'Use of goods and services by the population.',
      image: '/images/tech-tree/consumption.jpg',
      link: '/docs/consumption.pdf',
      dependencies: ['resources', 'businesses'],
    },
    {
      id: 'actions',
      title: 'Actions',
      description: 'Player activities and interactions within the world.',
      image: '/images/tech-tree/actions.jpg',
      link: '/docs/actions.pdf',
      dependencies: ['economy', 'consumption'],
    },
    {
      id: 'governance',
      title: 'Governance',
      description: 'Political systems and decision-making processes.',
      image: '/images/tech-tree/governance.jpg',
      link: '/docs/governance.pdf',
      dependencies: ['economy', 'actions'],
    },
  ];

  // Calculate node positions based on dependencies
  const calculatePositions = () => {
    // Create a map of nodes by id for easy lookup
    const nodesMap = new Map<string, TechNode>();
    techNodes.forEach(node => nodesMap.set(node.id, node));
    
    // Calculate levels (columns) based on dependencies
    const levels: { [key: string]: number } = {};
    
    // Helper function to calculate level for a node
    const calculateLevel = (nodeId: string, visited = new Set<string>()): number => {
      // Prevent circular dependencies
      if (visited.has(nodeId)) return 0;
      visited.add(nodeId);
      
      const node = nodesMap.get(nodeId);
      if (!node) return 0;
      
      if (!node.dependencies || node.dependencies.length === 0) {
        return 0;
      }
      
      // Get the maximum level of dependencies and add 1
      const maxDependencyLevel = Math.max(
        ...node.dependencies.map(depId => calculateLevel(depId, new Set(visited)))
      );
      
      return maxDependencyLevel + 1;
    };
    
    // Calculate level for each node
    techNodes.forEach(node => {
      levels[node.id] = calculateLevel(node.id);
    });
    
    // Group nodes by level
    const nodesByLevel: { [level: number]: string[] } = {};
    Object.entries(levels).forEach(([nodeId, level]) => {
      if (!nodesByLevel[level]) nodesByLevel[level] = [];
      nodesByLevel[level].push(nodeId);
    });
    
    // Calculate x position based on level
    const levelWidth = 280; // Increased width between levels
    const levelPadding = 100; // Initial padding
    
    // Calculate y position based on nodes in the same level
    Object.entries(nodesByLevel).forEach(([level, nodeIds]) => {
      const numNodes = nodeIds.length;
      const levelHeight = 200; // Increased height per node
      const totalHeight = numNodes * levelHeight;
      const startY = Math.max(100, (dimensions.height - totalHeight) / 2);
      
      nodeIds.forEach((nodeId, index) => {
        const node = nodesMap.get(nodeId);
        if (node) {
          node.position = {
            x: parseInt(level) * levelWidth + levelPadding,
            y: startY + index * levelHeight
          };
        }
      });
    });
    
    return Array.from(nodesMap.values());
  };

  const positionedNodes = calculatePositions();
  
  // Calculate the content dimensions to ensure proper scrolling
  const contentWidth = Math.max(
    ...positionedNodes.map(node => (node.position?.x || 0) + 280),
    dimensions.width
  ) + 100;
  
  const contentHeight = Math.max(
    ...positionedNodes.map(node => (node.position?.y || 0) + 220),
    dimensions.height
  ) + 100;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col tech-tree-container"
      ref={containerRef}
    >
      <div className="flex justify-between items-center p-4 border-b border-amber-700">
        <h2 className="text-3xl font-serif text-amber-500 px-4">
          La Serenissima Development Roadmap
        </h2>
        <button 
          onClick={onClose}
          className="text-white hover:text-amber-200 transition-colors p-2 rounded-full hover:bg-amber-900/30"
          aria-label="Close"
        >
          <FaTimes size={24} />
        </button>
      </div>
      
      <div 
        className="flex-grow overflow-auto tech-tree-scroll"
        style={{ 
          position: 'relative',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(139, 69, 19, 0.5) rgba(0, 0, 0, 0.1)'
        }}
      >
        <div 
          style={{ 
            width: `${contentWidth}px`, 
            height: `${contentHeight}px`, 
            position: 'relative' 
          }}
        >
          {/* Draw connection lines between nodes */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {positionedNodes.map(node => 
              (node.dependencies || []).map(depId => {
                const depNode = positionedNodes.find(n => n.id === depId);
                if (depNode && node.position && depNode.position) {
                  return (
                    <line 
                      key={`${node.id}-${depId}`}
                      x1={depNode.position.x + 140} // Center of the source node
                      y1={depNode.position.y + 100} // Center of the source node
                      x2={node.position.x} // Left edge of the target node
                      y2={node.position.y + 100} // Center of the target node
                      stroke="#8B4513" // Brown color for the lines
                      strokeWidth={3}
                      strokeDasharray="5,5" // Dashed line
                    />
                  );
                }
                return null;
              })
            )}
          </svg>
          
          {/* Render nodes */}
          {positionedNodes.map(node => (
            <div 
              key={node.id}
              className="absolute bg-amber-50 border-2 border-amber-700 rounded-lg shadow-lg w-72 tech-node hover:shadow-xl transition-all duration-300"
              style={{ 
                left: `${node.position?.x}px`, 
                top: `${node.position?.y}px`,
                transform: 'translate3d(0,0,0)', // Force GPU acceleration
              }}
            >
              <div className="h-44 overflow-hidden rounded-t-md relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-amber-900/30" />
                <img 
                  src={node.image} 
                  alt={node.title}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = `https://via.placeholder.com/280x176/8B4513/FFF?text=${node.title}`;
                  }}
                />
              </div>
              <div className="p-4">
                <h3 className="text-xl font-serif text-amber-800 mb-2 border-b border-amber-200 pb-2">{node.title}</h3>
                <p className="text-gray-600 text-sm mb-3 h-16 overflow-hidden">{node.description}</p>
                {node.link && (
                  <a 
                    href={node.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors text-sm"
                  >
                    Learn More
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TechTree;
