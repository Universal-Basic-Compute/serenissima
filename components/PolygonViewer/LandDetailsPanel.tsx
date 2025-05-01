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
}

export default function LandDetailsPanel({ selectedPolygonId, onClose, polygons, landOwners }: LandDetailsPanelProps) {
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
  
  // Add this function to handle polygon deletion
  const handleDeletePolygon = async () => {
    if (!selectedPolygonId) return;
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete this land: ${selectedPolygon?.historicalName || selectedPolygonId}?`)) {
      return;
    }
    
    try {
      const response = await fetch('/api/delete-polygon', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: selectedPolygonId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete land');
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('Land deleted successfully');
        // Close the panel
        onClose();
        
        // Dispatch a custom event to notify components
        window.dispatchEvent(new Event('polygonDeleted'));
      } else {
        alert(`Failed to delete land: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting land:', error);
      alert('An error occurred while deleting the land');
    }
  };
  
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
          }
          setTransaction(data);
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
            setOffers(data);
          } else {
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
  }, [selectedPolygonId]);
  
  // Show panel with animation when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [selectedPolygonId]);
  
  if (!selectedPolygonId) return null;
  
  return (
    <div 
      className={`fixed top-0 right-0 h-full w-80 bg-white shadow-lg transform transition-transform duration-300 ease-in-out z-20 ${
        isVisible ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">
            {selectedPolygon?.historicalName || 'Land Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          {/* Owner information - always show this section */}
          <div>
            <h3 className="text-sm font-medium text-gray-500">Owner</h3>
            {owner && owner !== "" ? (
              <div className="mt-2 flex items-center">
                <PlayerProfile 
                  username={owner}
                  walletAddress={owner} // Pass the owner as wallet address to fetch full profile
                  size="medium"
                  className="mx-auto"
                />
              </div>
            ) : (
              <p className="mt-1 font-semibold">Available</p>
            )}
          </div>
          
          {/* Area information */}
          {selectedPolygon?.areaInSquareMeters && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Buildable Area</h3>
              <p className="mt-1 font-semibold">
                {Math.floor(selectedPolygon.areaInSquareMeters).toLocaleString()} m²
              </p>
            </div>
          )}
          
          {/* Historical Name */}
          {selectedPolygon?.historicalName && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Historical Name</h3>
              <p className="mt-1 font-semibold">{selectedPolygon.historicalName}</p>
              {selectedPolygon.englishName && (
                <p className="mt-1 text-sm italic text-gray-600">{selectedPolygon.englishName}</p>
              )}
            </div>
          )}
          
          {/* Historical Description */}
          {selectedPolygon?.historicalDescription && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Historical Description</h3>
              <p className="mt-1 text-sm">{selectedPolygon.historicalDescription}</p>
            </div>
          )}
          
          {/* Transaction information */}
          {transaction && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">For Sale</h3>
              <p className="mt-1 font-semibold text-green-600">
                {transaction.price.toLocaleString()} ducats
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Seller: {transaction.seller}
              </p>
            </div>
          )}
          
          {/* Offers section */}
          {offers.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mt-4">Offers</h3>
              <div className="mt-1 space-y-2">
                {offers.map((offer, index) => (
                  <div key={index} className="p-2 border rounded bg-gray-50">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-green-600">
                        {offer.price.toLocaleString()} ducats
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(offer.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs">
                      {offer.seller === owner ? (
                        <span className="text-blue-600">Outgoing offer</span>
                      ) : (
                        <span className="text-purple-600">Incoming offer from {offer.seller}</span>
                      )}
                    </div>
                    {/* Add accept button for incoming offers */}
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
                        className="mt-2 w-full px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                      >
                        Accept Offer
                      </button>
                    )}
                    {/* Add cancel button for outgoing offers */}
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
                        className="mt-2 w-full px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                      >
                        Cancel Offer
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <WalletStatus className="mb-2" />
          
          <div className="pt-2 flex space-x-2">
            {owner ? (
              // If land is owned, show "Make an Offer" button or the offer input
              showOfferInput ? (
                <div className="flex flex-col w-full space-y-2">
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      value={offerAmount}
                      onChange={(e) => setOfferAmount(parseInt(e.target.value) || 0)}
                      className="px-2 py-1 border rounded w-full"
                      placeholder="Offer amount in COMPUTE"
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
                          alert(`Offer of ${offerAmount} COMPUTE created successfully!`);
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
                  Make an Offer
                </ActionButton>
              )
            ) : (
              // If land is not owned, keep the existing purchase button
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
                      alert(`Successfully purchased ${selectedPolygon?.historicalName || selectedPolygonId}`);
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
                {transaction ? `Purchase (${transaction.price.toLocaleString()} ducats)` : 'Purchase Land'}
              </ActionButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
