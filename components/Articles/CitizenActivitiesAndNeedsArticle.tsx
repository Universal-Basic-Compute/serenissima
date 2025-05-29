import React, { useRef, useEffect } from 'react';
import { FaTimes, FaBed, FaBriefcase, FaUtensils, FaHome, FaRoute, FaCog, FaExclamationTriangle, FaShip } from 'react-icons/fa';

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

          {/* Nouvelle section : Calendrier Quotidien par Classe Sociale */}
          <h3 className="text-2xl font-serif text-amber-700 mt-8 mb-6">Calendrier Quotidien Typique par Classe Sociale (XVe siècle, Venise)</h3>
          <p className="mb-6 text-sm italic">
            Ces emplois du temps sont une représentation généralisée et peuvent varier en fonction des jours spécifiques, des saisons, des obligations religieuses et des événements personnels. Ils visent à donner un aperçu du rythme de vie de chaque classe.
          </p>
          
          {(() => {
            const socialClassSchedules = [
              {
                name: "Facchini (Journaliers)",
                icon: <FaBriefcase className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Repos", start: 21, end: 5, color: "bg-sky-600", label: "R" },
                  { type: "Travail", start: 5, end: 12, color: "bg-orange-500", label: "T" },
                  { type: "Consommation/Activités", start: 12, end: 13, color: "bg-emerald-500", label: "A" },
                  { type: "Travail", start: 13, end: 19, color: "bg-orange-500", label: "T" },
                  { type: "Consommation/Activités", start: 19, end: 21, color: "bg-emerald-500", label: "A" },
                ],
                totals: { rest: 8, work: 13, activities: 3 },
                detailsTitle: "Activités typiques et particularités:",
                details: [
                  "Repas rapides et frugaux (ex: pain, oignons, vin dilué).",
                  "Fréquentation de tavernes modestes le soir pour socialiser.",
                  "Participation obligatoire à la messe dominicale et aux principales fêtes religieuses.",
                  "Travail physiquement exigeant, souvent dépendant des arrivages au port ou des besoins des marchands.",
                ],
              },
              {
                name: "Popolani (Artisans, Petits Commerçants)",
                icon: <FaCog className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Repos", start: 22, end: 6, color: "bg-sky-600", label: "R" },
                  { type: "Travail", start: 6, end: 12, color: "bg-orange-500", label: "T" },
                  { type: "Consommation/Activités", start: 12, end: 14, color: "bg-emerald-500", label: "A" },
                  { type: "Travail", start: 14, end: 18, color: "bg-orange-500", label: "T" },
                  { type: "Consommation/Activités", start: 18, end: 22, color: "bg-emerald-500", label: "A" },
                ],
                totals: { rest: 8, work: 10, activities: 6 },
                detailsTitle: "Activités typiques et particularités:",
                details: [
                  "Repas pris en famille, souvent à l'atelier ou au domicile.",
                  "Visites au marché (ex: Rialto) pour les provisions, notamment le samedi.",
                  "Participation aux fêtes de quartier (sestiere) et processions religieuses.",
                  "Engagement dans les activités de leur guilde (Scuola); réunions, devoirs religieux et sociaux.",
                ],
              },
              {
                name: "Cittadini (Bourgeoisie, Marchands, Fonctionnaires)",
                icon: <FaShip className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Repos", start: 23, end: 6, color: "bg-sky-600", label: "R" },
                  { type: "Consommation/Activités", start: 6, end: 7, color: "bg-emerald-500", label: "A" }, // Préparation, petit-déjeuner
                  { type: "Travail", start: 7, end: 12, color: "bg-orange-500", label: "T" }, // Bureau, commerce
                  { type: "Consommation/Activités", start: 12, end: 14, color: "bg-emerald-500", label: "A" }, // Déjeuner, affaires
                  { type: "Travail", start: 14, end: 17, color: "bg-orange-500", label: "T" }, // Suite affaires
                  { type: "Consommation/Activités", start: 17, end: 23, color: "bg-emerald-500", label: "A" }, // Social, dîner, loisirs
                ],
                totals: { rest: 7, work: 8, activities: 9 },
                detailsTitle: "Activités typiques et particularités:",
                details: [
                  "Petit-déjeuner souvent léger, parfois combiné à des discussions d'affaires.",
                  "Déjeuner plus formel, pouvant s'étendre pour des négociations.",
                  "Réceptions, banquets, et visites sociales en soirée.",
                  "Fréquentation de spectacles (théâtre, musique) si disponibles.",
                  "Participation active aux réunions des Scuole Grandi ou des guildes marchandes.",
                  "Gestion de la correspondance commerciale, tenue des livres de comptes.",
                ],
              },
              {
                name: "Nobili (Noblesse Patricienne)",
                icon: <FaLandmark className="mr-2 text-amber-700" />, // Using FaLandmark as an example
                schedule: [
                  { type: "Repos", start: 0, end: 8, color: "bg-sky-600", label: "R" },
                  { type: "Consommation/Activités", start: 8, end: 9, color: "bg-emerald-500", label: "A" }, // Toilette, prière, petit-déjeuner
                  { type: "Travail", start: 9, end: 12, color: "bg-orange-500", label: "T" }, // Conseils, affaires d'État
                  { type: "Consommation/Activités", start: 12, end: 15, color: "bg-emerald-500", label: "A" }, // Déjeuner, socialisation
                  { type: "Travail", start: 15, end: 17, color: "bg-orange-500", label: "T" }, // Affaires personnelles, gestion des biens
                  { type: "Consommation/Activités", start: 17, end: 0, color: "bg-emerald-500", label: "A" }, // Visites, réceptions, loisirs, politique informelle
                ],
                totals: { rest: 8, work: 5, activities: 11 },
                detailsTitle: "Activités typiques et particularités:",
                details: [
                  "Matinée consacrée à la toilette (souvent longue et élaborée), prières, et gestion des affaires domestiques.",
                  "Participation aux conseils gouvernementaux (Grand Conseil, Sénat, Conseil des Dix) selon leur rôle.",
                  "Longs repas sociaux, souvent utilisés pour des discussions politiques ou d'affaires.",
                  "Après-midi et soirées dédiées aux visites, réceptions, jeux (cartes, échecs), musique, danse, et parfois théâtre ou opéra.",
                  "Engagement dans la politique informelle, maintien des réseaux d'influence.",
                ],
              },
              {
                name: "Forestieri (Marchands Étrangers)",
                icon: <FaShip className="mr-2 text-amber-700" />,
                schedule: [
                  { type: "Consommation/Activités", start: 5, end: 6, color: "bg-emerald-500", label: "A" }, // Préparation
                  { type: "Travail", start: 6, end: 12, color: "bg-orange-500", label: "T" }, // Affaires matinales
                  { type: "Consommation/Activités", start: 12, end: 13, color: "bg-emerald-500", label: "A" }, // Repas d'affaires
                  { type: "Travail", start: 13, end: 20, color: "bg-orange-500", label: "T" }, // Affaires après-midi/soir
                  { type: "Consommation/Activités", start: 20, end: 23, color: "bg-emerald-500", label: "A" }, // Dîners stratégiques
                  { type: "Repos", start: 23, end: 5, color: "bg-sky-600", label: "R" },
                ],
                totals: { rest: 6, work: 13, activities: 5 }, // Adjusted total activities
                detailsTitle: "Détail des Activités (journée type pendant le séjour):",
                activityDetails: {
                  work: [
                    "6h-8h: Fondaco/douanes, formalités administratives, organisation de la journée.",
                    "8h-12h: Rialto - négociations intensives, ventes, achats, recherche d'informations.",
                    "13h-16h: Visites aux ateliers des fournisseurs, vérification de la qualité des marchandises commandées.",
                    "16h-18h: Rencontres avec les banquiers, gestion des lettres de change, contrats notariés.",
                    "18h-20h: Préparation du chargement pour le retour, inventaires, dernières instructions aux agents locaux.",
                  ],
                  consumption: [
                    "5h-6h: Préparation rapide, petit-déjeuner simple à l'auberge ou au Fondaco.",
                    "12h-13h: Repas d'affaires rapide mais crucial avec des partenaires locaux ou d'autres marchands étrangers.",
                    "20h-23h: Dîners stratégiques pour établir des contacts, négocier des accords futurs, ou obtenir des informations privilégiées.",
                  ],
                  particularities: [
                    "Logement principal au Fondaco dei Tedeschi (pour les Allemands), Fondaco dei Turchi, ou dans des auberges près du Rialto.",
                    "Temps à Venise généralement limité (ex: 2-4 semaines), donc journées de travail maximisées.",
                    "Peu de temps pour les loisirs personnels; les activités sociales sont souvent orientées affaires.",
                    "Dimanche peut être un jour légèrement plus léger, utilisé pour des visites culturelles (églises, reliques) ou pour du repos relatif, mais toujours avec un œil sur les affaires.",
                    "Souvent accompagnés d'interprètes ou de courtiers locaux (sensali) pour naviguer le marché vénitien.",
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
                      <span className="inline-block w-3 h-3 bg-sky-600 mr-1 rounded-sm"></span> Repos: {sc.totals.rest}h |
                      <span className="inline-block w-3 h-3 bg-orange-500 ml-2 mr-1 rounded-sm"></span> Travail: {sc.totals.work}h |
                      <span className="inline-block w-3 h-3 bg-emerald-500 ml-2 mr-1 rounded-sm"></span> Consommation/Activités: {sc.totals.activities}h
                    </p>
                    <h5 className="font-semibold text-amber-700 mt-3 mb-1 text-sm">{sc.detailsTitle}</h5>
                    <ul className="list-disc list-inside text-sm space-y-1 pl-1">
                      {sc.details?.map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                    {sc.activityDetails && (
                      <>
                        {sc.activityDetails.work && (
                          <>
                            <h6 className="font-semibold text-amber-600 mt-2 mb-0.5 text-xs">Détail Travail:</h6>
                            <ul className="list-disc list-inside text-xs space-y-0.5 pl-2">
                              {sc.activityDetails.work.map((item, idx) => <li key={`work-${idx}`}>{item}</li>)}
                            </ul>
                          </>
                        )}
                        {sc.activityDetails.consumption && (
                          <>
                            <h6 className="font-semibold text-amber-600 mt-2 mb-0.5 text-xs">Détail Consommation/Activités:</h6>
                            <ul className="list-disc list-inside text-xs space-y-0.5 pl-2">
                              {sc.activityDetails.consumption.map((item, idx) => <li key={`cons-${idx}`}>{item}</li>)}
                            </ul>
                          </>
                        )}
                        {sc.activityDetails.particularities && (
                           <>
                            <h6 className="font-semibold text-amber-600 mt-2 mb-0.5 text-xs">Particularités:</h6>
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
          {/* Fin de la nouvelle section */}

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
