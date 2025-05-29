import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface BuildingOwnersGuideArticleProps {
  onClose: () => void;
}

const BuildingOwnersGuideArticle: React.FC<BuildingOwnersGuideArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            The Master Builder's Guide to Venetian Property
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
            Maximizing Value from Your Architectural Investments
          </p>
          
          <p className="mb-4">
            In La Serenissima, buildings are not merely structures—they are the physical manifestation of economic power, social status, and strategic vision. As a property developer in Renaissance Venice, your buildings will form the backbone of your commercial empire and determine your place in Venetian society. You'll be competing and interacting not just with other human players, but also with AI citizens who own, manage, and lease properties, making for a dynamic real estate market.
          </p>
          
          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-3">The Building-Centered Economy</h3>
            <p className="mb-3">
              Buildings occupy a central position in Venice's economic cycle:
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="300" viewBox="0 0 500 300" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="500" height="300" fill="#fef3c7" />
                
                {/* Central building */}
                <rect x="200" y="100" width="100" height="100" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="250" y="150" fill="#7c2d12" fontFamily="serif" fontSize="16" textAnchor="middle" fontWeight="bold">BUILDINGS</text>
                
                {/* Connecting elements */}
                <path d="M 250 100 L 250 50" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 300 150 L 350 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 250 200 L 250 250" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 200 150 L 150 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                {/* Connected elements */}
                <rect x="225" y="25" width="50" height="25" fill="#fcd34d" stroke="#b45309" strokeWidth="1" />
                <text x="250" y="40" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">LAND</text>
                
                <rect x="350" y="137.5" width="75" height="25" fill="#fcd34d" stroke="#b45309" strokeWidth="1" />
                <text x="387.5" y="152.5" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">BUSINESSES</text>
                
                <rect x="225" y="250" width="50" height="25" fill="#fcd34d" stroke="#b45309" strokeWidth="1" />
                <text x="250" y="265" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">CITIZENS</text>
                
                <rect x="75" y="137.5" width="75" height="25" fill="#fcd34d" stroke="#b45309" strokeWidth="1" />
                <text x="112.5" y="152.5" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">RESOURCES</text>
                
                {/* Relationship labels */}
                <text x="250" y="85" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">Built on</text>
                <text x="325" y="140" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">House</text>
                <text x="250" y="225" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">Shelter</text>
                <text x="175" y="140" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">Consume</text>
                
                {/* Flow arrows */}
                <path d="M 387.5 137.5 Q 350 75 250 50" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" fill="none" />
                <text x="325" y="75" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle" transform="rotate(-25, 325, 75)">Rent</text>
                
                <path d="M 250 275 Q 150 275 112.5 162.5" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" fill="none" />
                <text x="175" y="275" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">Labor</text>
                
                <path d="M 75 137.5 Q 50 75 225 40" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" fill="none" />
                <text x="100" y="75" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle" transform="rotate(25, 100, 75)">Taxes</text>
                
                <path d="M 425 150 Q 450 225 275 250" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" fill="none" />
                <text x="400" y="225" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle" transform="rotate(-25, 400, 225)">Wages</text>
                
                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
              </svg>
            </div>
            
            <p className="mt-3">
              Buildings are the nexus where all economic activity converges. They:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide space for businesses to operate and generate wealth</li>
              <li>House citizens who provide labor and consume resources</li>
              <li>Create value from land through development</li>
              <li>Generate ongoing income through rents and fees</li>
              <li>Serve as physical manifestations of wealth and status</li>
            </ul>
            <p className="mt-3 text-amber-800">
              As a building owner, you occupy the crucial middle position in Venice's economic hierarchy:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">You pay land leases</span> to landowners for the right to build on their parcels</li>
              <li><span className="font-medium">You collect rent</span> from businesses and residents who occupy your buildings</li>
              <li><span className="font-medium">Your profit</span> is the difference between the rents you collect and the leases you pay</li>
            </ul>
            <p className="mt-3 italic">
              "The wise merchant builds not just for profit, but for posterity." — Venetian proverb
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Building Types & Their Economic Roles</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Residential Buildings</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Basic Housing</h5>
                <p>
                  Simple dwellings for workers and lower-class citizens. While they generate modest rents, their true value lies in housing the workforce needed by nearby businesses. Strategic placement near workshops and contracts ensures full occupancy.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Merchant Homes</h5>
                <p>
                  Mid-tier housing for successful merchants and craftsmen. These buildings command higher rents and attract tenants who have disposable income to spend at local businesses, creating economic ripple effects in the neighborhood.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Nobili Palaces</h5>
                <p>
                  Luxurious residences for nobility and wealthy merchants. While expensive to construct, they significantly increase surrounding property values and serve as status symbols. Strategic ownership of palaces can open doors to political influence.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Commercial Buildings</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Contract Stalls</h5>
                <p>
                  Small retail spaces that can be quickly constructed and leased to merchants. Their flexibility allows you to respond rapidly to changing contract conditions, though they generate modest income individually.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Shops & Boutiques</h5>
                <p>
                  Specialized retail spaces for craftsmen and merchants. These generate steady income and benefit from being clustered with complementary businesses. A jewelry shop placed near a textile merchant creates a luxury shopping district.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Trading Houses</h5>
                <p>
                  Large commercial buildings where major transactions occur. These prestigious structures command premium rents from wealthy merchants and trading companies, particularly when located near major canals or the Rialto.
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Production Facilities</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Basic Workshops</h5>
                <p>
                  Small production spaces for individual craftsmen. These versatile buildings can be adapted to various industries and provide steady income. Their value increases when placed near relevant resource suppliers.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Specialized Manufactories</h5>
                <p>
                  Purpose-built facilities for specific industries like glassmaking, shipbuilding, or textile production. While less flexible, they generate significantly higher income when properly supplied and staffed.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Industrial Complexes</h5>
                <p>
                  Large-scale production facilities that combine multiple stages of manufacturing. These represent major investments but create powerful economic engines that can dominate entire industries when properly managed.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Waterfront Structures</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Docks & Piers</h5>
                <p>
                  Essential infrastructure for water transportation. Beyond the fees they generate, docks significantly increase the value of adjacent buildings by providing transportation access. Control of docks can create powerful economic bottlenecks.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Warehouses</h5>
                <p>
                  Storage facilities for goods and materials. Strategically placed warehouses near docks or contracts command premium rents and provide flexibility to store goods until prices are favorable, enhancing your trading operations.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Shipyards</h5>
                <p>
                  Specialized facilities for ship construction and repair. These high-investment properties generate substantial returns and strategic advantages, particularly when Venice's maritime trade is booming.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Civic & Special Buildings</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Churches & Monasteries</h5>
                <p className="text-sm mb-3">
                  Religious buildings that generate modest direct income but substantially increase nearby property values and provide significant social capital. Funding church construction demonstrates civic virtue and opens doors to political influence.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Guild Halls</h5>
                <p className="text-sm">
                  Administrative centers for craft and merchant guilds. Owning or controlling a guild hall provides regulatory influence over an industry and access to specialized knowledge and resources.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Public Amenities</h5>
                <p className="text-sm mb-3">
                  Wells, fountains, and small piazzas that generate minimal direct income but significantly enhance surrounding property values and attract citizens to an area, benefiting nearby commercial buildings.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Cultural Institutions</h5>
                <p className="text-sm">
                  Theaters, music halls, and academies that generate moderate income while substantially increasing your social standing. These buildings attract wealthy patrons and can transform a district into a cultural center.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Strategic Building Placement</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Location Factors</h4>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="300" viewBox="0 0 500 300" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="500" height="300" fill="#fef3c7" />
                
                {/* Water */}
                <rect x="200" y="0" width="100" height="300" fill="#93c5fd" stroke="#2563eb" strokeWidth="1" />
                <text x="250" y="20" fill="#2563eb" fontFamily="serif" fontSize="14" textAnchor="middle">Grand Canal</text>
                
                {/* Land masses */}
                <rect x="0" y="0" width="200" height="300" fill="#fef3c7" stroke="#d97706" strokeWidth="1" />
                <rect x="300" y="0" width="200" height="300" fill="#fef3c7" stroke="#d97706" strokeWidth="1" />
                
                {/* Bridge */}
                <rect x="200" y="150" width="100" height="20" fill="#d97706" stroke="#92400e" strokeWidth="1" />
                <text x="250" y="145" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Rialto Bridge</text>
                
                {/* Contract */}
                <rect x="310" y="140" width="80" height="40" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
                <text x="350" y="165" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Contract</text>
                
                {/* Church */}
                <rect x="110" y="70" width="40" height="40" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
                <text x="130" y="95" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Church</text>
                
                {/* Dock */}
                <rect x="180" y="200" width="20" height="40" fill="#fbbf24" stroke="#b45309" strokeWidth="1" />
                <text x="190" y="230" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle" transform="rotate(-90, 190, 230)">Dock</text>
                
                {/* Buildings with value indicators */}
                <rect x="310" y="70" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="325" y="85" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€€€</text>
                
                <rect x="350" y="70" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="365" y="85" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€€</text>
                
                <rect x="390" y="70" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="405" y="85" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€</text>
                
                <rect x="310" y="200" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="325" y="215" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€€</text>
                
                <rect x="350" y="200" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="365" y="215" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€</text>
                
                <rect x="80" y="140" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="95" y="155" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€€€</text>
                
                <rect x="120" y="140" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="135" y="155" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€€</text>
                
                <rect x="80" y="200" width="30" height="30" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                <text x="95" y="215" fill="#7c2d12" fontFamily="serif" fontSize="10" textAnchor="middle">€</text>
                
                {/* Legend */}
                <rect x="20" y="20" width="150" height="40" fill="rgba(255,255,255,0.7)" stroke="#7c2d12" strokeWidth="1" />
                <text x="30" y="35" fill="#7c2d12" fontFamily="serif" fontSize="10">€€€ = High Value Location</text>
                <text x="30" y="50" fill="#7c2d12" fontFamily="serif" fontSize="10">€ = Lower Value Location</text>
              </svg>
            </div>
            
            <p className="mb-3">
              The value of a building is determined primarily by its location. Consider these critical factors:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Water Access</h5>
                <p className="text-sm mb-3">
                  Properties along the Grand Canal command premium values, while those on smaller canals are still more valuable than inland locations. Direct water access reduces transportation costs and increases visibility.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Proximity to Landmarks</h5>
                <p className="text-sm">
                  Buildings near the Rialto Bridge, Piazza San Marco, or major churches benefit from increased foot traffic and influence. The value gradient decreases with distance from these landmarks.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Transportation Nodes</h5>
                <p className="text-sm mb-3">
                  Properties near bridges, major intersections, and docks benefit from increased accessibility. These locations are ideal for commercial buildings that rely on customer traffic.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">District Character</h5>
                <p className="text-sm">
                  Each district of Venice has its own economic character. Residential buildings in Cannaregio, commercial properties in San Polo, and industrial facilities in Castello each command different values based on their appropriateness to the district.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Building Management</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Maintenance & Upkeep</h4>
            
            <p className="mb-3">
              Proper maintenance is essential for preserving and increasing building value. Daily maintenance costs are automatically deducted from the owner's Ducats and paid to the Consiglio dei Dieci, simulating the upkeep required for Venetian structures.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Regular Maintenance</h5>
                <p className="text-sm mb-3">
                  All buildings require ongoing maintenance (paid daily) to prevent deterioration. Neglected buildings (if costs cannot be met) suffer reduced rents, increased vacancy, and eventually structural problems that are costly to repair.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Renovation Cycles</h5>
                <p className="text-sm">
                  Plan for periodic renovations to update buildings and maintain their competitive position. Residential buildings typically need significant updates every 10-15 years, while commercial spaces may require more frequent refreshing.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Flood Mitigation</h5>
                <p className="text-sm mb-3">
                  Venice's unique environment requires special attention to water damage. Investing in proper foundations and water-resistant materials for lower floors reduces long-term maintenance costs.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Aesthetic Improvements</h5>
                <p className="text-sm">
                  Commissioning artwork, ornate facades, and decorative elements increases a building's influence and the rents it can command. These investments typically appreciate over time, unlike basic maintenance expenses.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Maintenance Strategy:</span> Allocate approximately 15-20% of annual rental income for maintenance to preserve building value. Neglecting maintenance to maximize short-term profits inevitably leads to larger expenses and income disruption later.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Tenant Selection & Management</h4>
            
            <p className="mb-3">
              The value of a building is significantly affected by its occupants:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Complementary Businesses</h5>
                <p className="text-sm">
                  Select commercial tenants that enhance each other's business. A bakery, butcher, and vegetable seller create a food destination that attracts more customers than any would individually, allowing you to charge premium rents to all three.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Tenant Quality</h5>
                <p className="text-sm">
                  Higher-quality tenants—whether prestigious businesses or wealthy residents—increase a building's reputation and the value of surrounding properties. Sometimes accepting slightly lower rent from a prestigious tenant is worthwhile for the positive externalities.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Lease Structures</h5>
                <p className="text-sm">
                  Different lease structures serve different purposes:
                  <br />• <span className="font-medium">Fixed Rent:</span> Provides stable income but may underperform in booming contracts
                  <br />• <span className="font-medium">Percentage Rent:</span> Links your income to tenant success, ideal for retail
                  <br />• <span className="font-medium">Escalating Rent:</span> Builds in predictable increases over time
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Vacancy Management</h5>
                <p className="text-sm">
                  Vacancies are costly not just in lost rent but in reduced activity and appeal for other tenants. Maintain a network of potential tenants and be prepared to offer short-term incentives to minimize vacancy periods, especially in high-profile locations.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Citizen Housing Mobility</h4>
            
            <p className="mb-3">
              Understanding how citizens make housing decisions is crucial for maintaining stable rental income:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Social Class Mobility Patterns</h5>
                <p className="text-sm">
                  Different social classes have different propensities to change housing:
                  <br />• <span className="font-medium">Nobili</span>: 10% daily chance to look for housing 12% cheaper.
                  <br />• <span className="font-medium">Cittadini</span>: 20% daily chance to look for housing 8% cheaper.
                  <br />• <span className="font-medium">Popolani</span>: 30% daily chance to look for housing 6% cheaper.
                  <br />• <span className="font-medium">Facchini</span>: 40% daily chance to look for housing 4% cheaper.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Rent Sensitivity Thresholds</h5>
                <p className="text-sm">
                  Citizens will only move if they find housing cheaper by a certain percentage of their current rent:
                  <br />• <span className="font-medium">Nobili</span>: Require housing at least 12% cheaper.
                  <br />• <span className="font-medium">Cittadini</span>: Require housing at least 8% cheaper.
                  <br />• <span className="font-medium">Popolani</span>: Require housing at least 6% cheaper.
                  <br />• <span className="font-medium">Facchini</span>: Require housing at least 4% cheaper.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Ducats-Based Prioritization</h5>
                <p className="text-sm">
                  When multiple citizens are seeking housing, those with lower wealth are prioritized in finding affordable options. This creates a natural sorting mechanism where the poorest citizens find the cheapest appropriate housing first, while wealthier citizens have more options but face more competition for premium properties.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Strategic Pricing Implications</h5>
                <p className="text-sm">
                  This mobility system has important implications for your rental strategy:
                  <br />• Setting rents too high increases vacancy risk as tenants find cheaper alternatives
                  <br />• Modest discounts below contract rate can attract and retain tenants from higher-priced properties
                  <br />• Premium properties must justify their cost through location, amenities, or influence
                  <br />• Different pricing strategies work for different social classes and building types
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Strategic Insight:</span> The most profitable strategy is often to price slightly below competitors targeting the same social class. This keeps your properties fully occupied while properties with higher rents experience more vacancies and tenant turnover.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Maximizing Building Income</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Revenue Optimization</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Rent Setting Strategy</h5>
                <p className="text-sm mb-3">
                  Setting optimal rents requires balancing multiple factors:
                  <br />• Contract rates for comparable properties
                  <br />• Tenant quality and stability
                  <br />• Vacancy risk at different price points
                  <br />• Potential for tenant improvements
                </p>
                
                <div className="bg-amber-50 p-2 rounded border border-amber-200 mb-3">
                  <p className="italic text-amber-800 text-xs">
                    <span className="font-bold">Strategic Insight:</span> Slightly below-contract rents for long-term, quality tenants often produce better returns than maximizing rent and facing frequent turnover.
                  </p>
                </div>
                
                <h5 className="font-bold text-amber-900 mb-1">Seasonal Adjustments</h5>
                <p className="text-sm">
                  Venice's economy has strong seasonal patterns. Consider:
                  <br />• Higher retail rents during Carnival season
                  <br />• Adjusted warehouse rates during major trading periods
                  <br />• Flexible terms for businesses with seasonal cash flows
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Additional Revenue Streams</h5>
                <p className="text-sm mb-3">
                  Beyond basic rent, consider:
                  <br />• Access fees for shared facilities
                  <br />• Storage space rental in underutilized areas
                  <br />• Signage and advertising rights on prominent facades
                  <br />• Event hosting in appropriate spaces
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Vertical Integration</h5>
                <p className="text-sm mb-3">
                  Sometimes the most profitable approach is to operate businesses within your own buildings rather than leasing to others. This captures both the property income and business profits.
                </p>
                
                <div className="bg-amber-50 p-2 rounded border border-amber-200">
                  <p className="italic text-amber-800 text-xs">
                    <span className="font-bold">Example:</span> A waterfront warehouse that you operate yourself allows you to buy goods when prices are low and sell when advantageous, potentially generating far more profit than the rental income alone.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Building Improvements & Expansions</h4>
            
            <p className="mb-3">
              Strategic improvements can significantly increase a building's income potential:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Vertical Expansion</h5>
                <p className="text-sm">
                  Adding floors to existing buildings is a valuable strategy in Venice, where horizontal expansion is limited by canals and neighboring structures. Upper floors can be developed for residential use even above commercial ground floors.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Facade Improvements</h5>
                <p className="text-sm">
                  Investing in ornate facades, especially on buildings facing major canals or squares, significantly increases influence and rental potential. Commissioning work from renowned artists creates buildings that become landmarks in their own right.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Interior Reconfiguration</h5>
                <p className="text-sm">
                  Adapting interiors to changing contract demands can revitalize aging buildings. Converting large residential spaces into multiple smaller units or transforming warehouses into workshops can significantly increase income.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Specialized Facilities</h5>
                <p className="text-sm">
                  Adding specialized features like private docks, secure vaults, or unique amenities can attract premium tenants willing to pay significantly above-contract rents for these rare features.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">ROI Analysis:</span> Before undertaking major improvements, calculate the expected return on investment. As a general rule, improvements should increase annual income by at least 15-20% of the improvement cost to be worthwhile. Remember that land leases are subject to the Vigesima Variabilis tax (20-50% based on land development), which will affect your net income.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">How Buildings Come to Life: The Construction Process</h3>
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <p className="mb-4 text-amber-800 italic">
              Unlike classic city-building games where structures appear instantly after paying a cost, construction in La Serenissima is a more involved and realistic endeavor. It's not just about having the Ducats; it's about engaging with the city's economy. You'll need to consider the availability of construction workshops, the logistics of material delivery, and the time it takes for skilled artisans to complete the work. This system adds depth, requiring you to plan ahead and interact with other economic actors.
            </p>
            <h4 className="text-xl font-serif text-amber-800 mb-2">Starting Your Construction Project</h4>
            <p className="mb-3">
              When you (or an AI-managed citizen) decide to build a new building, here's what happens behind the scenes:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-amber-800">
              <li>
                <span className="font-medium">Choosing the Location:</span> You select a plot of land and a specific construction point. The initial cost to place the building's "blueprint" is paid to the Consiglio dei Dieci (Venice's ruling council).
              </li>
              <li>
                <span className="font-medium">The Construction Site Appears:</span> Your future building appears on the map, but it's not yet built. It has a certain number of "construction minutes remaining" that depend on its complexity (for example, an Artisan's House might require 4320 minutes).
              </li>
              <li>
                <span className="font-medium">A Construction Contract is Signed:</span> Automatically, a special contract called a "construction project" is created.
                <ul className="list-disc pl-5 mt-1 text-sm">
                  <li>The <span className="font-semibold">Buyer</span> is you (or the citizen who ordered the building).</li>
                  <li>The <span className="font-semibold">Seller</span> is a construction company (like a "Masons' Lodge" or a "Master Builder's Workshop").</li>
                  <li>This contract specifies which building is to be constructed and which workshop is in charge. It also lists all necessary materials (wood, stone, etc.) and their quantities.</li>
                  <li>Initially, the contract status is usually "pending materials."</li>
                </ul>
              </li>
            </ol>
            <p className="mt-3 italic">
              This system ensures that all constructions, whether initiated by you or by AI, follow the same rules and can be tracked.
            </p>
          </div>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Role of Construction Workshops</h4>
            <p className="mb-3">
              Buildings specialized in construction (like the "Masons' Lodge" or the "Master Builder's Workshop") are the ones that carry out these projects. Their workers will:
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-amber-800">
              <li>
                <span className="font-medium">Gather and Deliver Materials:</span>
                <ul className="list-disc pl-5 mt-1 text-sm">
                  <li>They check the contract to see what materials are needed at your construction site.</li>
                  <li>If materials are missing, the workshop's workers will first try to take them from their own workshop's stock.</li>
                  <li>These materials are then transported by a worker to your site. During transport, they still belong to the workshop operator.</li>
                  <li>Once arrived, the materials are deposited at your site and become your property. The contract is updated to show what has been delivered.</li>
                  <li>If the construction workshop itself lacks materials, its workers will go find them to restock the workshop.</li>
                </ul>
              </li>
              <li>
                <span className="font-medium">Construct the Building:</span>
                <ul className="list-disc pl-5 mt-1 text-sm">
                  <li>Once all required materials are at your site, the contract status changes to "materials delivered."</li>
                  <li>Workshop employees then travel to your site (if they aren't already there).</li>
                  <li>They then begin the construction work. Each work session reduces the "construction minutes remaining" for your building.</li>
                  <li>This process continues until this time reaches zero.</li>
                </ul>
              </li>
              <li>
                <span className="font-medium">Project Completion:</span>
                <ul className="list-disc pl-5 mt-1 text-sm">
                  <li>When the "construction minutes remaining" are zero, your building is considered "constructed," and the construction date is recorded.</li>
                  <li>The construction contract is marked as "completed."</li>
                  <li>Your building is now operational and ready to be used!</li>
                </ul>
              </li>
              <li>
                <span className="font-medium">Workshop Upkeep:</span> If there are no active construction contracts, workers at construction workshops focus on restocking their own inventory with basic materials (wood, stone, tools, etc.).
              </li>
            </ol>
            <p className="mt-3 italic">
              Owning a construction workshop can be a profitable business, as it plays a crucial role in the city's expansion. Efficiently managing your workers and material supply chains is key to success.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Building Synergies</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Complementary Building Portfolios</h4>
            
            <p className="mb-3">
              The true power of building ownership emerges when you create synergistic portfolios:
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="300" viewBox="0 0 500 300" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="500" height="300" fill="#fef3c7" />
                
                {/* Water */}
                <rect x="225" y="0" width="50" height="300" fill="#93c5fd" stroke="#2563eb" strokeWidth="1" />
                <text x="250" y="20" fill="#2563eb" fontFamily="serif" fontSize="14" textAnchor="middle">Canal</text>
                
                {/* Production chain buildings */}
                <rect x="50" y="50" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="100" y="80" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Raw Materials</text>
                
                <rect x="50" y="125" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="100" y="155" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Workshop</text>
                
                <rect x="50" y="200" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="100" y="230" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Warehouse</text>
                
                <rect x="175" y="125" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="200" y="155" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Dock</text>
                
                <rect x="350" y="50" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="400" y="80" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Luxury Shop</text>
                
                <rect x="350" y="125" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="400" y="155" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Trading House</text>
                
                <rect x="350" y="200" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="400" y="230" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Nobili Home</text>
                
                {/* Flow arrows */}
                <path d="M 100 100 L 100 125" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 100 175 L 100 200" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 150 230 L 175 155" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 225 150 L 275 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 275 150 L 350 75" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 275 150 L 350 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 400 175 L 400 200" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                {/* Value indicators */}
                <text x="125" y="110" fill="#7c2d12" fontFamily="serif" fontSize="10">Materials</text>
                <text x="125" y="185" fill="#7c2d12" fontFamily="serif" fontSize="10">Products</text>
                <text x="150" y="210" fill="#7c2d12" fontFamily="serif" fontSize="10">Storage</text>
                <text x="250" y="140" fill="#7c2d12" fontFamily="serif" fontSize="10">Transport</text>
                <text x="300" y="100" fill="#7c2d12" fontFamily="serif" fontSize="10">Retail</text>
                <text x="300" y="160" fill="#7c2d12" fontFamily="serif" fontSize="10">Trade</text>
                <text x="420" y="185" fill="#7c2d12" fontFamily="serif" fontSize="10">Ducats</text>
                
                {/* Synergy indicators */}
                <circle cx="100" y="75" r="10" fill="#059669" fillOpacity="0.3" stroke="#059669" strokeWidth="1" />
                <circle cx="100" y="150" r="10" fill="#059669" fillOpacity="0.3" stroke="#059669" strokeWidth="1" />
                <circle cx="100" y="225" r="10" fill="#059669" fillOpacity="0.3" stroke="#059669" strokeWidth="1" />
                
                <circle cx="200" y="150" r="10" fill="#d97706" fillOpacity="0.3" stroke="#d97706" strokeWidth="1" />
                
                <circle cx="400" y="75" r="10" fill="#7c3aed" fillOpacity="0.3" stroke="#7c3aed" strokeWidth="1" />
                <circle cx="400" y="150" r="10" fill="#7c3aed" fillOpacity="0.3" stroke="#7c3aed" strokeWidth="1" />
                <circle cx="400" y="225" r="10" fill="#7c3aed" fillOpacity="0.3" stroke="#7c3aed" strokeWidth="1" />
                
                {/* Legend */}
                <rect x="20" y="260" width="460" height="30" fill="rgba(255,255,255,0.7)" stroke="#7c2d12" strokeWidth="1" />
                <circle cx="40" y="275" r="10" fill="#059669" fillOpacity="0.3" stroke="#059669" strokeWidth="1" />
                <text x="60" y="278" fill="#7c2d12" fontFamily="serif" fontSize="10">Production Chain</text>
                
                <circle cx="180" y="275" r="10" fill="#d97706" fillOpacity="0.3" stroke="#d97706" strokeWidth="1" />
                <text x="200" y="278" fill="#7c2d12" fontFamily="serif" fontSize="10">Transportation Hub</text>
                
                <circle cx="320" y="275" r="10" fill="#7c3aed" fillOpacity="0.3" stroke="#7c3aed" strokeWidth="1" />
                <text x="340" y="278" fill="#7c2d12" fontFamily="serif" fontSize="10">Luxury Commerce</text>
                
                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
              </svg>
            </div>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Vertical Integration</h5>
                <p className="text-sm">
                  Owning buildings that house each step of a production chain—from raw material storage to workshops to retail outlets—creates powerful efficiencies. This approach maximizes profits by capturing value at each stage and eliminating middlemen.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Transportation Networks</h5>
                <p className="text-sm">
                  Strategic ownership of docks, warehouses, and adjacent commercial buildings creates transportation hubs that become essential infrastructure. Control of these networks allows you to extract value from goods moving through Venice, even those you don't produce.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Luxury Ecosystems</h5>
                <p className="text-sm">
                  Developing complementary luxury properties—high-end shops, trading houses, and nobili residences—creates wealthy enclaves that become self-reinforcing. The presence of wealthy residents attracts luxury businesses, which in turn attract more wealthy residents.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Advanced Building Strategies</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Strategic Control Points</h4>
            
            <p className="mb-3">
              Certain buildings provide disproportionate influence over Venice's economy:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Bridge-Adjacent Properties</h5>
                <p className="text-sm">
                  Buildings beside Venice's limited bridges control access between islands. These strategic chokepoints can be leveraged to direct foot traffic past your commercial properties or to extract premium rents from businesses that need the exposure.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Canal Intersections</h5>
                <p className="text-sm">
                  Properties at major canal junctions control water transportation flows. Docks and warehouses at these locations become essential infrastructure for moving goods throughout the city, allowing their owners to influence entire supply chains.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Guild Headquarters</h5>
                <p className="text-sm">
                  Owning buildings that house guild operations provides influence over industry regulations and standards. This can be leveraged to create advantages for your other business interests or to extract concessions from guild members.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Contract Buildings</h5>
                <p className="text-sm">
                  Control of contract buildings allows you to influence which merchants can sell their goods and under what terms. This creates opportunities to favor complementary businesses while creating obstacles for competitors.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Strategic Insight:</span> When evaluating potential building acquisitions, consider not just the direct income but the strategic control the building provides over economic flows. Sometimes a modestly profitable building in a key location is worth more than a highly profitable one in a less strategic position.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Buildings as Social & Political Capital</h4>
            
            <p className="mb-3">
              In Venice, buildings are more than economic assets—they are expressions of status and influence:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Architectural Patronage</h5>
                <p className="text-sm mb-3">
                  Commissioning impressive buildings from renowned architects demonstrates wealth and taste. These buildings become landmarks associated with your family name, enhancing your reputation and opening doors to elite social circles.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Civic Contributions</h5>
                <p className="text-sm">
                  Funding public buildings—wells, small bridges, church renovations—generates goodwill among citizens and political capital with the government. These investments often yield indirect returns through favorable treatment in other business matters.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Strategic Hospitality</h5>
                <p className="text-sm mb-3">
                  Grand palaces with reception halls allow you to host influential figures, creating social obligations that can be leveraged for business advantage. The ability to entertain lavishly is a powerful tool in Venetian politics.
                </p>
                
                <h5 className="font-bold text-amber-900 mb-1">Cultural Sponsorship</h5>
                <p className="text-sm">
                  Buildings that house cultural activities—theaters, music rooms, academies—associate your name with Venice's artistic heritage. This cultivated image helps distinguish noble merchants from mere traders, facilitating advancement in Venetian society.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Case Studies</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Rialto Contract Complex</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <p className="text-amber-800 mb-3">
                  The Rialto Contract represents the pinnacle of strategic building development in Venice. This complex demonstrates several key principles:
                </p>
                
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li><span className="font-medium">Location Maximization:</span> Situated at the foot of the Rialto Bridge, the contract captures maximum foot traffic</li>
                  <li><span className="font-medium">Functional Specialization:</span> Different sections for fish, meat, produce, and specialty goods</li>
                  <li><span className="font-medium">Vertical Integration:</span> Storage cellars below, contract stalls at ground level, offices above</li>
                  <li><span className="font-medium">Transportation Integration:</span> Direct dock access for fresh deliveries</li>
                </ul>
                
                <p className="mt-3 text-amber-800">
                  The true genius of the Rialto development was creating a self-reinforcing economic ecosystem. The contract attracted shoppers, who attracted merchants, who paid fees that funded improvements, which attracted more shoppers—creating a virtuous cycle of increasing value.
                </p>
              </div>
              
              <div className="md:w-1/2 bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-2">Application for Players</h5>
                
                <p className="text-sm mb-3">
                  While you may not immediately develop something as grand as the Rialto, you can apply its principles at smaller scales:
                </p>
                
                <ol className="list-decimal pl-5 space-y-1 text-sm text-amber-800">
                  <li>Start with a strategic location near existing foot traffic</li>
                  <li>Begin with a single building that serves a clear contract need</li>
                  <li>Reinvest profits to acquire adjacent properties</li>
                  <li>Develop complementary functions that enhance the original business</li>
                  <li>Create distinctive architectural elements that make your complex recognizable</li>
                  <li>As your complex grows, introduce specialized areas for different functions</li>
                </ol>
                
                <p className="mt-3 text-sm italic text-amber-800">
                  "The Rialto wasn't built in a day. It grew organically as merchants recognized the value of proximity and coordination. Your commercial complex should follow the same evolutionary path." — Venetian building master
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Arsenale: Industrial Complex</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <p className="text-amber-800 mb-3">
                  Venice's Arsenale was the world's largest industrial complex of its time, capable of producing fully equipped merchant or naval vessels using an early form of assembly-line production. Its design offers valuable lessons:
                </p>
                
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li><span className="font-medium">Integrated Production:</span> All shipbuilding functions contained within a secure compound</li>
                  <li><span className="font-medium">Workflow Optimization:</span> Buildings arranged to minimize material movement</li>
                  <li><span className="font-medium">Specialized Facilities:</span> Purpose-built structures for each production stage</li>
                  <li><span className="font-medium">Scalability:</span> Modular design allowed for expansion as demand increased</li>
                </ul>
                
                <p className="mt-3 text-amber-800">
                  The Arsenale's success came from treating multiple buildings as a single integrated system rather than as individual structures. This systems thinking created efficiencies impossible in scattered workshops.
                </p>
              </div>
              
              <div className="md:w-1/2 bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-2">Application for Players</h5>
                
                <p className="text-sm mb-3">
                  You can apply the Arsenale model to create efficient production complexes:
                </p>
                
                <ol className="list-decimal pl-5 space-y-1 text-sm text-amber-800">
                  <li>Select an industry with multiple production stages (glassmaking, textiles, etc.)</li>
                  <li>Acquire adjacent properties in a less central district where land is affordable</li>
                  <li>Design buildings specifically for each production stage</li>
                  <li>Arrange buildings to minimize transportation between stages</li>
                  <li>Include storage facilities for both raw materials and finished goods</li>
                  <li>Add worker housing nearby to ensure labor availability</li>
                </ol>
                
                <p className="mt-3 text-sm italic text-amber-800">
                  "The true innovation of the Arsenale wasn't any single building, but how they worked together as a unified system. This integration created value far beyond the sum of individual structures." — Naval architect
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: Building a Lasting Legacy</h3>
            <p className="mb-4 text-amber-800">
              In La Serenissima, buildings are more than mere assets—they are the physical manifestation of your vision for Venice. The structures you develop will outlast your character, becoming a legacy that shapes the city for generations.
            </p>
            <p className="mb-4 text-amber-800">
              The most successful building owners think beyond immediate profits to consider how their properties interact with the broader urban fabric. They create not just individual buildings but cohesive districts that enhance the city's functionality and beauty.
            </p>
            <p className="text-amber-800">
              As you develop your building portfolio, remember that in Venice, architecture is a form of self-expression. Your buildings tell a story about who you are and what you value. Make it a story worth telling.
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

export default BuildingOwnersGuideArticle;
