import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface BusinessOwnersGuideArticleProps {
  onClose: () => void;
}

const BusinessOwnersGuideArticle: React.FC<BusinessOwnersGuideArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            The Merchant's Guide to Business Success
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
            Establishing and Growing Profitable Enterprises in La Serenissima
          </p>
          
          <p className="mb-4">
            In Renaissance Venice, business was more than commerce—it was an art form. As a merchant in La Serenissima, your business ventures will form the backbone of your wealth and influence. This guide will help you establish, operate, and expand successful enterprises in the competitive Venetian marketplace, where you'll interact with and compete against both human and AI-driven businesses.
          </p>
          
          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-3">Understanding Venetian Business Fundamentals</h3>
            <p className="mb-3">
              Venetian commerce operates on principles that differ from modern business in several key ways:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Guild Regulation</h5>
                <p className="text-sm">
                  Most industries are regulated by powerful guilds that control quality standards, pricing, and entry into the profession. Working within guild structures is essential for legitimate business operations.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Relationship-Based Commerce</h5>
                <p className="text-sm">
                  Business relationships are personal and long-term. Your reputation and network of connections are as valuable as your capital. Venetians prefer to deal with merchants they know and trust.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Geographic Specialization</h5>
                <p className="text-sm">
                  Different districts specialize in particular industries—glassmaking on Murano, textiles in Cannaregio, luxury retail near Rialto. Location significantly impacts business success and available opportunities.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Vertical Integration</h5>
                <p className="text-sm">
                  Successful Venetian merchants often control multiple stages of production and distribution. Owning the entire process from raw materials to retail creates significant competitive advantages.
                </p>
              </div>
            </div>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="300" viewBox="0 0 500 300" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="500" height="300" fill="#fef3c7" />
                
                {/* Central business cycle */}
                <ellipse cx="250" cy="150" rx="150" ry="120" fill="none" stroke="#d97706" strokeWidth="1" strokeDasharray="5,5" />
                
                {/* Business nodes */}
                <rect x="225" y="30" width="50" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="250" y="55" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">CAPITAL</text>
                
                <rect x="350" y="110" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="390" y="135" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">PRODUCTION</text>
                
                <rect x="300" y="220" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="340" y="245" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">DISTRIBUTION</text>
                
                <rect x="120" y="220" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="160" y="245" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">RETAIL</text>
                
                <rect x="70" y="110" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="110" y="135" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">PROFIT</text>
                
                {/* Flow arrows */}
                <path d="M 250 70 L 350 110" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 390 150 L 340 220" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 300 240 L 200 240" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 120 220 L 110 150" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 110 110 L 225 50" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                {/* Labels */}
                <text x="300" y="90" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(-25, 300, 90)">Investment</text>
                <text x="380" y="185" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(75, 380, 185)">Goods</text>
                <text x="250" y="225" fill="#7c2d12" fontFamily="serif" fontSize="12">Transport</text>
                <text x="100" y="185" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(-75, 100, 185)">Sales</text>
                <text x="160" y="70" fill="#7c2d12" fontFamily="serif" fontSize="12" transform="rotate(25, 160, 70)">Reinvestment</text>
                
                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
              </svg>
            </div>
            
            <p className="mt-3 italic">
              "The business cycle of Venice: capital flows through production, distribution, and retail before returning as profit for reinvestment."
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Business Types & Opportunities</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Manufacturing Enterprises</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Textile Production</h5>
                <p>
                  From silk weaving to wool processing, textiles represent one of Venice's most profitable industries. Success requires securing reliable raw material sources, skilled labor, and distribution channels to luxury contracts throughout Europe.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Glassmaking</h5>
                <p>
                  Venetian glass is renowned throughout the world for its quality and beauty. Establishing a successful glassworks requires specialized knowledge, access to quality materials, and connections to wealthy clients who appreciate fine craftsmanship.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Shipbuilding</h5>
                <p>
                  The Arsenal represents Venice's industrial might, but smaller shipyards can be profitable for constructing merchant vessels, gondolas, and fishing boats. This capital-intensive business requires significant investment but offers steady returns.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Commercial Ventures</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Import/Export Trade</h5>
                <p>
                  Venice's position as a gateway between East and West creates opportunities for traders who can source exotic goods and distribute them throughout Europe. Success depends on contract knowledge, reliable shipping, and risk management.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Retail Establishments</h5>
                <p>
                  From luxury boutiques near the Rialto to neighborhood contracts, retail businesses serve both locals and visitors. Location is crucial, with shops in high-traffic areas commanding premium rents but generating higher sales volumes. Consider that the `Nobili` class, with significant disposable income and daytime availability due to their societal roles (not being tied to typical "jobs"), represent prime clientele for high-end retail and specialized services. Catering to their tastes and ensuring your establishment is accessible and appealing to them can be highly profitable.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Banking & Finance</h5>
                <p>
                  Venice pioneered many modern financial practices. Establishing a banking business requires substantial capital and impeccable reputation, but offers significant returns through loans, currency exchange, and investment partnerships.
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Service Industries</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Transportation Services</h5>
                <p>
                  In a city of canals, water transportation is essential. Operating gondolas, cargo boats, or ferry services requires relatively low capital investment while providing steady income. Additionally, organizing teams of `facchini` (porters) for on-foot goods transport across bridges and through narrow alleyways can be a vital service, especially if they can be equipped to carry larger loads. Securing regular contracts with merchants or wealthy families is key to profitability in these services.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Hospitality</h5>
                <p>
                  Inns, taverns, and dining establishments serve both locals and the many visitors to Venice. Success depends on location, reputation for quality, and efficient management of perishable inventory.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Specialized Services</h5>
                <p>
                  Notaries, translators, art dealers, and other specialized service providers fill crucial niches in Venice's complex society. These businesses require specific expertise but minimal capital investment.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Property-Based Income</h4>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Rental Properties</h5>
                <p>
                  Owning and leasing residential or commercial properties provides passive income with minimal day-to-day management. Success depends on location selection, property maintenance, and tenant relationships.
                </p>
              </div>
              
              <div className="mb-3">
                <h5 className="font-bold text-amber-900">Warehousing</h5>
                <p>
                  Secure storage is essential in a trading hub like Venice. Operating warehouses near docks or commercial districts provides steady income with relatively low operating costs once the facility is established. When setting rental prices for storage space (per unit of resource per day), consider charging around 2% of the resource's market value. Given that resources tend to move relatively quickly in the economy, this rate aims to balance profitability for the warehouse owner and an acceptable cost for tenants needing short to medium-term storage. This ensures profitability while remaining competitive and discouraging indefinite hoarding by clients.
                </p>
                <p className="mt-2 text-sm">
                  The staff (Occupants) employed in your warehouse are responsible for its general upkeep, security (by their presence), and ensuring renters can access their leased space. They typically do not handle the renters' goods; renters or their agents are responsible for moving goods in and out of the storage space they've contracted.
                </p>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900">Infrastructure Leasing</h5>
                <p>
                  Docks, loading facilities, and other commercial infrastructure can be leased to merchants who need occasional access without the capital investment of ownership. This creates reliable income from essential commercial facilities.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Starting Your Business</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Initial Considerations</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Capital Requirements</h5>
                <p className="text-sm">
                  Different businesses require varying levels of initial investment:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><span className="font-medium">Low Capital</span>: Small retail, basic services, single gondola operation</li>
                  <li><span className="font-medium">Medium Capital</span>: Workshops, specialized retail, small import ventures</li>
                  <li><span className="font-medium">High Capital</span>: Manufacturing, banking, large-scale trading operations</li>
                </ul>
                <p className="text-sm mt-2">
                  Insufficient capitalization is the primary cause of business failure. Ensure you have enough resources not just to establish your business but to sustain it until profitability.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Location Selection</h5>
                <p className="text-sm">
                  Location dramatically impacts business success:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><span className="font-medium">Retail</span>: Prioritize foot traffic, visibility, and proximity to complementary businesses</li>
                  <li><span className="font-medium">Manufacturing</span>: Focus on access to transportation, raw materials, and affordable space</li>
                  <li><span className="font-medium">Services</span>: Balance between accessibility to clients and appropriate surroundings</li>
                </ul>
                <p className="text-sm mt-2">
                  Consider not just current conditions but future development. Areas near planned bridges or public buildings often increase in commercial value.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Guild Membership</h5>
                <p className="text-sm">
                  Most businesses require guild membership or approval:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Research guild requirements before establishing your business</li>
                  <li>Budget for membership fees and required contributions</li>
                  <li>Develop relationships with existing guild members</li>
                  <li>Understand quality standards and regulations for your industry</li>
                </ul>
                <p className="text-sm mt-2">
                  Operating without proper guild affiliation can result in fines, business closure, or reputation damage that affects future opportunities.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Staffing Needs</h5>
                <p className="text-sm">
                  Assess your labor requirements realistically:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Identify key skilled positions that will be difficult to fill</li>
                  <li>Determine appropriate wages for different skill levels</li>
                  <li>Consider apprenticeship arrangements for long-term staffing</li>
                  <li>Budget for seasonal fluctuations in labor needs</li>
                </ul>
                <p className="text-sm mt-2">
                  In Venice's specialized economy, skilled workers often have significant leverage. Building a reputation as a fair employer helps attract and retain talent. Be mindful that hungry or homeless employees suffer significant productivity penalties (up to 50% or more if both conditions apply), impacting your output.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Strategic Insight:</span> Many successful Venetian merchants begin with modest enterprises that generate steady income while they develop the capital, connections, and expertise needed for more ambitious ventures. This staged approach reduces risk while building essential business foundations.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Business Operations & Management</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Supply Chain Management</h4>
            
            <p className="mb-3">
              Effective supply chain management is critical for most Venetian businesses:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Securing Raw Materials</h5>
                <p className="text-sm">
                  Develop multiple sources for critical materials to protect against shortages and price fluctuations. Consider vertical integration by acquiring suppliers of essential inputs when possible. Establish long-term contracts with reliable suppliers to ensure consistent quality and preferential treatment during shortages.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Transportation Logistics</h5>
                <p className="text-sm">
                  In Venice's unique geography, efficient transportation is essential. Secure reliable boat transportation for goods movement, considering both scheduled services for regular shipments and on-demand options for urgent needs. Establish relationships with porters and cart operators for land transportation where canals don't reach.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Inventory Management</h5>
                <p className="text-sm">
                  Balance between sufficient stock to meet demand and minimizing capital tied up in inventory. Consider seasonal variations in both supply and demand when planning inventory levels. Develop systems to track inventory accurately and prevent theft or spoilage.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Quality Control</h5>
                <p className="text-sm">
                  Venetian reputation for quality is a competitive advantage in European contracts. Implement consistent quality standards for all materials and finished products. Train staff in quality assessment appropriate to your industry. Document quality processes to ensure consistency even with staff changes.
                </p>
              </div>
            </div>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="200" viewBox="0 0 500 200" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="500" height="200" fill="#fef3c7" />
                
                {/* Supply chain flow */}
                <rect x="50" y="80" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="90" y="105" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Raw Materials</text>
                
                <rect x="190" y="80" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="230" y="105" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Production</text>
                
                <rect x="330" y="80" width="80" height="40" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="370" y="105" fill="#7c2d12" fontFamily="serif" fontSize="12" textAnchor="middle">Distribution</text>
                
                {/* Flow arrows */}
                <path d="M 130 100 L 190 100" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 270 100 L 330 100" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <path d="M 410 100 L 470 100" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                {/* Disruption points */}
                <circle cx="160" y="100" r="15" fill="#fef3c7" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,3" />
                <text x="160" y="140" fill="#ef4444" fontFamily="serif" fontSize="10" textAnchor="middle">Supply Disruption</text>
                
                <circle cx="300" y="100" r="15" fill="#fef3c7" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,3" />
                <text x="300" y="140" fill="#ef4444" fontFamily="serif" fontSize="10" textAnchor="middle">Production Delays</text>
                
                <circle cx="440" y="100" r="15" fill="#fef3c7" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,3" />
                <text x="440" y="140" fill="#ef4444" fontFamily="serif" fontSize="10" textAnchor="middle">Delivery Failures</text>
                
                {/* Mitigation strategies */}
                <text x="160" y="60" fill="#059669" fontFamily="serif" fontSize="10" textAnchor="middle">Multiple Suppliers</text>
                <text x="300" y="60" fill="#059669" fontFamily="serif" fontSize="10" textAnchor="middle">Process Redundancy</text>
                <text x="440" y="60" fill="#059669" fontFamily="serif" fontSize="10" textAnchor="middle">Alternative Routes</text>
                
                {/* Title */}
                <text x="250" y="30" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">Supply Chain Vulnerabilities & Mitigations</text>
              </svg>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Case Study:</span> The Contarini glass workshop maintained production during the 1487 Egyptian trade disruption by stockpiling critical materials and developing alternative sources for key ingredients. While competitors closed their furnaces, Contarini captured their contract share and established relationships with new clients that persisted for decades.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Financial Management</h4>
            
            <p className="mb-3">
              Prudent financial management distinguishes successful Venetian businesses:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Accounting Practices</h5>
                <p className="text-sm">
                  Venice pioneered double-entry bookkeeping, which remains essential for business success. Maintain separate records for:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Daily transactions and cash flow</li>
                  <li>Inventory valuation and movement</li>
                  <li>Debts owed to and by the business</li>
                  <li>Capital investments and withdrawals</li>
                </ul>
                <p className="text-sm mt-2">
                  Regular reconciliation of accounts prevents errors and detects potential fraud or theft.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Cash Flow Management</h5>
                <p className="text-sm">
                  Even profitable businesses fail when they run out of cash. Strategies to maintain healthy cash flow include:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Requiring deposits for custom orders</li>
                  <li>Offering discounts for prompt payment</li>
                  <li>Negotiating extended terms with suppliers</li>
                  <li>Maintaining cash reserves for seasonal fluctuations</li>
                </ul>
                <p className="text-sm mt-2">
                  Regularly project cash flow for at least three months ahead to anticipate and address potential shortfalls.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Pricing Strategy</h5>
                <p className="text-sm">
                  Effective pricing balances profitability with contract competitiveness:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Calculate full costs including materials, labor, overhead, and transportation</li>
                  <li>Research competitor pricing for similar products or services</li>
                  <li>Consider different pricing tiers for different customer segments</li>
                  <li>Adjust pricing seasonally based on demand fluctuations</li>
                </ul>
                <p className="text-sm mt-2">
                  Remember that in luxury contracts, excessively low prices can signal poor quality rather than good value.
                </p>
              </div>

              <div className="bg-amber-50 p-3 rounded border border-amber-200 md:col-span-2">
                <h5 className="font-bold text-amber-900 mb-1">Competitive Pricing Against Imports</h5>
                <p className="text-sm">
                  A crucial aspect of pricing in Venice is awareness of external competition. Merchant galleys periodically arrive, bringing goods from distant lands. These imports can significantly impact local market prices. To remain competitive, local business owners must ensure their pricing for similar goods stays attractive, ideally lower than those offered by the newly arrived galley merchants. Failing to do so might lead to customers, including AI citizens, preferring the potentially cheaper imported goods, thus impacting your sales volume and profitability. Regularly monitor the market for such arrivals and be prepared to adjust your prices accordingly to retain your customer base.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Risk Management</h5>
                <p className="text-sm">
                  Venetian merchants face numerous risks that require financial planning:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Purchase insurance for valuable shipments and property</li>
                  <li>Diversify investments across multiple ventures</li>
                  <li>Form partnerships to share risk on major undertakings</li>
                  <li>Maintain emergency reserves for unexpected disruptions</li>
                </ul>
                <p className="text-sm mt-2">
                  The most successful merchants balance risk-taking with prudent safeguards against catastrophic losses.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Financial Wisdom:</span> "Keep three purses—one for operating expenses, one for growth, and one for emergencies. Never empty any purse completely, and never borrow from the emergency purse except in true emergencies." — Venetian merchant proverb
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Daily Activity & Business Productivity</h4>
            <p className="mb-3">
              The continued success of your enterprises relies on regular operational activity. The game simulates this through the daily actions of the citizen managing each business. When this manager is actively involved – for example, by being present at the workplace, overseeing production, or managing inventory (actions simulated by the game each morning) – the system records this recent activity for the business.
            </p>
            <p className="text-sm text-amber-700">
              <span className="font-bold">Productivity Impact:</span> If a business shows no sign of this active management for more than 24 hours, it is considered neglected. This results in a <span className="font-bold text-red-600">50% reduction in its productivity</span>. This penalty persists until the manager's actions once again indicate that the business is being attended to. It is therefore crucial to ensure your businesses are run by active and engaged managers to maintain their full operational capacity and profitability.
            </p>
          </div>

          <h3 className="text-2xl font-serif text-amber-700 mb-4">The Importation Process: Bringing Goods to Venice</h3>
          <p className="mb-4">
            Importing goods is a vital aspect of Venetian commerce, connecting the city to global markets. The system in La Serenissima simulates this complex process, involving specialized merchants and logistical steps:
          </p>
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Initiating Import Contracts</h4>
            <p className="mb-3 text-sm">
              Import needs are typically identified by AI-driven demand or system-level economic simulations. When a need for specific foreign goods arises for a Venetian buyer (often an AI-run business), an `import` type contract is created. Initially, this contract will have its `Seller` field set to a system entity like "Italia", representing the foreign source of goods.
            </p>

            <h4 className="text-xl font-serif text-amber-800 mt-4 mb-2">The Role of Forestieri Merchants</h4>
            <p className="mb-3 text-sm">
              Wealthy foreign merchants (`Forestieri` AI citizens with significant capital, e.g., &gt; 1,000,000 Ducats) play a crucial role. The system selects an available AI Forestieri merchant to effectively manage a batch of these pending import contracts. This merchant becomes the intermediary facilitating the import.
            </p>

            <h4 className="text-xl font-serif text-amber-800 mt-4 mb-2">The Merchant Galley (`merchant_galley`)</h4>
            <p className="mb-3 text-sm">
              Once a Forestieri merchant is assigned to handle imports:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm mb-3">
              <li>A temporary `merchant_galley` building is created (or an existing one identified if the merchant already has one from a recent trip) at a water point near a high-activity public dock in Venice. This galley is owned and operated by the selected Forestieri merchant.</li>
              <li>Resources from the assigned import contracts (up to the galley's capacity of 1000 units) are virtually loaded into this galley. These resources are considered owned by the Forestieri merchant while in the galley.</li>
              <li>An activity of type `deliver_resource_batch` is created for the Forestieri merchant to "pilot" this galley to its designated Venetian dock, simulating its arrival. The galley's `ConstructionDate` is set to the activity's end time, and its `IsConstructed` status is initially `False`.</li>
            </ul>

            <h4 className="text-xl font-serif text-amber-800 mt-4 mb-2">Unloading the Galley</h4>
            <p className="mb-3 text-sm">
              When the galley's `ConstructionDate` passes (meaning the `deliver_resource_batch` activity for the galley concludes), its `IsConstructed` status becomes `True`, signaling its arrival and readiness for unloading.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm mb-3">
              <li>The system then creates high-priority `fetch_from_galley` activities for available citizens (often AI).</li>
              <li>These citizens travel to the galley, pick up specific batches of resources (corresponding to the original import contracts, now associated with the Forestieri merchant). While in transit by the citizen, these resources are considered owned by the original `Buyer` of the import contract.</li>
            </ul>
            
            <h4 className="text-xl font-serif text-amber-800 mt-4 mb-2">Final Delivery and Payment</h4>
            <p className="mb-3 text-sm">
              After a citizen has fetched resources from the galley via a `fetch_from_galley` activity:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm mb-3">
              <li>A `deliver_resource_batch` activity is created for that citizen to transport the goods from the galley to the original buyer's building.</li>
              <li>Upon successful delivery to the buyer's building (when this second `deliver_resource_batch` activity concludes):
                <ul className="list-disc pl-5 space-y-1 text-sm ml-5">
                  <li>The original buyer pays the full contract price (as per the initial `import` contract) to the Forestieri merchant.</li>
                  <li>The Forestieri merchant then pays 50% of this amount to "Italia" (representing the cost of goods sourced from outside Venice).</li>
                  <li>The Forestieri merchant retains the remaining 50% as their profit (effectively a 100% markup on their cost of goods).</li>
                </ul>
              </li>
            </ul>
            <p className="text-sm">
              This multi-step process, involving specialized merchants and simulated logistics, adds depth to the import economy. You can also sell your goods through `public_sell` contracts, where other citizens (AI or human) can purchase them based on price, distance, and trust.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Growth & Expansion Strategies</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Pathways to Business Growth</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Vertical Integration</h5>
                <p className="text-sm">
                  Expand your business by controlling more stages of your supply chain:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><span className="font-medium">Backward Integration</span>: Acquire suppliers of your raw materials</li>
                  <li><span className="font-medium">Forward Integration</span>: Establish retail outlets for your products</li>
                </ul>
                <p className="text-sm mt-2">
                  Benefits include reduced costs, quality control, and protection against supply disruptions or distribution bottlenecks.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Horizontal Expansion</h5>
                <p className="text-sm">
                  Grow by increasing your capacity or contract reach:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><span className="font-medium">Additional Locations</span>: Open branches in different districts</li>
                  <li><span className="font-medium">Increased Production</span>: Expand workshop size or add equipment</li>
                  <li><span className="font-medium">Contract Extension</span>: Establish agents in other cities</li>
                </ul>
                <p className="text-sm mt-2">
                  This approach leverages your existing expertise while reaching new customers or increasing capacity.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Diversification</h5>
                <p className="text-sm">
                  Expand into related or complementary business areas:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><span className="font-medium">Related Products</span>: Add complementary items to your line</li>
                  <li><span className="font-medium">New Contracts</span>: Adapt existing products for different customers</li>
                  <li><span className="font-medium">Complementary Services</span>: Add services that enhance your products</li>
                </ul>
                <p className="text-sm mt-2">
                  Diversification reduces risk from contract fluctuations while leveraging your reputation and customer base.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Strategic Partnerships</h5>
                <p className="text-sm">
                  Grow through formal relationships with other businesses:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><span className="font-medium">Joint Ventures</span>: Collaborate on specific projects</li>
                  <li><span className="font-medium">Exclusive Arrangements</span>: Secure exclusive rights to products or territories</li>
                  <li><span className="font-medium">Consortia</span>: Join with others to undertake large ventures</li>
                </ul>
                <p className="text-sm mt-2">
                  Partnerships allow you to pursue opportunities beyond your individual resources while sharing risk.
                </p>
              </div>
            </div>
            
            <div className="my-6 flex justify-center">
              <svg width="500" height="300" viewBox="0 0 500 300" className="border border-amber-300 rounded bg-amber-50">
                {/* Background */}
                <rect x="0" y="0" width="500" height="300" fill="#fef3c7" />
                
                {/* Central business */}
                <rect x="200" y="125" width="100" height="50" rx="5" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="250" y="155" fill="#7c2d12" fontFamily="serif" fontSize="14" textAnchor="middle" fontWeight="bold">CORE BUSINESS</text>
                
                {/* Vertical integration */}
                <rect x="200" y="25" width="100" height="40" rx="5" fill="#a3e635" stroke="#65a30d" strokeWidth="2" />
                <text x="250" y="50" fill="#365314" fontFamily="serif" fontSize="12" textAnchor="middle">Raw Materials</text>
                
                <rect x="200" y="235" width="100" height="40" rx="5" fill="#a3e635" stroke="#65a30d" strokeWidth="2" />
                <text x="250" y="260" fill="#365314" fontFamily="serif" fontSize="12" textAnchor="middle">Retail Outlets</text>
                
                {/* Horizontal expansion */}
                <rect x="50" y="125" width="100" height="50" rx="5" fill="#60a5fa" stroke="#2563eb" strokeWidth="2" />
                <text x="100" y="155" fill="#1e3a8a" fontFamily="serif" fontSize="12" textAnchor="middle">Additional Location</text>
                
                <rect x="350" y="125" width="100" height="50" rx="5" fill="#60a5fa" stroke="#2563eb" strokeWidth="2" />
                <text x="400" y="155" fill="#1e3a8a" fontFamily="serif" fontSize="12" textAnchor="middle">Contract Extension</text>
                
                {/* Diversification */}
                <rect x="125" y="50" width="100" height="40" rx="5" fill="#c084fc" stroke="#7e22ce" strokeWidth="2" />
                <text x="175" y="75" fill="#581c87" fontFamily="serif" fontSize="12" textAnchor="middle">Related Products</text>
                
                <rect x="275" y="50" width="100" height="40" rx="5" fill="#c084fc" stroke="#7e22ce" strokeWidth="2" />
                <text x="325" y="75" fill="#581c87" fontFamily="serif" fontSize="12" textAnchor="middle">New Contracts</text>
                
                <rect x="125" y="210" width="100" height="40" rx="5" fill="#c084fc" stroke="#7e22ce" strokeWidth="2" />
                <text x="175" y="235" fill="#581c87" fontFamily="serif" fontSize="12" textAnchor="middle">Complementary Services</text>
                
                <rect x="275" y="210" width="100" height="40" rx="5" fill="#c084fc" stroke="#7e22ce" strokeWidth="2" />
                <text x="325" y="235" fill="#581c87" fontFamily="serif" fontSize="12" textAnchor="middle">Strategic Partnerships</text>
                
                {/* Connecting lines */}
                <line x1="250" y1="125" x2="250" y2="65" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="250" y1="175" x2="250" y2="235" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="200" y1="150" x2="150" y2="150" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="300" y1="150" x2="350" y2="150" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="200" y1="125" x2="175" y2="90" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="300" y1="125" x2="325" y2="90" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="200" y1="175" x2="175" y2="210" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                <line x1="300" y1="175" x2="325" y2="210" stroke="#7c2d12" strokeWidth="1" strokeDasharray="4,2" />
                
                {/* Legend */}
                <rect x="50" y="275" width="15" height="15" fill="#a3e635" stroke="#65a30d" strokeWidth="1" />
                <text x="75" y="287" fill="#365314" fontFamily="serif" fontSize="10" textAnchor="start">Vertical Integration</text>
                
                <rect x="175" y="275" width="15" height="15" fill="#60a5fa" stroke="#2563eb" strokeWidth="1" />
                <text x="200" y="287" fill="#1e3a8a" fontFamily="serif" fontSize="10" textAnchor="start">Horizontal Expansion</text>
                
                <rect x="325" y="275" width="15" height="15" fill="#c084fc" stroke="#7e22ce" strokeWidth="1" />
                <text x="350" y="287" fill="#581c87" fontFamily="serif" fontSize="10" textAnchor="start">Diversification</text>
              </svg>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Strategic Insight:</span> The most successful Venetian merchants typically pursue multiple growth strategies simultaneously, creating synergies between different aspects of their business empire. For example, a textile merchant might acquire wool suppliers (vertical integration), open additional workshops (horizontal expansion), add garment production (diversification), and form partnerships with dye producers (strategic alliance).
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Reputation & Relationship Management</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Currency of Trust</h4>
            
            <p className="mb-3">
              In Venice's close-knit commercial community, reputation is as valuable as financial capital:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Building a Reputation</h5>
                <p className="text-sm">
                  Establish your business reputation through:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Consistent quality in products and services</li>
                  <li>Honoring commitments and meeting deadlines</li>
                  <li>Fair dealing with customers, suppliers, and competitors</li>
                  <li>Appropriate participation in guild and civic activities</li>
                </ul>
                <p className="text-sm mt-2">
                  Remember that in Venice's interconnected society, word of both good and bad business practices travels quickly.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Customer Relationships</h5>
                <p className="text-sm">
                  Cultivate lasting customer relationships through:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Personalized service and recognition</li>
                  <li>Remembering preferences and past purchases</li>
                  <li>Offering loyalty benefits to regular customers</li>
                  <li>Providing exceptional service recovery when problems occur</li>
                </ul>
                <p className="text-sm mt-2">
                  Long-term customers provide stable income and valuable referrals to new clients.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Supplier Relationships</h5>
                <p className="text-sm">
                  Develop strong supplier partnerships through:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Prompt payment according to agreed terms</li>
                  <li>Clear communication about needs and expectations</li>
                  <li>Reasonable flexibility during supply challenges</li>
                  <li>Appropriate recognition of exceptional service</li>
                </ul>
                <p className="text-sm mt-2">
                  Preferred customers often receive priority during shortages and first access to premium materials.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Competitor Relationships</h5>
                <p className="text-sm">
                  Navigate competitor relationships by:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Maintaining respectful professional conduct</li>
                  <li>Adhering to guild standards and fair practices</li>
                  <li>Finding opportunities for mutually beneficial cooperation</li>
                  <li>Competing on quality and service rather than just price</li>
                </ul>
                <p className="text-sm mt-2">
                  Today's competitor may be tomorrow's partner, supplier, or customer as circumstances change.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Venetian Wisdom:</span> "A merchant's word must be as good as a notarized contract. Once your word is questioned, no legal document will restore the trust you've lost." — Doge Tommaso Mocenigo
              </p>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: The Art of Venetian Commerce</h3>
            <p className="mb-4 text-amber-800">
              Business in La Serenissima is more than a means of generating wealth—it's an art form that combines technical expertise, strategic thinking, relationship management, and civic engagement. The most successful Venetian merchants understand that their businesses exist within a complex ecosystem where reputation, relationships, and reciprocity are as important as capital and commodities.
            </p>
            <p className="mb-4 text-amber-800">
              As you establish and grow your business ventures, remember that you're not just building personal wealth but contributing to the commercial fabric that makes Venice the most sophisticated economy of its age. Your success depends not only on what you produce or sell, but on how you conduct yourself within the intricate social and economic networks of the Serenissima.
            </p>
            <p className="text-amber-800">
              May your ledgers show profit, your warehouses remain full, and your reputation grow ever stronger in the marketplaces of Venice.
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

export default BusinessOwnersGuideArticle;
