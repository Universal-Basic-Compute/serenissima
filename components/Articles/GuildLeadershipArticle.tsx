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
            Leadership Structures in the Venetian Guild System
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
            The guild system of Renaissance Venice featured sophisticated leadership structures that balanced internal self-governance with external oversight from the Republic. These leadership structures were crucial to maintaining Venice's reputation for quality craftsmanship while ensuring guilds served the interests of the state.
          </p>
          
          <div className="my-8 flex justify-center">
            <svg width="700" height="400" viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg">
              {/* Background */}
              <rect x="0" y="0" width="700" height="400" fill="#fef3c7" stroke="#b45309" strokeWidth="2" rx="5" />
              
              {/* Title */}
              <text x="350" y="40" fontFamily="serif" fontSize="24" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Venetian Guild Leadership Hierarchy</text>
              
              {/* Gastaldo */}
              <rect x="250" y="70" width="200" height="60" fill="#f59e0b" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="105" fontFamily="serif" fontSize="20" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Gastaldo</text>
              <text x="350" y="125" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">(Guild Master)</text>
              
              {/* Guild Council */}
              <rect x="250" y="160" width="200" height="50" fill="#fbbf24" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="190" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Guild Council (5-12 Masters)</text>
              
              {/* Guild Officers */}
              <rect x="100" y="240" width="150" height="50" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="175" y="265" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Massaro</text>
              <text x="175" y="285" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">(Treasurer)</text>
              
              <rect x="275" y="240" width="150" height="50" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="265" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Scrivan</text>
              <text x="350" y="285" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">(Secretary)</text>
              
              <rect x="450" y="240" width="150" height="50" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="525" y="265" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Sindaci</text>
              <text x="525" y="285" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">(Inspectors)</text>
              
              {/* Master Members */}
              <rect x="250" y="320" width="200" height="50" fill="#fde68a" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="350" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Master Members</text>
              <text x="350" y="365" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">(Voting Rights)</text>
              
              {/* Connecting lines */}
              <line x1="350" y1="130" x2="350" y2="160" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="210" x2="350" y2="240" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="210" x2="175" y2="240" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="210" x2="525" y2="240" stroke="#7c2d12" strokeWidth="2" />
              <line x1="350" y1="290" x2="350" y2="320" stroke="#7c2d12" strokeWidth="2" />
              
              {/* External oversight */}
              <rect x="500" y="100" width="150" height="60" fill="#e0f2fe" stroke="#2563eb" strokeWidth="2" rx="5" opacity="0.7" />
              <text x="575" y="130" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#1e40af">Republic Oversight</text>
              <text x="575" y="150" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#1e40af">(Cinque Savi)</text>
              
              <path d="M 500 130 L 450 100" stroke="#1e40af" strokeWidth="2" strokeDasharray="5,3" />
              <path d="M 500 130 L 450 185" stroke="#1e40af" strokeWidth="2" strokeDasharray="5,3" />
            </svg>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Primary Leadership Positions</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Gastaldo (Guild Master)</h4>
            
            <p className="mb-3">
              The Gastaldo served as the highest authority within a Venetian guild, combining administrative, judicial, and representative functions:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Responsibilities</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Represents the guild in government matters</li>
                  <li>Enforces regulations and quality standards</li>
                  <li>Mediates disputes between members</li>
                  <li>Controls guild treasury and property</li>
                  <li>Negotiates with other guilds and foreign merchants</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Selection & Requirements</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Elected by master members for a term of 1-2 years</li>
                  <li>Must have master status for at least 10 years</li>
                  <li>Must own a workshop in good standing</li>
                  <li>Requires reputation for quality work</li>
                  <li>Often rotated among established families</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Historical Note:</span> The term "Gastaldo" derives from the Lombard <i>gastald</i>, originally referring to a steward or administrator. In Venice, the position evolved to become the elected head of a guild, reflecting the city's preference for republican governance over hereditary leadership.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Guild Council</h4>
            
            <p className="mb-3">
              The Guild Council served as the primary governing body, providing continuity and collective wisdom:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Responsibilities</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Drafts guild regulations and standards</li>
                  <li>Reviews applications for advancement</li>
                  <li>Manages guild finances and investments</li>
                  <li>Organizes guild ceremonies and events</li>
                  <li>Conducts quality inspections of members' work</li>
                  <li>Advises the Gastaldo on major decisions</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Composition & Selection</h5>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Typically 5-12 experienced master craftsmen</li>
                  <li>Members must have master status for at least 5 years</li>
                  <li>Elected by the general membership</li>
                  <li>Often served staggered terms for continuity</li>
                  <li>Included former Gastaldi to provide experience</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">In Practice:</span> The Guild Council often wielded more practical power than the Gastaldo, as they collectively represented the guild's institutional memory and controlled the advancement process. Their approval was necessary for any significant changes to guild regulations or practices.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Officers</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Specialized Administrative Roles</h4>
            
            <p className="mb-3">
              Various officers handled specific aspects of guild operations:
            </p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Massaro (Treasurer)</h5>
                <p className="text-sm text-amber-800">
                  Responsible for collecting dues, managing the guild treasury, disbursing funds, and maintaining financial records. The Massaro presented regular financial reports to the Council and was typically bonded to protect against misappropriation.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Scrivan (Secretary)</h5>
                <p className="text-sm text-amber-800">
                  Maintained all guild records including membership rolls, apprenticeship contracts, meeting minutes, and correspondence with government authorities. The Scrivan was often one of the few guild members with advanced literacy and legal knowledge.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Sindaci (Inspectors)</h5>
                <p className="text-sm text-amber-800">
                  Conducted quality inspections of workshops and products, ensuring adherence to guild standards. They had authority to levy fines for substandard work and could recommend more severe penalties to the Council for serious violations.
                </p>
              </div>
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Banca (Board)</h5>
                <p className="text-sm text-amber-800">
                  The collective term for all guild officers, who would meet regularly to coordinate activities and address routine matters without requiring full Council involvement. The Banca handled day-to-day operations while the Council focused on strategic decisions.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Nonzolo (Chaplain)</h5>
                <p className="text-sm text-amber-800">
                  Oversaw religious aspects of guild activities, including maintenance of the guild's altar or chapel, organization of feast day celebrations, and coordination of funeral services for deceased members. This position reflected the important religious dimension of guild life.
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Leadership Structure Types</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Governance Models in Venetian Guilds</h4>
            
            <p className="mb-3">
              Venetian guilds employed several leadership structures, reflecting the Republic's unique balance between democratic principles and state control:
            </p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Elected Leadership</h5>
                <p className="text-sm text-amber-800 mb-2">
                  The most common form in Venetian guilds, where leaders were chosen through votes by master members.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Provided democratic accountability</li>
                  <li>Terms typically limited to 1-2 years</li>
                  <li>Prevented concentration of power</li>
                  <li>Aligned with Venice's republican values</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Hereditary Elements</h5>
                <p className="text-sm text-amber-800 mb-2">
                  While less common than in other European cities, some Venetian guilds had hereditary aspects.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Workshop ownership often passed to sons</li>
                  <li>Family connections influenced elections</li>
                  <li>Certain families dominated specific guilds</li>
                  <li>Less formal than true hereditary succession</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Appointed Leadership</h5>
                <p className="text-sm text-amber-800 mb-2">
                  Some guild positions were influenced or directly appointed by government authorities.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Reflected Venice's tight control over guilds</li>
                  <li>Ensured guilds served Republic's interests</li>
                  <li>Government could veto unsuitable candidates</li>
                  <li>Some positions granted as political favors</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Venetian Distinction:</span> Unlike guilds in other European cities that often functioned as independent political entities, Venetian guilds operated under closer state supervision. The <i>Cinque Savi alla Mercanzia</i> (Five Sages of Commerce) and other magistracies maintained oversight of guild activities, ensuring they aligned with the Republic's economic policies and interests.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Leadership in Practice</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Decision-Making Processes</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Regular Meetings</h5>
                <p className="text-sm text-amber-800">
                  Guild leadership operated through a structured meeting system:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li><span className="font-medium">Council Meetings</span>: Held monthly to address ongoing business</li>
                  <li><span className="font-medium">General Assemblies</span>: Quarterly meetings of all master members</li>
                  <li><span className="font-medium">Feast Day Gatherings</span>: Annual celebrations combining religious observance with guild business</li>
                  <li><span className="font-medium">Emergency Sessions</span>: Called by the Gastaldo to address urgent matters</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Voting Procedures</h5>
                <p className="text-sm text-amber-800">
                  Guilds employed various voting methods:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li><span className="font-medium">Voice Vote</span>: For routine matters with clear consensus</li>
                  <li><span className="font-medium">Ballot Box</span>: For elections and contentious issues</li>
                  <li><span className="font-medium">Weighted Voting</span>: Some guilds gave senior masters more influence</li>
                  <li><span className="font-medium">Supermajority Requirements</span>: Major changes often required two-thirds approval</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Conflict Resolution</h5>
                <p className="text-sm text-amber-800">
                  Guild leadership served as the first level of dispute resolution:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>The Gastaldo mediated disputes between members</li>
                  <li>The Council heard appeals of Gastaldo decisions</li>
                  <li>Serious violations could result in fines, suspension, or expulsion</li>
                  <li>Disputes between guilds were referred to government magistrates</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Record Keeping</h5>
                <p className="text-sm text-amber-800">
                  Venetian guilds maintained extensive records:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li><span className="font-medium">Mariegola</span>: The guild's official charter and regulations</li>
                  <li><span className="font-medium">Membership Rolls</span>: Detailed records of all members by rank</li>
                  <li><span className="font-medium">Financial Ledgers</span>: Accounts of income and expenditures</li>
                  <li><span className="font-medium">Meeting Minutes</span>: Records of decisions and discussions</li>
                </ul>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Leadership Advancement</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Pathways to Leadership</h4>
            
            <p className="mb-3">
              Rising to guild leadership positions required a combination of craft mastery, business success, and political acumen:
            </p>
            
            <div className="my-6 flex justify-center">
              <svg width="600" height="250" viewBox="0 0 600 250" xmlns="http://www.w3.org/2000/svg">
                {/* Background */}
                <rect x="0" y="0" width="600" height="250" fill="#fef3c7" stroke="#b45309" strokeWidth="2" rx="5" />
                
                {/* Timeline */}
                <line x1="50" y1="125" x2="550" y2="125" stroke="#7c2d12" strokeWidth="2" />
                
                {/* Timeline markers */}
                <line x1="100" y1="120" x2="100" y2="130" stroke="#7c2d12" strokeWidth="2" />
                <line x1="225" y1="120" x2="225" y2="130" stroke="#7c2d12" strokeWidth="2" />
                <line x1="350" y1="120" x2="350" y2="130" stroke="#7c2d12" strokeWidth="2" />
                <line x1="475" y1="120" x2="475" y2="130" stroke="#7c2d12" strokeWidth="2" />
                
                {/* Positions */}
                <circle cx="100" y="125" r="15" fill="#fde68a" stroke="#b45309" strokeWidth="2" />
                <text x="100" y="175" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Master</text>
                <text x="100" y="195" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Year 0</text>
                
                <circle cx="225" y="125" r="15" fill="#fcd34d" stroke="#b45309" strokeWidth="2" />
                <text x="225" y="175" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Committee</text>
                <text x="225" y="195" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Years 2-3</text>
                
                <circle cx="350" y="125" r="15" fill="#fbbf24" stroke="#b45309" strokeWidth="2" />
                <text x="350" y="175" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Council</text>
                <text x="350" y="195" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Years 5+</text>
                
                <circle cx="475" y="125" r="15" fill="#f59e0b" stroke="#b45309" strokeWidth="2" />
                <text x="475" y="175" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Gastaldo</text>
                <text x="475" y="195" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Years 10+</text>
                
                {/* Requirements */}
                <text x="100" y="75" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Masterpiece</text>
                <text x="100" y="90" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Approval</text>
                
                <text x="225" y="75" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Active</text>
                <text x="225" y="90" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Participation</text>
                
                <text x="350" y="75" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Workshop</text>
                <text x="350" y="90" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Success</text>
                
                <text x="475" y="75" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Reputation &</text>
                <text x="475" y="90" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Connections</text>
                
                {/* Connecting arrows */}
                <line x1="115" y1="125" x2="210" y2="125" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                <line x1="240" y1="125" x2="335" y2="125" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                <line x1="365" y1="125" x2="460" y2="125" stroke="#7c2d12" strokeWidth="1" markerEnd="url(#arrowhead)" />
                
                {/* Arrow definition */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                          refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#7c2d12" />
                  </marker>
                </defs>
                
                {/* Title */}
                <text x="300" y="30" fontFamily="serif" fontSize="16" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Typical Guild Leadership Advancement Timeline</text>
              </svg>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Initial Leadership Experience</h5>
                <p className="text-sm text-amber-800">
                  New masters typically began their leadership journey through:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Serving on specialized committees (feast day planning, apprentice examinations)</li>
                  <li>Assisting with quality inspections under senior members' supervision</li>
                  <li>Representing the guild at minor civic functions</li>
                  <li>Contributing to guild charitable activities</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Building Political Capital</h5>
                <p className="text-sm text-amber-800">
                  Advancement required developing relationships and reputation:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800">
                  <li>Demonstrating exceptional craft skill through commissioned works</li>
                  <li>Building a successful workshop with multiple employees</li>
                  <li>Forming alliances with influential guild families</li>
                  <li>Contributing generously to guild treasury and charitable causes</li>
                  <li>Developing connections with government officials</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Strategic Insight:</span> Guild leadership positions were not merely honorary—they provided significant economic advantages through insider knowledge, regulatory influence, and valuable connections. Ambitious merchants often invested years in guild politics to secure these advantages, viewing the time commitment as a worthwhile investment in their business future.
              </p>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: Leadership as Economic Advantage</h3>
            <p className="mb-4 text-amber-800">
              In La Serenissima, guild leadership positions represent more than mere status—they offer concrete economic and strategic advantages. As a merchant rising through the ranks, you'll find that investing time in guild politics can yield substantial returns through regulatory influence, valuable connections, and privileged information.
            </p>
            <p className="mb-4 text-amber-800">
              The Venetian guild leadership system balanced democratic principles with practical needs for expertise and continuity. While elections ensured accountability, the requirements for leadership positions ensured that only the most skilled and successful practitioners could guide their respective industries.
            </p>
            <p className="text-amber-800">
              Whether you aspire to become a Gastaldo or simply seek to influence guild policies that affect your business, understanding these leadership structures is essential for navigating the complex economic landscape of Renaissance Venice.
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
