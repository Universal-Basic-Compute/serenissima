import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  BuildingImage, 
  BuildingLocation, 
  BuildingOwner, 
  BuildingOccupant, 
  BuildingMaintenance, 
  BuildingFinancials, 
  BuildingDescription,
  ResourceList,
  RecipeList,
  ContractList,
  ChatCitizenDisplay,
  BuildingBidsList, // Added import
  BuildingLedger // Added import for Ledger
} from './BuildingDetails/'; // Added trailing slash to ensure directory import
import ContractNegotiationPanel from './BuildingDetails/ContractNegotiationPanel'; // Import the new panel
import BuildingRelevanciesList from './BuildingDetails/BuildingRelevanciesList'; // Import the new component
import ConstructionServicePanel from './BuildingDetails/ConstructionServicePanel'; // Uncommented
import BidPlacementPanel from './BuildingDetails/BidPlacementPanel'; // Added import
    
// Add global styles for custom scrollbar
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 248, 230, 0.1); /* Light amber track */
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(180, 120, 60, 0.3); /* Darker amber thumb */
    border-radius: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(180, 120, 60, 0.5); /* Darker amber thumb on hover */
  }
`;
    
// Storage Progress Bar Component
const StorageProgressBar = ({ used, capacity }) => {
  if (!capacity || capacity <= 0) return null;
      
  const percentage = Math.min(100, Math.round((used / capacity) * 100));
  const getBarColor = () => {
    if (percentage < 70) return 'bg-green-500';
    if (percentage < 90) return 'bg-amber-500';
    return 'bg-red-500';
  };
      
  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">Storage</span>
        <span className="text-sm text-gray-600">{used} / {capacity} units ({percentage}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className={`h-2.5 rounded-full ${getBarColor()}`} 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};
    
// Declare the window interface extension for __polygonData
declare global {
  interface Window {
    __polygonData?: any[];
    __bridgeOrientationCache?: Record<string, number>;
  }
}
    
// Ensure the global declaration is properly exported
export {};
    
interface BuildingDetailsPanelProps {
  selectedBuildingId: string | null;
  onClose: () => void;
  visible?: boolean;
  polygons?: any[];
}
    
export default function BuildingDetailsPanel({ 
  selectedBuildingId, 
  onClose, 
  visible = true,
  polygons = []
}: BuildingDetailsPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [building, setBuilding] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landData, setLandData] = useState<any>(null);
  const [buildingDefinition, setBuildingDefinition] = useState<any>(null);
  const [pointData, setPointData] = useState<any>(null);
  const [polygonsData, setPolygonsData] = useState<any[]>(polygons);
  const [buildingContracts, setBuildingContracts] = useState<any[]>([]);
  const [buildingResources, setBuildingResources] = useState<any>(null);
  const [isLoadingResources, setIsLoadingResources] = useState<boolean>(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [showNegotiationPanel, setShowNegotiationPanel] = useState<boolean>(false);
  const [negotiatingResource, setNegotiatingResource] = useState<any | null>(null);
  const [negotiationSeller, setNegotiationSeller] = useState<string | null>(null);

  // State for building bids
  const [buildingBids, setBuildingBids] = useState<any[]>([]);
  const [isLoadingBids, setIsLoadingBids] = useState<boolean>(false);
  const [showBidPlacementPanel, setShowBidPlacementPanel] = useState<boolean>(false);
  
  // State for construction building's public contract
  const [publicConstructionContract, setPublicConstructionContract] = useState<any | null>(null);
  const [constructionRatePercent, setConstructionRatePercent] = useState<number>(100); // Default to 100% (rate 1.0)
  const [contractTitle, setContractTitle] = useState<string>('');
  const [contractDescription, setContractDescription] = useState<string>('');
  const [isLoadingPublicConstructionContract, setIsLoadingPublicConstructionContract] = useState<boolean>(false);
  const [isUpdatingConstructionRate, setIsUpdatingConstructionRate] = useState<boolean>(false);

  // State for the "built by" contract and profile
  const [constructionProjectContract, setConstructionProjectContract] = useState<any | null>(null);
  const [builderProfile, setBuilderProfile] = useState<any | null>(null);
      
  // New state for 3-column layout
  type ChatTabType = 'builtBy' | 'runBy' | 'owner' | 'occupant';
  const [activeChatTab, setActiveChatTab] = useState<ChatTabType>('runBy');
  // Default to 'construction' if not constructed, then 'production' if storage, then 'market' if business, else 'production'
  type ContentTabType = 'construction' | 'production' | 'market' | 'real-estate' | 'ledger'; // Added 'ledger'
  const [activeContentTab, setActiveContentTab] = useState<ContentTabType>(
    (building && building.isConstructed === false) ? 'construction' : 
    (building?.subCategory === 'storage') ? 'production' : 
    (building?.category === 'business' ? 'market' : 'production')
  );
  const [chatMessages, setChatMessages] = useState<{ id: string, sender: string, role: 'user' | 'assistant', text: string, time: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiResponding, setIsAiResponding] = useState<boolean>(false); // Will double as context loading
  // const [kinosModel, setKinosModel] = useState<'gemini-2.5-pro-preview-05-06' | 'local'>('gemini-2.5-pro-preview-05-06'); // Removed: Model is now dynamic
    
  // State for citizen profiles
  const [ownerProfile, setOwnerProfile] = useState<any>(null);
  const [occupantProfile, setOccupantProfile] = useState<any>(null);
  const [runByProfile, setRunByProfile] = useState<any>(null);
  const [randomQuote, setRandomQuote] = useState<string>('');
  const [emptyTabMessage, setEmptyTabMessage] = useState<string>('');

  const KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2';
  const KINOS_CHANNEL_BLUEPRINT = 'serenissima-ai';

  const getKinosModelForSocialClass = (socialClass?: string): string => {
    const lowerSocialClass = socialClass?.toLowerCase();
    switch (lowerSocialClass) {
      case 'nobili':
        return 'gemini-2.5-pro-preview-05-06';
      case 'cittadini':
      case 'forestieri':
        return 'gemini-2.5-flash-preview-05-20';
      case 'popolani':
      case 'facchini':
        return 'local';
      default:
        console.warn(`BuildingDetailsPanel: Unknown social class '${socialClass}', defaulting to gemini-2.5-flash-preview-05-20.`);
        return 'gemini-2.5-flash-preview-05-20';
    }
  };

  const venetianQuotes = [
    "A Ducat in hand is worth two in the canal.",
    "The tide of trade waits for no merchant; hoist your sails when the wind is fair.",
    "Let your ledger be as clear as Murano glass, and your profits as rich as Eastern spice.",
    "Risk is the salt of commerce; too little and the venture is bland, too much and it spoils.",
    "$COMPUTE flows to vision, Ducats to diligence.",
    "A contract sealed in trust is stronger than one bound by a thousand laws.",
    "In Venice, land is not bought, it is conquered – by Ducats and by wit.",
    "A well-placed building is a silent mint, coining Ducats day and night.",
    "The stones of your palace speak your legacy; build them wisely.",
    "Pay your lease as you pray for your soul – regularly and without fail.",
    "Nobility is earned in deeds, not just inherited by name. Let your Influence echo.",
    "The Popolani's craft feeds the Cittadini's trade, and the Nobili's ambition steers the Republic.",
    "A full purse may open doors, but a sharp mind keeps them from closing.",
    "From Facchino to Doge, every Venetian carries the Republic in their heart (and their coin purse).",
    "The strength of the Guild is the Master; the strength of the Master is the Guild.",
    "Let your craft be your voice, and its quality your decree.",
    "A Guild divided is a contract lost.",
    "Influence, like a gondola, is steered silently but moves great things.",
    "A decree whispered in the right ear is louder than a proclamation shouted in the Piazza.",
    "The Council of Ten has many eyes, but a clever merchant sees what they do not.",
    "Your reputation arrives before your ship and lingers long after its departure.",
    "In Venice, an ally today may be a rival tomorrow. Keep your ledgers balanced and your friendships conditional.",
    "Trust is the rarest commodity in Venice; spend it more wisely than gold.",
    "The wise merchant knows the currents before setting sail.",
    "Let your rivals see your sails, but never the contents of your cargo.",
    "Patience is a virtue, but in Venice, swift action often reaps the greater reward.",
    "A warm home and a full belly make for a keen mind in the Rialto.",
    "Even the Doge must eat. Remember the value of honest bread.",
    "Venice was not built on dreams alone, but on Ducats, daring, and the salt of the sea.",
    "The Lagoon whispers secrets to those who listen – of fortunes made and empires lost."
  ];

  const emptyProductionQuotes = [
    "The workshop's tools lie still, awaiting the artisan's touch and the flow of raw materials.",
    "Silence reigns in these halls where industry might flourish; no goods are currently crafted or stored here.",
    "This establishment's ledgers show no production, its storerooms echo with emptiness.",
    "Awaiting the hum of activity, this place currently offers no wares born of labor or craft.",
    "The fires of production are yet to be lit; no resources are transformed, no inventory held."
  ];

  const emptyMarketQuotes = [
    "The merchant's stall stands quiet, no goods offered for sale, no contracts sought for purchase.",
    "This marketplace is currently devoid of commerce; no items are listed for trade.",
    "The scales of commerce are still; this establishment neither sells nor seeks to buy at present.",
    "An empty display, a silent auction block – this venue awaits its first transaction.",
    "No wares grace these shelves, no demands for goods are posted. The market sleeps."
  ];

  // Effect to select a random quote when the panel is shown for a building
  useEffect(() => {
    if (selectedBuildingId) {
      const randomIndex = Math.floor(Math.random() * venetianQuotes.length);
      setRandomQuote(venetianQuotes[randomIndex]);
    }
  }, [selectedBuildingId]); // Re-select quote when building changes

  // Effect to select a random empty tab message based on the active tab
  useEffect(() => {
    if (activeContentTab === 'production') {
      const randomIndex = Math.floor(Math.random() * emptyProductionQuotes.length);
      setEmptyTabMessage(emptyProductionQuotes[randomIndex]);
    } else if (activeContentTab === 'market') {
      const randomIndex = Math.floor(Math.random() * emptyMarketQuotes.length);
      setEmptyTabMessage(emptyMarketQuotes[randomIndex]);
    } else {
      setEmptyTabMessage(''); // Clear for other tabs
    }
  }, [activeContentTab, building]); // Re-select when tab or building changes

  // Effect to reset activeChatTab based on available data
  useEffect(() => {
    const isRunByTabAvailable = building?.category === 'business';
    
    if (constructionProjectContract && builderProfile) {
      // If builtBy info is available, it could be the default,
      // but we also need to ensure it's the *active* choice if selected.
      // The main default setting is handled by the useEffect tied to selectedBuildingId.
    } else if (activeChatTab === 'builtBy') {
      // If builtBy was active but data disappeared (e.g. contract deleted), switch.
      setActiveChatTab(isRunByTabAvailable ? 'runBy' : 'owner');
    } else if (activeChatTab === 'runBy' && !isRunByTabAvailable) {
      setActiveChatTab('owner'); // Default to 'owner' if 'runBy' is hidden and not 'builtBy'
    }
  }, [building, activeChatTab, setActiveChatTab, constructionProjectContract, builderProfile]);

  // Effect to reset activeContentTab if the current tab becomes unavailable
  useEffect(() => {
    const isMarketTabAvailable = building?.category === 'business' && building?.subCategory !== 'storage';
    if (activeContentTab === 'market' && !isMarketTabAvailable) {
      setActiveContentTab('production'); // If market tab was active and disappears, switch to production
    }
    // The primary default setting is handled by the useEffect tied to selectedBuildingId and building.
  }, [building, activeContentTab, setActiveContentTab]);
    
    
  // Helper function to format building types for display
  const formatBuildingType = (type: string): string => {
    if (!type) return 'Building';
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return formatted;
  };
    
  // Helper function to fetch citizen profile
  const fetchCitizenProfileByUsername = async (username: string) => {
    if (!username) return null;
    try {
      // A simple client-side cache
      if ((window as any).__citizenProfileCache && (window as any).__citizenProfileCache[username]) {
        return (window as any).__citizenProfileCache[username];
      }
      const response = await fetch(`/api/citizens/${username}`);
      if (!response.ok) {
        console.error(`Failed to fetch profile for ${username}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (data.success && data.citizen) {
        if (!(window as any).__citizenProfileCache) {
          (window as any).__citizenProfileCache = {};
        }
        (window as any).__citizenProfileCache[username] = data.citizen;
        return data.citizen;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching profile for ${username}:`, error);
      return null;
    }
  };
    
  // Add the scrollbar styles to the document
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = scrollbarStyles;
    document.head.appendChild(styleElement);
        
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
      
  // Add this useEffect to debug the building resources data
  useEffect(() => {
    if (buildingResources) {
      console.log('Building resources loaded:', buildingResources);
      console.log('Sellable resources:', buildingResources.resources?.sellable);
      console.log('Bought resources:', buildingResources.resources?.bought);
      console.log('Storable resources:', buildingResources.resources?.storable);
      console.log('Transformation recipes:', buildingResources.resources?.transformationRecipes);
      console.log('Storage info:', buildingResources.storage);
    }
  }, [buildingResources]);
      
  // Get current username from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const profileStr = localStorage.getItem('citizenProfile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          if (profile && profile.username) {
            setCurrentUsername(profile.username);
            console.log('Current username:', profile.username);
          }
        }
      } catch (error) {
        console.error('Error getting current username:', error);
      }
    }
  }, []);
      
  // Fetch building resources (comprehensive data)
  const fetchBuildingResources = async (buildingId: string, currentBuilding: any) => { // Added currentBuilding parameter
    if (!currentBuilding) {
      // If currentBuilding is not available (e.g., initial load or error),
      // try to fetch minimal building data to check subCategory.
      // This is a fallback, ideally currentBuilding is passed correctly.
      try {
        console.log(`fetchBuildingResources: currentBuilding not provided for ${buildingId}, attempting fallback fetch.`);
        const buildingCheckResponse = await fetch(`/api/buildings/${buildingId}`);
        if (buildingCheckResponse.ok) {
          const buildingCheckData = await buildingCheckResponse.json();
          if (buildingCheckData.building) {
            currentBuilding = buildingCheckData.building;
            console.log(`fetchBuildingResources: Fallback fetch successful for ${buildingId}. SubCategory: ${currentBuilding.subCategory}`);
          } else {
            console.error('fetchBuildingResources: Fallback fetch did not return building data.');
            // Proceed with original resource fetching if subCategory check is not possible
          }
        } else {
          console.error(`fetchBuildingResources: Fallback fetch for building data failed with status ${buildingCheckResponse.status}.`);
           // Proceed with original resource fetching
        }
      } catch (err) {
        console.error('fetchBuildingResources: Error in fallback building fetch:', err);
        // Proceed with original resource fetching
      }
    }


    // Handle construction subCategory specifically
    if (currentBuilding && currentBuilding.subCategory === 'construction') {
      console.log(`fetchBuildingResources: Building ${buildingId} is a construction type. Fetching public contract.`);
      setIsLoadingPublicConstructionContract(true);
      try {
        const contractApiUrl = `/api/contracts?sellerBuilding=${encodeURIComponent(currentBuilding.buildingId || currentBuilding.id)}&type=public_construction&resourceType=construction_service`;
        console.log(`Fetching public construction contract from: ${contractApiUrl}`);
        const contractResponse = await fetch(contractApiUrl);
        if (contractResponse.ok) {
          const contractData = await contractResponse.json();
          if (contractData.success && contractData.contracts && contractData.contracts.length > 0) {
            const foundContract = contractData.contracts[0];
            setPublicConstructionContract(foundContract);
            setConstructionRatePercent(Math.round((foundContract.pricePerResource || foundContract.price || 1.0) * 100)); // Use pricePerResource first
            setContractTitle(foundContract.Title || `Construction Services by ${currentBuilding.name || currentBuilding.type}`);
            setContractDescription(foundContract.Notes || `General construction services offered by ${currentBuilding.name || currentBuilding.type}.`);
            console.log('Found public construction contract:', foundContract);
          } else {
            // No contract found, create a placeholder
            const defaultTitle = `Construction Services by ${currentBuilding.name || formatBuildingType(currentBuilding.type)}`;
            const defaultDescription = `General construction services offered by ${currentBuilding.name || formatBuildingType(currentBuilding.type)}. We build with quality and celerity.`;
            const placeholderContract = {
              ContractId: `public_construction_service_${currentBuilding.buildingId || currentBuilding.id}`,
              Type: 'public_construction',
              ResourceType: 'construction_service',
              PricePerResource: 1.0,
              Seller: currentBuilding.runBy || currentBuilding.owner,
              SellerBuilding: currentBuilding.buildingId || currentBuilding.id,
              TargetAmount: 999999,
              Status: 'active',
              isPlaceholder: true, // Mark as placeholder
            };
            setPublicConstructionContract(placeholderContract);
            setConstructionRatePercent(100);
            setContractTitle(defaultTitle);
            setContractDescription(defaultDescription);
            console.log('No public construction contract found, created placeholder:', placeholderContract);
          }
        } else {
          console.error(`Failed to fetch public construction contract: ${contractResponse.status}`);
          const defaultTitleOnError = `Construction Services by ${currentBuilding.name || formatBuildingType(currentBuilding.type)}`;
          const defaultDescriptionOnError = `General construction services offered by ${currentBuilding.name || formatBuildingType(currentBuilding.type)}. We build with quality and celerity.`;
          // Still set placeholder on API error to allow setting rate
           const placeholderContract = {
              ContractId: `public_construction_service_${currentBuilding.buildingId || currentBuilding.id}`,
              Type: 'public_construction',
              ResourceType: 'construction_service',
              PricePerResource: 1.0,
              Seller: currentBuilding.runBy || currentBuilding.owner,
              SellerBuilding: currentBuilding.buildingId || currentBuilding.id,
              TargetAmount: 999999,
              Status: 'active',
              isPlaceholder: true,
            };
            setPublicConstructionContract(placeholderContract);
            setConstructionRatePercent(100);
            setContractTitle(defaultTitleOnError);
            setContractDescription(defaultDescriptionOnError);
        }
      } catch (error) {
        console.error('Error fetching public construction contract:', error);
        const defaultTitleOnCatch = `Construction Services by ${currentBuilding.name || formatBuildingType(currentBuilding.type)}`;
        const defaultDescriptionOnCatch = `General construction services offered by ${currentBuilding.name || formatBuildingType(currentBuilding.type)}. We build with quality and celerity.`;
         const placeholderContract = {
            ContractId: `public_construction_service_${currentBuilding.buildingId || currentBuilding.id}`,
            Type: 'public_construction',
            ResourceType: 'construction_service',
            PricePerResource: 1.0,
            Seller: currentBuilding.runBy || currentBuilding.owner,
            SellerBuilding: currentBuilding.buildingId || currentBuilding.id,
            TargetAmount: 999999,
            Status: 'active',
            isPlaceholder: true,
          };
          setPublicConstructionContract(placeholderContract);
          setConstructionRatePercent(100);
          setContractTitle(defaultTitleOnCatch);
          setContractDescription(defaultDescriptionOnCatch);
      } finally {
        setIsLoadingPublicConstructionContract(false);
      }
      // For construction buildings, we might not need to fetch other resources, or we can do it additionally
      // For now, let's assume this is the primary "market" data for them.
      setIsLoadingResources(false); // Ensure this is set
      setBuildingResources({ resources: { sellable: [], bought: [], storable: [], stored: [], publiclySold: [], transformationRecipes: [] }, storage: null }); // Clear other resources
      return;
    }

    // Original resource fetching logic for non-construction buildings
    console.log(`fetchBuildingResources: Building ${buildingId} is NOT a construction type (or subCategory unknown). Fetching standard resources.`);
    try {
      setIsLoadingResources(true);
      console.log(`Fetching resources for building ${buildingId}`);
          
      const response = await fetch(`/api/building-resources/${encodeURIComponent(buildingId)}`);
          
      if (!response.ok) {
        console.error(`Failed to fetch building resources: ${response.status} ${response.statusText}`);
        setBuildingResources(null); // Clear resources on error
        return;
      }
          
      const data = await response.json();
      if (data.success) {
        console.log(`Fetched resources for building ${buildingId}:`, data);
            
        // Ensure all resource arrays exist even if they're empty
        const resources = data.resources || {};
        resources.sellable = resources.sellable || [];
        resources.bought = resources.bought || [];
        resources.storable = resources.storable || [];
        resources.stored = resources.stored || [];
        resources.publiclySold = resources.publiclySold || [];
        resources.transformationRecipes = resources.transformationRecipes || [];
            
        // Update the data with the normalized resources
        data.resources = resources;
            
        setBuildingResources(data);
            
        // Store publicly sold resources in window for access by ResourceList component
        (window as any).__buildingPubliclySoldResources = resources.publiclySold;
            
        // Set building contracts from the publiclySold resources
        if (data.resources && data.resources.publiclySold) {
          setBuildingContracts(data.resources.publiclySold);
        } else {
          setBuildingContracts([]); // Clear contracts if not present
        }
      } else {
        console.error(`Error fetching building resources: ${data.error}`);
        setBuildingResources(null); // Clear resources on API error
        setBuildingContracts([]); // Clear contracts
      }
    } catch (error) {
      console.error('Error fetching building resources:', error);
      setBuildingResources(null); // Clear resources on exception
      setBuildingContracts([]); // Clear contracts
    } finally {
      setIsLoadingResources(false);
    }
  };
    
  // Fetch building details when a building is selected
  useEffect(() => {
    let isMounted = true;
        
    if (selectedBuildingId) {
      setIsLoading(true);
      setError(null);
          
      fetch(`/api/buildings/${selectedBuildingId}`)
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error(`Building not found (ID: ${selectedBuildingId})`);
            }
            throw new Error(`Failed to fetch building: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          if (!isMounted) return;
              
          console.log('Building data:', data);
          if (data && data.building) {
            setBuilding(data.building);
                
            // Store the runBy information in window for access by ResourceList component
            // Prioritize runBy, then occupant, then owner
            if (data.building.runBy) {
              (window as any).__currentBuildingRunBy = data.building.runBy;
            } else if (data.building.occupant) {
              (window as any).__currentBuildingRunBy = data.building.occupant;
            } else {
              (window as any).__currentBuildingRunBy = data.building.owner;
            }
                
            // If we have a landId, fetch the land data
            if (data.building.landId) { // Changed from land_id
              fetchLandData(data.building.landId); // Changed from land_id
            }
                
            // Fetch resources for this building (includes contracts)
            if (data.building) { // Ensure data.building exists before passing
              fetchBuildingResources(selectedBuildingId, data.building);
              fetchBuildingBids(selectedBuildingId); // Fetch bids for the building

              // Fetch construction project contract
              fetch(`/api/contracts?buyerBuilding=${encodeURIComponent(selectedBuildingId)}&type=construction_project`)
                .then(contractRes => contractRes.json())
                .then(async contractData => {
                  if (contractData.success && contractData.contracts && contractData.contracts.length > 0) {
                    const projectContract = contractData.contracts[0];
                    setConstructionProjectContract(projectContract);
                    if (projectContract.seller) {
                      const profile = await fetchCitizenProfileByUsername(projectContract.seller);
                      setBuilderProfile(profile);
                    }
                  } else {
                    setConstructionProjectContract(null);
                    setBuilderProfile(null);
                  }
                })
                .catch(contractErr => {
                  console.error('Error fetching construction project contract:', contractErr);
                  setConstructionProjectContract(null);
                  setBuilderProfile(null);
                });
            }
          } else {
            throw new Error('Invalid building data format');
          }
        })
        .catch(error => {
          if (!isMounted) return;
              
          console.error('Error fetching building details:', error);
          setError(error.message || 'Failed to load building details');
          setBuilding(null);
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
          }
        });
    } else {
      setBuilding(null);
      setError(null);
      setBuildingContracts([]);
      setBuildingResources(null);
      setPublicConstructionContract(null);
      setBuildingBids([]); // Clear bids
      setConstructionProjectContract(null); // Clear builtBy contract
      setBuilderProfile(null); // Clear builder profile
      // Clear the runBy information
      (window as any).__currentBuildingRunBy = null;
      // Clear the publicly sold resources
      (window as any).__buildingPubliclySoldResources = null;
    }
        
    return () => {
      isMounted = false;
    };
  }, [selectedBuildingId]);

  // Fetch building bids
  const fetchBuildingBids = async (buildingId: string) => {
    if (!buildingId) return;
    setIsLoadingBids(true);
    try {
      const response = await fetch(`/api/contracts?type=building_bid&assetId=${encodeURIComponent(buildingId)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.contracts) {
          setBuildingBids(data.contracts);
          console.log(`Fetched ${data.contracts.length} bids for building ${buildingId}`);
        } else {
          setBuildingBids([]);
          console.error('Failed to fetch building bids:', data.error);
        }
      } else {
        setBuildingBids([]);
        console.error('API error fetching building bids:', response.status);
      }
    } catch (error) {
      setBuildingBids([]);
      console.error('Exception fetching building bids:', error);
    } finally {
      setIsLoadingBids(false);
    }
  };

  const handleSetConstructionRate = async () => {
    if (!publicConstructionContract || !building || !currentUsername) return;

    const buildingOperator = building.runBy || building.owner;
    if (currentUsername !== buildingOperator) {
      alert("You are not authorized to set the rate for this building.");
      return;
    }

    setIsUpdatingConstructionRate(true);
    const rateToSet = constructionRatePercent / 100;
    const contractPayload = {
      ...publicConstructionContract, // Spread existing details
      ContractId: publicConstructionContract.ContractId || `public_construction_service_${building.buildingId || building.id}`,
      Type: 'public_construction',
      ResourceType: 'construction_service',
      PricePerResource: rateToSet,
      Seller: buildingOperator,
      SellerBuilding: building.buildingId || building.id,
      TargetAmount: 999999, // A large number for an ongoing service
      Status: 'active',
      Title: contractTitle, // Add Title
      Notes: contractDescription, // Use contractDescription for Notes field
      // Buyer can be null or 'public' for this type of contract
    };
    delete contractPayload.isPlaceholder; // Remove placeholder flag before sending

    try {
      // TODO: Replace with the actual API endpoint for creating/updating contracts
      // This endpoint needs to support UPSERT logic based on ContractId.
      const response = await fetch('/api/contracts', { 
        method: 'POST', // Or PUT if your API uses PUT for updates
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractPayload),
      });

      if (response.ok) {
        const updatedContract = await response.json();
        if (updatedContract.success && updatedContract.contract) {
          setPublicConstructionContract(updatedContract.contract);
          setConstructionRatePercent(Math.round((updatedContract.contract.pricePerResource || 1.0) * 100));
          alert('Construction rate updated successfully!');
        } else {
          throw new Error(updatedContract.error || 'Failed to update rate: API success false');
        }
      } else {
        const errorData = await response.json().catch(() => ({error: `API Error: ${response.status}`}));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error setting construction rate:', error);
      alert(`Failed to set construction rate: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUpdatingConstructionRate(false);
    }
  };
    
  // useEffect to fetch citizen profiles when building data is available
  useEffect(() => {
    if (building) {
      const fetchProfiles = async () => {
        // Fetch Owner Profile
        if (building.owner) {
          const profile = await fetchCitizenProfileByUsername(building.owner);
          setOwnerProfile(profile);
        } else {
          setOwnerProfile(null);
        }

        // Fetch Occupant Profile
        if (building.occupant) {
          const profile = await fetchCitizenProfileByUsername(building.occupant);
          setOccupantProfile(profile);
        } else {
          setOccupantProfile(null);
        }
        
        // Fetch RunBy Profile (strictly from building.runBy)
        if (building.runBy) {
          const profile = await fetchCitizenProfileByUsername(building.runBy);
          setRunByProfile(profile);
        } else {
          setRunByProfile(null);
        }
      };
      fetchProfiles();
    } else {
      // Clear profiles if no building
      setOwnerProfile(null);
      setOccupantProfile(null);
      setRunByProfile(null);
    }
  }, [building]);
      
  // Add this helper function to find and load the building definition file
  const loadBuildingDefinition = async (type: string, variant?: string, buildingData?: any): Promise<any> => {
    try {
      console.log(`Looking for building definition for type: ${type}, variant: ${variant || 'none'}`);
          
      // First check if we have building types data
      const cachedBuildingTypes = (typeof window !== 'undefined' && (window as any).__buildingTypes) 
        ? (window as any).__buildingTypes 
        : null;
          
      if (cachedBuildingTypes) {
        const buildingType = cachedBuildingTypes.find((bt: any) => 
          bt.type.toLowerCase() === type.toLowerCase() || 
          bt.name?.toLowerCase() === type.toLowerCase()
        );
            
        if (buildingType) {
          console.log('Found building definition in cached building types:', buildingType);
          return buildingType;
        }
      }
          
      // If not found in cache, try the building-types API directly
      try {
        const response = await fetch(`/api/building-types?type=${encodeURIComponent(type)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.buildingType) {
            console.log('Found building definition via building-types API:', data.buildingType);
            return data.buildingType;
          }
        }
      } catch (error) {
        console.log(`Error with building-types API for ${type}:`, error);
      }
          
      // If still not found, try the building-data API endpoint which searches recursively
      try {
        const response = await fetch(`/api/building-data/${encodeURIComponent(type)}`);
        if (response.ok) {
          const data = await response.json();
          console.log('Found building definition via building-data API:', data);
          return data;
        } else {
          console.log(`building-data API returned ${response.status} for ${type}`);
        }
      } catch (error) {
        console.log(`Error with building-data API for ${type}:`, error);
      }
          
      // Then try the general data API with various paths
      const pathsToTry = [
        // Try with category/subCategory structure if we know them
        ...(buildingData?.category && buildingData?.subCategory 
          ? [`/api/data/buildings/${buildingData.category}/${buildingData.subCategory}/${type}.json`] 
          : []),
        // Try direct path
        `/api/data/buildings/${type}.json`,
        // Try lowercase
        `/api/data/buildings/${type.toLowerCase()}.json`,
        // Try with underscores instead of spaces
        `/api/data/buildings/${type.replace(/\s+/g, '_').toLowerCase()}.json`,
        // Try with hyphens instead of spaces
        `/api/data/buildings/${type.replace(/\s+/g, '-').toLowerCase()}.json`
      ];
          
      // Try each path in sequence
      for (const path of pathsToTry) {
        try {
          console.log(`Trying path: ${path}`);
          const response = await fetch(path);
          if (response.ok) {
            const data = await response.json();
            console.log(`Found building definition at ${path}:`, data);
            return data;
          }
        } catch (error) {
          console.log(`Error fetching from ${path}:`, error);
        }
      }
          
      // If we still haven't found it, try the building-definition API
      try {
        const response = await fetch(`/api/building-definition?type=${encodeURIComponent(type)}`);
        if (response.ok) {
          const data = await response.json();
          console.log('Found building definition via building-definition API:', data);
          return data;
        }
      } catch (error) {
        console.log(`Error with building-definition API for ${type}:`, error);
      }
          
      console.log(`No building definition found for ${type} after trying all methods`);
      return null;
    } catch (error) {
      console.error('Error loading building definition:', error);
      return null;
    }
  };
      
  // Add this effect to load the building definition when a building is selected
  useEffect(() => {
    let isMounted = true;
        
    if (building?.type) {
      loadBuildingDefinition(building.type, building.variant, building)
        .then(definition => {
          if (isMounted) {
            console.log('Loaded building definition:', definition);
            setBuildingDefinition(definition);
          }
        })
        .catch(error => {
          if (isMounted) {
            console.error('Error loading building definition:', error);
            setBuildingDefinition(null);
          }
        });
    } else {
      setBuildingDefinition(null);
    }
        
    return () => {
      isMounted = false;
    };
  }, [building]);
      
  // Add this useEffect to get polygons from window if not provided as props
  useEffect(() => {
    if (polygons.length === 0 && typeof window !== 'undefined' && window.__polygonData) {
      setPolygonsData(window.__polygonData);
    } else {
      setPolygonsData(polygons);
    }
  }, [polygons]);
      
  // Add this useEffect to debug the building definition
  useEffect(() => {
    if (buildingDefinition) {
      console.log('Building definition loaded:', buildingDefinition);
      console.log('Has maintenance cost:', buildingDefinition.maintenanceCost !== undefined);
      console.log('Maintenance cost value:', buildingDefinition.maintenanceCost);
    }
  }, [buildingDefinition]);
      
  // Add this useEffect to find the point data when a building is selected
  useEffect(() => {
    if (building?.position && polygonsData.length > 0) {
      let position;
      try {
        position = typeof building.position === 'string' ? JSON.parse(building.position) : building.position;
      } catch (e) {
        console.error('Error parsing building position:', e);
        return;
      }
    
      // Find the polygon that contains this point
      const findPointInPolygons = () => {
        for (const polygon of polygonsData) {
          // Check building points
          if (polygon.buildingPoints) {
            const buildingPoint = polygon.buildingPoints.find((point: any) => 
              Math.abs(point.lat - position.lat) < 0.0001 && Math.abs(point.lng - position.lng) < 0.0001
            );
            if (buildingPoint) {
              console.log('Found matching building point:', buildingPoint);
              return buildingPoint;
            }
          }
              
          // Check bridge points
          if (polygon.bridgePoints) {
            const bridgePoint = polygon.bridgePoints.find((point: any) => 
              point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
            );
            if (bridgePoint) {
              console.log('Found matching bridge point:', bridgePoint);
              return bridgePoint;
            }
          }
              
          // Check canal points
          if (polygon.canalPoints) {
            const canalPoint = polygon.canalPoints.find((point: any) => 
              point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
            );
            if (canalPoint) {
              console.log('Found matching canal point:', canalPoint);
              return canalPoint;
            }
          }
        }
        return null;
      };
    
      const foundPoint = findPointInPolygons();
      setPointData(foundPoint);
    }
  }, [building, polygonsData]);
      
  // Function to fetch land data
  const fetchLandData = async (landId: string) => {
    try {
      console.log(`Fetching land data for ID: ${landId}`);
          
      // First try to get land data from window.__polygonData if available
      if (typeof window !== 'undefined' && '__polygonData' in window && window.__polygonData) {
        const polygon = window.__polygonData.find((p: any) => p.id === landId);
        if (polygon) {
          console.log(`Found land data in window.__polygonData for ID: ${landId}`, polygon);
          setLandData(polygon);
              
          // Also fetch owner information if not already included
          if (!polygon.owner) {
            fetchLandOwner(landId);
          }
              
          // Find the point data if we have building position
          if (building?.position) {
            findPointInPolygon(polygon, building.position);
          }
              
          return;
        }
      }
          
      // Otherwise fetch from API
      const response = await fetch(`/api/get-polygon/${landId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch land data: ${response.status}`);
      }
          
      const data = await response.json();
      if (data && data.polygon) {
        console.log(`Fetched land data from API for ID: ${landId}`, data.polygon);
        setLandData(data.polygon);
            
        // Also fetch owner information if not already included
        if (!data.polygon.owner) {
          fetchLandOwner(landId);
        }
            
        // Find the point data if we have building position
        if (building?.position) {
          findPointInPolygon(data.polygon, building.position);
        }
      } else {
        console.error(`No polygon data returned for ID: ${landId}`);
      }
    } catch (error) {
      console.error('Error fetching land data:', error);
    }
  };
      
  // Add a new function to find the point in the polygon
  const findPointInPolygon = (polygon: any, buildingPosition: any) => {
    try {
      let position;
      if (typeof buildingPosition === 'string') {
        position = JSON.parse(buildingPosition);
      } else {
        position = buildingPosition;
      }
          
      if (!position || !position.lat || !position.lng) {
        console.warn('Invalid building position:', position);
        return;
      }
          
      // Check building points
      if (polygon.buildingPoints) {
        const buildingPoint = polygon.buildingPoints.find((point: any) => 
          Math.abs(point.lat - position.lat) < 0.0001 && Math.abs(point.lng - position.lng) < 0.0001
        );
        if (buildingPoint) {
          console.log('Found matching building point:', buildingPoint);
          setPointData(buildingPoint);
          return;
        }
      }
          
      // Check bridge points
      if (polygon.bridgePoints) {
        const bridgePoint = polygon.bridgePoints.find((point: any) => 
          point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
        );
        if (bridgePoint) {
          console.log('Found matching bridge point:', bridgePoint);
          setPointData(bridgePoint);
          return;
        }
      }
          
      // Check canal points
      if (polygon.canalPoints) {
        const canalPoint = polygon.canalPoints.find((point: any) => 
          point.edge && Math.abs(point.edge.lat - position.lat) < 0.0001 && Math.abs(point.edge.lng - position.lng) < 0.0001
        );
        if (canalPoint) {
          console.log('Found matching canal point:', canalPoint);
          setPointData(canalPoint);
          return;
        }
      }
          
      console.log('No matching point found in polygon for position:', position);
    } catch (error) {
      console.error('Error finding point in polygon:', error);
    }
  };
      
  // Add a new function to fetch land owner information
  const fetchLandOwner = async (landId: string) => {
    try {
      console.log(`Fetching owner for land ID: ${landId}`);
      if (!landId) {
        console.warn('fetchLandOwner called with an empty landId. Skipping API call.');
        return;
      }
      const response = await fetch(`/api/get-land-owner/${landId}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`Land owner not found for LandId '${landId}' (404). The land might not exist or have an assigned owner.`);
          // No error is thrown, and landData.owner will remain unset or as previously determined.
          return; 
        }
        // For other errors (500, 401, etc.), throw an error to be caught by the catch block.
        throw new Error(`Failed to fetch land owner: ${response.status} ${response.statusText}`);
      }
            
      const data = await response.json();
      if (data && data.owner) {
        console.log(`Fetched owner for land ID: ${landId}:`, data.owner);
        // Update the land data with the owner information
        setLandData(prevData => ({
          ...prevData,
          owner: data.owner
        }));
      }
    } catch (error) {
      console.error('Error fetching land owner:', error);
    }
  };
      
  // Show panel with animation when a building is selected
  useEffect(() => {
    if (selectedBuildingId) {
      setIsVisible(true);
      // Reset tabs when a new building is selected
      // Default chat tab logic
      if (building && building.isConstructed === false && constructionProjectContract && builderProfile) {
        setActiveChatTab('builtBy');
      } else if (building?.category === 'business') {
        setActiveChatTab('runBy');
      } else {
        setActiveChatTab('owner');
      }

      // Default content tab depends on building category and construction status
      if (building && building.isConstructed === false) {
        setActiveContentTab('construction');
      } else if (building?.subCategory === 'storage') {
        setActiveContentTab('production');
      } else if (building?.category === 'business') {
        setActiveContentTab('market');
      } else {
        setActiveContentTab('production');
      }
      setChatMessages([]); // Clear chat messages
    } else {
      setIsVisible(false);
    }
  }, [selectedBuildingId, building, constructionProjectContract, builderProfile]);
      
  // Early return if not visible or no selected building
  if (!visible || !selectedBuildingId) return null;
    
  // Determine which profile to display above chat
  let activeProfileToDisplay: any = null;
  let activeCitizenProfileTitle: string = "";
    
  if (building) { // Ensure building data is available
    if (activeChatTab === 'builtBy') {
      activeProfileToDisplay = builderProfile;
      activeCitizenProfileTitle = "Built By";
    } else if (activeChatTab === 'owner') {
      activeProfileToDisplay = ownerProfile;
      activeCitizenProfileTitle = "Owner";
    } else if (activeChatTab === 'occupant') {
      activeProfileToDisplay = occupantProfile;
      activeCitizenProfileTitle = "Occupant";
    } else { // 'runBy' tab is active (default if others not applicable)
      if (building.runBy && runByProfile) { // If building.runBy is set and profile fetched
        activeProfileToDisplay = runByProfile;
        activeCitizenProfileTitle = "Managed By";
      } else if (building.occupant && occupantProfile) { // Fallback: if no explicit runBy, but there's an occupant
        activeProfileToDisplay = occupantProfile;
        if (building.category === 'business') {
          activeCitizenProfileTitle = "Business Manager";
        } else {
          activeCitizenProfileTitle = "Occupant (Manages)";
        }
      } else if (building.owner && ownerProfile) { // Fallback: if no explicit runBy or occupant, but there's an owner
        activeProfileToDisplay = ownerProfile;
        activeCitizenProfileTitle = "Owner (Manages)";
      } else { // No one to display for management
        activeProfileToDisplay = null;
        activeCitizenProfileTitle = "Management Information Not Available";
      }
    }
  }
    
    
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentUsername || !activeProfileToDisplay?.username) return;

    const userMessageContent = chatInput;
    const timestamp = new Date();

    // senderProfile (current user)
    let senderProfileObj = null; // Declare senderProfileObj here
    const savedProfile = localStorage.getItem('citizenProfile');
    if (savedProfile) try { senderProfileObj = JSON.parse(savedProfile); } catch(e) { console.error(e); }

    // Optimistically add user's message
    const userMessage = {
      id: `user-${timestamp.toISOString()}-${Math.random()}`,
      sender: 'You', // Or currentUsername if preferred
      role: 'user' as 'user',
      text: userMessageContent,
      time: timestamp.toLocaleTimeString(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsAiResponding(true); // Indicates context fetching + AI response

    // Determine the actual current username reliably
    let actualCurrentUsername = null;
    const savedProfileForCurrent = localStorage.getItem('citizenProfile');
    if (savedProfileForCurrent) {
        try {
            const profile = JSON.parse(savedProfileForCurrent);
            if (profile.username) {
                actualCurrentUsername = profile.username;
            }
        } catch (e) {
            console.error("Error parsing citizenProfile for current username in BuildingDetailsPanel", e);
        }
    }
    // Fallback to component state if localStorage didn't yield a username but state is valid
    if (!actualCurrentUsername && currentUsername) { // currentUsername is the state variable
        actualCurrentUsername = currentUsername;
    }
    
    if (!actualCurrentUsername) {
        console.error("BuildingDetailsPanel: Could not determine current user for chat. Aborting Kinos call.");
        setIsAiResponding(false);
        // Optionally, add an error message to chatMessages
        setChatMessages(prev => [...prev, {
            id: `error-user-${Date.now()}`,
            sender: 'System',
            role: 'assistant',
            text: "Error: Could not identify the current user to send the message.",
            time: new Date().toLocaleTimeString(),
        }]);
        return;
    }

    // Call Kinos AI
    const targetCitizenUsername = activeProfileToDisplay.username;

    // Prepare addSystem payload
    let addSystemPayload = null;
    try {
      // senderProfile (current user)
      let senderProfileObj = null;
      // const savedProfile = localStorage.getItem('citizenProfile'); // Already fetched as savedProfileForCurrent
      if (savedProfileForCurrent) try { senderProfileObj = JSON.parse(savedProfileForCurrent); } catch(e) { console.error(e); }

      // targetProfile is 'activeProfileToDisplay'

      // Fetch relationship
      let relationshipWithTarget = null;
      if (actualCurrentUsername !== targetCitizenUsername) { // Use actualCurrentUsername
        const relRes = await fetch(`/api/relationships?citizen1=${actualCurrentUsername}&citizen2=${targetCitizenUsername}`);
        const relData = relRes.ok ? await relRes.json() : null;
        relationshipWithTarget = relData?.success ? relData.relationship : null;
      } else {
        relationshipWithTarget = { strengthScore: 100, type: "Self" };
      }
      
      // Determine context limit based on the target citizen's social class
      const targetSocialClass = activeProfileToDisplay?.socialClass;
      const determinedKinosModel = getKinosModelForSocialClass(targetSocialClass);
      const isLocalModel = determinedKinosModel === 'local';

      const notificationLimit = isLocalModel ? Math.ceil(10 / 4) : 10; // Default 10, local 3
      const relevancyLimit = isLocalModel ? Math.ceil(10 / 4) : 10;    // Default 10, local 3
      const problemLimit = isLocalModel ? Math.ceil(5 / 4) : 5;        // Default 5,  local 2

      // Fetch target notifications
      const notifRes = await fetch(`/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citizen: targetCitizenUsername, limit: notificationLimit }),
      });
      const notifData = notifRes.ok ? await notifRes.json() : null;
      const targetNotifications = notifData?.success ? notifData.notifications : [];

      // Fetch relevancies (target is relevantTo, sender is targetCitizen)
      const relevanciesRes = await fetch(`/api/relevancies?relevantToCitizen=${targetCitizenUsername}&targetCitizen=${actualCurrentUsername}&limit=${relevancyLimit}`); // Use actualCurrentUsername
      const relevanciesData = relevanciesRes.ok ? await relevanciesRes.json() : null;
      const relevanciesForTarget = relevanciesData?.success ? relevanciesData.relevancies : [];
      
      // Fetch problems for target and sender
      let allProblems = [];
      const problemsTargetRes = await fetch(`/api/problems?citizen=${targetCitizenUsername}&status=active&limit=${problemLimit}`);
      const problemsTargetData = problemsTargetRes.ok ? await problemsTargetRes.json() : null;
      if (problemsTargetData?.success && problemsTargetData.problems) {
        allProblems.push(...problemsTargetData.problems);
      }
      if (actualCurrentUsername !== targetCitizenUsername) { // Use actualCurrentUsername
        const problemsSenderRes = await fetch(`/api/problems?citizen=${actualCurrentUsername}&status=active&limit=${problemLimit}`); // Use actualCurrentUsername
        const problemsSenderData = problemsSenderRes.ok ? await problemsSenderRes.json() : null;
        if (problemsSenderData?.success && problemsSenderData.problems) {
          problemsSenderData.problems.forEach(p => {
            if (!allProblems.find(existing => existing.problemId === p.problemId)) {
              allProblems.push(p);
            }
          });
        }
      }
      
      const systemContext = {
        ai_citizen_profile: activeProfileToDisplay,
        sender_citizen_profile: senderProfileObj,
        relationship_with_sender: relationshipWithTarget,
        recent_notifications_for_ai: targetNotifications,
        recent_relevancies_ai_to_sender: relevanciesForTarget,
        recent_problems_involving_ai_or_sender: allProblems
      };
      addSystemPayload = JSON.stringify(systemContext);

    } catch (contextError) {
      console.error("Error preparing context for Kinos AI in BuildingDetailsPanel:", contextError);
    }

    const aiDisplayName = activeProfileToDisplay?.firstName || targetCitizenUsername || 'Citizen';
    const senderDisplayName = senderProfileObj?.firstName || actualCurrentUsername || 'User'; // Use actualCurrentUsername

    const kinosPromptContent = 
`You are ${aiDisplayName}, an AI citizen of Venice. You are responding to a message from ${senderDisplayName}.
IMPORTANT: Your response should be human-like and conversational.
DO NOT use overly formal language or write excessively long paragraphs unless the context truly calls for it.
Aim for natural, pertinent, and engaging dialogue.

CRITICAL: Use the structured context provided in the 'addSystem' field (detailed below) to make your response RELEVANT to ${senderDisplayName} and FOCUSED ON GAMEPLAY.
Your message should reflect your understanding of your relationship, recent events, and potential gameplay interactions with ${senderDisplayName}.

Guide to 'addSystem' content (use this to make your message relevant and gameplay-focused):
- 'ai_citizen_profile': Your own detailed profile (status, wealth, etc.).
- 'sender_citizen_profile': The profile of ${senderDisplayName}.
- 'relationship_with_sender': Your existing relationship status with ${senderDisplayName}.
- 'recent_notifications_for_ai': Recent news/events you've received that might be relevant to your conversation.
- 'recent_relevancies_ai_to_sender': Why ${senderDisplayName} (or things related to them) are specifically relevant to you. This is key for a relevant response!
- 'recent_problems_involving_ai_or_sender': Recent issues involving you or ${senderDisplayName} that could be part of your discussion.

--- USER'S MESSAGE TO YOU ---
${userMessageContent}
--- END OF USER'S MESSAGE ---

Remember: Your reply should be human-like, conversational, RELEVANT to ${senderDisplayName} using the context, and FOCUSED ON GAMEPLAY. NO FLUFF. Aim for a natural and pertinent response.
Your response:`;

    const targetSocialClass = activeProfileToDisplay?.socialClass;
    const determinedKinosModel = getKinosModelForSocialClass(targetSocialClass);

    const kinosBody: any = { content: kinosPromptContent, model: determinedKinosModel };
    if (addSystemPayload) {
      kinosBody.addSystem = addSystemPayload;
    }

    fetch(
      `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${targetCitizenUsername}/channels/${actualCurrentUsername}/messages`, // Use actualCurrentUsername
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(kinosBody),
      }
    )
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error(`Kinos AI API responded with status ${response.status}`);
    })
    .then(async kinosData => { // Added async here
      if ((kinosData.message_id || kinosData.id) && kinosData.content) {
        const aiMessage = {
          id: kinosData.message_id || kinosData.id || `kinos-msg-${Date.now()}`,
          sender: activeProfileToDisplay.firstName || targetCitizenUsername, // AI responds as the target citizen
          role: (kinosData.role || 'assistant') as 'assistant',
          text: kinosData.content,
          time: kinosData.timestamp ? new Date(kinosData.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString(),
        };
        setChatMessages(prev => [...prev, aiMessage]);

        // Persist AI response to Airtable via our backend
        try {
          const persistResponse = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sender: targetCitizenUsername, // AI is the sender
              receiver: actualCurrentUsername,    // User is the receiver, use actualCurrentUsername
              content: kinosData.content,
              type: 'message_ai_augmented'
            }),
          });
          if (!persistResponse.ok) {
            console.error('Failed to persist Kinos AI response to Airtable (BuildingDetailsPanel):', await persistResponse.text());
          } else {
            console.log('Kinos AI response persisted to Airtable (BuildingDetailsPanel).');
          }
        } catch (persistError) {
          console.error('Error persisting Kinos AI response (BuildingDetailsPanel):', persistError);
        }

      } else {
        console.error('Invalid response from Kinos AI:', kinosData);
        const errorAiMessage = {
          id: `error-kinos-${new Date().toISOString()}`,
          sender: activeProfileToDisplay.firstName || targetCitizenUsername,
          role: 'assistant' as 'assistant',
          text: "My apologies, I encountered an issue processing that.",
          time: new Date().toLocaleTimeString(),
        };
        setChatMessages(prev => [...prev, errorAiMessage]);
      }
    })
    .catch(error => {
      console.error('Error calling Kinos AI channel API:', error);
      const exceptionAiMessage = {
        id: `exception-kinos-${new Date().toISOString()}`,
        sender: activeProfileToDisplay.firstName || targetCitizenUsername,
        role: 'assistant' as 'assistant',
        text: "Pardon me, a momentary lapse in communication. Please try again.",
        time: new Date().toLocaleTimeString(),
      };
      setChatMessages(prev => [...prev, exceptionAiMessage]);
    })
    .finally(() => {
      setIsAiResponding(false);
    });
  };
    
  const handleStartNegotiation = (resource: any) => {
    if (!building) return;
    // Prioritize runBy, then occupant, then owner for determining the seller/manager
    const seller = building.runBy || building.occupant || building.owner;
    if (!seller) {
      console.error("Cannot start negotiation: building seller (runBy/occupant/owner) is not defined.");
      alert("Seller information is missing for this building.");
      return;
    }
    if (!currentUsername) {
      alert("You must be logged in to negotiate.");
      return;
    }
    
    // Find if there's a public_sell contract for this resource type from this building
    const publicSellContract = buildingResources?.resources?.publiclySold?.find(
      (contract: any) => contract.resourceType === resource.resourceType
    );
    
    const listingPrice = publicSellContract ? publicSellContract.price : (resource.price || 0);
    
    const resourceWithPriceInfo = {
      ...resource, // Spreads the original resource, including its own importPrice if it has one
      importPrice: resource.importPrice !== undefined && resource.importPrice !== null 
                   ? resource.importPrice 
                   : 0, // Actual import price, or 0 if not defined
      price: listingPrice // This is the "market" (public_sell) price if available, else original resource.price, else 0
    };
    
    setNegotiatingResource(resourceWithPriceInfo);
    setNegotiationSeller(seller);
    setShowNegotiationPanel(true);
  };
      
  return (
    <>
      <div 
        className={`fixed top-20 left-20 right-4 bottom-4 bg-amber-50 border-2 border-amber-700 rounded-lg p-6 shadow-lg z-50 transition-all duration-300 pointer-events-auto ${
          isVisible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'
      }`}
    >
      <div className="h-full flex flex-col">
        {/* Header with improved styling */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-serif font-semibold text-amber-800">
            {!isLoading && !error && building ? (building.name ?? formatBuildingType(building.type)) : 'Building Details'}
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
            
        {/* Error message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-4">
            <h3 className="font-bold mb-1">Error</h3>
            <p>{String(error)}</p>
            <button 
              onClick={onClose}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        )}
            
        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-500"></div>
          </div>
        ) : !error && building ? (<>
          <div className="flex flex-row gap-4 flex-grow overflow-hidden h-full">
            {/* Column 1: Content Tabs */}
            <div className="w-1/3 h-full flex flex-col">
              <div className="mb-3 border-b border-amber-300 flex-shrink-0">
                <nav className="flex space-x-1" aria-label="Content Tabs">
                  {((): ContentTabType[] => {
                    const tabs: ContentTabType[] = [];
                    if (building && building.isConstructed === false) {
                      tabs.push('construction');
                    }
                    if (building?.category === 'business' && building?.subCategory !== 'storage') {
                      tabs.push('market');
                    }
                    tabs.push('production');
                    tabs.push('real-estate');
                    tabs.push('ledger'); // Added Ledger tab
                    return tabs;
                  })().map((tabName) => (
                    <button
                      key={tabName}
                      onClick={() => setActiveContentTab(tabName)}
                      className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                        ${activeContentTab === tabName 
                          ? 'bg-amber-600 text-white' 
                          : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                        }`}
                    >
                      {tabName === 'construction' ? 'Construction' : 
                       tabName === 'production' ? (building?.subCategory === 'storage' ? 'Storage' : 'Production') : 
                       tabName === 'market' ? 'Market' :
                       tabName === 'real-estate' ? 'Real-estate' :
                       'Ledger'} {/* Label for Ledger tab */}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1">
                {activeContentTab === 'construction' && building && building.isConstructed === false && (
                  <div className="bg-amber-100 p-4 rounded-lg shadow">
                    <h4 className="text-lg font-serif text-amber-700 mb-3">Construction Progress</h4>
                    {building.constructionMinutesRemaining !== undefined && (
                      <div className="mb-4">
                        <span className="text-sm text-amber-800">Construction Time Remaining: </span>
                        <span className="bg-amber-200 text-amber-800 px-3 py-1 rounded-full inline-block font-semibold">
                            {(() => {
                              const totalMinutes = building.constructionMinutesRemaining;
                              if (totalMinutes <= 0) return "Completed (Pending Update)";
                              const days = Math.floor(totalMinutes / (60 * 24));
                              const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
                              const minutes = totalMinutes % 60;
                              let timeStr = "";
                              if (days > 0) timeStr += `${days} day${days > 1 ? 's' : ''} `;
                              if (hours > 0) timeStr += `${hours} hour${hours > 1 ? 's' : ''} `;
                              if (minutes > 0 || (days === 0 && hours === 0)) timeStr += `${minutes} minute${minutes > 1 ? 's' : ''}`;
                              return timeStr.trim() || "Calculating...";
                            })()}
                        </span>
                      </div>
                    )}
                    <h5 className="text-md font-semibold text-amber-700 mb-3">Required Materials:</h5>
                    {buildingDefinition?.constructionCosts && Object.keys(buildingDefinition.constructionCosts).length > 0 ? (
                      <div className="space-y-4"> {/* Increased space-y */}
                        {Object.entries(buildingDefinition.constructionCosts).map(([resourceType, requiredAmount]) => {
                          if (resourceType === 'ducats' || typeof requiredAmount !== 'number' || requiredAmount <= 0) return null;
                          
                          const storedResource = buildingResources?.resources?.stored?.find(
                            (r: any) => r.resourceType === resourceType || r.name === resourceType
                          );
                          const storedAmount = storedResource?.amount || 0;
                          const progress = Math.min(100, (storedAmount / requiredAmount) * 100);
                          const resourceIconName = resourceType.toLowerCase().replace(/\s+/g, '_');

                          return (
                            <div key={resourceType} className="text-sm p-3 bg-amber-50 rounded-md border border-amber-200">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center">
                                  <img 
                                    src={`https://backend.serenissima.ai/public_assets/images/resources/${resourceIconName}.png`} 
                                    alt={resourceType} 
                                    className="w-16 h-16 mr-3 object-contain" // Increased size (x2) and margin
                                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/resources/default.png'; }}
                                  />
                                  <span className="text-amber-800 capitalize font-bold">{resourceType.replace(/_/g, ' ')}</span> {/* Removed colon, changed to font-bold */}
                                </div>
                                <span className="text-amber-700 font-semibold">{storedAmount} / {requiredAmount}</span>
                              </div>
                              <div className="w-full bg-amber-200 rounded-full h-3 mt-1">
                                <div
                                  className={`h-3 rounded-full ${progress >= 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-amber-600 italic">No specific material costs defined.</p>
                    )}
                  </div>
                )}
                {activeContentTab === 'real-estate' && (
                  <>
                    <BuildingLocation 
                      building={building}
                      landData={landData}
                      pointData={pointData}
                    />
                    <BuildingMaintenance maintenanceCost={buildingDefinition?.maintenanceCost} />
                    <BuildingDescription 
                      fullDescription={buildingDefinition?.fullDescription}
                      createdAt={building.createdAt}
                      createdBy={building.createdBy}
                    />
                    {/* BuildingOwner and BuildingOccupant removed from Info tab */}
                    <BuildingFinancials 
                      leasePrice={building.leasePrice} 
                      rentPrice={building.rentPrice} 
                    />
                    <BuildingBidsList
                      bids={buildingBids}
                      isLoading={isLoadingBids}
                      currentUser={currentUsername}
                      buildingOwner={building?.owner}
                      onPlaceBid={() => setShowBidPlacementPanel(true)}
                      // Placeholder handlers for bid actions
                      onAcceptBid={(bidId) => console.log('Accept bid:', bidId)}
                      onRefuseBid={(bidId) => console.log('Refuse bid:', bidId)}
                      onAdjustBid={(bid) => console.log('Adjust bid:', bid)}
                      onWithdrawBid={(bidId) => console.log('Withdraw bid:', bidId)}
                    />
                  </>
                )}
                {activeContentTab === 'production' && (
                  <>
                    {building?.category === 'business' && <RecipeList recipes={buildingResources?.resources?.transformationRecipes || []} />}
                    {buildingResources?.storage && (
                      <StorageProgressBar 
                        used={buildingResources.storage.used} 
                        capacity={buildingResources.storage.capacity} 
                      />
                    )}
                    {building?.subCategory === 'storage' && (
                      <ResourceList 
                        title="STORES" 
                        resources={buildingResources?.resources?.storable || []} 
                        type="store" 
                        storageCapacity={buildingResources?.storage?.capacity}
                        // onStartNegotiation={handleStartNegotiation} // Not used for 'store' type in this way
                        buildingId={building?.buildingId || building?.id}
                        buildingOwnerOrOperator={building?.runBy || building?.owner}
                      />
                    )}
                    <ResourceList 
                      title="CURRENT INVENTORY" 
                      resources={buildingResources?.resources?.stored || []} 
                      type="inventory"
                      // onStartNegotiation={handleStartNegotiation} // Inventory items are not directly negotiated from this list
                    />
                    {/* Immersive message for empty Production tab */}
                    {!(buildingResources?.resources?.transformationRecipes?.length > 0) &&
                     !(buildingResources?.storage && (buildingResources.storage.used > 0 || buildingResources.storage.capacity > 0)) && // Check if storage has content or capacity
                     !(buildingResources?.resources?.storable?.length > 0) &&
                     !(buildingResources?.resources?.stored?.length > 0) &&
                     (building?.subCategory !== 'storage' || (building?.subCategory === 'storage' && !(buildingResources?.storage && (buildingResources.storage.used > 0 || buildingResources.storage.capacity > 0)))) && // For pure storage, only show if truly empty
                      <p className="text-amber-700 italic text-sm text-center py-4">{emptyTabMessage}</p>
                    }
                  </>
                )}
                {activeContentTab === 'ledger' && building && (
                  <BuildingLedger 
                    buildingId={building.buildingId || building.id} 
                    buildingName={building.name || formatBuildingType(building.type)} 
                  />
                )}
                {activeContentTab === 'market' && building?.category === 'business' && (
                  <>
                    <ResourceList 
                      title="SELLS" 
                      resources={buildingResources?.resources?.sellable || []} 
                      type="sell"
                      onStartNegotiation={handleStartNegotiation}
                    />
                    <ResourceList 
                      title="BUYS" 
                      resources={buildingResources?.resources?.bought || []} 
                      type="buy"
                      onStartNegotiation={handleStartNegotiation} 
                      disabledResources={
                        buildingResources?.resources?.bought
                          ?.filter(buyResource => 
                            !(buildingResources?.resources?.publiclySold || [])
                              .some(sellResource => sellResource.resourceType === buyResource.resourceType)
                          )
                          .map(resource => resource.resourceType) || []
                      }
                    />
                    {/* Immersive message for empty Market tab */}
                    {!(buildingResources?.resources?.sellable?.length > 0) &&
                     !(buildingResources?.resources?.bought?.length > 0) &&
                      <p className="text-amber-700 italic text-sm text-center py-4">{emptyTabMessage}</p>
                    }
                  </>
                )}
                {/* UI for Construction SubCategory */}
                {activeContentTab === 'market' && building?.subCategory === 'construction' && (
                  <ConstructionServicePanel
                    building={building}
                    publicConstructionContract={publicConstructionContract}
                    isLoadingPublicConstructionContract={isLoadingPublicConstructionContract}
                    currentUsername={currentUsername}
                    contractTitle={contractTitle}
                    setContractTitle={setContractTitle}
                    contractDescription={contractDescription}
                    setContractDescription={setContractDescription}
                    constructionRatePercent={constructionRatePercent}
                    setConstructionRatePercent={setConstructionRatePercent}
                    isUpdatingConstructionRate={isUpdatingConstructionRate}
                    handleSetConstructionRate={handleSetConstructionRate}
                  />
                )}
              </div>
            </div>

            {/* Column 2: Chat */}
            <div className="w-1/3 h-full flex flex-col border-r border-amber-200 pr-2">
              <div className="mb-3 border-b border-amber-300 flex-shrink-0">
                <nav className="flex space-x-1" aria-label="Chat Tabs">
                  {((): ChatTabType[] => {
                    const tabs: ChatTabType[] = [];
                    if (building && building.isConstructed === false && constructionProjectContract && builderProfile) {
                      tabs.push('builtBy');
                    }
                    if (building?.category === 'business') {
                      tabs.push('runBy');
                    }
                    tabs.push('owner');
                    tabs.push('occupant');
                    return tabs;
                  })().map((tabName) => (
                    <button
                      key={tabName}
                      onClick={() => setActiveChatTab(tabName)}
                      className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                        ${activeChatTab === tabName 
                          ? 'bg-amber-600 text-white' 
                          : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                        }`}
                    >
                      {tabName === 'builtBy' ? 'Built By' : tabName === 'runBy' ? 'Run By' : tabName.charAt(0).toUpperCase() + tabName.slice(1)}
                    </button>
                  ))}
                </nav>
              </div>
    
              {/* Player Profile Display Area */}
              <ChatCitizenDisplay
                citizen={activeProfileToDisplay}
                title={activeCitizenProfileTitle}
              />
    
              <div 
                className="flex-grow overflow-y-auto custom-scrollbar space-y-2 mb-2 bg-amber-50 p-2 rounded-md"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'repeat'
                }}
              >
                {/* Chat messages placeholder */}
                {chatMessages.length === 0 && !isAiResponding && <p className="text-xs text-gray-500 italic text-center py-4">No messages yet. Start a conversation!</p>}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`p-2 rounded-lg text-xs ${msg.role === 'user' ? 'bg-orange-100 text-orange-800 ml-auto' : 'bg-gray-100 text-gray-800 mr-auto'}`} style={{maxWidth: '80%'}}>
                    <p className="font-semibold">{msg.sender}</p>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: React.Fragment }}>{msg.text}</ReactMarkdown>
                    <p className="text-gray-500 text-right text-[10px]">{msg.time}</p>
                  </div>
                ))}
                {isAiResponding && (
                  <div className="text-left mb-3 p-2 rounded-lg text-xs bg-yellow-50 text-yellow-700 mr-auto" style={{maxWidth: '80%'}}> {/* Changed container to light yellow */}
                    <p className="font-semibold">{activeProfileToDisplay?.firstName || activeProfileToDisplay?.username || 'Assistant'}</p>
                    <div className="flex space-x-1 items-center">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={handleChatSubmit} className="flex-shrink-0 flex pt-2 border-t border-amber-200 items-end">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Message ${activeProfileToDisplay?.firstName || activeProfileToDisplay?.username || 'them'}... (Shift+Enter for newline)`}
                  className="flex-grow p-2 border border-amber-300 rounded-l-md text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                  rows={3}
                  disabled={isAiResponding || !activeProfileToDisplay?.username}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!isAiResponding && activeProfileToDisplay?.username) handleChatSubmit(e as any);
                    }
                  }}
                  style={{ maxHeight: '120px' }} 
                />
                <button 
                  type="submit" 
                  className="px-3 py-2 bg-amber-600 text-white rounded-r-md hover:bg-amber-700 text-sm self-stretch disabled:bg-amber-400" // Added disabled style for button
                  disabled={isAiResponding || !chatInput.trim() || !activeProfileToDisplay?.username}
                >
                  {isAiResponding ? (
                    <svg className="animate-spin h-4 w-4 text-yellow-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> {/* Changed text-white to text-yellow-300 */}
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : "Send"}
                </button>
              </form>
            </div>
                
            {/* Column 3: Image & Building Relevancies */}
            <div className="w-1/3 h-full flex flex-col overflow-hidden pl-2">
              <div className="flex-shrink-0">
                {buildingDefinition && (
                  <BuildingImage 
                    buildingType={building.type}
                    buildingVariant={building.variant}
                    buildingName={buildingDefinition.name}
                    shortDescription={buildingDefinition.shortDescription}
                    flavorText={buildingDefinition.flavorText}
                  />
                )}
              </div>
              <div className="flex-grow overflow-y-auto custom-scrollbar mt-2">
                {building && currentUsername && (
                  <BuildingRelevanciesList 
                    buildingId={building.buildingId || building.id} 
                    citizenUsername={currentUsername} 
                  />
                )}
              </div>
            </div>
          </div>
          </>) : (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-gray-500 italic">
              {error ? 'Unable to load building details' : 'No building selected'}
            </p>
          </div>
        )}
            
        {/* Random Venetian Quote Footer */}
        <div className="mt-4 text-center px-4">
          <p className="text-sm italic font-serif text-orange-700 opacity-50">
            "{randomQuote}"
          </p>
        </div>
      </div>
    </div> {/* Closes the main panel div: className="fixed top-20 left-20..." */}
    
      {showNegotiationPanel && negotiatingResource && negotiationSeller && currentUsername && building && (
        <ContractNegotiationPanel
          resource={negotiatingResource}
          sellerUsername={negotiationSeller}
          buyerUsername={currentUsername}
          buildingId={building.buildingId || building.id}
          onClose={() => {
            setShowNegotiationPanel(false);
            setNegotiatingResource(null);
            setNegotiationSeller(null);
          }}
          isVisible={showNegotiationPanel}
        />
      )}
      {showBidPlacementPanel && building && currentUsername && (
        <BidPlacementPanel
          buildingId={building.buildingId || building.id}
          buildingName={building.name || formatBuildingType(building.type)}
          currentOwner={building.owner}
          currentUser={currentUsername}
          onClose={() => setShowBidPlacementPanel(false)}
          onBidPlaced={() => {
            setShowBidPlacementPanel(false);
            fetchBuildingBids(building.buildingId || building.id); // Refresh bids
          }}
        />
      )}
    </>
  );
}
