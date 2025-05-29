import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface LandOwnerGuideArticleProps {
  onClose: () => void;
}

const LandOwnerGuideArticle: React.FC<LandOwnerGuideArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            The Nobili's Guide to Land Ownership
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
            Mastering the Art of Venetian Land Management
          </p>
          
          <p className="mb-4">
            In La Serenissima, land is the foundation of all wealth. Unlike other resources that flow through the economy, land is fixed and finite—especially in our island republic where every square meter is precious. As a landowner, you hold the keys to the most fundamental asset in Venice, competing with both human and AI citizens who actively bid on, purchase, and manage land. This guide will help you maximize the value and strategic advantage of your holdings.
          </p>
          
          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-3">Understanding the Venetian Land Economy</h3>
            <p className="mb-3">
              Land in Venice is not merely property—it is power. The closed economic system of La Serenissima means that wealth must be captured rather than created from nothing. As a landowner, you stand at the beginning of the economic cycle:
            </p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>You lease LAND to building owners for construction</li>
              <li>Building owners rent BUILDINGS to BUSINESSES and residents</li>
              <li>BUSINESSES transform raw materials into valuable RESOURCES</li>
              <li>RESOURCES provision both Players and AI Citizens</li>
              <li>Money flows back: Business owners pay rent to building owners, who pay land leases to you</li>
              <li>All parties pay taxes to the Republic, completing the economic cycle</li>
            </ol>
            
            <div className="my-6 flex justify-center">
              <svg width="400" height="300" viewBox="0 0 400 300" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="400" height="300" fill="#fef3c7" />
                
                {/* Central cycle diagram */}
                <ellipse cx="200" cy="150" rx="150" ry="120" fill="none" stroke="#d97706" strokeWidth="1" strokeDasharray="5,5" />
                
                {/* LAND node */}
                <rect x="170" y="30" width="60" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="200" y="55" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">LAND</text>
                
                {/* BUILDINGS node */}
                <rect x="300" y="110" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="340" y="135" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">BUILDINGS</text>
                
                {/* BUSINESSES node */}
                <rect x="260" y="210" width="90" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="305" y="235" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">BUSINESSES</text>
                
                {/* RESOURCES node */}
                <rect x="50" y="210" width="90" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="95" y="235" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">RESOURCES</text>
                
                {/* Players & Citizens node */}
                <rect x="20" y="110" width="120" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="80" y="135" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Players & Citizens</text>
                
                {/* Flow arrows */}
                {/* LAND to BUILDINGS */}
                <path d="M225,50 C270,60 300,80 320,110" stroke="#7c2d12" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                <text x="280" y="80" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(25, 280, 80)">leases</text>
                
                {/* BUILDINGS to BUSINESSES */}
                <path d="M340,150 C340,180 330,200 305,210" stroke="#7c2d12" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                <text x="345" y="180" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(90, 345, 180)">houses</text>
                
                {/* BUSINESSES to RESOURCES */}
                <path d="M260,230 C220,240 180,240 140,230" stroke="#7c2d12" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                <text x="200" y="250" fill="#7c2d12" fontFamily="serif" fontSize="12">transform</text>
                
                {/* RESOURCES to Players & Citizens */}
                <path d="M80,210 C70,180 70,150 80,150" stroke="#7c2d12" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                <text x="55" y="180" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(-90, 55, 180)">provision</text>
                
                {/* Players & Citizens to LAND */}
                <path d="M120,110 C150,80 170,60 175,50" stroke="#7c2d12" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                <text x="130" y="80" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(-25, 130, 80)">pay rent</text>
                
                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
              </svg>
              <div className="text-sm text-amber-800 italic text-center mt-2">
                The economic cycle of Venice: a closed system where value flows in a continuous loop
              </div>
            </div>
            <p className="mt-3 italic">
              "He who controls the land controls the flow of wealth." — Venetian proverb
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Strategic Lease Pricing</h3>
          
          <p className="mb-4">
            As a landowner, setting the right lease price for building owners is perhaps your most powerful economic tool. Different pricing strategies serve different goals:
          </p>
          
          <div className="bg-amber-50 p-3 rounded border border-amber-200 mb-4">
            <h5 className="font-bold text-amber-900">Dynamic Lease System</h5>
            <p className="text-amber-800">
              Land leases in Venice are not permanent. They are periodically renegotiated based on:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-amber-800 mt-2">
              <li>Changes in land value due to surrounding development</li>
              <li>Infrastructure improvements (new bridges, docks, or public buildings)</li>
              <li>Contract conditions and economic cycles (AI landowners also adjust their lease prices dynamically)</li>
              <li>Effects of government decrees and regulations, such as the Vigesima Variabilis tax.</li>
            </ul>
            <p className="mt-2 text-amber-800">
              This dynamic system creates strategic opportunities for both landowners and building owners, as each lease renewal becomes a negotiation influenced by changing circumstances.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">High Lease Price Strategies</h4>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Exclusivity and Influence</h5>
              <p>
                Setting high prices creates exclusive neighborhoods that attract only the wealthiest merchants. This enhances the influence of your property and surrounding areas, creating a virtuous cycle of increasing value. High-end businesses catering to wealthy clientele will pay premium rates for locations in these districts.
              </p>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Competitive Blockading</h5>
              <p>
                Strategically pricing out competitors from valuable locations is a time-honored Venetian tradition. By setting prohibitively high lease rates for key commercial areas, you can control who has access to prime locations and force competitors to less desirable districts with poorer transportation access.
              </p>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Long-term Investment Protection</h5>
              <p>
                High lease prices ensure that only serious, well-capitalized tenants occupy your properties. This reduces tenant turnover, protects your investment, and prevents low-value usage of prime real estate. The stability of long-term, wealthy tenants provides consistent income with minimal management overhead.
              </p>
            </div>
            
            <div>
              <h5 className="font-bold text-amber-900">Strategic Contract Control</h5>
              <p>
                If your land contains or provides access to valuable contracts, high pricing can create bottlenecks in trade networks. This gives you leverage over entire industries that depend on those contracts, allowing you to extract premium rates from those who have no choice but to pay.
              </p>
              
              <div className="my-6 flex justify-center">
                <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                  {/* Background */}
                  <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                  
                  {/* Central contract */}
                  <rect x="150" y="75" width="100" height="100" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.8">
                    <title>Your Contract Property</title>
                  </rect>
                  
                  {/* Contract symbol */}
                  <rect x="175" y="100" width="50" height="50" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
                  <text x="200" y="130" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Contract</text>
                  
                  {/* Surrounding properties */}
                  <rect x="50" y="50" width="60" height="60" fill="#a3e635" stroke="#65a30d" strokeWidth="1" opacity="0.7">
                    <title>Supplier Property</title>
                  </rect>
                  <text x="80" y="80" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Supplier</text>
                  
                  <rect x="50" y="140" width="60" height="60" fill="#a3e635" stroke="#65a30d" strokeWidth="1" opacity="0.7">
                    <title>Supplier Property</title>
                  </rect>
                  <text x="80" y="170" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Supplier</text>
                  
                  <rect x="290" y="50" width="60" height="60" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7">
                    <title>Competitor Property</title>
                  </rect>
                  <text x="320" y="80" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Competitor</text>
                  
                  <rect x="290" y="140" width="60" height="60" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7">
                    <title>Competitor Property</title>
                  </rect>
                  <text x="320" y="170" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Competitor</text>
                  
                  {/* Flow arrows */}
                  <path d="M110,80 L150,125" stroke="#059669" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                  <path d="M110,170 L150,125" stroke="#059669" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                  
                  <path d="M250,125 L290,80" stroke="#ef4444" strokeWidth="2" strokeDasharray="5,3" fill="none" markerEnd="url(#arrowhead)" />
                  <path d="M250,125 L290,170" stroke="#ef4444" strokeWidth="2" strokeDasharray="5,3" fill="none" markerEnd="url(#arrowhead)" />
                  
                  {/* Price indicators */}
                  <text x="130" y="100" fill="#059669" fontFamily="serif" fontSize="12">Low Fee</text>
                  <text x="130" y="150" fill="#059669" fontFamily="serif" fontSize="12">Low Fee</text>
                  
                  <text x="270" y="100" fill="#b91c1c" fontFamily="serif" fontSize="12">High Fee</text>
                  <text x="270" y="150" fill="#b91c1c" fontFamily="serif" fontSize="12">High Fee</text>
                  
                  {/* Labels */}
                  <text x="200" y="65" fill="#7c2d12" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle">Your Contract Property</text>
                  <text x="200" y="200" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Differential Contract Access Fees</text>
                  
                  {/* Arrow definition */}
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                            refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                    </marker>
                  </defs>
                </svg>
                <div className="text-sm text-amber-800 italic text-center mt-2">
                  Controlling contract properties allows you to charge differential fees, favoring allies and penalizing competitors
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Low Lease Price Strategies</h4>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Rapid Development</h5>
              <p>
                Lower prices attract more tenants, quickly populating underdeveloped areas. This strategy works well for peripheral properties that need increased foot traffic and economic activity. The goal is to create bustling commercial zones that will eventually support higher rates once established.
              </p>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Strategic Alliances</h5>
              <p>
                Offering favorable terms to complementary businesses can enhance your other properties. For example, providing discounted leases to popular shops near your residential properties increases the desirability and rent potential of those residences. This approach builds economic ecosystems where businesses support each other.
              </p>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Contract Penetration</h5>
              <p>
                Undercutting competing landowners can attract tenants away from them, allowing you to gain contract share in competitive districts. This creates price pressure on rival landowners and can force them to lower their own prices or lose tenants, weakening their economic position.
              </p>
            </div>
            
            <div>
              <h5 className="font-bold text-amber-900">Long-term Value Building</h5>
              <p>
                Sometimes sacrificing short-term profits builds long-term property value. By developing a reputation as a fair landlord with reasonable rates, you attract stable, long-term tenants. As you develop transportation infrastructure and commercial momentum, surrounding property values rise, increasing your overall wealth.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Advanced Mixed Strategies</h4>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Differential Pricing</h5>
              <p>
                The most sophisticated landowners charge different rates to different tenants based on their strategic value. Offer discounts to businesses that complement your other ventures while charging premium rates to competitors or businesses that don't enhance your portfolio.
              </p>
              
              <div className="my-6 flex justify-center">
                <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                  {/* Background */}
                  <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                  
                  {/* Your properties with different pricing */}
                  <rect x="50" y="50" width="100" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.9">
                    <title>Premium Property</title>
                  </rect>
                  
                  <rect x="50" y="150" width="100" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.6">
                    <title>Discounted Property</title>
                  </rect>
                  
                  <rect x="250" y="50" width="100" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.9">
                    <title>Premium Property</title>
                  </rect>
                  
                  <rect x="250" y="150" width="100" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.6">
                    <title>Discounted Property</title>
                  </rect>
                  
                  {/* Tenant types */}
                  <circle cx="100" y="85" r="15" fill="#ef4444" stroke="#b91c1c" strokeWidth="2">
                    <title>Competitor</title>
                  </circle>
                  
                  <circle cx="100" y="185" r="15" fill="#059669" stroke="#047857" strokeWidth="2">
                    <title>Complementary Business</title>
                  </circle>
                  
                  <circle cx="300" y="85" r="15" fill="#ef4444" stroke="#b91c1c" strokeWidth="2">
                    <title>Competitor</title>
                  </circle>
                  
                  <circle cx="300" y="185" r="15" fill="#059669" stroke="#047857" strokeWidth="2">
                    <title>Complementary Business</title>
                  </circle>
                  
                  {/* Price indicators */}
                  <text x="160" y="85" fill="#b45309" fontFamily="serif" fontSize="16" fontWeight="bold">500₫</text>
                  <text x="160" y="185" fill="#b45309" fontFamily="serif" fontSize="16" fontWeight="bold">200₫</text>
                  <text x="360" y="85" fill="#b45309" fontFamily="serif" fontSize="16" fontWeight="bold">500₫</text>
                  <text x="360" y="185" fill="#b45309" fontFamily="serif" fontSize="16" fontWeight="bold">200₫</text>
                  
                  {/* Labels */}
                  <text x="100" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Premium Rates</text>
                  <text x="100" y="140" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Discounted Rates</text>
                  <text x="100" y="110" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Competitor</text>
                  <text x="100" y="210" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Ally</text>
                  
                  <text x="300" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Premium Rates</text>
                  <text x="300" y="140" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Discounted Rates</text>
                  <text x="300" y="110" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Competitor</text>
                  <text x="300" y="210" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Ally</text>
                  
                  {/* Flow arrows */}
                  <path d="M150,85 L250,85" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                  <path d="M150,185 L250,185" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                  
                  {/* Arrow definition */}
                  <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                            refX="9" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                    </marker>
                  </defs>
                </svg>
                <div className="text-sm text-amber-800 italic text-center mt-2">
                  Charge premium rates to competitors while offering discounts to complementary businesses
                </div>
              </div>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Temporal Strategies</h5>
              <p>
                Start with low prices to attract initial tenants, then gradually increase rates as an area becomes more developed. Implement seasonal pricing to reflect changing economic conditions, or offer introductory rates with scheduled increases to lock in tenants while ensuring growing returns.
              </p>
              
              <div className="my-6 flex justify-center">
                <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                  {/* Background */}
                  <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                  
                  {/* Timeline */}
                  <line x1="50" y1="125" x2="350" y2="125" stroke="#7c2d12" strokeWidth="2" />
                  
                  {/* Timeline markers */}
                  <line x1="50" y1="120" x2="50" y2="130" stroke="#7c2d12" strokeWidth="2" />
                  <line x1="150" y1="120" x2="150" y2="130" stroke="#7c2d12" strokeWidth="2" />
                  <line x1="250" y1="120" x2="250" y2="130" stroke="#7c2d12" strokeWidth="2" />
                  <line x1="350" y1="120" x2="350" y2="130" stroke="#7c2d12" strokeWidth="2" />
                  
                  {/* Price curve */}
                  <path d="M50,100 C100,110 125,90 150,80 C175,70 200,60 250,40 C300,20 325,30 350,25" 
                        stroke="#f59e0b" strokeWidth="3" fill="none" />
                  
                  {/* Development curve */}
                  <path d="M50,200 C75,190 100,170 150,150 C200,130 225,120 250,110 C300,100 325,95 350,90" 
                        stroke="#059669" strokeWidth="3" fill="none" />
                  
                  {/* Labels */}
                  <text x="50" y="140" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Initial</text>
                  <text x="50" y="155" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Development</text>
                  
                  <text x="150" y="140" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Growing</text>
                  <text x="150" y="155" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Popularity</text>
                  
                  <text x="250" y="140" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Established</text>
                  <text x="250" y="155" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">District</text>
                  
                  <text x="350" y="140" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Premium</text>
                  <text x="350" y="155" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Location</text>
                  
                  {/* Curve labels */}
                  <text x="370" y="25" fill="#f59e0b" fontFamily="serif" fontSize="14" fontWeight="bold">Rent Price</text>
                  <text x="370" y="90" fill="#059669" fontFamily="serif" fontSize="14" fontWeight="bold">Development</text>
                  
                  {/* Price points */}
                  <circle cx="50" cy="100" r="5" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <text x="40" y="100" fill="#b45309" fontFamily="serif" fontSize="12" textAnchor="end">100₫</text>
                  
                  <circle cx="150" cy="80" r="5" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <text x="140" y="80" fill="#b45309" fontFamily="serif" fontSize="12" textAnchor="end">200₫</text>
                  
                  <circle cx="250" cy="40" r="5" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <text x="240" y="40" fill="#b45309" fontFamily="serif" fontSize="12" textAnchor="end">350₫</text>
                  
                  <circle cx="350" cy="25" r="5" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
                  <text x="340" y="25" fill="#b45309" fontFamily="serif" fontSize="12" textAnchor="end">400₫</text>
                </svg>
                <div className="text-sm text-amber-800 italic text-center mt-2">
                  Temporal pricing strategies adjust rent over time as an area develops and becomes more valuable
                </div>
              </div>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Conditional Leasing</h5>
              <p>
                Tie lease prices to business performance with percentage-based components. Offer lower base rates with profit-sharing arrangements to align your interests with your tenants. This creates incentives for tenants to maximize their own profits, which in turn increases your income.
              </p>
            </div>
              
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Lease Renegotiation Strategy</h5>
              <p>
                Land leases are periodically renegotiated based on changing economic conditions. Prepare for these negotiations by:
                <br />• Documenting improvements you've made that increase land value
                <br />• Researching comparable lease rates in the area
                <br />• Building relationships with landowners to secure favorable terms
                <br />• Maintaining multiple properties to increase your negotiating leverage
              </p>
            </div>
            
            <div>
              <h5 className="font-bold text-amber-900">Geographic Monopoly Building</h5>
              <p>
                Use low prices in strategic areas to gain control of entire districts, then gradually increase prices once your monopoly is established. Create "loss leader" properties that drive traffic to your higher-priced properties, and develop transportation choke points with differential pricing on either side.
              </p>
              
              <div className="my-6 flex justify-center">
                <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                  {/* Background */}
                  <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                  
                  {/* Water */}
                  <rect x="175" y="0" width="50" height="250" fill="#e0f2fe" stroke="#2563eb" strokeWidth="1" />
                  
                  {/* Grid of properties */}
                  {/* Left side - your monopoly */}
                  <rect x="25" y="25" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="75" y="25" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="125" y="25" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  
                  <rect x="25" y="75" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="75" y="75" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.9" />
                  <rect x="125" y="75" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  
                  <rect x="25" y="125" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="75" y="125" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="125" y="125" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  
                  <rect x="25" y="175" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="75" y="175" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="125" y="175" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  
                  {/* Right side - mixed ownership */}
                  <rect x="225" y="25" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="275" y="25" width="50" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7" />
                  <rect x="325" y="25" width="50" height="50" fill="#a3e635" stroke="#65a30d" strokeWidth="1" opacity="0.7" />
                  
                  <rect x="225" y="75" width="50" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7" />
                  <rect x="275" y="75" width="50" height="50" fill="#a3e635" stroke="#65a30d" strokeWidth="1" opacity="0.7" />
                  <rect x="325" y="75" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  
                  <rect x="225" y="125" width="50" height="50" fill="#a3e635" stroke="#65a30d" strokeWidth="1" opacity="0.7" />
                  <rect x="275" y="125" width="50" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="1" opacity="0.8" />
                  <rect x="325" y="125" width="50" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7" />
                  
                  <rect x="225" y="175" width="50" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7" />
                  <rect x="275" y="175" width="50" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" opacity="0.7" />
                  <rect x="325" y="175" width="50" height="50" fill="#a3e635" stroke="#65a30d" strokeWidth="1" opacity="0.7" />
                  
                  {/* Price indicators */}
                  <text x="100" y="100" fill="#7c2d12" fontFamily="serif" fontSize="16" fontWeight="bold">500₫</text>
                  <text x="275" y="100" fill="#7c2d12" fontFamily="serif" fontSize="16" fontWeight="bold">300₫</text>
                  
                  {/* Labels */}
                  <text x="100" y="15" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Your District Monopoly</text>
                  <text x="275" y="15" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Mixed Ownership District</text>
                  
                  <text x="100" y="240" fill="#f59e0b" fontFamily="serif" fontSize="12" textAnchor="middle">Premium Pricing Power</text>
                  <text x="275" y="240" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Competitive Pricing</text>
                </svg>
                <div className="text-sm text-amber-800 italic text-center mt-2">
                  Controlling an entire district allows you to set premium prices without competition
                </div>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Transportation Control & Blockade Tactics</h3>
          
          <p className="mb-4">
            Beyond pricing, controlling the flow of goods and people through Venice provides enormous strategic advantage. As a landowner, you determine where roads and bridges are built on your property, giving you the power to shape the city's transportation network.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Strategic Blockading</h4>
            
            <p className="mb-3">
              By strategically acquiring land that forms natural chokepoints, you can effectively blockade parts of Venice from ground transportation. This forces competitors to rely on more expensive water transportation, increasing their costs while your own goods flow freely.
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                {/* Water */}
                <rect x="0" y="0" width="400" height="250" fill="#e0f2fe" />
                
                {/* Land masses */}
                <path d="M0,0 L150,0 L150,100 L250,100 L250,250 L0,250 Z" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                <path d="M300,0 L400,0 L400,250 L350,250 L350,150 L300,150 Z" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                
                {/* Strategic chokepoint */}
                <rect x="150" y="100" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.7">
                  <title>Strategic Chokepoint</title>
                </rect>
                
                {/* Competitor's route - expensive water route */}
                <path d="M75,50 C100,75 200,200 325,200" stroke="#3b82f6" strokeWidth="3" strokeDasharray="5,5" fill="none" />
                
                {/* Your route - efficient land route */}
                <path d="M75,50 L200,125 L325,200" stroke="#059669" strokeWidth="3" fill="none" />
                
                {/* Labels */}
                <text x="75" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14">Your Property</text>
                <text x="325" y="190" fill="#7c2d12" fontFamily="serif" fontSize="14">Contract</text>
                <text x="200" y="90" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Your Chokepoint</text>
                <text x="200" y="220" fill="#3b82f6" fontFamily="serif" fontSize="12" textAnchor="middle">Competitor's Expensive Water Route</text>
                <text x="200" y="170" fill="#059669" fontFamily="serif" fontSize="12" textAnchor="middle">Your Efficient Land Route</text>
              </svg>
              <div className="text-sm text-amber-800 italic text-center mt-2">
                Strategic blockading forces competitors to use expensive water routes while your goods travel efficiently by land
              </div>
            </div>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200 mb-3">
              <p className="italic text-amber-800">
                <span className="font-bold">Case Study:</span> The Contarini family acquired three small but strategically positioned parcels that controlled all land access to the Dorsoduro district. By refusing road access to competing merchant families, they forced rivals to ship goods by gondola at five times the cost, effectively controlling which businesses could profitably operate in the district.
              </p>
            </div>
            
            <p className="mb-3">
              <span className="font-bold">Implementation:</span> Identify narrow passages between canals where all ground transportation must pass. Acquire these parcels even if they seem small or otherwise undesirable. Once you control these chokepoints, you can:
            </p>
            
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>Charge tolls for passage</li>
              <li>Deny access to competitors entirely</li>
              <li>Create preferential access for allies</li>
              <li>Control which goods can enter certain districts</li>
            </ul>
            
            <p className="text-amber-700 font-medium">
              Warning: This strategy can backfire if rival merchant families unite against you or employ the same tactics in areas where you need access. Secure your own supply lines before implementing blockades.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Dock Access Control</h4>
            
            <p className="mb-3">
              Water transportation is essential in Venice. By controlling waterfront properties with dock access, you gain leverage over the entire transportation network.
            </p>
            
            <p className="mb-3">
              <span className="font-bold">Strategy:</span> Acquire key waterfront properties, particularly those at the intersection of major canals or near the entrances to smaller canals. Build docks only where they benefit your operations, and deny dock construction on your waterfront properties that would benefit competitors.
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                {/* Water */}
                <rect x="0" y="0" width="400" height="250" fill="#e0f2fe" />
                
                {/* Main canal */}
                <path d="M150,0 L250,0 L250,250 L150,250 Z" fill="#93c5fd" stroke="#2563eb" strokeWidth="1" />
                
                {/* Land masses */}
                <path d="M0,0 L150,0 L150,250 L0,250 Z" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                <path d="M250,0 L400,0 L400,250 L250,250 Z" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
                
                {/* Your waterfront properties */}
                <rect x="130" y="50" width="20" height="40" fill="#f59e0b" stroke="#b45309" strokeWidth="2">
                  <title>Your Dock</title>
                </rect>
                <rect x="130" y="150" width="20" height="40" fill="#f59e0b" stroke="#b45309" strokeWidth="2">
                  <title>Your Dock</title>
                </rect>
                
                {/* Competitor's property without dock access */}
                <rect x="250" y="100" width="20" height="40" fill="#ef4444" stroke="#b91c1c" strokeWidth="2">
                  <title>Competitor's Property (No Dock)</title>
                </rect>
                
                {/* Your boats */}
                <circle cx="170" cy="70" r="8" fill="#059669" stroke="#047857" strokeWidth="1" />
                <circle cx="170" cy="170" r="8" fill="#059669" stroke="#047857" strokeWidth="1" />
                
                {/* Labels */}
                <text x="100" y="70" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="end">Your Dock</text>
                <text x="100" y="170" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="end">Your Dock</text>
                <text x="300" y="120" fill="#7c2d12" fontFamily="serif" fontSize="14">Competitor's Land</text>
                <text x="300" y="135" fill="#7c2d12" fontFamily="serif" fontSize="14">(No Dock Access)</text>
                <text x="200" y="20" fill="#2563eb" fontFamily="serif" fontSize="14" textAnchor="middle">Grand Canal</text>
              </svg>
              <div className="text-sm text-amber-800 italic text-center mt-2">
                Controlling waterfront properties with docks gives you exclusive access to efficient water transportation
              </div>
            </div>
            
            <p>
              This forces competitors to take longer routes or use less efficient transportation methods, increasing their costs and delivery times while your goods move efficiently through the city.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Supply Chain Disruption</h4>
            
            <p className="mb-3">
              If a rival family specializes in a particular industry, acquiring the land between their workshops and their suppliers forces them to navigate around your territory, increasing their costs.
            </p>
            
            <p className="mb-3">
              <span className="font-bold">Example:</span> If a competitor operates a successful glassmaking business, acquire the land between their workshop and their sand suppliers. This forces them to find alternative, longer routes or pay you for passage rights.
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                
                {/* Water */}
                <rect x="0" y="200" width="400" height="50" fill="#e0f2fe" stroke="#2563eb" strokeWidth="1" />
                
                {/* Competitor's glassmaking workshop */}
                <rect x="350" y="100" width="40" height="40" fill="#ef4444" stroke="#b91c1c" strokeWidth="2">
                  <title>Competitor's Glass Workshop</title>
                </rect>
                
                {/* Sand supplier */}
                <rect x="10" y="210" width="30" height="30" fill="#a3e635" stroke="#65a30d" strokeWidth="2">
                  <title>Sand Supplier</title>
                </rect>
                
                {/* Your strategic land acquisition */}
                <rect x="150" y="50" width="100" height="150" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.7">
                  <title>Your Strategic Land</title>
                </rect>
                
                {/* Original direct route */}
                <path d="M40,225 L350,120" stroke="#059669" strokeWidth="2" strokeDasharray="5,5" fill="none">
                  <title>Original Direct Route</title>
                </path>
                
                {/* New longer route */}
                <path d="M40,225 L100,225 C120,225 120,50 150,50 L250,50 C280,50 280,100 350,120" 
                      stroke="#ef4444" strokeWidth="3" fill="none">
                  <title>New Longer Route</title>
                </path>
                
                {/* Labels */}
                <text x="370" y="95" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Glass</text>
                <text x="370" y="110" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Workshop</text>
                <text x="25" y="205" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Sand</text>
                <text x="25" y="220" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Supplier</text>
                <text x="200" y="125" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Your Strategic</text>
                <text x="200" y="145" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Land Acquisition</text>
                <text x="200" y="230" fill="#059669" fontFamily="serif" fontSize="12" textAnchor="middle" fontStyle="italic">Original Direct Route</text>
                <text x="200" y="30" fill="#ef4444" fontFamily="serif" fontSize="12" textAnchor="middle">New Expensive Route</text>
              </svg>
              <div className="text-sm text-amber-800 italic text-center mt-2">
                Acquiring land between a competitor's workshop and their suppliers forces them to use longer, more expensive routes
              </div>
            </div>
            
            <p>
              This strategy is particularly effective against businesses that require frequent deliveries of heavy or bulky raw materials, as the increased transportation costs significantly impact their profitability.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Defensive Measures</h3>
          
          <p className="mb-4">
            As you implement these strategies, expect retaliation. Wise landowners prepare defensive measures to protect their own interests.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Securing Your Supply Lines</h4>
            
            <p className="mb-3">
              Before implementing aggressive blockade strategies, ensure your own supply lines are secure. Acquire land to create uninterrupted corridors between your key properties, or secure waterfront properties with dock access to ensure water transportation remains available to you.
            </p>
            
            <p>
              Remember that in Venice's narrow streets and canals, a single strategic parcel can block an entire route. Identify these vulnerabilities in your own supply network and address them before competitors do.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Strategic Alliances</h4>
            
            <p className="mb-3">
              No single family, no matter how wealthy, can control all of Venice. Form alliances with other landowners whose interests complement rather than compete with yours.
            </p>
            
            <p className="mb-3">
              Create mutually beneficial arrangements to counter common rivals. If another merchant family is being blockaded by a competitor, offer them access through your lands in exchange for favorable trade terms or support in the Council.
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                
                {/* Water */}
                <rect x="150" y="100" width="100" height="50" fill="#e0f2fe" stroke="#2563eb" strokeWidth="1" />
                
                {/* Your properties */}
                <rect x="50" y="50" width="100" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.8">
                  <title>Your Property</title>
                </rect>
                
                <rect x="50" y="150" width="100" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.8">
                  <title>Your Property</title>
                </rect>
                
                {/* Ally properties */}
                <rect x="250" y="50" width="100" height="70" fill="#059669" stroke="#047857" strokeWidth="2" opacity="0.8">
                  <title>Ally Property</title>
                </rect>
                
                <rect x="250" y="150" width="100" height="70" fill="#059669" stroke="#047857" strokeWidth="2" opacity="0.8">
                  <title>Ally Property</title>
                </rect>
                
                {/* Bridges/connections */}
                <rect x="150" y="85" width="100" height="15" fill="#d97706" stroke="#92400e" strokeWidth="1">
                  <title>Bridge/Connection</title>
                </rect>
                
                <rect x="150" y="175" width="100" height="15" fill="#d97706" stroke="#92400e" strokeWidth="1">
                  <title>Bridge/Connection</title>
                </rect>
                
                {/* Competitor blockade */}
                <rect x="150" y="0" width="100" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="2" opacity="0.7">
                  <title>Competitor Blockade</title>
                </rect>
                
                <rect x="150" y="200" width="100" height="50" fill="#ef4444" stroke="#b91c1c" strokeWidth="2" opacity="0.7">
                  <title>Competitor Blockade</title>
                </rect>
                
                {/* Flow arrows */}
                <path d="M100,85 L150,85" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                <path d="M250,85 L200,85" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                <path d="M100,175 L150,175" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                <path d="M250,175 L200,175" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                
                {/* Labels */}
                <text x="100" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Your Property</text>
                <text x="300" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Ally Property</text>
                <text x="200" y="25" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Competitor Blockade</text>
                <text x="200" y="225" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Competitor Blockade</text>
                <text x="200" y="125" fill="#2563eb" fontFamily="serif" fontSize="14" textAnchor="middle">Canal</text>
                <text x="200" y="75" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Shared Access</text>
                <text x="200" y="165" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Shared Access</text>
                
                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
              </svg>
              <div className="text-sm text-amber-800 italic text-center mt-2">
                Strategic alliances allow you to bypass competitor blockades through shared access
              </div>
            </div>
            
            <p>
              These alliances can shift as circumstances change—the family you help today may become a rival tomorrow, but the political capital you gain will remain valuable.
            </p>
          </div>
          
          <div className="bg-amber-50 p-3 rounded border border-amber-200 mt-4">
            <h5 className="font-bold text-amber-900">The Vigesima Variabilis: Land Lease Taxation</h5>
            <p className="text-amber-800">
              All land leases in Venice are subject to a variable tax known as the <i>Vigesima Variabilis</i>. This tax ranges from 20% for well-developed land (high ratio of actual buildings to potential building points) up to 50% for underdeveloped land. It is automatically collected by the Republic on all lease income. When setting lease prices, remember to account for this tax to ensure your desired profit margin.
            </p>
            <p className="text-amber-800 mt-2">
              The Vigesima Variabilis funds essential public services and infrastructure. While this tax is non-negotiable, strategic landowners can minimize its impact by fully developing their land. Additionally, be aware of the "Land Owner Infrastructure Maintenance Responsibility" decree, which may assign you responsibility for maintaining public buildings (bridges, docks, wells) on your land.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Infrastructure Investment</h4>
            
            <p className="mb-3">
              Propose and fund infrastructure projects that disproportionately benefit your properties while appearing to serve the public good. A bridge that connects your commercial district to a major contract creates value for you while earning political goodwill.
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="400" height="250" viewBox="0 0 400 250" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="400" height="250" fill="#fef3c7" />
                
                {/* Water */}
                <rect x="175" y="0" width="50" height="250" fill="#e0f2fe" stroke="#2563eb" strokeWidth="1" />
                
                {/* Your properties */}
                <rect x="50" y="50" width="125" height="70" fill="#f59e0b" stroke="#b45309" strokeWidth="2" opacity="0.8">
                  <title>Your Commercial District</title>
                </rect>
                
                {/* Contract */}
                <rect x="225" y="150" width="125" height="70" fill="#a3e635" stroke="#65a30d" strokeWidth="2" opacity="0.8">
                  <title>Major Contract</title>
                </rect>
                
                {/* Bridge - your infrastructure project */}
                <rect x="150" y="120" width="100" height="20" rx="5" fill="#d97706" stroke="#92400e" strokeWidth="2">
                  <title>Your Bridge Project</title>
                </rect>
                
                {/* Competitor properties */}
                <rect x="225" y="50" width="125" height="70" fill="#ef4444" stroke="#b91c1c" strokeWidth="2" opacity="0.7">
                  <title>Competitor District</title>
                </rect>
                
                {/* People/traffic */}
                <circle cx="100" y="85" r="5" fill="#7c2d12" />
                <circle cx="120" y="85" r="5" fill="#7c2d12" />
                <circle cx="140" y="85" r="5" fill="#7c2d12" />
                
                <circle cx="260" y="185" r="5" fill="#7c2d12" />
                <circle cx="280" y="185" r="5" fill="#7c2d12" />
                <circle cx="300" y="185" r="5" fill="#7c2d12" />
                
                {/* Traffic flow */}
                <path d="M100,85 Q150,130 200,130 Q250,130 300,185" stroke="#7c2d12" strokeWidth="2" strokeDasharray="5,3" fill="none" />
                
                {/* Alternative route (longer) */}
                <path d="M100,85 Q125,20 200,20 Q275,20 300,185" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" fill="none" />
                
                {/* Labels */}
                <text x="112" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Your Commercial</text>
                <text x="112" y="55" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">District</text>
                
                <text x="287" y="140" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Major Contract</text>
                
                <text x="287" y="40" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Competitor</text>
                <text x="287" y="55" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">District</text>
                
                <text x="200" y="115" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle">Your Bridge Project</text>
                
                <text x="200" y="200" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle" fontStyle="italic">Direct Route via Your Bridge</text>
                
                <text x="200" y="30" fill="#ef4444" fontFamily="serif" fontSize="12" textAnchor="middle" fontStyle="italic">Longer Alternative Route</text>
              </svg>
              <div className="text-sm text-amber-800 italic text-center mt-2">
                Strategic infrastructure projects like bridges can connect your properties to valuable contracts while appearing to serve the public good
              </div>
            </div>
            
            <p>
              Conversely, oppose infrastructure that would benefit rivals by suggesting alternative projects that better "serve the Republic." The appearance of civic-mindedness can mask strategic economic maneuvering.
            </p>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: The Long Game</h3>
            <p className="mb-4">
              Land ownership in Venice is not merely about collecting rent—it is about shaping the economic landscape of the Republic to your advantage. The most successful nobili families think in terms of decades, not days.
            </p>
            <p className="mb-4">
              By strategically pricing your leases, controlling transportation networks, and forming the right alliances, you create an economic ecosystem that naturally funnels wealth toward your family. Each decision should serve your long-term vision for your dynasty's place in Venetian society.
            </p>
            <p>
              Remember that in La Serenissima's closed economic system, your gain often comes at another's expense. Act with strategic precision, and may your family name endure for centuries in the golden book of Venetian nobility.
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

export default LandOwnerGuideArticle;
