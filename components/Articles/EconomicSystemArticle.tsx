import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface EconomicSystemArticleProps {
  onClose: () => void;
}

const EconomicSystemArticle: React.FC<EconomicSystemArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Understanding the Economy of La Serenissima
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
            The Closed Economic System of Venice
          </p>
          
          <p className="mb-4">
            La Serenissima features a sophisticated economic simulation based on historical Venetian commerce. Understanding how this system works is essential for any merchant seeking fortune in the lagoon.
          </p>
          
          {/* Economic Cycle Diagram */}
          <div className="my-8 flex justify-center">
            <svg width="700" height="550" viewBox="0 0 700 550" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c2d12" />
                </marker>
              </defs>
              
              {/* Title */}
              <text x="350" y="40" fontFamily="serif" fontSize="24" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Serenissima Circular Economy</text>
              
              {/* Center COMPUTE node */}
              <circle cx="350" cy="275" r="60" fill="#f59e0b" stroke="#b45309" strokeWidth="3"/>
              <text x="350" y="275" fontFamily="serif" fontSize="20" fontWeight="bold" textAnchor="middle" fill="#7c2d12">$COMPUTE</text>
              <text x="350" y="300" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Economic Currency</text>
              
              {/* Circular path for main economic flow */}
              <circle cx="350" cy="275" r="180" fill="none" stroke="#7c2d12" strokeWidth="2" strokeDasharray="none" opacity="0.2"/>
              
              {/* Main economic nodes positioned in a circle */}
              {/* LAND */}
              <circle cx="350" cy="95" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="350" y="90" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">LAND</text>
              <text x="350" y="110" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Parcels</text>
              
              {/* BUILDINGS */}
              <circle cx="530" cy="275" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="530" y="270" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">BUILDINGS</text>
              <text x="530" y="290" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Structures</text>
              
              {/* BUSINESSES */}
              <circle cx="440" cy="435" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="440" y="430" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">BUSINESSES</text>
              <text x="440" y="450" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Operations</text>
              
              {/* RESOURCES */}
              <circle cx="260" cy="435" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="260" y="430" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">RESOURCES</text>
              <text x="260" y="450" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Goods</text>
              
              {/* CITIZENS & PLAYERS */}
              <circle cx="170" cy="275" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="170" y="270" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">CITIZENS &</text>
              <text x="170" y="290" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">PLAYERS</text>
              
              {/* Main cycle connections with labels */}
              {/* LAND to BUILDINGS */}
              <path d="M 393 120 Q 465 165 505 235" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="465" y="175" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(35, 465, 175)">Leased to</text>
              
              {/* BUILDINGS to BUSINESSES */}
              <path d="M 500 315 Q 485 365 470 395" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="500" y="365" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(70, 500, 365)">Rented to</text>
              
              {/* BUSINESSES to RESOURCES */}
              <path d="M 390 435 L 310 435" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="350" y="420" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Produce</text>
              
              {/* RESOURCES to CITIZENS */}
              <path d="M 220 410 Q 195 365 190 325" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="185" y="380" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(-75, 185, 380)">Supply</text>
              
              {/* Payment flows - added to show economic relationships */}
              <path d="M 440 385 Q 485 330 480 275" fill="none" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#arrow)"/>
              <text x="470" y="330" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#b45309" transform="rotate(-45, 470, 330)">Pay Rent</text>
              
              <path d="M 480 235 Q 420 165 380 145" fill="none" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3" markerEnd="url(#arrow)"/>
              <text x="420" y="180" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#b45309" transform="rotate(-45, 420, 180)">Pay Land Lease</text>
              
              {/* CITIZENS to LAND */}
              <path d="M 205 235 Q 250 150 320 115" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="240" y="165" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(-35, 240, 165)">Pay Taxes</text>
              
              {/* COMPUTE connections (radiating from center) */}
              <line x1="350" y1="215" x2="350" y2="150" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="410" y1="275" x2="475" y2="275" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="385" y1="325" x2="405" y2="390" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="310" y1="325" x2="290" y2="390" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="290" y1="275" x2="225" y2="275" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              
              {/* Descriptive subtitle */}
              <text x="350" y="520" fontFamily="serif" fontSize="16" textAnchor="middle" fill="#7c2d12">$COMPUTE flows through all economic activities, enabling the circular economy of Renaissance Venice</text>
            </svg>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Key Economic Principles</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Closed Economic System</h4>
            <p>
              Unlike traditional games where resources spawn infinitely, La Serenissima operates as a zero-sum economy where wealth must be captured rather than created from nothing. Every ducat in circulation represents real value within the system.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Value Creation Chain</h4>
            <p>
              Value flows through a continuous cycle: Land is leased to Building owners, who rent space to Businesses, which produce Resources, which supply Citizens and Players. Money flows in the opposite direction: Business owners pay rent to Building owners, who pay land leases to Land owners, and all pay taxes to the Republic—completing the economic loop.
            </p>
            <p className="mt-2">
              This hierarchical relationship creates a dynamic property contract where lease terms are periodically renegotiated based on changing economic conditions, infrastructure improvements, and contract demand.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Natural Scarcity</h4>
            <p>
              The geographic constraints of building on islands creates authentic value differentials. Prime locations along the Grand Canal naturally command higher prices than remote locations, without artificial scarcity mechanisms.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Economic Roles in Venice</h3>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Merchant Specializations</h4>
            <p className="mb-4">
              In La Serenissima, prosperity comes from finding your economic niche. Different specializations offer unique advantages and challenges:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Property Magnate</h5>
                <p>
                  Focus on acquiring prime real estate and developing it for maximum rental income. Success depends on location selection, building quality, and tenant management. Property values appreciate over time, creating a stable foundation for wealth.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Master Craftsman</h5>
                <p>
                  Specialize in production of high-value goods like Venetian glass, textiles, or shipbuilding. Requires securing reliable supply chains and skilled labor, but offers high profit margins on luxury exports.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Trade Merchant</h5>
                <p>
                  Buy low and sell high by moving goods between contracts. Success depends on understanding price differentials, transportation efficiency, and contract timing. Requires less capital than other specializations but demands constant attention.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Financier</h5>
                <p>
                  Provide capital to other merchants through loans and investments. Profit from interest and partial ownership in successful ventures. Requires deep understanding of risk assessment and diversification strategies.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Contract Mechanics</h3>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Price Formation</h4>
            <p className="mb-4">
              Unlike games with fixed prices, La Serenissima features dynamic pricing based on multiple factors:
            </p>
            
            <div className="flex flex-col md:flex-row gap-6 mb-4">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Supply and Demand</h5>
                <p>
                  Prices respond to the balance of goods available versus consumer needs. When many merchants produce the same good, prices fall. When demand exceeds supply, prices rise accordingly.
                </p>
                <p className="mt-2">
                  This creates natural contract cycles as merchants respond to price signals, often leading to periodic oversupply and shortages as the contract seeks equilibrium. Citizens needing resources will evaluate available `public_sell` contracts based on a score considering price, distance to the seller, and their trust score with the seller.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Quality Differentials</h5>
                <p>
                  Not all goods are created equal. Higher quality items command premium prices, creating incentives for craftsmanship and specialized production techniques.
                </p>
                <p className="mt-2">
                  Master craftsmen can charge significantly more than novices for the same type of good, reflecting the real economic value of expertise and reputation.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Location Value</h5>
                <p>
                  The same good may command different prices in different districts. Luxury items sell for more along the Grand Canal, while basic necessities might be cheaper in residential areas where competition is higher.
                </p>
                <p className="mt-2">
                  This creates opportunities for arbitrage—buying goods where they're cheap and selling where they're expensive.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Seasonal Fluctuations</h5>
                <p>
                  Prices follow seasonal patterns tied to festivals, trade winds, and agricultural cycles. Savvy merchants anticipate these fluctuations, building inventory before demand peaks.
                </p>
                <p className="mt-2">
                  For example, textile prices rise before Carnival season, while building materials become more expensive during spring construction periods.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Banking and Finance</h3>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Venetian Banking System</h4>
            <p className="mb-4">
              Venice pioneered many modern banking concepts, and La Serenissima recreates this sophisticated financial system:
            </p>
            
            <div className="mb-4">
              <h5 className="font-bold text-amber-900 mb-2">Loans and Credit</h5>
              <p>
                The banking system allows you to expand faster than your current capital would permit. Take calculated loans to acquire prime real estate or establish profitable businesses before competitors can act. Different loan types serve different purposes:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><span className="font-medium">Commercial Loans</span>: Short-term financing for trade expeditions and inventory</li>
                <li><span className="font-medium">Property Mortgages</span>: Long-term financing for land and building acquisition</li>
                <li><span className="font-medium">Development Loans</span>: Medium-term financing for construction and expansion</li>
                <li><span className="font-medium">Merchant Partnerships</span>: Equity-based financing where investors share in profits</li>
              </ul>
            </div>
            
            <div className="mb-4">
              <h5 className="font-bold text-amber-900 mb-2">Interest and Risk</h5>
              <p>
                Interest rates vary based on the borrower's reputation, collateral, and the loan's purpose. Riskier ventures command higher rates, while secured loans against valuable property offer more favorable terms.
              </p>
              <p className="mt-2">
                Defaulting on loans has serious consequences, from asset seizure to reputation damage that affects future borrowing ability.
              </p>
            </div>
            
            <div>
              <h5 className="font-bold text-amber-900 mb-2">Financial Instruments</h5>
              <p>
                Beyond basic loans, Venice developed sophisticated financial instruments that are recreated in La Serenissima:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><span className="font-medium">Letters of Credit</span>: Allow merchants to conduct business in distant contracts without carrying physical currency</li>
                <li><span className="font-medium">Maritime Insurance</span>: Protects against losses from shipwrecks and piracy</li>
                <li><span className="font-medium">Futures Contracts</span>: Agreements to buy or sell goods at predetermined prices on future dates</li>
                <li><span className="font-medium">Investment Partnerships</span>: Shared ventures where multiple investors pool capital for major projects</li>
              </ul>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">AI Citizens in the Economy</h3>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Economic Agents</h4>
            <p className="mb-4">
              La Serenissima is populated by AI citizens who participate in the economy as consumers, workers, and entrepreneurs:
            </p>
            
            <p className="mb-4">
              La Serenissima is populated by AI citizens who participate in the economy as consumers, workers, and entrepreneurs. They perform many automated actions daily:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm mb-3">
              <li>**Land Bidding & Purchasing**: AIs bid on and buy land, creating a dynamic market.</li>
              <li>**Building Construction**: AIs develop their land by constructing buildings.</li>
              <li>**Lease & Rent Adjustments**: AI landlords adjust lease and rent prices based on market conditions.</li>
              <li>**Wage Adjustments**: AI business owners adjust wages for their employees.</li>
              <li>**Resource Import Management**: AIs manage imports for their businesses.</li>
              <li>**Public Sales & Pricing**: AIs create `public_sell` contracts and set prices for their goods.</li>
              <li>**Message Responses & Notification Processing**: AIs interact via messages and process game notifications.</li>
              <li>**Consumption & Labor**: AIs consume goods, work jobs, and seek better housing/employment.</li>
            </ul>
            <p className="mb-4">
              These AI behaviors ensure a constantly evolving economic landscape, providing both competition and opportunities for human players.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Consumption Patterns</h5>
                <p>
                  AI citizens have realistic needs and preferences, purchasing food, clothing, luxury goods, and services. Their consumption patterns vary by social class, profession, and individual taste, creating diverse contract demand.
                </p>
                <p className="mt-2">
                  Wealthier citizens demand luxury goods and services, while working-class citizens focus on necessities, creating natural contract segmentation.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Labor and Production</h5>
                <p>
                  Citizens work in workshops, contracts, and service establishments, providing the labor necessary for production. Their skills improve over time, increasing productivity and the quality of goods produced.
                </p>
                <p className="mt-2">
                  Skilled workers command higher wages, creating economic incentives for training and specialization. Labor shortages in specific sectors drive wage increases.
                </p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Economic Mobility</h5>
                <p>
                  AI citizens can rise or fall in economic status based on their success. A talented craftsman might save enough to open their own workshop, while a merchant who makes poor decisions might fall into debt. Their social class can also improve based on achievements.
                </p>
                <p className="mt-2">
                  This social mobility creates dynamic economic conditions as new businesses emerge and others fail, constantly reshaping the competitive landscape.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900">Autonomous Decision-Making</h5>
                <p>
                  Rather than following simple scripts, AI citizens make economic decisions based on their needs, opportunities, and contract conditions, often guided by sophisticated internal logic or external AI engines. They respond to price changes, seek better employment, and adjust their consumption patterns during economic downturns.
                </p>
                <p className="mt-2">
                  This autonomous behavior creates emergent economic patterns that no single player can control, simulating the complexity of real contracts.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Taxation and Public Finance</h3>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Republic's Coffers</h4>
            <p className="mb-4">
              Venice maintained its power through a sophisticated system of taxation and public finance, recreated in La Serenissima:
            </p>
            
            <div className="mb-4">
              <h5 className="font-bold text-amber-900 mb-2">Tax Types</h5>
              <p>
                Various taxes fund the Republic's operations and provide economic balancing mechanisms:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><span className="font-medium">Vigesima Variabilis</span>: A land lease tax ranging from 20% (for well-developed land) to 50% (for underdeveloped land), paid by landowners on their lease income.</li>
                <li><span className="font-medium">Building Maintenance</span>: Daily costs paid by building owners to the Consiglio dei Dieci for upkeep.</li>
                <li><span className="font-medium">Trade Duties</span>: Fees on goods entering and leaving the city (primarily impacting import costs).</li>
                <li><span className="font-medium">Guild Fees</span>: Payments for the right to practice certain trades.</li>
                <li><span className="font-medium">Luxury Tax</span>: Additional charges on high-end goods and services.</li>
                <li><span className="font-medium">Special Assessments</span>: One-time taxes for specific projects or emergencies.</li>
              </ul>
            </div>
            
            <div className="mb-4">
              <h5 className="font-bold text-amber-900 mb-2">Public Expenditure</h5>
              <p>
                Tax revenue funds essential public services and infrastructure:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><span className="font-medium">Infrastructure</span>: Bridges, canals, public buildings, and city walls</li>
                <li><span className="font-medium">Defense</span>: Naval fleet maintenance and city guards</li>
                <li><span className="font-medium">Public Services</span>: Water supply, waste management, and fire prevention</li>
                <li><span className="font-medium">Festivals and Ceremonies</span>: Public celebrations that enhance city influence</li>
              </ul>
              <p className="mt-2">
                These expenditures create economic opportunities for merchants who secure government contracts or benefit from improved infrastructure.
              </p>
            </div>
            
            <div className="mb-4">
              <h5 className="font-bold text-amber-900 mb-2">Citizen Subsidies</h5>
              <p>
                The Republic reinvests 10% of its total treasury daily back into its citizens through direct transfers of Ducats. This represents:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li><span className="font-medium">Grain Subsidies</span>: Ensuring basic food security for all citizens</li>
                <li><span className="font-medium">Public Investments</span>: Funding for community improvements and services</li>
                <li><span className="font-medium">Economic Stimulus</span>: Regular injections of currency to maintain economic activity</li>
                <li><span className="font-medium">Social Stability</span>: Reducing inequality to prevent unrest and maintain Venice's famous stability</li>
              </ul>
              <p className="mt-2">
                This redistribution mechanism ensures that wealth circulates throughout the economy rather than becoming concentrated, maintaining the social harmony that was crucial to Venice's long-term success.
              </p>
            </div>
            
            <div>
              <h5 className="font-bold text-amber-900 mb-2">Tax Strategies</h5>
              <p>
                Savvy merchants develop strategies to optimize their tax burden:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Investing in public works to receive tax exemptions</li>
                <li>Timing major transactions to minimize trade duties</li>
                <li>Forming partnerships with tax-privileged entities</li>
                <li>Negotiating special tax arrangements through political connections</li>
              </ul>
              <p className="mt-2">
                However, tax evasion carries significant risks, including fines, property seizure, and damage to social standing.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Economic Example: The Silk Trade</h3>

          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Following the Silk</h4>
            <p className="mb-4">
              Let's trace how a luxury product moves through Venice's economy, creating value at each step:
            </p>
            
            <div className="relative overflow-x-auto mb-4">
              <div className="flex flex-col md:flex-row items-stretch">
                {/* Step 1: Raw Materials */}
                <div className="md:w-1/5 p-3 bg-amber-50 border border-amber-200 flex flex-col">
                  <h5 className="font-bold text-amber-900 text-center mb-2">Raw Materials</h5>
                  <div className="flex-grow">
                    <p className="text-sm">
                      Raw silk arrives from the East. The Forestieri import merchant effectively pays 50₫ per unit (their cost paid to "Italia").
                    </p>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-amber-800 font-bold">Merchant Cost: 50₫</span>
                  </div>
                </div>
                
                {/* Arrow */}
                <div className="hidden md:flex items-center justify-center px-2">
                  <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
                
                {/* Step 2: Processing */}
                <div className="md:w-1/5 p-3 bg-amber-50 border border-amber-200 flex flex-col">
                  <h5 className="font-bold text-amber-900 text-center mb-2">Processing</h5>
                  <div className="flex-grow">
                    <p className="text-sm">
                      Silk workshops clean and prepare the raw silk, employing skilled workers.
                    </p>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-amber-800 font-bold">Value Added: +30₫</span>
                  </div>
                </div>
                
                {/* Arrow */}
                <div className="hidden md:flex items-center justify-center px-2">
                  <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
                
                {/* Step 3: Weaving */}
                <div className="md:w-1/5 p-3 bg-amber-50 border border-amber-200 flex flex-col">
                  <h5 className="font-bold text-amber-900 text-center mb-2">Weaving</h5>
                  <div className="flex-grow">
                    <p className="text-sm">
                      Master weavers transform prepared silk into luxurious fabrics with distinctive patterns.
                    </p>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-amber-800 font-bold">Value Added: +70₫</span>
                  </div>
                </div>
                
                {/* Arrow */}
                <div className="hidden md:flex items-center justify-center px-2">
                  <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </div>
                
                {/* Step 4: Retail */}
                <div className="md:w-1/5 p-3 bg-amber-50 border border-amber-200 flex flex-col">
                  <h5 className="font-bold text-amber-900 text-center mb-2">Retail</h5>
                  <div className="flex-grow">
                    <p className="text-sm">
                      Luxury merchants sell the finished silk to wealthy citizens and visitors in elegant shops.
                    </p>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-amber-800 font-bold">Value Added: +100₫</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200 mb-4">
              <h5 className="font-bold text-amber-900 mb-2">Value Creation</h5>
              <p>
                Notice how the original 50₫ merchant cost for raw material becomes a 250₫ luxury product. The Forestieri merchant sells to the Venetian buyer at 100₫ (100% markup on their 50₫ cost). The subsequent stages add further value:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>The Forestieri importer sells to a Venetian buyer for 100₫ (earning 50₫ profit).</li>
                <li>The processor converts 100₫ materials into 130₫ prepared silk (value added: 30₫).</li>
                <li>The weaver transforms 130₫ prepared silk into 200₫ fabric (value added: 70₫).</li>
                <li>The retailer sells 200₫ fabric for 250₫ to end consumers (value added: 50₫).</li>
              </ul>
              <p className="mt-2">
                This value chain creates multiple business opportunities. You might specialize in one step or vertically integrate to capture more of the total value.
              </p>
            </div>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200">
              <h5 className="font-bold text-amber-900 mb-2">Economic Ripple Effects</h5>
              <p>
                Beyond direct participants, the silk trade creates broader economic impacts:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Dock workers earn wages unloading silk shipments</li>
                <li>Transporters move goods between workshops</li>
                <li>Tool makers supply specialized equipment to weavers</li>
                <li>Dye producers provide colorants for the fabrics</li>
                <li>Property owners collect rent from workshops and shops</li>
                <li>The Republic collects taxes at multiple points in the chain</li>
              </ul>
              <p className="mt-2">
                This interconnectedness means that changes in one sector ripple throughout the economy, creating the dynamic economic environment of La Serenissima.
              </p>
            </div>
          </div>
          
          <div className="mt-8 bg-gradient-to-r from-amber-100 to-amber-200 p-6 rounded-lg border border-amber-300">
            <h3 className="text-2xl font-serif text-amber-800 mb-4 text-center">Your Place in Venice's Economy</h3>
            
            <p className="text-amber-900 mb-4">
              La Serenissima's economic system offers unprecedented depth and authenticity. Unlike games with simplistic economies, every transaction here has meaning and ripple effects. Your economic decisions shape not just your own fortune, but the development of Venice itself.
            </p>
            
            <p className="text-amber-900 mb-4">
              Whether you choose to become a property magnate, master craftsman, trade merchant, or financier, your path to prosperity requires understanding these economic principles and applying them strategically.
            </p>
            
            <p className="text-amber-900 mb-6 font-medium text-center">
              The question is not whether you will participate in Venice's economy—but how you will make your mark upon it.
            </p>
            
            <div className="flex justify-center">
              <button className="px-6 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg flex items-center transition-colors">
                Begin Your Economic Journey
              </button>
            </div>
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

export default EconomicSystemArticle;
