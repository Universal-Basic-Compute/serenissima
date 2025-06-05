import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ListLandForSaleModal from '../UI/ListLandForSaleModal';
import { Polygon } from './types';
import { eventBus, EventTypes } from '../../lib/utils/eventBus';
import { getCurrentCitizenUsername } from '../../lib/utils/walletUtils';
import { FaMapMarkedAlt, FaTimes } from 'react-icons/fa';
import LandInfoColumn from './LandInfoColumn';
import LandChatColumn from './LandChatColumn';
import LandMarketColumn from './LandMarketColumn';

// Helper function to normalize identifiers for comparison
export const normalizeIdentifier = (id: string | null | undefined): string | null => { // Export if needed by subcomponents or keep local
  if (!id) return null;
  // Convert to lowercase and trim
  return id.toLowerCase().trim();
};

interface LandDetailsPanelProps {
  selectedPolygonId: string | null;
  onClose: () => void;
  polygons: Polygon[];
  landOwners: Record<string, string>;
  visible?: boolean; // Add this prop
  preventAutoClose?: boolean; // Add this prop to prevent auto-closing after purchase
}

// Helper function to check if current citizen is the seller
const isCurrentCitizenTheSeller = (transaction: any): boolean => {
  if (!transaction || !transaction.seller) return false;
  
  // Get current citizen identifier (username or wallet)
  const currentCitizen = sessionStorage.getItem('username') || 
                     localStorage.getItem('username') ||
                     sessionStorage.getItem('walletAddress') || 
                     localStorage.getItem('walletAddress');
  
  if (!currentCitizen) return false;
  
  // Get citizen profile from localStorage
  let citizenProfile = null;
  try {
    const profileStr = localStorage.getItem('citizenProfile');
    if (profileStr) {
      citizenProfile = JSON.parse(profileStr);
    }
  } catch (e) {
    console.error('Error parsing citizen profile:', e);
  }
  
  // Log the comparison details
  console.log('Transaction seller:', transaction.seller);
  console.log('Current citizen identifier:', currentCitizen);
  console.log('Citizen profile:', citizenProfile);
  
  // Compare normalized identifiers
  const normalizedSeller = normalizeIdentifier(transaction.seller);
  const normalizedCurrentCitizen = normalizeIdentifier(currentCitizen);
  const normalizedUsername = citizenProfile?.username ? normalizeIdentifier(citizenProfile.username) : null;
  
  console.log('Normalized seller:', normalizedSeller);
  console.log('Normalized current citizen:', normalizedCurrentCitizen);
  console.log('Normalized username:', normalizedUsername);
  
  // Check if seller matches either the wallet address or username
  const isSellerCurrentCitizen = normalizedSeller === normalizedCurrentCitizen || 
                             normalizedSeller === normalizedUsername;
  
  console.log('Is seller the current citizen?', isSellerCurrentCitizen);
  
  return isSellerCurrentCitizen;
};

// Helper function to check if current citizen is the owner
const isCurrentCitizenTheOwner = (ownerIdentifier: string | null): boolean => {
  if (!ownerIdentifier) return false;
  
  // Get current citizen identifier (username or wallet)
  const currentCitizen = sessionStorage.getItem('username') || 
                     localStorage.getItem('username') ||
                     sessionStorage.getItem('walletAddress') || 
                     localStorage.getItem('walletAddress');
  
  if (!currentCitizen) return false;
  
  // Get citizen profile from localStorage
  let citizenProfile = null;
  try {
    const profileStr = localStorage.getItem('citizenProfile');
    if (profileStr) {
      citizenProfile = JSON.parse(profileStr);
    }
  } catch (e) {
    console.error('Error parsing citizen profile:', e);
  }
  
  // Compare normalized identifiers
  const normalizedOwner = normalizeIdentifier(ownerIdentifier);
  const normalizedCurrentCitizen = normalizeIdentifier(currentCitizen);
  const normalizedUsername = citizenProfile?.username ? normalizeIdentifier(citizenProfile.username) : null;
  
  // Check if owner matches either the wallet address or username
  return normalizedOwner === normalizedCurrentCitizen || normalizedOwner === normalizedUsername;
};

export default function LandDetailsPanel({ selectedPolygonId, onClose, polygons, landOwners, visible = true, preventAutoClose = false }: LandDetailsPanelProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  // Combined state for all relevant land contracts (listings and offers)
  const [activeLandContracts, setActiveLandContracts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [offerAmount, setOfferAmount] = useState<number>(100000); // Default offer amount
  const [showOfferInput, setShowOfferInput] = useState<boolean>(false);
  // showPurchaseConfirmation and isPurchasing might be reused or adapted if direct purchase confirmation is kept for some flow
  const [showPurchaseConfirmation, setShowPurchaseConfirmation] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [justCompletedTransaction, setJustCompletedTransaction] = useState<boolean>(false);
  // landRendered state is now managed by LandInfoColumn
  const [dynamicOwner, setDynamicOwner] = useState<string | null>(null);
  const [ownerDetails, setOwnerDetails] = useState<any>(null);
  // canvasRef is now managed by LandInfoColumn
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State for chat functionality
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isCorrespondanceFullScreen, setIsCorrespondanceFullScreen] = useState(false);
  const [activeLeftTab, setActiveLeftTab] = useState<'info' | 'buildings' | 'realEstate'>('info'); // Tabs for left column, added 'realEstate'

  // Find the selected polygon
  const selectedPolygon = selectedPolygonId 
    ? polygons.find(p => p.id === selectedPolygonId)
    : null;
  
  // Use the dynamically fetched owner instead of accessing landOwners directly
  const owner = dynamicOwner; // This 'owner' is dynamicOwner from state
  
  // Add useEffect to set the owner from landOwners prop
  useEffect(() => {
    if (selectedPolygonId) {
      setDynamicOwner(null);
      setOwnerDetails(null);
      const currentOwner = selectedPolygonId && landOwners ? landOwners[selectedPolygonId] : null;
      if (currentOwner) {
        console.log('Owner from landOwners prop:', currentOwner);
        setDynamicOwner(currentOwner);
        const fetchOwnerDetails = async () => {
          try {
            const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
            const apiUrl = `${API_BASE_URL}/api/citizens/${currentOwner}`;
            const citizenResponse = await fetch(apiUrl);
            if (citizenResponse.ok) {
              const citizenData = await citizenResponse.json();
              if (citizenData.success && citizenData.citizen) {
                setOwnerDetails(citizenData.citizen);
              }
            } else {
              console.error(`Failed to fetch citizen details: ${citizenResponse.status} ${citizenResponse.statusText}`);
            }
          } catch (citizenError) {
            console.error('Error fetching citizen details:', citizenError);
          }
        };
        fetchOwnerDetails();
      } else {
        console.log('No owner found for this land');
      }
    }
  }, [selectedPolygonId, landOwners]);
  
  // Debug logging
  useEffect(() => {
    if (selectedPolygonId) {
      console.log('Selected polygon ID:', selectedPolygonId);
      console.log('Selected polygon data:', selectedPolygon);
      console.log('Dynamically fetched owner:', dynamicOwner);
    }
  }, [selectedPolygonId, selectedPolygon, dynamicOwner]);

  // renderLandTopView and its useEffect have been moved to LandInfoColumn.tsx

  // Land purchase events are no longer handled to prevent land modification
  
  // The useEffect block below that referenced 'transaction' has been removed as 'transaction' is no longer defined.
  // Visibility after actions is handled by selectedPolygonId and preventAutoClose.
  
  // Add additional effect to maintain visibility when preventAutoClose is true
  useEffect(() => {
    if (preventAutoClose && selectedPolygonId) {
      setIsVisible(true);
    }
  }, [preventAutoClose, selectedPolygonId]);
  
  // Reset landRendered (now managed in LandInfoColumn) when selectedPolygonId changes
  // This effect can be removed from here if LandInfoColumn handles its own reset.
  // useEffect(() => {
  //   if (selectedPolygonId) {
  //     // setLandRendered(false); // This state is now in LandInfoColumn
  //   }
  // }, [selectedPolygonId]);
  
  // Add this useEffect to listen for the custom event to keep panel open
  useEffect(() => {
    const handleKeepOpen = (data: any) => {
      if (data.polygonId === selectedPolygonId) {
        console.log('Keeping land details panel open for', selectedPolygonId);
        setIsVisible(true);
      }
    };
    
    // Subscribe to keep panel open events using the event bus
    const subscription = eventBus.subscribe(EventTypes.KEEP_LAND_DETAILS_PANEL_OPEN, handleKeepOpen);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [selectedPolygonId]);
  
  // State for list for sale modal
  const [showListForSaleModal, setShowListForSaleModal] = useState<boolean>(false);
  const [showLandPurchaseModal, setShowLandPurchaseModal] = useState<boolean>(false);
  const [landPurchaseData, setLandPurchaseData] = useState<{
    landId: string;
    landName?: string;
    transaction: any;
    onComplete?: () => void;
  } | null>(null);
  
  // Add this useEffect to listen for the custom event to keep panel open
  useEffect(() => {
    const handleKeepOpen = (event: CustomEvent) => {
      if (event.detail.polygonId === selectedPolygonId) {
        console.log('Keeping land details panel open for', selectedPolygonId);
        setIsVisible(true);
      }
    };
    
    window.addEventListener('keepLandDetailsPanelOpen', handleKeepOpen as EventListener);
    
    return () => {
      window.removeEventListener('keepLandDetailsPanelOpen', handleKeepOpen as EventListener);
    };
  }, [selectedPolygonId]);

  // Effect to fetch active land contracts (listings and offers) when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsLoading(true);
      setActiveLandContracts([]); // Clear previous contracts
      console.log(`Fetching active land contracts for land ${selectedPolygonId}`);

      const fetchActiveLandContractsWithRetry = async (retries = 3, delay = 1000) => {
        try {
          const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
          // Fetch all active contracts (listings and offers) for this land asset
          // Ensure 'Status' is part of the query, and consider if other types like 'land_offer' are needed.
          const apiUrl = `${API_BASE_URL}/api/contracts?AssetType=land&Asset=${selectedPolygonId}&Status=active`;
          console.log(`Fetching land contracts from URL: ${apiUrl}`);
          
          const response = await fetch(apiUrl);

          if (!response.ok) {
            if (response.status === 404) {
              console.log(`No active contracts found for land ${selectedPolygonId} (API returned 404).`);
              setActiveLandContracts([]);
              return; // Explicitly return to avoid proceeding to .finally() too early in this path
            }
            throw new Error(`Failed to fetch land contracts: ${response.status} ${response.statusText}`);
          }

          const responseData = await response.json();
          
          if (responseData.success && Array.isArray(responseData.contracts)) {
            console.log(`Found ${responseData.contracts.length} active contract(s) for land ${selectedPolygonId}:`, responseData.contracts);
            setActiveLandContracts(responseData.contracts);
          } else {
            console.log(`No active contracts or unexpected data format for land ${selectedPolygonId}:`, responseData);
            setActiveLandContracts([]);
            if (responseData.error) {
              console.error(`API error message: ${responseData.error}`);
            }
          }
        } catch (error) {
          console.error(`Error fetching land contracts (attempt ${4 - retries}/3):`, error);
          if (retries > 1) {
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchActiveLandContractsWithRetry(retries - 1, delay * 2);
          } else {
            console.warn('All retry attempts for land contracts failed.');
            setActiveLandContracts([]);
          }
        }
      };

      fetchActiveLandContractsWithRetry().finally(() => {
        setIsLoading(false);
      });
    } else {
      setActiveLandContracts([]);
      setIsLoading(false);
    }
  }, [selectedPolygonId, refreshKey]);

  // Show panel with animation when a polygon is selected
  useEffect(() => {
    if (selectedPolygonId) {
      setIsVisible(true);
    } else if (!preventAutoClose) {
      // Only hide the panel if preventAutoClose is false
      setIsVisible(false);
    }
  }, [selectedPolygonId, preventAutoClose]);
  
  // Early return if not visible or no selected polygon
  if (!visible || !selectedPolygonId) return null;

  const currentCitizenUsername = getCurrentCitizenUsername();
  // isOwner needs to be determined based on dynamicOwner and currentCitizenUsername
  const isOwner = dynamicOwner && currentCitizenUsername && normalizeIdentifier(dynamicOwner) === normalizeIdentifier(currentCitizenUsername);

  // Derive specific contracts from activeLandContracts
  const landListingByOwner = activeLandContracts.find(
    c => c.Type === 'land_listing' && c.Seller && dynamicOwner && normalizeIdentifier(c.Seller) === normalizeIdentifier(dynamicOwner)
  );

  const myLandListing = activeLandContracts.find(
    c => c.Type === 'land_listing' && c.Seller && currentCitizenUsername && normalizeIdentifier(c.Seller) === normalizeIdentifier(currentCitizenUsername)
  );
  
  const incomingBuyOffers = activeLandContracts.filter(
    c => c.Type === 'land_offer' && c.Buyer && (!currentCitizenUsername || normalizeIdentifier(c.Buyer) !== normalizeIdentifier(currentCitizenUsername))
  );

  const myBuyOffer = activeLandContracts.find(
    c => c.Type === 'land_offer' && c.Buyer && currentCitizenUsername && normalizeIdentifier(c.Buyer) === normalizeIdentifier(currentCitizenUsername)
  );
  
  // Determine if the land is "Available for Purchase" (unowned and no specific listing)
  const isAvailableFromState = !dynamicOwner && !landListingByOwner;

  const handleGenericActivity = async (activityType: string, parameters: Record<string, any>) => {
    if (!currentCitizenUsername) {
      alert('Citizen username not found. Please ensure you are logged in.');
      return;
    }
    setIsLoading(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const response = await fetch(`${API_BASE_URL}/api/activities/try-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citizenUsername: currentCitizenUsername,
          activityType,
          activityParameters: parameters,
        }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        alert(`Action "${activityType}" initiated successfully! Activity ID: ${result.activityId || 'N/A'}`);
        setRefreshKey(prev => prev + 1); // Refresh panel data
        setShowOfferInput(false); // Close offer input if open
        // Potentially close modals or navigate if needed
      } else {
        throw new Error(result.error || `Failed to initiate "${activityType}"`);
      }
    } catch (error: any) {
      console.error(`Error initiating activity "${activityType}":`, error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !currentCitizenUsername || !selectedPolygon?.id) return;

    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response for land chat (placeholder)
    setTimeout(() => {
      const aiResponse = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: `Regarding land parcel ${selectedPolygon?.historicalName || selectedPolygon?.id}, I acknowledge your message: "${content}". However, direct chat about land parcels is a feature under consideration.`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Add global styles for custom scrollbar (similar to CitizenDetailsPanel)
  useEffect(() => {
    const scrollbarStyles = `
      .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 248, 230, 0.1); }
      .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(180, 120, 60, 0.3); border-radius: 20px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(180, 120, 60, 0.5); }
    `;
    const styleElement = document.createElement('style');
    styleElement.innerHTML = scrollbarStyles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);


  return (
    <div 
      className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[1200px] h-[75vh] max-h-[700px] bg-amber-50 border-2 border-amber-700 rounded-lg shadow-lg z-50 transition-all duration-300 pointer-events-auto flex flex-col ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
      }`}
      key={refreshKey} // refreshKey forces re-render of children too if needed
      style={{ pointerEvents: 'auto', cursor: 'default' }}
      onTransitionEnd={() => {
        // landRendered is now internal to LandInfoColumn
        // if (isVisible && !landRendered && selectedPolygonId) {
        //   setLandRendered(false);
        // }
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b-2 border-amber-300 flex-shrink-0 bg-amber-600 text-white rounded-t-lg">
        <div className="flex items-center">
          <FaMapMarkedAlt className="mr-3 text-2xl" />
          <h2 className="text-2xl font-serif">
            {selectedPolygon?.historicalName || selectedPolygon?.englishName || 'Land Details'}
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="text-amber-100 hover:text-white transition-colors p-2 rounded-full"
          aria-label="Close"
        >
          <FaTimes size={20} />
        </button>
      </div>
      
      {/* Three-column layout */}
      <div className={`flex flex-row gap-4 p-4 flex-grow min-h-0 ${isCorrespondanceFullScreen ? 'flex-grow' : ''}`}>
        {/* First column - Land Info & Buildings */}
        <div className={`${isCorrespondanceFullScreen ? 'hidden' : 'w-1/3'} flex flex-col`}>
          <LandInfoColumn
            selectedPolygon={selectedPolygon}
            selectedPolygonId={selectedPolygonId}
            activeLeftTab={activeLeftTab}
            setActiveLeftTab={setActiveLeftTab}
            // Props for Real Estate Tab in LandInfoColumn
            landListingByOwner={landListingByOwner}
            incomingBuyOffers={incomingBuyOffers}
            isOwner={isOwner}
            currentCitizenUsername={currentCitizenUsername}
            handleGenericActivity={handleGenericActivity}
            normalizeIdentifier={normalizeIdentifier}
            isLoadingMarketData={isLoading} // Pass market loading state
          />
        </div>

        {/* Second column - Chat/Correspondance (Simplified) */}
        <div className={`${isCorrespondanceFullScreen ? 'w-full' : 'w-1/3'} flex flex-col`}>
          <LandChatColumn
            selectedPolygon={selectedPolygon}
            messages={messages}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isTyping={isTyping}
            handleSendMessage={handleSendMessage}
            isCorrespondanceFullScreen={isCorrespondanceFullScreen}
            setIsCorrespondanceFullScreen={setIsCorrespondanceFullScreen}
            messagesEndRef={messagesEndRef}
          />
        </div>

        {/* Third column - Owner & Market Actions */}
        <div className={isCorrespondanceFullScreen ? 'hidden' : 'w-1/3 flex flex-col'}>
          <LandMarketColumn
            selectedPolygonId={selectedPolygonId}
            selectedPolygon={selectedPolygon}
            ownerDetails={ownerDetails}
            owner={owner} // This is dynamicOwner
            isLoading={isLoading} // Pass isLoading for market data
            landListingByOwner={landListingByOwner}
            myLandListing={myLandListing}
            incomingBuyOffers={incomingBuyOffers}
            myBuyOffer={myBuyOffer}
            isOwner={isOwner}
            isAvailableFromState={isAvailableFromState}
            currentCitizenUsername={currentCitizenUsername}
            handleGenericActivity={handleGenericActivity}
            showOfferInput={showOfferInput}
            setShowOfferInput={setShowOfferInput}
            offerAmount={offerAmount}
            setOfferAmount={setOfferAmount}
            setShowListForSaleModal={setShowListForSaleModal}
            normalizeIdentifier={normalizeIdentifier}
          />
        </div>
      </div>
      
      {/* Footer (optional, can be removed or simplified) */}
      <div className="p-2 text-xs text-amber-500 italic text-center flex-shrink-0 border-t border-amber-200">
        La Serenissima Repubblica di Venezia
      </div>
      
      {/* Modals */}
      {showListForSaleModal && selectedPolygonId && (
        <ListLandForSaleModal
          landId={selectedPolygonId}
          landName={selectedPolygon?.historicalName}
          englishName={selectedPolygon?.englishName}
          landDescription={selectedPolygon?.historicalDescription}
          onClose={() => setShowListForSaleModal(false)}
          onComplete={(price: number) => {
            // Refresh the panel to show the new listing
            // The modal now calls handleGenericActivity directly.
            // This onComplete might still be useful for UI cleanup or notifications.
            console.log(`ListLandForSaleModal completed, price: ${price}`);
            setRefreshKey(prevKey => prevKey + 1);
            setShowListForSaleModal(false); // Ensure modal closes
          }}
          // Pass the handleGenericActivity function to the modal
          onInitiateListForSale={(landId, price) => 
            handleGenericActivity('list_land_for_sale', { landId, price, sellerUsername: currentCitizenUsername })
          }
        />
      )}
    </div>
  );
  
  // handleConfirmPurchase is no longer directly used as purchases go through activities.
  // If a confirmation step is needed before calling handleGenericActivity,
  // that logic would be placed before the call.
  // The existing LandPurchaseConfirmation modal might need to be adapted or removed
  // if all purchases go through the new activity system.
  // handleConfirmPurchase function has been removed as it's deprecated.
}
