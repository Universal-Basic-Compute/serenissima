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
            The Patrician's Guide to Land Ownership
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
            In La Serenissima, land is the foundation of all wealth. Unlike other resources that flow through the economy, land is fixed and finite—especially in our island republic where every square meter is precious. As a landowner, you hold the keys to the most fundamental asset in Venice. This guide will help you maximize the value and strategic advantage of your holdings.
          </p>
          
          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-3">Understanding the Venetian Land Economy</h3>
            <p className="mb-3">
              Land in Venice is not merely property—it is power. The closed economic system of La Serenissima means that wealth must be captured rather than created from nothing. As a landowner, you stand at the beginning of the economic cycle:
            </p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>You lease LAND for the construction of BUILDINGS</li>
              <li>BUILDINGS house BUSINESSES and provide living space</li>
              <li>BUSINESSES transform raw materials into valuable RESOURCES</li>
              <li>RESOURCES provision both Players and AI Citizens</li>
              <li>Players & Citizens pay rent, completing the cycle back to LAND</li>
            </ol>
            <p className="mt-3 italic">
              "He who controls the land controls the flow of wealth." — Venetian proverb
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Strategic Lease Pricing</h3>
          
          <p className="mb-4">
            As a landowner, setting the right lease price is perhaps your most powerful economic tool. Different pricing strategies serve different goals:
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">High Lease Price Strategies</h4>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Exclusivity and Prestige</h5>
              <p>
                Setting high prices creates exclusive neighborhoods that attract only the wealthiest merchants. This enhances the prestige of your property and surrounding areas, creating a virtuous cycle of increasing value. High-end businesses catering to wealthy clientele will pay premium rates for locations in these districts.
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
              <h5 className="font-bold text-amber-900">Strategic Resource Control</h5>
              <p>
                If your land contains or provides access to valuable resources, high pricing can create bottlenecks in supply chains. This gives you leverage over entire industries that depend on those resources, allowing you to extract premium rates from those who have no choice but to pay.
              </p>
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
              <h5 className="font-bold text-amber-900">Market Penetration</h5>
              <p>
                Undercutting competing landowners can attract tenants away from them, allowing you to gain market share in competitive districts. This creates price pressure on rival landowners and can force them to lower their own prices or lose tenants, weakening their economic position.
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
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Temporal Strategies</h5>
              <p>
                Start with low prices to attract initial tenants, then gradually increase rates as an area becomes more developed. Implement seasonal pricing to reflect changing economic conditions, or offer introductory rates with scheduled increases to lock in tenants while ensuring growing returns.
              </p>
            </div>
            
            <div className="mb-3">
              <h5 className="font-bold text-amber-900">Conditional Leasing</h5>
              <p>
                Tie lease prices to business performance with percentage-based components. Offer lower base rates with profit-sharing arrangements to align your interests with your tenants. This creates incentives for tenants to maximize their own profits, which in turn increases your income.
              </p>
            </div>
            
            <div>
              <h5 className="font-bold text-amber-900">Geographic Monopoly Building</h5>
              <p>
                Use low prices in strategic areas to gain control of entire districts, then gradually increase prices once your monopoly is established. Create "loss leader" properties that drive traffic to your higher-priced properties, and develop transportation choke points with differential pricing on either side.
              </p>
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
            
            <p>
              These alliances can shift as circumstances change—the family you help today may become a rival tomorrow, but the political capital you gain will remain valuable.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Infrastructure Investment</h4>
            
            <p className="mb-3">
              Propose and fund infrastructure projects that disproportionately benefit your properties while appearing to serve the public good. A bridge that connects your commercial district to a major market creates value for you while earning political goodwill.
            </p>
            
            <p>
              Conversely, oppose infrastructure that would benefit rivals by suggesting alternative projects that better "serve the Republic." The appearance of civic-mindedness can mask strategic economic maneuvering.
            </p>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: The Long Game</h3>
            <p className="mb-4">
              Land ownership in Venice is not merely about collecting rent—it is about shaping the economic landscape of the Republic to your advantage. The most successful patrician families think in terms of decades, not days.
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
