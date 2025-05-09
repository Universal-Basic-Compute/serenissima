import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';

interface Resource {
  id: string;
  name: string;
  icon: string;
  amount: number;
  category: string;
}

interface ResourceDropdownProps {
  category: string;
  icon: string;
  resources: Resource[];
}

const ResourceDropdown: React.FC<ResourceDropdownProps> = ({ category, icon, resources }) => {
  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-black/60 hover:bg-black/80 text-amber-300 px-3 py-2 rounded-md transition-colors"
      >
        <Image 
          src={icon} 
          alt={category} 
          width={20} 
          height={20}
          className="w-5 h-5"
          onError={(e) => {
            // Fallback if image doesn't exist
            (e.target as HTMLImageElement).src = 'https://via.placeholder.com/20?text=R';
          }}
        />
        <span className="font-serif">{formatCategoryName(category)}</span>
        {isOpen ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
      </button>
      
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 bg-black/90 border border-amber-800 rounded-md shadow-lg z-50 py-2 max-h-96 overflow-y-auto">
          <div className="px-3 py-2 border-b border-amber-800/50">
            <h3 className="text-amber-400 font-serif">{formatCategoryName(category)}</h3>
          </div>
          
          {resources.length > 0 ? (
            <ul className="py-1">
              {resources.map(resource => (
                <li key={resource.id} className="px-3 py-2 hover:bg-amber-900/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Image 
                        src={resource.icon || `/images/resources/${resource.id}.png`} 
                        alt={resource.name} 
                        width={16} 
                        height={16}
                        className="w-4 h-4"
                        onError={(e) => {
                          // Fallback if image doesn't exist
                          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/16?text=R';
                        }}
                      />
                      <span className="text-amber-200 text-sm">{resource.name}</span>
                    </div>
                    <span className="text-amber-400 text-sm font-medium">{resource.amount}</span>
                  </div>
                </li>
              ))}
            </ul>
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
