import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface StrategiesArticleProps {
  onClose: () => void;
}

const StrategiesArticle: React.FC<StrategiesArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            20 Strategies to Get Ahead in Serenissima
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
            Understanding Serenissima's Closed Economic System
          </p>
          
          <p className="mb-4">
            La Serenissima operates as a closed economic system where all value circulates between players and AI-controlled entities. Unlike traditional games where resources spawn infinitely, the economy of Venice functions as a zero-sum game in many respects - wealth must be captured rather than created from nothing.
          </p>
          
          <p className="mb-4">
            The fundamental principle to understand is that each economic cycle represents an opportunity to increase your share of the total economic value in the system. When ducats change hands, they don't disappear - they simply move from one participant to another. Your goal is to position yourself to capture more value with each turn of the economic wheel.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #1: Location, Location, Location</h3>
            <p>
              In Venice, perhaps more than anywhere else, the value of property is determined by its location. A small shop on the Grand Canal will generate far more income than a large warehouse in the outer districts. When purchasing land, prioritize central locations and water access over size.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #2: Diversify Your Holdings</h3>
            <p>
              The wisest Venetian merchants never rely on a single source of income. Spread your investments across different districts, building types, and economic activities. This protects you from localized economic downturns and allows you to capitalize on opportunities in multiple sectors.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #3: Control Transportation Networks</h3>
            <p>
              Roads and docks are the lifeblood of commerce. Properties connected to efficient transportation networks command higher rents and facilitate more trade. However, there's a deeper strategic element: controlling multiple adjacent land parcels allows you to influence the flow of goods throughout Venice.
            </p>
            <p className="mt-2">
              <span className="font-medium">Advanced tactic:</span> By strategically acquiring land that forms natural chokepoints, you can effectively blockade parts of Venice from ground transportation. This forces competitors to rely on more expensive water transportation, increasing their costs while your own goods flow freely. Be cautious though—this strategy can backfire if rival merchant families unite against you or employ the same tactics in areas where you need access.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #4: Manipulate Supply Chains</h3>
            <p>
              Every finished product in Venice requires raw materials and processing. Study the resource system to identify bottlenecks in supply chains. Controlling key points in popular production chains can be more profitable than owning the final production facility.
            </p>
            <p className="mt-2">
              <span className="font-medium">Advanced tactic:</span> Identify which resources have the fewest sources, then secure those sources before competitors realize their importance. For example, if a particular dye comes from only two locations, controlling both gives you pricing power over the entire textile industry. This "resource bottleneck" strategy is less visible than land blockades but often more profitable.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #5: Form Strategic Partnerships</h3>
            <p>
              Venice's economy rewards cooperation. Form alliances with complementary businesses to create efficient supply chains. A glassmaker partnered with a sand supplier and a luxury merchant will outperform isolated competitors.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #6: Invest in Luxury Production</h3>
            <p>
              Luxury goods like Venetian glass, fine textiles, and spice blends command the highest profit margins. While they require more complex supply chains, the returns justify the investment. A single successful luxury workshop can outperform multiple basic production facilities.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #7: Monitor Market Fluctuations</h3>
            <p>
              Prices in Serenissima fluctuate based on supply and demand. Keep track of price trends and adjust your production accordingly. Sometimes holding inventory until prices rise can be more profitable than immediate sales.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #8: Leverage Banking and Loans</h3>
            <p>
              The banking system allows you to expand faster than your current capital would permit. Take calculated loans to acquire prime real estate or establish profitable businesses before competitors can act. Just ensure your new ventures will generate enough income to cover loan payments.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #9: Build Vertically</h3>
            <p>
              Land in Venice is scarce, so successful merchants build upward. Multi-story buildings generate more rent per square meter of land. Upgrade your properties to maximize their capacity and income potential.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #10: Cultivate Political Connections</h3>
            <p>
              In Venice, commerce and politics are inseparable. Cultivate relationships with the Council of Ten and other governing bodies. Political favor can lead to preferential treatment in contracts, tax benefits, and advance notice of economic policy changes.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #11: Focus on High-Traffic Areas</h3>
            <p>
              Retail businesses thrive on foot traffic. Establish shops near landmarks, major bridges, and busy squares. The additional rent for these locations is offset by increased customer volume and higher sales.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #12: Strategic Infrastructure Investment</h3>
            <p>
              Public works like bridges, wells, and piazzas increase property values in their vicinity. Contributing to infrastructure development can raise the value of your existing holdings while improving your standing with local authorities.
            </p>
            <p className="mt-2">
              <span className="font-medium">Advanced tactic:</span> Propose and fund infrastructure projects that disproportionately benefit your properties while appearing to serve the public good. A bridge that connects your commercial district to a major market creates value for you while earning political goodwill. Conversely, oppose infrastructure that would benefit rivals by suggesting alternative projects that better "serve the Republic."
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #13: Anticipate Seasonal Patterns</h3>
            <p>
              Venice's economy follows seasonal patterns tied to festivals, trade winds, and agricultural cycles. Plan your investments to capitalize on these predictable fluctuations, building inventory before demand peaks.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #14: Specialize in Rare Resources</h3>
            <p>
              Some resources are naturally scarce in the Venetian lagoon. Controlling access to rare materials like certain dyes, metals, or exotic imports can create lucrative monopolies or near-monopolies.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #15: Balance Short and Long-Term Investments</h3>
            <p>
              Maintain a portfolio of both quick-return ventures and long-term appreciating assets. Trade and manufacturing provide immediate income, while prime real estate appreciates over time, building lasting wealth.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #16: Establish Trade Routes</h3>
            <p>
              Formalized trade routes between production centers and markets increase efficiency and profitability. Invest in creating optimized paths for goods to flow through the city, reducing transportation costs and time.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #17: Maintain Liquid Reserves</h3>
            <p>
              Always keep a portion of your wealth in liquid form (cash). This allows you to capitalize on sudden opportunities or weather unexpected economic challenges without selling valuable assets at unfavorable prices.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #18: Invest in Aesthetic Improvements</h3>
            <p>
              In Venice, beauty has economic value. Buildings with artistic elements command higher rents and attract wealthier clients. Commissioning artwork, ornate facades, and elegant interiors for your properties increases their prestige and profitability.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #19: Study Historical Patterns</h3>
            <p>
              Venice's economy follows historical patterns that repeat over time. Study these cycles to anticipate future trends. Those who understand history gain a significant advantage in predicting market movements.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #20: Build Your Family Legacy</h3>
            <p>
              The greatest Venetian fortunes were built across generations. Think beyond immediate profits to create lasting economic structures that will continue to generate wealth over time. Your family name and reputation are assets that appreciate with wise stewardship.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #21: Competitive Isolation</h3>
            <p>
              In Venice's closed economic system, sometimes limiting your competitors' options is as valuable as expanding your own. Study the geographic and economic connections between rival merchant families to identify their vulnerabilities.
            </p>
            <p className="mt-2">
              <span className="font-medium">Advanced tactic:</span> If a rival family specializes in glassmaking, acquiring the land between their workshops and their sand suppliers forces them to navigate around your territory, increasing their costs. Similarly, purchasing key waterfront properties can deny dock access to competitors, making their shipping operations more expensive and time-consuming. Remember that such aggressive tactics will likely trigger retaliation, so secure your own supply lines first.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #22: Form Strategic Alliances</h3>
            <p>
              No single family, no matter how wealthy, can control all of Venice. Identifying potential allies whose interests complement rather than compete with yours is essential for long-term success.
            </p>
            <p className="mt-2">
              <span className="font-medium">Advanced tactic:</span> Create mutually beneficial arrangements with other families to counter common rivals. If another merchant family is being blockaded by a competitor, offer them access through your lands in exchange for favorable trade terms or support in the Council. These alliances can shift as circumstances change—the family you help today may become a rival tomorrow, but the political capital you gain will remain valuable.
            </p>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: The Venetian Approach</h3>
            <p className="mb-4">
              The most successful merchants of Venice understood that true wealth comes not from a single venture but from creating systems that generate ongoing value. By applying these strategies in combination, you can build an economic empire that captures an ever-increasing share of La Serenissima's prosperity.
            </p>
            <p>
              Remember that in a closed economic system, your gain often comes at another's expense. Act with strategic precision, and may your family name be recorded among the greatest in Venetian history.
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

export default StrategiesArticle;
