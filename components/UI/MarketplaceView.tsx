import React from 'react';

interface MarketplaceViewProps {
  onClose: () => void;
}

const MarketplaceView: React.FC<MarketplaceViewProps> = ({ onClose }) => {
  return (
    <div className="bg-white rounded-b-lg shadow-xl p-6 max-h-[80vh] overflow-y-auto">
      <h2 className="text-2xl font-bold text-amber-800 mb-4">Marketplace</h2>
      
      {/* Marketplace content will go here */}
      <div className="p-4 bg-amber-50 rounded-lg text-amber-800">
        <p>Marketplace listings will appear here.</p>
      </div>
    </div>
  );
};

export default MarketplaceView;
