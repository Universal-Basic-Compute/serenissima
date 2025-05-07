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
  // Tech tree data with expanded descriptions
  const techNodes: TechNode[] = [
    {
      id: 'terrain',
      title: 'Terrain',
      description: 'The foundational geography of La Serenissima, including land and water features. The terrain system defines the physical world, with elevation changes, water bodies, and natural features that influence construction and navigation throughout the city-state.',
      image: '/images/tech-tree/terrain.jpg',
      link: '/docs/terrain.pdf',
    },
    {
      id: 'lands',
      title: 'Lands',
      description: 'Parcels of land that can be owned, developed, and traded. The land system enables property ownership with detailed boundaries, legal titles, and transfer mechanisms. Land parcels vary in size, location value, and development potential based on proximity to canals and city centers.',
      image: '/images/tech-tree/lands.jpg',
      link: '/docs/lands.pdf',
      dependencies: ['terrain'],
    },
    {
      id: 'loans',
      title: 'Loans',
      description: 'Financial instruments for borrowing and lending ducats. The loan system implements Renaissance banking practices with interest calculations, collateral requirements, and repayment schedules. Loans can be used for land purchases, building construction, or trade ventures with varying terms and conditions.',
      image: '/images/tech-tree/loans.jpg',
      link: '/docs/loans.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'docks',
      title: 'Docks',
      description: 'Water access points for transportation and trade. The dock system enables water-based commerce with loading/unloading facilities, ship moorings, and connection points to the road network. Docks must be strategically placed along water edges and provide economic benefits to adjacent land parcels.',
      image: '/images/tech-tree/docks.jpg',
      link: '/docs/docks.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'bridges',
      title: 'Bridges',
      description: 'Structures connecting land parcels across water. The bridge system facilitates pedestrian and goods movement between islands with varying designs and capacities. Bridges require engineering expertise, significant resources to construct, and ongoing maintenance to remain operational.',
      image: '/images/tech-tree/bridges.jpg',
      link: '/docs/bridges.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'roads',
      title: 'Roads',
      description: 'Transportation infrastructure connecting properties. The road network enables land-based movement with variable widths, surfaces, and traffic capacities. Roads can be constructed with different materials affecting durability and maintenance costs, while providing essential connectivity between buildings.',
      image: '/images/tech-tree/roads.jpg',
      link: '/docs/roads.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'market',
      title: 'Market',
      description: 'System for buying and selling land and resources. The marketplace facilitates economic exchange with auctions, fixed-price listings, and negotiated trades. Market activities influence property values, resource prices, and overall economic conditions through supply and demand mechanics.',
      image: '/images/tech-tree/market.jpg',
      link: '/docs/market.pdf',
      dependencies: ['lands', 'loans'],
    },
    {
      id: 'buildings',
      title: 'Buildings',
      description: 'Structures that can be built on land parcels. The building system enables construction of various architectural styles with different functions, capacities, and resource requirements. Buildings provide housing, production facilities, and civic services while contributing to land value.',
      image: '/images/tech-tree/buildings.jpg',
      link: '/docs/buildings.pdf',
      dependencies: ['lands', 'roads'],
    },
    {
      id: 'transport',
      title: 'Transport',
      description: 'Systems for moving people and goods around the city. The transportation network combines water and land routes with various vessel types and cargo capacities. Transport efficiency affects trade profitability, resource distribution, and population mobility throughout La Serenissima.',
      image: '/images/tech-tree/transport.jpg',
      link: '/docs/transport.pdf',
      dependencies: ['roads', 'docks', 'bridges'],
    },
    {
      id: 'rent',
      title: 'Rent',
      description: 'Income generated from owned properties. The rent system calculates returns based on property size, location, building quality, and economic conditions. Rent collection occurs at regular intervals and provides passive income to property owners while creating ongoing expenses for tenants.',
      image: '/images/tech-tree/rent.jpg',
      link: '/docs/rent.pdf',
      dependencies: ['buildings'],
    },
    {
      id: 'businesses',
      title: 'Businesses',
      description: 'Commercial enterprises that generate income. The business system enables various economic activities with different resource inputs, production processes, and market outputs. Businesses require appropriate buildings, skilled workers, and resource supply chains to operate profitably.',
      image: '/images/tech-tree/businesses.jpg',
      link: '/docs/businesses.pdf',
      dependencies: ['buildings', 'market'],
    },
    {
      id: 'pay',
      title: 'Pay',
      description: 'System for compensating workers and service providers. The payment system handles wage calculations, service fees, and transaction records with historical accuracy. Payment amounts vary based on skill levels, market conditions, and negotiated contracts between employers and workers.',
      image: '/images/tech-tree/pay.jpg',
      link: '/docs/pay.pdf',
      dependencies: ['businesses'],
    },
    {
      id: 'resources',
      title: 'Resources',
      description: 'Raw materials used in construction and production. The resource system models extraction, refinement, and consumption of materials with realistic scarcity and quality variations. Resources include building materials, craft inputs, luxury goods, and consumables with complex supply chains.',
      image: '/images/tech-tree/resources.jpg',
      link: '/docs/resources.pdf',
      dependencies: ['transport'],
    },
    {
      id: 'economy',
      title: 'Economy',
      description: 'The overall economic system of La Serenissima. The economy integrates all commercial activities with inflation mechanics, business cycles, and external trade factors. Economic conditions fluctuate based on player actions, historical events, and simulated market forces affecting all other systems.',
      image: '/images/tech-tree/economy.jpg',
      link: '/docs/economy.pdf',
      dependencies: ['market', 'businesses', 'rent'],
    },
    {
      id: 'consumption',
      title: 'Consumption',
      description: 'Use of goods and services by the population. The consumption system models demand patterns across different social classes with varying preferences and purchasing power. Consumption drives production requirements, influences prices, and creates economic opportunities for businesses catering to public needs.',
      image: '/images/tech-tree/consumption.jpg',
      link: '/docs/consumption.pdf',
      dependencies: ['resources', 'businesses'],
    },
    {
      id: 'actions',
      title: 'Actions',
      description: 'Player activities and interactions within the world. The action system defines available player behaviors with associated costs, requirements, and consequences. Actions include construction projects, business operations, political maneuvers, and social interactions with both immediate and long-term effects.',
      image: '/images/tech-tree/actions.jpg',
      link: '/docs/actions.pdf',
      dependencies: ['economy', 'consumption'],
    },
    {
      id: 'governance',
      title: 'Governance',
      description: 'Political systems and decision-making processes. The governance system implements Venetian political structures with councils, voting mechanisms, and factional dynamics. Governance affects taxation, regulations, public works, and diplomatic relations with significant economic and social consequences.',
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
    const levelWidth = 320; // Increased width between levels for more space
    const levelPadding = 120; // Initial padding
    
    // Calculate y position based on nodes in the same level
    Object.entries(nodesByLevel).forEach(([level, nodeIds]) => {
      const numNodes = nodeIds.length;
      const levelHeight = 280; // Increased height between nodes for more space
      const totalHeight = numNodes * levelHeight;
      const startY = Math.max(120, (dimensions.height - totalHeight) / 2);
      
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
  ) + 120;
  
  const contentHeight = Math.max(
    ...positionedNodes.map(node => (node.position?.y || 0) + 280),
    dimensions.height
  ) + 120;

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
                      x1={depNode.position.x + 100} // Center of the source node
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
              className="absolute bg-amber-50 border-2 border-amber-700 rounded-lg shadow-lg w-56 tech-node hover:shadow-xl transition-all duration-300"
              style={{ 
                left: `${node.position?.x}px`, 
                top: `${node.position?.y}px`,
                transform: 'translate3d(0,0,0)', // Force GPU acceleration
              }}
            >
              <div className="h-32 w-32 overflow-hidden rounded-md relative mx-auto mt-4">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-amber-900/30" />
                <img 
                  src={node.image} 
                  alt={node.title}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = `https://via.placeholder.com/128x128/8B4513/FFF?text=${node.title}`;
                  }}
                />
              </div>
              <div className="p-4">
                <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-2 text-center">{node.title}</h3>
                <p className="text-gray-600 text-xs mb-3 h-28 overflow-auto pr-1 tech-tree-scroll">{node.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TechTree;
