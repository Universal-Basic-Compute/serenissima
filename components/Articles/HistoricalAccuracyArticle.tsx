import React from 'react';
import { FaTimes, FaBalanceScale, FaHistory, FaLandmark, FaUsers, FaShip, FaTree, FaCogs } from 'react-icons/fa';

interface HistoricalAccuracyArticleProps {
  onClose: () => void;
}

const HistoricalAccuracyArticle: React.FC<HistoricalAccuracyArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
        {/* Header - Fixed at the top */}
        <div className="sticky top-0 bg-amber-100 border-b border-amber-200 flex justify-between items-center p-4 z-10">
          <h2 className="text-2xl font-serif text-amber-900">Serenissima: A Realistic Simulation?</h2>
          <button 
            onClick={onClose}
            className="text-amber-900 hover:text-amber-700 p-2 rounded-full hover:bg-amber-200/50 transition-colors"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className="p-6 prose prose-amber max-w-none">
          {/* Introduction */}
          <div className="bg-amber-100/50 p-4 rounded-lg border-l-4 border-amber-600 mb-6">
            <p className="lead text-lg text-amber-900 italic">
              La Serenissima offers players a glimpse into Renaissance Venice, but how accurately does it reflect historical reality? This article explores the key differences between the game and 15th century Venice, examining where historical accuracy meets gameplay necessity.
            </p>
          </div>
          
          {/* Time Compression Section */}
          <section className="mb-8">
            <div className="flex items-center mb-2">
              <FaBalanceScale className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Time Compression: Balancing History and Gameplay</h3>
            </div>
            <p>
              Perhaps the most significant departure from reality is the game's approach to time. Renaissance Venice operated on a timeline spanning centuries, while players expect to see meaningful progress in hours or days.
            </p>
            
            <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
              <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
              The Time Compression Ratio
            </h4>
            <p>
              In La Serenissima, we use a time compression ratio of approximately 1:75 between real time and historical time:
            </p>
            <ul className="list-disc pl-6 my-3 space-y-1">
              <li>1 real-time day = 75 historical days (approximately 2.5 months)</li>
              <li>1 real-time week = 525 historical days (approximately 17.5 months)</li>
              <li>1 real-time month = 2,250 historical days (approximately 6.25 years)</li>
            </ul>
            <p>
              This compression allows players to experience historical developments that would normally take decades or centuries within a reasonable timeframe. However, for gameplay purposes, economic cycles operate on a 1:1 relationship with real time:
            </p>
            <ul className="list-disc pl-6 my-3 space-y-1">
              <li>Buildings generate income in real time</li>
              <li>Resources are consumed in real time</li>
              <li>Maintenance costs are charged in real time</li>
              <li>Contract fluctuations occur in real time</li>
            </ul>
            <p>
              This hybrid approach creates a more engaging experience where players see meaningful economic progress during each session while still experiencing the broader historical narrative at an accelerated pace.
            </p>
          </section>
          
          {/* Population and Scale Compression Section */}
          <section className="mb-8">
            <div className="flex items-center mb-2">
              <FaUsers className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Population and Scale Compression</h3>
            </div>
            <p>
              Just as we compress time, we also scale down Venice's population and physical infrastructure to create a manageable gameplay experience while maintaining historical authenticity.
            </p>
            
            <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
              <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
              Population and Building Compression
            </h4>
            <p>
              La Serenissima represents a carefully scaled miniaturization of Renaissance Venice:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h5 className="font-bold text-amber-900 mb-2">Historical Venice (circa 1525)</h5>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Population:</strong> Approximately 170,000-190,000 residents</li>
                  <li><strong>Buildings:</strong> Estimated 20,000-25,000 structures</li>
                  <li><strong>Density:</strong> ~7-9 residents per building on average</li>
                  <li><strong>Geographic Area:</strong> ~7 square kilometers (main island complex)</li>
                </ul>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h5 className="font-bold text-amber-900 mb-2">La Serenissima Game World</h5>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Population:</strong> Approximately 10,000 citizens</li>
                  <li><strong>Buildings:</strong> Around 1,700 structures</li>
                  <li><strong>Density:</strong> ~5.9 residents per building on average</li>
                  <li><strong>Geographic Area:</strong> Proportionally scaled (~0.4 square kilometers equivalent)</li>
                </ul>
              </div>
            </div>
            
            <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
              <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
              Compression Ratios
            </h4>
            <p>
              Our game uses the following compression ratios to balance historical authenticity with gameplay:
            </p>
            <ul className="list-disc pl-6 my-3 space-y-1">
              <li><strong>Population:</strong> Approximately 17:1 compression (historical : game)</li>
              <li><strong>Buildings:</strong> Approximately 13:1 compression (historical : game)</li>
              <li><strong>Geographic Scale:</strong> Proportionally compressed to maintain authentic urban density</li>
            </ul>
            
            <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
              <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
              Citizen Representation
            </h4>
            <p>
              Each AI citizen in La Serenissima represents approximately 10 working-age people from historical Venice:
            </p>
            <ul className="list-disc pl-6 my-3 space-y-1">
              <li>A single merchant in the game might represent a merchant family with their employees</li>
              <li>A craftsman represents a master with several journeymen and apprentices</li>
              <li>A laborer represents multiple workers who might share living quarters</li>
            </ul>
            <p>
              This abstraction allows us to simulate Venice's complex social and economic interactions without overwhelming players with thousands of individual citizens. It also explains why a single citizen can operate a business that would historically require multiple workers.
            </p>
            
            <div className="bg-amber-50 p-3 rounded border border-amber-200 mt-4">
              <p className="italic text-amber-800">
                This compression creates a manageable simulation while preserving Venice's essential character. The slightly lower density per building compared to historical reality (5.9 vs 7-9 residents) actually improves gameplay accessibility while still capturing the compressed urban feeling of Renaissance Venice.
              </p>
            </div>
            
            <p className="mt-4">
              At this scale, you're effectively experiencing key neighborhoods and districts rather than the entire city—a focus that aligns well with the guild-based gameplay and allows for a more intimate connection with the urban environment than would be possible at full historical scale.
            </p>
          </section>
          
          {/* Economic Simplification Section */}
          <section className="mb-8">
            <div className="flex items-center mb-2">
              <FaCogs className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Economic Simplification</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
                  <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
                  Currency and Ducats
                </h4>
                <p>
                  Renaissance Venice had a complex monetary system including various coins like the ducat, grosso, and lira. La Serenissima simplifies this into a dual-currency system:
                </p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li><strong>Ducats</strong>: The primary in-game currency representing traditional money</li>
                  <li><strong>$COMPUTE</strong>: The blockchain token that bridges the game economy with real-world value</li>
                </ul>
                <p>
                  While historical Venetian nobles might have wealth tied up in various assets, investments, and trade ventures across the Mediterranean, the game necessarily simplifies this complexity into more manageable systems.
                </p>
              </div>
              
              <div>
                <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
                  <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
                  Land Ownership and Development
                </h4>
                <p>
                  In historical Venice, land ownership was concentrated among nobili families, religious institutions, and the state itself. Building development was a slow, multi-generational process constrained by space limitations on the islands.
                </p>
                <p>
                  La Serenissima compresses this timeline dramatically:
                </p>
                <ul className="list-disc pl-6 my-3 space-y-1">
                  <li>Players can purchase land immediately rather than inheriting it over generations</li>
                  <li>Buildings can be constructed in days or weeks rather than years or decades</li>
                  <li>The density of development is simplified for gameplay purposes</li>
                </ul>
              </div>
            </div>
          </section>
          
          {/* Social Structure Section */}
          <section className="mb-8">
            <div className="flex items-center mb-2">
              <FaUsers className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Social Structure Adaptations</h3>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <h4 className="text-lg font-serif text-amber-800 mt-0 mb-2 flex items-center">
                <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
                The Venetian Class System
              </h4>
              <p>
                Historical Venice had a rigid social hierarchy:
              </p>
              <ul className="list-disc pl-6 my-3 space-y-1">
                <li><strong>Nobili</strong>: The noble families who controlled the government</li>
                <li><strong>Cittadini Originari</strong>: Ducatsy non-nobles who held important bureaucratic positions</li>
                <li><strong>Popolani</strong>: Common citizens including merchants, artisans, and workers</li>
                <li><strong>Forestieri</strong>: Foreigners with limited rights</li>
              </ul>
              <p>
                La Serenissima adapts this system to be more accessible to players, allowing greater social mobility than would have been possible historically. While the game maintains distinctions between social classes, players can advance through economic success rather than being permanently restricted by birth status.
              </p>
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-lg font-serif text-amber-800 mt-0 mb-2 flex items-center">
                <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
                Government and Politics
              </h4>
              <p>
                The Venetian Republic was governed through a complex system including:
              </p>
              <ul className="list-disc pl-6 my-3 space-y-1">
                <li>The Great Council (Maggior Consiglio)</li>
                <li>The Senate (Consiglio dei Pregadi)</li>
                <li>The Council of Ten (Consiglio dei Dieci)</li>
                <li>The Doge (elected for life)</li>
              </ul>
              <p>
                While La Serenissima incorporates these institutions, it necessarily simplifies their operations and accelerates political processes that would historically take months or years of deliberation.
              </p>
            </div>
          </section>
          
          {/* Trade and Commerce Section */}
          <section className="mb-8">
            <div className="flex items-center mb-2">
              <FaShip className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Trade and Commerce Adaptations</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
                  <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
                  Geographic Scope
                </h4>
                <p>
                  Historical Venice maintained a vast trading network spanning the Mediterranean and beyond, with colonies and trading posts from the Adriatic to the Black Sea and Eastern Mediterranean.
                </p>
                <p>
                  The game focuses primarily on Venice itself and its immediate surroundings, with distant trade represented through simplified mechanics rather than direct player management of far-flung commercial outposts.
                </p>
              </div>
              
              <div>
                <h4 className="text-lg font-serif text-amber-800 mt-4 flex items-center">
                  <span className="w-1 h-6 bg-amber-500 inline-block mr-2"></span>
                  Resource Management
                </h4>
                <p>
                  Venice relied on imports for most raw materials and food, with complex supply chains bringing goods from mainland territories and distant trading partners.
                </p>
                <p>
                  La Serenissima abstracts this complexity into more manageable resource systems that players can directly interact with, rather than modeling the full complexity of Renaissance supply chains.
                </p>
              </div>
            </div>
          </section>
          
          {/* Technology Section */}
          <section className="mb-8">
            <div className="flex items-center mb-2">
              <FaCogs className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Technological Progression</h3>
            </div>
            <p>
              In reality, technological change during the Renaissance was gradual, with innovations spreading slowly across Europe. La Serenissima compresses this timeline, allowing players to research and implement technological advancements at a much faster pace than would have been historically accurate.
            </p>
          </section>
          
          {/* Conclusion Section */}
          <section className="bg-amber-100/50 p-4 rounded-lg border-l-4 border-amber-600 mt-8">
            <div className="flex items-center mb-2">
              <FaLandmark className="text-amber-700 mr-2" size={20} />
              <h3 className="text-xl font-serif text-amber-800 mt-0">Conclusion: Simulation vs. Experience</h3>
            </div>
            <p>
              La Serenissima is not intended as a perfect historical simulation of Renaissance Venice, but rather as an engaging experience that captures the essence of the period while remaining accessible and enjoyable as a game.
            </p>
            <p>
              The time compression, economic simplifications, and gameplay adaptations serve to translate the fascinating world of Renaissance Venice into an interactive experience where players can participate in building and governing their own version of the Most Serene Republic.
            </p>
            <p className="mb-0">
              These design choices reflect the necessary balance between historical authenticity and gameplay engagement, creating a world that feels historically grounded while still offering the agency and progression that players expect from a modern game.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default HistoricalAccuracyArticle;
