import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ListLandForSaleModal from '../UI/ListLandForSaleModal';
import { Polygon } from './types';
import { eventBus, EventTypes } from '../../lib/utils/eventBus';
import { useWalletContext } from '@/components/UI/WalletProvider'; // Import useWalletContext
import { FaMapMarkedAlt, FaTimes } from 'react-icons/fa';
import LandInfoColumn from './LandInfoColumn';
import LandChatColumn from './LandChatColumn';
import LandMarketColumn from './LandMarketColumn';

// Helper function to normalize identifiers for comparison
export const normalizeIdentifier = (id: string | null | undefined): string | null => {
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
  // Extend contract type to include activities and loading state for them
  interface EnrichedContract extends Polygon { // Assuming Polygon is a base or similar type, adjust if needed
    activities?: any[];
    isLoadingActivities?: boolean;
    // Add other contract-specific fields if not in Polygon type
    id: string; // Ensure id is present
    Type?: string;
    Seller?: string;
    Buyer?: string;
    SellerName?: string; // Added optional SellerName
    BuyerName?: string;  // Added optional BuyerName
    PricePerResource?: number;
    // ... any other fields from your contract structure
  }
  const [activeLandContracts, setActiveLandContracts] = useState<EnrichedContract[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Overall loading for contracts
  const [offerAmount, setOfferAmount] = useState<number>(200000); // Default offer amount, start of slider range
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
  const [activeLeftTab, setActiveLeftTab] = useState<'info' | 'buildings' | 'realEstate'>('info');

  // State for chat history
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [messagesFetchFailed, setMessagesFetchFailed] = useState<boolean>(false);
  const messagesFetchAttemptedRef = useRef<{[landId: string]: boolean}>({});

  // Kinos constants
  const KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2';
  const KINOS_CHANNEL_BLUEPRINT = 'serenissima-ai';

  const { citizenProfile } = useWalletContext();
  const currentCitizenUsername = citizenProfile?.username;

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

  const fetchLandMessageHistory = async (landId: string) => {
    if (!landId || !currentCitizenUsername) return;

    if (messagesFetchAttemptedRef.current[landId]) {
      console.log(`[LandDetailsPanel] Already attempted to fetch messages for land ${landId}, skipping`);
      return;
    }
    messagesFetchAttemptedRef.current[landId] = true;

    setIsLoadingHistory(true);
    setMessagesFetchFailed(false);
    try {
      let channelName;
      // Use dynamicOwner from the panel's state, which should be up-to-date
      if (dynamicOwner && currentCitizenUsername) {
        const participants = [currentCitizenUsername, dynamicOwner].sort().join('_');
        channelName = `land_${landId}_${participants}`;
      } else {
        channelName = `land_${landId}`;
      }
      console.log(`[LandDetailsPanel] Fetching message history for channel ${channelName} (user: ${currentCitizenUsername}, owner: ${dynamicOwner})`);
      const response = await fetch(`/api/messages/channel/${encodeURIComponent(channelName)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch message history for channel ${channelName}: ${response.status}`);
      }
      const data = await response.json();
      if (data.success && data.messages) {
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.messageId || msg.id, // Prefer messageId if available
          role: msg.sender === currentCitizenUsername ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.createdAt || msg.timestamp, // Prefer createdAt
        }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
        if (data.error) console.warn(`[LandDetailsPanel] API error fetching messages for land ${landId}: ${data.error}`);
      }
    } catch (error) {
      console.error(`[LandDetailsPanel] Error fetching message history for land ${landId}:`, error);
      setMessagesFetchFailed(true);
      setMessages([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
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
              setIsLoading(false); // Ensure loading is set to false
              return;
            }
            throw new Error(`Failed to fetch land contracts: ${response.status} ${response.statusText}`);
          }

          const responseData = await response.json();
          let baseContracts: EnrichedContract[] = [];
          
          if (responseData.success && Array.isArray(responseData.contracts)) {
            console.log(`Found ${responseData.contracts.length} active contract(s) for land ${selectedPolygonId}:`, responseData.contracts);
            baseContracts = responseData.contracts.map((c: any) => ({ 
              ...c, 
              isLoadingActivities: true, // Initialize loading state for activities
              activities: [] 
            }));
            setActiveLandContracts(baseContracts); // Set base contracts first

            // Now fetch activities for these contracts
            const contractsWithActivitiesPromises = baseContracts.map(async (contract) => {
              try {
                const actResponse = await fetch(`${API_BASE_URL}/api/contracts/${contract.id}/activities`);
                if (actResponse.ok) {
                  const actData = await actResponse.json();
                  if (actData.success && actData.activities) {
                    return { ...contract, activities: actData.activities, isLoadingActivities: false };
                  }
                }
                return { ...contract, activities: [], isLoadingActivities: false }; // No activities or error
              } catch (activityError) {
                console.error(`Error fetching activities for contract ${contract.id}:`, activityError);
                return { ...contract, activities: [], isLoadingActivities: false };
              }
            });

            const finalContracts = await Promise.all(contractsWithActivitiesPromises);
            setActiveLandContracts(finalContracts);

          } else {
            console.log(`No active contracts or unexpected data format for land ${selectedPolygonId}:`, responseData);
            setActiveLandContracts([]);
            if (responseData.error) {
              console.error(`API error message: ${responseData.error}`);
            }
          }
        } catch (error) {
          console.error(`Error fetching land contracts or activities (attempt ${4 - retries}/3):`, error);
          if (retries > 1) {
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchActiveLandContractsWithRetry(retries - 1, delay * 2);
          } else {
            console.warn('All retry attempts for land contracts/activities failed.');
            setActiveLandContracts([]);
          }
        } finally {
          // This finally block might run before async activity fetches complete if not careful.
          // setIsLoading(false) should be set after all data (contracts + activities) is processed or failed.
          // The current structure sets it after baseContracts are fetched, then updates with activities.
          // This is okay if the UI handles isLoadingActivities per contract.
        }
      };

      fetchActiveLandContractsWithRetry().finally(() => {
        // This ensures isLoading is set to false after all attempts for contracts (and their activities)
        setIsLoading(false);
      });
    } else {
      setActiveLandContracts([]);
      setIsLoading(false);
    }
  }, [selectedPolygonId, refreshKey]);

  // Show panel with animation when a polygon is selected
  // Also fetch message history when polygon changes
  useEffect(() => {
    if (selectedPolygonId) {
      setIsVisible(true);
      setMessages([]); // Clear messages from previous land parcel
      // Reset fetch attempt flag for the new landId.
      // If messagesFetchAttemptedRef was keyed by landId, clear specific key or reset.
      // For simplicity, if it's a simple boolean, reset it. If object, clear specific key.
      // Assuming messagesFetchAttemptedRef is an object keyed by landId:
      if (messagesFetchAttemptedRef.current[selectedPolygonId]) {
        delete messagesFetchAttemptedRef.current[selectedPolygonId];
      }
      // Or if it's a global ref for the current panel:
      // messagesFetchAttemptedRef.current = {}; // Or set the specific landId to false

      if (currentCitizenUsername) {
        fetchLandMessageHistory(selectedPolygonId);
      } else {
        // User not logged in, clear messages and don't fetch
        setMessages([]);
        setIsLoadingHistory(false);
        setMessagesFetchFailed(false); // Reset error state
      }
    } else if (!preventAutoClose) {
      setIsVisible(false);
      setMessages([]); // Clear messages when panel closes
    }
  }, [selectedPolygonId, preventAutoClose, currentCitizenUsername]); // Updated dependency
  
  // Early return if not visible or no selected polygon
  if (!visible || !selectedPolygonId) return null;

  // currentCitizenUsername is now derived from useWalletContext()
  const isOwner = dynamicOwner && currentCitizenUsername && normalizeIdentifier(dynamicOwner) === normalizeIdentifier(currentCitizenUsername);

  // Derive specific contracts from activeLandContracts
  console.log('[LandDetailsPanel] Debugging for "Buy Now" button visibility:');
  console.log('[LandDetailsPanel] selectedPolygonId:', selectedPolygonId);
  console.log('[LandDetailsPanel] currentCitizenUsername (from state):', currentCitizenUsername);
  console.log('[LandDetailsPanel] dynamicOwner (from landOwners prop):', dynamicOwner);
  console.log('[LandDetailsPanel] isOwner (current user is dynamicOwner):', isOwner);
  console.log('[LandDetailsPanel] activeLandContracts:', JSON.parse(JSON.stringify(activeLandContracts)));

  const landListingByOwner = activeLandContracts.find(c => {
    const typeMatch = c.Type === 'land_listing';
    const sellerMatch = c.Seller && dynamicOwner && normalizeIdentifier(c.Seller) === normalizeIdentifier(dynamicOwner);
    return typeMatch && sellerMatch;
  });
  
  console.log('[LandDetailsPanel] landListingByOwner (listing by dynamicOwner):', landListingByOwner ? JSON.parse(JSON.stringify(landListingByOwner)) : null);

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
        let successMessage = "";
        const firstActivityId = result.activity?.ActivityId || 'N/A';
        const firstActivityType = result.activity?.Type || 'Unknown Step';

        if (activityType === 'make_offer_for_land') {
          // Utiliser le message descriptif du backend s'il est disponible
          if (result.message) {
            successMessage = `${result.message} Your citizen will now travel to the designated office to submit the offer.`;
          } else { // Fallback si le message du backend est manquant
            const landIdParam = parameters.landId || 'selected land';
            successMessage = `Your endeavor to make an offer for land ${landIdParam} has begun! Your citizen will now travel to the designated office. First step: ${firstActivityType}.`;
          }
        } else {
          successMessage = `Action "${activityType}" initiated successfully!`;
          if (result.activity && result.activity.ActivityId) {
            successMessage += ` ID de la première activité : ${result.activity.ActivityId}.`;
          } else if (result.message) { // Fallback to backend message if activityId is not directly available but message is
            successMessage = result.message;
          } else {
            successMessage += ` (ID d'activité non disponible).`;
          }
        }
        
        alert(successMessage);
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
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Check if we can proceed with Kinos AI interaction
    if (!dynamicOwner || dynamicOwner === currentCitizenUsername) {
      let noAiResponseMessage = "This land is currently unowned, so there's no specific owner to chat with.";
      if (dynamicOwner === currentCitizenUsername) {
        noAiResponseMessage = "You are the owner of this land. Perhaps discuss its matters with another citizen?";
      }
      setMessages(prev => [...prev, {
        id: `info-${Date.now()}`,
        role: 'assistant',
        content: noAiResponseMessage,
        timestamp: new Date().toISOString()
      }]);
      setIsTyping(false);
      return;
    }

    try {
      // 1. Persist user's message
      let messageChannel;
      if (dynamicOwner && currentCitizenUsername) {
        const participants = [currentCitizenUsername, dynamicOwner].sort().join('_');
        messageChannel = `land_${selectedPolygon.id}_${participants}`;
      } else {
        messageChannel = `land_${selectedPolygon.id}`;
      }

      const persistUserMessageResponse = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentCitizenUsername,
          receiver: dynamicOwner || selectedPolygon.id, // Use owner's username if available, else polygonId
          content: content,
          type: 'land_message', // Specific type for land chat
          channel: messageChannel
        }),
      });
      if (!persistUserMessageResponse.ok) {
        console.error('[LandDetailsPanel] Failed to persist user message:', await persistUserMessageResponse.text());
        // Optionally, show an error to the user or remove optimistic message
      } else {
        console.log('[LandDetailsPanel] User message persisted.');
      }

      // 2. Kinos AI Interaction
      let currentUserProfile = null; // Profile of the user sending the message
      const savedProfile = localStorage.getItem('citizenProfile');
      if (savedProfile) try { currentUserProfile = JSON.parse(savedProfile); } catch(e) { console.error("Error parsing user profile for Kinos context:", e); }

      // The AI (Kin) is the owner of the land. ownerDetails should contain their profile.
      const aiOwnerProfile = ownerDetails; 

      const landDetailsForKinos = {
        id: selectedPolygon.id,
        historicalName: selectedPolygon.historicalName,
        englishName: selectedPolygon.englishName,
        description: selectedPolygon.historicalDescription,
        owner: dynamicOwner, // Current owner of the land
        coordinates: selectedPolygon.coordinates,
        buildingPointsCount: selectedPolygon.buildingPoints?.length || 0,
        lastIncome: selectedPolygon.lastIncome,
        listing: landListingByOwner ? { price: landListingByOwner.PricePerResource, seller: landListingByOwner.SellerName || landListingByOwner.Seller } : null,
        offers: incomingBuyOffers.map(offer => ({ price: offer.PricePerResource, buyer: offer.BuyerName || offer.Buyer })),
      };
      
      const kinosSystemContext = {
        ai_citizen_profile: aiOwnerProfile, // The profile of the Kin (land owner)
        land_parcel_details: landDetailsForKinos, // Details of the land being discussed
        interacting_citizen_profile: currentUserProfile, // Profile of the user initiating chat
      };

      const ownerDisplayName = aiOwnerProfile?.firstName || aiOwnerProfile?.username || dynamicOwner;
      const interactorDisplayName = currentUserProfile?.firstName || currentCitizenUsername;

      const kinosPromptContent = 
`You are ${ownerDisplayName}, the owner of the land parcel known as "${selectedPolygon?.historicalName || selectedPolygon.id}" in Renaissance Venice. You are conversing with ${interactorDisplayName}, another citizen.

Your conversation should be focused on business and gameplay related to THIS land parcel. Discuss potential deals, its current status, its use, buildings on it, or any relevant economic or strategic aspects. Be pragmatic and direct, as a landowner discussing their property.

Use the structured context provided in 'addSystem' to inform your response:
- 'ai_citizen_profile': Your own profile (the landowner).
- 'land_parcel_details': Detailed information about the land parcel you own and are discussing.
- 'interacting_citizen_profile': The profile of ${interactorDisplayName}, the citizen you are speaking with.

--- CITIZEN'S (${interactorDisplayName}) MESSAGE ---
${content}
--- END OF CITIZEN'S MESSAGE ---

Respond to ${interactorDisplayName}'s message. Be business-like, focused on gameplay, and relevant to the land parcel.`;

      const kinosKinId = dynamicOwner; // The Kin is the owner of the land
      const kinosChannelId = `${currentCitizenUsername}_${selectedPolygon.id}`; // Channel specific to user and land

      const kinosResponse = await fetch(
        `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${kinosKinId}/channels/${kinosChannelId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: kinosPromptContent,
            addSystem: JSON.stringify(kinosSystemContext),
            model: 'gemini-2.5-flash-preview-05-20' 
          }),
        }
      );

      if (kinosResponse.ok) {
        const kinosData = await kinosResponse.json();
        if (kinosData.content) {
          const aiMessage = {
            id: kinosData.message_id || kinosData.id || `kinos-land-${Date.now()}`,
            role: 'assistant' as 'assistant',
            content: kinosData.content,
            timestamp: kinosData.timestamp || new Date().toISOString(),
          };
          setMessages(prev => [...prev, aiMessage]);

          // 3. Persist AI's response
          // Determine channel for AI response persistence, same logic as user message
          let aiMessageChannel;
          if (dynamicOwner && currentCitizenUsername) {
            const participants = [currentCitizenUsername, dynamicOwner].sort().join('_');
            aiMessageChannel = `land_${selectedPolygon.id}_${participants}`;
          } else {
            aiMessageChannel = `land_${selectedPolygon.id}`;
          }

          const persistAiResponse = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: dynamicOwner || selectedPolygon.id, // AI persona of owner or land
              receiver: currentCitizenUsername,
              content: kinosData.content,
              type: 'land_message_ai_augmented',
              channel: aiMessageChannel
            }),
          });
          if (!persistAiResponse.ok) {
            console.error('[LandDetailsPanel] Failed to persist Kinos AI response for land chat:', await persistAiResponse.text());
          } else {
            console.log('[LandDetailsPanel] Kinos AI response for land chat persisted.');
          }
        } else {
          throw new Error("Kinos AI response missing content.");
        }
      } else {
        const errorText = await kinosResponse.text();
        console.error('[LandDetailsPanel] Error from Kinos AI for land chat:', kinosResponse.status, errorText);
        throw new Error(`Kinos AI error: ${kinosResponse.status} - ${errorText.substring(0,100)}`);
      }

    } catch (error) {
      console.error('[LandDetailsPanel] Error in handleSendMessage for land chat:', error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred.";
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `My apologies, citizen. I seem to be unable to fully process that right now. The winds of the lagoon are fickle today. (Error: ${errorMessage.substring(0,100)})`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsTyping(false);
    }
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
            isLoadingHistory={isLoadingHistory} // Pass isLoadingHistory
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
