import React, { useRef, useEffect } from 'react';
import { FaTimes, FaCoins } from 'react-icons/fa';
import { Resource } from '@/lib/services/ResourceService';

interface ResourceDetailsModalProps {
  resource: Resource;
  onClose: () => void;
}

const ResourceDetailsModal: React.FC<ResourceDetailsModalProps> = ({ resource, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Close when clicking outside the modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

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

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div 
        ref={modalRef}
        className="relative bg-amber-900/90 border-2 border-amber-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-2xl font-serif text-amber-300">{resource.name}</h3>
            <button 
              onClick={onClose}
              className="text-amber-400 hover:text-amber-200 p-1"
            >
              <FaTimes />
            </button>
          </div>
          
          <div className="flex items-center mb-6">
            <div className="w-24 h-24 bg-white rounded-lg overflow-hidden flex items-center justify-center mr-4 border-2 border-amber-600">
              <img 
                src={resource.icon} 
                alt={resource.name}
                className="w-20 h-20 object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (!target.dataset.usedFallback) {
                    target.dataset.usedFallback = 'true';
                    target.src = "/assets/resources/icons/default.png";
                  }
                }}
              />
            </div>
            <div>
              <div className="flex items-center mb-2">
                {resource.rarity && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getRarityColor(resource.rarity)}`}>
                    {resource.rarity.charAt(0).toUpperCase() + resource.rarity.slice(1)}
                  </span>
                )}
              </div>
              <div className="text-amber-300 text-sm">
                <div className="mb-1">
                  <span className="font-medium">Category:</span> {formatCategoryName(resource.category)}
                </div>
                {resource.subcategory && (
                  <div className="mb-1">
                    <span className="font-medium">Subcategory:</span> {formatCategoryName(resource.subcategory)}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-3 mt-2">
                  {resource.amount !== undefined && (
                    <div className="flex items-center text-amber-200">
                      <FaCoins className="mr-1" size={12} />
                      <span>Amount: {resource.amount}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Description */}
          {resource.description && (
            <div className="mb-6">
              <h4 className="text-lg font-serif text-amber-300 mb-2 border-b border-amber-700/50 pb-1">Description</h4>
              <p className="text-amber-100 text-sm mb-2">
                {resource.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourceDetailsModal;
