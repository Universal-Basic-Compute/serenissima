import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface VenetianGuildsArticleProps {
  onClose: () => void;
}

const VenetianGuildsArticle: React.FC<VenetianGuildsArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            The Venetian Guild System
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
            Power, Regulation, and Opportunity in La Serenissima's Craft Organizations
          </p>
          
          <p className="mb-4">
            In Renaissance Venice, guilds were far more than simple trade associations—they were powerful economic and political entities that regulated entire industries, maintained quality standards, and provided social support for their members. Understanding how guilds function in La Serenissima is essential for any merchant seeking to establish a successful business.
          </p>
          
          <div className="my-8 flex justify-center">
            <svg width="700" height="400" viewBox="0 0 700 400" xmlns="http://www.w3.org/2000/svg">
              {/* Background */}
              <rect x="0" y="0" width="700" height="400" fill="#fef3c7" stroke="#b45309" strokeWidth="2" rx="5" />
              
              {/* Title */}
              <text x="350" y="40" fontFamily="serif" fontSize="24" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Venetian Guild Structure</text>
              
              {/* Guild leadership */}
              <rect x="250" y="70" width="200" height="60" fill="#f59e0b" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="350" y="105" fontFamily="serif" fontSize="20" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Guild Leadership</text>
              <text x="350" y="125" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Gastaldo & Council</text>
              
              {/* Master craftsmen */}
              <rect x="150" y="170" width="150" height="50" fill="#fbbf24" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="225" y="200" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Master Craftsmen</text>
              
              {/* Journeymen */}
              <rect x="150" y="260" width="150" height="50" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="225" y="290" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Journeymen</text>
              
              {/* Apprentices */}
              <rect x="150" y="350" width="150" height="50" fill="#fde68a" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="225" y="380" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Apprentices</text>
              
              {/* Guild functions */}
              <rect x="400" y="170" width="150" height="50" fill="#fbbf24" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="475" y="200" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Quality Control</text>
              
              <rect x="400" y="260" width="150" height="50" fill="#fcd34d" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="475" y="290" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Contract Regulation</text>
              
              <rect x="400" y="350" width="150" height="50" fill="#fde68a" stroke="#b45309" strokeWidth="2" rx="5" />
              <text x="475" y="380" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Social Support</text>
              
              {/* Connecting lines */}
              <line x1="350" y1="130" x2="225" y2="170" stroke="#7c2d12" strokeWidth="2" />
              <line x1="225" y1="220" x2="225" y2="260" stroke="#7c2d12" strokeWidth="2" />
              <line x1="225" y1="310" x2="225" y2="350" stroke="#7c2d12" strokeWidth="2" />
              
              <line x1="350" y1="130" x2="475" y2="170" stroke="#7c2d12" strokeWidth="2" />
              <line x1="475" y1="220" x2="475" y2="260" stroke="#7c2d12" strokeWidth="2" />
              <line x1="475" y1="310" x2="475" y2="350" stroke="#7c2d12" strokeWidth="2" />
              
              {/* Horizontal connections */}
              <line x1="300" y1="195" x2="400" y2="195" stroke="#7c2d12" strokeWidth="2" strokeDasharray="5,3" />
              <line x1="300" y1="285" x2="400" y2="285" stroke="#7c2d12" strokeWidth="2" strokeDasharray="5,3" />
              <line x1="300" y1="375" x2="400" y2="375" stroke="#7c2d12" strokeWidth="2" strokeDasharray="5,3" />
            </svg>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Major Guilds of Venice</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Glassmakers of Murano</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Historical Context</h5>
                <p className="text-amber-800">
                  The Arte dei Vetrai (Glassmakers' Guild) was among Venice's most prestigious and secretive organizations. In 1291, all glassmaking was moved to the island of Murano to prevent fires in the densely populated city center—and to better guard the valuable trade secrets of Venetian glass production.
                </p>
                <p className="text-amber-800 mt-2">
                  Master glassmakers were forbidden to leave the Republic on pain of death, so jealously were their skills protected. Despite these restrictions, Murano glassmakers enjoyed high social status and privileges normally reserved for nobility.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Production Techniques</h5>
                <p className="text-amber-800">
                  Venetian glassmakers developed revolutionary techniques that set their work apart:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Cristallo: A nearly colorless, transparent glass achieved through purified raw materials</li>
                  <li>Lattimo: Milk glass that imitated expensive Chinese porcelain</li>
                  <li>Calcedonio: Glass resembling chalcedony stone with marbled effects</li>
                  <li>Millefiori: "Thousand flowers" technique creating intricate multicolored patterns</li>
                  <li>Aventurine: Glass containing copper crystals that created a sparkling effect</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Specialty Products:</span> Cristallo (clear glass), mirrors, chandeliers, decorative beads, and intricate goblets command premium prices throughout Europe and the Mediterranean.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Silk Weavers</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Historical Context</h5>
                <p className="text-amber-800">
                  The Arte dei Setaioli (Silk Weavers' Guild) controlled one of Venice's most lucrative luxury industries. Venetian silk production began in the 13th century after the Republic acquired silk-making expertise from Constantinople and the Levant.
                </p>
                <p className="text-amber-800 mt-2">
                  By the Renaissance, Venetian silks were renowned for their quality, intricate patterns, and vibrant colors achieved through closely guarded dyeing techniques. The guild strictly regulated production methods, apprenticeship terms, and quality standards.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Trade Networks</h5>
                <p className="text-amber-800">
                  The silk industry relied on extensive trade networks:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Raw silk imported primarily from Persia, Syria, and later China</li>
                  <li>Specialized dyes sourced from across the Mediterranean and beyond</li>
                  <li>Finished products exported throughout Europe, particularly to northern courts</li>
                  <li>Venetian merchants maintained dedicated warehouses in major trade centers</li>
                  <li>The guild negotiated favorable trade terms with foreign contracts</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Specialty Products:</span> Brocades, damasks, velvets, and satins for clothing, furnishings, and ecclesiastical vestments. The most elaborate pieces incorporate gold and silver thread.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Shipbuilders</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Historical Context</h5>
                <p className="text-amber-800">
                  The Arte dei Marangoni (Shipwrights' Guild) was vital to Venice's maritime power. The Arsenal, Venice's massive shipyard and armory, employed thousands of specialized workers who could assemble a complete galley in as little as one day using the world's first industrial assembly line.
                </p>
                <p className="text-amber-800 mt-2">
                  Beyond the Arsenal, smaller shipyards throughout the city produced merchant vessels, fishing boats, and the iconic gondolas. The guild maintained strict standards for materials, construction techniques, and vessel designs.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">The Arsenal System</h5>
                <p className="text-amber-800">
                  The Arsenal represented one of history's first industrial complexes:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Standardized parts and assembly techniques for rapid production</li>
                  <li>Specialized workers focused on specific components</li>
                  <li>Massive warehouses storing pre-fabricated ship elements</li>
                  <li>State-controlled facility employing over 16,000 workers at its peak</li>
                  <li>Capable of producing a fully equipped war galley in 24 hours</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Specialty Products:</span> War galleys, round ships for merchant trade, specialized fishing vessels, and gondolas. Each requires different expertise and materials.
              </p>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Goldsmiths</h4>
            
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Historical Context</h5>
                <p className="text-amber-800">
                  The Arte degli Orafi (Goldsmiths' Guild) represented one of Venice's oldest luxury crafts. Venetian goldsmiths created exquisite jewelry, religious objects, and decorative items that showcased the city's wealth and artistic sophistication.
                </p>
                <p className="text-amber-800 mt-2">
                  The guild maintained workshops primarily around the Rialto Bridge area. Due to the valuable materials they worked with, goldsmiths were subject to strict regulations regarding the purity of gold and silver, with the guild performing regular quality checks.
                </p>
              </div>
              
              <div className="md:w-1/2">
                <h5 className="font-bold text-amber-900 mb-2">Quality Control</h5>
                <p className="text-amber-800">
                  The goldsmiths' guild maintained exceptionally strict quality standards:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Required hallmarking of all gold and silver items</li>
                  <li>Regular assaying to verify precious metal purity</li>
                  <li>Mandatory inspections of workshops and tools</li>
                  <li>Severe penalties for fraud, including expulsion and fines</li>
                  <li>Detailed record-keeping of materials, designs, and transactions</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Specialty Products:</span> Jewelry featuring pearls and gemstones, religious objects like chalices and reliquaries, decorative household items, and gold thread for luxury textiles.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Membership & Advancement</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Joining a Guild</h4>
            
            <p className="mb-4">
              In La Serenissima, guild membership is essential for legally practicing most trades. The process of joining and advancing within a guild follows historical patterns:
            </p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Apprenticeship</h5>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Entry-level position lasting 5-7 years</li>
                  <li>Learn basic skills under a master's supervision</li>
                  <li>No independent production rights</li>
                  <li>Minimal pay, but room and board provided</li>
                  <li>Access to basic guild resources and protection</li>
                </ul>
                <p className="text-sm mt-2 text-amber-800">
                  <span className="font-bold">Advancement:</span> Complete required training period and produce a satisfactory demonstration piece.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Journeyman</h5>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Mid-level position lasting 3-5 years</li>
                  <li>Can work independently for wages</li>
                  <li>Cannot own a workshop or train apprentices</li>
                  <li>Access to guild marketplace and materials</li>
                  <li>Participation in guild social functions</li>
                </ul>
                <p className="text-sm mt-2 text-amber-800">
                  <span className="font-bold">Advancement:</span> Create a masterpiece demonstrating advanced skills and pay the master's entrance fee.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Master</h5>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Full guild member with voting rights</li>
                  <li>Can own workshop and employ others</li>
                  <li>Authorized to train apprentices</li>
                  <li>Access to guild secrets and techniques</li>
                  <li>Eligible for guild leadership positions</li>
                </ul>
                <p className="text-sm mt-2 text-amber-800">
                  <span className="font-bold">Advancement:</span> Serve on guild committees, build reputation through quality work, and campaign for leadership positions.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Alternative Paths:</span> While the traditional apprenticeship system is the most common route, La Serenissima offers alternative paths to guild membership:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800 mt-2">
                <li><span className="font-medium">Purchase a Membership:</span> Ducatsy merchants can sometimes buy their way into a guild, though they may face social resistance</li>
                <li><span className="font-medium">Marriage:</span> Marrying into a guild family can provide access, particularly for widows continuing their husband's business</li>
                <li><span className="font-medium">Foreign Master Recognition:</span> Established masters from other cities may receive expedited membership after demonstrating their skills</li>
                <li><span className="font-medium">Political Appointment:</span> In rare cases, the Doge or Council of Ten may grant guild membership as a political favor</li>
              </ul>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Guild Leadership</h4>
            
            <p className="mb-4">
              Rising to guild leadership positions provides significant economic and political advantages:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Gastaldo (Guild Master)</h5>
                <p className="text-sm mb-2 text-amber-800">
                  The highest position within a guild, elected by master members for a term of 1-2 years.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Represents the guild in government matters</li>
                  <li>Enforces regulations and quality standards</li>
                  <li>Mediates disputes between members</li>
                  <li>Controls guild treasury and property</li>
                  <li>Negotiates with other guilds and foreign merchants</li>
                </ul>
                <p className="text-sm mt-2 text-amber-800">
                  <span className="font-bold">Requirements:</span> Master status for at least 10 years, workshop ownership, and reputation for quality work.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Guild Council</h5>
                <p className="text-sm mb-2 text-amber-800">
                  A governing body of 5-12 experienced masters who assist the Gastaldo and provide continuity.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Drafts guild regulations and standards</li>
                  <li>Reviews applications for advancement</li>
                  <li>Manages guild finances and investments</li>
                  <li>Organizes guild ceremonies and events</li>
                  <li>Conducts quality inspections of members' work</li>
                </ul>
                <p className="text-sm mt-2 text-amber-800">
                  <span className="font-bold">Requirements:</span> Master status for at least 5 years and election by guild membership.
                </p>
              </div>
            </div>
            
            <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
              <p className="italic text-amber-800">
                <span className="font-bold">Political Influence:</span> Guild leaders serve as intermediaries between their industry and the Venetian government. They can propose regulations to the Senate, petition for trade privileges, and influence economic policy. In some cases, prominent guild leaders may be appointed to government committees overseeing commerce and manufacturing.
              </p>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guild Functions & Benefits</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Economic Regulation</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Quality Control</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guilds maintained Venice's reputation for excellence through strict quality standards:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Regular inspections of workshops and products</li>
                  <li>Certification marks for approved goods</li>
                  <li>Standardized materials and techniques</li>
                  <li>Penalties for substandard work, including fines and expulsion</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Contract Protection</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guilds protected their members from outside competition:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Monopoly rights over specific products or services</li>
                  <li>Import restrictions on competing foreign goods</li>
                  <li>Designated contract spaces for guild members</li>
                  <li>Price regulations to prevent undercutting</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Resource Access</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guild membership provided access to essential resources:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Bulk purchasing of raw materials at favorable rates</li>
                  <li>Priority access to imported goods</li>
                  <li>Shared equipment and facilities</li>
                  <li>Technical knowledge and trade secrets</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Contract Facilitation</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guilds helped members secure and fulfill contracts:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Standardized contract terms and pricing</li>
                  <li>Dispute resolution mechanisms</li>
                  <li>Collective fulfillment of large orders</li>
                  <li>Connections to wealthy clients and institutions</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Social Functions</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Mutual Aid</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guilds provided a social safety net for members:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Financial assistance during illness or injury</li>
                  <li>Support for widows and orphans of deceased members</li>
                  <li>Retirement provisions for elderly craftsmen</li>
                  <li>Funeral expenses and memorial services</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Religious Observance</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Each guild maintained strong religious connections:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Patron saint and dedicated chapel or altar</li>
                  <li>Annual feast day celebrations</li>
                  <li>Participation in religious processions</li>
                  <li>Charitable works and donations</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Social Networking</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guilds facilitated important social connections:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Regular meetings and banquets</li>
                  <li>Marriage connections between guild families</li>
                  <li>Mentorship relationships</li>
                  <li>Business partnerships and collaborations</li>
                </ul>
              </div>
              
              <div>
                <h5 className="font-bold text-amber-900 mb-1">Education & Training</h5>
                <p className="text-sm mb-3 text-amber-800">
                  Guilds ensured the transmission of knowledge:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>Structured apprenticeship programs</li>
                  <li>Technical instruction and skill development</li>
                  <li>Preservation of specialized techniques</li>
                  <li>Innovation within traditional frameworks</li>
                </ul>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Guilds in La Serenissima</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Guild Functions in the Game</h4>
            
            <p className="mb-4">
              In La Serenissima, guilds serve as powerful player organizations focused on coordinating members for larger economic and political operations. The system also identifies "Guild Member Relevancy" to highlight shared affiliations and encourage collaboration within guilds.
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
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Guild Governance</h4>
            
            <p className="mb-3">
              Guilds in La Serenissima are free to establish their own internal voting systems:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Voting Systems</h5>
                <p className="text-amber-800 mb-2">
                  Guilds may implement various voting structures:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Democratic one-member-one-vote systems</li>
                  <li>Ducats-weighted voting based on economic contribution</li>
                  <li>Meritocratic systems with earned voting rights</li>
                  <li>Hybrid approaches combining multiple methods</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Enhanced Governance Rights</h5>
                <p className="text-amber-800 mb-2">
                  Guild membership provides enhanced participation in La Serenissima's governance:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-amber-800">
                  <li>Collective voting power on city-wide matters</li>
                  <li>Proposal rights for consideration in governance decisions</li>
                  <li>Representation in future governance mechanisms</li>
                  <li>Influence on economic regulations</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Conclusion: The Guild as Economic Foundation</h3>
            <p className="mb-4 text-amber-800">
              In La Serenissima, as in historical Venice, guilds are not merely background organizations but active economic and social forces that shape every aspect of commercial life. Understanding how to navigate guild structures—whether by embracing tradition, pushing boundaries, or rising to leadership—is essential for any merchant seeking lasting success.
            </p>
            <p className="mb-4 text-amber-800">
              While guild regulations may sometimes feel restrictive, they provide the stability, quality standards, and social connections that make Venice's economy function. The most successful merchants don't fight against this system but learn to work within it, using guild structures to their advantage while contributing to the collective prosperity that makes Venice the commercial wonder of the medieval world.
            </p>
            <p className="text-amber-800">
              Whether you choose to become a master glassmaker on Murano, a silk weaver creating luxurious fabrics, a shipwright building the vessels that power Venice's trade empire, or a goldsmith crafting exquisite jewelry, your guild will be both your community and your pathway to economic success.
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

export default VenetianGuildsArticle;
