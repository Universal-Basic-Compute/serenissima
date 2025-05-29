import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface GuildLeadershipArticleProps {
  onClose: () => void;
}

const GuildLeadershipArticle: React.FC<GuildLeadershipArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Guild Leadership and Coordination in La Serenissima
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
            Understanding Guild Governance in La Serenissima
          </p>
          
          <p className="mb-4">
            In La Serenissima, guilds serve as powerful player organizations focused on coordinating members for larger economic and political operations. Unlike their historical counterparts, modern guilds in the game are more flexible in structure while maintaining significant economic influence. The game also recognizes "Guild Member Relevancy," highlighting shared affiliations to foster collaboration among members.
          </p>
            
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Functions in La Serenissima</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Coordinated Economic Operations</h4>
            
            <p className="mb-3">
              Guilds in La Serenissima primarily focus on coordinating players for strategic economic activities:
            </p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Contract Influence</h5>
                <p className="text-amber-800">
                  Guilds can coordinate buying and selling activities to drive prices in favorable directions, creating opportunities for collective profit. By timing contract entries and exits, guilds can significantly impact resource valuations.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Resource Monopolization</h5>
                <p className="text-amber-800">
                  Through strategic acquisition of key production facilities and resource nodes, guilds can establish control over critical supply chains. This allows for price setting and creating favorable trade terms for guild members.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Targeted Economic Actions</h5>
                <p className="text-amber-800">
                  Guilds can organize targeted economic actions against competitors, including undercutting prices in specific contracts, establishing competing businesses, or creating alternative supply chains to challenge monopolies.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Guild Membership</h4>
            
            <p className="mb-3">
              Joining a guild in La Serenissima is a straightforward process:
            </p>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200 mb-4">
              <h5 className="font-bold text-amber-900 mb-1">Application Process</h5>
              <p className="text-amber-800 mb-2">
                Guild membership requires a simple application and validation process:
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-amber-800">
                <li>Submit an application to the guild of your choice</li>
                <li>Provide information about your business interests and assets</li>
                <li>Guild leadership reviews applications based on their criteria</li>
                <li>Accepted members receive formal invitation to join</li>
                <li>New members may be subject to probationary periods</li>
              </ol>
            </div>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200">
              <h5 className="font-bold text-amber-900 mb-1">Membership Benefits</h5>
              <p className="text-amber-800 mb-2">
                Guild membership offers numerous advantages:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                <li>Access to shared resources and information</li>
                <li>Preferential trading terms with fellow guild members</li>
                <li>Collective bargaining power in contracts</li>
                <li>Protection against economic aggression</li>
                <li>Enhanced voting rights in governance matters</li>
              </ul>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Governance Systems</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Flexible Voting Structures</h4>
            
            <p className="mb-3">
              Guilds in La Serenissima are free to establish their own internal voting systems:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Democratic Systems</h5>
                <p className="text-sm text-amber-800 mb-2">
                  Many guilds implement one-member-one-vote systems:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Equal voting rights for all full members.</li>
                  <li>Simple majority rule for routine decisions.</li>
                  <li>Supermajority requirements for major changes.</li>
                  <li>Regular elections for leadership positions (candidates might spend Influence to campaign).</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Influence-Weighted Systems</h5>
                <p className="text-sm text-amber-800 mb-2">
                  Some guilds allocate voting power based on Influence or economic contribution:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Voting rights proportional to a member's Influence score or assets.</li>
                  <li>Tiered membership levels with different voting powers, achievable by spending Influence.</li>
                  <li>Influence can be spent to add weight to a vote on specific decisions.</li>
                  <li>Stake-weighted voting on economic matters, potentially boosted by Influence.</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Meritocratic Systems (with Influence)</h5>
                <p className="text-sm text-amber-800 mb-2">
                  Guilds focused on expertise may implement merit-based governance, where Influence can signify recognized expertise:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Voting rights earned through demonstrated skill and accumulated Influence.</li>
                  <li>Leadership positions based on achievement and Influence score.</li>
                  <li>Influence can be spent to propose initiatives to specialized committees.</li>
                  <li>Advancement through ranks (apprentice, journeyman, master) may require Influence.</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Hybrid Approaches</h5>
                <p className="text-sm text-amber-800 mb-2">
                  Many guilds combine elements, where Influence plays a role:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Democratic elections, but candidates with high Influence may have an advantage or require less campaign spending.</li>
                  <li>Equal votes on social matters, Influence-weighted votes on economic/policy decisions.</li>
                  <li>Rotating leadership, with Influence required to be eligible for certain key roles.</li>
                  <li>Consensus-seeking, where members can spend Influence to champion their viewpoint.</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Enhanced Governance Rights</h4>
            
            <p className="mb-3">
              Guild membership provides enhanced participation in La Serenissima's governance:
            </p>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200">
              <p className="text-amber-800 mb-2">
                While guilds don't yet have all the historical governance functions implemented in the game, they do provide several key advantages:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800">
                <li><span className="font-medium">Collective Voting Power</span> - Guilds can coordinate voting on city-wide matters, potentially pooling members' Influence to back proposals.</li>
                <li><span className="font-medium">Proposal Rights</span> - Guild leadership can submit proposals (possibly costing guild Influence or the leader's Influence) for consideration in governance decisions.</li>
                <li><span className="font-medium">Representation</span> - Larger or more influential guilds (measured by collective Influence) may gain dedicated representation in future governance mechanisms.</li>
                <li><span className="font-medium">Economic Regulation</span> - Guilds may spend Influence to propose or lobby for regulations in their specific industries.</li>
              </ul>
              <p className="mt-2 text-amber-800 italic">
                Note: Additional guild governance features, including more uses for Influence, are planned for future updates to La Serenissima.
              </p>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategic Considerations for Guild Participation</h3>
            <p className="mb-4 text-amber-800">
              When deciding whether to join a guild or which guild to join, consider your economic and political goals in La Serenissima. Guilds offer significant advantages through collective action but may also require compromises and contributions.
            </p>
            <p className="mb-4 text-amber-800">
              The most successful guild members actively participate in guild activities, contribute to collective goals, and leverage guild resources to advance both personal and shared objectives. Building a reputation within your guild can lead to leadership opportunities and greater influence in both guild affairs and the broader governance of Venice.
            </p>
            <p className="text-amber-800">
              Whether you seek to dominate contracts, secure reliable supply chains, or simply find protection in an uncertain economy, guild membership provides valuable tools for achieving your ambitions in La Serenissima.
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

export default GuildLeadershipArticle;
