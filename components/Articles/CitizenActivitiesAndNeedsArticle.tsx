import React, { useRef, useEffect } from 'react';
import { FaTimes, FaBed, FaBriefcase, FaUtensils, FaHome, FaRoute, FaCog, FaExclamationTriangle, FaShip, FaLandmark } from 'react-icons/fa';

interface CitizenActivitiesAndNeedsArticleProps {
  onClose?: () => void;
}

const CitizenActivitiesAndNeedsArticle: React.FC<CitizenActivitiesAndNeedsArticleProps> = ({ onClose }) => {
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (articleRef.current && !articleRef.current.contains(event.target as Node) && onClose) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
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
            The Daily Life of a Venetian: Activities & Needs
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
            Understanding the Rhythms and Requirements of Citizens in La Serenissima.
          </p>

          <h3 className="text-2xl font-serif text-amber-700 mb-4">A Simulated Existence</h3>
          <p className="mb-4">
            In La Serenissima, every citizen, whether AI-controlled or player-managed, leads a simulated life filled with activities and driven by fundamental needs. This system creates a dynamic and immersive Venice, where the populace isn't static but actively engages with the world around them. Understanding these mechanics is key to managing your own citizens effectively and interacting with the broader economy.
          </p>

          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-3">Carrying Capacity and Porters</h4>
            <p className="mb-3 text-sm">
              Citizens in La Serenissima have a base carrying capacity, currently set at <strong>10 units</strong> of resources. This represents what an individual can reasonably transport without specialized equipment.
            </p>
            <p className="mb-3 text-sm">
              Historically, Venetian porters (`facchini`) were essential for moving goods through the city's narrow streets and over its many stepped bridges. With equipment like carrying frames (`gerle` - large baskets worn on the back) or yokes, a strong porter could carry significantly more – often 50-70kg (double or triple what one might carry in a simple sack).
            </p>
            <p className="mb-3 text-sm">
              In future updates, "Porter's Equipment" might be introduced as an item or upgrade. If a citizen were equipped with such, their carrying capacity could increase substantially, perhaps to 25-30 units, allowing them to transport <strong>15-20 additional units</strong> per trip. This would make logistics and trade more efficient, especially for businesses relying on manual transport.
            </p>
          </div>

          <div className="bg-amber-100 p-5 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-3">Core Citizen Needs</h4>
            <p className="mb-3">
              Every citizen in Venice strives to meet these fundamental requirements:
            </p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-amber-50 p-3 rounded border border-amber-200 text-center">
                <FaHome className="text-3xl text-amber-700 mx-auto mb-2" />
                <h5 className="font-bold text-amber-900 mb-1">Housing</h5>
                <p className="text-sm">A place to live, appropriate to their social class. Essential for rest and well-being.</p>
              </div>
              <div className="bg-amber-50 p-3 rounded border border-amber-200 text-center">
                <FaUtensils className="text-3xl text-amber-700 mx-auto mb-2" />
                <h5 className="font-bold text-amber-900 mb-1">Food</h5>
                <p className="text-sm">Regular meals to maintain health and productivity. Hunger impacts their ability to work effectively.</p>
              </div>
              <div className="bg-amber-50 p-3 rounded border border-amber-200 text-center">
                <FaBriefcase className="text-3xl text-amber-700 mx-auto mb-2" />
                <h5 className="font-bold text-amber-900 mb-1">Employment</h5>
                <p className="text-sm">A job to earn Ducats, afford necessities, and contribute to the economy.</p>
              </div>
            </div>
            <p className="mt-3 text-sm">
              Failure to meet these needs can lead to problems, such as homelessness or hunger, which in turn reduce a citizen's productivity and overall effectiveness. A hungry citizen suffers a 50% productivity reduction. A homeless citizen also suffers a 50% productivity reduction. If a citizen is both hungry and homeless, these penalties can stack, potentially reducing productivity to 25% or even lower. These issues will be flagged in the Problem system.
            </p>
          </div>

          <h3 className="text-2xl font-serif text-amber-700 mb-4">The Cycle of Daily Activities</h3>
          <p className="mb-4">
            Citizens engage in a variety of activities throughout the day, managed by the game's engine. These activities are crucial for the functioning of the Venetian economy:
          </p>

          <div className="space-y-4">
            {[
              { icon: FaBed, title: "Rest", description: "During nighttime hours (typically 10 PM to 6 AM Venice time), citizens seek to rest, usually in their homes or an inn if they are visitors. Proper rest is vital for recuperation." },
              { icon: FaRoute, title: "Travel (Goto Activities)", description: "Citizens move between locations for various purposes. This includes `goto_home` to return to their residence, `goto_work` to travel to their workplace, and `goto_inn` for visitors seeking lodging. These activities use realistic pathfinding through Venice's streets and canals." },
              { icon: FaBriefcase, title: "Work", description: "Employed citizens spend their daytime hours at their assigned businesses. This is where they contribute to the economy and earn their wages. For service-oriented businesses like Warehouses, 'work' might involve general upkeep, ensuring the facility is operational for clients, and administrative tasks rather than direct production of goods." },
              { icon: FaCog, title: "Production", description: "While at their workplace, citizens may engage in 'production' activities. This involves transforming input resources into output resources according to specific recipes, forming the backbone of Venice's industry. The processor consumes inputs and adds outputs if conditions are met." },
              { icon: FaUtensils, title: "Eating Activities", description: "Triggered when a citizen's `AteAt` timestamp is older than 12 hours. Can be `eat_from_inventory` (consumes food they carry), `eat_at_home` (consumes food they own at home), or `eat_at_tavern` (pays Ducats for a meal). Travel may precede eating at home or a tavern." },
              { icon: FaRoute, title: "Fetch Resource", description: "Citizen travels to a source building (`FromBuilding`) to pick up resources as per a contract. Upon arrival, the buyer pays the seller, and the resource is transferred to the citizen's inventory (owned by the buyer), limited by their carrying capacity (base 10 units, potentially more with equipment) and funds. A subsequent `deliver_resource_batch` activity usually follows." },
              { icon: FaShip, title: "Fetch From Galley", description: "Citizen travels to a `merchant_galley` to pick up imported resources. Resources are transferred from the galley (owned by the merchant) to the citizen's inventory (owned by the original contract's buyer), respecting their carrying capacity. This triggers a `deliver_resource_batch` activity to the final buyer." },
              { icon: FaRoute, title: "Deliver Resource Batch", description: "Citizen transports resources (fetched from a galley or another building) to a final destination building. Upon arrival, resources are transferred, and financial transactions for the original contract are settled." },
              { icon: FaRoute, title: "Leave Venice", description: "A Forestiero (visitor) travels to an exit point. Upon arrival, their assets are liquidated, and their `InVenice` status is set to `FALSE`." },
              { icon: FaExclamationTriangle, title: "Idle", description: "If a citizen has no specific task, if pathfinding fails, or if prerequisite conditions for other activities aren't met (e.g., lack of input resources for production), they may become 'idle'. This is usually a temporary state before the system assigns a new activity." }
            ].map(activity => (
              <div key={activity.title} className="bg-amber-100 p-4 rounded-lg border border-amber-300 flex items-start">
                <activity.icon className="text-2xl text-amber-700 mr-4 mt-1 flex-shrink-0" />
                <div>
                  <h4 className="text-xl font-serif text-amber-800 mb-1">{activity.title}</h4>
                  <p className="text-sm">{activity.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* New Section: Daily Schedule by Social Class */}
          <h3 className="text-2xl font-serif text-amber-700 mt-8 mb-6">Typical Daily Schedule by Social Class (15th Century Venice)</h3>
          <p className="mb-6 text-sm italic">
            These schedules are generalized representations and can vary based on specific days, seasons, religious obligations, and personal events. They aim to provide an overview of the rhythm of life for each class.
          </p>
          
          {(() => {
            const socialClassSchedules = [
              {
                name: "Facchini (Day Laborers)",
                icon: <FaBriefcase className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Rest", start: 21, end: 5, color: "bg-sky-600", label: "R" },
                  { type: "Work", start: 5, end: 12, color: "bg-orange-500", label: "W" },
                  { type: "Consumption/Activities", start: 12, end: 13, color: "bg-emerald-500", label: "A" },
                  { type: "Work", start: 13, end: 19, color: "bg-orange-500", label: "W" },
                  { type: "Consumption/Activities", start: 19, end: 21, color: "bg-emerald-500", label: "A" },
                ],
                totals: { rest: 8, work: 13, activities: 3 },
                detailsTitle: "Typical Activities & Particularities:",
                details: [
                  "Quick and frugal meals (e.g., bread, onions, diluted wine).",
                  "Frequent modest taverns in the evening to socialize.",
                  "Mandatory attendance at Sunday Mass and major religious festivals.",
                  "Physically demanding work, often dependent on port arrivals or merchant needs.",
                ],
              },
              {
                name: "Popolani (Artisans, Small Shopkeepers)",
                icon: <FaCog className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Rest", start: 22, end: 6, color: "bg-sky-600", label: "R" },
                  { type: "Work", start: 6, end: 12, color: "bg-orange-500", label: "W" },
                  { type: "Consumption/Activities", start: 12, end: 14, color: "bg-emerald-500", label: "A" },
                  { type: "Work", start: 14, end: 18, color: "bg-orange-500", label: "W" },
                  { type: "Consumption/Activities", start: 18, end: 22, color: "bg-emerald-500", label: "A" },
                ],
                totals: { rest: 8, work: 10, activities: 6 },
                detailsTitle: "Typical Activities & Particularities:",
                details: [
                  "Meals taken with family, often in the workshop or home.",
                  "Visits to the market (e.g., Rialto) for provisions, especially on Saturdays.",
                  "Participation in neighborhood (sestiere) festivals and religious processions.",
                  "Engagement in their guild (Scuola) activities; meetings, religious and social duties.",
                ],
              },
              {
                name: "Cittadini (Bourgeoisie, Merchants, Officials)",
                icon: <FaShip className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Rest", start: 23, end: 6, color: "bg-sky-600", label: "R" },
                  { type: "Consumption/Activities", start: 6, end: 7, color: "bg-emerald-500", label: "A" }, // Preparation, breakfast
                  { type: "Work", start: 7, end: 12, color: "bg-orange-500", label: "W" }, // Office, trade
                  { type: "Consumption/Activities", start: 12, end: 14, color: "bg-emerald-500", label: "A" }, // Lunch, business
                  { type: "Work", start: 14, end: 17, color: "bg-orange-500", label: "W" }, // Continued business
                  { type: "Consumption/Activities", start: 17, end: 23, color: "bg-emerald-500", label: "A" }, // Social, dinner, leisure
                ],
                totals: { rest: 7, work: 8, activities: 9 },
                detailsTitle: "Typical Activities & Particularities:",
                details: [
                  "Often light breakfast, sometimes combined with business discussions.",
                  "More formal lunch, which could extend for negotiations.",
                  "Receptions, banquets, and social visits in the evening.",
                  "Attendance at performances (theatre, music) if available.",
                  "Active participation in meetings of the Scuole Grandi or merchant guilds.",
                  "Management of commercial correspondence, bookkeeping.",
                ],
              },
              {
                name: "Nobili (Patrician Nobility)",
                icon: <FaLandmark className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Rest", start: 0, end: 8, color: "bg-sky-600", label: "R" },
                  { type: "Consumption/Activities", start: 8, end: 0, color: "bg-emerald-500", label: "A" }, // Covers 8 AM to midnight
                ],
                totals: { rest: 8, work: 0, activities: 16 }, // Work is 0, Activities is 11 + 5 = 16
                detailsTitle: "Typical Activities & Particularities:",
                details: [
                  "Mornings dedicated to elaborate grooming, prayers, and managing household affairs.",
                  "Participation in state councils (Great Council, Senate, Council of Ten) as a social and political obligation, part of their societal role and power maintenance.",
                  "Extended social meals, often used for political discussions and networking.",
                  "Afternoons and evenings dedicated to social visits, receptions, games (cards, chess), music, dance, and occasionally theatre or opera.",
                  "Engagement in informal politics and maintaining networks of influence.",
                ],
              },
              {
                name: "Forestieri (Foreign Merchants)",
                icon: <FaShip className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Consumption/Activities", start: 5, end: 6, color: "bg-emerald-500", label: "A" }, // Preparation
                  { type: "Work", start: 6, end: 12, color: "bg-orange-500", label: "W" }, // Morning business
                  { type: "Consumption/Activities", start: 12, end: 13, color: "bg-emerald-500", label: "A" }, // Business lunch
                  { type: "Work", start: 13, end: 20, color: "bg-orange-500", label: "W" }, // Afternoon/evening business
                  { type: "Consumption/Activities", start: 20, end: 23, color: "bg-emerald-500", label: "A" }, // Strategic dinners
                  { type: "Rest", start: 23, end: 5, color: "bg-sky-600", label: "R" },
                ],
                totals: { rest: 6, work: 13, activities: 5 },
                detailsTitle: "Activity Details (typical day during stay):",
                activityDetails: {
                  work: [
                    "6h-8h: Fondaco/customs, administrative formalities, day planning.",
                    "8h-12h: Rialto - intensive negotiations, sales, purchases, information gathering.",
                    "13h-16h: Visits to suppliers' workshops, checking the quality of ordered goods.",
                    "16h-18h: Meetings with bankers, managing bills of exchange, notarized contracts.",
                    "18h-20h: Preparing return cargo, inventories, final instructions to local agents.",
                  ],
                  consumption: [
                    "5h-6h: Quick preparation, simple breakfast at the inn or Fondaco.",
                    "12h-13h: Quick but crucial business lunch with local partners or other foreign merchants.",
                    "20h-23h: Strategic dinners to establish contacts, negotiate future deals, or obtain privileged information.",
                  ],
                  particularities: [
                    "Main lodging at Fondaco dei Tedeschi (for Germans), Fondaco dei Turchi, or inns near Rialto.",
                    "Time in Venice generally limited (e.g., 2-4 weeks), so workdays are maximized.",
                    "Little time for personal leisure; social activities are often business-oriented.",
                    "Sunday may be a slightly lighter day, used for cultural visits (churches, relics) or relative rest, but always with an eye on business.",
                    "Often accompanied by interpreters or local brokers (sensali) to navigate the Venetian market.",
                  ],
                },
              },
            ];

            const HourBar = ({ schedule }: { schedule: Array<{ type: string; start: number; end: number; color: string; label: string }> }) => {
              const hours = Array.from({ length: 24 }, (_, i) => i); // 0 to 23

              const getBlockForHour = (hour: number) => {
                for (const block of schedule) {
                  let { start, end } = block;
                  // Handle blocks crossing midnight for comparison
                  if (start > end) { // e.g. Repos 21h-5h
                    if (hour >= start || hour < end) return block;
                  } else {
                    if (hour >= start && hour < end) return block;
                  }
                }
                return null; // Should not happen if schedule covers 24h
              };

              return (
                <div className="flex w-full h-8 border border-amber-400 rounded overflow-hidden my-2 shadow-inner">
                  {hours.map(hour => {
                    const block = getBlockForHour(hour);
                    const bgColor = block ? block.color : "bg-gray-300";
                    const label = block ? block.label : "";
                    // Display hour number for 0, 6, 12, 18
                    const showHourNumber = hour % 6 === 0;
                    return (
                      <div
                        key={hour}
                        title={`${hour}:00 - ${hour + 1}:00 : ${block?.type || 'Unknown'}`}
                        className={`flex-1 ${bgColor} flex items-center justify-center relative text-xs font-medium text-white/80 hover:opacity-80 transition-opacity`}
                      >
                        {label}
                        {showHourNumber && (
                           <span className="absolute -bottom-4 text-[8px] text-amber-700">{hour}h</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            };

            return (
              <div className="space-y-8">
                {socialClassSchedules.map(sc => (
                  <div key={sc.name} className="bg-amber-100 p-4 rounded-lg border border-amber-300 shadow">
                    <h4 className="text-xl font-serif text-amber-800 mb-1 flex items-center">
                      {sc.icon} {sc.name}
                    </h4>
                    <HourBar schedule={sc.schedule} />
                    <p className="text-xs text-amber-700 mb-2">
                      <span className="inline-block w-3 h-3 bg-sky-600 mr-1 rounded-sm"></span> Rest: {sc.totals.rest}h |
                      <span className="inline-block w-3 h-3 bg-orange-500 ml-2 mr-1 rounded-sm"></span> Work: {sc.totals.work}h |
                      <span className="inline-block w-3 h-3 bg-emerald-500 ml-2 mr-1 rounded-sm"></span> Consumption/Activities: {sc.totals.activities}h
                    </p>
                    <h5 className="font-semibold text-amber-700 mt-3 mb-1 text-sm">{sc.detailsTitle}</h5>
                    <ul className="list-disc list-inside text-sm space-y-1 pl-1">
                      {sc.details?.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                    {sc.activityDetails && (
                      <>
                        {sc.activityDetails.work && (
                          <>
                            <h6 className="font-semibold text-amber-600 mt-2 mb-0.5 text-xs">Work Details:</h6>
                            <ul className="list-disc list-inside text-xs space-y-0.5 pl-2">
                              {sc.activityDetails.work.map((item, idx) => <li key={`work-${idx}`}>{item}</li>)}
                            </ul>
                          </>
                        )}
                        {sc.activityDetails.consumption && (
                          <>
                            <h6 className="font-semibold text-amber-600 mt-2 mb-0.5 text-xs">Consumption/Activities Details:</h6>
                            <ul className="list-disc list-inside text-xs space-y-0.5 pl-2">
                              {sc.activityDetails.consumption.map((item, idx) => <li key={`cons-${idx}`}>{item}</li>)}
                            </ul>
                          </>
                        )}
                        {sc.activityDetails.particularities && (
                           <>
                            <h6 className="font-semibold text-amber-600 mt-2 mb-0.5 text-xs">Particularities:</h6>
                            <ul className="list-disc list-inside text-xs space-y-0.5 pl-2">
                              {sc.activityDetails.particularities.map((item, idx) => <li key={`part-${idx}`}>{item}</li>)}
                            </ul>
                           </>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          {/* End of new section */}

          <h3 className="text-2xl font-serif text-amber-700 mt-8 mb-4">Observing and Interacting</h3>
          <p className="mb-4">
            Players can observe these activities in real-time on the game map. Citizens will be seen moving along paths, residing in buildings, or working at businesses. Clicking on a citizen or a building can provide more details about their current status and activities.
          </p>
          <p className="mb-4">
            While the system automates many of these activities for both AI and human-controlled citizens (if not actively managed), player decisions heavily influence them. For instance:
          </p>
          <ul className="list-disc pl-5 space-y-1 mb-6 text-sm">
            <li>Providing housing for your citizens prevents homelessness.</li>
            <li>Ensuring your businesses have necessary input resources enables production activities.</li>
            <li>Setting up contracts can trigger resource fetching activities.</li>
            <li>Managing your citizen's Ducats ensures they can afford food and rent.</li>
          </ul>

          <div className="mt-8 p-6 bg-amber-200 rounded-lg border border-amber-400">
            <h4 className="text-xl font-serif text-amber-800 mb-2">A Living Economy</h4>
            <p className="text-amber-800">
              The interplay of citizen needs and activities creates a vibrant, self-regulating economy. A well-housed, well-fed, and employed populace is a productive one. By understanding and catering to these fundamental aspects of Venetian life, players can foster thriving communities and successful enterprises.
            </p>
          </div>
        </div>

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

export default CitizenActivitiesAndNeedsArticle;
