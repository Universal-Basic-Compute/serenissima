import React from 'react';
import NextImage from 'next/image';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { clearLandOwnershipCaches } from '@/lib/utils/cacheUtils';

interface LandPurchaseConfirmationProps {
  landId: string;
  landName?: string;
  price: number;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const LandPurchaseConfirmation: React.FC<LandPurchaseConfirmationProps> = ({
  landId,
  landName,
  price,
  onConfirm,
  onCancel,
  isLoading = false
}) => {
  // Function to handle successful purchase
  const handleSuccessfulPurchase = () => {
    // Clear caches
    clearLandOwnershipCaches();
    
    // Dispatch events to update UI
    console.log('Dispatching events to update UI after land purchase');
    
    // Get wallet address
    const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    
    if (walletAddress) {
      // Update land ownership in the polygon renderer
      eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
        landId: landId,
        newOwner: walletAddress,
        previousOwner: null, // We don't know the previous owner here
        timestamp: Date.now()
      });
      
      // Force polygon renderer to update owner colors
      eventBus.emit(EventTypes.POLYGON_OWNER_UPDATED, {
        polygonId: landId,
        owner: walletAddress
      });
      
      // Keep land details panel open
      eventBus.emit(EventTypes.KEEP_LAND_DETAILS_PANEL_OPEN, {
        polygonId: landId
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling up
    >
      <div className="bg-amber-50 rounded-lg shadow-2xl w-full max-w-md border-4 border-amber-700 overflow-hidden transform transition-all">
        {/* Header with decorative elements */}
        <div className="bg-amber-700 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <NextImage 
              src="/images/venice-seal.png" 
              alt="Seal of Venice" 
              width={40} 
              height={40}
              className="mr-3"
            />
            <h2 className="text-xl font-serif text-amber-50">Land Acquisition Decree</h2>
          </div>
          <button 
            onClick={onCancel}
            className="text-amber-200 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="mb-6 text-center">
            <div className="text-amber-800 text-lg font-medium mb-2">
              {landName ? `"${landName}"` : `Land #${landId}`}
            </div>
            <p className="text-gray-700 italic mb-4">
              By decree of the Council of Ten, this parcel of land shall be transferred to your noble house upon payment of the specified sum.
            </p>
            <div className="flex items-center justify-center mb-2">
              <div className="bg-amber-100 px-4 py-2 rounded-lg border border-amber-300 flex items-center">
                <span className="text-amber-800 font-medium mr-2">Price:</span>
                <span className="text-2xl font-bold" style={{ color: '#d4af37' }}>{price.toLocaleString()}</span>
                <span className="ml-2">⚜️ ducats</span>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              This transaction is final and cannot be reversed.
            </p>
          </div>
          
          {/* Decorative divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-amber-300"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-amber-50 px-4 text-amber-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </span>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => {
                onConfirm();
                handleSuccessfulPurchase();
              }}
              disabled={isLoading}
              className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                isLoading 
                  ? 'bg-amber-400 cursor-not-allowed' 
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing Transaction...
                </>
              ) : (
                'Confirm Purchase'
              )}
            </button>
            
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="w-full py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
        
        {/* Footer with seal */}
        <div className="bg-amber-100 p-4 text-center border-t border-amber-300">
          <p className="text-xs text-amber-800 italic">
            Sealed by the authority of the Most Serene Republic of Venice
          </p>
          <div className="mt-1 flex justify-center">
            <svg className="h-6 w-6 text-amber-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandPurchaseConfirmation;
