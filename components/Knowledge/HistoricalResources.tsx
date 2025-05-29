import React from 'react';
import Image from 'next/image';

interface HistoricalResourcesProps {
  onSelectArticle: (article: string) => void;
}

const HistoricalResources: React.FC<HistoricalResourcesProps> = ({ onSelectArticle }) => {
  return (
    <div className="mt-8">
      <h3 className="text-2xl font-serif text-amber-700 mb-4 border-b border-amber-200 pb-2">
        Historical Resources
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Historical Accuracy Article */}
        <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
          <div className="h-48 overflow-hidden">
            <Image 
              src="https://backend.serenissima.ai/public_assets/images/knowledge/historical-accuracy.png" 
              alt="Historical Accuracy" 
              width={800}
              height={400}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              onError={(e) => {
                // Fallback if image doesn't exist
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Historical+Accuracy';
              }}
            />
          </div>
          <div className="p-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Historical Accuracy in La Serenissima</h3>
            <p className="text-gray-600 mb-4">
              Learn about the historical research behind La Serenissima and how we balance accuracy with gameplay.
            </p>
            <button 
              onClick={() => onSelectArticle("historical-accuracy")}
              className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
            >
              Read Article
            </button>
          </div>
        </div>
        
        {/* Venetian Guilds */}
        <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
          <div className="h-48 overflow-hidden">
            <Image 
              src="https://backend.serenissima.ai/public_assets/images/knowledge/venetian-guilds.png" 
              alt="Venetian Guilds" 
              width={800}
              height={400}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              onError={(e) => {
                // Fallback if image doesn't exist
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Venetian+Guilds';
              }}
            />
          </div>
          <div className="p-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">The Venetian Guild System</h3>
            <p className="text-gray-600 mb-4">
              Explore the powerful craft guilds that regulated trade and production in Renaissance Venice.
            </p>
            <button 
              onClick={() => onSelectArticle("venetian-guilds")}
              className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
            >
              Read Article
            </button>
          </div>
        </div>
        
        {/* Guild Leadership */}
        <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
          <div className="h-48 overflow-hidden">
            <Image 
              src="https://backend.serenissima.ai/public_assets/images/knowledge/guild-leadership.png" 
              alt="Guild Leadership" 
              width={800}
              height={400}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              onError={(e) => {
                // Fallback if image doesn't exist
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Guild+Leadership';
              }}
            />
          </div>
          <div className="p-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Guild Leadership Structures</h3>
            <p className="text-gray-600 mb-4">
              Understand the leadership hierarchies and governance models of Venetian craft guilds.
            </p>
            <button 
              onClick={() => onSelectArticle("guild-leadership")}
              className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
            >
              Read Article
            </button>
          </div>
        </div>
        
        {/* Venetian Trade Routes - moved to second row */}
        <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
          <div className="h-48 overflow-hidden">
            <Image 
              src="https://backend.serenissima.ai/public_assets/images/knowledge/trade-routes.png" 
              alt="Venetian Trade Routes" 
              width={800}
              height={400}
              className="w-full h-full object-cover transition-transform hover:scale-105"
              onError={(e) => {
                // Fallback if image doesn't exist
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Trade+Routes';
              }}
            />
          </div>
          <div className="p-6">
            <h3 className="text-xl font-serif text-amber-800 mb-2">Venetian Trade Routes</h3>
            <p className="text-gray-600 mb-4">
              Discover the extensive trade network that made Venice the commercial center of the Mediterranean.
            </p>
            <button 
              className="inline-block px-4 py-2 bg-gray-400 text-white rounded cursor-not-allowed"
              disabled
            >
              Coming Soon
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HistoricalResources;
