import React, { useState, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

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
  const [selectedNode, setSelectedNode] = useState<TechNode | null>(null);
  
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
      description: 'The foundational geography of La Serenissima, including land and water features. The terrain system defines the physical world, with elevation changes, water bodies, and natural features that influence construction and navigation throughout the city-state. GAMEPLAY IMPACT: Determines where you can build and how you can navigate. PLAYER BENEFIT: Explore a beautifully rendered Venice with realistic waterways and islands that create strategic opportunities for property development.',
      image: '/images/tech-tree/terrain.jpg',
      link: '/docs/terrain.pdf',
    },
    {
      id: 'lands',
      title: 'Lands',
      description: 'Parcels of land that can be owned, developed, and traded. The land system enables property ownership with detailed boundaries, legal titles, and transfer mechanisms. Land parcels vary in size, location value, and development potential based on proximity to canals and city centers. GAMEPLAY IMPACT: Allows you to purchase, own, and develop specific areas of the map. PLAYER BENEFIT: Build your own Venetian empire by acquiring prime real estate in strategic locations that appreciate in value over time.',
      image: '/images/tech-tree/lands.jpg',
      link: '/docs/lands.pdf',
      dependencies: ['terrain'],
    },
    {
      id: 'loans',
      title: 'Loans',
      description: 'Financial instruments for borrowing and lending ducats. The loan system implements Renaissance banking practices with interest calculations, collateral requirements, and repayment schedules. Loans can be used for land purchases, building construction, or trade ventures with varying terms and conditions. GAMEPLAY IMPACT: Provides capital to fund land purchases and construction projects. PLAYER BENEFIT: Accelerate your growth by leveraging loans to acquire assets before you have the full capital, creating opportunities for both borrowers and lenders.',
      image: '/images/tech-tree/loans.jpg',
      link: '/docs/loans.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'docks',
      title: 'Docks',
      description: 'Water access points for transportation and trade. The dock system enables water-based commerce with loading/unloading facilities, ship moorings, and connection points to the road network. Docks must be strategically placed along water edges and provide economic benefits to adjacent land parcels. GAMEPLAY IMPACT: Creates connection points between water and land transportation networks. PLAYER BENEFIT: Establish lucrative trade routes and increase the value of waterfront properties by building docks that serve as commercial hubs.',
      image: '/images/tech-tree/docks.jpg',
      link: '/docs/docks.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'bridges',
      title: 'Bridges',
      description: 'Structures connecting land parcels across water. The bridge system facilitates pedestrian and goods movement between islands with varying designs and capacities. Bridges require engineering expertise, significant resources to construct, and ongoing maintenance to remain operational. GAMEPLAY IMPACT: Creates new pathways between previously disconnected areas. PLAYER BENEFIT: Transform the accessibility of your properties by building bridges that increase foot traffic and connect isolated areas to the main commercial districts.',
      image: '/images/tech-tree/bridges.jpg',
      link: '/docs/bridges.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'roads',
      title: 'Roads',
      description: 'Transportation infrastructure connecting properties. The road network enables land-based movement with variable widths, surfaces, and traffic capacities. Roads can be constructed with different materials affecting durability and maintenance costs, while providing essential connectivity between buildings. GAMEPLAY IMPACT: Establishes land-based transportation routes that affect property values. PLAYER BENEFIT: Design your own transportation network to maximize efficiency and increase the value of your properties through improved accessibility.',
      image: '/images/tech-tree/roads.jpg',
      link: '/docs/roads.pdf',
      dependencies: ['lands'],
    },
    {
      id: 'contract',
      title: 'Contract',
      description: 'System for buying and selling land and resources. The marketplace facilitates economic exchange with auctions, fixed-price listings, and negotiated trades. Contract activities influence property values, resource prices, and overall economic conditions through supply and demand mechanics. GAMEPLAY IMPACT: Creates a player-driven economy where assets can be traded. PLAYER BENEFIT: Speculate on property values, corner contracts on essential resources, or establish yourself as a trusted merchant with competitive pricing.',
      image: '/images/tech-tree/contract.jpg',
      link: '/docs/contract.pdf',
      dependencies: ['lands', 'loans'],
    },
    {
      id: 'buildings',
      title: 'Buildings',
      description: 'Structures that can be built on land parcels. The building system enables construction of various architectural styles with different functions, capacities, and resource requirements. Buildings provide housing, production facilities, and civic services while contributing to land value. GAMEPLAY IMPACT: Determines what activities can occur on your land and how much income it generates. PLAYER BENEFIT: Express your creativity by designing your own Venetian palazzo or commercial district while strategically choosing buildings that maximize your income.',
      image: '/images/tech-tree/buildings.jpg',
      link: '/docs/buildings.pdf',
      dependencies: ['lands', 'roads'],
    },
    {
      id: 'transport',
      title: 'Transport',
      description: 'Systems for moving people and goods around the city. The transportation network combines water and land routes with various vessel types and cargo capacities. Transport efficiency affects trade profitability, resource distribution, and population mobility throughout La Serenissima. GAMEPLAY IMPACT: Affects the efficiency of resource movement and accessibility of properties. PLAYER BENEFIT: Establish faster trade routes and passenger services that generate income while making your properties more valuable through improved connectivity.',
      image: '/images/tech-tree/transport.jpg',
      link: '/docs/transport.pdf',
      dependencies: ['roads', 'docks', 'bridges'],
    },
    {
      id: 'rent',
      title: 'Rent',
      description: 'Income generated from owned properties. The rent system calculates returns based on property size, location, building quality, and economic conditions. Rent collection occurs at regular intervals and provides passive income to property owners while creating ongoing expenses for tenants. GAMEPLAY IMPACT: Provides passive income from your property investments. PLAYER BENEFIT: Build a real estate empire that generates consistent passive income, allowing you to focus on expansion while your existing properties pay dividends.',
      image: '/images/tech-tree/rent.jpg',
      link: '/docs/rent.pdf',
      dependencies: ['buildings'],
    },
    {
      id: 'businesses',
      title: 'Businesses',
      description: 'Commercial enterprises that generate income. The business system enables various economic activities with different resource inputs, production processes, and contract outputs. Businesses require appropriate buildings, skilled workers, and resource supply chains to operate profitably. GAMEPLAY IMPACT: Creates active income sources that require management but yield higher returns. PLAYER BENEFIT: Diversify your income streams by establishing businesses that transform raw materials into valuable goods, creating economic chains that you control.',
      image: '/images/tech-tree/businesses.jpg',
      link: '/docs/businesses.pdf',
      dependencies: ['buildings', 'contract'],
    },
    {
      id: 'pay',
      title: 'Pay',
      description: 'System for compensating workers and service providers. The payment system handles wage calculations, service fees, and transaction records with historical accuracy. Payment amounts vary based on skill levels, contract conditions, and negotiated contracts between employers and workers. GAMEPLAY IMPACT: Determines the cost of labor and services for your operations. PLAYER BENEFIT: Hire skilled workers to increase your production efficiency and quality, balancing wage costs against productivity gains.',
      image: '/images/tech-tree/pay.jpg',
      link: '/docs/pay.pdf',
      dependencies: ['businesses'],
    },
    {
      id: 'resources',
      title: 'Resources',
      description: 'Raw materials used in construction and production. The resource system models extraction, refinement, and consumption of materials with realistic scarcity and quality variations. Resources include building materials, craft inputs, luxury goods, and consumables with complex supply chains. GAMEPLAY IMPACT: Creates supply chains that feed into construction and manufacturing. PLAYER BENEFIT: Secure key resource supplies to protect your operations from contract fluctuations or corner contracts to control pricing of essential materials.',
      image: '/images/tech-tree/resources.jpg',
      link: '/docs/resources.pdf',
      dependencies: ['transport'],
    },
    {
      id: 'economy',
      title: 'Economy',
      description: 'The overall economic system of La Serenissima. The economy integrates all commercial activities with inflation mechanics, business cycles, and external trade factors. Economic conditions fluctuate based on player actions, historical events, and simulated contract forces affecting all other systems. GAMEPLAY IMPACT: Creates dynamic contract conditions that affect all other systems. PLAYER BENEFIT: Master the economic cycles to buy low and sell high, or create monopolies that allow you to set prices in key sectors of the Venetian economy.',
      image: '/images/tech-tree/economy.jpg',
      link: '/docs/economy.pdf',
      dependencies: ['contract', 'businesses', 'rent'],
    },
    {
      id: 'consumption',
      title: 'Consumption',
      description: 'Use of goods and services by the population. The consumption system models demand patterns across different social classes with varying preferences and purchasing power. Consumption drives production requirements, influences prices, and creates economic opportunities for businesses catering to public needs. GAMEPLAY IMPACT: Drives demand for various goods and services in the economy. PLAYER BENEFIT: Analyze consumption patterns to identify untapped contracts and consumer needs, allowing you to establish businesses that cater to specific demographic segments.',
      image: '/images/tech-tree/consumption.jpg',
      link: '/docs/consumption.pdf',
      dependencies: ['resources', 'businesses'],
    },
    {
      id: 'actions',
      title: 'Actions',
      description: 'Player activities and interactions within the world. The action system defines available player behaviors with associated costs, requirements, and consequences. Actions include construction projects, business operations, political maneuvers, and social interactions with both immediate and long-term effects. GAMEPLAY IMPACT: Determines what players can do and how they interact with the world. PLAYER BENEFIT: Unlock new capabilities and strategic options as you progress, from simple property management to complex political maneuvers that shape the future of Venice.',
      image: '/images/tech-tree/actions.jpg',
      link: '/docs/actions.pdf',
      dependencies: ['economy', 'consumption'],
    },
    {
      id: 'governance',
      title: 'Governance',
      description: 'Political systems and decision-making processes. The governance system implements Venetian political structures with councils, voting mechanisms, and factional dynamics. Governance affects taxation, regulations, public works, and diplomatic relations with significant economic and social consequences. GAMEPLAY IMPACT: Allows players to influence city-wide policies and regulations. PLAYER BENEFIT: Rise through the political ranks of Venice to shape laws, taxation, and public works that benefit your interests while participating in the famous Venetian political intrigue.',
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

  // Handle node click
  const handleNodeClick = (node: TechNode) => {
    setSelectedNode(node);
  };

  // Close the detail panel
  const closeDetailPanel = () => {
    setSelectedNode(null);
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
              className="absolute bg-amber-50 border-2 border-amber-700 rounded-lg shadow-lg w-56 tech-node hover:shadow-xl transition-all duration-300 cursor-pointer"
              style={{ 
                left: `${node.position?.x}px`, 
                top: `${node.position?.y}px`,
                transform: 'translate3d(0,0,0)', // Force GPU acceleration
                // Add orange border for in-progress nodes
                borderColor: node.id === 'lands' || node.id === 'loans' ? '#f97316' : '',
              }}
              onClick={() => handleNodeClick(node)}
            >
              <div className="h-32 w-32 overflow-hidden rounded-md relative mx-auto mt-4">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-amber-900/30" />
                {/* Add "In Progress" badge for lands and loans */}
                {(node.id === 'lands' || node.id === 'loans') && (
                  <div className="absolute top-0 right-0 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-bl-md rounded-tr-md z-10">
                    In Progress
                  </div>
                )}
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
                <h3 
                  className={`text-lg font-serif mb-2 border-b pb-2 text-center ${
                    node.id === 'lands' || node.id === 'loans' ? 'text-orange-700 border-orange-200' : 'text-amber-800 border-amber-200'
                  }`}
                >
                  {node.title}
                </h3>
                <p className="text-gray-600 text-xs mb-3 text-center italic">Click to learn more</p>
              </div>
            </div>
          ))}
          
          {/* Detail Panel */}
          {selectedNode && (
            <div className="fixed inset-0 bg-black bg-opacity-80 z-10 flex items-center justify-center p-8" onClick={closeDetailPanel}>
              <div 
                className="bg-amber-50 rounded-lg shadow-2xl max-w-4xl max-h-[90vh] w-full overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
              >
                <div className="flex justify-between items-center p-6 border-b border-amber-200 bg-gradient-to-r from-amber-700 to-amber-600">
                  <h2 className="text-2xl font-serif text-white">{selectedNode.title}</h2>
                  <button 
                    onClick={closeDetailPanel}
                    className="text-white hover:text-amber-200 transition-colors"
                    aria-label="Close detail"
                  >
                    <FaTimes size={24} />
                  </button>
                </div>
                
                <div className="flex-grow overflow-auto p-6 tech-tree-scroll">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="md:w-1/3">
                      <div className="rounded-lg overflow-hidden border-2 border-amber-300 shadow-md">
                        <img 
                          src={selectedNode.image} 
                          alt={selectedNode.title}
                          className="w-full h-auto object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://via.placeholder.com/400x400/8B4513/FFF?text=${selectedNode.title}`;
                          }}
                        />
                      </div>
                      
                      {selectedNode.dependencies && selectedNode.dependencies.length > 0 && (
                        <div className="mt-6 bg-amber-100 rounded-lg p-4 border border-amber-200">
                          <h3 className="text-lg font-serif text-amber-800 mb-2">Dependencies</h3>
                          <ul className="list-disc list-inside text-amber-900">
                            {selectedNode.dependencies.map(depId => {
                              const depNode = techNodes.find(n => n.id === depId);
                              return depNode ? (
                                <li key={depId} className="mb-1">
                                  <button 
                                    className="text-amber-700 hover:text-amber-900 hover:underline font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const node = techNodes.find(n => n.id === depId);
                                      if (node) handleNodeClick(node);
                                    }}
                                  >
                                    {depNode.title}
                                  </button>
                                </li>
                              ) : null;
                            })}
                          </ul>
                        </div>
                      )}
                      
                      {/* Find nodes that depend on this node */}
                      {(() => {
                        const dependents = techNodes.filter(n => 
                          n.dependencies && n.dependencies.includes(selectedNode.id)
                        );
                        
                        return dependents.length > 0 ? (
                          <div className="mt-4 bg-amber-100 rounded-lg p-4 border border-amber-200">
                            <h3 className="text-lg font-serif text-amber-800 mb-2">Enables</h3>
                            <ul className="list-disc list-inside text-amber-900">
                              {dependents.map(dep => (
                                <li key={dep.id} className="mb-1">
                                  <button 
                                    className="text-amber-700 hover:text-amber-900 hover:underline font-medium"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNodeClick(dep);
                                    }}
                                  >
                                    {dep.title}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null;
                      })()}
                    </div>
                    
                    <div className="md:w-2/3">
                      <article className="prose prose-amber prose-lg max-w-none">
                        <h2 className="text-2xl font-serif text-amber-800 mb-4 hidden md:block">{selectedNode.title}</h2>
                        
                        {/* Format the description to separate the gameplay impact and player benefit */}
                        {(() => {
                          const parts = selectedNode.description.split('GAMEPLAY IMPACT:');
                          const overview = parts[0].trim();
                          
                          let gameplayImpact = '';
                          let playerBenefit = '';
                          
                          if (parts.length > 1) {
                            const impactParts = parts[1].split('PLAYER BENEFIT:');
                            gameplayImpact = impactParts[0].trim();
                            if (impactParts.length > 1) {
                              playerBenefit = impactParts[1].trim();
                            }
                          }
                          
                          return (
                            <>
                              <p className="text-lg font-medium text-amber-900 leading-relaxed">
                                {overview}
                              </p>
                              
                              {gameplayImpact && (
                                <div className="mt-4 bg-amber-100/50 p-4 rounded-lg border border-amber-200">
                                  <h3 className="text-lg font-serif text-amber-800 mb-2">Gameplay Impact</h3>
                                  <p className="text-base text-amber-900">{gameplayImpact}</p>
                                </div>
                              )}
                              
                              {playerBenefit && (
                                <div className="mt-4 bg-amber-100/50 p-4 rounded-lg border border-amber-200">
                                  <h3 className="text-lg font-serif text-amber-800 mb-2">Player Benefit</h3>
                                  <p className="text-base text-amber-900">{playerBenefit}</p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        
                        {selectedNode.link && (
                          <div className="mt-6">
                            <a 
                              href={selectedNode.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                            >
                              View Technical Documentation
                            </a>
                          </div>
                        )}
                      </article>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TechTree;
