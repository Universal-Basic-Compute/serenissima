import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWalletContext } from '@/components/UI/WalletProvider'; // Import useWalletContext
import { eventBus, EventTypes } from '@/lib/utils/eventBus'; // Import eventBus
// Citizen type might still be needed if 'citizen' prop has more fields than CitizenRelevanciesList expects for formatting
// import { Citizen } from '@/components/PolygonViewer/types';
import InfoIcon from './InfoIcon';
import ReactMarkdown from 'react-markdown'; // Added import
import remarkGfm from 'remark-gfm'; // Added import
// ReactMarkdown and remarkGfm are now primarily used in CitizenRelevanciesList
import { FaSpinner, FaVolumeUp, FaVolumeMute, FaExpand, FaCompress } from 'react-icons/fa'; // Added FaExpand, FaCompress
import CitizenRelevanciesList from './CitizenRelevanciesList'; // Import the new component

// Module-level flag to track if REQUEST_WALLET_STATUS has been emitted globally
let hasRequestedWalletStatusGlobally = false;

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
  // Add state for relationship
  const [relationship, setRelationship] = useState<any>(null);
  const [isLoadingRelationship, setIsLoadingRelationship] = useState<boolean>(false);
  const [cachedRelationships, setCachedRelationships] = useState<Record<string, any>>({});
  const [noRelationshipMessage, setNoRelationshipMessage] = useState<string>('');
  // Add state for problems
  const [problems, setProblems] = useState<any[]>([]);
  const [isLoadingProblems, setIsLoadingProblems] = useState<boolean>(false);
  const [cachedProblems, setCachedProblems] = useState<Record<string, any[]>>({});
  // State for citizen's transport resources
  const [transportResources, setTransportResources] = useState<any[]>([]);
  // The formatRelevancyText function is moved to CitizenRelevanciesList.tsx
  const [isLoadingTransports, setIsLoadingTransports] = useState<boolean>(false);
  const [cachedTransports, setCachedTransports] = useState<Record<string, any[]>>({});
  // State for active tab in the first column
  const [activeLeftTab, setActiveLeftTab] = useState<'relations' | 'citizen'>('relations');
  
  const { citizenProfile: currentCitizenProfileFromContext } = useWalletContext();
  const internalCurrentCitizenUsername = currentCitizenProfileFromContext?.username;
  // No need for initialLogDoneRef or useEffect to manage internalCurrentCitizenUsername,
  // as it's now derived directly from the context. WalletProvider handles event subscriptions.

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
  const fetchRelevancies = async (targetCitizen: string) => {
    if (!targetCitizen) return;
    
    setIsLoadingRelevancies(true);
    
    try {
      // Use internalCurrentCitizenUsername state
      if (!internalCurrentCitizenUsername) {
        console.warn('[CitizenDetailsPanel] No current username found (internal state), cannot fetch relevancies for', targetCitizen);
        setRelevancies([]); // Clear relevancies if user is not logged in
        setIsLoadingRelevancies(false);
        return;
      }
      
      // Fetch relevancies where targetCitizen = opened citizen's username
      // and relevantToCitizen = current user's username or "all"
      const response = await fetch(`/api/relevancies?targetCitizen=${targetCitizen}&relevantToCitizen=${internalCurrentCitizenUsername}`);
      
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

  // Function to fetch citizen's transport resources
  const fetchTransportResources = async (citizenUsername: string) => {
    if (!citizenUsername) return;

    setIsLoadingTransports(true);
    try {
      const response = await fetch(`/api/citizens/${citizenUsername}/transports`);
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
        console.error(`Error fetching transports for ${citizenUsername}: ${response.status} ${response.statusText}`);
        setTransportResources([]);
        setCachedTransports(prev => ({ ...prev, [citizenUsername]: [] }));
      }
    } catch (error) {
      console.error(`Exception fetching transports for ${citizenUsername}:`, error);
      setTransportResources([]);
      setCachedTransports(prev => ({ ...prev, [citizenUsername]: [] }));
    } finally {
      setIsLoadingTransports(false);
    }
  };

  // Function to fetch relationship data
  const fetchRelationship = async (viewedCitizenUsername: string) => {
    if (!viewedCitizenUsername) {
      setIsLoadingRelationship(false); // Ensure loading is stopped if no username
      return;
    }

    setIsLoadingRelationship(true);
    // Use internalCurrentCitizenUsername state
    if (!internalCurrentCitizenUsername) {
      console.warn('[CitizenDetailsPanel] No current username found (internal state), cannot fetch relationship with', viewedCitizenUsername);
      setRelationship(null);
      setIsLoadingRelationship(false);
      return;
    }

    // Avoid fetching relationship with oneself, or handle as a special case
    if (internalCurrentCitizenUsername === viewedCitizenUsername) {
      const selfRelationship = { strengthScore: 100, type: "Self" }; // Use camelCase
      setRelationship(selfRelationship);
      setCachedRelationships(prev => ({ ...prev, [viewedCitizenUsername]: selfRelationship }));
      setIsLoadingRelationship(false);
      return;
    }

    // setIsLoadingRelationship(true); // Already set
    try {
      // API should handle finding relationship regardless of (citizen1, citizen2) order
      const response = await fetch(`/api/relationships?citizen1=${internalCurrentCitizenUsername}&citizen2=${viewedCitizenUsername}`);
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

        // After successful primary message send, call Kinos AI
        if (citizen.username && internalCurrentCitizenUsername && citizen.username !== internalCurrentCitizenUsername) { // Use state variable
          // Prepare addSystem payload
          let addSystemPayload = null;
            
          // senderProfile (current user) - moved to outer scope
          let senderProfileObj = null;
          // Use internalCurrentCitizenUsername to fetch profile if needed, or rely on WalletProvider context
          // For simplicity, if WalletProvider updates localStorage.citizenProfile, this is fine.
          const savedProfile = localStorage.getItem('citizenProfile');
          if (savedProfile) try { senderProfileObj = JSON.parse(savedProfile); } catch(e) { console.error("Error parsing sender profile from localStorage for Kinos context:", e); }

          try {
            // targetProfile is 'citizen' prop
            // relationship is 'relationship' state (already fetched for the UI)

            const determinedKinosModelForContext = getKinosModelForSocialClass(citizen?.socialClass);
            const isLocalModelForContext = determinedKinosModelForContext === 'local';
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
            const relevanciesForKinosRes = await fetch(`/api/relevancies?relevantToCitizen=${citizen.username}&targetCitizen=${internalCurrentCitizenUsername}&limit=${relevancyLimit}`); // Use state variable
            const relevanciesForKinosData = relevanciesForKinosRes.ok ? await relevanciesForKinosRes.json() : null;
            const relevanciesForContext = relevanciesForKinosData?.success ? relevanciesForKinosData.relevancies : [];
            
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
            console.error("Error preparing context for Kinos AI in CitizenDetailsPanel:", contextError);
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
            
            const determinedKinosModel = getKinosModelForSocialClass(citizen?.socialClass);

            const kinosBody: any = { content: kinosPromptContent, model: determinedKinosModel };
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
                    console.error('Failed to persist Kinos AI response to Airtable (CitizenDetailsPanel):', await persistResponse.text());
                  } else {
                    console.log('Kinos AI response persisted to Airtable (CitizenDetailsPanel).');
                  }
                } catch (persistError) {
                  console.error('Error persisting Kinos AI response (CitizenDetailsPanel):', persistError);
                }
              }
            } else {
              console.error('Error from Kinos AI channel API:', kinosResponse.status, await kinosResponse.text());
               setMessages(prev => [...prev, {
                id: `kinos-error-${Date.now()}`,
                role: 'assistant',
                content: "My apologies, I couldn't get an augmented response at this moment.",
                timestamp: new Date().toISOString()
              }]);
            }
          } catch (kinosError) {
            console.error('Error calling Kinos AI channel API:', kinosError);
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
        // Fetch only if internalCurrentCitizenUsername is available
        if (internalCurrentCitizenUsername) {
            // Adjusted cache check: if cache has an entry for citizen.username, assume it's for the current user context
            // The forUser check was problematic as the cache structure is Record<string, any[]>
            if (cachedRelevancies.hasOwnProperty(citizen.username)) {
                setRelevancies(cachedRelevancies[citizen.username]);
                setIsLoadingRelevancies(false);
            } else {
                setRelevancies([]);
                fetchRelevancies(citizen.username);
            }
        } else {
            setRelevancies([]); // Clear if no logged-in user
            setIsLoadingRelevancies(false);
        }

        // --- Relationship ---
        // Fetch only if internalCurrentCitizenUsername is available
        if (internalCurrentCitizenUsername) {
            const cacheKey = `${citizen.username}_${internalCurrentCitizenUsername}`;
            if (cachedRelationships.hasOwnProperty(cacheKey)) {
                setRelationship(cachedRelationships[cacheKey]);
                setIsLoadingRelationship(false);
            } else {
                setRelationship(null);
                fetchRelationship(citizen.username);
            }
        } else {
            setRelationship(null); // Clear if no logged-in user
            setIsLoadingRelationship(false);
        }

        // --- Problems (not dependent on current user) ---
        if (cachedProblems.hasOwnProperty(citizen.username)) {
            setProblems(cachedProblems[citizen.username]);
            setIsLoadingProblems(false);
        } else {
            setProblems([]);
            fetchProblems(citizen.username);
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
        // Use citizen.citizenId (camelCase)
        if (!activitiesFetchAttemptedRef.current[citizen.citizenId]) {
            setActivities([]);
            fetchCitizenActivities(citizen.citizenId);
        }

        // --- Transport Resources (not dependent on current user) ---
        if (cachedTransports.hasOwnProperty(citizen.username)) {
            setTransportResources(cachedTransports[citizen.username]);
            setIsLoadingTransports(false);
        } else {
            setTransportResources([]);
            fetchTransportResources(citizen.username);
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
        setTransportResources([]);
        setIsLoadingTransports(false);
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
        
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [citizen?.citizenId, citizen?.username, onClose, cachedRelevancies, cachedRelationships, cachedProblems, cachedTransports, internalCurrentCitizenUsername]); // Added internalCurrentCitizenUsername

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

  const formatInfluence = (amount: number | string | undefined) => {
    if (amount === undefined || amount === null) return 'Unknown';
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numericAmount)) return 'Unknown';
    const formattedAmount = Math.floor(numericAmount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return formattedAmount + ' 🎭';
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
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'medium-term':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'long-term':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
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
  
  // Use citizen.socialClass (camelCase)
  const socialClassStyle = getSocialClassColor(citizen.socialClass);

  const coatOfArmsSrc = useMemo(() => {
    // Always construct the path based on username.
    // The onError handler in the <img> tag will manage the default image.
    if (citizen?.username) {
      return `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${citizen.username}.png`;
    }
    // If no username, no custom coat of arms can be determined.
    // The <img> tag's onError will use the default.
    // We can return undefined, or the default path directly if we want to skip one onError cycle.
    // For consistency with image handling, returning undefined and letting onError manage it is fine.
    return undefined; 
  }, [citizen?.username]);
  
  return (
    <div
      className={
        `fixed top-20 left-20 right-4 bottom-10 bg-amber-50 border-2 border-amber-700 rounded-lg p-6 shadow-lg z-50 transition-all duration-300 pointer-events-auto flex flex-col ` +
        `${isVisible ? 'opacity-100 transform translate-x-0' : 'opacity-0 transform translate-x-10'}`
      }
      style={{ pointerEvents: 'auto', cursor: 'default' }}
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
      <div className={`flex flex-row gap-4 ${isCorrespondanceFullScreen ? 'flex-grow min-h-0' : 'flex-grow min-h-0'}`}> {/* Ensure it can grow */}
        {/* First column - Tabs for Relationship/Opportunities and Citizen Info */}
        <div className={`${isCorrespondanceFullScreen ? 'hidden' : 'w-1/3'} flex flex-col`}>
          {/* Tab Navigation */}
          <div className="mb-3 border-b border-amber-300 flex-shrink-0">
            <nav className="flex space-x-1" aria-label="Left Column Tabs">
              <button
                onClick={() => setActiveLeftTab('relations')}
                className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                  ${activeLeftTab === 'relations' 
                    ? 'bg-amber-600 text-white' 
                    : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                  }`}
              >
                Relations
              </button>
              <button
                onClick={() => setActiveLeftTab('citizen')}
                className={`px-3 py-2 font-medium text-xs rounded-t-md transition-colors
                  ${activeLeftTab === 'citizen' 
                    ? 'bg-amber-600 text-white' 
                    : 'text-amber-600 hover:bg-amber-200 hover:text-amber-800'
                  }`}
              >
                Citizen
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1">
            {activeLeftTab === 'relations' && (
              <>
                {/* Relationship Section */}
                <div className="flex items-center">
                  <h3 className="text-base font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Relationship</h3>
                  <InfoIcon tooltipText="Entwinement: Measures relationship strength based on shared relevancies and common interests. Trust: Assesses reliability from positive direct interactions (messages, loans, contracts)." />
                </div>
                {isLoadingRelationship ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : relationship && typeof relationship.strengthScore !== 'undefined' ? (
                  <div className="bg-amber-100 rounded-lg p-3 text-sm mb-4">
                    {relationship.type === "Self" ? (
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-amber-800">Self-Regard</div>
                        <div className={`px-3 py-1 rounded-full text-lg font-bold text-center ${
                          relationship.strengthScore >= 75 ? 'bg-green-200 text-green-800' :
                          relationship.strengthScore > 25 ? 'bg-amber-200 text-amber-800' :
                          'bg-red-200 text-red-800'
                        }`}>
                          {Math.round(relationship.strengthScore)}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-3">
                          <div className="text-center mb-2">
                            <span className="inline-block px-3 py-1 bg-gray-200 text-gray-800 rounded-full font-bold">
                              {relationship.title || "Relationship Details"}
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-around text-center">
                          <div title="Entwinement (Strength Score): Quantifies the relationship's strength based on shared relevancies and common interests. A higher score indicates more shared ground or potential for mutual benefit. Useful for understanding alignment and potential for collaboration.">
                            <div className={`px-3 py-1 rounded-full text-xl font-bold ${
                              relationship.strengthScore > 75 ? 'bg-green-200 text-green-800' :
                              relationship.strengthScore > 25 ? 'bg-amber-200 text-amber-800' :
                              'bg-red-200 text-red-800'
                            }`}>
                              {Math.round(relationship.strengthScore)}
                            </div>
                            <p className="text-xs text-amber-600 mt-1">Entwinement</p>
                          </div>
                          {typeof relationship.trustScore !== 'undefined' && (
                            <div title="Trust Score: Quantifies the level of trust built through direct positive interactions (messages, loans, contracts, transactions). A higher score suggests a more reliable and positive direct relationship history. Useful for gauging reliability in direct dealings.">
                              <div className={`px-3 py-1 rounded-full text-xl font-bold ${
                                relationship.trustScore > 75 ? 'bg-sky-200 text-sky-800' :
                                relationship.trustScore > 25 ? 'bg-orange-200 text-orange-800' :
                                'bg-rose-200 text-rose-800'
                              }`}>
                                {Math.round(relationship.trustScore)}
                              </div>
                              <p className="text-xs text-amber-600 mt-1">Trust</p>
                            </div>
                          )}
                        </div>
                        {relationship.description && (
                          <div className="mt-3 text-center">
                            <p className="text-xs font-serif italic text-amber-700">
                              {relationship.description.split('.').slice(0, 2).join('.') + (relationship.description.split('.').length > 2 ? '.' : '')}
                            </p>
                          </div>
                        )}
                        {relationship.tier && (
                          <div className="text-center mt-3">
                            <p className="text-xs text-amber-600">Tier</p>
                            <p className="text-sm font-medium text-amber-800">{relationship.tier}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-amber-700 italic text-sm mb-4">
                    {noRelationshipMessage}
                  </p>
                )}

                {/* Relevancies Section - Now uses CitizenRelevanciesList component */}
                <CitizenRelevanciesList
                  relevancies={relevancies}
                  isLoadingRelevancies={isLoadingRelevancies}
                  citizen={citizen}
                />
              </>
            )}

            {activeLeftTab === 'citizen' && (
              <>
                {/* Problems Section */}
                <div className="flex items-center">
                  <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Problems</h3>
                  <InfoIcon tooltipText="Active issues or challenges faced by this citizen that may require attention or offer opportunities for assistance." />
                </div>
                {isLoadingProblems ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
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

                {/* Recent Activities Section */}
                <div className="mt-4">
                  <div className="flex items-center">
                    <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Recent Activities</h3>
                    <InfoIcon tooltipText="A log of this citizen's recent actions and engagements within Venice, providing insights into their daily life and interactions." />
                  </div>
                  {isLoadingActivities ? (
                    <div className="flex justify-center py-4">
                      <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : activities.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                      {activities.map((activity, index) => (
                        <div key={activity.activityId || index} className="bg-amber-100 rounded-lg p-2 text-sm"> 
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-amber-700">
                              {getActivityIcon(activity.type)} 
                            </div>
                            <div className="font-medium text-amber-800">
                              {formatActivityType(activity.type)} 
                            </div>
                            <div className="ml-auto text-xs text-amber-600">
                              {formatActivityDate(activity.endDate || activity.startDate || activity.createdAt)} 
                            </div>
                          </div>
                          {activity.fromBuilding && activity.toBuilding && ( 
                            <div className="flex items-center text-xs text-amber-700 mb-1">
                              <span className="font-medium">{activity.fromBuilding}</span> 
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                              <span className="font-medium">{activity.toBuilding}</span> 
                            </div>
                          )}
                          {activity.resourceId && activity.amount && ( 
                            <div className="text-xs text-amber-700 mb-1">
                              <span className="font-medium">{activity.amount}</span> units of <span className="font-medium">{activity.resourceId}</span> 
                            </div>
                          )}
                          {activity.notes && ( 
                            <div className="text-xs italic text-amber-600 mt-1">
                              {activity.notes} 
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-amber-700 italic text-xs">No recent activities found.</p>
                  )}
                </div>

                {/* Transports Section */}
                <div className="mt-4">
                  <div className="flex items-center">
                    <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Transports</h3>
                    <InfoIcon tooltipText="Means of conveyance (gondolas, barges, etc.) currently listed under this citizen's name, indicating their capacity for transporting goods or people." />
                  </div>
                  {isLoadingTransports ? (
                    <div className="flex justify-center py-4">
                      <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : transportResources.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {transportResources.map((transport, index) => (
                        <div key={transport.id || index} className="bg-amber-100 rounded-lg p-2 text-sm flex items-center">
                          <img 
                            src={`https://backend.serenissima.ai/public_assets/images/resources/${(transport.Name || transport.name || 'default_boat').toLowerCase().replace(/\s+/g, '_')}.png`} 
                            alt={transport.Name || transport.name} 
                            className="w-8 h-8 mr-3 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/resources/default_boat.png';}}
                          />
                          <div>
                            <div className="font-medium text-amber-800">{transport.Name || transport.name}</div>
                            {(transport.Quantity !== undefined || transport.quantity !== undefined) && (
                              <p className="text-xs text-amber-700">
                                Quantity: {transport.Quantity !== undefined ? transport.Quantity : transport.quantity}
                              </p>
                            )}
                            {transport.Description && <p className="text-xs text-amber-600 italic">{transport.Description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-amber-700 italic">This citizen is not currently transporting any resources.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Second column - Correspondance */}
        <div className={`${isCorrespondanceFullScreen ? 'w-full' : 'w-1/3'} flex flex-col`}>
          <div className="flex items-center flex-shrink-0">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1 flex-grow">Correspondance</h3>
            <InfoIcon tooltipText="Direct messages exchanged with this citizen. Use this to negotiate, gather information, or build relationships." />
            <button 
              onClick={() => setIsCorrespondanceFullScreen(!isCorrespondanceFullScreen)} 
              className="text-amber-600 hover:text-amber-700 ml-2 p-1 flex-shrink-0"
              title={isCorrespondanceFullScreen ? "Exit full screen" : "Full screen"}
            >
              {isCorrespondanceFullScreen ? <FaCompress size={16} /> : <FaExpand size={16} />}
            </button>
          </div>
          
          {/* Messages area */}
          <div 
            className="flex-grow overflow-y-auto p-3 bg-amber-50 bg-opacity-80 rounded-lg mb-3 custom-scrollbar min-h-[300px]" // Added min-h-[300px]
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat'
            }}
          >
            {isLoadingHistory ? (
              <div className="flex justify-center items-center h-full">
                <div className="bg-yellow-500 text-white p-3 rounded-lg rounded-bl-none inline-block"> {/* Changed bg-amber-700 to bg-yellow-500 for the container if desired, or keep amber */}
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div> {/* Changed bg-amber-300 to bg-yellow-300 or bg-yellow-400 */}
                    <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                {messagesFetchFailed ? (
                  <div className="text-gray-500 italic">
                    {/* Use citizen.firstName (camelCase) */}
                    Unable to load conversation history with {citizen.firstName}.
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
                      <div className="markdown-content relative z-10 text-sm">
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
                    <div className="inline-block p-3 rounded-lg max-w-[80%] bg-yellow-500 text-white rounded-bl-none"> {/* Changed bg-amber-700 to bg-yellow-500 for the container if desired, or keep amber */}
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div> {/* Changed bg-amber-300 to bg-yellow-300 or bg-yellow-400 */}
                        <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
            className="flex flex-shrink-0 items-end" // Added items-end for alignment
          >
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              // Use citizen.firstName (camelCase)
              placeholder={`Message ${citizen.firstName}... (Shift+Enter for new line)`} 
              className="flex-1 p-2 border border-amber-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={3}
              disabled={isTyping}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isTyping && inputValue.trim()) {
                    sendMessage(inputValue);
                  }
                }
              }}
              style={{ maxHeight: '120px' }}
            />
            <button 
              type="submit"
              className={`px-4 rounded-r-lg transition-colors self-stretch ${ // Added self-stretch
                isTyping || !inputValue.trim()
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-amber-700 text-white hover:bg-amber-600'
              }`}
              disabled={isTyping || !inputValue.trim()}
            >
              {isTyping ? <FaSpinner className="animate-spin text-yellow-400" /> : 'Send'}
            </button>
          </form>
        </div>
        
        {/* Third column - Citizen details */}
        <div className={isCorrespondanceFullScreen ? 'hidden' : 'w-1/3 flex flex-col'}>
          <div className="w-full mb-6 flex-shrink-0">
            {/* Full-width image container with relative positioning for the coat of arms overlay, now square */}
            <div className="w-full aspect-square relative mb-4 overflow-hidden rounded-lg border-2 border-amber-600 shadow-lg">
              {/* Main citizen image - Use citizen.username to construct path */}
              <img 
                src={citizen.username ? `https://backend.serenissima.ai/public_assets/images/citizens/${citizen.username}.jpg` : `https://backend.serenissima.ai/public_assets/images/citizens/default_citizen.png`}
                alt={`${citizen.firstName} ${citizen.lastName}`} 
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.warn(`Failed to load citizen image for ${citizen.username}: ${(e.target as HTMLImageElement).src}. Falling back to default.`);
                  (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default_citizen.png';
                  // Optional: If even default fails, show placeholder SVG
                  (e.target as HTMLImageElement).onerror = () => {
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
                }}
              />
              
              {/* Coat of arms overlay in the bottom right corner */}
              {/* Render div only if coatOfArmsSrc is defined (i.e., citizen.username exists) */}
              {coatOfArmsSrc && (
                <div className="absolute bottom-3 right-3 w-20 h-20 rounded-full overflow-hidden border-2 border-amber-600 shadow-lg bg-amber-100 z-10">
                  <img 
                    src={coatOfArmsSrc}
                    alt="Coat of Arms"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to default coat of arms
                      (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/coat-of-arms/default.png';
                    }}
                  />
                </div>
              )}
              
              {/* Name and social class overlay at the bottom - Use citizen.firstName, citizen.lastName, citizen.socialClass (camelCase) */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4"> 
                <h3 className="text-white text-2xl font-serif font-bold"> 
                  {citizen.firstName} {citizen.lastName} 
                </h3>
                <div className="flex justify-between items-center">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium inline-flex items-center ${socialClassStyle}`}>
                    {citizen.socialClass && (
                      <img
                        src={`/images/${citizen.socialClass.toLowerCase()}.png`}
                        alt="" // Alt vide car le nom de la classe est déjà affiché
                        className="w-4 h-4 mr-1.5 object-contain" // Taille plus petite pour l'icône dans le badge
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {citizen.socialClass} 
                  </div>
                </div>
              </div>

              {/* Ducats and Influence display at the top right */}
              <div className="absolute top-3 right-3 flex flex-col items-end space-y-1">
                {/* Ducats - Use citizen.ducats (camelCase) */}
                {citizen.ducats !== undefined && (
                  <div className="bg-black/60 text-white px-3 py-1 rounded-lg shadow-md">
                    <span className="text-lg font-bold">{formatDucats(citizen.ducats)}</span>
                  </div>
                )}
                {/* Influence - Use citizen.influence (camelCase) */}
                {citizen.influence !== undefined && (
                  <div className="bg-black/60 text-white px-3 py-1 rounded-lg shadow-md">
                    <span className="text-lg font-bold">{formatInfluence(citizen.influence)}</span>
                  </div>
                )}
              </div>
            </div>
        </div>
        
        {/* Add max-height and scrolling to the details section */}
        <div className="flex-grow min-h-0 overflow-y-auto pr-1 custom-scrollbar">
          {/* Home and Work section - homeBuilding and workBuilding properties are assumed camelCase from API */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="flex items-center">
                <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Home</h3>
                <InfoIcon tooltipText="The primary residence of this citizen within Venice." />
              </div>
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
              <div className="flex items-center">
                <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Work</h3>
                <InfoIcon tooltipText="The primary place of employment or business operation for this citizen." />
              </div>
              <div className="bg-amber-100 p-3 rounded-lg">
                {isLoadingBuildings ? (
                  <p className="text-amber-700 italic">Loading...</p>
                ) : workBuilding ? (
                  <div>
                    <p className="text-amber-800 font-medium">{workBuilding.name || formatBuildingType(workBuilding.type)}</p>
                    <p className="text-amber-700 text-sm">{formatBuildingType(workBuilding.type)}</p>
                  </div>
                ) : citizen.worksFor ? ( /* Use citizen.worksFor, citizen.workplace.type (camelCase) */
                  <div>
                    <p className="text-amber-800 font-medium">
                      <span className="font-bold">{citizen.worksFor}</span>
                    </p>
                    {citizen.workplace && (
                      <>
                        <p className="text-amber-600 text-xs">
                          {formatBuildingType(citizen.workplace.type || '')}
                        </p>
                      </>
                    )}
                  </div>
                ) : citizen.socialClass === 'Nobili' ? (
                  <p className="text-amber-700 italic">Gentleman of Private Life</p>
                ) : (
                  <p className="text-amber-700 italic">Unemployed</p>
                )}
              </div>
            </div>
          </div>
            
          {/* Personality Section - Use citizen.corePersonality, citizen.personality (camelCase) */}
          <div className="mb-6">
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Personality</h3>
              <InfoIcon tooltipText="Key personality traits and a general description of this citizen's character and demeanor." />
            </div>
            {citizen.corePersonality && Array.isArray(citizen.corePersonality) && citizen.corePersonality.length === 3 && (
              <div className="flex space-x-2 mb-3">
                <div className="px-3 py-1 text-xs font-medium text-green-800 bg-green-100 border border-green-300 rounded-full shadow-sm">
                  {citizen.corePersonality[0]}
                </div>
                <div className="px-3 py-1 text-xs font-medium text-red-800 bg-red-100 border border-red-300 rounded-full shadow-sm">
                  {citizen.corePersonality[1]}
                </div>
                <div className="px-3 py-1 text-xs font-medium text-blue-800 bg-blue-100 border border-blue-300 rounded-full shadow-sm">
                  {citizen.corePersonality[2]}
                </div>
              </div>
            )}
            <p className="text-amber-700 italic text-sm">{citizen.personality || 'No personality description available.'}</p>
          </div>

          <div className="mb-6">
            {/* Use citizen.firstName, citizen.description (camelCase) */}
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">About {citizen.firstName}</h3>
              <InfoIcon tooltipText="A brief biography or notable information about this citizen." />
            </div> 
            <p className="text-amber-700 italic text-sm">{citizen.description || 'No description available.'}</p>
          </div>
        </div>
      </div>
    </div>
    
    <div className="mt-4 text-xs text-amber-500 italic text-center flex-shrink-0">
      {/* Use citizen.createdAt (camelCase) */}
      Citizen of Venice since {citizen.createdAt ? formatDate(citizen.createdAt) : 'the founding of the Republic'} 
    </div>
  </div>
  );
};

export default CitizenDetailsPanel;
