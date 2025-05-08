import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface EconomicSystemArticleProps {
  onClose: () => void;
}

const EconomicSystemArticle: React.FC<EconomicSystemArticleProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Understanding the Economy of La Serenissima
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
            The Closed Economic System of Venice
          </p>
          
          <p className="mb-4">
            La Serenissima features a sophisticated economic simulation based on historical Venetian commerce. Understanding how this system works is essential for any merchant seeking fortune in the lagoon.
          </p>
          
          {/* Content for economic system guide would go here */}
          <p className="italic text-center text-amber-700 my-8">
            Economic System guide content coming soon...
          </p>
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

export default EconomicSystemArticle;
