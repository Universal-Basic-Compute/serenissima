import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface ResourceHeaderProps {
  onClose: () => void;
}

const ResourceHeader: React.FC<ResourceHeaderProps> = ({ onClose }) => {
  return (
    <div className="flex justify-between items-center p-4">
      <h2 className="text-3xl font-serif text-amber-500 px-4">
        Resource Encyclopedia of Venice
      </h2>
      <button 
        onClick={onClose}
        className="text-white hover:text-amber-200 transition-colors p-2 rounded-full hover:bg-amber-900/30"
        aria-label="Close"
      >
        <FaTimes size={24} />
      </button>
    </div>
  );
};

export default ResourceHeader;
