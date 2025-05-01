import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ActionButton from '../UI/ActionButton';
import WalletStatus from '../UI/WalletStatus';
import PlayerProfile from '../UI/PlayerProfile';
import { Polygon } from './types';

interface LandDetailsPanelProps {
  selectedPolygonId: string | null;
  onClose: () => void;
  polygons: Polygon[];
  landOwners: Record<string, string>;
  visible?: boolean; // Add this prop
}

export default function LandDetailsPanel({ selectedPolygonId, onClose, polygons, landOwners, visible = true }: LandDetailsPanelProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [transaction, setTransaction] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [offerAmount, setOfferAmount] = useState<number>(10000000); // Default offer of 10M COMPUTE
  const [showOfferInput, setShowOfferInput] = useState<boolean>(false);
  const [offers, setOffers] = useState<any[]>([]);
  
  // Find the selected polygon
  const selectedPolygon = selectedPolygonId 
    ? polygons.find(p => p.id === selectedPolygonId)
    : null;
  
  // Get the owner for the selected polygon
  const owner = selectedPolygonId ? landOwners[selectedPolygonId] : null;
  
  
  // Debug logging
  useEffect(() => {
    if (selectedPolygonId) {
      console.log('Selected polygon ID:', selectedPolygonId);
      console.log('Selected polygon data:', selectedPolygon);
      console.log('Land owners data:', landOwners);
      console.log('Owner for selected polygon:', owner);
    }
  }, [selectedPolygonId, selectedPolygon, landOwners, owner]);
  
  // Add this effect to fetch transaction data when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsLoading(true);
      fetch(`http://localhost:8000/api/transaction/land/${selectedPolygonId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              // No transaction found, that's okay
              console.log(`No transaction found for land ${selectedPolygonId}`);
              setTransaction(null);
              return null;
            }
            throw new Error(`Failed to fetch transaction: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (data) {
            console.log(`Transaction data for land ${selectedPolygonId}:`, data);
            setTransaction(data);
          } else {
            console.log(`No transaction data returned for land ${selectedPolygonId}`);
            setTransaction(null);
          }
        })
        .catch(error => {
          // Just log the error and continue without a transaction
          console.error('Error fetching transaction:', error);
          setTransaction(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setTransaction(null);
      setIsLoading(false);
    }
  }, [selectedPolygonId]);
  
  // Add this useEffect to fetch offers when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      // Fetch all offers for this land
      fetch(`http://localhost:8000/api/transactions/land/${selectedPolygonId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              // No offers found, that's okay
              console.log(`No offers found for land ${selectedPolygonId}`);
              setOffers([]);
              return [];
            }
            throw new Error(`Failed to fetch offers: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (data && Array.isArray(data)) {
            console.log(`Found ${data.length} offers for land ${selectedPolygonId}:`, data);
            
            // Filter out offers from the same seller as the main transaction
            // This prevents showing the same transaction as both "For Sale" and an "Incoming offer"
            const filteredOffers = transaction ? 
              data.filter(offer => offer.id !== transaction.id) : 
              data;
              
            console.log(`After filtering, ${filteredOffers.length} offers remain`);
            setOffers(filteredOffers);
          } else {
            console.log(`Invalid offers data format for land ${selectedPolygonId}:`, data);
            setOffers([]);
          }
        })
        .catch(error => {
          console.error('Error fetching offers:', error);
          setOffers([]);
        });
    } else {
      setOffers([]);
    }
  }, [selectedPolygonId, transaction]); // Add transaction as a dependency
  
  // Show panel with animation when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedPolygonId]);
  
  // Early return if not visible or no selected polygon
  if (!visible || !selectedPolygonId) return null;
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-96 bg-amber-50 shadow-xl transform transition-transform duration-300 ease-in-out z-20 border-l-4 border-amber-600 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-6 h-full flex flex-col">
        {/* Header with improved styling */}
        <div className="flex justify-between items-center mb-6 border-b-2 border-amber-300 pb-3">
          <h2 className="text-2xl font-serif font-semibold text-amber-800">
            {selectedPolygon?.historicalName || 'Land Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-700 hover:text-amber-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-6 overflow-y-auto flex-grow">
          {/* Owner information with enhanced styling */}
          <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
            <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
            {owner && owner !== "" ? (
              <div className="flex items-center justify-center">
                <PlayerProfile 
                  username={owner}
                  walletAddress={owner}
                  size="medium"
                  className="mx-auto"
                />
              </div>
            ) : (
              <div className="bg-amber-100 p-3 rounded-lg text-center">
                <p className="font-semibold text-amber-800">Available for Purchase</p>
                <p className="text-xs text-amber-600 mt-1">This land has no current owner</p>
              </div>
            )}
          </div>
          
          {/* Area information with enhanced styling */}
          {selectedPolygon?.areaInSquareMeters && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Buildable Area</h3>
              <p className="text-2xl font-semibold text-amber-800 text-center">
                {Math.floor(selectedPolygon.areaInSquareMeters).toLocaleString()} m²
              </p>
            </div>
          )}
          
          {/* Historical Name with enhanced styling */}
          {selectedPolygon?.historicalName && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Historical Name</h3>
              <p className="font-serif text-xl font-semibold text-amber-800">{selectedPolygon.historicalName}</p>
              {selectedPolygon.englishName && (
                <p className="mt-1 text-sm italic text-amber-600">{selectedPolygon.englishName}</p>
              )}
            </div>
          )}
          
          {/* Historical Description with enhanced styling */}
          {selectedPolygon?.historicalDescription && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Historical Description</h3>
              <p className="text-sm text-gray-700 leading-relaxed">{selectedPolygon.historicalDescription}</p>
            </div>
          )}
          
          {/* Transaction information with enhanced styling */}
          {transaction && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">For Sale</h3>
              <p className="text-2xl font-semibold text-green-600 text-center">
                {transaction.price.toLocaleString()} <span className="text-sm">⚜️ ducats</span>
              </p>
              
              {/* Add Acquire Land button with improved styling */}
              <button
                onClick={async () => {
                  // Get the current wallet address
                  const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
                  
                  if (!walletAddress) {
                    alert('Please connect your wallet first');
                    return;
                  }
                  
                  // Show confirmation dialog styled as an official document
                  if (!confirm(
                    `\n╔══════════════════════════════════════════════════╗
                    \n║        REPUBLIC OF VENICE - OFFICIAL DECREE        ║
                    \n╠══════════════════════════════════════════════════╣
                    \n║                                                  ║
                    \n║  By the authority of the Council of Ten,         ║
                    \n║  this document confirms the acquisition of:      ║
                    \n║                                                  ║
                    \n║  PROPERTY: ${selectedPolygon?.historicalName || selectedPolygonId}    ║
                    \n║  LOCATION: ${selectedPolygon?.englishName || 'Venezia'}                ║
                    \n║  PRICE: ${transaction.price.toLocaleString()} ducats                  ║
                    \n║  SELLER: ${transaction.seller}                   ║
                    \n║  BUYER: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}     ║
                    \n║                                                  ║
                    \n║  Do you confirm this transaction?                ║
                    \n║                                                  ║
                    \n╚══════════════════════════════════════════════════╝`
                  )) {
                    return; // User cancelled the transaction
                  }
                  
                  try {
                    // Call the backend API to execute the transaction
                    const response = await fetch(`http://localhost:8000/api/transaction/${transaction.id}/execute`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        buyer: walletAddress  // Make sure this is included
                      }),
                    });
                  
                    // Parse the response data regardless of status
                    const data = await response.json();
                  
                    if (!response.ok) {
                      // Check if this is a "transaction already executed" error
                      if (data.detail && data.detail.includes("already executed")) {
                        alert(`This land has already been acquired. The information will be updated.`);
                      
                        // Fetch updated land data
                        const landResponse = await fetch(`http://localhost:8000/api/land/${selectedPolygonId}`);
                        if (landResponse.ok) {
                          const landData = await landResponse.json();
                        
                          // Update local state
                          if (landData && landData.user) {
                            // Update the owner in the local state
                            const updatedPolygons = polygons.map(p => 
                              p.id === selectedPolygonId ? { ...p, owner: landData.user } : p
                            );
                          
                            // Dispatch a custom event to notify other components
                            window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
                              detail: { 
                                landId: selectedPolygonId, 
                                newOwner: landData.user
                              }
                            }));
                          }
                        }
                      
                        return;
                      }
                    
                      throw new Error(data.detail || 'Failed to execute transaction');
                    }
                  
                    // Show success message styled as an official document
                    alert(
                      `\n╔══════════════════════════════════════════════════╗
                      \n║        REPUBLIC OF VENICE - DEED OF OWNERSHIP      ║
                      \n╠══════════════════════════════════════════════════╣
                      \n║                                                  ║
                      \n║  ACQUISITION COMPLETE                            ║
                      \n║                                                  ║
                      \n║  The property known as:                          ║
                      \n║  "${selectedPolygon?.historicalName || selectedPolygonId}"          ║
                      \n║                                                  ║
                      \n║  Has been successfully transferred to your       ║
                      \n║  possession for the sum of:                      ║
                      \n║  ${transaction.price.toLocaleString()} ducats                       ║
                      \n║                                                  ║
                      \n║  Sealed by the authority of the Most Serene      ║
                      \n║  Republic of Venice on this day.                 ║
                      \n║                                                  ║
                      \n╚══════════════════════════════════════════════════╝`
                    );
                  
                    // Update local state without page reload
                    // 1. Update the owner in the local state
                    const updatedPolygons = polygons.map(p => 
                      p.id === selectedPolygonId ? { ...p, owner: walletAddress } : p
                    );
                  
                    // 2. Update the transaction to mark it as executed
                    const updatedTransaction = {
                      ...transaction,
                      buyer: walletAddress,
                      executed_at: new Date().toISOString()
                    };
                    setTransaction(updatedTransaction);
                  
                    // 3. Clear offers since the land has been sold
                    setOffers([]);
                  
                    // 4. Dispatch a custom event to notify other components
                    window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
                      detail: { 
                        landId: selectedPolygonId, 
                        newOwner: walletAddress,
                        transaction: updatedTransaction
                      }
                    }));
                  
                    // 5. Fetch updated user data to reflect new compute balance
                    const userResponse = await fetch(`http://localhost:8000/api/wallet/${walletAddress}`);
                    if (userResponse.ok) {
                      const userData = await userResponse.json();
                    
                      // Dispatch event to update user profile with new compute amount
                      window.dispatchEvent(new CustomEvent('userProfileUpdated', {
                        detail: userData
                      }));
                    }
                  } catch (error) {
                    console.error('Error executing transaction:', error);
                    alert('Failed to acquire land. Please try again.');
                  }
                }}
                className="mt-4 w-full px-4 py-3 bg-amber-600 text-white text-base font-medium rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Acquire Land
              </button>
            </div>
          )}

          
          {/* Offers section with enhanced styling */}
          {offers.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
              <h3 className="text-sm uppercase font-medium text-amber-600 mb-3">Offers</h3>
              <div className="space-y-3">
                {offers.map((offer, index) => (
                  <div key={index} className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-600">
                        {offer.price.toLocaleString()} <span className="text-xs">⚜️ ducats</span>
                      </span>
                      <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                        {new Date(offer.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs mt-1">
                      {offer.seller === (sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress')) ? (
                        <span className="text-blue-600 font-medium">Your outgoing offer</span>
                      ) : (
                        <span className="text-purple-600 font-medium">Incoming offer from {offer.seller.slice(0, 6)}...{offer.seller.slice(-4)}</span>
                      )}
                    </div>
                    {/* Add accept button for incoming offers with improved styling */}
                    {offer.seller !== owner && (
                      <button
                        onClick={async () => {
                          // Get the current wallet address
                          const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
                          
                          if (!walletAddress) {
                            alert('Please connect your wallet first');
                            return;
                          }
                          
                          // Only the owner can accept offers
                          if (owner !== walletAddress) {
                            alert('Only the current owner can accept offers');
                            return;
                          }
                          
                          try {
                            // Execute the transaction
                            const response = await fetch(`http://localhost:8000/api/transaction/${offer.id}/execute`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                buyer: offer.seller
                              }),
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to accept offer');
                            }
                            
                            const data = await response.json();
                            alert(`Offer accepted! Land transferred to ${offer.seller}`);
                            // Refresh the page to update the UI
                            window.location.reload();
                          } catch (error) {
                            console.error('Error accepting offer:', error);
                            alert('Failed to accept offer. Please try again.');
                          }
                        }}
                        className="mt-2 w-full px-3 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Accept Offer
                      </button>
                    )}
                    {/* Add cancel button for outgoing offers with improved styling */}
                    {offer.seller === owner && (
                      <button
                        onClick={async () => {
                          // Get the current wallet address
                          const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
                          
                          if (!walletAddress) {
                            alert('Please connect your wallet first');
                            return;
                          }
                          
                          // Only the seller can cancel their own offers
                          if (owner !== walletAddress) {
                            alert('Only the offer creator can cancel it');
                            return;
                          }
                          
                          try {
                            // Cancel the transaction
                            const response = await fetch(`http://localhost:8000/api/transaction/${offer.id}/cancel`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({
                                seller: walletAddress
                              }),
                            });
                            
                            if (!response.ok) {
                              throw new Error('Failed to cancel offer');
                            }
                            
                            const data = await response.json();
                            alert('Offer cancelled successfully');
                            // Refresh offers
                            setOffers(offers.filter(o => o.id !== offer.id));
                          } catch (error) {
                            console.error('Error cancelling offer:', error);
                            alert('Failed to cancel offer. Please try again.');
                          }
                        }}
                        className="mt-2 w-full px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel Offer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons at the bottom with improved styling */}
        <div className="pt-4 mt-auto border-t-2 border-amber-300">
          {owner ? (
            // If land is owned, show "Make an Offer" button or the offer input
            showOfferInput ? (
              <div className="flex flex-col w-full space-y-3">
                <div className="flex space-x-2">
                  <input
                    type="number"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(parseInt(e.target.value) || 0)}
                    className="px-3 py-2 border border-amber-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Offer amount in ⚜️ ducats"
                    min="1"
                  />
                  <ActionButton
                    onClick={async () => {
                      // Get the current wallet address
                      const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
                      
                      if (!walletAddress) {
                        alert('Please connect your wallet first');
                        return;
                      }
                      
                      if (offerAmount <= 0) {
                        alert('Please enter a valid offer amount');
                        return;
                      }
                      
                      try {
                        // Create a transaction for the land
                        const response = await fetch('http://localhost:8000/api/transaction', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            type: 'land',
                            asset_id: selectedPolygonId,
                            seller: owner, // Current owner
                            price: offerAmount,
                            historical_name: selectedPolygon?.historicalName,
                            english_name: selectedPolygon?.englishName,
                            description: selectedPolygon?.historicalDescription
                          }),
                        });
                        
                        if (!response.ok) {
                          throw new Error('Failed to create offer');
                        }
                        
                        const data = await response.json();
                        alert(`Offer of ${offerAmount.toLocaleString()} ⚜️ ducats created successfully!`);
                        setShowOfferInput(false);
                      } catch (error) {
                        console.error('Error creating offer:', error);
                        alert('Failed to create offer. Please try again.');
                      }
                    }}
                    variant="primary"
                  >
                    Submit Offer
                  </ActionButton>
                </div>
                <ActionButton
                  onClick={() => setShowOfferInput(false)}
                  variant="secondary"
                >
                  Cancel
                </ActionButton>
              </div>
            ) : (
              <ActionButton
                onClick={() => setShowOfferInput(true)}
                variant="primary"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Make an Offer
              </ActionButton>
            )
          ) : (
            // If land is not owned, keep the existing purchase button with improved styling
            <ActionButton 
              onClick={() => {
                if (!selectedPolygonId) return;
                
                // Get the current wallet address from session storage first, then localStorage
                const walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress') || '';
                
                if (!walletAddress) {
                  alert('Please connect your wallet first');
                  return;
                }
                
                // If there's a transaction, execute it
                if (transaction) {
                  // Call the backend API to execute the transaction
                  fetch(`http://localhost:8000/api/transaction/${transaction.id}/execute`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      buyer: walletAddress
                    }),
                  })
                  .then(response => {
                    if (!response.ok) {
                      throw new Error('Failed to execute transaction');
                    }
                    return response.json();
                  })
                  .then(data => {
                    alert(`Successfully acquired ${selectedPolygon?.historicalName || selectedPolygonId}`);
                    // Refresh the page to update the UI
                    window.location.reload();
                  })
                  .catch(error => {
                    console.error('Error executing transaction:', error);
                    alert('Failed to purchase land. Please try again.');
                  });
                } else {
                  // If no transaction, just update the land owner
                  fetch('http://localhost:8000/api/land', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      land_id: selectedPolygonId,
                      user: walletAddress,
                      historical_name: selectedPolygon?.historicalName,
                      english_name: selectedPolygon?.englishName,
                      description: selectedPolygon?.historicalDescription
                    }),
                  })
                  .then(response => {
                    if (!response.ok) {
                      throw new Error('Failed to purchase land');
                    }
                    return response.json();
                  })
                  .then(data => {
                    alert(`Successfully purchased land: ${selectedPolygon?.historicalName || selectedPolygonId}`);
                    // Refresh the land owners data
                    window.location.reload();
                  })
                  .catch(error => {
                    console.error('Error purchasing land:', error);
                    alert('Failed to purchase land. Please try again.');
                  });
                }
              }} 
              variant="primary"
              disabled={false}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {transaction ? `Purchase (${transaction.price.toLocaleString()} ducats)` : 'Purchase Land'}
            </ActionButton>
          )}
        </div>
        
        {/* Add a decorative Venetian footer */}
        <div className="mt-4 text-center">
          <div className="text-amber-600 text-xs italic">
            La Serenissima Repubblica di Venezia
          </div>
          <div className="flex justify-center mt-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
