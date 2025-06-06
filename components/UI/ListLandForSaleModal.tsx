import React, { useState } from 'react';
// import { getBackendBaseUrl } from '@/lib/utils/apiUtils'; // No longer needed for direct API call
import { getWalletAddress } from '../../lib/utils/walletUtils'; // Still needed for user context
import NextImage from 'next/image';

interface ListLandForSaleModalProps {
  landId: string;
  landName?: string;
  landDescription?: string;
  englishName?: string;
  onClose: () => void;
  onComplete: (price: number) => void; // Keep onComplete for UI feedback if needed
  onInitiateListForSale: (landId: string, price: number) => void; // New prop
}

const ListLandForSaleModal: React.FC<ListLandForSaleModalProps> = ({
  landId,
  landName,
  landDescription,
  englishName,
  onClose,
  onComplete,
  onInitiateListForSale // New prop
}) => {
  const [price, setPrice] = useState<number>(100000); // Adjusted default price
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get current wallet address
  const walletAddress = getWalletAddress();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!walletAddress) {
      setError('Wallet not connected. Please connect your wallet first.');
      return;
    }
    
    if (!price || price <= 0) {
      setError('Please enter a valid price greater than 0.');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);

    try {
      // Call the new prop to initiate the activity
      onInitiateListForSale(landId, price);
      
      // Assuming success if onInitiateListForSale doesn't throw.
      // The actual success/failure will be handled by the activity system and reflected by data refresh.
      // alert(`Listing activity for land "${landName || landId}" at ${price.toLocaleString()} ⚜️ ducats has been initiated.`);
      
      // Call onComplete callback, which might close the modal or give further UI feedback
      onComplete(price);
      // onClose(); // It's better if onComplete handles closing, or LandDetailsPanel does after activity.
      
    } catch (err) {
      // This catch block might not be reached if onInitiateListForSale itself handles errors with alerts.
      // However, it's good practice to keep it.
      console.error('Error initiating land listing activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to initiate listing activity.');
    } finally {
      setIsSubmitting(false);
      // Do not call onClose() here directly if onComplete is expected to handle it or if LandDetailsPanel should.
      // If onInitiateListForSale is synchronous and successful, LandDetailsPanel will refresh and might close this modal via its state.
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
            <h2 className="text-xl font-serif text-amber-50">List Land For Sale</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-amber-200 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <div className="text-amber-800 text-lg font-medium mb-2">
              {landName ? `"${landName}"` : `Land #${landId}`}
            </div>
            <p className="text-gray-700 italic mb-4">
              Set a price to list your land for sale in the marketplace. Other nobles will be able to purchase it for the specified amount.
            </p>
            
            {/* Price input */}
            <div className="mb-4">
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                Listing Price: <span className="font-semibold text-amber-700">{price.toLocaleString()} ⚜️</span>
              </label>
              <input
                type="range"
                id="price"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                min="50000"     // Min price for the slider
                max="50000000"  // Max price for the slider
                step="50000"    // Step for the slider
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>50k ⚜️</span>
                <span>50M ⚜️</span>
              </div>
            </div>
            
            {/* Error message */}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
                <span className="block sm:inline">{error}</span>
              </div>
            )}
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
              type="submit"
              disabled={isSubmitting || !walletAddress}
              className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                isSubmitting 
                  ? 'bg-amber-400 cursor-not-allowed' 
                  : !walletAddress
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Listing...
                </>
              ) : !walletAddress ? (
                'Connect Wallet to List Land'
              ) : (
                'List Land for Sale'
              )}
            </button>
            
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
        
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

export default ListLandForSaleModal;
