import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { FaChevronDown, FaChevronUp, FaLeaf, FaCogs, FaBox, FaTools, FaGem, FaShip, FaHammer, FaWater } from 'react-icons/fa';

interface Resource {
  id: string;
  name: string;
  icon: string;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  rarity?: string;
}

interface ResourceDropdownProps {
  category: string;
  resources: Resource[];
}

// Function to get the appropriate icon for each category
const getCategoryIcon = (category: string) => {
  switch(category) {
    case 'raw_materials':
      return <FaLeaf className="w-5 h-5 text-amber-400" />;
    case 'processed_materials':
      return <FaCogs className="w-5 h-5 text-blue-400" />;
    case 'finished_goods':
      return <FaBox className="w-5 h-5 text-green-400" />;
    case 'utility_resources':
      return <FaTools className="w-5 h-5 text-purple-400" />;
    case 'luxury_goods':
      return <FaGem className="w-5 h-5 text-pink-400" />;
    case 'imported_goods':
      return <FaShip className="w-5 h-5 text-red-400" />;
    case 'building_materials':
      return <FaHammer className="w-5 h-5 text-yellow-400" />;
    case 'water_resources':
      return <FaWater className="w-5 h-5 text-cyan-400" />;
    default:
      return <FaLeaf className="w-5 h-5 text-amber-400" />;
  }
};

const ResourceDropdown: React.FC<ResourceDropdownProps> = ({ category, resources }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [groupBySubcategory, setGroupBySubcategory] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Format category name for display
  const formatCategoryName = (name: string) => {
    return name.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  // Get rarity color
  const getRarityColor = (rarity?: string) => {
    switch(rarity) {
      case 'common': return 'bg-gray-200 text-gray-800';
      case 'uncommon': return 'bg-green-200 text-green-800';
      case 'rare': return 'bg-blue-200 text-blue-800';
      case 'exotic': return 'bg-purple-200 text-purple-800';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  // Group resources by subcategory if enabled
  const groupedResources = () => {
    if (!groupBySubcategory) return { '': resources };
    
    return resources.reduce((groups, resource) => {
      const subcategory = resource.subcategory || '';
      if (!groups[subcategory]) groups[subcategory] = [];
      groups[subcategory].push(resource);
      return groups;
    }, {} as Record<string, Resource[]>);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-black/60 hover:bg-black/80 text-amber-300 px-3 py-2 rounded-md transition-colors"
      >
        {getCategoryIcon(category)}
        <span className="font-serif">{formatCategoryName(category)}</span>
        {isOpen ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
      </button>
      
      {isOpen && (
        <div className="absolute left-0 mt-1 w-72 bg-black/90 border border-amber-800 rounded-md shadow-lg z-50 py-2 max-h-96 overflow-y-auto">
          <div className="px-3 py-2 border-b border-amber-800/50">
            <div className="flex justify-between items-center">
              <h3 className="text-amber-400 font-serif">{formatCategoryName(category)}</h3>
              <div className="flex items-center">
                <button 
                  onClick={() => setGroupBySubcategory(!groupBySubcategory)}
                  className="text-xs text-amber-300 hover:text-amber-100 px-2 py-1 rounded"
                >
                  {groupBySubcategory ? 'Ungrouped' : 'Group by Type'}
                </button>
              </div>
            </div>
          </div>
          
          {resources.length > 0 ? (
            <div>
              {Object.entries(groupedResources()).map(([subcategory, subcategoryResources]) => (
                <div key={subcategory || 'default'}>
                  {subcategory && (
                    <div className="px-3 py-1 bg-amber-900/30 text-amber-300 text-xs font-medium">
                      {formatCategoryName(subcategory)}
                    </div>
                  )}
                  <ul className="py-1">
                    {subcategoryResources.map(resource => (
                      <li key={resource.id} className="px-3 py-2 hover:bg-amber-900/30 transition-colors group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Image 
                              src={resource.icon} 
                              alt={resource.name} 
                              width={16} 
                              height={16}
                              className="w-4 h-4"
                              onError={(e) => {
                                // Fallback if image doesn't exist
                                (e.target as HTMLImageElement).src = `https://via.placeholder.com/16?text=${resource.name.charAt(0).toUpperCase()}`;
                              }}
                            />
                            <span className="text-amber-200 text-sm">{resource.name}</span>
                            {resource.rarity && resource.rarity !== 'common' && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${getRarityColor(resource.rarity)}`}>
                                {resource.rarity.charAt(0).toUpperCase() + resource.rarity.slice(1)}
                              </span>
                            )}
                          </div>
                          <span className="text-amber-400 text-sm font-medium">{resource.amount}</span>
                        </div>
                        
                        {/* Resource description tooltip */}
                        {resource.description && (
                          <div className="hidden group-hover:block absolute left-full ml-2 w-64 p-3 bg-black/95 border border-amber-700 rounded shadow-lg z-50 text-xs text-amber-100">
                            <p>{resource.description}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-amber-500/70 text-sm italic">
              No resources in this category
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResourceDropdown;
