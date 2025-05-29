import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface SocialClassArticleProps {
  onClose: () => void;
}

const SocialClassArticle: React.FC<SocialClassArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            The Social Class System of La Serenissima
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
            Understanding Social Mobility and Class Distinctions in Venice
          </p>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Game Mechanics: Social Classes</h3>
          
          <p className="mb-4">
            In La Serenissima, your social class determines your standing in Venetian society, affecting your housing options, economic opportunities, and political influence. The game features four distinct social classes, arranged in a clear hierarchy:
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Four Social Classes</h4>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Nobili (Nobles)</h5>
                <p className="text-amber-800">
                  The highest social class, comprising patrician families with ancient lineages. Nobili have access to the finest housing (canal houses), receive the largest share of treasury redistribution (40%), and have the lowest chance of seeking new jobs or housing (5-10%).
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Cittadini (Citizens)</h5>
                <p className="text-amber-800">
                  The wealthy merchant class, representing successful businesspeople and professionals. Cittadini live in merchant houses, receive 30% of treasury redistribution, and have moderate chances of seeking better economic opportunities (10-20%).
                </p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Popolani (Common People)</h5>
                <p className="text-amber-800">
                  The working class, including artisans, shopkeepers, and skilled laborers. Popolani reside in artisan houses, receive 20% of treasury redistribution, and have higher chances of seeking better jobs or housing (15-30%).
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Facchini (Laborers)</h5>
                <p className="text-amber-800">
                  The lowest social class, comprising unskilled workers, servants, and the urban poor. This class historically included the vital `facchini` (porters) who were responsible for much of the goods transport within Venice's unique landscape. Facchini live in fisherman cottages, receive 10% of treasury redistribution, and have the highest chance of seeking better economic opportunities (20-40%).
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Social Mobility Mechanics</h3>
          
          <p className="mb-4">
            Unlike the rigid class structures of many medieval societies, La Serenissima features a dynamic social mobility system that allows citizens to rise through the ranks based on their economic achievements and contributions to the city.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Paths to Social Advancement</h4>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Influence (Nobili)</h5>
                <p className="text-amber-800 mb-2">
                  <span className="font-medium">Highest Priority:</span> Citizens with Influence exceeding 10,000 are elevated to Nobili status. Influence is a valuable currency that reflects a citizen's standing, reputation, and contributions to the Republic. It can be spent on political actions, securing social advantages, or gaining economic favors.
                </p>
                <p className="text-amber-800 mb-1">Influence is earned through various significant activities, including:</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-800">
                  <li>
                    <span className="font-medium">Funding Public Works & Civic Buildings:</span> Investing Ducats in the creation, maintenance, or significant improvement of infrastructure and buildings vital to the Republic's functioning and welfare. Examples include:
                    <ul className="list-disc pl-5 mt-1">
                      <li>Basic Infrastructure: `bridge.json`, `canal_maintenance_office.json`, `public_dock.json`, `public_well.json`, `cistern.json`, `weighing_station.json`, `gondola_station.json` (if public).</li>
                      <li>Civic & Administrative: `courthouse.json`, `town_hall.json`, `customs_house.json`, `mint.json`, `public_archives.json`, `naval_administration_office.json`, `prison.json`.</li>
                      <li>Defense & Safety: `city_gate.json`, `defensive_bastion.json`, `guard_post.json`, `harbor_chain_tower.json`, `watchtower.json`, `flood_control_station.json`, `quarantine_station.json`. Major state defense installations like the `arsenal_gate.json` or `arsenal_workshop.json` also qualify.</li>
                      <li>Public Good: `hospital.json`, `navigation_school.json`, `public_bath.json`, `granary.json`.</li>
                    </ul>
                  </li>
                  <li>
                    <span className="font-medium">Sponsoring Cultural, Religious, & Landmark Institutions:</span> Contributing to the construction, upkeep, or significant embellishment of buildings that define Venice's cultural, spiritual, and monumental identity. Examples include:
                    <ul className="list-disc pl-5 mt-1">
                      <li>Religious: `chapel.json`, `parish_church.json`, `st__mark_s_basilica.json`.</li>
                      <li>Cultural & Educational: `art_academy.json`, `theater.json`, `clocktower.json` (as a landmark).</li>
                      <li>Major Civic Landmarks: The `doge_s_palace.json` and exceptionally grand `grand_canal_palace.json` or `nobili_palazzo.json` if their construction or patronage significantly adds to the city's prestige.</li>
                    </ul>
                  </li>
                  <li>
                    <span className="font-medium">Successful Guild Leadership & Support:</span> Achieving leadership in a guild (e.g., Gastaldo) and contributing to the creation or maintenance of its `guild_hall.json` or `porter_guild_hall.json`, thereby strengthening these key civic-economic organizations.
                  </li>
                  <li>
                    <span className="font-medium">Artistic Patronage for Buildings:</span> Commissioning or funding significant works of art, sculptures, or architectural embellishments that enhance the beauty and prestige of important public, cultural, or religious buildings.
                  </li>
                  <li>
                    <span className="font-medium">Strategic Philanthropy and Lending:</span> Making impactful financial contributions or offering favorable loans that are perceived as acts of civic virtue, especially if they aid key figures, the state, or fund the creation/maintenance of the types of buildings mentioned above.
                  </li>
                </ul>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Daily Income (Cittadini)</h5>
                <p className="text-amber-800">
                  <span className="font-medium">Second Priority:</span> Citizens with Daily Income exceeding 100,000 Ducats are elevated to Cittadini status (if not already Nobili).
                </p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Land Usage (Cittadini)</h5>
                <p className="text-amber-800">
                  <span className="font-medium">Third Priority:</span> Citizens who use at least one land plot are elevated to at least Cittadini status (if not already Nobili or Cittadini by income).
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Business Ownership (Popolani)</h5>
                <p className="text-amber-800">
                  <span className="font-medium">Fourth Priority:</span> Citizens who own at least one business building (workshop, market stall, tavern, warehouse, dock, factory, or shop) are elevated to at least Popolani status (if not already in a higher class).
                </p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Entrepreneurship (Popolani)</h5>
                <p className="text-amber-800">
                  <span className="font-medium">Fifth Priority:</span> Citizens who run at least one building (marked as `RunBy` in the building record) are elevated to at least Popolani status (if not already in a higher class). This represents the managerial role of entrepreneurs.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Daily Social Class Updates</h4>
            
            <p className="text-amber-800 mb-3">
              Every day at 1:00 PM UTC, the social class update system evaluates all citizens for potential social mobility:
            </p>
            
            <ol className="list-decimal pl-5 space-y-2 text-amber-800">
              <li>The system checks each citizen's influence, daily income, land usage, business ownership, and entrepreneurship status</li>
              <li>It applies the rules in order of precedence (influence, income, land usage, business ownership, entrepreneurship)</li>
              <li>When a citizen qualifies for elevation, their social class is updated in the database</li>
              <li>The citizen receives a notification explaining their new status and the reason for their elevation</li>
              <li>The system tracks social mobility statistics and sends a summary to administrators</li>
            </ol>
            
            <p className="mt-3 text-amber-800 italic">
              Note: Social class can only increase, never decrease. Once you achieve a certain status, you maintain it even if your economic circumstances change.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Economic Implications of Social Class</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Treasury Redistribution</h4>
            
            <p className="text-amber-800 mb-3">
              Every day at 8:00 AM UTC, 10% of the Consiglio dei Dieci's treasury is redistributed to citizens based on social class:
            </p>
            
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="bg-amber-50 p-2 rounded border border-amber-200 text-center">
                <p className="font-bold text-amber-900">Nobili</p>
                <p className="text-2xl font-serif text-amber-800">40%</p>
              </div>
              
              <div className="bg-amber-50 p-2 rounded border border-amber-200 text-center">
                <p className="font-bold text-amber-900">Cittadini</p>
                <p className="text-2xl font-serif text-amber-800">30%</p>
              </div>
              
              <div className="bg-amber-50 p-2 rounded border border-amber-200 text-center">
                <p className="font-bold text-amber-900">Popolani</p>
                <p className="text-2xl font-serif text-amber-800">20%</p>
              </div>
              
              <div className="bg-amber-50 p-2 rounded border border-amber-200 text-center">
                <p className="font-bold text-amber-900">Facchini</p>
                <p className="text-2xl font-serif text-amber-800">10%</p>
              </div>
            </div>
            
            <p className="text-amber-800">
              Within each social class, the funds are distributed equally among all citizens. This system ensures that higher social classes receive greater benefits from the city's prosperity, while still providing a basic income to all citizens.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Housing and Mobility</h4>
            
            <p className="text-amber-800 mb-3">
              Social class determines housing options and mobility patterns:
            </p>
            
            <div className="overflow-x-auto">
              <table className="min-w-full bg-amber-50 border border-amber-200">
                <thead>
                  <tr className="bg-amber-200">
                    <th className="px-4 py-2 text-left text-amber-900">Social Class</th>
                    <th className="px-4 py-2 text-left text-amber-900">Housing Type</th>
                    <th className="px-4 py-2 text-left text-amber-900">Housing Mobility (Chance, Threshold)</th>
                    <th className="px-4 py-2 text-left text-amber-900">Work Mobility (Chance, Threshold)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-amber-200">
                    <td className="px-4 py-2 font-medium">Nobili</td>
                    <td className="px-4 py-2">Canal Houses</td>
                    <td className="px-4 py-2">10% chance, needs 12% cheaper</td>
                    <td className="px-4 py-2">5% chance, needs 15% higher wages</td>
                  </tr>
                  <tr className="border-t border-amber-200 bg-amber-100/50">
                    <td className="px-4 py-2 font-medium">Cittadini</td>
                    <td className="px-4 py-2">Merchant Houses</td>
                    <td className="px-4 py-2">20% chance, needs 8% cheaper</td>
                    <td className="px-4 py-2">10% chance, needs 12% higher wages</td>
                  </tr>
                  <tr className="border-t border-amber-200">
                    <td className="px-4 py-2 font-medium">Popolani</td>
                    <td className="px-4 py-2">Artisan Houses</td>
                    <td className="px-4 py-2">30% chance, needs 6% cheaper</td>
                    <td className="px-4 py-2">15% chance, needs 10% higher wages</td>
                  </tr>
                  <tr className="border-t border-amber-200 bg-amber-100/50">
                    <td className="px-4 py-2 font-medium">Facchini</td>
                    <td className="px-4 py-2">Fisherman Cottages</td>
                    <td className="px-4 py-2">40% chance, needs 4% cheaper</td>
                    <td className="px-4 py-2">20% chance, needs 8% higher wages</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <p className="mt-3 text-amber-800 text-sm italic">
              Housing Mobility: Daily chance of looking for cheaper housing and the minimum rent reduction required to move.<br/>
              Work Mobility: Daily chance of looking for better-paying jobs and the minimum wage increase required to change jobs.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Building Access and Construction</h4>
            
            <p className="text-amber-800 mb-3">
              Your social class determines which building tiers you can construct and operate:
            </p>
            
            <div className="overflow-x-auto">
              <table className="min-w-full bg-amber-50 border border-amber-200">
                <thead>
                  <tr className="bg-amber-200">
                    <th className="px-4 py-2 text-left text-amber-900">Social Class</th>
                    <th className="px-4 py-2 text-left text-amber-900">Building Tier Access</th>
                    <th className="px-4 py-2 text-left text-amber-900">Example Buildings</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-amber-200">
                    <td className="px-4 py-2 font-medium">Nobili</td>
                    <td className="px-4 py-2">All Tiers (1-5)*</td>
                    <td className="px-4 py-2">Doge's Palace, St. Mark's Basilica, Grand Canal Palace, Arsenal Gate</td>
                  </tr>
                  <tr className="border-t border-amber-200 bg-amber-100/50">
                    <td className="px-4 py-2 font-medium">Cittadini</td>
                    <td className="px-4 py-2">Tiers 1-3</td>
                    <td className="px-4 py-2">Fondaco dei Tedeschi, Shipyard, Mint, Eastern Merchant House</td>
                  </tr>
                  <tr className="border-t border-amber-200">
                    <td className="px-4 py-2 font-medium">Popolani</td>
                    <td className="px-4 py-2">Tiers 1-2</td>
                    <td className="px-4 py-2">Bottega, Glassblower Workshop, Merceria, Canal House</td>
                  </tr>
                  <tr className="border-t border-amber-200 bg-amber-100/50">
                    <td className="px-4 py-2 font-medium">Facchini</td>
                    <td className="px-4 py-2">Tier 1 only</td>
                    <td className="px-4 py-2">Market Stall, Fisherman's Cottage, Blacksmith, Bakery</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <p className="mt-3 text-amber-800">
              This tiered access system ensures that social advancement provides tangible economic benefits, as higher-tier buildings typically offer greater income potential, more advanced production capabilities, and access to more valuable resources and contracts.
            </p>
            
            <p className="mt-2 text-amber-800 italic">
              *Note: While Nobili can access all building tiers, tier 5 buildings (such as the Doge's Palace and St. Mark's Basilica) require a special decree from the Consiglio dei Dieci before construction can begin, regardless of social class.
            </p>
            
            <p className="mt-2 text-amber-800 italic">
              Note: While your social class limits which buildings you can construct, you can still own buildings of any tier through purchase or inheritance, regardless of your social class.
            </p>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Historical Context: Social Classes in Renaissance Venice</h3>
          
          <p className="mb-4">
            The social class system in La Serenissima is inspired by the historical social structure of Renaissance Venice, which was unique among European societies of the time. While simplified for gameplay purposes, it reflects many of the distinctive features that made Venetian society both stratified and relatively mobile.
          </p>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Historical Venetian Class Structure</h4>
            
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Patricians (Nobili)</h5>
                <p className="text-amber-800">
                  The patrician class consisted of families listed in the <em>Libro d'Oro</em> (Golden Book), a registry established in 1297 that closed access to the Great Council. These families monopolized political power, with only patricians eligible for the highest offices including the Doge. However, unlike nobility elsewhere in Europe, Venetian patricians were expected to engage in commerce and maritime trade.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Citizens (Cittadini)</h5>
                <p className="text-amber-800">
                  The cittadini were wealthy non-noble citizens who had significant economic power. They were divided into two groups: the <em>cittadini originarii</em> (original citizens) who could hold important bureaucratic positions, and the <em>cittadini de intus et de extra</em> who had commercial privileges. Many cittadini were wealthy merchants, lawyers, physicians, and notaries who served the state in administrative roles.
                </p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Commoners (Popolani)</h5>
                <p className="text-amber-800">
                  The popolani included artisans, shopkeepers, and skilled workers who were often organized into guilds (<em>Scuole</em> or <em>Arti</em>). Unlike many other European cities, Venetian guilds had limited political power but served important economic and social functions. Guild membership provided economic security, mutual aid, and a sense of community identity.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Laborers (Facchini)</h5>
                <p className="text-amber-800">
                  At the bottom of the social hierarchy were unskilled laborers, servants, and the urban poor. This included dockworkers, gondoliers, domestic servants, and the crucial <em>facchini</em> (porters), who performed essential but low-status work like transporting goods. Despite their humble position, even these workers enjoyed better conditions in Venice than in many other European cities due to the republic's relative prosperity.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Venetian Social Mobility</h4>
            
            <p className="text-amber-800 mb-3">
              While Venice had a clearly defined social hierarchy, it offered several paths for social advancement that were unusual for the time:
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">The Serrata and Its Exceptions</h5>
                <p className="text-amber-800">
                  The <em>Serrata del Maggior Consiglio</em> (Closure of the Great Council) in 1297 theoretically closed access to the patriciate. However, during times of crisis, the Republic occasionally admitted new families to noble status in exchange for substantial financial contributions. During the War of Chioggia (1379-1381) and the War of the League of Cambrai (1508-1516), several wealthy cittadini families purchased nobility for 100,000 ducats.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Commercial Success</h5>
                <p className="text-amber-800">
                  Venice's commercial orientation meant that successful merchants could amass wealth comparable to patricians. While this didn't automatically translate to noble status, it did allow for significant social advancement. Wealthy merchants could secure cittadini status, purchase prestigious properties, commission art, and arrange advantageous marriages for their children, gradually improving their family's standing over generations.
                </p>
              </div>
            </div>
            
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">Guild Leadership</h5>
                <p className="text-amber-800">
                  For popolani, rising to leadership positions within the guilds (<em>Scuole</em>) provided a path to greater status and influence. The leaders of the most prestigious guilds, particularly the <em>Scuole Grandi</em> (Great Schools), enjoyed significant social recognition and could interact with patricians on relatively equal terms in certain contexts.
                </p>
              </div>
              
              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <h5 className="font-bold text-amber-900 mb-1">State Service</h5>
                <p className="text-amber-800">
                  Service to the Republic could lead to social advancement. Skilled administrators, naval commanders, and diplomats who served Venice effectively could receive honors, pensions, and privileges that elevated their status. The Republic valued competence and loyalty, sometimes allowing talented individuals to rise above their birth station.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">The Myth and Reality of Venetian Society</h4>
            
            <p className="text-amber-800 mb-3">
              Venice cultivated an image of itself as a perfectly ordered republic where each social class had its proper place and function. This "Myth of Venice" portrayed the city as a harmonious society where wise patricians governed for the common good, successful merchants created prosperity, skilled artisans produced quality goods, and laborers provided essential services.
            </p>
            
            <p className="text-amber-800 mb-3">
              The reality was more complex. While Venice did enjoy greater social stability and less violent class conflict than many contemporary European cities, it still experienced tensions between classes. Popolani occasionally protested against patrician privileges, and ambitious cittadini sometimes resented their exclusion from political power despite their wealth and education.
            </p>
            
            <p className="text-amber-800">
              Nevertheless, Venice's social system proved remarkably durable, helping to sustain the Republic for over a millennium. By providing limited but real opportunities for advancement, recognizing the importance of all classes to the city's prosperity, and fostering a shared Venetian identity that transcended class divisions, La Serenissima created a social order that contributed significantly to its legendary stability and success.
            </p>
          </div>
          
          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Strategic Considerations for Players</h3>
            <p className="mb-4 text-amber-800">
              Understanding the social class system in La Serenissima provides several strategic advantages:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-amber-800">
              <li><span className="font-medium">Economic Planning</span> - Your social class affects your share of treasury redistribution, making higher status financially beneficial</li>
              <li><span className="font-medium">Land Usage</span> - Securing land usage rights is a direct path to Cittadini status, offering significant social advancement</li>
              <li><span className="font-medium">Career Paths</span> - Focus on entrepreneurship and business ownership as early paths to social advancement</li>
              <li><span className="font-medium">Investment Strategy</span> - Consider investing in businesses that can generate the high daily income needed to reach Cittadini status</li>
              <li><span className="font-medium">Influence Building & Management</span> - Actively seek opportunities to earn Influence (public works, cultural contributions, guild leadership) not just for Nobili status, but as a spendable currency for political and social maneuvering. Manage your Influence wisely, as it can be as crucial as Ducats for achieving your long-term goals.</li>
              <li><span className="font-medium">Housing Choices</span> - Balance the influence of housing appropriate to your social class with the economic benefits of lower rent</li>
              <li><span className="font-medium">Building Access</span> - Higher social classes unlock more advanced building tiers, allowing for more sophisticated economic activities</li>
            </ul>
            <p className="mt-4 text-amber-800">
              Remember that social advancement in La Serenissima, as in historical Venice, is a gradual process that rewards strategic thinking, economic acumen, and contribution to the city's prosperity. Plan your path carefully, manage your Ducats and Influence effectively, and you may rise from humble beginnings to the highest echelons of Venetian society.
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

export default SocialClassArticle;
