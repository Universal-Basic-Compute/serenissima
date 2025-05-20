import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Citizen } from '@/components/PolygonViewer/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FaSpinner, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';

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
  const [isTyping, setIsTyping] = useState(false);
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
  // Add state for relationship
  const [relationship, setRelationship] = useState<any>(null);
  const [isLoadingRelationship, setIsLoadingRelationship] = useState<boolean>(false);
  const [cachedRelationships, setCachedRelationships] = useState<Record<string, any>>({});
  const [noRelationshipMessage, setNoRelationshipMessage] = useState<string>('');
  // Add state for problems
  const [problems, setProblems] = useState<any[]>([]);
  const [isLoadingProblems, setIsLoadingProblems] = useState<boolean>(false);
  const [cachedProblems, setCachedProblems] = useState<Record<string, any[]>>({});
  
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
      const response = await fetch(`/api/activities?citizenId=${citizenId}&limit=10`);
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
  const fetchRelevancies = async (targetCitizen: string) => {
    if (!targetCitizen) return;
    
    setIsLoadingRelevancies(true);
    
    try {
      // Get current username from localStorage
      let currentUsername = null;
      try {
        const profileStr = localStorage.getItem('citizenProfile');
        if (profileStr) {
          const profile = JSON.parse(profileStr);
          if (profile && profile.username) {
            currentUsername = profile.username;
          }
        }
      } catch (error) {
        console.error('Error getting current username:', error);
      }
      
      if (!currentUsername) {
        console.warn('No current username found, cannot fetch relevancies');
        setIsLoadingRelevancies(false);
        return;
      }
      
      // Fetch relevancies where targetCitizen = opened citizen's username
      // and relevantToCitizen = current user's username or "all"
      const response = await fetch(`/api/relevancies?targetCitizen=${targetCitizen}&relevantToCitizen=${currentUsername}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.relevancies) {
          setRelevancies(data.relevancies);
          setCachedRelevancies(prev => ({ ...prev, [targetCitizen]: data.relevancies }));
        } else {
          setRelevancies([]);
          setCachedRelevancies(prev => ({ ...prev, [targetCitizen]: [] })); // Cache empty result
        }
      } else {
        console.error('Failed to fetch relevancies:', response.status, response.statusText);
        setRelevancies([]);
        setCachedRelevancies(prev => ({ ...prev, [targetCitizen]: [] })); // Cache empty on error
      }
    } catch (error) {
      console.error('Error fetching relevancies:', error);
      setRelevancies([]);
      setCachedRelevancies(prev => ({ ...prev, [targetCitizen]: [] })); // Cache empty on error
    } finally {
      setIsLoadingRelevancies(false);
    }
  };

  // Function to fetch problems for a citizen
  const fetchProblems = async (citizenUsername: string) => {
    if (!citizenUsername) return;

    setIsLoadingProblems(true);
    try {
      const response = await fetch(`/api/problems?citizen=${citizenUsername}&status=active`);
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
        console.error('Failed to fetch problems:', response.status, response.statusText);
        setProblems([]);
        setCachedProblems(prev => ({ ...prev, [citizenUsername]: [] }));
      }
    } catch (error) {
      console.error('Error fetching problems:', error);
      setProblems([]);
      setCachedProblems(prev => ({ ...prev, [citizenUsername]: [] }));
    } finally {
      setIsLoadingProblems(false);
    }
  };

  // Function to fetch relationship data
  const fetchRelationship = async (viewedCitizenUsername: string) => {
    if (!viewedCitizenUsername) {
      setIsLoadingRelationship(false); // Ensure loading is stopped if no username
      return;
    }

    setIsLoadingRelationship(true);
    let currentUsername = null;
    try {
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile && profile.username) {
          currentUsername = profile.username;
        }
      }
    } catch (error) {
      console.error('Error getting current username for relationship:', error);
    }

    if (!currentUsername) {
      console.warn('No current username found, cannot fetch relationship');
      setRelationship(null); 
      return;
    }

    // Avoid fetching relationship with oneself, or handle as a special case
    if (currentUsername === viewedCitizenUsername) {
      const selfRelationship = { StrengthScore: 100, type: "Self" };
      setRelationship(selfRelationship);
      setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: selfRelationship }));
      setIsLoadingRelationship(false);
      return;
    }

    // setIsLoadingRelationship(true); // Already set at the beginning of the function
    try {
      // API should handle finding relationship regardless of (citizen1, citizen2) order
      const response = await fetch(`/api/relationships?citizen1=${currentUsername}&citizen2=${viewedCitizenUsername}`);
      if (response.ok) {
        const data = await response.json();
        // Check if data.relationship exists, even if it's null (which means no relationship found)
        if (data.success && data.hasOwnProperty('relationship')) {
          setRelationship(data.relationship); // This could be an object or null
          setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: data.relationship }));
        } else if (data.success && data.relationships && data.relationships.length > 0) { // Legacy check if API returns array
          setRelationship(data.relationships[0]);
          setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: data.relationships[0] }));
        }
         else {
          setRelationship(null); // No specific relationship found or unexpected format
          setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: null }));
        }
      } else {
        console.warn(`Failed to fetch relationship: ${response.status} ${response.statusText}`);
        setRelationship(null);
        setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: null })); // Cache null on error
      }
    } catch (error) {
      console.error('Error fetching relationship:', error);
      setRelationship(null);
      setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: null })); // Cache null on error
    } finally {
      setIsLoadingRelationship(false);
    }
  };

  // Function to fetch message history
  const fetchMessageHistory = async () => {
    if (!citizen || !citizen.citizenid) return;
    
    // Check if we've already attempted to fetch messages for this citizen
    if (messagesFetchAttemptedRef.current[citizen.citizenid]) {
      console.log(`Already attempted to fetch messages for citizen ${citizen.citizenid}, skipping`);
      return;
    }
    
    // Mark that we've attempted to fetch messages for this citizen
    messagesFetchAttemptedRef.current[citizen.citizenid] = true;
    
    setIsLoadingHistory(true);
    try {
      // Always use the regular messages API
      console.log(`Fetching messages for citizen ${citizen.username || citizen.citizenid} using /api/messages`);

      // Get current citizen from localStorage
      let currentUsername = 'visitor';
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.username) {
              currentUsername = profile.username;
            }
          } catch (error) {
            console.error('Error parsing citizen profile:', error);
          }
        }

        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentCitizen: currentUsername,
            otherCitizen: citizen.username || citizen.citizenid // Use username if available, otherwise citizenid
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch message history: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.messages) {
          const formattedMessages = data.messages.map((msg: any) => ({
            id: msg.messageId,
            role: msg.sender === currentUsername ? 'user' : 'assistant', // 'user' for sender, 'assistant' for receiver
            content: msg.content,
            timestamp: msg.createdAt
          }));
          setMessages(formattedMessages);
        } else {
          // No messages from API, or API indicated no messages (e.g. success:true, messages:[])
          // or API indicated failure to get messages (e.g. success:false)
          setMessages([]); // Set to empty array, removing the automatic "Buongiorno" message
        }
    } catch (error) {
      console.error('Error fetching message history:', error);
      setMessagesFetchFailed(true); // Indicate that fetching failed
      setMessages([]); // Set to empty array on error too
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Function to send messages
  const sendMessage = async (content: string) => {
    if (!content.trim() || !citizen || !citizen.citizenid) return;
    
    // Get current citizen from localStorage
    let currentUsername = 'visitor';
    const savedProfile = localStorage.getItem('citizenProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.username) {
          currentUsername = profile.username;
        }
      } catch (error) {
        console.error('Error parsing citizen profile:', error);
      }
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
      console.log(`Sending message to ${citizen.username || citizen.citizenid} using /api/messages/send`);

      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: currentUsername,
          receiver: citizen.username || citizen.citizenid, // Use username if available
          content: content,
          type: 'message' // Ensure type is 'message'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.message) {
        // The message is sent. The receiver will see it when they fetch messages.
        // For now, we can add a confirmation or simply let the optimistic update stand.
        // To avoid duplicate messages if the receiver is the current user,
        // we might not add an "assistant" response here.
        // The optimistic update of the user's own message is already done.
        // If you want a confirmation message from the system:
        /*
        setMessages(prev => [...prev, {
          id: `conf-${data.message.messageId}`,
          role: 'assistant', // Or a system role
          content: `Message sent to ${citizen.firstname}.`,
          timestamp: new Date().toISOString()
        }]);
        */
        // Let's remove the automatic "I've received your message" as it's not from the actual recipient.
        // The message will appear for the recipient when they open their chat with the sender.
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
  
  useEffect(() => {
    // Animate in when component mounts
    setIsVisible(true);
    
    // Reset states when citizen changes for non-cached items
    setHomeBuilding(null);
    setWorkBuilding(null);
    setIsLoadingBuildings(false);
    // Activities and Messages are handled by their own fetch-once refs below.

    if (citizen && citizen.citizenid && citizen.username) {
        // --- Relevancies (Opportunities) ---
        if (cachedRelevancies.hasOwnProperty(citizen.username)) {
            setRelevancies(cachedRelevancies[citizen.username]);
            setIsLoadingRelevancies(false);
        } else {
            setRelevancies([]); // Clear data from previous citizen
            fetchRelevancies(citizen.username); // This will manage its own loading state
        }

        // --- Relationship ---
        if (cachedRelationships.hasOwnProperty(citizen.username)) {
            setRelationship(cachedRelationships[citizen.username]);
            setIsLoadingRelationship(false);
        } else {
            setRelationship(null); // Clear data from previous citizen
            fetchRelationship(citizen.username); // This will manage its own loading state and self-view
        }

        // --- Problems ---
        if (cachedProblems.hasOwnProperty(citizen.username)) {
            setProblems(cachedProblems[citizen.username]);
            setIsLoadingProblems(false);
        } else {
            setProblems([]); // Clear data from previous citizen
            fetchProblems(citizen.username); // This will manage its own loading state
        }
        
        // --- Message History (existing logic with fetch-once ref) ---
        if (!messagesFetchAttemptedRef.current[citizen.citizenid]) {
            fetchMessageHistory();
        } else {
            // If messages were already attempted, ensure loading is false if not actively fetching.
            // fetchMessageHistory handles its own loading state. If we are here, it means
            // messages were either fetched or an attempt was made.
            // If messages are empty and not loading, the UI shows "No correspondence yet".
        }
      
        // --- Activities (existing logic with fetch-once ref) ---
        if (!activitiesFetchAttemptedRef.current[citizen.citizenid]) {
            setActivities([]); // Clear previous activities before fetching new ones
            fetchCitizenActivities(citizen.citizenid);
        } else {
            // Similar to messages, if activities were attempted, their state is either populated or empty.
            // fetchCitizenActivities handles its own loading state.
        }
      
    } else {
        // No citizen, or citizenid/username missing. Clear all relevant states.
        setRelevancies([]);
        setIsLoadingRelevancies(false);
        setRelationship(null);
        setIsLoadingRelationship(false);
        setProblems([]);
        setIsLoadingProblems(false);
        setActivities([]);
        setIsLoadingActivities(false); // Ensure loading state is reset
        setMessages([]);
        setIsLoadingHistory(false); // Ensure loading state is reset
    }
    
    // Add escape key handler
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        console.log('ESC key pressed, calling onClose');
        onClose(); // Call onClose directly without animation
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    
    // Fetch building details if citizen has home or work
    const fetchBuildingDetails = async () => {
      if (!citizen) return;
      
      // Check if citizen has home or work buildings
      const homeId = citizen.home;
      const workId = citizen.work;
      
      if (!homeId && !workId) return;
      
      setIsLoadingBuildings(true);
      
      try {
        // Fetch home building if exists
        if (homeId) {
          const homeResponse = await fetch(`/api/buildings/${homeId}`);
          if (homeResponse.ok) {
            const homeData = await homeResponse.json();
            setHomeBuilding(homeData.building || homeData);
          }
        }
        
        // Fetch work building if exists
        if (workId) {
          const workResponse = await fetch(`/api/buildings/${workId}`);
          if (workResponse.ok) {
            const workData = await workResponse.json();
            setWorkBuilding(workData.building || workData);
          }
        }
      } catch (error) {
        console.error('Error fetching building details:', error);
      } finally {
        setIsLoadingBuildings(false);
      }
    };
    
    // Use a flag to prevent multiple fetches
    let isMounted = true;
    
    // Only fetch building data if we have a valid citizen
    if (citizen && citizen.citizenid && isMounted) {
      fetchBuildingDetails();
      // We're now handling activities fetch above with the ref check
    }
    
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [citizen, onClose]); // Only depend on citizen and onClose

  // Effect to set a random "no relationship" message
  useEffect(() => {
    if (!isLoadingRelationship && !relationship && citizen && citizen.firstname) {
      const messages = [
        `Your connection with ${citizen.firstname} is yet to be recorded in the city's annals.`,
        `The nature of your acquaintance with ${citizen.firstname} remains unchronicled.`,
        `No formal ties with ${citizen.firstname} have been noted by the scribes.`,
        `Details of your relationship with ${citizen.firstname} are not yet known.`,
        `The ledger shows no established connection with ${citizen.firstname} at this time.`
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
  
  
  const formatDucats = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return 'Unknown';
    
    // Handle both string and number formats
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    // Check if it's a valid number
    if (isNaN(numericAmount)) return 'Unknown';
    
    // Format without decimal places and add spaces between thousands
    const formattedAmount = Math.floor(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return formattedAmount + ' ⚜️'; // Using lys emoji instead of ₫
  };
  
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
  
  // Add a helper function to format building type
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
  
  // Add a helper function to format activity type
  const formatActivityType = (type: string): string => {
    if (!type) return 'Unknown';
    
    // Replace underscores and hyphens with spaces
    let formatted = type.replace(/[_-]/g, ' ');
    
    // Capitalize each word
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    return formatted;
  };
  
  // Add a helper function to get color based on time horizon
  const getTimeHorizonColor = (timeHorizon: string): string => {
    switch (timeHorizon.toLowerCase()) {
      case 'short-term':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'medium-term':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'long-term':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Helper function to replace placeholders in relevancy text
  const formatRelevancyText = (text: string, currentCitizen: any): string => {
    if (!text || !currentCitizen) return text;
    let newText = text;
    newText = newText.replace(/%TARGETCITIZEN%/g, `${currentCitizen.firstname || ''} ${currentCitizen.lastname || ''}`.trim());
    newText = newText.replace(/%FIRSTNAME%/g, currentCitizen.firstname || '');
    newText = newText.replace(/%LASTNAME%/g, currentCitizen.lastname || '');
    newText = newText.replace(/%USERNAME%/g, currentCitizen.username || '');
    newText = newText.replace(/%SOCIALCLASS%/g, currentCitizen.socialclass || '');
    // Add more replacements here if needed, e.g., for %CURRENTUSER_FIRSTNAME%, etc.
    return newText;
  };
  
  // Add a helper function to format date in a readable way
  const formatActivityDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      
      // Subtract 500 years from the year for Renaissance setting
      date.setFullYear(date.getFullYear() - 500);
      
      // Format as "Month Day, Year at HH:MM"
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };
  
  // Add a function to filter system messages
  const isSystemMessage = (message: any): boolean => {
    return message.content && typeof message.content === 'string' && message.content.includes('[SYSTEM]');
  };
  
  // Add a helper function to get activity icon based on type
  const getActivityIcon = (type: string): JSX.Element => {
    const lowerType = type?.toLowerCase() || '';
    
    if (lowerType.includes('transport') || lowerType.includes('move')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      );
    } else if (lowerType.includes('trade') || lowerType.includes('buy') || lowerType.includes('sell')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    } else if (lowerType.includes('work') || lowerType.includes('labor')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    } else if (lowerType.includes('craft') || lowerType.includes('create') || lowerType.includes('produce')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    }
    
    // Default icon
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };
  
  if (!citizen) return null;
  
  // Determine social class color
  const getSocialClassColor = (socialClass: string): string => {
    switch (socialClass?.toLowerCase()) {
      case 'nobili':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'; // Gold
      case 'cittadini':
        return 'bg-blue-100 text-blue-800 border-blue-300'; // Blue
      case 'popolani':
        return 'bg-amber-100 text-amber-800 border-amber-300'; // Brown
      case 'facchini':
      case 'laborer':
        return 'bg-gray-100 text-gray-800 border-gray-300'; // Gray
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300'; // Default
    }
  };
  
  const socialClassStyle = getSocialClassColor(citizen.socialclass);
  
  return (
    <div 
      className={`fixed top-20 right-4 bg-amber-50 border-2 border-amber-700 rounded-lg p-6 shadow-lg max-w-5xl z-50 transition-all duration-300 pointer-events-auto ${
        isVisible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'
      }`}
      style={{ pointerEvents: 'auto', cursor: 'default' }}
    >
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-serif text-amber-800">
          {citizen.firstname} {citizen.lastname} 
          {citizen.username && (
            <span className="text-sm text-amber-600 ml-2">({citizen.username})</span>
          )}
        </h2>
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
      <div className="flex flex-row gap-4">
        {/* First column - Relationship & Opportunities */}
        <div className="w-1/3">
          {/* Relationship Section */}
          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Relationship</h3>
          {isLoadingRelationship ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : relationship && typeof relationship.StrengthScore !== 'undefined' ? (
            <div className="bg-amber-100 rounded-lg p-3 text-sm mb-4">
              <div className="flex items-center justify-between mb-1">
                <div className="font-medium text-amber-800">
                  {relationship.type === "Self" ? "Self-Regard" : "Bond Strength"}
                </div>
                <div className={`px-3 py-1 rounded-full text-lg font-bold text-center ${
                  relationship.StrengthScore > 75 ? 'bg-green-200 text-green-800' :
                  relationship.StrengthScore > 25 ? 'bg-amber-200 text-amber-800' :
                  'bg-red-200 text-red-800'
                }`}>
                  {relationship.StrengthScore}{relationship.type === "Self" ? "" : "/100"}
                </div>
              </div>
              {relationship.type !== "Self" && (
                <>
                  {relationship.Title && (
                    <p className="text-sm text-amber-800 mt-2 font-semibold">{relationship.Title}</p>
                  )}
                  {relationship.Description && (
                    <p className="text-xs text-amber-700 mt-1">{relationship.Description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 mt-2">
                    {typeof relationship.TrustScore !== 'undefined' && (
                      <div>
                        <p className="text-xs text-amber-600">Trust Score</p>
                        <p className="text-sm font-medium text-amber-800">{relationship.TrustScore}/100</p>
                      </div>
                    )}
                    {relationship.Tier && (
                      <div>
                        <p className="text-xs text-amber-600">Tier</p>
                        <p className="text-sm font-medium text-amber-800">{relationship.Tier}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-amber-700 italic text-sm mb-4">
              {noRelationshipMessage}
            </p>
          )}

          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Opportunities</h3>
          
          {isLoadingRelevancies ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : relevancies.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
              {relevancies.map((relevancy, index) => (
                <div key={relevancy.relevancyId || index} className="bg-amber-100 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-amber-800">
                      {formatRelevancyText(relevancy.title, citizen)}
                    </div>
                    {/* Score displayed as a nice badge */}
                    <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 text-amber-800 text-center">
                      <span className="font-bold text-lg">{relevancy.score}</span>
                      <span className="text-gray-500 text-[10px] ml-1">score</span>
                    </div>
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({node, ...props}) => <p {...props} className="my-1" />
                      }}
                    >
                      {formatRelevancyText(relevancy.description, citizen)}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-amber-700 italic">No notable opportunities with this citizen at present. Future ventures may arise as your paths cross in Venetian society.</p>
          )}

          {/* Problems Section */}
          <h3 className="text-lg font-serif text-amber-800 mt-4 mb-2 border-b border-amber-200 pb-1">Problems</h3>
          {isLoadingProblems ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : problems.length > 0 ? (
            <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
              {problems.map((problem, index) => (
                <div key={problem.problemId || index} className={`rounded-lg p-3 text-sm border ${
                  problem.severity === 'high' ? 'bg-red-50 border-red-200' :
                  problem.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <h4 className={`font-semibold text-md ${
                      problem.severity === 'high' ? 'text-red-800' :
                      problem.severity === 'medium' ? 'text-yellow-800' :
                      'text-green-800'
                    }`}>
                      {problem.title || "Untitled Problem"}
                    </h4>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 inline-block rounded-full text-xs font-medium ${
                        problem.severity === 'high' ? 'bg-red-200 text-red-900' :
                        problem.severity === 'medium' ? 'bg-yellow-200 text-yellow-900' :
                        'bg-green-200 text-green-900'
                      }`}>
                        {problem.severity && typeof problem.severity === 'string' ? problem.severity.charAt(0).toUpperCase() + problem.severity.slice(1) : 'Unknown'}
                      </span>
                    </div>
                  </div>
                  <div className={`text-sm mt-1 ${
                    problem.severity === 'high' ? 'text-red-700' :
                    problem.severity === 'medium' ? 'text-yellow-700' :
                    'text-green-700'
                  }`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {problem.description || "No description provided."}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-amber-700 italic">No active problems reported for this citizen. A sign of good fortune, or perhaps, discretion.</p>
          )}
        </div>
        
        {/* Second column - Correspondance */}
        <div className="w-1/3">
          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Correspondance</h3>
          
          {/* Messages area */}
          <div 
            className="h-[500px] overflow-y-auto p-3 bg-amber-50 bg-opacity-80 rounded-lg mb-3 custom-scrollbar"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat'
            }}
          >
            {isLoadingHistory ? (
              <div className="flex justify-center items-center h-full">
                <div className="bg-amber-700 text-white p-3 rounded-lg rounded-bl-none inline-block">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                {messagesFetchFailed ? (
                  <div className="text-gray-500 italic">
                    Unable to load conversation history with {citizen.firstname}.
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-amber-700 italic">
                    No correspondence yet. Send a message to begin.
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Filter out system messages before mapping */}
                {messages.filter(message => !isSystemMessage(message)).map((message) => (
                  <div 
                    key={message.id || `msg-${Date.now()}-${Math.random()}`} 
                    className={`mb-3 ${
                      message.role === 'user' // Changed from 'citizen' to 'user' for sent messages
                        ? 'text-right' 
                        : 'text-left'
                    }`}
                  >
                    <div 
                      className={`inline-block p-3 rounded-lg max-w-[80%] ${
                        message.role === 'user' // Changed from 'citizen' to 'user'
                          ? 'bg-amber-100 text-amber-900 rounded-br-none'
                          : 'bg-amber-700 text-white rounded-bl-none'
                      }`}
                    >
                      <div className="markdown-content relative z-10">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({node, ...props}) => <a {...props} className="text-amber-300 underline hover:text-amber-100" target="_blank" rel="noopener noreferrer" />,
                            code: ({node, ...props}) => <code {...props} className="bg-amber-800 px-1 py-0.5 rounded text-sm font-mono" />,
                            pre: ({node, ...props}) => <pre {...props} className="bg-amber-800 p-2 rounded my-2 overflow-x-auto text-sm font-mono" />,
                            ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 my-1" />,
                            ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 my-1" />,
                            li: ({node, ...props}) => <li {...props} className="my-0.5" />,
                            blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-amber-500 pl-3 italic my-2" />,
                            h1: ({node, ...props}) => <h1 {...props} className="text-lg font-bold my-2" />,
                            h2: ({node, ...props}) => <h2 {...props} className="text-md font-bold my-2" />,
                            h3: ({node, ...props}) => <h3 {...props} className="text-sm font-bold my-1" />,
                            p: ({node, ...props}) => <p {...props} className="my-1" />
                          }}
                        >
                          {message.content || "No content available"}
                        </ReactMarkdown>
                      </div>
                      
                      {/* Removed voice button as Kinos TTS is no longer used */}
                    </div>
                  </div>
                ))}
                
                {/* Typing indicator */}
                {isTyping && (
                  <div className="text-left mb-3" key="typing-indicator">
                    <div className="inline-block p-3 rounded-lg max-w-[80%] bg-amber-700 text-white rounded-bl-none">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
          
          
          {/* Input area */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(inputValue);
            }} 
            className="flex"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Message ${citizen.firstname}...`}
              className="flex-1 p-2 border border-amber-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              disabled={isTyping}
            />
            <button 
              type="submit"
              className={`px-4 rounded-r-lg transition-colors ${
                isTyping || !inputValue.trim()
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-amber-700 text-white hover:bg-amber-600'
              }`}
              disabled={isTyping || !inputValue.trim()}
            >
              {isTyping ? <FaSpinner className="animate-spin" /> : 'Send'}
            </button>
          </form>
        </div>
        
        {/* Third column - Citizen details */}
        <div className="w-1/3">
          <div className="w-full mb-6">
            {/* Full-width image container with relative positioning for the coat of arms overlay, now square */}
            <div className="w-full aspect-square relative mb-4 overflow-hidden rounded-lg border-2 border-amber-600 shadow-lg">
              {/* Main citizen image */}
              {citizen.imageurl || citizen.profileimage || citizen.ImageUrl ? (
                <img 
                  src={citizen.imageurl || citizen.profileimage || citizen.ImageUrl} 
                  alt={`${citizen.firstname} ${citizen.lastname}`} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.error(`Failed to load citizen image: ${(e.target as HTMLImageElement).src}`);
                    
                    // Try fallback to username-based path
                    if (citizen.username) {
                      const fallbackSrc = `/images/citizens/${citizen.username}.jpg`;
                      console.log(`Trying fallback image: ${fallbackSrc}`);
                      (e.target as HTMLImageElement).src = fallbackSrc;
                      
                      // Add a second error handler for the fallback
                      (e.target as HTMLImageElement).onerror = () => {
                        console.error(`Fallback image also failed: ${fallbackSrc}`);
                        // Replace with placeholder
                        const parent = (e.target as HTMLImageElement).parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="w-full h-full bg-amber-200 flex items-center justify-center text-amber-800">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                          `;
                        }
                      };
                    } else {
                      // Replace with placeholder immediately if no username
                      const parent = (e.target as HTMLImageElement).parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div class="w-full h-full bg-amber-200 flex items-center justify-center text-amber-800">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        `;
                      }
                    }
                  }}
                />
              ) : (
                // Try username-based path directly if no imageurl
                citizen.username ? (
                  <img 
                    src={`/images/citizens/${citizen.username}.jpg`}
                    alt={`${citizen.firstname} ${citizen.lastname}`} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error(`Failed to load citizen image: ${(e.target as HTMLImageElement).src}`);
                      // Replace with placeholder
                      const parent = (e.target as HTMLImageElement).parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div class="w-full h-full bg-amber-200 flex items-center justify-center text-amber-800">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                        `;
                      }
                    }}
                  />
                ) : (
                  // Placeholder if no image sources available
                  <div className="w-full h-full bg-amber-200 flex items-center justify-center text-amber-800">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )
              )}
              
              {/* Coat of arms overlay in the bottom right corner */}
              {citizen.coatOfArmsImageUrl && (
                <div className="absolute bottom-3 right-3 w-16 h-16 rounded-full overflow-hidden border-2 border-amber-600 shadow-lg bg-amber-100">
                  <img 
                    src={citizen.coatOfArmsImageUrl}
                    alt="Coat of Arms"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to default coat of arms
                      (e.target as HTMLImageElement).src = '/coat-of-arms/default.png';
                    }}
                  />
                </div>
              )}
              
              {/* Name and social class overlay at the bottom */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <h3 className="text-white text-xl font-serif font-bold">
                  {citizen.firstname} {citizen.lastname}
                </h3>
                <div className="flex justify-between items-center">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium inline-block ${socialClassStyle}`}>
                    {citizen.socialclass}
                  </div>
                  <div className="text-white text-lg font-bold">
                    {formatDucats(citizen.Ducats || citizen.wealth || citizen.ducats)}
                  </div>
                </div>
              </div>
            </div>
        </div>
        
        {/* Add max-height and scrolling to the details section */}
        <div className="max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
          {/* Home and Work section */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Home</h3>
              <div className="bg-amber-100 p-3 rounded-lg">
                {isLoadingBuildings ? (
                  <p className="text-amber-700 italic">Loading...</p>
                ) : homeBuilding ? (
                  <div>
                    <p className="text-amber-800 font-medium">{homeBuilding.name || formatBuildingType(homeBuilding.type)}</p>
                    <p className="text-amber-700 text-sm">{formatBuildingType(homeBuilding.type)}</p>
                  </div>
                ) : (
                  <p className="text-amber-700 italic">Homeless</p>
                )}
              </div>
            </div>
              
            <div>
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Work</h3>
              <div className="bg-amber-100 p-3 rounded-lg">
                {isLoadingBuildings ? (
                  <p className="text-amber-700 italic">Loading...</p>
                ) : workBuilding ? (
                  <div>
                    <p className="text-amber-800 font-medium">{workBuilding.name || formatBuildingType(workBuilding.type)}</p>
                    <p className="text-amber-700 text-sm">{formatBuildingType(workBuilding.type)}</p>
                  </div>
                ) : citizen.worksFor ? (
                  <div>
                    <p className="text-amber-800 font-medium">
                      Works for: <span className="font-bold">{citizen.worksFor}</span>
                    </p>
                    {citizen.workplace && (
                      <>
                        <p className="text-amber-600 text-xs">
                          {formatBuildingType(citizen.workplace.type || '')}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-amber-700 italic">Unemployed</p>
                )}
              </div>
            </div>
          </div>
          
          {/* Recent Activities Section - Moved before About */}
          <div className="mb-6">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Recent Activities</h3>
              
            {isLoadingActivities ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : activities.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                {activities.map((activity, index) => (
                  <div key={activity.ActivityId || index} className="bg-amber-100 rounded-lg p-2 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-amber-700">
                        {getActivityIcon(activity.Type)}
                      </div>
                      <div className="font-medium text-amber-800">
                        {formatActivityType(activity.Type)}
                      </div>
                      <div className="ml-auto text-xs text-amber-600">
                        {formatActivityDate(activity.EndDate || activity.StartDate || activity.CreatedAt)}
                      </div>
                    </div>
                      
                    {activity.FromBuilding && activity.ToBuilding && (
                      <div className="flex items-center text-xs text-amber-700 mb-1">
                        <span className="font-medium">{activity.FromBuilding}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <span className="font-medium">{activity.ToBuilding}</span>
                      </div>
                    )}
                      
                    {activity.ResourceId && activity.Amount && (
                      <div className="text-xs text-amber-700 mb-1">
                        <span className="font-medium">{activity.Amount}</span> units of <span className="font-medium">{activity.ResourceId}</span>
                      </div>
                    )}
                      
                    {activity.Notes && (
                      <div className="text-xs italic text-amber-600 mt-1">
                        {activity.Notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-amber-700 italic">No recent activities found.</p>
            )}
          </div>

          {/* Core Personality Section */}
          {citizen.corePersonality && Array.isArray(citizen.corePersonality) && citizen.corePersonality.length === 3 && (
            <div className="mb-6">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Core Traits</h3>
              <div className="bg-amber-100 p-3 rounded-lg text-sm space-y-1">
                <p><span className="font-medium text-amber-900">Strength:</span> <span className="text-amber-700">{citizen.corePersonality[0]}</span></p>
                <p><span className="font-medium text-amber-900">Flaw:</span> <span className="text-amber-700">{citizen.corePersonality[1]}</span></p>
                <p><span className="font-medium text-amber-900">Driver:</span> <span className="text-amber-700">{citizen.corePersonality[2]}</span></p>
              </div>
            </div>
          )}
            
          {/* Personality Section */}
          <div className="mb-6">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Personality</h3>
            <p className="text-amber-700 italic text-sm">{citizen.personality || 'No personality description available.'}</p>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">About {citizen.firstname}</h3>
            <p className="text-amber-700 italic text-sm">{citizen.description || 'No description available.'}</p>
          </div>
        </div>
      </div>
    </div>
    
    <div className="mt-4 text-xs text-amber-500 italic text-center">
      Citizen of Venice since {citizen.createdat ? formatDate(citizen.createdat) : 'the founding of the Republic'}
    </div>
  </div>
  );
};

export default CitizenDetailsPanel;
