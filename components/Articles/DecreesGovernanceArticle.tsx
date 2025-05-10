import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface DecreesGovernanceArticleProps {
  onClose: () => void;
}

const DecreesGovernanceArticle: React.FC<DecreesGovernanceArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Decrees & Governance in La Serenissima
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
            Shaping the Republic Through Political Influence
          </p>
          
          <p className="mb-4">
            In Renaissance Venice, laws and decrees weren't merely imposed from above—they emerged from a complex interplay of interests, influence, and institutions. As you rise in wealth and status within La Serenissima, you'll gain increasing opportunities to shape the very rules that govern the Republic.
          </p>
          
          <div className="my-8 flex justify-center">
            <svg width="700" height="400" viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg">
              {/* Background */}
              <rect x="0" y="0" width="700" height="400" fill="#fef3c7" stroke="#b45309" strokeWidth="2" rx="5" />
              
              {/* Title */}
              <text x="350" y="40" fontFamily="serif" fontSize="24" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Venetian Governance Structure</text>
              
              {/* The Great Council */}
              <rect x="200" y="70" width="300" height="60" fill="#f59e0b" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="105" fontFamily="serif" fontSize="20" fontWeight="bold" textAnchor="middle" fill="#7c2d12">The Great Council</text>
              <text x="350" y="125" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Nobili nobility only</text>
              
              {/* The Senate */}
              <rect x="250" y="160" width="200" height="50" fill="#fbbf24" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="190" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">The Senate</text>
              
              {/* The Collegio */}
              <rect x="275" y="240" width="150" height="50" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="270" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">The Collegio</text>
              
              {/* The Council of Ten */}
              <rect x="500" y="160" width="150" height="50" fill="#fbbf24" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="575" y="190" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Council of Ten</text>
              
              {/* The Doge */}
              <rect x="300" y="320" width="100" height="50" fill="#f59e0b" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="350" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">The Doge</text>
              
              {/* Guilds */}
              <rect x="50" y="160" width="150" height="50" fill="#fbbf24" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="125" y="190" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Guild Leadership</text>
              
              {/* Connecting lines */}
              <line x1="350" y1="130" x2="350" y2="160" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="210" x2="350" y2="240" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="290" x2="350" y2="320" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="130" x2="575" y2="160" stroke="#7c2d12" strokeWidth="2" />
              <line x1="200" y1="185" x2="250" y2="185" stroke="#7c2d12" strokeWidth="2" />
              
              {/* Player influence arrows */}
              <path d="M 125 210 Q 200 280 300 320" stroke="#059669" strokeWidth="2" strokeDasharray="5,3" fill="none" markerEnd="url(#arrowhead)" />
              <path d="M 125 160 Q 200 120 250 160" stroke="#059669" strokeWidth="2" strokeDasharray="5,3" fill="none" markerEnd="url(#arrowhead)" />
              
              {/* Arrow definition */}
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                        refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#059669" />
                </marker>
              </defs>
              
              {/* Legend */}
              <rect x="50" y="350" width="20" height="5" fill="#059669" />
              <text x="75" y="355" fontFamily="serif" fontSize="12" fill="#7c2d12">Player Influence Pathways</text>
            </svg>
          </div>
          
          <p className="mb-4">
            In La Serenissima, unlike traditional games where rules are fixed, the governance system itself is part of the gameplay. As players rise in wealth and status, they gain the ability to shape the very rules that govern the economic simulation. This meta-layer of gameplay creates a dynamic environment where successful merchants don't just operate within the system—they actively transform it to their advantage. The laws, regulations, and decrees that emerge from player actions become part of the evolving economic landscape, creating a truly player-driven experience where political influence is as valuable as economic power.
          </p>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Pathways to Political Influence</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Guild Leadership</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Historical Context</h5>
                <p className="text-amber-800">
                  Guilds in Venice weren't merely professional associations—they were powerful regulatory bodies with significant influence over their industries. Guild leaders (Gastaldi) could petition government bodies and shape policies affecting their trades.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Gameplay Implementation</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Excel in specific industries to rise to guild leadership positions</li>
                  <li>Propose industry regulations to the Senate as a guild leader</li>
                  <li>Form alliances with other guild leaders to increase approval chances</li>
                  <li>Balance benefits for guild members with costs imposed on non-members</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Example:</span> As head of the Glassmakers' Guild, you might propose a decree restricting the import of foreign glass to protect Murano's craftsmen, while simultaneously establishing quality standards that your workshops already meet.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Wealth-Based Access</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Historical Context</h5>
                <p className="text-amber-800">
                  While not officially part of governance, wealthy <i>cittadini</i> (non-noble citizens) often influenced policy through financial relationships and unofficial channels. Venice's pragmatic approach to governance meant that money could often speak as loudly as titles.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Gameplay Implementation</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Fund public works to gain favor with government officials</li>
                  <li>Offer loans to cash-strapped nobility in exchange for influence</li>
                  <li>Sponsor cultural or religious institutions to build reputation</li>
                  <li>Financially back political factions to secure favorable regulations</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Example:</span> By financing the renovation of the San Marco bell tower, you gain enough goodwill with the Procurators to secure their support for your proposal to develop a new commercial district on previously restricted land.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Political Mechanisms</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Proposal System</h4>
            
            <p className="text-amber-800 mb-4">
              The process of influencing Venetian governance follows a structured path that balances historical authenticity with engaging gameplay:
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="600" height="250" viewBox="0 0 600 250" xmlns="http://www.w3.org/2000/svg">
                {/* Background */}
                <rect x="0" y="0" width="600" height="250" fill="#fef3c7" stroke="#b45309" strokeWidth="2" rx="5" />
                
                {/* Process flow */}
                <rect x="50" y="50" width="100" height="60" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
                <text x="100" y="75" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Draft Proposal</text>
                <text x="100" y="95" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Define effects</text>
                
                <rect x="200" y="50" width="100" height="60" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
                <text x="250" y="75" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Gather Support</text>
                <text x="250" y="95" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Build alliances</text>
                
                <rect x="350" y="50" width="100" height="60" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
                <text x="400" y="75" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Formal Submission</text>
                <text x="400" y="95" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">To proper body</text>
                
                <rect x="500" y="50" width="100" height="60" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
                <text x="550" y="75" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Deliberation</text>
                <text x="550" y="95" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">& Voting</text>
                
                {/* Connecting arrows */}
                <line x1="150" y1="80" x2="200" y2="80" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead2)" />
                <line x1="300" y1="80" x2="350" y2="80" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead2)" />
                <line x1="450" y1="80" x2="500" y2="80" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrowhead2)" />
                
                {/* Success/Failure paths */}
                <rect x="450" y="160" width="100" height="40" fill="#059669" stroke="#047857" strokeWidth="2" rx="5" />
                <text x="500" y="185" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="white">Success</text>
                
                <rect x="300" y="160" width="100" height="40" fill="#ef4444" stroke="#b91c1c" strokeWidth="2" rx="5" />
                <text x="350" y="185" fontFamily="serif" fontSize="14" fontWeight="bold" textAnchor="middle" fill="white">Failure</text>
                
                <path d="M 550 110 Q 550 135 550 160" stroke="#059669" strokeWidth="2" markerEnd="url(#arrowhead3)" />
                <path d="M 550 110 Q 450 135 350 160" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowhead4)" />
                
                {/* Arrow definitions */}
                <defs>
                  <marker id="arrowhead2" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                  <marker id="arrowhead3" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#059669" />
                  </marker>
                  <marker id="arrowhead4" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                  </marker>
                </defs>
              </svg>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Initial Stage</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Formulate decree proposal with specific effects</li>
                  <li>System calculates cost, benefit, and feasibility</li>
                  <li>Required influence and support levels determined</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Support Gathering</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Secure guild support for industry regulations</li>
                  <li>Obtain merchant backing for trade proposals</li>
                  <li>Gain religious endorsement for social initiatives</li>
                  <li>Acquire noble patronage for major changes</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Formal Submission</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>The Collegio for initial review</li>
                  <li>The Senate for economic matters</li>
                  <li>The Council of Ten for security issues</li>
                  <li>The Great Council for major changes</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Deliberation & Voting</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>AI-driven deliberation with authentic concerns</li>
                  <li>Success probability based on influence and balance</li>
                  <li>Potential for compromise amendments</li>
                  <li>Final vote with real economic impacts</li>
                </ul>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Types of Player-Influenced Decrees</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Economic Decrees</h4>
              
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>
                  <span className="font-bold">Tax Adjustments:</span> Modify rates for specific goods or districts, potentially benefiting your own business interests while appearing to serve the public good.
                </li>
                <li>
                  <span className="font-bold">Trade Regulations:</span> Open or restrict trade with particular regions, creating advantages for merchants with established connections in favored areas.
                </li>
                <li>
                  <span className="font-bold">Guild Charters:</span> Grant special privileges to certain industries, such as exclusive manufacturing rights or quality certification authority.
                </li>
                <li>
                  <span className="font-bold">Price Controls:</span> Set minimum or maximum prices for essential goods, stabilizing markets or creating arbitrage opportunities.
                </li>
                <li>
                  <span className="font-bold">Citizen Subsidies:</span> The Republic automatically distributes 10% of its treasury daily to citizens, representing grain subsidies and public investments. Decrees can influence how these funds are allocated among different districts or social classes.
                </li>
              </ul>
              
              <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800">
                  <span className="font-bold">Example:</span> A decree establishing new quality standards for silk imports that happens to favor your existing supply chain while imposing costs on competitors who source from different regions.
                </p>
              </div>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Infrastructure Decrees</h4>
              
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>
                  <span className="font-bold">Building Permits:</span> Allow new construction in previously regulated areas, potentially increasing the value of strategically acquired land.
                </li>
                <li>
                  <span className="font-bold">Canal Improvements:</span> Fund dredging or bridge construction that improves access to your properties while serving public transportation needs.
                </li>
                <li>
                  <span className="font-bold">Public Works:</span> Establish new markets, wells, or civic buildings that enhance nearby property values and commercial activity.
                </li>
                <li>
                  <span className="font-bold">District Development:</span> Designate areas for specific purposes, such as luxury housing or industrial use, to align with your investment strategy.
                </li>
              </ul>
              
              <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800">
                  <span className="font-bold">Example:</span> Proposing a new bridge connecting an underdeveloped district (where you've quietly purchased land) to a prosperous commercial area, framed as reducing congestion elsewhere.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Social Decrees</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <ul className="list-disc pl-5 space-y-2 text-amber-800">
                  <li>
                    <span className="font-bold">Public Celebrations:</span> Organize festivals that boost economic activity in specific districts while enhancing your reputation.
                  </li>
                  <li>
                    <span className="font-bold">Religious Patronage:</span> Fund church construction or ceremonies that provide both spiritual and practical benefits to nearby communities.
                  </li>
                </ul>
              </div>
              
              <div>
                <ul className="list-disc pl-5 space-y-2 text-amber-800">
                  <li>
                    <span className="font-bold">Educational Initiatives:</span> Establish specialized schools or academies that train workers in skills beneficial to your enterprises.
                  </li>
                  <li>
                    <span className="font-bold">Public Health Measures:</span> Implement quarantine or sanitation requirements that demonstrate civic responsibility while potentially disrupting competitor operations.
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Example:</span> Sponsoring a festival honoring the patron saint of glassmakers that brings visitors to Murano (where your workshops are located) while reinforcing the prestige of your guild.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Consequences & Implementation</h3>
          
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Decree Effects</h4>
              
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>Successful decrees create real economic impacts throughout the game world</li>
                <li>Effects can be temporary or permanent depending on the decree's nature</li>
                <li>Scale of impact proportional to difficulty of passage</li>
                <li>Both intended and unintended consequences possible</li>
              </ul>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Reputation Impacts</h4>
              
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>Success or failure affects standing with different factions</li>
                <li>Track record influences future proposal reception</li>
                <li>Balanced or self-serving decree history affects social standing</li>
                <li>Possible backlash for overly self-serving proposals</li>
              </ul>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Complex Interplay</h4>
              
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>Decrees interact with existing economic systems</li>
                <li>Players can collaborate or compete through political process</li>
                <li>AI citizens and businesses respond to changing regulations</li>
                <li>Emergent economic patterns from regulatory changes</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Historical Authenticity Balance</h4>
            
            <p className="text-amber-800 mb-4">
              La Serenissima's governance system carefully balances historical authenticity with engaging gameplay:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Authentic Elements</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Reflects Venice's oligarchic nature where wealth and connections matter</li>
                  <li>Preserves the multi-layered approval process</li>
                  <li>Shows tension between noble political power and merchant economic influence</li>
                  <li>Captures the pragmatic, stability-focused Venetian approach to governance</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Gameplay Considerations</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Allows meaningful player agency while maintaining appropriate barriers</li>
                  <li>Provides clear feedback on proposal viability before major investment</li>
                  <li>Creates strategic depth beyond simple economic gameplay</li>
                  <li>Enables players to shape the rules of the game world as they rise in stature</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: The Art of Venetian Politics</h3>
            <p className="mb-4 text-amber-800">
              In La Serenissima, as in historical Venice, political influence is rarely direct or simple. The most successful players will master the subtle art of advancing personal interests while appearing to serve the common good—finding the balance between ambition and restraint that characterized Venice's remarkable political stability.
            </p>
            <p className="mb-4 text-amber-800">
              By participating in the governance system, you're not merely playing within the economic simulation—you're helping to shape it, creating ripple effects that transform the game world and the opportunities available to all players.
            </p>
            <p className="text-amber-800">
              As the old Venetian saying goes: <span className="italic">"Prima Veneziani, poi Cristiani"</span> (First Venetians, then Christians). In governance as in all things, the prosperity and stability of the Republic must appear to come first—even when your own interests are cleverly woven into its fabric.
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

export default DecreesGovernanceArticle;
