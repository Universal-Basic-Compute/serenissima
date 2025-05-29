import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface BeginnersGuideArticleProps {
  onClose: () => void;
}

const BeginnersGuideArticle: React.FC<BeginnersGuideArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Beginner's Guide to Venice
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Close article"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className="prose prose-amber max-w-none">
          <p className="text-lg font-medium text-amber-800 mb-4">
            Welcome to La Serenissima, Noble Merchant!
          </p>
          
          <p className="mb-4">
            This guide will help you take your first steps in the Most Serene Republic of Venice. As a newcomer to these waters, you'll need to understand the basics of Venetian commerce and society to thrive in this competitive marketplace. Venice is a living city, populated by both human-controlled citizens and sophisticated AI-driven citizens, all participating equally in the economy.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Getting Started</h3>
            
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                  <span className="text-amber-100 font-bold">1</span>
                </div>
                <div>
                  <h4 className="text-lg font-serif text-amber-800 mb-1">Connect Your Wallet</h4>
                  <p className="text-amber-800">
                    Click the "Connect Wallet" button in the top-right corner to link your wallet. This establishes your identity in Venice and gives you access to your $COMPUTE tokens, the currency that powers all economic activity in the Republic.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                  <span className="text-amber-100 font-bold">2</span>
                </div>
                <div>
                  <h4 className="text-lg font-serif text-amber-800 mb-1">Create Your Noble Identity</h4>
                  <p className="text-amber-800">
                    After connecting your wallet, you'll be prompted to create your Venetian identity. Choose a distinguished name, craft a family coat of arms, and select a family motto. These elements will represent you throughout the Republic.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="bg-amber-700 rounded-full p-2 mr-4 mt-1 flex-shrink-0">
                  <span className="text-amber-100 font-bold">3</span>
                </div>
                <div>
                  <h4 className="text-lg font-serif text-amber-800 mb-1">Acquire Your First Land</h4>
                  <p className="text-amber-800">
                    Land is the foundation of wealth in Venice. Navigate the map to find available parcels (highlighted in a lighter color), then click to view details and purchase using your $COMPUTE tokens. Consider location carefully—properties near the Grand Canal or major squares command higher values. Remember, your citizen will also have basic needs like housing and food, which your economic activities will help satisfy.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Understanding the Interface</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Navigation</h4>
              <p className="mb-3 text-amber-800">
                The left sidebar contains icons for different views:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                <li><span className="font-bold">Land View</span>: Explore and purchase land parcels</li>
                <li><span className="font-bold">Buildings View</span>: Construct and manage buildings</li>
                <li><span className="font-bold">Transport View</span>: Develop roads and transportation networks</li>
                <li><span className="font-bold">Resources View</span>: Manage resources and production</li>
                <li><span className="font-bold">Contracts View</span>: Trade goods and services</li>
                <li><span className="font-bold">Governance View</span>: Participate in the Republic's governance</li>
                <li><span className="font-bold">Knowledge View</span>: Access guides and information</li>
              </ul>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Map Controls</h4>
              <p className="mb-3 text-amber-800">
                Navigate the 3D map of Venice using:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                <li><span className="font-bold">Left Mouse Button</span>: Select land parcels and buildings</li>
                <li><span className="font-bold">Right Mouse Button + Drag</span>: Rotate the camera</li>
                <li><span className="font-bold">Middle Mouse Button + Drag</span>: Pan the camera</li>
                <li><span className="font-bold">Mouse Wheel</span>: Zoom in and out</li>
                <li><span className="font-bold">Double Click</span>: Center on selected location</li>
              </ul>
              <p className="mt-3 text-amber-800">
                You can also adjust view quality in the Settings menu if you experience performance issues.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Your First Business Ventures</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Starting Small</h4>
            <p className="mb-3 text-amber-800">
              As a new merchant in Venice, it's wise to start with modest investments:
            </p>
            
            <div className="space-y-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">1. Build a Simple Workshop</h5>
                <p className="text-amber-800">
                  Once you own land, switch to Buildings View and select "Workshop" from the building options. Place it on your land and confirm construction. Workshops are versatile structures that can produce various goods depending on your focus.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">2. Choose a Production Focus</h5>
                <p className="text-amber-800">
                  After building your workshop, you'll need to decide what to produce. Early options include:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li><span className="font-bold">Textiles</span>: Relatively simple to produce with steady demand</li>
                  <li><span className="font-bold">Glassware</span>: Higher value but requires more specialized materials</li>
                  <li><span className="font-bold">Woodworking</span>: Essential for construction and shipbuilding</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">3. Secure Your Supply Chain</h5>
                <p className="text-amber-800">
                  Every production requires raw materials. Use the Contracts View to purchase what you need, or establish relationships with resource suppliers. Consistent supply is crucial for profitable production.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">4. Sell Your Goods</h5>
                <p className="text-amber-800">
                  Once production begins, you'll need to sell your goods. You can list them in the Contracts View or establish direct relationships with other players who need your products. Watch contract prices to maximize your profits.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Understanding Venice's Economy</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">A Closed Economic System</h4>
            <p className="mb-3 text-amber-800">
              La Serenissima operates as a closed economic system where all value circulates between players and AI-controlled entities. Unlike games with infinite resources, wealth must be captured rather than created from nothing.
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="300" viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg">
                {/* Background */}
                <rect x="0" y="0" width="500" height="300" fill="#fef3c7" stroke="#b45309" strokeWidth="2" rx="5" />
                
                {/* Title */}
                <text x="250" y="30" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Economic Cycle of Venice</text>
                
                {/* Center */}
                <circle cx="250" cy="150" r="40" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="250" y="145" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">$COMPUTE</text>
                <text x="250" y="165" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Currency</text>
                
                {/* Outer circle */}
                <circle cx="250" cy="150" r="120" fill="none" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,4" />
                
                {/* Nodes */}
                <circle cx="250" cy="30" r="30" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                <text x="250" y="35" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">LAND</text>
                
                <circle cx="370" cy="150" r="30" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                <text x="370" y="155" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">BUILDINGS</text>
                
                <circle cx="310" cy="250" r="30" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                <text x="310" y="255" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">BUSINESSES</text>
                
                <circle cx="190" cy="250" r="30" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                <text x="190" y="255" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">RESOURCES</text>
                
                <circle cx="130" cy="150" r="30" fill="#fef3c7" stroke="#b45309" strokeWidth="2" />
                <text x="130" y="145" fontFamily="serif" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#7c2d12">CITIZENS &</text>
                <text x="130" y="160" fontFamily="serif" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#7c2d12">PLAYERS</text>
                
                {/* Arrows */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
                
                <path d="M 250 60 L 250 110" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 340 150 L 290 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 310 220 L 310 180" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 190 220 L 190 180" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 160 150 L 210 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                <path d="M 275 60 Q 340 90 340 120" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 330 180 Q 300 220 280 220" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 220 220 Q 180 220 170 180" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 150 120 Q 180 90 225 60" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
              </svg>
            </div>
            
            <p className="text-amber-800">
              The economic cycle follows a specific pattern:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-amber-800 mt-2">
              <li>LAND is leased for the construction of BUILDINGS</li>
              <li>BUILDINGS house BUSINESSES that produce goods</li>
              <li>BUSINESSES transform raw materials into valuable RESOURCES</li>
              <li>RESOURCES provision both Players and AI Citizens</li>
              <li>Players & Citizens pay rent and taxes, completing the cycle back to LAND</li>
            </ul>
            <p className="mt-3 text-amber-800">
              Understanding this cycle is crucial for identifying profitable opportunities. Every economic decision you make affects and is affected by this interconnected system.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Essential Tips for New Merchants</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Location Matters</h4>
              <p className="text-amber-800">
                In Venice, perhaps more than anywhere else, the value of property is determined by its location. A small shop on the Grand Canal will generate far more income than a large warehouse in the outer districts. When purchasing land, prioritize central locations and water access over size.
              </p>
              <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800 text-sm">
                  <span className="font-bold">Tip:</span> Look for land parcels near bridges, major squares, or canal intersections. These locations naturally attract more foot traffic and commerce.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Diversify Your Holdings</h4>
              <p className="text-amber-800">
                The wisest Venetian merchants never rely on a single source of income. Spread your investments across different districts, building types, and economic activities. This protects you from localized economic downturns and allows you to capitalize on opportunities in multiple sectors.
              </p>
              <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800 text-sm">
                  <span className="font-bold">Tip:</span> Start with a workshop for production and a small retail space for sales. As you grow, add residential properties for steady rental income.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Form Strategic Partnerships</h4>
              <p className="text-amber-800">
                Venice's economy rewards cooperation. Form alliances with complementary businesses to create efficient supply chains. A glassmaker partnered with a sand supplier and a luxury merchant will outperform isolated competitors.
              </p>
              <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800 text-sm">
                  <span className="font-bold">Tip:</span> Use the chat function to connect with other merchants. Offer favorable terms to those who can supply what you need or purchase what you produce.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Monitor Contract Fluctuations</h4>
              <p className="text-amber-800">
                Prices in Serenissima fluctuate based on supply and demand. Keep track of price trends and adjust your production accordingly. Sometimes holding inventory until prices rise can be more profitable than immediate sales.
              </p>
              <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800 text-sm">
                  <span className="font-bold">Tip:</span> The Contracts View shows historical price data. Look for patterns in seasonal demand and plan your production cycle accordingly.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Next Steps</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">As You Grow</h4>
            <p className="mb-3 text-amber-800">
              Once you've established your initial business, consider these paths for expansion:
            </p>
            
            <div className="space-y-3">
              <div className="flex items-start">
                <div className="bg-amber-700 text-amber-100 rounded-full h-6 w-6 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                  <span className="text-sm">→</span>
                </div>
                <p className="text-amber-800">
                  <span className="font-bold">Vertical Integration:</span> Control more steps in your supply chain by acquiring businesses that produce your raw materials or sell your finished goods.
                </p>
              </div>
              
              <div className="flex items-start">
                <div className="bg-amber-700 text-amber-100 rounded-full h-6 w-6 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                  <span className="text-sm">→</span>
                </div>
                <p className="text-amber-800">
                  <span className="font-bold">Property Development:</span> Invest in additional land and construct buildings to lease to other players or AI citizens for steady rental income.
                </p>
              </div>
              
              <div className="flex items-start">
                <div className="bg-amber-700 text-amber-100 rounded-full h-6 w-6 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                  <span className="text-sm">→</span>
                </div>
                <p className="text-amber-800">
                  <span className="font-bold">Luxury Production:</span> Transition from basic goods to high-value luxury items that command premium prices in the contract.
                </p>
              </div>
              
              <div className="flex items-start">
                <div className="bg-amber-700 text-amber-100 rounded-full h-6 w-6 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                  <span className="text-sm">→</span>
                </div>
                <p className="text-amber-800">
                  <span className="font-bold">Banking & Finance:</span> As your wealth grows, offer loans to other merchants for interest or invest in promising ventures for a share of profits.
                </p>
              </div>
              
              <div className="flex items-start">
                <div className="bg-amber-700 text-amber-100 rounded-full h-6 w-6 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                  <span className="text-sm">→</span>
                </div>
                <p className="text-amber-800">
                  <span className="font-bold">Political Influence:</span> Gain positions in guilds or government bodies to shape policies that benefit your business interests.
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Final Words of Wisdom</h3>
            <p className="mb-4 text-amber-800">
              Venice wasn't built in a day, and neither will your commercial empire be. Patience, strategic thinking, and adaptability are the hallmarks of successful Venetian merchants. Start small, learn the systems, build relationships, and gradually expand your influence.
            </p>
            <p className="mb-4 text-amber-800">
              Remember that in La Serenissima's closed economic system, cooperation often yields greater returns than pure competition. The merchants who thrive are those who find their niche within the complex web of Venetian commerce.
            </p>
            <p className="text-amber-800">
              May fortune favor your endeavors, and may your family name be remembered among the greatest in Venetian history.
            </p>
          </div>
        </div>
        
        <div className="mt-8 text-center">
          <button 
            onClick={onClose}
            className="px-6 py-3 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            Return to Knowledge Repository
          </button>
        </div>
      </div>
    </div>
  );
};

export default BeginnersGuideArticle;
