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
            10 Cunning Strategies for Venetian Power
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
            The Art of Influence in La Serenissima
          </p>
          
          <p className="mb-4">
            In Renaissance Venice, true power was rarely achieved through direct means. The most successful nobili understood that manipulation of people, systems, and perceptions was far more effective than brute economic force. This guide reveals the subtle arts of influence that transformed ordinary merchants into the power brokers of the Most Serene Republic.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #1: Cultivate a Network of Contract Intelligence</h3>
            <p>
              Information is the most valuable currency in Venice, even more precious than $COMPUTE. Establish relationships with dock workers, contract vendors, and guild members who can provide advance notice of resource shipments, price fluctuations, or upcoming decree proposals before they become public knowledge.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Invest in regular small gifts and favors rather than one-time large payments. A dock worker who receives a modest but reliable stipend will alert you to valuable shipments for months, giving you first access to critical resources when they arrive.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> The Contarini family maintained a network of informants among customs officials, allowing them to know precisely when competitors' shipments would arrive. By positioning their agents at key docks, they could purchase raw materials before competitors even knew they had arrived, securing advantageous positions in the glass and textile contracts.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #2: Master the Art of Strategic Alliances</h3>
            <p>
              In Venice, business partnerships are rarely just about commerce—they're about creating alliances, securing access to new resources, and consolidating influence. Form partnerships with players who control complementary assets or skills. A strategic alliance can open doors that remain firmly closed to even the wealthiest solo merchants.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Look beyond immediate financial gain when forming partnerships. An alliance with a player who controls key transportation routes but has modest wealth may prove more valuable than one with a wealthy player who lacks strategic assets. Map out potential alliances based on what specific advantages they bring—access to rare resources, control of critical docks, or influence with particular guilds.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> When seeking business partners, investigate which players control resources you need. If your glassmaking workshop requires reliable sand supplies, an alliance with a player who controls the transportation routes from the lagoon islands could reduce your costs significantly while simultaneously blocking competitors from the same advantage.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #3: Create Dependency Through Strategic Lending & Influence</h3>
            <p>
              The Venetian saying "debtors make the most reliable allies" reveals a fundamental truth: those who owe you become instruments of your will. Use the loan system to offer Ducats or $COMPUTE to promising merchants, struggling landowners, or ambitious guild members. This not only generates interest but can also be a source of Influence if the loan is seen as a generous act or helps a key figure. A debtor might support your decree proposals, share contract information, or grant favorable trade terms.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Structure loans to maximize dependency or gain Influence. Offer generous terms initially, then use refinancing opportunities to extract non-monetary concessions or convert gratitude into spendable Influence. For example, forgiving a portion of a debt for a key council member could directly translate into Influence points or secure their vote.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> The Pisani banking family rarely called in loans to members of the Council of Ten. Instead, they maintained these debts as leverage. In La Serenissima, you can use loans to create obligated allies or directly spend Influence to ensure support for your decree proposals and business ventures.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #4: Manipulate Public Perception & Accumulate Influence Through Infrastructure Investment</h3>
            <p>
              In Venice, reputation and Influence were as valuable as gold. Strategic investment in roads, bridges, and public works with Ducats can generate significant Influence and create an image of civic virtue. Fund projects that enhance your public image while benefiting your business interests—a bridge improving access to your properties, a dock near your warehouse, or roads connecting your workshops to key contracts.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Ensure your infrastructure investments are visible and appear motivated by civic duty. The Influence gained can then be spent on political maneuvers. Place your buildings strategically around these improvements, and time major projects to coincide with periods when you need political support, using your accumulated Influence to push decrees.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> When seeking approval for a controversial decree, first invest Ducats in a new bridge, earning Influence. Then, spend this Influence to ensure Council members support your proposal, leveraging both the goodwill and the direct power of Influence.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #5: Divide and Rule Your Competitors</h3>
            <p>
              Direct confrontation with business rivals is rarely the optimal strategy in La Serenissima's closed economy. Instead, work to create divisions among your competitors by selectively sharing information, exploiting existing tensions, and forming temporary alliances. When rivals are busy fighting each other, they have fewer resources to challenge your interests.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Identify natural fault lines among competitor groups—differences in production methods, geographic focus, or guild affiliations. Subtly exacerbate these divisions through strategic information sharing. For example, ensure one competitor learns that another is planning to expand into their territory, or hint to one guild member that another is seeking regulatory changes that would harm their business.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> When three glassmaking workshops dominated the Murano trade, the Barovier family maintained their position by subtly encouraging disputes between their two larger rivals. They would share "confidential" information with each about the other's plans to expand into new techniques or contracts, creating an atmosphere of suspicion that prevented the larger workshops from cooperating to squeeze out smaller producers. Meanwhile, the Baroviers secured exclusive access to critical sand supplies.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #6: Control Guild Leadership Through Influence</h3>
            <p>
              Indirect power—controlling those who make guild regulations—is often more valuable. Position yourself or loyal allies in guild leadership. This may require spending Influence to win elections or gain appointments. These positions allow you to shape regulations that favor your production methods while creating barriers for competitors.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Identify promising guild members and support their advancement by spending Influence on their campaigns or by bestowing favors that translate to Influence. Ensure they understand their role is to subtly advance your interests.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> Rather than proposing industry regulations yourself (which might cost Influence), spend Influence to install a loyal guild leader. They can then present regulations as quality standards, prioritizing those favorable to you, and provide advance notice of changes.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #7: Create Leverage Through Transportation Control</h3>
            <p>
              In Venice's complex urban environment, controlling key transportation infrastructure creates power disproportionate to the $COMPUTE investment required. Strategic placement of docks, roads, and bridges allows you to influence entire industries by controlling their essential supply routes. This physical leverage can be converted into economic and political advantage.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Map the critical transportation routes that your competitors rely upon, then systematically build infrastructure at strategic chokepoints. A dock at a canal intersection may seem like a modest investment, but if it provides the only efficient access to a commercial district, controlling it gives you leverage over all businesses in that area.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> The Dandolo family built several small but strategically positioned docks near the Rialto contract. Rather than charging excessive fees, they provided preferential access and favorable terms to allies while creating "unfortunate delays" for competitors. This subtle approach avoided accusations of unfair practices while effectively handicapping rival merchants during crucial contract periods. By controlling these transportation nodes, they influenced the flow of goods throughout the district.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #8: Weaponize Decree Proposals with Influence</h3>
            <p>
              Venice's governance system allows for decree proposals that can reshape economic regulations. Craft decree proposals and spend Influence to ensure their passage. This allows you to create rules that favor your production methods, building types, or business model while disadvantaging competitors.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Study your advantages and competitors' vulnerabilities. Craft decree proposals that institutionalize your strengths. Spend Influence to submit the proposal, gather support, and sway votes in the councils. If your glassworks has superior sand, propose quality standards requiring it, and use Influence to pass the decree.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> Frame "consumer protection" standards that require expensive retooling for competitors but minimal changes for you. Spend Influence to present these as civic-minded reforms. The decree system, fueled by Influence, allows you to institutionalize your advantages.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #9: Master the Art of Beneficial Crisis</h3>
            <p>
              The ancient wisdom that one should "never waste a good crisis" finds its perfect expression in Venetian economics. Skilled operators recognize that disruptions—whether resource shortages, transportation blockages, or contract fluctuations—create opportunities to reshape systems to their advantage while appearing to act for the common good.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Prepare contingency plans for likely crises in your industry by stockpiling key resources or maintaining reserve $COMPUTE. When disruption occurs, be the first to propose "solutions" that address the immediate problem while subtly advancing your long-term interests. The chaos and urgency of crisis situations reduce scrutiny of the secondary effects of proposed remedies.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> During a glass material shortage caused by disrupted transportation routes, the Mocenigo family—who had presciently stockpiled sand and other raw materials in their warehouses—proposed new regulations requiring all Venetian glass products to meet higher quality standards "to maintain Venice's reputation during the shortage." This seemingly responsible measure allowed them to sell their stockpiles at premium prices while forcing competitors who relied on lower-grade materials either to buy from them or cease production entirely.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #10: Strategic Building Placement</h3>
            <p>
              In La Serenissima's property-based economy, the strategic placement of buildings can create powerful economic advantages. Different building types serve different functions, and their placement relative to resources, transportation networks, and contracts can dramatically affect their value and utility.
            </p>
            <p className="mt-2">
              <span className="font-medium">Implementation:</span> Study the map carefully before placing any building. Consider not just the immediate benefits of a location but how it fits into your broader strategy. Position workshops near resource sources, warehouses near transportation hubs, and luxury shops along high-traffic routes. Create clusters of complementary buildings that enhance each other's effectiveness.
            </p>
            <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Application:</span> The Barbarigo family dominated the luxury textile trade not through superior products but through masterful building placement. They positioned their workshops near wool and silk suppliers, built warehouses with direct dock access for efficient shipping, and placed their retail shops along the Grand Canal where wealthy customers naturally congregated. This integrated approach reduced their transportation costs while maximizing customer access, allowing them to undercut competitors while maintaining higher profit margins.
              </p>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">The Ultimate Strategy: Layered Power</h3>
            <p className="mb-4 text-amber-800">
              The most successful Venetian operators understood that true influence comes not from applying these strategies individually but from layering them in complementary ways. Your contract intelligence network identifies opportunities that your strategic alliances help you exploit. Your transportation control creates leverage that your decree influence magnifies. Your infrastructure investments build goodwill that your crisis management converts to concrete advantage.
            </p>
            <p className="mb-4 text-amber-800">
              This layered approach creates power structures that are difficult to recognize, let alone challenge. While flamboyant displays of wealth might provoke envy and opposition, subtle networks of influence operate beneath notice until they become too entrenched to dismantle.
            </p>
            <p className="text-amber-800">
              Remember the unofficial motto of Venice's most effective power brokers: <span className="italic">"Videri quam esse"</span>—"To seem rather than to be." Let others accumulate the most $COMPUTE while you control the true levers of power. Let others engage in visible contract competition while you quietly shape the economic environment in which those contracts operate. Let others believe they are making independent decisions while you control the infrastructure, resources, and regulations that determine their options.
            </p>
            <p className="text-amber-800 mt-4">
              In La Serenissima, the most dangerous player is not the one with the most obvious wealth, but the one whose influence remains invisible until it is too late to counter.
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
