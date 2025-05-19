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
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  // Add state for relevancies
  const [relevancies, setRelevancies] = useState<any[]>([]);
  const [isLoadingRelevancies, setIsLoadingRelevancies] = useState<boolean>(false);
  
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
        } else {
          setRelevancies([]);
        }
      } else {
        console.error('Failed to fetch relevancies:', response.status, response.statusText);
        setRelevancies([]);
      }
    } catch (error) {
      console.error('Error fetching relevancies:', error);
      setRelevancies([]);
    } finally {
      setIsLoadingRelevancies(false);
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
      // Check if this is an AI citizen or a regular citizen
      if (citizen.isai === false) {
        // For non-AI citizens, use the regular messages API
        console.log(`Fetching messages for non-AI citizen ${citizen.citizenid} using messages API`);
        
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
            otherCitizen: citizen.username || citizen.citizenid
          })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch message history: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.messages) {
          // Convert the message format to match what the component expects
          const formattedMessages = data.messages.map(msg => ({
            id: msg.messageId,
            role: msg.sender === currentUsername ? 'citizen' : 'assistant',
            content: msg.content,
            timestamp: msg.createdAt
          }));
          
          setMessages(formattedMessages);
        } else {
          // If no messages found, set a welcome message
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: `Buongiorno! I am ${citizen.firstname} ${citizen.lastname}. How may I assist you today?`,
              timestamp: new Date().toISOString()
            }
          ]);
        }
      } else {
        // For AI citizens, use the Kinos Engine API with channels
        
        // Get current citizen from localStorage for channel ID
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
        
        // Use username as channel ID
        const channelId = currentUsername;
        
        console.log(`Fetching messages for AI citizen ${citizen.citizenid} using channel ${channelId}`);
        
        const response = await fetch(
          `https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/${citizen.citizenid}/channels/${channelId}/messages?limit=25`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        // Check for 404 specifically
        if (response.status === 404) {
          console.log(`No message history found for citizen ${citizen.citizenid} in channel ${channelId}`);
          // Set a welcome message instead of re-fetching
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: `Buongiorno! I am ${citizen.firstname} ${citizen.lastname}. How may I assist you today?`,
              timestamp: new Date().toISOString(),
              channel_id: channelId
            }
          ]);
          setIsLoadingHistory(false);
          return; // Exit early to prevent re-fetching
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch message history: ${response.status}`);
        }

        const data = await response.json();
        
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error fetching message history:', error);
      // If we can't fetch history, start with a welcome message
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Buongiorno! I am ${citizen.firstname} ${citizen.lastname}. How may I assist you today?`,
          timestamp: new Date().toISOString()
        }
      ]);
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
      // Check if this is an AI citizen or a regular citizen
      if (citizen.isai === false) {
        // For non-AI citizens, use the regular messages API
        console.log(`Sending message to non-AI citizen ${citizen.citizenid} using messages API`);
        
        const response = await fetch('/api/messages/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: currentUsername,
            receiver: citizen.username || citizen.citizenid,
            content: content,
            type: 'message'
          })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.message) {
          // Add the message to the UI
          setMessages(prev => [...prev, {
            id: data.message.messageId,
            role: 'assistant',
            content: `I've received your message. I'll respond when I'm available.`,
            timestamp: new Date().toISOString()
          }]);
        }
      } else {
        // For AI citizens, use the Kinos Engine API with channels
        
        // Use username as channel ID
        const channelId = currentUsername;
        
        console.log(`Sending message to AI citizen ${citizen.citizenid} using channel ${channelId}`);
        
        // Default system prompt for AI citizens
        const systemPrompt = `You are ${citizen.firstname} ${citizen.lastname}, a ${citizen.socialclass} citizen of Renaissance Venice. 
Your description: ${citizen.description}
Respond in character, with the personality, knowledge, and perspective of a ${citizen.socialclass} in 16th century Venice.
Be historically accurate but engaging. Speak in first person as if you are this character.`;
        
        const response = await fetch(
          `https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/${citizen.citizenid}/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: content,
              model: 'claude-3-7-sonnet-latest',
              mode: 'creative',
              addSystem: systemPrompt
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.status}`);
        }

        const data = await response.json();
        
        // Add the assistant's response to the messages
        setMessages(prev => [...prev, {
          id: data.id,
          role: 'assistant',
          content: data.content,
          timestamp: data.timestamp,
          channel_id: channelId
        }]);
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

  // Function to handle text-to-speech
  const handleTextToSpeech = async (message: any) => {
    try {
      // If already playing this message, stop it
      if (playingMessageId === message.id) {
        if (audioElement) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
        setPlayingMessageId(null);
        return;
      }
      
      // Stop any currently playing audio
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      
      // Set the current message as playing
      setPlayingMessageId(message.id);
      
      // Call the Kinos Engine API directly to get the audio file
      const response = await fetch('https://api.kinos-engine.ai/v2/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: message.content,
          voice_id: 'IKne3meq5aSn9XLyUdCD', // Default ElevenLabs voice ID
          model: 'eleven_flash_v2_5'
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate speech: ${response.status}`);
      }
      
      // Get the audio blob directly from the response
      const audioBlob = await response.blob();
      
      // Create a URL for the blob
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Create a new audio element
      const audio = new Audio(audioUrl);
      setAudioElement(audio);
      
      // Play the audio
      audio.play();
      
      // When audio ends, reset the playing state and revoke the blob URL
      audio.onended = () => {
        setPlayingMessageId(null);
        URL.revokeObjectURL(audioUrl); // Clean up the blob URL
      };
      
    } catch (error) {
      console.error('Error generating speech:', error);
      setPlayingMessageId(null);
      alert('Failed to generate speech. Please try again.');
    }
  };
  
  // Add a ref to track which citizens we've already sent initial messages to
  const initialMessageSentRef = useRef<{[citizenId: string]: boolean}>({});
  
  useEffect(() => {
    // Animate in when component mounts
    setIsVisible(true);
    
    // Reset states when citizen changes
    setHomeBuilding(null);
    setWorkBuilding(null);
    setIsLoadingBuildings(false);
    setActivities([]);
    
    // Reset the message fetch attempted flag when citizen changes
    if (citizen && citizen.citizenid) {
      // Only reset for the new citizen, keep track of previous attempts
      const newAttemptedRef = {...messagesFetchAttemptedRef.current};
      // If we haven't attempted for this citizen yet, fetch messages
      if (!newAttemptedRef[citizen.citizenid]) {
        fetchMessageHistory();
      }
      
      // Similarly, only fetch activities if we haven't tried yet for this citizen
      if (!activitiesFetchAttemptedRef.current[citizen.citizenid]) {
        fetchCitizenActivities(citizen.citizenid);
      }
      
      // Fetch relevancies for this citizen
      if (citizen.username) {
        fetchRelevancies(citizen.username);
      }
      
      // NEW CODE: If this is an AI citizen, send a POST request to initiate conversation
      // BUT ONLY if we haven't already sent an initial message to this citizen
      if (((citizen.isai === true || citizen.isAi === true)) && !initialMessageSentRef.current[citizen.citizenid]) {
        // Mark that we've sent an initial message to this citizen
        initialMessageSentRef.current[citizen.citizenid] = true;
        
        // Get current citizen from localStorage
        let currentUsername = 'visitor';
        let currentFullName = 'Visitor';
        let currentSocialClass = 'Visitor';
        
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.username) {
              currentUsername = profile.username;
              currentFullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
              currentSocialClass = profile.socialClass || 'Citizen';
            }
          } catch (error) {
            console.error('Error parsing citizen profile:', error);
          }
        }
        
        // Use username as channel ID
        const channelId = currentUsername;
        
        // Create system message for AI to initiate conversation
        const systemMessage = `[SYSTEM]You just bumped into ${currentFullName} (${currentUsername} - ${currentSocialClass}) in the streets of Venice. Engage the conversation on relevant topics, if possible game-related[/SYSTEM]`;
        
        // Create system prompt with AI citizen info
        const systemPrompt = `You are ${citizen.firstname} ${citizen.lastname}, a ${citizen.socialclass} citizen of Renaissance Venice. 
Your description: ${citizen.description}
Respond in character, with the personality, knowledge, and perspective of a ${citizen.socialclass} in 16th century Venice.
Be historically accurate but engaging. Speak in first person as if you are this character.`;
        
        console.log(`Sending initial message to AI citizen ${citizen.citizenid} using channel ${channelId}`);
        
        // Send POST request to Kinos
        fetch(
          `https://api.kinos-engine.ai/v2/blueprints/serenissima-ai/kins/${citizen.citizenid}/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: systemMessage,
              model: 'claude-3-7-sonnet-latest',
              mode: 'creative',
              addSystem: systemPrompt
            }),
          }
        )
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to send initial message: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('AI citizen initiated conversation:', data);
          
          // Add the assistant's response to the messages
          setMessages(prev => [...prev, {
            id: data.id,
            role: 'assistant',
            content: data.content,
            timestamp: data.timestamp,
            channel_id: channelId
          }]);
          
          // Set isTyping to false in case it was set
          setIsTyping(false);
        })
        .catch(error => {
          console.error('Error sending initial message to AI citizen:', error);
          // Don't add a fallback message here, as we already have a welcome message
        });
      }
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
    
    // Format without decimal places
    return Math.floor(numericAmount) + ' ⚜️'; // Using lys emoji instead of ₫
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
        {/* First column - Relevancies */}
        <div className="w-1/3">
          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Relevancies</h3>
          
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
                      {relevancy.title}
                    </div>
                    {/* Score displayed as a nice badge */}
                    <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 text-amber-800">
                      Score: {relevancy.score}
                    </div>
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    {relevancy.description}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-amber-700 italic">No relevancies found.</p>
          )}
        </div>
        
        {/* Second column - Conversation */}
        <div className="w-1/3">
          <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Conversation</h3>
          
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
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="bg-amber-700 text-white p-3 rounded-lg rounded-bl-none inline-block mb-4">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
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
                      message.role === 'citizen' 
                        ? 'text-right' 
                        : 'text-left'
                    }`}
                  >
                    <div 
                      className={`inline-block p-3 rounded-lg max-w-[80%] ${
                        message.role === 'citizen'
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
                      
                      {/* Only show voice button for assistant messages */}
                      {message.role === 'assistant' && (
                        <button
                          onClick={() => handleTextToSpeech(message)}
                          className="mt-1 text-amber-300 hover:text-amber-100 transition-colors float-right"
                          aria-label={playingMessageId === message.id ? "Stop speaking" : "Speak message"}
                        >
                          {playingMessageId === message.id ? (
                            <FaVolumeMute className="w-4 h-4" />
                          ) : (
                            <FaVolumeUp className="w-4 h-4" />
                          )}
                        </button>
                      )}
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
          <div className="flex flex-col items-center mb-6">
          {/* Much larger image */}
          <div className="w-48 h-48 mb-4 relative">
            {citizen.imageurl || citizen.profileimage || citizen.ImageUrl ? (
              <img 
                src={citizen.imageurl || citizen.profileimage || citizen.ImageUrl} 
                alt={`${citizen.firstname} ${citizen.lastname}`} 
                className="w-full h-full object-cover rounded-lg border-2 border-amber-600 shadow-lg"
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
                          <div class="w-full h-full bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
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
                        <div class="w-full h-full bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
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
                  className="w-full h-full object-cover rounded-lg border-2 border-amber-600 shadow-lg"
                  onError={(e) => {
                    console.error(`Failed to load citizen image: ${(e.target as HTMLImageElement).src}`);
                    // Replace with placeholder
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) {
                      parent.innerHTML = `
                        <div class="w-full h-full bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
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
                <div className="w-full h-full bg-amber-200 rounded-lg border-2 border-amber-600 flex items-center justify-center text-amber-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )
            )}
          </div>
        
          {/* Social class and wealth info */}
          <div className="text-center">
            <div className={`px-3 py-1.5 rounded-full text-sm font-medium inline-block mb-2 ${socialClassStyle}`}>
              {citizen.socialclass}
            </div>
            
            <div className="text-amber-700 text-sm font-medium">
              Ducats: {formatDucats(citizen.Ducats || citizen.wealth || citizen.ducats)}
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
                        <p className="text-amber-700 text-sm">
                          {citizen.workplace.name || 'Unknown workplace'}
                        </p>
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
            
          <div className="mb-6">
            <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">About</h3>
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
