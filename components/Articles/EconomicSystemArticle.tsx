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
          
          {/* Economic Cycle Diagram */}
          <div className="my-8 flex justify-center">
            <svg width="700" height="550" viewBox="0 0 700 550" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c2d12" />
                </marker>
              </defs>
              
              {/* Title */}
              <text x="350" y="40" fontFamily="serif" fontSize="24" fontWeight="bold" textAnchor="middle" fill="#7c2d12">Serenissima Circular Economy</text>
              
              {/* Center COMPUTE node */}
              <circle cx="350" cy="275" r="60" fill="#f59e0b" stroke="#b45309" strokeWidth="3"/>
              <text x="350" y="275" fontFamily="serif" fontSize="20" fontWeight="bold" textAnchor="middle" fill="#7c2d12">$COMPUTE</text>
              <text x="350" y="300" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Economic Currency</text>
              
              {/* Circular path for main economic flow */}
              <circle cx="350" cy="275" r="180" fill="none" stroke="#7c2d12" strokeWidth="2" strokeDasharray="none" opacity="0.2"/>
              
              {/* Main economic nodes positioned in a circle */}
              {/* LAND */}
              <circle cx="350" cy="95" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="350" y="90" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">LAND</text>
              <text x="350" y="110" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Parcels</text>
              
              {/* BUILDINGS */}
              <circle cx="530" cy="275" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="530" y="270" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">BUILDINGS</text>
              <text x="530" y="290" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Structures</text>
              
              {/* BUSINESSES */}
              <circle cx="440" cy="435" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="440" y="430" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">BUSINESSES</text>
              <text x="440" y="450" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Operations</text>
              
              {/* RESOURCES */}
              <circle cx="260" cy="435" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="260" y="430" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">RESOURCES</text>
              <text x="260" y="450" fontFamily="serif" fontSize="12" textAnchor="middle" fill="#7c2d12">Goods</text>
              
              {/* CITIZENS & PLAYERS */}
              <circle cx="170" cy="275" r="50" fill="#fef3c7" stroke="#d97706" strokeWidth="3"/>
              <text x="170" y="270" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">CITIZENS &</text>
              <text x="170" y="290" fontFamily="serif" fontSize="18" fontWeight="bold" textAnchor="middle" fill="#7c2d12">PLAYERS</text>
              
              {/* Main cycle connections with labels */}
              {/* LAND to BUILDINGS */}
              <path d="M 393 120 Q 465 165 505 235" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="465" y="175" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(35, 465, 175)">Hosts</text>
              
              {/* BUILDINGS to BUSINESSES */}
              <path d="M 500 315 Q 485 365 470 395" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="500" y="365" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(70, 500, 365)">Accommodates</text>
              
              {/* BUSINESSES to RESOURCES */}
              <path d="M 390 435 L 310 435" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="350" y="420" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12">Produce</text>
              
              {/* RESOURCES to CITIZENS */}
              <path d="M 220 410 Q 195 365 190 325" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="185" y="380" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(-75, 185, 380)">Supply</text>
              
              {/* CITIZENS to LAND */}
              <path d="M 205 235 Q 250 150 320 115" fill="none" stroke="#7c2d12" strokeWidth="2" markerEnd="url(#arrow)"/>
              <text x="240" y="165" fontFamily="serif" fontSize="14" textAnchor="middle" fill="#7c2d12" transform="rotate(-35, 240, 165)">Fund</text>
              
              {/* COMPUTE connections (radiating from center) */}
              <line x1="350" y1="215" x2="350" y2="150" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="410" y1="275" x2="475" y2="275" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="385" y1="325" x2="405" y2="390" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="310" y1="325" x2="290" y2="390" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              <line x1="290" y1="275" x2="225" y2="275" stroke="#b45309" strokeWidth="2" strokeDasharray="5,3"/>
              
              {/* Descriptive subtitle */}
              <text x="350" y="520" fontFamily="serif" fontSize="16" textAnchor="middle" fill="#7c2d12">$COMPUTE flows through all economic activities, enabling the circular economy of Renaissance Venice</text>
            </svg>
          </div>
          
          <h3 className="text-2xl font-serif text-amber-700 mb-4">Key Economic Principles</h3>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Closed Economic System</h4>
            <p>
              Unlike traditional games where resources spawn infinitely, La Serenissima operates as a zero-sum economy where wealth must be captured rather than created from nothing. Every ducat in circulation represents real value within the system.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Value Creation Chain</h4>
            <p>
              Value flows through a continuous cycle: Land hosts Buildings, which accommodate Businesses, which produce Resources, which supply Citizens and Players, who fund Land acquisition and development—completing the economic loop.
            </p>
          </div>
          
          <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
            <h4 className="text-xl font-serif text-amber-800 mb-2">Natural Scarcity</h4>
            <p>
              The geographic constraints of building on islands creates authentic value differentials. Prime locations along the Grand Canal naturally command higher prices than remote locations, without artificial scarcity mechanisms.
            </p>
          </div>
          
          <p className="italic text-center text-amber-700 my-8">
            More detailed economic guides coming soon...
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
