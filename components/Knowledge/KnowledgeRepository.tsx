import React from 'react';
import Image from 'next/image';
import { FaTimes } from 'react-icons/fa'; // Import the X icon
import HistoricalResources from './HistoricalResources';

export interface KnowledgeRepositoryProps {
  onShowTechTree: () => void;
  onShowPresentation: () => void;
  onShowResourceTree: () => void;
  onSelectArticle: (article: string) => void;
  onClose: () => void; // Add this prop for closing the repository
  standalone?: boolean;
}

const KnowledgeRepository: React.FC<KnowledgeRepositoryProps> = ({
  onShowTechTree,
  onShowPresentation,
  onShowResourceTree,
  onSelectArticle,
  onClose // Add this parameter
}) => {
  return (
    <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-40 rounded-lg p-4 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Knowledge Repository
          </h2>
          {/* Add close button */}
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Close knowledge repository"
          >
            <FaTimes size={24} />
          </button>
        </div>
        
        {/* Project Resources Section - moved to be first */}
        <div>
          <h3 className="text-2xl font-serif text-amber-700 mb-4 border-b border-amber-200 pb-2">
            Project Resources
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Roadmap Resource */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/project-roadmap.png" 
                  alt="Project Roadmap" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Roadmap';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Project Roadmap</h3>
                <p className="text-gray-600 mb-4">
                  Explore the future development plans for La Serenissima, including upcoming features, 
                  economic expansions, and governance implementations.
                </p>
                <button 
                  onClick={onShowTechTree}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  View Tech Tree
                </button>
              </div>
            </div>
            
            {/* Presentation Resource */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/project-presentation.png" 
                  alt="Project Presentation" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Presentation';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Project Presentation</h3>
                <p className="text-gray-600 mb-4">
                  Learn about the vision, architecture, and technical implementation of La Serenissima 
                  through our comprehensive project presentation.
                </p>
                <button 
                  onClick={onShowPresentation}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  View Presentation
                </button>
              </div>
            </div>
            
            {/* Resource Tree Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/resource-tree.png" 
                  alt="Resource Tree" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Resources';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Resource Encyclopedia</h3>
                <p className="text-gray-600 mb-4">
                  Explore the complex web of resources, production chains, and economic relationships 
                  that power the Venetian economy.
                </p>
                <button 
                  onClick={onShowResourceTree}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  View Resource Tree
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Articles & Guides Section */}
        <div className="mt-8">
          <h3 className="text-2xl font-serif text-amber-700 mb-4 border-b border-amber-200 pb-2">
            Articles & Guides
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Beginner's Guide Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/beginners-guide.png" 
                  alt="Beginner's Guide" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Beginners+Guide';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Beginner's Guide to Venice</h3>
                <p className="text-gray-600 mb-4">
                  Everything you need to know to get started in La Serenissima as a new merchant.
                </p>
                <button 
                  onClick={() => onSelectArticle("beginners-guide")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Guide
                </button>
              </div>
            </div>
          
            {/* Economic System Guide Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/economic-system.png" 
                  alt="Economic System" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Economic+System';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Understanding the Economy</h3>
                <p className="text-gray-600 mb-4">
                  A deep dive into the economic systems that power La Serenissima's closed economy.
                </p>
                <button 
                  onClick={() => onSelectArticle("economic-system")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Guide
                </button>
              </div>
            </div>
          
            {/* Land Owner Guide Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/landowner-guide.png" 
                  alt="Land Owner Guide" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Land+Owner+Guide';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">The Nobili's Guide to Land Ownership</h3>
                <p className="text-gray-600 mb-4">
                  Master the art of Venetian land management and strategic property control to build lasting wealth.
                </p>
                <button 
                  onClick={() => onSelectArticle("landowner-guide")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Guide
                </button>
              </div>
            </div>
            
            {/* Building Owner's Guide Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/building-owners-guide.png" 
                  alt="Building Owner's Guide" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Building+Owner+Guide';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">The Master Builder's Guide</h3>
                <p className="text-gray-600 mb-4">
                  Maximize value from your architectural investments and build a lasting legacy in Venice.
                </p>
                <button 
                  onClick={() => onSelectArticle("building-owners-guide")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Guide
                </button>
              </div>
            </div>

            {/* Business Owner's Guide Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/business-owners-guide.png" 
                  alt="Business Owner's Guide" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Business+Owner+Guide';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">The Merchant's Guide to Business Success</h3>
                <p className="text-gray-600 mb-4">
                  Learn how to establish and grow profitable enterprises in the competitive Venetian marketplace.
                </p>
                <button 
                  onClick={() => onSelectArticle("business-owners-guide")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Guide
                </button>
              </div>
            </div>
          
            {/* 10 Strategies Article Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/strategies-article.png" 
                  alt="Strategies Article" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Strategies';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">10 Cunning Strategies for Venetian Power</h3>
                <p className="text-gray-600 mb-4">
                  Learn essential strategies for economic success in the competitive contracts of La Serenissima.
                </p>
                <button 
                  onClick={() => onSelectArticle("strategies")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Article
                </button>
              </div>
            </div>
            
            {/* Decrees & Governance Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/decrees-governance.png" 
                  alt="Decrees & Governance" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Decrees+%26+Governance';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Decrees & Governance</h3>
                <p className="text-gray-600 mb-4">
                  Learn how to influence laws and shape the Republic as you rise in wealth and status.
                </p>
                <button 
                  onClick={() => onSelectArticle("decrees-governance")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Guide
                </button>
              </div>
            </div>
            
            {/* Unified Citizen Model Article Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/unified-citizen-model.png" 
                  alt="Unified Citizen Model" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Unified+Citizen+Model';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">AI and Human Citizens: A Unified Model</h3>
                <p className="text-gray-600 mb-4">
                  Discover how La Serenissima creates a seamless economic ecosystem where AI and human citizens coexist.
                </p>
                <button 
                  onClick={() => onSelectArticle("unified-citizen-model")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Article
                </button>
              </div>
            </div>

            {/* Citizen Activities & Needs Card */}
            <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
              <div className="h-48 overflow-hidden">
                <Image 
                  src="https://backend.serenissima.ai/public_assets/images/knowledge/citizen-activities.png" // Placeholder - replace with actual image
                  alt="Citizen Activities & Needs" 
                  width={800}
                  height={400}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Citizen+Activities';
                  }}
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-serif text-amber-800 mb-2">Citizen Activities & Needs</h3>
                <p className="text-gray-600 mb-4">
                  Understand the daily life, activities, and needs of Venetian citizens.
                </p>
                <button 
                  onClick={() => onSelectArticle("citizen-activities-needs")}
                  className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                >
                  Read Article
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Historical Resources Section */}
        <HistoricalResources onSelectArticle={onSelectArticle} />
      </div>
    </div>
  );
};

export default KnowledgeRepository;
