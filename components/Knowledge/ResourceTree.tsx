import React, { useState, useEffect, useRef } from 'react';
import { fetchResources, ResourceNode } from '../../lib/resourceUtils';
import ResourceHeader from './ResourceHeader';
import ResourceSearchBar from './ResourceSearchBar';
import ResourceGrid from './ResourceGrid';
import ResourceTreeView from './ResourceTreeView';
import ResourceDetails from './ResourceDetails';
import { FaTimes } from 'react-icons/fa';

interface ResourceTreeProps {
  onClose: () => void;
}

const ResourceTree: React.FC<ResourceTreeProps> = ({ onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'tree' | 'grid'>('grid');
  const [selectedResource, setSelectedResource] = useState<ResourceNode | null>(null);
  const [resources, setResources] = useState<ResourceNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState<number>(0); // 0 = Articles, 1 = Encyclopedia
  
  // Load resources on component mount
  useEffect(() => {
    const loadResources = async () => {
      try {
        setLoading(true);
        const data = await fetchResources();
        if (Array.isArray(data)) {
          setResources(data);
          setError(null);
        } else {
          throw new Error('Invalid data format received');
        }
      } catch (err) {
        setError('Failed to load resources. Please try again later.');
        console.error('Error loading resources:', err);
        // Set empty array to prevent undefined errors
        setResources([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadResources();
  }, []);

  // Get unique categories for filtering
  const categories = ['all', ...new Set(resources.map(node => node.category))].sort();
  
  // Get unique rarities for filtering
  const rarities = ['all', ...new Set(resources.map(node => node.rarity || 'unknown').filter(Boolean))].sort();
  
  // Filter resources based on search term and filters
  const filteredResources = resources.filter(resource => {
    const matchesSearch = 
      resource.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (resource.description && resource.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || resource.category === selectedCategory;
    const matchesRarity = selectedRarity === 'all' || resource.rarity === selectedRarity;
    
    return matchesSearch && matchesCategory && matchesRarity;
  });
  
  // Get resource by ID
  const getResourceById = (id: string): ResourceNode | undefined => {
    return resources.find(node => node.id === id);
  };
  
  // Get input resources for a given resource
  const getInputResources = (resource: ResourceNode): ResourceNode[] => {
    if (!resource.inputs) return [];
    return resource.inputs.map(id => getResourceById(id)).filter(Boolean) as ResourceNode[];
  };
  
  // Get output resources for a given resource
  const getOutputResources = (resource: ResourceNode): ResourceNode[] => {
    if (!resource.outputs) return [];
    return resource.outputs.map(id => getResourceById(id)).filter(Boolean) as ResourceNode[];
  };
  
  // Get category display name
  const getCategoryDisplayName = (category: string): string => {
    return category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };
  
  // Get rarity display name and color
  const getRarityInfo = (rarity?: string) => {
    switch(rarity) {
      case 'common':
        return { name: 'Common', color: 'bg-gray-200 text-gray-800' };
      case 'uncommon':
        return { name: 'Uncommon', color: 'bg-green-200 text-green-800' };
      case 'rare':
        return { name: 'Rare', color: 'bg-blue-200 text-blue-800' };
      case 'exotic':
        return { name: 'Exotic', color: 'bg-purple-200 text-purple-800' };
      default:
        return { name: 'Unknown', color: 'bg-gray-200 text-gray-800' };
    }
  };
  
  // Get category color
  const getCategoryColor = (category: string): string => {
    switch(category) {
      case 'raw_materials':
        return 'bg-amber-100 border-amber-300';
      case 'processed_materials':
        return 'bg-blue-100 border-blue-300';
      case 'luxury_goods':
        return 'bg-purple-100 border-purple-300';
      case 'imported_goods':
        return 'bg-red-100 border-red-300';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col tech-tree-container"
      ref={containerRef}
    >
      <ResourceHeader onClose={onClose} />
      
      {/* Only show search bar when in Encyclopedia section */}
      {currentSection === 1 && (
        <ResourceSearchBar 
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedRarity={selectedRarity}
          setSelectedRarity={setSelectedRarity}
          viewMode={viewMode}
          setViewMode={setViewMode}
          categories={categories}
          rarities={rarities}
          getCategoryDisplayName={getCategoryDisplayName}
          getRarityInfo={getRarityInfo}
        />
      )}
      
      {/* Section Tabs */}
      <div className="bg-amber-800 text-amber-100 px-4 py-2 flex space-x-4">
        <button
          onClick={() => setCurrentSection(0)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentSection === 0 
              ? 'bg-amber-600 text-white' 
              : 'hover:bg-amber-700 hover:text-white'
          }`}
        >
          Articles & Guides
        </button>
        <button
          onClick={() => setCurrentSection(1)}
          className={`px-4 py-2 rounded-lg transition-colors ${
            currentSection === 1 
              ? 'bg-amber-600 text-white' 
              : 'hover:bg-amber-700 hover:text-white'
          }`}
        >
          Resource Encyclopedia
        </button>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-grow flex overflow-hidden">
        {/* Article View */}
        {selectedArticle === "strategies" && (
          <div className="absolute inset-0 z-20 bg-black/30 rounded-lg p-4 overflow-auto">
            <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-serif text-amber-800">
                  20 Strategies to Get Ahead in Serenissima
                </h2>
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="text-amber-600 hover:text-amber-800 p-2"
                >
                  <FaTimes />
                </button>
              </div>
              
              <div className="prose prose-amber max-w-none">
                <p className="text-lg font-medium text-amber-800 mb-4">
                  Understanding Serenissima's Closed Economic System
                </p>
                
                <p className="mb-4">
                  La Serenissima operates as a closed economic system where all value circulates between players and AI-controlled entities. Unlike traditional games where resources spawn infinitely, the economy of Venice functions as a zero-sum game in many respects - wealth must be captured rather than created from nothing.
                </p>
                
                <p className="mb-4">
                  The fundamental principle to understand is that each economic cycle represents an opportunity to increase your share of the total economic value in the system. When ducats change hands, they don't disappear - they simply move from one participant to another. Your goal is to position yourself to capture more value with each turn of the economic wheel.
                </p>
                
                <p className="mb-4">
                  This means that true success doesn't come merely from generating income, but from generating <em>more income than your competitors</em>. A merchant who earns 100 ducats while others earn 50 is gaining economic advantage with each cycle, slowly accumulating a larger share of the finite wealth in the Republic.
                </p>
                
                <p className="mb-6">
                  The following strategies will help you navigate this closed economic system and maximize your ability to capture value in each round of commerce...
                </p>
                
                <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
                  <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #1: Location, Location, Location</h3>
                  <p>
                    In Venice, perhaps more than anywhere else, the value of property is determined by its location. A small shop on the Grand Canal will generate far more income than a large warehouse in the outer districts. When purchasing land, prioritize central locations and water access over size.
                  </p>
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
                  <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #2: Diversify Your Holdings</h3>
                  <p>
                    The wisest Venetian merchants never rely on a single source of income. Invest in different types of properties and businesses across multiple districts. This protects you from localized economic downturns and allows you to capitalize on opportunities throughout the city.
                  </p>
                </div>
                
                <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
                  <h3 className="text-xl font-serif text-amber-800 mb-2">Strategy #3: Build Complementary Businesses</h3>
                  <p>
                    Create synergies between your properties by establishing complementary businesses. A glassblower's workshop near your glass merchant shop reduces transportation costs and increases profits. Think of your holdings as an interconnected network rather than isolated investments.
                  </p>
                </div>
                
                <p className="text-center text-amber-800 italic">
                  More strategies coming soon as the Republic's economy develops...
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Articles View */}
        {currentSection === 0 && (
          <div className="w-full overflow-auto p-6 tech-tree-scroll">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* 20 Strategies Article Card */}
              <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
                <div className="h-48 overflow-hidden">
                  <img 
                    src="/images/strategies-article.png" 
                    alt="Strategies Article" 
                    className="w-full h-full object-cover transition-transform hover:scale-105"
                    onError={(e) => {
                      // Fallback if image doesn't exist
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Strategies';
                    }}
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-serif text-amber-800 mb-2">20 Strategies to Get Ahead</h3>
                  <p className="text-gray-600 mb-4">
                    Learn essential strategies for economic success in the competitive markets of La Serenissima.
                  </p>
                  <button 
                    onClick={() => setSelectedArticle("strategies")}
                    className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  >
                    Read Article
                  </button>
                </div>
              </div>
              
              {/* Beginner's Guide Card */}
              <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
                <div className="h-48 overflow-hidden">
                  <img 
                    src="/images/beginners-guide.png" 
                    alt="Beginner's Guide" 
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
                    onClick={() => setSelectedArticle("beginners-guide")}
                    className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  >
                    Read Guide
                  </button>
                </div>
              </div>
              
              {/* Economic System Guide Card */}
              <div className="bg-white rounded-lg overflow-hidden shadow-md border border-amber-200">
                <div className="h-48 overflow-hidden">
                  <img 
                    src="/images/economic-system.png" 
                    alt="Economic System" 
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
                    onClick={() => setSelectedArticle("economic-system")}
                    className="inline-block px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  >
                    Read Guide
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Resource Encyclopedia - only show when that section is active */}
        {currentSection === 1 && (
          <div className={`${selectedResource ? 'w-2/3' : 'w-full'} overflow-auto p-6 tech-tree-scroll`}>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-amber-500 text-xl">Loading resources...</div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-red-500 text-xl">{error}</div>
              </div>
            ) : viewMode === 'grid' ? (
              <ResourceGrid 
                resources={filteredResources}
                onSelectResource={setSelectedResource}
                getCategoryColor={getCategoryColor}
                getCategoryDisplayName={getCategoryDisplayName}
                getRarityInfo={getRarityInfo}
              />
            ) : (
              <ResourceTreeView />
            )}
          </div>
        )}
        
        {/* Resource Details Panel - show in encyclopedia section when a resource is selected */}
        {selectedResource && currentSection === 1 && (
          <ResourceDetails 
            resource={selectedResource}
            onClose={() => setSelectedResource(null)}
            getInputResources={getInputResources}
            getOutputResources={getOutputResources}
            onSelectResource={setSelectedResource}
            getCategoryDisplayName={getCategoryDisplayName}
            getRarityInfo={getRarityInfo}
          />
        )}
      </div>
    </div>
  );
};

export default ResourceTree;
