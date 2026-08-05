import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWalletContext } from '@/components/UI/WalletProvider'; // Import useWalletContext
import { eventBus, EventTypes } from '@/lib/utils/eventBus'; // Import eventBus
// Citizen type might still be needed if 'citizen' prop has more fields than CitizenRelevanciesList expects for formatting
// import { Citizen } from '@/components/PolygonViewer/types';
import InfoIcon from './InfoIcon';
import ReactMarkdown from 'react-markdown'; // Added import
import remarkGfm from 'remark-gfm'; // Added import
// ReactMarkdown and remarkGfm are now primarily used in CitizenRelevanciesList and CitizenCorrespondanceColumn
import { FaSpinner, FaExpand, FaCompress } from 'react-icons/fa'; // Removed FaVolumeUp, FaVolumeMute
// CitizenRelevanciesList is used within CitizenInfoColumn
// Module-level flag to track if REQUEST_WALLET_STATUS has been emitted globally
// let hasRequestedWalletStatusGlobally = false; // This seems unused, consider removing if not needed elsewhere.

// Helper function to generate a canonical cache key for relationships
const getCanonicalCacheKey = (user1: string | null | undefined, user2: string | null | undefined): string => {
  if (!user1 || !user2) return `invalid_relationship_key_${Date.now()}`; // Avoid collisions, ensure it won't match
  return [user1, user2].sort().join('_');
};

// Import the new column components
import CitizenInfoColumn from './CitizenInfoColumn';
import CitizenCorrespondanceColumn from './CitizenCorrespondanceColumn';
import CitizenProfileColumn from './CitizenProfileColumn';
import CitizenLedger from './CitizenLedger'; // Import CitizenLedger
import JournalViewerPanel from './JournalViewerPanel'; // Import JournalViewerPanel

// Add global styles for custom scrollbar
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(255, 248, 230, 0.1);
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(180, 120, 60, 0.3);
    border-radius: 20px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(180, 120, 60, 0.5);
  }
`;

interface CitizenDetailsPanelProps {
  citizen: any; // Use 'any' type instead of the detailed interface
  onClose: () => void;
}

const CitizenDetailsPanel: React.FC<CitizenDetailsPanelProps> = ({ citizen, onClose }) => {
  // Add the styles to the document
  useEffect(() => {
    // Create style element
    const styleElement = document.createElement('style');
    styleElement.innerHTML = scrollbarStyles;
    document.head.appendChild(styleElement);
    
    // Clean up on unmount
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  const [isVisible, setIsVisible] = useState(false);
  const [isCorrespondanceFullScreen, setIsCorrespondanceFullScreen] = useState(false); // State for correspondance full screen
  // Add state for home and work buildings
  const [homeBuilding, setHomeBuilding] = useState<any>(null);
  const [workBuilding, setWorkBuilding] = useState<any>(null);
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false);
  // Add new state for activities
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  // Add state for chat functionality
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false); // Will double as context loading indicator
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [messagesFetchFailed, setMessagesFetchFailed] = useState<boolean>(false);
  // Add a ref to track if we've already tried to fetch messages for this citizen
  const messagesFetchAttemptedRef = useRef<{[citizenId: string]: boolean}>({});
  // Add a ref to track if we've already tried to fetch activities for this citizen
  const activitiesFetchAttemptedRef = useRef<{[citizenId: string]: boolean}>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Add state for relevancies
  const [relevancies, setRelevancies] = useState<any[]>([]);
  const [isLoadingRelevancies, setIsLoadingRelevancies] = useState<boolean>(false);
  const [cachedRelevancies, setCachedRelevancies] = useState<Record<string, any[]>>({});
  const relevanciesFetchAttemptedRef = useRef<{[key: string]: boolean}>({});
  // Add state for relationship
  const [relationship, setRelationship] = useState<any>(null);
  const [isLoadingRelationship, setIsLoadingRelationship] = useState<boolean>(false);
  const [cachedRelationships, setCachedRelationships] = useState<Record<string, any>>({});
  const relationshipFetchAttemptedRef = useRef<{[key: string]: boolean}>({});
  const [noRelationshipMessage, setNoRelationshipMessage] = useState<string>('');
  // Add state for problems
  const [problems, setProblems] = useState<any[]>([]);
  const [isLoadingProblems, setIsLoadingProblems] = useState<boolean>(false);
  const [cachedProblems, setCachedProblems] = useState<Record<string, any[]>>({});
  const problemsFetchAttemptedRef = useRef<{[key: string]: boolean}>({});
  // State for citizen's transport resources
  const [transportResources, setTransportResources] = useState<any[]>([]);
  // The formatRelevancyText function is moved to CitizenRelevanciesList.tsx
  const [isLoadingTransports, setIsLoadingTransports] = useState<boolean>(false);
  const [cachedTransports, setCachedTransports] = useState<Record<string, any[]>>({});
  const transportFetchAttemptedRef = useRef<{[key: string]: boolean}>({});
  // State for active sub-tab in the InfoColumn (first column)
  const [activeInfoColumnTab, setActiveInfoColumnTab] = useState<'relations' | 'citizen' | 'ledger'>('relations');
  // State for active main tab in the first column - 'info' is now the only mode for the first column.
  // const [mainLeftColumnTab, setMainLeftColumnTab] = useState<'info' | 'ledger'>('info'); // Effectively always 'info'
  
  // State for citizen thoughts (already declared above)
  const [citizenThoughts, setCitizenThoughts] = useState<any[]>([]);
  const [isLoadingThoughts, setIsLoadingThoughts] = useState<boolean>(false);
  const thoughtsFetchAttemptedRef = useRef<{[key: string]: boolean}>({}); // Changed to string key for citizenId or username
  
  // Add state for journal files
  const [journalFiles, setJournalFiles] = useState<any[]>([]);
  const [isLoadingJournal, setIsLoadingJournal] = useState<boolean>(false);
  const journalFetchAttemptedRef = useRef<{[key: string]: boolean}>({});
  const [selectedJournalFile, setSelectedJournalFile] = useState<any | null>(null);
  const [isJournalPanelVisible, setIsJournalPanelVisible] = useState<boolean>(false);

  const { citizenProfile: currentCitizenProfileFromContext } = useWalletContext();
  const internalCurrentCitizenUsername = currentCitizenProfileFromContext?.username;
  // No need for initialLogDoneRef or useEffect to manage internalCurrentCitizenUsername,
  // as it's now derived directly from the context. WalletProvider handles event subscriptions.

  const getKinOSModelForSocialClass = (socialClass?: string): string => {
    const lowerSocialClass = socialClass?.toLowerCase();
    switch (lowerSocialClass) {
      case 'nobili':
        return 'gemini-2.5-pro-preview-06-05';
      case 'cittadini':
      case 'forestieri':
        return 'gemini-2.5-flash-preview-05-20';
      case 'popolani':
      case 'facchini':
        return 'local';
      default:
        console.warn(`CitizenDetailsPanel: Unknown social class '${socialClass}', defaulting to gemini-2.5-flash-preview-05-20.`);
        return 'gemini-2.5-flash-preview-05-20';
    }
  };

  // Function to check if the current user is ConsiglioDeiDieci
  const isConsiglioDeiDieci = () => {
    try {
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        return profile.username === 'ConsiglioDeiDieci';
      }
      return false;
    } catch (error) {
      console.error('Error checking if user is ConsiglioDeiDieci:', error);
      return false;
    }
  };
  
  // Add function to fetch citizen activities
  const fetchCitizenActivities = async (citizenId: string) => {
    if (!citizenId) return;
    
    // Check if we've already attempted to fetch activities for this citizen
    if (activitiesFetchAttemptedRef.current[citizenId]) {
      console.log(`Already attempted to fetch activities for citizen ${citizenId}, skipping`);
      return;
    }
    
    // Mark that we've attempted to fetch activities for this citizen
    activitiesFetchAttemptedRef.current[citizenId] = true;
    
    // Use a flag to prevent state updates after unmounting
    let isMounted = true;
    
    setIsLoadingActivities(true);
    try {
      const response = await fetch(`/api/activities?citizenId=${citizenId}&limit=50&timeRange=24h`);
      if (response.ok) {
        const data = await response.json();
        if (isMounted) {
          setActivities(data.activities || []);
          console.log(`Loaded ${data.activities?.length || 0} activities for citizen ${citizenId}`);
        }
      } else {
        // Change from console.error to console.warn for 404 responses
        if (response.status === 404) {
          console.warn(`No activities found for citizen ${citizenId}: ${response.status} ${response.statusText}`);
        } else {
          console.warn(`Failed to fetch activities for citizen ${citizenId}: ${response.status} ${response.statusText}`);
        }
        if (isMounted) {
          setActivities([]);
        }
      }
    } catch (error) {
      console.warn('Error fetching citizen activities:', error);
      if (isMounted) {
        setActivities([]);
      }
    } finally {
      if (isMounted) {
        setIsLoadingActivities(false);
      }
    }
    
    return () => {
      isMounted = false;
    };
  };
  
  // Add function to fetch relevancies
  const fetchRelevancies = async (targetCitizenUsername: string) => {
    if (!targetCitizenUsername) return;
    if (!internalCurrentCitizenUsername) {
      console.warn('[CitizenDetailsPanel fetchRelevancies] No current username (internal state), cannot fetch relevancies for', targetCitizenUsername);
      setRelevancies([]);
      setIsLoadingRelevancies(false);
      return;
    }
    // Key for attempted ref should be unique to the pair or target, depending on API logic
    const attemptKey = `${internalCurrentCitizenUsername}_${targetCitizenUsername}`;
    if (relevanciesFetchAttemptedRef.current[attemptKey]) {
      console.log(`[fetchRelevancies] Already attempted for ${attemptKey}, skipping.`);
      return;
    }
    console.log(`[fetchRelevancies] Attempting for ${attemptKey}`);
    relevanciesFetchAttemptedRef.current[attemptKey] = true;
    let isMounted = true;
    setIsLoadingRelevancies(true);
    setRelevancies([]);

    try {
      const response = await fetch(`/api/relevancies?targetCitizen=${targetCitizenUsername}&relevantToCitizen=${internalCurrentCitizenUsername}`);
      if (isMounted) {
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.relevancies) {
            setRelevancies(data.relevancies);
            setCachedRelevancies(prev => ({ ...prev, [targetCitizenUsername]: data.relevancies })); // Cache against targetCitizen
          } else {
            setRelevancies([]);
            setCachedRelevancies(prev => ({ ...prev, [targetCitizenUsername]: [] }));
          }
        } else {
          console.warn('Failed to fetch relevancies:', response.status, response.statusText);
          setRelevancies([]);
          setCachedRelevancies(prev => ({ ...prev, [targetCitizenUsername]: [] }));
        }
      }
    } catch (error) {
      console.error('Error fetching relevancies:', error);
      if (isMounted) setRelevancies([]);
      setCachedRelevancies(prev => ({ ...prev, [targetCitizenUsername]: [] }));
    } finally {
      if (isMounted) setIsLoadingRelevancies(false);
    }
    return () => { isMounted = false; };
  };

  // Function to fetch problems for a citizen
  const fetchProblems = async (citizenUsername: string) => {
    if (!citizenUsername) return;
    if (problemsFetchAttemptedRef.current[citizenUsername]) {
      console.log(`[fetchProblems] Already attempted for ${citizenUsername}, skipping.`);
      return;
    }
    console.log(`[fetchProblems] Attempting for ${citizenUsername}`);
    problemsFetchAttemptedRef.current[citizenUsername] = true;
    let isMounted = true;
    setIsLoadingProblems(true);
    setProblems([]);

    try {
      const response = await fetch(`/api/problems?citizen=${citizenUsername}&status=active`);
      if (isMounted) {
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.problems) {
            setProblems(data.problems);
            setCachedProblems(prev => ({ ...prev, [citizenUsername]: data.problems }));
          } else {
            setProblems([]);
            setCachedProblems(prev => ({ ...prev, [citizenUsername]: [] }));
          }
        } else {
          console.warn('Failed to fetch problems:', response.status, response.statusText);
          setProblems([]);
          setCachedProblems(prev => ({ ...prev, [citizenUsername]: [] }));
        }
      }
    } catch (error) {
      console.error('Error fetching problems:', error);
      if (isMounted) setProblems([]);
      setCachedProblems(prev => ({ ...prev, [citizenUsername]: [] }));
    } finally {
      if (isMounted) setIsLoadingProblems(false);
    }
    return () => { isMounted = false; };
  };

  // Function to fetch citizen's transport resources
  const fetchTransportResources = async (citizenUsername: string) => {
    if (!citizenUsername) return;

    if (transportFetchAttemptedRef.current[citizenUsername]) {
        console.log(`[fetchTransportResources] Already attempted for ${citizenUsername}. Skipping.`);
        // If already attempted, ensure data is from cache or current state is respected.
        // Loading state should also be false.
        if (cachedTransports.hasOwnProperty(citizenUsername) && transportResources !== cachedTransports[citizenUsername]) {
            setTransportResources(cachedTransports[citizenUsername]);
        }
        setIsLoadingTransports(false);
        return;
    }
    console.log(`[fetchTransportResources] Attempting for ${citizenUsername}.`);
    transportFetchAttemptedRef.current[citizenUsername] = true;
    let isMounted = true;
    setIsLoadingTransports(true);
    setTransportResources([]);

    try {
      const response = await fetch(`/api/citizens/${citizenUsername}/transports`);
      if (isMounted) {
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.transports) {
            setTransportResources(data.transports);
            setCachedTransports(prev => ({ ...prev, [citizenUsername]: data.transports }));
          } else {
            setTransportResources([]);
            setCachedTransports(prev => ({ ...prev, [citizenUsername]: [] }));
            console.warn(`Failed to fetch transports or no transports found for ${citizenUsername}:`, data.error);
          }
        } else {
          console.warn(`Error fetching transports for ${citizenUsername}: ${response.status} ${response.statusText}`);
          setTransportResources([]);
          setCachedTransports(prev => ({ ...prev, [citizenUsername]: [] }));
        }
      }
    } catch (error) {
      console.error(`Exception fetching transports for ${citizenUsername}:`, error);
      if (isMounted) setTransportResources([]);
      setCachedTransports(prev => ({ ...prev, [citizenUsername]: [] }));
    } finally {
      if (isMounted) setIsLoadingTransports(false);
    }
    return () => { isMounted = false; };
  };

  // Function to fetch citizen thoughts
  const fetchCitizenThoughts = async (currentCitizenId: string) => {
    if (!currentCitizenId) {
      console.log("[CitizenDetailsPanel fetchCitizenThoughts] No citizenId provided.");
      return;
    }

    const usernameForApi = citizen?.username;
    if (!usernameForApi) {
      console.warn(`[CitizenDetailsPanel fetchCitizenThoughts] citizen.username is not available for citizenId ${currentCitizenId}, cannot fetch thoughts.`);
      setIsLoadingThoughts(false);
      setCitizenThoughts([]);
      return;
    }
    
    // Use currentCitizenId (which is citizen.citizenId) as the key for the ref
    if (thoughtsFetchAttemptedRef.current[currentCitizenId]) {
      console.log(`[CitizenDetailsPanel fetchCitizenThoughts] Already attempted to fetch thoughts for citizenId ${currentCitizenId} (username: ${usernameForApi}), skipping.`);
      return;
    }
    
    console.log(`[CitizenDetailsPanel fetchCitizenThoughts] Attempting to fetch thoughts for citizenId ${currentCitizenId} (username: ${usernameForApi}).`);
    thoughtsFetchAttemptedRef.current[currentCitizenId] = true;
    
    let isMounted = true;
    setIsLoadingThoughts(true);
    setCitizenThoughts([]); // Clear previous thoughts before fetching new ones

    try {
      const response = await fetch(`/api/thoughts?citizenUsername=${encodeURIComponent(usernameForApi)}&limit=5`);
      if (isMounted) {
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.thoughts)) {
            setCitizenThoughts(data.thoughts);
            console.log(`[CitizenDetailsPanel fetchCitizenThoughts] Fetched ${data.thoughts.length} thoughts for citizen ${usernameForApi}.`);
          } else {
            console.warn(`[CitizenDetailsPanel fetchCitizenThoughts] Failed to fetch thoughts or invalid format for ${usernameForApi}:`, data.error || 'Unknown error');
            setCitizenThoughts([]);
          }
        } else {
          console.warn(`[CitizenDetailsPanel fetchCitizenThoughts] API error fetching thoughts for ${usernameForApi}: ${response.status} ${response.statusText}`);
          setCitizenThoughts([]);
        }
      }
    } catch (error) {
      console.warn(`[CitizenDetailsPanel fetchCitizenThoughts] Exception fetching thoughts for ${usernameForApi}:`, error);
      if (isMounted) setCitizenThoughts([]);
    } finally {
      if (isMounted) setIsLoadingThoughts(false);
    }
    
    return () => {
      isMounted = false;
    };
  };

  // Function to fetch journal files
  const fetchJournalFiles = async (kinUsername: string) => {
    if (!kinUsername) {
      console.log("[CitizenDetailsPanel fetchJournalFiles] No kinUsername provided.");
      return;
    }

    if (journalFetchAttemptedRef.current[kinUsername]) {
      console.log(`[CitizenDetailsPanel fetchJournalFiles] Already attempted to fetch journal for ${kinUsername}, skipping.`);
      return;
    }

    console.log(`[CitizenDetailsPanel fetchJournalFiles] Attempting to fetch journal for ${kinUsername}.`);
    journalFetchAttemptedRef.current[kinUsername] = true;
    
    let isMounted = true;
    setIsLoadingJournal(true);
    setJournalFiles([]);

    try {
      const response = await fetch(`/api/kins/${encodeURIComponent(kinUsername)}/content?path=AI-Memories`);
      if (isMounted) {
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.files)) {
            // Filter out any binary files or files without content, if necessary
            let textFiles = data.files.filter((file: any) => !file.is_binary && file.content !== undefined && file.content !== null);
            // Sort by last_modified descending
            textFiles.sort((a: any, b: any) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());
            setJournalFiles(textFiles);
            console.log(`[CitizenDetailsPanel fetchJournalFiles] Fetched and sorted ${textFiles.length} journal files for ${kinUsername}.`);
          } else if (response.status === 404 && data.error && (data.error.includes("Path not found") || data.error.includes("Kin not found"))) {
            console.log(`[CitizenDetailsPanel fetchJournalFiles] Path 'AI-Memories' or Kin ${kinUsername} not found. No journal entries.`);
            setJournalFiles([]);
          } else {
            console.warn(`[CitizenDetailsPanel fetchJournalFiles] Failed to fetch journal or invalid format for ${kinUsername}:`, data.error || 'Unknown error');
            setJournalFiles([]);
          }
        } else {
           if (response.status === 404) {
             const errorData = await response.json().catch(() => ({})); // Try to parse error
             if (errorData.error && (errorData.error.includes("Path not found") || errorData.error.includes("Kin not found"))) {
                console.log(`[CitizenDetailsPanel fetchJournalFiles] Path 'AI-Memories' or Kin ${kinUsername} not found (from status 404). No journal entries.`);
             } else {
                console.warn(`[CitizenDetailsPanel fetchJournalFiles] API error 404 fetching journal for ${kinUsername}, but not a 'Path not found' or 'Kin not found' error. Details:`, errorData);
             }
           } else {
            console.warn(`[CitizenDetailsPanel fetchJournalFiles] API error fetching journal for ${kinUsername}: ${response.status} ${response.statusText}`);
           }
          setJournalFiles([]);
        }
      }
    } catch (error) {
      console.warn(`[CitizenDetailsPanel fetchJournalFiles] Exception fetching journal for ${kinUsername}:`, error);
      if (isMounted) setJournalFiles([]);
    } finally {
      if (isMounted) setIsLoadingJournal(false);
    }

    return () => {
      isMounted = false;
    };
  };

  // Function to handle journal file click
  const handleJournalFileClick = (file: any) => {
    setSelectedJournalFile(file);
    setIsJournalPanelVisible(true);
  };

  const handleCloseJournalPanel = () => {
    setIsJournalPanelVisible(false);
    setSelectedJournalFile(null);
  };

  // Function to fetch relationship data
  const fetchRelationship = async (viewedCitizenUsername: string) => {
    if (!viewedCitizenUsername) {
      setIsLoadingRelationship(false);
      return;
    }
    if (!internalCurrentCitizenUsername) {
      console.warn('[fetchRelationship] No current username (internal state), cannot fetch relationship with', viewedCitizenUsername);
      setRelationship(null);
      setIsLoadingRelationship(false);
      return;
    }

    const cacheKey = getCanonicalCacheKey(internalCurrentCitizenUsername, viewedCitizenUsername);
    if (relationshipFetchAttemptedRef.current[cacheKey]) {
      console.log(`[fetchRelationship] Already attempted for ${cacheKey}, skipping.`);
      return;
    }
    console.log(`[fetchRelationship] Attempting for ${cacheKey}`);
    relationshipFetchAttemptedRef.current[cacheKey] = true;
    let isMounted = true;
    setIsLoadingRelationship(true);
    setRelationship(null);

    if (internalCurrentCitizenUsername === viewedCitizenUsername) {
      const selfRelationship = { strengthScore: 100, type: "Self" };
      if (isMounted) {
        setRelationship(selfRelationship);
        setCachedRelationships(prev => ({ ...prev, [cacheKey]: selfRelationship }));
        setIsLoadingRelationship(false);
      }
      return () => { isMounted = false; };
    }

    try {
      const response = await fetch(`/api/relationships?citizen1=${internalCurrentCitizenUsername}&citizen2=${viewedCitizenUsername}`);
      if (isMounted) {
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.hasOwnProperty('relationship')) {
            setRelationship(data.relationship);
            setCachedRelationships(prev => ({ ...prev, [cacheKey]: data.relationship }));
          } else if (data.success && data.relationships && data.relationships.length > 0) {
            setRelationship(data.relationships[0]);
            setCachedRelationships(prev => ({ ...prev, [cacheKey]: data.relationships[0] }));
          } else {
            setRelationship(null);
            setCachedRelationships(prev => ({ ...prev, [cacheKey]: null }));
          }
        } else {
          console.warn(`Failed to fetch relationship: ${response.status} ${response.statusText}`);
          setRelationship(null);
          setCachedRelationships(prev => ({ ...prev, [cacheKey]: null }));
        }
      }
    } catch (error) {
      console.error('Error fetching relationship:', error);
      if (isMounted) setRelationship(null);
      setCachedRelationships(prev => ({ ...prev, [cacheKey]: null }));
    } finally {
      if (isMounted) setIsLoadingRelationship(false);
    }
    return () => { isMounted = false; };
  };

  // Function to fetch message history
  const fetchMessageHistory = async () => {
    // Use citizen.citizenId (camelCase)
    if (!citizen || !citizen.citizenId) return; 
    
    // Check if we've already attempted to fetch messages for this citizen
    if (messagesFetchAttemptedRef.current[citizen.citizenId]) { 
      console.log(`Already attempted to fetch messages for citizen ${citizen.citizenId}, skipping`); 
      return;
    }
    
    // Mark that we've attempted to fetch messages for this citizen
    messagesFetchAttemptedRef.current[citizen.citizenId] = true; 
    
    setIsLoadingHistory(true);
    try {
      // Use internalCurrentCitizenUsername state
      if (!internalCurrentCitizenUsername) {
        console.warn('[CitizenDetailsPanel] No current username (internal state), cannot fetch message history for', citizen.username || citizen.citizenId);
        setMessages([]);
        setIsLoadingHistory(false);
        setMessagesFetchFailed(true); // Indicate failure due to no user
        return;
      }
      
      const otherCitizenUsername = citizen.username || citizen.citizenId;
      const sortedChannelName = [internalCurrentCitizenUsername, otherCitizenUsername].sort().join('_');
      console.log(`[CitizenDetailsPanel] Fetching messages for channel ${sortedChannelName}`);

      const response = await fetch(`/api/messages/channel/${encodeURIComponent(sortedChannelName)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch message history for channel ${sortedChannelName}: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.messages) {
        // Assuming API returns msg.messageId, msg.sender, msg.content, msg.createdAt (camelCase)
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.messageId,
          role: msg.sender === internalCurrentCitizenUsername ? 'user' : 'assistant',
          content: msg.content,
          timestamp: msg.createdAt
        }));
        setMessages(formattedMessages);
        } else {
          setMessages([]);
        }
    } catch (error) {
      console.error('Error fetching message history:', error);
      setMessagesFetchFailed(true);
      setMessages([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Function to send messages
  const sendMessage = async (content: string) => {
    // Use citizen.citizenId (camelCase)
    if (!content.trim() || !citizen || !citizen.citizenId) return;

    // Use internalCurrentCitizenUsername state
    if (!internalCurrentCitizenUsername) {
      alert("You must be logged in to send messages.");
      console.warn('[CitizenDetailsPanel] Cannot send message, current user not identified (internal state).');
      return;
    }
    
    // Optimistically add citizen message to UI
    const citizenMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, citizenMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      // Always use the /api/messages/send endpoint
      // Use citizen.username, citizen.citizenId (camelCase)
      console.log(`Sending message to ${citizen.username || citizen.citizenId} using /api/messages/send`); 

      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: internalCurrentCitizenUsername, // Use state variable
          // Use citizen.username, citizen.citizenId (camelCase)
          receiver: citizen.username || citizen.citizenId,
          content: content,
          type: 'message',
          channel: [internalCurrentCitizenUsername, citizen.username || citizen.citizenId].sort().join('_') // Add sorted channel
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const data = await response.json();
      // Assuming API returns data.message.messageId (camelCase)
      if (data.success && data.message) {
        // Message sent logic
        // Example using citizen.firstName (camelCase)
        /*
        setMessages(prev => [...prev, {
          id: `conf-${data.message.messageId}`,
          role: 'assistant', 
          content: `Message sent to ${citizen.firstName}.`, 
          timestamp: new Date().toISOString()
        }]);
        */
        // Let's remove the automatic "I've received your message" as it's not from the actual recipient.
        // The message will appear for the recipient when they open their chat with the sender.

        // After successful primary message send, call KinOS AI
        if (citizen.username && internalCurrentCitizenUsername && citizen.username !== internalCurrentCitizenUsername) { // Use state variable
          // Prepare addSystem payload
          let addSystemPayload = null;
            
          // senderProfile (current user) - moved to outer scope
          let senderProfileObj = null;
          // Use internalCurrentCitizenUsername to fetch profile if needed, or rely on WalletProvider context
          // For simplicity, if WalletProvider updates localStorage.citizenProfile, this is fine.
          const savedProfile = localStorage.getItem('citizenProfile');
          if (savedProfile) try { senderProfileObj = JSON.parse(savedProfile); } catch(e) { console.error("Error parsing sender profile from localStorage for KinOS context:", e); }

          try {
            // targetProfile is 'citizen' prop
            // relationship is 'relationship' state (already fetched for the UI)

            const determinedKinOSModelForContext = getKinOSModelForSocialClass(citizen?.socialClass);
            const isLocalModelForContext = determinedKinOSModelForContext === 'local';
            const notificationLimit = isLocalModelForContext ? Math.ceil(10 / 4) : 10;
            const relevancyLimit = isLocalModelForContext ? Math.ceil(10 / 4) : 10;
            const problemLimit = isLocalModelForContext ? Math.ceil(5 / 4) : 5;
            
            // Fetch target notifications for AI (citizen)
            const notifRes = await fetch(`/api/notifications`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ citizen: citizen.username, limit: notificationLimit }),
            });
            const notifData = notifRes.ok ? await notifRes.json() : null;
            const targetNotifications = notifData?.success ? notifData.notifications : [];

            // Fetch relevancies for AI (citizen) relevant to Sender (currentUsername)
            const relevanciesForKinOSRes = await fetch(`/api/relevancies?relevantToCitizen=${citizen.username}&targetCitizen=${internalCurrentCitizenUsername}&limit=${relevancyLimit}`); // Use state variable
            const relevanciesForKinOSData = relevanciesForKinOSRes.ok ? await relevanciesForKinOSRes.json() : null;
            const relevanciesForContext = relevanciesForKinOSData?.success ? relevanciesForKinOSData.relevancies : [];
            
            // Fetch problems involving AI (citizen) or Sender (internalCurrentCitizenUsername)
            let allProblems = [];
            const problemsTargetRes = await fetch(`/api/problems?citizen=${citizen.username}&status=active&limit=${problemLimit}`);
            const problemsTargetData = problemsTargetRes.ok ? await problemsTargetRes.json() : null;
            if (problemsTargetData?.success && problemsTargetData.problems) {
              allProblems.push(...problemsTargetData.problems);
            }
            // Fetch problems for the sender (internalCurrentCitizenUsername)
            const problemsSenderRes = await fetch(`/api/problems?citizen=${internalCurrentCitizenUsername}&status=active&limit=${problemLimit}`); // Use state variable
            const problemsSenderData = problemsSenderRes.ok ? await problemsSenderRes.json() : null;
            if (problemsSenderData?.success && problemsSenderData.problems) {
              problemsSenderData.problems.forEach(p => {
                if (!allProblems.find(existing => existing.problemId === p.problemId)) {
                  allProblems.push(p);
                }
              });
            }

            const systemContext = {
              ai_citizen_profile: citizen, 
              sender_citizen_profile: senderProfileObj,
              relationship_with_sender: relationship, 
              recent_notifications_for_ai: targetNotifications, // Fetched with dynamic limit
              recent_relevancies_ai_to_sender: relevanciesForContext, // Fetched with dynamic limit
              recent_problems_involving_ai_or_sender: allProblems // Fetched with dynamic limit
            };
            addSystemPayload = JSON.stringify(systemContext);

          } catch (contextError) {
            console.error("Error preparing context for KinOS AI in CitizenDetailsPanel:", contextError);
          }
          
          try {
            const aiDisplayName = citizen.firstName || citizen.username || 'Citizen';
            const senderDisplayName = senderProfileObj?.firstName || internalCurrentCitizenUsername || 'User';

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
${content}
--- END OF USER'S MESSAGE ---

Remember: Your reply should be human-like, conversational, RELEVANT to ${senderDisplayName} using the context, and FOCUSED ON GAMEPLAY. NO FLUFF. Aim for a natural and pertinent response.
Your response:`;
            
            const determinedKinOSModel = getKinOSModelForSocialClass(citizen?.socialClass);

            const kinosBody: any = { content: kinosPromptContent, model: determinedKinOSModel };
            if (addSystemPayload) {
              kinosBody.addSystem = addSystemPayload;
            }

            const sortedChannelName = [internalCurrentCitizenUsername, citizen.username].sort().join('_');
            const kinosResponse = await fetch(
              `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${citizen.username}/channels/${sortedChannelName}/messages`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(kinosBody),
              }
            );

            if (kinosResponse.ok) {
              const kinosData = await kinosResponse.json();
              if ((kinosData.message_id || kinosData.id) && kinosData.content) {
                const aiMessage = {
                  id: kinosData.message_id || kinosData.id || `kinos-msg-${Date.now()}`,
                  role: (kinosData.role || 'assistant') as 'assistant',
                  content: kinosData.content,
                  timestamp: kinosData.timestamp || new Date().toISOString(),
                };
                setMessages(prev => [...prev, aiMessage]);

                // Persist AI response to Airtable via our backend
                try {
                  const persistResponse = await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sender: citizen.username, // AI is the sender
                      receiver: internalCurrentCitizenUsername, // User is the receiver - Use state variable
                      content: kinosData.content,
                      type: 'message_ai_augmented',
                      channel: [internalCurrentCitizenUsername, citizen.username].sort().join('_') // Add sorted channel for AI response
                    }),
                  });
                  if (!persistResponse.ok) {
                    console.error('Failed to persist KinOS AI response to Airtable (CitizenDetailsPanel):', await persistResponse.text());
                  } else {
                    console.log('KinOS AI response persisted to Airtable (CitizenDetailsPanel).');
                  }
                } catch (persistError) {
                  console.error('Error persisting KinOS AI response (CitizenDetailsPanel):', persistError);
                }
              }
            } else {
              console.error('Error from KinOS AI channel API:', kinosResponse.status, await kinosResponse.text());
               setMessages(prev => [...prev, {
                id: `kinos-error-${Date.now()}`,
                role: 'assistant',
                content: "My apologies, I couldn't get an augmented response at this moment.",
                timestamp: new Date().toISOString()
              }]);
            }
          } catch (kinosError) {
            console.error('Error calling KinOS AI channel API:', kinosError);
            setMessages(prev => [...prev, {
              id: `kinos-exception-${Date.now()}`,
              role: 'assistant',
              content: "Pardon, a slight hiccup in relaying thoughts. Try again shortly.",
              timestamp: new Date().toISOString()
            }]);
          }
        }

      } else {
        // Handle cases where data.success is false or message is not in response
        throw new Error(data.error || 'Failed to send message, no specific error returned.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add a fallback response if the API call fails
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Forgive me, but I seem to be unable to respond at the moment. Please try again later.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsTyping(false);
    }
  };
  
  // Add a ref to track which citizens we've already sent initial messages to
  const initialMessageSentRef = useRef<{[citizenId: string]: boolean}>({});

  const KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2';
  const KINOS_CHANNEL_BLUEPRINT = 'serenissima-ai';

  // Dedicated effect for fetching home/work building details
  useEffect(() => {
    let isMounted = true; // Local flag for this effect instance

    const fetchBuildingDetails = async () => {
      if (!citizen || !citizen.citizenId) {
        if (isMounted) {
          setHomeBuilding(null);
          setWorkBuilding(null);
          setIsLoadingBuildings(false);
        }
        return;
      }

      const homeId = citizen.home;
      const workId = citizen.work;

      if (!homeId && !workId) {
        if (isMounted) {
          setHomeBuilding(null);
          setWorkBuilding(null);
          setIsLoadingBuildings(false);
        }
        return;
      }
      
      if (isMounted) setIsLoadingBuildings(true);

      try {
        if (homeId) {
          const homeResponse = await fetch(`/api/buildings/${homeId}`);
          if (homeResponse.ok) {
            const homeData = await homeResponse.json();
            if (isMounted) setHomeBuilding(homeData.building || homeData);
          } else {
            if (isMounted) setHomeBuilding(null);
            console.error(`Failed to fetch home building ${homeId}: ${homeResponse.status}`);
          }
        } else {
          if (isMounted) setHomeBuilding(null);
        }

        if (workId) {
          const workResponse = await fetch(`/api/buildings/${workId}`);
          if (workResponse.ok) {
            const workData = await workResponse.json();
            if (isMounted) setWorkBuilding(workData.building || workData);
          } else {
            if (isMounted) setWorkBuilding(null);
            console.error(`Failed to fetch work building ${workId}: ${workResponse.status}`);
          }
        } else {
          if (isMounted) setWorkBuilding(null);
        }
      } catch (error) {
        console.error('Error fetching building details:', error);
        if (isMounted) {
          setHomeBuilding(null);
          setWorkBuilding(null);
        }
      } finally {
        if (isMounted) setIsLoadingBuildings(false);
      }
    };

    fetchBuildingDetails();

    return () => {
      isMounted = false;
    };
  }, [citizen?.citizenId, citizen?.home, citizen?.work]); // Specific dependencies for building details
  
  useEffect(() => {
    let isMounted = true; // Local flag for this effect instance
    // Animate in when component mounts
    setIsVisible(true);
    
    // Reset states for non-cached items (EXCLUDING building states)
    // setHomeBuilding(null); // Handled by dedicated effect
    // setWorkBuilding(null); // Handled by dedicated effect
    // setIsLoadingBuildings(false); // Handled by dedicated effect

    // Use citizen.citizenId, citizen.username (camelCase)
    // Also depend on internalCurrentCitizenUsername to refetch when logged-in user changes
    if (citizen && citizen.citizenId && citizen.username) {
        // --- Relevancies (Opportunities) ---
        console.log(`[CitizenDetailsPanel Effect] Checking relevancies for target: ${citizen.username}, current user: ${internalCurrentCitizenUsername}.`);
        if (internalCurrentCitizenUsername && citizen.username) {
            const relevancyAttemptKey = `${internalCurrentCitizenUsername}_${citizen.username}`;
            if (cachedRelevancies.hasOwnProperty(citizen.username)) { // Cache key is targetCitizen
                setRelevancies(cachedRelevancies[citizen.username]);
                setIsLoadingRelevancies(false);
                // if (!relevanciesFetchAttemptedRef.current[relevancyAttemptKey]) relevanciesFetchAttemptedRef.current[relevancyAttemptKey] = true;
            } else if (!relevanciesFetchAttemptedRef.current[relevancyAttemptKey]) {
                fetchRelevancies(citizen.username);
            } else {
                if (isLoadingRelevancies) setIsLoadingRelevancies(false);
            }
        } else {
            setRelevancies([]);
            setIsLoadingRelevancies(false);
        }

        // --- Relationship ---
        console.log(`[CitizenDetailsPanel Effect] Checking relationship for viewed: ${citizen.username}, current user: ${internalCurrentCitizenUsername}.`);
        if (internalCurrentCitizenUsername && citizen.username) {
            const relationshipCacheKey = getCanonicalCacheKey(citizen.username, internalCurrentCitizenUsername);
            if (cachedRelationships.hasOwnProperty(relationshipCacheKey)) {
                setRelationship(cachedRelationships[relationshipCacheKey]);
                setIsLoadingRelationship(false);
                // if (!relationshipFetchAttemptedRef.current[relationshipCacheKey]) relationshipFetchAttemptedRef.current[relationshipCacheKey] = true;
            } else if (!relationshipFetchAttemptedRef.current[relationshipCacheKey]) {
                fetchRelationship(citizen.username);
            } else {
                if (isLoadingRelationship) setIsLoadingRelationship(false);
            }
        } else {
            setRelationship(null);
            setIsLoadingRelationship(false);
        }

        // --- Problems (not dependent on current user) ---
        console.log(`[CitizenDetailsPanel Effect] Checking problems for citizen: ${citizen.username}. Attempted: ${!!problemsFetchAttemptedRef.current[citizen.username]}`);
        if (citizen.username) {
            if (cachedProblems.hasOwnProperty(citizen.username)) {
                setProblems(cachedProblems[citizen.username]);
                setIsLoadingProblems(false);
                // if (!problemsFetchAttemptedRef.current[citizen.username]) problemsFetchAttemptedRef.current[citizen.username] = true;
            } else if (!problemsFetchAttemptedRef.current[citizen.username]) {
                fetchProblems(citizen.username);
            } else {
                if (isLoadingProblems) setIsLoadingProblems(false);
            }
        } else {
            setProblems([]);
            setIsLoadingProblems(false);
        }
        
        // --- Message History ---
        // Fetch only if internalCurrentCitizenUsername is available
        if (internalCurrentCitizenUsername) {
            // Use citizen.citizenId (camelCase)
            if (!messagesFetchAttemptedRef.current[citizen.citizenId]) {
                fetchMessageHistory();
            }
        } else {
            setMessages([]); // Clear messages if no logged-in user
            setIsLoadingHistory(false);
        }
      
        // --- Activities (not dependent on current user) ---
        console.log(`[CitizenDetailsPanel Effect] Checking activities for citizenId: ${citizen.citizenId}. Attempted: ${!!activitiesFetchAttemptedRef.current[citizen.citizenId]}`);
        if (citizen.citizenId && !activitiesFetchAttemptedRef.current[citizen.citizenId]) {
            setActivities([]);
            fetchCitizenActivities(citizen.citizenId);
        } else if (citizen.citizenId && activitiesFetchAttemptedRef.current[citizen.citizenId]) {
            if (isLoadingActivities) setIsLoadingActivities(false);
        } else if (!citizen.citizenId) {
            setActivities([]);
            setIsLoadingActivities(false);
        }

        // --- Transport Resources (not dependent on current user) ---
        console.log(`[CitizenDetailsPanel Effect] Checking transports for citizen: ${citizen.username}. Attempted: ${!!transportFetchAttemptedRef.current[citizen.username]}`);
        if (citizen.username) {
            if (cachedTransports.hasOwnProperty(citizen.username)) {
                setTransportResources(cachedTransports[citizen.username]);
                setIsLoadingTransports(false);
                // if (!transportFetchAttemptedRef.current[citizen.username]) transportFetchAttemptedRef.current[citizen.username] = true;
            } else if (!transportFetchAttemptedRef.current[citizen.username]) {
                fetchTransportResources(citizen.username);
            } else {
                if (isLoadingTransports) setIsLoadingTransports(false);
            }
        } else {
            setTransportResources([]);
            setIsLoadingTransports(false);
        }

        // --- Citizen Thoughts (not dependent on current user) ---
        console.log(`[CitizenDetailsPanel Effect] Checking thoughts for citizenId: ${citizen.citizenId}, username: ${citizen.username}. Attempted: ${!!thoughtsFetchAttemptedRef.current[citizen.citizenId]}`);
        if (citizen.citizenId && !thoughtsFetchAttemptedRef.current[citizen.citizenId]) { // Ensure citizenId is valid before checking ref
            setCitizenThoughts([]); // Reset before fetching
            console.log(`[CitizenDetailsPanel Effect] Attempting to fetch thoughts for citizenId: ${citizen.citizenId}`);
            fetchCitizenThoughts(citizen.citizenId);
        } else if (citizen.citizenId && thoughtsFetchAttemptedRef.current[citizen.citizenId]) {
            console.log(`[CitizenDetailsPanel Effect] Already attempted fetch for thoughts for citizenId: ${citizen.citizenId}, using cached or existing state.`);
            // If you implement caching for thoughts, you might load from cache here.
            // For now, if already attempted, isLoadingThoughts should be false.
             if (isLoadingThoughts) setIsLoadingThoughts(false); // Ensure loading is off if already attempted
        } else if (!citizen.citizenId) {
            console.warn(`[CitizenDetailsPanel Effect] citizen.citizenId is missing, cannot fetch thoughts.`);
            setCitizenThoughts([]);
            setIsLoadingThoughts(false);
        }

        // --- Journal Files (not dependent on current user) ---
        console.log(`[CitizenDetailsPanel Effect] Checking journal for citizen: ${citizen.username}. Attempted: ${!!journalFetchAttemptedRef.current[citizen.username]}`);
        if (citizen.username && !journalFetchAttemptedRef.current[citizen.username]) {
            setJournalFiles([]); // Reset before fetching
            console.log(`[CitizenDetailsPanel Effect] Attempting to fetch journal for citizen: ${citizen.username}`);
            fetchJournalFiles(citizen.username);
        } else if (citizen.username && journalFetchAttemptedRef.current[citizen.username]) {
            console.log(`[CitizenDetailsPanel Effect] Already attempted fetch for journal for citizen: ${citizen.username}, using cached or existing state.`);
            if (isLoadingJournal) setIsLoadingJournal(false);
        } else if (!citizen.username) {
            console.warn(`[CitizenDetailsPanel Effect] citizen.username is missing, cannot fetch journal.`);
            setJournalFiles([]);
            setIsLoadingJournal(false);
        }
      
    } else {
        // No citizen, or citizenid/username missing. Clear all relevant states.
        setRelevancies([]);
        setIsLoadingRelevancies(false);
        relationshipFetchAttemptedRef.current = {}; // Clear attempted fetches on citizen change
        setRelationship(null);
        setIsLoadingRelationship(false);
        problemsFetchAttemptedRef.current = {};
        setProblems([]);
        setIsLoadingProblems(false);
        activitiesFetchAttemptedRef.current = {};
        setActivities([]);
        setIsLoadingActivities(false); 
        transportFetchAttemptedRef.current = {};
        setTransportResources([]);
        setIsLoadingTransports(false);
        messagesFetchAttemptedRef.current = {};
        setMessages([]);
        setIsLoadingHistory(false); 
        thoughtsFetchAttemptedRef.current = {};
        setCitizenThoughts([]); 
        setIsLoadingThoughts(false); 
        journalFetchAttemptedRef.current = {};
        setJournalFiles([]); 
        setIsLoadingJournal(false); 
    }
    
    // Add escape key handler
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        console.log('ESC key pressed, calling onClose');
        onClose(); // Call onClose directly without animation
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
        
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [citizen?.citizenId, citizen?.username, onClose, internalCurrentCitizenUsername]); // Removed cached states from dependencies

  // Effect to set a random "no relationship" message
  useEffect(() => {
    // Use citizen.firstName (camelCase)
    if (!isLoadingRelationship && !relationship && citizen && citizen.firstName) { 
      const messages = [
        `Your connection with ${citizen.firstName} is yet to be recorded in the city's annals.`, 
        `The nature of your acquaintance with ${citizen.firstName} remains unchronicled.`, 
        `No formal ties with ${citizen.firstName} have been noted by the scribes.`, 
        `Details of your relationship with ${citizen.firstName} are not yet known.`, 
        `The ledger shows no established connection with ${citizen.firstName} at this time.` 
      ];
      const randomIndex = Math.floor(Math.random() * messages.length);
      setNoRelationshipMessage(messages[randomIndex]);
    }
  }, [isLoadingRelationship, relationship, citizen]);
  
  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      
      // Convert modern date to Renaissance era (1500s)
      // Simply replace the year with 1525 to place it in Renaissance Venice
      const renaissanceDate = new Date(date);
      renaissanceDate.setFullYear(1525);
      
      // Format as "Month Day, Year" without the time
      return renaissanceDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (e) {
      return 'Unknown date';
    }
  };
  
  if (!citizen) return null;

  const coatOfArmsSrc = useMemo(() => {
    // Always construct the path based on username.
    // The onError handler in the <img> tag will manage the default image.
    if (citizen?.username) {
      return `/public_assets/images/coat-of-arms/${citizen.username}.png`;
    }
    // If no username, no custom coat of arms can be determined.
    // The <img> tag's onError will use the default.
    // We can return undefined, or the default path directly if we want to skip one onError cycle.
    // For consistency with image handling, returning undefined and letting onError manage it is fine.
    return undefined; 
  }, [citizen?.username]);
  
  return (
    <> {/* Opening React Fragment */}
    {isJournalPanelVisible && selectedJournalFile && (
      <JournalViewerPanel 
        file={selectedJournalFile} 
        onClose={handleCloseJournalPanel} 
      />
    )}
    <div
      className={
        `fixed top-20 left-20 right-4 bottom-10 bg-amber-50 border-2 border-amber-700 rounded-lg p-6 shadow-lg z-50 transition-all duration-300 pointer-events-auto flex flex-col ` +
        `${isVisible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'}`
      }
      style={{ pointerEvents: 'auto', cursor: 'default' }}
      onWheel={(e) => {
        e.stopPropagation(); // Prevent event from bubbling up
        e.preventDefault();  // Prevent default scroll action
      }}
    >
      
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <div className="flex items-center">
          {citizen.socialClass && (
            <img
              src={`/images/${citizen.socialClass.toLowerCase()}.png`}
              alt={citizen.socialClass}
              className="w-12 h-12 mr-3 rounded-sm object-contain" // Taille augmentée de w-8 h-8 à w-12 h-12
              onError={(e) => {
                // Fallback si l'image spécifique à la classe sociale n'est pas trouvée
                (e.target as HTMLImageElement).style.display = 'none'; 
                // Optionnel: log l'erreur ou afficher une image par défaut
                console.warn(`Image not found for social class: ${citizen.socialClass}`);
              }}
            />
          )}
          <h2 className="text-2xl font-serif text-amber-800">
            {/* Use citizen.firstName, citizen.lastName, citizen.username (camelCase) */}
            {citizen.firstName} {citizen.lastName} 
            {citizen.username && (
              <span className="text-sm text-amber-600 ml-2">({citizen.username})</span>
            )}
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-colors p-3 rounded-full cursor-pointer"
          style={{ cursor: 'pointer' }}
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Three-column layout */}
      <div className={`flex flex-row gap-4 ${isCorrespondanceFullScreen ? 'flex-grow min-h-0' : 'flex-grow min-h-0'}`}>
        {/* First column - Tabs for Info (Relationship/Citizen) and Ledger */}
        {!isCorrespondanceFullScreen && (
          <div className="w-1/3 flex flex-col">
            {/* Tab Navigation for Main Left Column */}
            {/* Sub-tab Navigation for Information Column */}
            <div className="mb-3 border-b border-amber-300 flex-shrink-0">
              <nav className="flex space-x-1" aria-label="Information SubTabs">
                <button
                  onClick={() => setActiveInfoColumnTab('relations')}
                  className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                    ${activeInfoColumnTab === 'relations' 
                      ? 'bg-amber-600 text-white' 
                      : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                    }`}
                >
                  Relations
                </button>
                <button
                  onClick={() => setActiveInfoColumnTab('citizen')}
                  className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                    ${activeInfoColumnTab === 'citizen' 
                      ? 'bg-amber-600 text-white' 
                      : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                    }`}
                >
                  Citizen
                </button>
                <button
                  onClick={() => setActiveInfoColumnTab('ledger')}
                  className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                    ${activeInfoColumnTab === 'ledger' 
                      ? 'bg-amber-600 text-white' 
                      : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                    }`}
                >
                  Ledger
                </button>
              </nav>
            </div>

            {/* Content area for the first column */}
            <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 min-h-0">
              {(activeInfoColumnTab === 'relations' || activeInfoColumnTab === 'citizen') && (
                <CitizenInfoColumn
                  citizen={citizen}
                  isLoadingRelationship={isLoadingRelationship}
                  relationship={relationship}
                  noRelationshipMessage={noRelationshipMessage}
                  relevancies={relevancies}
                  isLoadingRelevancies={isLoadingRelevancies}
                  problems={problems}
                  isLoadingProblems={isLoadingProblems}
                  activities={activities}
                  isLoadingActivities={isLoadingActivities}
                  transportResources={transportResources}
                  isLoadingTransports={isLoadingTransports}
                  activeTab={activeInfoColumnTab}
                  // Pass thoughts data
                  citizenThoughts={citizenThoughts}
                  isLoadingThoughts={isLoadingThoughts}
                  // Pass journal data
                  journalFiles={journalFiles}
                  isLoadingJournal={isLoadingJournal}
                  onJournalFileClick={handleJournalFileClick}
                  currentUsername={internalCurrentCitizenUsername} // Pass current username
                />
              )}
              {activeInfoColumnTab === 'ledger' && citizen && (
                <CitizenLedger
                  citizenId={citizen.username || citizen.citizenId}
                  citizenName={`${citizen.firstName} ${citizen.lastName}`}
                />
              )}
            </div>
          </div>
        )}
        
        {/* Second column - Correspondence */}
        <div className={`${isCorrespondanceFullScreen ? 'w-full' : 'w-1/3'} flex flex-col`}>
          <CitizenCorrespondanceColumn
            citizen={citizen}
            messages={messages}
            isLoadingHistory={isLoadingHistory}
            messagesFetchFailed={messagesFetchFailed}
            isTyping={isTyping}
            inputValue={inputValue}
            setInputValue={setInputValue}
            sendMessage={sendMessage}
            isCorrespondanceFullScreen={isCorrespondanceFullScreen}
            setIsCorrespondanceFullScreen={setIsCorrespondanceFullScreen}
            messagesEndRef={messagesEndRef}
          />
        </div>
        
        {/* Third column - Citizen Profile Only */}
        {!isCorrespondanceFullScreen && (
          <div className="w-1/3 flex flex-col">
            {/* No tabs needed here anymore, directly render CitizenProfileColumn */}
            <div className="flex-grow overflow-y-auto custom-scrollbar pr-1 h-full"> {/* Added h-full */}
              <CitizenProfileColumn
                citizen={citizen}
                homeBuilding={homeBuilding}
                workBuilding={workBuilding}
                isLoadingBuildings={isLoadingBuildings}
                coatOfArmsSrc={coatOfArmsSrc}
              />
            </div>
          </div>
        )}
      </div>
    </div> {/* End of the main panel div */}
    
    <div
      className="mt-4 text-xs text-amber-500 italic text-center flex-shrink-0"
    >
      {/* Use citizen.createdAt (camelCase) */}
      Citizen of Venice since {citizen.createdAt ? formatDate(citizen.createdAt) : 'the founding of the Republic'} 
    </div>
  </> // Closing the React Fragment
  );
};

export default CitizenDetailsPanel;
