import React, { useState } from 'react';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import { getWalletAddress } from '../../lib/utils/walletUtils';
import NextImage from 'next/image';

interface ListLandForSaleModalProps {
  landId: string;
  landName?: string;
  landDescription?: string;
  englishName?: string;
  onClose: () => void;
  onComplete: () => void;
}

const ListLandForSaleModal: React.FC<ListLandForSaleModalProps> = ({
  landId,
  landName,
  landDescription,
  englishName,
  onClose,
  onComplete
}) => {
  const [price, setPrice] = useState<number>(10000000); // Default price of 10M COMPUTE
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
      const response = await fetch(`${getBackendBaseUrl()}/api/transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'land',
          asset: landId,
          seller: walletAddress,
          price: price,
          historical_name: landName,
          english_name: englishName,
          description: landDescription
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create listing: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Show success message
      alert(`Your land has been listed for ${price.toLocaleString()} ⚜️ ducats!`);
      
      // Call onComplete callback
      onComplete();
      
      // Close the modal
      onClose();
    } catch (err) {
      console.error('Error creating listing:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
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
                Listing Price (in ⚜️ ducats)
              </label>
              <div className="relative rounded-md shadow-sm">
                <input
                  type="number"
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  min="1"
                  step="1"
                  className="focus:ring-amber-500 focus:border-amber-500 block w-full pl-4 pr-12 py-3 sm:text-lg border-amber-300 rounded-md"
                  placeholder="Enter price"
                  required
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <span className="text-amber-600">⚜️</span>
                </div>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Recommended price range: 5,000,000 - 50,000,000 ⚜️
              </p>
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
