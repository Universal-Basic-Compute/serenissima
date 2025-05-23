import React, { useRef, useEffect } from 'react';
import { FaTimes, FaBed, FaBriefcase, FaUtensils, FaHome, FaRoute, FaCog, FaExclamationTriangle } from 'react-icons/fa';

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
              Failure to meet these needs can lead to problems, such as homelessness or hunger, which in turn reduce a citizen's productivity and overall effectiveness. For example, a homeless or hungry worker may operate at only 50% (or even 25% if both conditions apply) of their normal production speed.
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
              { icon: FaBriefcase, title: "Work", description: "Employed citizens spend their daytime hours at their assigned businesses. This is where they contribute to the economy and earn their wages." },
              { icon: FaCog, title: "Production", description: "While at their workplace, citizens may engage in 'production' activities. This involves transforming input resources into output resources according to specific recipes, forming the backbone of Venice's industry." },
              { icon: FaRoute, title: "Fetch Resource / Fetch From Galley", description: "Citizens may travel to a source building (including a temporary merchant galley) to pick up resources as per a contract or import manifest. Upon arrival, they acquire the specified resources, which are then carried (owned by the contract's buyer) to an ultimate destination, often triggering a subsequent travel activity like 'deliver_resource_batch'." },
              { icon: FaExclamationTriangle, title: "Idle", description: "If a citizen has no specific task, if pathfinding fails, or if prerequisite conditions for other activities aren't met, they may become 'idle'. This is usually a temporary state before the system assigns a new activity." }
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

          <h3 className="text-2xl font-serif text-amber-700 mt-6 mb-4">Observing and Interacting</h3>
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
