import React from 'react';
import { FaSearch, FaFilter, FaThLarge, FaList, FaProjectDiagram } from 'react-icons/fa';

interface ResourceSearchBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedRarity: string;
  setSelectedRarity: (rarity: string) => void;
  viewMode: 'list' | 'grid' | 'tree';
  setViewMode: (mode: 'list' | 'grid' | 'tree') => void;
  categories: string[];
  rarities: string[];
  getCategoryDisplayName: (category: string) => string;
  getRarityInfo: (rarity?: string) => { name: string; color: string };
}

const ResourceSearchBar: React.FC<ResourceSearchBarProps> = ({
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  selectedRarity,
  setSelectedRarity,
  viewMode,
  setViewMode,
  categories,
  rarities,
  getCategoryDisplayName,
  getRarityInfo
}) => {
  return (
    <div className="bg-amber-900/50 p-4 border-b border-amber-700">
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FaSearch className="text-amber-500" />
          </div>
          <input
            type="text"
            placeholder="Search resources..."
            className="w-full pl-10 pr-4 py-2 bg-amber-950/50 border border-amber-700 rounded-lg text-amber-100 placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <select
              className="appearance-none bg-amber-950/50 border border-amber-700 rounded-lg px-4 py-2 pr-8 text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.filter(c => c !== 'all').map(category => (
                <option key={category} value={category}>
                  {getCategoryDisplayName(category)}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <FaFilter className="text-amber-500" />
            </div>
          </div>
          
          <div className="relative">
            <select
              className="appearance-none bg-amber-950/50 border border-amber-700 rounded-lg px-4 py-2 pr-8 text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={selectedRarity}
              onChange={(e) => setSelectedRarity(e.target.value)}
            >
              <option value="all">All Rarities</option>
              {rarities.filter(r => r !== 'all').map(rarity => (
                <option key={rarity} value={rarity}>
                  {getRarityInfo(rarity).name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <FaFilter className="text-amber-500" />
            </div>
          </div>
          
          <div className="flex rounded-lg overflow-hidden border border-amber-700">
            <button
              className={`px-3 py-2 flex items-center ${viewMode === 'grid' ? 'bg-amber-700 text-white' : 'bg-amber-950/50 text-amber-300 hover:bg-amber-800/50'}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <FaThLarge className="mr-1" /> Grid
            </button>
            <button
              className={`px-3 py-2 flex items-center ${viewMode === 'list' ? 'bg-amber-700 text-white' : 'bg-amber-950/50 text-amber-300 hover:bg-amber-800/50'}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <FaList className="mr-1" /> List
            </button>
            <button
              className={`px-3 py-2 flex items-center ${viewMode === 'tree' ? 'bg-amber-700 text-white' : 'bg-amber-950/50 text-amber-300 hover:bg-amber-800/50'}`}
              onClick={() => setViewMode('tree')}
              title="Production Tree View"
            >
              <FaProjectDiagram className="mr-1" /> Tree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceSearchBar;
