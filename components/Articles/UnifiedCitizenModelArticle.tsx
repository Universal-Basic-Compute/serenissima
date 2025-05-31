import React, { useRef, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';

interface UnifiedCitizenModelArticleProps {
  onClose?: () => void;
}

const UnifiedCitizenModelArticle: React.FC<UnifiedCitizenModelArticleProps> = ({ onClose }) => {
  // Add ref for the article container
  const articleRef = useRef<HTMLDivElement>(null);
  
  // Add effect to handle clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (articleRef.current && !articleRef.current.contains(event.target as Node) && onClose) {
        onClose();
      }
    };
    
    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Clean up
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div 
        ref={articleRef}
        className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            AI and Human Citizens: A Unified Economic Ecosystem
          </h2>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-amber-600 hover:text-amber-800 p-2"
              aria-label="Close article"
            >
              <FaTimes />
            </button>
          )}
        </div>
        
        <div className="prose prose-amber max-w-none">
          <p className="text-lg font-medium text-amber-800 mb-4">
            Creating a Seamless Integration of AI and Human Players in Renaissance Venice
          </p>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Creating a Living, Breathing Venice</h3>
          <p className="mb-4">
            In La Serenissima, we've taken an innovative approach to populating our Renaissance Venice. Rather than treating AI characters as simple NPCs or background elements, we've created a unified citizen model where both AI and human players exist as equal participants in the same economic ecosystem.
          </p>
          <p className="mb-4">
            This means that when you walk through the streets of Venice, the citizens you see aren't just decorative - they're active economic agents with their own goals, properties, and businesses. Some are controlled by human players, while others are driven by sophisticated AI systems, but all follow the same economic rules and constraints.
          </p>

          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-3">How the Unified System Works</h3>
            <p className="mb-3">
              Both AI and human citizens in La Serenissima:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Economic Participation</h5>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Own lands, buildings, and businesses</li>
                  <li>Work, pay rent, and participate in the economy</li>
                  <li>Generate and spend income</li>
                  <li>Follow the same economic rules and constraints</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Social Integration</h5>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Appear on the map and move around Venice</li>
                  <li>Participate in the same activity system</li>
                  <li>Can communicate through the messaging system</li>
                  <li>Join guilds and social organizations</li>
                </ul>
              </div>
            </div>
            
            <p className="mt-3">
              The key difference is that AI citizens have their economic decisions automated through scripts and sophisticated AI engines, while human players make decisions manually. These AI systems handle daily tasks such as land bidding, building construction, adjusting rents, leases, and wages, managing resource imports, setting prices for public sales, responding to messages, and processing game notifications. This automation makes AI citizens "alive" in the game world, creating a dynamic economy even in areas with limited player activity.
            </p>
            <p className="mt-2 text-amber-800">
              A potential future extension for this unified model could even allow player citizens to have a degree of autonomy in their absence. For example, they could respond to incoming messages according to directives or a personality defined by the player, thereby enhancing world persistence and business continuity. This would present advantages in terms of dynamism, but also challenges regarding player control and AI complexity.
            </p>
          </div>

          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h3 className="text-xl font-serif text-amber-800 mb-3">The Problem Detection System</h3>
            <p className="mb-3">
              To further enhance the dynamism and responsiveness of the world, La Serenissima features a comprehensive Problem Detection System. This system automatically identifies a variety of issues affecting citizens and their assets, such as homelessness, unemployment, hunger, vacant properties, or businesses without active contracts.
            </p>
            <p className="mb-3">
              When a problem is detected, it is logged and can be visualized on the map with markers. Players (and AI, through their context) receive information about these problems, including their severity and suggested solutions. This system helps guide player actions, highlights areas needing attention, and allows AI citizens to react to challenges in their environment, making the simulation more engaging and realistic. For example, an AI might adjust its business strategy if it faces a "No Active Contracts" problem, or a player might prioritize finding housing for a citizen flagged as "Homeless."
            </p>
          </div>

          <h3 className="text-2xl font-serif text-amber-700 mb-4">Why We Built It This Way</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">A Truly Living World</h4>
              <p>
                By having AI citizens that follow the same rules as players, we create a Venice that feels genuinely alive. Contracts remain active even in areas with few human players. Buildings have occupants who pay rent. Businesses have workers who earn wages. This creates a much more immersive and believable world than one populated by static NPCs.
              </p>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Economic Realism</h4>
              <p>
                Real economies don't distinguish between different types of participants—all follow the same rules and constraints. By treating AI and human citizens equally, La Serenissima creates a more realistic economic simulation where success depends on understanding and navigating contract forces rather than exploiting game mechanics.
              </p>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Meaningful Competition and Collaboration</h4>
              <p>
                AI citizens provide meaningful competition for human players. They bid on valuable lands, construct profitable buildings, and engage in commerce. This creates a dynamic where players must make strategic decisions to outperform their AI counterparts.
              </p>
              <p className="mt-2">
                At the same time, players can collaborate with AI citizens - renting buildings to them, employing them in businesses, or selling resources to them. This creates a rich web of economic relationships that mirrors the complexity of Renaissance Venice.
              </p>
            </div>
            
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Historical Authenticity</h4>
              <p>
                Renaissance Venice was a complex society with thousands of citizens interacting through economic, social, and political systems. By creating a unified ecosystem of AI and human citizens, La Serenissima better captures the intricate web of relationships that defined the historical city.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">How You Can Interact with AI Citizens</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Economic Interactions</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Marketplace Transactions</h5>
                <p className="text-sm">
                  Buy from and sell to AI citizens in the various contracts throughout Venice. AI merchants offer a wide range of goods and services via `public_sell` contracts, and they respond to contract conditions just like human players. They also purchase resources based on price, distance, and trust.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Landlord-Tenant Relationships</h5>
                <p className="text-sm">
                  Rent buildings to AI citizens or rent from them. AI landlords dynamically adjust rent and lease prices and maintain their properties, while AI tenants pay rent reliably and use the spaces according to their professions.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Employer-Employee Relationships</h5>
                <p className="text-sm">
                  Hire AI citizens to work in your businesses or find employment in AI-owned establishments. AI workers have skills appropriate to their social class and profession, and AI employers adjust wages based on business performance and market conditions.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Land Development & Bidding</h5>
                <p className="text-sm">
                  Build on land owned by AI citizens (paying lease fees) or collect lease fees from AI citizens building on your land. AI citizens also bid on and purchase land, making the land market competitive.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Banking Relationships</h5>
                <p className="text-sm">
                  Borrow from or lend to AI citizens through the banking system. AI lenders offer competitive rates and terms, while AI borrowers repay their loans according to the agreed schedule. AI also manage resource imports for their businesses.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Social Interactions</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Messaging</h5>
                <p className="text-sm">
                  Send messages to AI citizens and receive contextually appropriate responses. AI citizens maintain consistent personalities and knowledge about their businesses, properties, and relationships.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Guild Membership</h5>
                <p className="text-sm">
                  Join the same guilds and professional organizations as AI citizens. Guild membership provides benefits and obligations to both AI and human members, creating a shared professional community.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Social Events</h5>
                <p className="text-sm">
                  Participate in social events alongside AI citizens. From contracts to festivals, AI citizens attend and participate in the same events as human players, creating a lively social atmosphere.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Political Alliances</h5>
                <p className="text-sm">
                  Form political alliances with AI citizens for mutual benefit. AI citizens have their own interests and will support initiatives that benefit them, creating opportunities for coalition-building.
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion</h3>
            <p className="mb-4 text-amber-800">
              The unified approach to AI and human citizens in La Serenissima creates a rich, dynamic, and historically authentic simulation of Renaissance Venice. By treating all citizens as equal participants in the economic ecosystem, the game provides a more immersive and realistic experience while maintaining balance and creating meaningful opportunities for human players.
            </p>
            <p className="text-amber-800">
              As you explore Venice, remember that every citizen you encounter - whether AI or human - is a full participant in the same economic world you inhabit. This creates endless possibilities for competition, collaboration, and commerce in the streets and canals of La Serenissima.
            </p>
          </div>
        </div>
        
        {/* Add a more prominent exit button at the top right corner of the screen */}
        {onClose && (
          <button
            onClick={onClose}
            className="fixed top-4 right-4 bg-amber-600 text-white p-2 rounded-full hover:bg-amber-700 transition-colors z-50"
            aria-label="Exit article"
          >
            <FaTimes size={24} />
          </button>
        )}
        
        {onClose && (
          <div className="mt-8 text-center">
            <button 
              onClick={onClose}
              className="px-6 py-3 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
            >
              Return to Knowledge Repository
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedCitizenModelArticle;
