import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface HistoricalAccuracyArticleProps {
  onClose: () => void;
}

const HistoricalAccuracyArticle: React.FC<HistoricalAccuracyArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-amber-100 border-b border-amber-200 flex justify-between items-center p-4 z-10">
          <h2 className="text-2xl font-serif text-amber-900">Serenissima: A Realistic Simulation?</h2>
          <button 
            onClick={onClose}
            className="text-amber-900 hover:text-amber-700 p-2"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>
        
        <div className="p-6 prose prose-amber max-w-none">
          <p className="lead text-lg">
            La Serenissima offers players a glimpse into Renaissance Venice, but how accurately does it reflect historical reality? This article explores the key differences between the game and 15th century Venice, examining where historical accuracy meets gameplay necessity.
          </p>
          
          <h3 className="text-xl font-serif text-amber-800 mt-6">Time Compression: Balancing History and Gameplay</h3>
          <p>
            Perhaps the most significant departure from reality is the game's approach to time. Renaissance Venice operated on a timeline spanning centuries, while players expect to see meaningful progress in hours or days.
          </p>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">The Time Compression Ratio</h4>
          <p>
            In La Serenissima, we use a time compression ratio of approximately 1:75 between real time and historical time:
          </p>
          <ul className="list-disc pl-6 my-3">
            <li>1 real-time day = 75 historical days (approximately 2.5 months)</li>
            <li>1 real-time week = 525 historical days (approximately 17.5 months)</li>
            <li>1 real-time month = 2,250 historical days (approximately 6.25 years)</li>
          </ul>
          <p>
            This compression allows players to experience historical developments that would normally take decades or centuries within a reasonable timeframe. However, for gameplay purposes, economic cycles operate on a 1:1 relationship with real time:
          </p>
          <ul className="list-disc pl-6 my-3">
            <li>Buildings generate income in real time</li>
            <li>Resources are consumed in real time</li>
            <li>Maintenance costs are charged in real time</li>
            <li>Market fluctuations occur in real time</li>
          </ul>
          <p>
            This hybrid approach creates a more engaging experience where players see meaningful economic progress during each session while still experiencing the broader historical narrative at an accelerated pace.
          </p>
          
          <h3 className="text-xl font-serif text-amber-800 mt-6">Economic Simplification</h3>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">Currency and Wealth</h4>
          <p>
            Renaissance Venice had a complex monetary system including various coins like the ducat, grosso, and lira. La Serenissima simplifies this into a dual-currency system:
          </p>
          <ul className="list-disc pl-6 my-3">
            <li><strong>Ducats</strong>: The primary in-game currency representing traditional money</li>
            <li><strong>$COMPUTE</strong>: The blockchain token that bridges the game economy with real-world value</li>
          </ul>
          <p>
            While historical Venetian nobles might have wealth tied up in various assets, investments, and trade ventures across the Mediterranean, the game necessarily simplifies this complexity into more manageable systems.
          </p>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">Land Ownership and Development</h4>
          <p>
            In historical Venice, land ownership was concentrated among patrician families, religious institutions, and the state itself. Building development was a slow, multi-generational process constrained by space limitations on the islands.
          </p>
          <p>
            La Serenissima compresses this timeline dramatically:
          </p>
          <ul className="list-disc pl-6 my-3">
            <li>Players can purchase land immediately rather than inheriting it over generations</li>
            <li>Buildings can be constructed in days or weeks rather than years or decades</li>
            <li>The density of development is simplified for gameplay purposes</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-6">Social Structure Adaptations</h3>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">The Venetian Class System</h4>
          <p>
            Historical Venice had a rigid social hierarchy:
          </p>
          <ul className="list-disc pl-6 my-3">
            <li><strong>Patricians</strong>: The noble families who controlled the government</li>
            <li><strong>Cittadini Originari</strong>: Wealthy non-nobles who held important bureaucratic positions</li>
            <li><strong>Popolani</strong>: Common citizens including merchants, artisans, and workers</li>
            <li><strong>Forestieri</strong>: Foreigners with limited rights</li>
          </ul>
          <p>
            La Serenissima adapts this system to be more accessible to players, allowing greater social mobility than would have been possible historically. While the game maintains distinctions between social classes, players can advance through economic success rather than being permanently restricted by birth status.
          </p>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">Government and Politics</h4>
          <p>
            The Venetian Republic was governed through a complex system including:
          </p>
          <ul className="list-disc pl-6 my-3">
            <li>The Great Council (Maggior Consiglio)</li>
            <li>The Senate (Consiglio dei Pregadi)</li>
            <li>The Council of Ten (Consiglio dei Dieci)</li>
            <li>The Doge (elected for life)</li>
          </ul>
          <p>
            While La Serenissima incorporates these institutions, it necessarily simplifies their operations and accelerates political processes that would historically take months or years of deliberation.
          </p>
          
          <h3 className="text-xl font-serif text-amber-800 mt-6">Trade and Commerce Adaptations</h3>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">Geographic Scope</h4>
          <p>
            Historical Venice maintained a vast trading network spanning the Mediterranean and beyond, with colonies and trading posts from the Adriatic to the Black Sea and Eastern Mediterranean.
          </p>
          <p>
            The game focuses primarily on Venice itself and its immediate surroundings, with distant trade represented through simplified mechanics rather than direct player management of far-flung commercial outposts.
          </p>
          
          <h4 className="text-lg font-serif text-amber-800 mt-4">Resource Management</h4>
          <p>
            Venice relied on imports for most raw materials and food, with complex supply chains bringing goods from mainland territories and distant trading partners.
          </p>
          <p>
            La Serenissima abstracts this complexity into more manageable resource systems that players can directly interact with, rather than modeling the full complexity of Renaissance supply chains.
          </p>
          
          <h3 className="text-xl font-serif text-amber-800 mt-6">Technological Progression</h3>
          <p>
            In reality, technological change during the Renaissance was gradual, with innovations spreading slowly across Europe. La Serenissima compresses this timeline, allowing players to research and implement technological advancements at a much faster pace than would have been historically accurate.
          </p>
          
          <h3 className="text-xl font-serif text-amber-800 mt-6">Conclusion: Simulation vs. Experience</h3>
          <p>
            La Serenissima is not intended as a perfect historical simulation of Renaissance Venice, but rather as an engaging experience that captures the essence of the period while remaining accessible and enjoyable as a game.
          </p>
          <p>
            The time compression, economic simplifications, and gameplay adaptations serve to translate the fascinating world of Renaissance Venice into an interactive experience where players can participate in building and governing their own version of the Most Serene Republic.
          </p>
          <p>
            These design choices reflect the necessary balance between historical authenticity and gameplay engagement, creating a world that feels historically grounded while still offering the agency and progression that players expect from a modern game.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HistoricalAccuracyArticle;
import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface HistoricalAccuracyArticleProps {
  onClose: () => void;
}

const HistoricalAccuracyArticle: React.FC<HistoricalAccuracyArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Historical Accuracy in La Serenissima
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Close article"
          >
            <FaTimes size={24} />
          </button>
        </div>
        
        <div className="prose prose-amber max-w-none">
          <p className="lead text-lg text-amber-900 mb-6 font-serif italic">
            La Serenissima strives to balance historical authenticity with engaging gameplay. This article explores our approach to historical accuracy and the research that informs our recreation of Renaissance Venice.
          </p>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Our Approach to Historical Accuracy</h3>
          
          <p>
            When developing La Serenissima, we established a set of principles to guide our approach to historical accuracy:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li><strong>Authentic Core Experience:</strong> The fundamental systems, structures, and aesthetics of Venice are represented accurately.</li>
            <li><strong>Informed Abstraction:</strong> Where gameplay requires simplification, we make historically informed choices.</li>
            <li><strong>Educational Value:</strong> Historical information is integrated into the experience to educate players about Renaissance Venice.</li>
            <li><strong>Transparent Deviations:</strong> When we deviate from history for gameplay reasons, we acknowledge and explain these choices.</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Geographic Accuracy</h3>
          
          <p>
            The geography of La Serenissima is based on historical maps and records from the 16th century. We've recreated:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>The distinctive shape of the Venetian lagoon and its major islands</li>
            <li>The Grand Canal's serpentine path through the city</li>
            <li>The locations of major landmarks such as the Piazza San Marco, Rialto Bridge, and Arsenal</li>
            <li>The six historic sestieri (districts) of Venice</li>
          </ul>
          
          <p>
            While we've maintained geographical accuracy in the layout, we've made some practical simplifications:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>Some smaller canals are omitted for navigational clarity</li>
            <li>The scale is slightly compressed to improve gameplay pacing</li>
            <li>Land parcels are somewhat regularized to facilitate the building system</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Economic Systems</h3>
          
          <p>
            The economic systems in La Serenissima are based on historical Venetian practices:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>The resource system reflects Venice's role as a trade intermediary between East and West</li>
            <li>The closed economic loop mirrors Venice's careful management of wealth and resources</li>
            <li>The banking system is inspired by the sophisticated financial instruments developed in Renaissance Venice</li>
            <li>Land ownership and leasing systems reflect the complex property arrangements of historical Venice</li>
          </ul>
          
          <p>
            For gameplay purposes, we've made some economic simplifications:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>Production chains are streamlined compared to historical processes</li>
            <li>The time scale of economic activities is compressed</li>
            <li>The $COMPUTE token serves as an abstraction of the complex Venetian ducat system</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Governance and Social Structure</h3>
          
          <p>
            Venice's unique republican governance system is represented in La Serenissima:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>The Council of Ten's role in governance and decision-making</li>
            <li>The patrician class system and its control over politics and trade</li>
            <li>The complex web of guilds and their economic influence</li>
            <li>The importance of family connections and alliances</li>
          </ul>
          
          <p>
            Some governance aspects are adapted for gameplay:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>Players can rise in status more rapidly than would have been historically possible</li>
            <li>The decree system simplifies the complex legislative process of the Republic</li>
            <li>Guild mechanics are streamlined to focus on gameplay impact</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Architecture and Aesthetics</h3>
          
          <p>
            The visual representation of Venice in La Serenissima draws from extensive architectural research:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>Building designs are based on surviving structures and historical documentation</li>
            <li>The distinctive Venetian Gothic and Renaissance styles are faithfully reproduced</li>
            <li>Materials, colors, and textures reflect the actual appearance of 16th century Venice</li>
            <li>The unique Venetian approach to urban density and water integration is preserved</li>
          </ul>
          
          <p>
            Visual adaptations include:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>Some architectural details are simplified for performance reasons</li>
            <li>Building footprints are somewhat regularized for the building system</li>
            <li>Color palettes are slightly enhanced for visual clarity</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Historical Research Sources</h3>
          
          <p>
            Our recreation of Renaissance Venice is informed by a variety of historical sources:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 my-4">
            <li>Contemporary maps and city views, including Jacopo de' Barbari's famous woodcut map of 1500</li>
            <li>Archival records from the Venetian State Archives</li>
            <li>Accounts by visitors and residents, including diplomatic reports and merchant correspondence</li>
            <li>Modern historical scholarship on Venetian economy, society, and urban development</li>
            <li>Archaeological and architectural studies of surviving structures</li>
          </ul>
          
          <h3 className="text-xl font-serif text-amber-800 mt-8 mb-4">Conclusion</h3>
          
          <p>
            La Serenissima represents our commitment to creating an experience that is both historically informed and engaging as a game. We believe that by grounding our systems in historical reality while making thoughtful adaptations for gameplay, we can offer players both an entertaining experience and a deeper understanding of one of history's most fascinating cities.
          </p>
          
          <p>
            As we continue to develop La Serenissima, we welcome feedback from players about the balance between historical accuracy and gameplay. Our goal is to create a living, breathing Venice that captures the essence of the historical city while providing meaningful agency to players.
          </p>
        </div>
      </div>
    </div>
  );
};

export default HistoricalAccuracyArticle;
