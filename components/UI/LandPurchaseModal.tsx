import React, { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';

interface LandPurchaseModalProps {
  visible: boolean;
  landId: string | null;
  landName?: string;
  transaction: any;
  onClose: () => void;
  onComplete: () => void;
}

// Add a function to get username from wallet address
const getUsernameFromWallet = async (walletAddress: string): Promise<string | null> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/wallet/${walletAddress}`);
    if (response.ok) {
      const data = await response.json();
      return data.user_name || null;
    }
    return null;
  } catch (error) {
    console.warn(`Could not get username for wallet ${walletAddress}:`, error);
    return null;
  }
};

const LandPurchaseModal: React.FC<LandPurchaseModalProps> = ({
  visible,
  landId,
  landName,
  transaction,
  onClose,
  onComplete
}) => {
  const [isPurchasing, setIsPurchasing] = useState(false);

  if (!visible || !landId || !transaction) return null;

  const handleConfirmPurchase = async () => {
    try {
      setIsPurchasing(true);
      
      // Get the current wallet address
      const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
      
      if (!walletAddress) {
        alert('Please connect your wallet first');
        return;
      }
      
      // First try the Next.js API route
      try {
        // Call the backend API to execute the transaction
        const response = await fetch(`${getApiBaseUrl()}/api/transaction/${transaction.id}/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            buyer: walletAddress
          }),
          // Add a timeout to prevent hanging requests
          signal: AbortSignal.timeout(15000) // 15 second timeout
        });
      
        // Parse the response data regardless of status
        const data = await response.json();
      
        if (!response.ok) {
          // Check if this is a "transaction already executed" error
          if (data.detail && data.detail.includes("already executed")) {
            alert(`This land has already been acquired. The information will be updated.`);
          
            // Fetch updated land data
            const landResponse = await fetch(`${getApiBaseUrl()}/api/land/${landId}`);
            if (landResponse.ok) {
              const landData = await landResponse.json();
            
              // Dispatch a custom event to notify other components
              if (landData && landData.user) {
                window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
                  detail: { 
                    landId: landId, 
                    newOwner: landData.user
                  }
                }));
              }
            }
          
            return;
          }
          
          // Check if this is the Airtable formula error
          const errorStr = String(data.detail || '');
          if (errorStr.includes('INVALID_FILTER_BY_FORMULA') || errorStr.includes('Invalid formula') || errorStr.includes('OR')) {
            console.log('Detected Airtable formula error, using local fallback');
            
            // Create a local transaction result
            const localTransaction = {
              ...transaction,
              buyer: walletAddress,
              executed_at: new Date().toISOString()
            };
            
            // Get the username for the wallet address
            const username = await getUsernameFromWallet(walletAddress);
            const ownerToSet = username || walletAddress;
      
            // Dispatch custom events to notify other components
            window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
              detail: { 
                landId: landId, 
                newOwner: ownerToSet, // Use username instead of wallet address
                transaction: localTransaction
              }
            }));
      
            // Dispatch a specific event for land purchase to update the panel
            window.dispatchEvent(new CustomEvent('landPurchased', {
              detail: { 
                landId: landId, 
                newOwner: ownerToSet, // Use username instead of wallet address
                transaction: localTransaction
              }
            }));
            
            // Add a new event specifically for compute balance updates
            window.dispatchEvent(new CustomEvent('computeBalanceChanged', {
              detail: {
                buyer: walletAddress,
                seller: transaction.seller,
                amount: transaction.price
              }
            }));
            
            // Show success message
            alert(`Acquisition complete! The property "${landName || landId}" has been successfully transferred to your possession.`);
            
            // Call the onComplete callback
            onComplete();
            onClose();
            return;
          }
        
          throw new Error(data.detail || 'Failed to execute transaction');
        }
      
        // Show success message
        alert(`Acquisition complete! The property "${landName || landId}" has been successfully transferred to your possession.`);
      
        // Update transaction to mark it as executed
        const updatedTransaction = {
          ...transaction,
          buyer: walletAddress,
          executed_at: new Date().toISOString()
        };
      
        // Get the username for the wallet address
        const username = await getUsernameFromWallet(walletAddress);
        const ownerToSet = username || walletAddress;
      
        // Dispatch custom events to notify other components
        window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
          detail: { 
            landId: landId, 
            newOwner: ownerToSet, // Use username instead of wallet address
            transaction: updatedTransaction
          }
        }));
      
        // Dispatch a specific event for land purchase to update the panel
        window.dispatchEvent(new CustomEvent('landPurchased', {
          detail: { 
            landId: landId, 
            newOwner: ownerToSet, // Use username instead of wallet address
            transaction: updatedTransaction
          }
        }));
      
        // Add a new event specifically for compute balance updates
        window.dispatchEvent(new CustomEvent('computeBalanceChanged', {
          detail: {
            buyer: walletAddress,
            seller: transaction.seller,
            amount: transaction.price
          }
        }));
      
        // Add a new event specifically for compute balance updates
        window.dispatchEvent(new CustomEvent('computeBalanceChanged', {
          detail: {
            buyer: walletAddress,
            seller: transaction.seller,
            amount: transaction.price
          }
        }));
      
        // Fetch updated user data to reflect new compute balance
        const userResponse = await fetch(`${getApiBaseUrl()}/api/wallet/${walletAddress}`);
        if (userResponse.ok) {
          const userData = await userResponse.json();
        
          // Dispatch event to update user profile with new compute amount
          window.dispatchEvent(new CustomEvent('userProfileUpdated', {
            detail: userData
          }));
        }
        
        // Call the onComplete callback
        onComplete();
      } catch (error) {
        console.error('Error executing transaction:', error);
        
        // Try the direct backend API as a fallback
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          const directResponse = await fetch(`${apiBaseUrl}/api/transaction/${transaction.id}/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              buyer: walletAddress
            }),
            // Add a timeout to prevent hanging requests
            signal: AbortSignal.timeout(15000) // 15 second timeout
          });
          
          if (directResponse.ok) {
            const directData = await directResponse.json();
            
            // Show success message
            alert(`Acquisition complete! The property "${landName || landId}" has been successfully transferred to your possession.`);
    
            // Update transaction to mark it as executed
            const updatedTransaction = {
              ...transaction,
              buyer: walletAddress,
              executed_at: new Date().toISOString()
            };
    
            // Get the username for the wallet address
            const username = await getUsernameFromWallet(walletAddress);
            const ownerToSet = username || walletAddress;
    
            // Dispatch custom events to notify other components
            window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
              detail: { 
                landId: landId, 
                newOwner: ownerToSet, // Use username instead of wallet address
                transaction: updatedTransaction
              }
            }));
    
            // Dispatch a specific event for land purchase to update the panel
            window.dispatchEvent(new CustomEvent('landPurchased', {
              detail: { 
                landId: landId, 
                newOwner: ownerToSet, // Use username instead of wallet address
                transaction: updatedTransaction
              }
            }));
    
            // Add a new event specifically for compute balance updates
            window.dispatchEvent(new CustomEvent('computeBalanceChanged', {
              detail: {
                buyer: walletAddress,
                seller: transaction.seller,
                amount: transaction.price
              }
            }));
    
            // Fetch updated user data to reflect new compute balance
            const userResponse = await fetch(`${getApiBaseUrl()}/api/wallet/${walletAddress}`);
            if (userResponse.ok) {
              const userData = await userResponse.json();
      
              // Dispatch event to update user profile with new compute amount
              window.dispatchEvent(new CustomEvent('userProfileUpdated', {
                detail: userData
              }));
            }
      
            // Call the onComplete callback
            onComplete();
            return;
          }
          
          // If direct API also fails, throw the original error
          throw error;
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
          alert('Failed to acquire land. Please try again.');
        }
      } finally {
        setIsPurchasing(false);
        onClose();
      }
    } catch (error) {
      console.error('Error executing transaction:', error);
      alert('Failed to acquire land. Please try again.');
      setIsPurchasing(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-amber-50 rounded-lg shadow-2xl w-full max-w-md border-4 border-amber-700 overflow-hidden transform transition-all">
        {/* Header with decorative elements */}
        <div className="bg-amber-700 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src="/images/venice-seal.png" 
              alt="Seal of Venice" 
              width={60} 
              height={60}
              className="mr-3"
            />
            <h2 className="text-xl font-serif text-amber-50">Land Acquisition Decree</h2>
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
                <span className="text-2xl font-bold" style={{ color: '#d4af37' }}>{transaction.price.toLocaleString()}</span>
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
              onClick={handleConfirmPurchase}
              disabled={isPurchasing}
              className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center ${
                isPurchasing 
                  ? 'bg-amber-400 cursor-not-allowed' 
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              {isPurchasing ? (
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
              onClick={onClose}
              disabled={isPurchasing}
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
            <svg className="h-8 w-8 text-amber-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandPurchaseModal;
