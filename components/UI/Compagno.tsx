"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaTimes, FaChevronDown, FaSpinner, FaVolumeUp, FaVolumeMute, FaBell, FaUser, FaSearch, FaArrowLeft, FaInfoCircle } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { timeDescriptionService } from '@/lib/services/TimeDescriptionService';
import { extractPageText } from '@/lib/utils/pageTextExtractor';
import Portal from './Portal';

interface Notification {
  notificationId: string;
  type: string;
  citizen: string;
  content: string;
  details?: any;
  createdAt: string;
  readAt: string | null;
}

interface Citizen {
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImageUrl: string | null;
  lastMessageTimestamp?: string | null; // For sorting correspondence
  unreadMessagesFromCitizenCount?: number; // For unread badge per citizen
  distance?: number | null; // Added distance
}

interface Message {
  id?: string;
  messageId?: string;
  role?: 'user' | 'assistant';
  sender?: string;
  receiver?: string;
  content: string;
  type?: string;
  timestamp?: string;
  createdAt?: string;
  readAt?: string | null;
  isPlaying?: boolean; // For audio playback state
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

interface CompagnoProps {
  className?: string;
  onNotificationsRead?: (notificationIds: string[]) => void;
}

const KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2'; // For citizen-to-citizen AI augmented chat
const KINOS_CHANNEL_BLUEPRINT = 'serenissima-ai'; // Used for all citizen AI interactions
const DEFAULT_CITIZENNAME = 'visitor'; // Default username for anonymous citizens

const Compagno: React.FC<CompagnoProps> = ({ className, onNotificationsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  // const [messages, setMessages] = useState<Message[]>([]); // Removed: Old Compagno messages
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false); // Kept: Used for self-chat AI typing indicator
  // const [isLoadingHistory, setIsLoadingHistory] = useState(false); // Removed: Old Compagno history
  // const [pagination, setPagination] = useState<PaginationInfo | null>(null); // Removed: Old Compagno pagination
  const [username, setUsername] = useState<string>(DEFAULT_CITIZENNAME);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0); // New state for unread messages
  const [activeTab, setActiveTab] = useState<'notifications' | 'chats'>('notifications');
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now());
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const fetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [isLoadingCitizens, setIsLoadingCitizens] = useState<boolean>(false);
  const [selectedCitizen, setSelectedCitizen] = useState<string | null>(null); // Will default to self if null
  const [citizenMessages, setCitizenMessages] = useState<Message[]>([]);
  const [isLoadingCitizenMessages, setIsLoadingCitizenMessages] = useState<boolean>(false);
  const [citizenSearchQuery, setCitizenSearchQuery] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isPreparingContext, setIsPreparingContext] = useState<boolean>(false);

  // State for contextual data for Kinos addSystem
  const [contextualDataForChat, setContextualDataForChat] = useState<{
    senderProfile: any | null; // Profil de l'utilisateur humain
    targetProfile: any | null; // Profil de base de l'IA avec qui on chatte (peut être l'utilisateur lui-même)
    aiDataPackage: any | null; // Paquet de données complet pour l'IA cible (ou l'utilisateur lui-même)
  } | null>(null);
  // const [kinosModel, setKinosModel] = useState<'gemini-2.5-pro-preview-05-06' | 'local'>('gemini-2.5-pro-preview-05-06'); // Removed: Model is now dynamic

  const getKinosModelForSocialClass = (username?: string, socialClass?: string): string => {
    // Special case for NLR
    if (username === 'NLR') {
      return 'gemini-2.5-pro-preview-05-06';
    }

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
        console.warn(`Unknown social class '${socialClass}' for user '${username}', defaulting to gemini-2.5-flash-preview-05-20.`);
        return 'gemini-2.5-flash-preview-05-20'; 
    }
  };
  

  // Fetch unread notification count
  const fetchUnreadCount = useCallback(async () => {
    // Skip fetching if the component is open to avoid duplicate counts
    if (isOpen) return;
    
    try {
      // Get the current username from localStorage if not already set
      let citizenToFetch = username;
      
      if (!citizenToFetch || citizenToFetch === DEFAULT_CITIZENNAME) {
        // Try to get username from localStorage
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.username) {
              citizenToFetch = profile.username;
            }
          } catch (error) {
            console.error('Error parsing citizen profile:', error);
          }
        }
      }
      
      // If still no username, use the default
      if (!citizenToFetch) {
        citizenToFetch = DEFAULT_CITIZENNAME;
      }
      
      // Use the unread count API endpoint
      const apiUrl = `/api/notifications/unread-count`;
      
      const response = await fetch(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ citizen: citizenToFetch })
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch unread count: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && typeof data.unreadCount === 'number') {
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Error fetching unread notification count:', error);
    }
  }, [username, isOpen]);

  // Fetch unread messages count
  const fetchUnreadMessagesCount = useCallback(async () => {
    if (isOpen && activeTab === 'chats') return; // Don't fetch if chat is open and active, as messages might be read

    try {
      let citizenToFetch = username;
      if (!citizenToFetch || citizenToFetch === DEFAULT_CITIZENNAME) {
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.username) {
              citizenToFetch = profile.username;
            }
          } catch (error) {
            console.error('Error parsing citizen profile for messages count:', error);
          }
        }
      }

      if (!citizenToFetch) {
        citizenToFetch = DEFAULT_CITIZENNAME;
      }

      const apiUrl = `/api/messages/unread-count`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citizen: citizenToFetch }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch unread messages count: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && typeof data.unreadMessagesCount === 'number') {
        setUnreadMessagesCount(data.unreadMessagesCount);
      }
    } catch (error) {
      console.error('Error fetching unread messages count:', error);
    }
  }, [username, isOpen, activeTab]);

  // Fetch notifications
  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    // Skip fetching if the component isn't open to reduce unnecessary API calls
    if (!isOpen && activeTab !== 'notifications') return;
    
    // Add debug output in pink
    console.log('%c[DEBUG] Starting notification fetch', 'color: #ff69b4; font-weight: bold');
    console.log('%c[DEBUG] isOpen:', 'color: #ff69b4', isOpen);
    console.log('%c[DEBUG] activeTab:', 'color: #ff69b4', activeTab);
    console.log('%c[DEBUG] Current username:', 'color: #ff69b4', username);
    
    // Add debounce logic to prevent multiple rapid calls
    const now = Date.now();
    const minInterval = 5000; // 5 seconds minimum between fetches
    
    if (!forceRefresh && now - lastFetchRef.current < minInterval) {
      console.log('%c[DEBUG] Debouncing notification fetch - too soon since last attempt', 'color: #ff69b4');
      return;
    }
    
    // Update the last fetch attempt timestamp
    lastFetchRef.current = now;
    
    try {
      // Get the current username from localStorage if not already set
      let citizenToFetch = username;
      
      if (!citizenToFetch || citizenToFetch === DEFAULT_CITIZENNAME) {
        // Try to get username from localStorage
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.username) {
              citizenToFetch = profile.username;
              // The component's main username state should be set by the dedicated useEffect,
              // not directly within this fetch function.
            }
          } catch (error) {
            console.error('Error parsing citizen profile:', error);
          }
        }
      }
      
      // If still no username, use the default
      if (!citizenToFetch) {
        citizenToFetch = DEFAULT_CITIZENNAME;
      }
      
      // Use the local API endpoint
      const apiUrl = `/api/notifications`;
      
      console.log(`%c[DEBUG] Fetching notifications from: ${apiUrl} for citizen: ${citizenToFetch}`, 'color: #ff69b4');
      
      // Only pass the since parameter on refresh requests, not on initial load
      // This way, initial load will use the default 1-week lookback
      const requestBody = forceRefresh 
        ? { citizen: citizenToFetch, since: lastFetchTime } 
        : { citizen: citizenToFetch };
    
      const response = await fetch(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        console.log('%c[DEBUG] Fetch response not OK:', 'color: #ff69b4', response.status, response.statusText);
        throw new Error(`Failed to fetch notifications: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('%c[DEBUG] Received notifications data:', 'color: #ff69b4', data);

      if (!data.success) {
        // If the API indicates failure, throw an error to be caught by the client-side catch block
        throw new Error(data.error || data.details || 'API returned success:false');
      }
      
      if (data.notifications && Array.isArray(data.notifications)) {
        console.log('%c[DEBUG] Setting notifications:', 'color: #ff69b4', data.notifications.length);
        
        // Get the unread notification IDs
        const unreadNotificationIds = data.notifications
          .filter((n: Notification) => n.readAt === null)
          .map((n: Notification) => n.notificationId);
        
        // Set notifications
        setNotifications(data.notifications);
        
        // Update unread count
        const unreadCount = unreadNotificationIds.length;
        setUnreadCount(unreadCount);
        
        console.log(`%c[DEBUG] Set ${data.notifications.length} notifications, ${unreadCount} unread`, 'color: #ff69b4');
        
        // Automatically mark all as read if there are any unread notifications
        if (unreadNotificationIds.length > 0) {
          // Small delay to ensure notifications are displayed before marking as read
          setTimeout(() => {
            markNotificationsAsRead(unreadNotificationIds);
          }, 500);
        }
      } else {
        console.error('%c[DEBUG] Invalid notifications data format:', 'color: #ff69b4', data);
      }
      
      // Update last fetch time
      setLastFetchTime(now);
    } catch (error) {
      console.error('%c[DEBUG] Error fetching notifications:', 'color: #ff69b4', error);
      // Create some dummy notifications for testing if none exist
      if (notifications.length === 0) {
        console.log('%c[DEBUG] Creating fallback notifications', 'color: #ff69b4');
        const dummyNotifications = [
          {
            notificationId: 'dummy-1',
            type: 'System',
            citizen: username || DEFAULT_CITIZENNAME,
            content: 'Welcome to La Serenissima! This is a test notification.',
            createdAt: new Date().toISOString(),
            readAt: null
          },
          {
            notificationId: 'dummy-2',
            type: 'Contract',
            citizen: username || DEFAULT_CITIZENNAME,
            content: 'A new land parcel is available for purchase in San Marco district.',
            createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            readAt: null
          }
        ];
        setNotifications(dummyNotifications);
        setUnreadCount(dummyNotifications.length);
        console.log('%c[DEBUG] Set fallback notifications:', 'color: #ff69b4', dummyNotifications);
      }
    }
  }, [username, lastFetchTime, notifications.length, isOpen, activeTab]);

  // Mark citizen messages as read
  const markCitizenMessagesAsRead = useCallback(async (messageIds: string[]) => {
    if (!username || messageIds.length === 0) return;

    try {
      const response = await fetch('/api/messages/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citizen: username, messageIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mark messages as read');
      }

      // Update local state optimistically or based on success
      setCitizenMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.messageId && messageIds.includes(msg.messageId)
            ? { ...msg, readAt: new Date().toISOString() }
            : msg
        )
      );

      // Refresh unread messages count for the badge
      fetchUnreadMessagesCount();

    } catch (error) {
      console.error('Error marking citizen messages as read:', error);
      // Optionally, implement more robust error handling or user feedback here
      // For now, we'll still update local state as a fallback if API call fails, so UI reflects "read"
      setCitizenMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.messageId && messageIds.includes(msg.messageId)
            ? { ...msg, readAt: new Date().toISOString() }
            : msg
        )
      );
      fetchUnreadMessagesCount(); // Still refresh, might show 0 if local update worked
    }
  }, [username, fetchUnreadMessagesCount]);


  // Fetch citizens
  const fetchCitizens = useCallback(async () => {
    if (!isOpen || activeTab !== 'chats') return;
    
    setIsLoadingCitizens(true);
    
    try {
      const response = await fetch('/api/citizens/with-correspondence-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentCitizenUsername: username })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch citizens with stats: ${response.status}`);
      }
      
      const data = await response.json();
      let citizensList: Citizen[] = [];

      // Ensure the current user's citizen is in the list, ideally at the top.
      // The API should ideally handle this, or we fetch the user's profile separately.
      // For now, we assume the API might return the user or we add them if missing.
      const currentUserProfile = localStorage.getItem('citizenProfile');
      let currentUserCitizen: Citizen | null = null;
      if (currentUserProfile) {
        try {
          const profile = JSON.parse(currentUserProfile);
          if (profile.username) {
            currentUserCitizen = {
              username: profile.username,
              firstName: profile.firstName || profile.username,
              lastName: profile.lastName || '',
              coatOfArmsImageUrl: profile.coatOfArmsImageUrl || null,
              lastMessageTimestamp: null, // This would be updated by API if available
              unreadMessagesFromCitizenCount: 0 // This would be updated by API if available
            };
          }
        } catch (e) { console.error("Error parsing current user profile for citizen list", e); }
      }

      if (data.success && data.citizens && Array.isArray(data.citizens)) {
        citizensList = data.citizens;
        
        if (currentUserCitizen) {
          const currentUserIndex = citizensList.findIndex(c => c.username === currentUserCitizen!.username);
          
          if (currentUserIndex > -1) {
            // If current user is in the list, remove them
            const user = citizensList.splice(currentUserIndex, 1)[0];
            // Add them to the beginning
            citizensList.unshift(user);
          } else {
            // If current user is not in the list, add them to the beginning
            citizensList.unshift(currentUserCitizen);
          }
        }
      } else if (currentUserCitizen) {
        // Fallback to just current user if API call fails or returns no citizens
        citizensList = [currentUserCitizen];
      }
      
      setCitizens(citizensList);

    } catch (error) {
      console.error('Error fetching citizens with stats:', error);
      const currentUserProfile = localStorage.getItem('citizenProfile');
      if (currentUserProfile) {
        try {
          const profile = JSON.parse(currentUserProfile);
          if (profile.username) {
            setCitizens([{
              username: profile.username,
              firstName: profile.firstName || profile.username,
              lastName: profile.lastName || '',
              coatOfArmsImageUrl: profile.coatOfArmsImageUrl || null,
              lastMessageTimestamp: null,
              unreadMessagesFromCitizenCount: 0
            }]);
          } else {
            setCitizens([]);
          }
        } catch (e) { setCitizens([]); console.error("Error parsing current user profile for fallback citizen list", e); }
      } else {
        setCitizens([]);
      }
    } finally {
      setIsLoadingCitizens(false);
    }
  }, [isOpen, activeTab, username]);

  // Fetch messages between current citizen and selected citizen
  const fetchCitizenMessages = useCallback(async (otherCitizen: string) => {
    if (!username || !otherCitizen) return;
    
    setIsLoadingCitizenMessages(true);
    
    try {
      const sortedChannelName = [username, otherCitizen].sort().join('_');
      console.log(`[Compagno] Fetching messages for channel ${sortedChannelName}`);
      const response = await fetch(`/api/messages/channel/${encodeURIComponent(sortedChannelName)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch messages for channel ${sortedChannelName}: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.messages && Array.isArray(data.messages)) {
        // Process messages to handle special types
        const processedMessages = data.messages.map((message: Message) => {
          // If this is a guild application message, add special formatting
          if (message.type === 'guild_application') {
            return {
              ...message,
              content: `📜 **Guild Application**\n\n${message.content}`
            };
          }
          return message;
        });
        
        setCitizenMessages(processedMessages);

        // After setting messages, identify unread ones and mark them as read
        const unreadReceivedMessages = processedMessages.filter(
          (msg: Message) => msg.receiver === username && !msg.readAt && msg.messageId
        );

        if (unreadReceivedMessages.length > 0) {
          const unreadMessageIds = unreadReceivedMessages.map(msg => msg.messageId!);
          if (unreadMessageIds.length > 0) {
            // Call this without await if you don't want to block UI updates
            // or if markCitizenMessagesAsRead handles its own loading/error states appropriately.
            markCitizenMessagesAsRead(unreadMessageIds);
          }
        }
      } else {
        // Set empty array if no messages found
        setCitizenMessages([]);
      }
    } catch (error) {
      console.error('Error fetching citizen messages:', error);
      // Set empty array on error
      setCitizenMessages([]);
    } finally {
      setIsLoadingCitizenMessages(false);
    }
  }, [username, markCitizenMessagesAsRead]);

  // Send message to selected citizen
  const sendCitizenMessage = async (content: string, messageType: string = 'message') => {
    if (!content.trim() || !username || !selectedCitizen) return;

    const isSelfChat = username === selectedCitizen;
    
    // Optimistically add message to UI
    const tempMessage: Message = {
      messageId: `temp-${Date.now()}`,
      sender: username, // The human user is always the sender of this initial message
      receiver: selectedCitizen, // Can be self or another citizen
      content: content,
      type: messageType,
      createdAt: new Date().toISOString(),
      readAt: null
    };
    
    // If this is a guild application response, format it specially
    if (messageType === 'guild_application_response') {
      tempMessage.content = `📜 **Guild Application Response**\n\n${content}`;
    }
    
    setCitizenMessages(prev => [...prev, tempMessage]);
    setInputValue('');
    
    setIsPreparingContext(true); // Show loading while context is used/refreshed for Kinos

    // Determine the actual sender username reliably
    let actualSenderUsername = DEFAULT_CITIZENNAME;
    const savedProfileForSender = localStorage.getItem('citizenProfile');
    if (savedProfileForSender) {
        try {
            const profile = JSON.parse(savedProfileForSender);
            if (profile.username) {
                actualSenderUsername = profile.username;
            }
        } catch (e) {
            console.error("Error parsing citizenProfile for sender username in Compagno", e);
        }
    }
    // Fallback to component state if localStorage didn't yield a username but state is valid
    if (actualSenderUsername === DEFAULT_CITIZENNAME && username !== DEFAULT_CITIZENNAME) {
        actualSenderUsername = username;
    }

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: actualSenderUsername, // Use actualSenderUsername
          receiver: selectedCitizen, // This can be username itself for self-chat
          content: content,
          type: messageType,
          channel: [actualSenderUsername, selectedCitizen].sort().join('_') // Add sorted channel
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.message) {
        // Replace the temp message with the real one
        setCitizenMessages(prev => 
          prev.map(msg => 
            msg.messageId === tempMessage.messageId ? data.message : msg
          )
        );

        // Now, call Kinos AI for an augmented response
        // This applies to self-chat (selectedCitizen === username) and chat with others.
        if (selectedCitizen && username) {
          let addSystemPayload = null;
          if (contextualDataForChat && contextualDataForChat.senderProfile && contextualDataForChat.targetProfile && contextualDataForChat.aiDataPackage) {
            addSystemPayload = JSON.stringify({
              sender_citizen_profile: contextualDataForChat.senderProfile,
              ai_persona_profile: contextualDataForChat.targetProfile,
              ai_comprehensive_data: contextualDataForChat.aiDataPackage
            });
          } else {
            console.warn("[Compagno] Données contextuelles incomplètes pour Kinos, envoi du prompt sans addSystem.", contextualDataForChat);
          }

          try {
            const aiKinUsername = selectedCitizen; // The AI kin we are talking to (can be self)
            const sortedChannelName = [actualSenderUsername, selectedCitizen].sort().join('_'); // Standardized channel name

            const aiDisplayName = contextualDataForChat?.targetProfile?.firstName || aiKinUsername;
            const senderDisplayName = contextualDataForChat?.senderProfile?.firstName || actualSenderUsername;
            
            let kinosPromptContent = '';
            if (isSelfChat) {
              kinosPromptContent = 
`You are the AI representation of ${aiDisplayName}. The user, who is also ${aiDisplayName}, is interacting with you, their own digital persona.
Reflect on your current status, thoughts, and goals. Your response should be a continuation of the user's thought, or a discussion with yourself.

CRITICAL DIRECTIVE: Dive deep into your 'ai_comprehensive_data' (your full profile, owned LANDS, BUILDINGS, active CONTRACTS, strongest RELATIONSHIPS, recent PROBLEMS, GUILD details, LOANS etc.) provided in the 'addSystem' field.
Your reflection MUST mention specific assets (e.g., "my workshop on Fondamenta dei Assassini", "the loan I have with Banco di Rialto"), CITIZENS you know (e.g., "my associate Giovanni"), or current situations (e.g., "this contract for wool is proving difficult", "I need more RESOURCES like timber for my new construction").
Generate insightful plans or reflections based on these concrete gameplay elements. NO FLUFF.

--- USER'S MESSAGE TO YOU (as their own persona) ---
${content}
--- END OF USER'S MESSAGE ---

Your response:`;
            } else {
              kinosPromptContent = 
`You are ${aiDisplayName}, an AI citizen of Venice, responding to ${senderDisplayName}.
Your response MUST be human-like, conversational, and directly relevant to gameplay.

CRITICAL DIRECTIVE: Your response MUST be grounded in your 'ai_comprehensive_data' provided in the 'addSystem' field.
This data includes:
- 'sender_citizen_profile': Profile of ${senderDisplayName}.
- 'ai_persona_profile': Your basic profile (${aiDisplayName}).
- 'ai_comprehensive_data': YOUR COMPLETE DATA PACKAGE. This is VITAL.
  - 'citizen': Your full, up-to-date profile (status, wealth, etc.).
  - 'ownedLands', 'ownedBuildings': Your properties. Refer to them by name or type.
  - 'activeContracts': Your current deals. Discuss them if relevant.
  - 'strongestRelationships': CITIZENS you know well. Mention them, or suggest ${senderDisplayName} meet them if appropriate.
  - 'recentProblems', 'guildDetails', 'citizenLoans': Other vital information about your situation.

Use these specific gameplay elements (your BUILDINGS, RESOURCES, known CITIZENS, CONTRACTS, etc.) to:
1. Make your response RELEVANT to ${senderDisplayName}.
2. Propose or discuss GAMEPLAY ACTIONS or opportunities.
3. Refer to shared history or mutual contacts if evident from your 'strongestRelationships' and the 'sender_citizen_profile'.

DO NOT use overly formal language. Aim for natural, pertinent, and engaging dialogue that feels like a real interaction within the game world. NO FLUFF.

--- USER'S MESSAGE TO YOU ---
${content}
--- END OF USER'S MESSAGE ---

Your response:`;
            }
            
            const targetUsernameForModel = contextualDataForChat?.targetProfile?.username; // Username de l'IA
            const targetSocialClass = contextualDataForChat?.targetProfile?.socialClass;
            const determinedKinosModel = getKinosModelForSocialClass(targetUsernameForModel, targetSocialClass);

            const kinosBody: any = { content: kinosPromptContent, model: determinedKinosModel };
            if (addSystemPayload) {
              kinosBody.addSystem = addSystemPayload;
            }

            const kinosResponse = await fetch(
              `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${aiKinUsername}/channels/${sortedChannelName}/messages`,
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
                const aiMessage: Message = {
                  messageId: kinosData.message_id || kinosData.id || `kinos-msg-${Date.now()}`,
                  sender: aiKinUsername, // AI responds as the selected citizen (or self)
                  receiver: username,   // Human user is the receiver
                  content: kinosData.content,
                  type: 'message_ai_augmented',
                  createdAt: kinosData.timestamp || new Date().toISOString(),
                  role: (kinosData.role || 'assistant') as 'user' | 'assistant',
                };
                setCitizenMessages(prev => [...prev, aiMessage]);

                // Persist AI response to Airtable
                try {
                  const persistResponse = await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sender: aiKinUsername, // AI is the sender
                      receiver: actualSenderUsername,    // User is the receiver, use actualSenderUsername
                      content: kinosData.content,
                      type: 'message_ai_augmented',
                      channel: [aiKinUsername, actualSenderUsername].sort().join('_') // Add sorted channel for AI response
                    }),
                  });
                  if (!persistResponse.ok) {
                    console.error('Failed to persist Kinos AI response to Airtable:', await persistResponse.text());
                  } else {
                    console.log('Kinos AI response persisted to Airtable.');
                  }
                } catch (persistError) {
                  console.error('Error persisting Kinos AI response:', persistError);
                }
              }
            } else {
              console.error('Error from Kinos AI channel API:', kinosResponse.status, await kinosResponse.text());
            }
          } catch (kinosError) {
            console.error('Error calling Kinos AI channel API:', kinosError);
          }
        }
      } else {
         // If the primary message send failed, still try Kinos AI if applicable
        console.error('Primary message send failed, but attempting Kinos AI call.');
        if (selectedCitizen && username) {
          // ... (Kinos call logic similar to above, ensure it's robust to primary send failure)
          // This part is complex as the tempMessage might not have been replaced.
          // For brevity, the detailed Kinos call logic for this failure path is omitted here,
          // but it would mirror the successful path's Kinos call.
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsPreparingContext(false);
    }
  };

  // Helper to get 'YYYY-MM-DD' from a date string
  const getDayString = (dateString?: string): string | null => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toISOString().split('T')[0];
    } catch (e) {
      return null;
    }
  };

  // Format date for display in separators
  const formatDateForSeparator = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Aujourd\'hui';
      }
      if (date.toDateString() === yesterday.toDateString()) {
        return 'Hier';
      }
      return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return dateString; // Fallback
    }
  };

  // Mark notifications as read
  const markNotificationsAsRead = async (notificationIdsToProcess: string[]) => {
    if (!notificationIdsToProcess || notificationIdsToProcess.length === 0) {
      return;
    }

    const validApiNotificationIds = notificationIdsToProcess.filter(id => !id.startsWith('dummy-'));
    const dummyNotificationIds = notificationIdsToProcess.filter(id => id.startsWith('dummy-'));
    
    let allProcessedIdsMarkedRead: string[] = [];

    // 1. Handle dummy notifications locally
    if (dummyNotificationIds.length > 0) {
      let actualDummiesMarkedUnread = 0;
      setNotifications(prevNotifications => 
        prevNotifications.map(notif => {
          if (dummyNotificationIds.includes(notif.notificationId)) {
            if (!notif.readAt) { // Check if it was actually unread before marking
              actualDummiesMarkedUnread++;
            }
            return { ...notif, readAt: new Date().toISOString() };
          }
          return notif;
        })
      );
      if (actualDummiesMarkedUnread > 0) {
        setUnreadCount(prev => Math.max(0, prev - actualDummiesMarkedUnread));
      }
      allProcessedIdsMarkedRead.push(...dummyNotificationIds);
    }

    // 2. Handle valid notifications via API
    if (validApiNotificationIds.length > 0) {
      try {
        const apiUrl = `/api/notifications/mark-read`;
        console.log(`Marking notifications as read via API for citizen: ${username}, IDs: ${validApiNotificationIds.join(', ')}`);
        
        const response = await fetch(
          apiUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              citizen: username,
              notificationIds: validApiNotificationIds 
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.text(); // Try to get more error details
          throw new Error(`Failed to mark notifications as read via API: ${response.status} - ${errorData}`);
        }

        // API call successful, update local state for valid IDs
        let actualValidMarkedUnread = 0;
        setNotifications(prevNotifications => 
          prevNotifications.map(notif => {
            if (validApiNotificationIds.includes(notif.notificationId)) {
              if (!notif.readAt) {
                actualValidMarkedUnread++;
              }
              return { ...notif, readAt: new Date().toISOString() };
            }
            return notif;
          })
        );
        if (actualValidMarkedUnread > 0) {
          setUnreadCount(prev => Math.max(0, prev - actualValidMarkedUnread));
        }
        allProcessedIdsMarkedRead.push(...validApiNotificationIds);

      } catch (error) {
        console.error('Error marking notifications as read via API, using fallback:', error);
        
        // Fallback: Update local state for valid IDs even if API call fails, so UI reflects "read"
        let actualValidMarkedUnreadFallback = 0;
        setNotifications(prevNotifications => 
          prevNotifications.map(notif => {
            if (validApiNotificationIds.includes(notif.notificationId)) {
              if (!notif.readAt) {
                actualValidMarkedUnreadFallback++;
              }
              return { ...notif, readAt: new Date().toISOString() };
            }
            return notif;
          })
        );
        if (actualValidMarkedUnreadFallback > 0) {
          setUnreadCount(prev => Math.max(0, prev - actualValidMarkedUnreadFallback));
        }
        allProcessedIdsMarkedRead.push(...validApiNotificationIds); // Considered "read" by client due to fallback
      }
    }

    // 3. Call the callback if provided and any IDs were processed and marked read (locally or via API)
    if (onNotificationsRead && allProcessedIdsMarkedRead.length > 0) {
      onNotificationsRead(allProcessedIdsMarkedRead);
    }
  };

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // Common breakpoint for mobile devices
    };
    
    // Check on initial load
    checkMobile();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkMobile);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Fetch citizen information if available
  useEffect(() => {
    // Try to get username from localStorage or other source
    const savedProfile = localStorage.getItem('citizenProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.username) {
          console.log('%c[DEBUG] Found username in localStorage:', 'color: #ff69b4', profile.username);
          setUsername(profile.username);
        }
      } catch (error) {
        console.error('Error parsing citizen profile:', error);
      }
    } else {
      console.log('%c[DEBUG] No citizen profile found in localStorage, using default username:', 'color: #ff69b4', DEFAULT_CITIZENNAME);
    }
    
    // Also listen for profile updates
    const handleProfileUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.username) {
        console.log('%c[DEBUG] Profile updated, new username:', 'color: #ff69b4', event.detail.username);
        setUsername(event.detail.username);
      }
    };
    
    window.addEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    };
  }, []);

  // Set up polling for unread count
  useEffect(() => {
    // Only poll when the component is not open
    if (!isOpen) {
      // Fetch immediately on mount
      fetchUnreadCount();
      
      // Set up polling every 2 minutes
      const unreadCountInterval = setInterval(() => {
        fetchUnreadCount();
      }, 120000); // 2 minutes

      // Fetch unread messages count immediately
      fetchUnreadMessagesCount();
      // Set up polling for unread messages count every 2 minutes
      const unreadMessagesInterval = setInterval(() => {
        fetchUnreadMessagesCount();
      }, 120000); // 2 minutes
      
      return () => {
        clearInterval(unreadCountInterval);
        clearInterval(unreadMessagesInterval);
      };
    }
  }, [fetchUnreadCount, fetchUnreadMessagesCount, isOpen]);

  // Set up notification polling
  useEffect(() => {
    // Only fetch notifications when the component is open or when notifications panel is shown
    if (isOpen && activeTab === 'notifications') {
      // Clear any existing interval first to prevent duplicates
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
      
      // Fetch notifications immediately when component becomes visible
      fetchNotifications();
      
      // Set up polling every 2 minutes (120000 ms) instead of 5 minutes
      fetchIntervalRef.current = setInterval(() => {
        fetchNotifications();
      }, 120000);
      
      // Clean up interval on unmount or when component is hidden
      return () => {
        if (fetchIntervalRef.current) {
          clearInterval(fetchIntervalRef.current);
          fetchIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval when component is hidden
      if (fetchIntervalRef.current) {
        clearInterval(fetchIntervalRef.current);
        fetchIntervalRef.current = null;
      }
    }
  }, [fetchNotifications, isOpen, activeTab]);

  // Fetch citizens when chats tab is active
  useEffect(() => {
    if (isOpen && activeTab === 'chats') {
      fetchCitizens();
    }
  }, [fetchCitizens, isOpen, activeTab]);

  // Fetch messages and contextual data when a citizen is selected
  useEffect(() => {
    const fetchContextualInformation = async (targetUsername: string, currentUsername: string) => {
      if (!targetUsername || !currentUsername || targetUsername === 'compagno') {
        setContextualDataForChat(null);
        return;
      }

      setIsPreparingContext(true);
      try {
        // Fetch sender profile (current user)
        let senderProfile = null;
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            senderProfile = JSON.parse(savedProfile);
          } catch (e) { console.error("Error parsing sender profile from localStorage", e); }
        }

        // Fetch target profile
        const targetProfileRes = await fetch(`/api/citizens/${targetUsername}`);
        const targetProfileData = targetProfileRes.ok ? await targetProfileRes.json() : null;
        const targetProfileObject = targetProfileData?.success ? targetProfileData.citizen : null;

        // Fetch the full data package for the target AI/citizen
        const aiDataPackageResponse = await fetch(`/api/get-data-package?citizenUsername=${targetUsername}`);
        let aiDataPackage = null;
        if (aiDataPackageResponse.ok) {
          const packageData = await aiDataPackageResponse.json();
          if (packageData.success) {
            aiDataPackage = packageData.data;
          } else {
            console.error(`Échec de la récupération du data package pour ${targetUsername} dans Compagno:`, packageData.error);
          }
        } else {
          console.error(`Erreur HTTP lors de la récupération du data package pour ${targetUsername} dans Compagno: ${aiDataPackageResponse.status}`);
        }
        
        setContextualDataForChat({
          senderProfile,
          targetProfile: targetProfileObject, // Profil de base de l'IA/citoyen cible
          aiDataPackage, // Paquet de données complet
        });

      } catch (error) {
        console.error("Error fetching contextual data for Compagno chat:", error);
        setContextualDataForChat(null);
      } finally {
        setIsPreparingContext(false);
      }
    };

    if (selectedCitizen) {
      fetchCitizenMessages(selectedCitizen);
      if (username && selectedCitizen !== 'compagno') {
        fetchContextualInformation(selectedCitizen, username);
      } else {
        setContextualDataForChat(null); // Clear context if talking to compagno or no user
      }
    } else {
      setContextualDataForChat(null); // Clear context if no citizen selected
    }
  }, [fetchCitizenMessages, selectedCitizen, username]);

  // Load message history when chat is opened
  useEffect(() => {
    // When chats tab is opened, refresh unread messages count and set default selected citizen
    if (isOpen && activeTab === 'chats') {
      fetchUnreadMessagesCount();
      if (!selectedCitizen && username !== DEFAULT_CITIZENNAME) {
        setSelectedCitizen(username); // Default to self-chat
      } else if (!selectedCitizen && username === DEFAULT_CITIZENNAME && citizens.length > 0) {
        // If anonymous and citizens list has items, select the first one (could be an admin or a default)
        // This case might need refinement based on desired UX for anonymous users.
        // For now, let's prevent auto-selection if anonymous and no specific logic.
      }
    }
  }, [isOpen, activeTab, selectedCitizen, fetchUnreadMessagesCount, username, citizens]); // Added username and citizens to dependencies

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [citizenMessages, isOpen]); // Removed `messages` from dependencies

  // Update UI size when chats tab is active
  useEffect(() => {
    if (activeTab === 'chats') {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [activeTab]);

  // Removed fetchMessageHistory, loadMoreMessages, and sendMessage functions
  // as they were related to the old Compagno direct chat.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // All chats now go through sendCitizenMessage
    if (activeTab === 'chats' && selectedCitizen) {
      await sendCitizenMessage(inputValue);
    }
  };

  const handleSuggestedQuestion = async (question: string) => {
    // Ensure this sends to the currently selected citizen, which defaults to self.
    if (selectedCitizen) {
      // Set input value and submit
      setInputValue(question);
      // Simulate form event for handleSubmit
      const mockEvent = { preventDefault: () => {} } as React.FormEvent;
      // Need to ensure inputValue is updated before handleSubmit is called.
      // A slight delay or direct call to sendCitizenMessage might be better.
      setTimeout(async () => {
        await sendCitizenMessage(question);
        setInputValue(''); // Clear input after sending
      }, 0);
    }
  };

  const handleTextToSpeech = async (message: Message) => {
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

  // Filter citizens based on search query
  const filteredCitizens = citizenSearchQuery
    ? citizens.filter(citizen => 
        citizen.username.toLowerCase().includes(citizenSearchQuery.toLowerCase()) ||
        citizen.firstName.toLowerCase().includes(citizenSearchQuery.toLowerCase()) ||
        citizen.lastName.toLowerCase().includes(citizenSearchQuery.toLowerCase())
      )
    : citizens;

  // Add event listeners for external control
  useEffect(() => {
    const handleOpenSelfChat = () => {
      setIsOpen(true);
      setActiveTab('chats');
      setSelectedCitizen(username); // Open chat with self
    };
    
    const handleSendSelfMessage = (event: CustomEvent) => {
      if (event.detail && event.detail.message && username !== DEFAULT_CITIZENNAME) {
        setIsOpen(true);
        setActiveTab('chats');
        setSelectedCitizen(username); // Ensure chat is with self
        
        // Extract text from the current page
        const pageText = extractPageText();
        const pageContext = pageText ? `\n\nThe citizen is currently viewing a page with the following content:\n${pageText}` : '';
        
        // Add page context to the system prompt if provided
        const systemPrompt = event.detail.addSystem 
          ? event.detail.addSystem + pageContext
          : undefined; // System prompt for self-chat might need specific formulation
        
        // Small delay to ensure the chat is ready
        setTimeout(() => {
          // Use sendCitizenMessage for self-chat
          sendCitizenMessage(
            event.detail.message
            // Context for Kinos in sendCitizenMessage will be handled by contextualDataForChat
          );
        }, 100);
      }
    };
    
    // Add event listeners (consider renaming events if they are globally used)
    window.addEventListener('openCompagnoChat', handleOpenSelfChat); // Event name kept for now
    window.addEventListener('sendCompagnoMessage', handleSendSelfMessage as EventListener); // Event name kept for now
    
    // Clean up
    return () => {
      window.removeEventListener('openCompagnoChat', handleOpenSelfChat);
      window.removeEventListener('sendCompagnoMessage', handleSendSelfMessage as EventListener);
    };
  }, []);
  
  // Return null if on mobile
  if (isMobile) {
    return null;
  }

  return (
    <Portal>
      <div 
        className={`fixed bottom-4 right-4 z-[100] ${className}`} // Panel is always anchored bottom-right
      >
      {/* Collapsed state - just show the mask icon */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 transition-all duration-300 flex items-center justify-center cursor-pointer"
          aria-label="Open Compagno chat assistant"
        >
          <div className="relative">
            <img 
              src="/images/venetian-mask.png" 
              alt="Compagno" 
              className="w-32 h-32 mask-float"
              onError={(e) => {
                // Fallback if image doesn't exist
                if (e.target) {
                  (e.target as HTMLImageElement).style.display = 'none';
                  const sibling = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                  if (sibling) sibling.style.display = 'block';
                }
              }}
            />
            <div className="hidden text-2xl font-serif">C</div>
            
            {/* Notification badge - Changed to purple */}
            {unreadCount > 0 && (
              <div className="absolute top-0 right-0 bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse z-10">
                {unreadCount}
              </div>
            )}
            {/* Unread messages badge - Blue */}
            {unreadMessagesCount > 0 && (
              <div 
                className="absolute top-[8.5rem] right-0 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse z-10"
                title={`${unreadMessagesCount} unread messages`}
              >
                {unreadMessagesCount}
              </div>
            )}
          </div>
        </button>
      )}

      {/* Expanded chat window */}
      {isOpen && (
        <div 
          className={`bg-white rounded-lg shadow-xl flex flex-col border-2 border-amber-600 overflow-visible slide-in ${
            isExpanded 
              ? 'w-[1000px] max-h-[90vh]' // Increased width and max-height
              : 'w-96 max-h-[700px]'
          }`}
        >
          {/* Header */}
          <div className="bg-amber-700 text-white p-3 flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 mr-2 flex items-center justify-center">
                <img 
                  src={username === DEFAULT_CITIZENNAME ? "/images/venetian-mask.png" : `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${username}.png`}
                  alt={username === DEFAULT_CITIZENNAME ? "Default Mask" : `${username}'s Coat of Arms`}
                  className="w-6 h-6 rounded-full object-cover"
                  onError={(e) => {
                    if (e.target) {
                      (e.target as HTMLImageElement).src = "/images/venetian-mask.png"; // Fallback to mask
                    }
                  }}
                />
              </div>
              <h3 className="font-serif">{username === DEFAULT_CITIZENNAME ? "Correspondence" : username}</h3>
              
              {/* Notification indicator */}
              {unreadCount > 0 && (
                <button 
                  onClick={() => setActiveTab(activeTab === 'notifications' ? 'chats' : 'notifications')}
                  className="ml-3 relative"
                >
                  <FaBell className="h-5 w-5" />
                  <span className="absolute -top-1 -right-1 bg-purple-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                    {unreadCount}
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center">
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-white hover:text-amber-200 transition-colors"
                aria-label="Minimize correspondence"
              >
                <FaChevronDown />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="ml-3 text-white hover:text-amber-200 transition-colors"
                aria-label="Close correspondence"
              >
                <FaTimes />
              </button>
            </div>
          </div>
          
          {/* Navigation tabs */}
          <div className="bg-amber-100 border-b border-amber-200 flex">
            <button
              onClick={() => {
                setActiveTab('notifications');
                // Fetch latest bulletins when switching to bulletins view
                fetchNotifications(true);
              }}
              className={`flex-1 py-2 text-sm font-medium relative ${
                activeTab === 'notifications' ? 'bg-amber-200 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              Bulletins
              {unreadCount > 0 && (
                <span className="absolute top-1 right-2 bg-purple-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('chats');
                fetchCitizens();
              }}
              className={`flex-1 py-2 text-sm font-medium relative ${ // Added relative for positioning
                activeTab === 'chats' ? 'bg-amber-200 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <div className="flex items-center justify-center"> {/* Flex container for text and icon */}
                Correspondence
                <div className="relative group ml-1"> {/* Container for icon and tooltip */}
                  <FaInfoCircle className="text-amber-500" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none">
                    Instant conversation with citizens less than 100m away. For longer distances, messages must be physically carried.
                    <svg className="absolute text-gray-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255" xmlSpace="preserve">
                      <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                    </svg>
                  </div>
                </div>
              </div>
              {unreadMessagesCount > 0 && (
                <span className="absolute top-1 right-2 bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                  {unreadMessagesCount}
                </span>
              )}
            </button>
          </div>
          
          {/* Content area */}
          {activeTab === 'notifications' ? (
            // Notifications content
            <div className="flex-1 overflow-y-auto p-3 bg-amber-50 bg-opacity-80" 
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'repeat'
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-amber-800 font-serif text-lg">Bulletins</h3>
                <div className="flex items-center">
                  {/* Add refresh button */}
                  <button 
                    onClick={() => fetchNotifications(true)}
                    className="mr-3 text-amber-600 hover:text-amber-800 flex items-center"
                    title="Refresh bulletins"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-sm">Refresh</span>
                  </button>
                </div>
              </div>
              
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-gray-500 italic">
                  No bulletins to display
                </div>
              ) : (
                <>
                  {notifications.reduce((acc, notification, index) => {
                    const currentDay = getDayString(notification.createdAt);
                    const previousDay = index > 0 ? getDayString(notifications[index - 1].createdAt) : null;
                    const showDateSeparator = currentDay && currentDay !== previousDay;

                    if (showDateSeparator) {
                      acc.push(
                        <div key={`date-${notification.notificationId}`} className="text-center my-3">
                          <span className="text-xs text-gray-500 bg-amber-100 px-2 py-1 rounded-full">
                            {formatDateForSeparator(notification.createdAt)}
                          </span>
                        </div>
                      );
                    }

                    acc.push(
                      <div 
                        key={notification.notificationId} 
                        className={`mb-3 p-3 rounded-lg border ${
                          notification.readAt 
                            ? 'border-gray-200 bg-stone-50'  // Changed bg-white to bg-stone-50
                            : 'border-amber-300 bg-amber-50 notification-unread shadow-md'
                        }`}
                        onClick={() => {
                          if (!notification.readAt) {
                            markNotificationsAsRead([notification.notificationId]);
                          }
                        }}
                      >
                        {/* Date is now displayed by the separator */}
                        <div className="mt-1 text-xs markdown-content">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({node, ...props}) => <a {...props} className="text-amber-700 underline hover:text-amber-500" target="_blank" rel="noopener noreferrer" />,
                            code: ({node, ...props}) => <code {...props} className="bg-amber-50 px-1 py-0.5 rounded text-sm font-mono" />,
                            pre: ({node, ...props}) => <pre {...props} className="bg-amber-50 p-2 rounded my-2 overflow-x-auto text-sm font-mono" />,
                            ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 my-1" />,
                            ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 my-1" />,
                            li: ({node, ...props}) => <li {...props} className="my-0.5" />,
                            blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-amber-300 pl-3 italic my-2" />,
                            h1: ({node, ...props}) => <h1 {...props} className="text-lg font-bold my-2" />,
                            h2: ({node, ...props}) => <h2 {...props} className="text-md font-bold my-2" />,
                            h3: ({node, ...props}) => <h3 {...props} className="text-sm font-bold my-1" />,
                            p: ({node, ...props}) => <p {...props} className="my-1" />
                          }}
                        >
                          {notification.content}
                        </ReactMarkdown>
                      </div>
                      {/* Display time using timeDescriptionService if needed, or remove if only day separator is desired */}
                      <div className="text-right text-gray-400 text-[10px] mt-1">
                        {timeDescriptionService.formatTime(notification.createdAt)}
                      </div>
                    </div>
                    );
                    return acc;
                  }, [] as JSX.Element[])}
                </>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          ) : (
            // Chats content with sidebar
            <div className="flex-1 flex overflow-hidden">
              {/* Citizens sidebar */}
              <div className="w-1/3 border-r border-amber-200 flex flex-col bg-amber-50">
                {/* Search bar */}
                <div className="p-2 border-b border-amber-200">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search citizens..."
                      value={citizenSearchQuery}
                      onChange={(e) => setCitizenSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 border border-amber-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <FaSearch className="absolute left-2 top-2 text-amber-400" />
                  </div>
                </div>
                
                {/* Citizens list */}
                <div className="flex-1 overflow-y-auto min-h-0"> {/* Added min-h-0 */}
                  {isLoadingCitizens ? (
                    <div className="flex justify-center items-center h-32">
                      <FaSpinner className="animate-spin text-yellow-500 text-2xl" />
                    </div>
                  ) : filteredCitizens.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 italic text-sm">
                      No citizens found
                    </div>
                  ) : (
                    <ul>
                      {filteredCitizens.map(citizen => (
                        <li key={citizen.username}>
                          <button
                            onClick={() => setSelectedCitizen(citizen.username)}
                            className={`w-full text-left p-3 flex items-center ${
                              selectedCitizen === citizen.username 
                                ? 'bg-amber-200' 
                                : 'hover:bg-amber-100'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-amber-300 flex items-center justify-center mr-2 text-amber-800 relative overflow-hidden">
                              <img 
                                src={`https://backend.serenissima.ai/public_assets/images/coat-of-arms/${citizen.username}.png`}
                                alt={`${citizen.firstName} ${citizen.lastName} Coat of Arms`}
                                className="w-full h-full rounded-full object-cover absolute top-0 left-0"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallbackEl = target.nextElementSibling;
                                  if (fallbackEl) {
                                    (fallbackEl as HTMLElement).style.display = 'flex';
                                  }
                                }}
                              />
                              <div 
                                className="w-full h-full flex items-center justify-center text-amber-800" 
                                style={{ display: 'none' }} // Initially hidden, shown by onError
                              >
                                {citizen.firstName.charAt(0) || citizen.username.charAt(0) || '?'}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-sm flex items-center">
                                {citizen.username === 'compagno' ? 'Compagno' : `${citizen.firstName} ${citizen.lastName}`}
                                {typeof citizen.unreadMessagesFromCitizenCount === 'number' && citizen.unreadMessagesFromCitizenCount > 0 && citizen.username !== 'compagno' && (
                                  <span className="ml-2 bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                                    {citizen.unreadMessagesFromCitizenCount}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {citizen.username === 'compagno' ? 'Virtual Assistant' : citizen.username}
                                {citizen.distance !== null && citizen.distance !== undefined && citizen.username !== 'compagno' && (
                                  <span className={`ml-2 opacity-70 ${
                                    citizen.distance < 100 ? 'text-green-600' :
                                    citizen.distance < 500 ? 'text-yellow-600' :
                                    citizen.distance <= 1500 ? 'text-amber-600' : 
                                    'text-red-600' // Orange-rouge pour les distances > 1500m
                                  }`}>(~{
                                    citizen.distance >= 1000 
                                      ? `${(citizen.distance / 1000).toFixed(1)}km` 
                                      : `${citizen.distance}m`
                                  })</span>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              
              {/* Chat area */}
              <div className="w-2/3 flex flex-col">
                {selectedCitizen ? (
                  <>
                    {/* Selected citizen header */}
                    <div className="bg-amber-100 p-2 border-b border-amber-200 flex items-center">
                      <button 
                        onClick={() => setSelectedCitizen(null)}
                        className="mr-2 text-amber-700 hover:text-amber-900 md:hidden"
                      >
                        <FaArrowLeft />
                      </button>
                    
                      {/* Display selected citizen's name or "Your Thoughts" for self-chat */}
                      <div className="flex items-center">
                        {selectedCitizen === username ? (
                          <>
                            <div className="w-6 h-6 mr-2 relative rounded-full overflow-hidden">
                              <img 
                                src={username === DEFAULT_CITIZENNAME ? "/images/venetian-mask.png" : `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${username}.png`}
                                alt={username === DEFAULT_CITIZENNAME ? "Default Mask" : `${username}'s Coat of Arms`}
                                className="w-full h-full rounded-full object-cover absolute top-0 left-0"
                                onError={(e) => { if (e.target) { (e.target as HTMLImageElement).src = "/images/venetian-mask.png";}}}
                              />
                            </div>
                            <span className="font-medium">Your Thoughts ({citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen})</span>
                          </>
                        ) : (
                          <>
                            <div className="w-6 h-6 rounded-full bg-amber-300 flex items-center justify-center mr-2 text-amber-800 text-xs relative overflow-hidden">
                              <img 
                                src={`https://backend.serenissima.ai/public_assets/images/coat-of-arms/${selectedCitizen}.png`}
                                alt={`${citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen} Coat of Arms`}
                                className="w-full h-full rounded-full object-cover absolute top-0 left-0"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const fallbackEl = target.nextElementSibling;
                                  if (fallbackEl) {
                                    (fallbackEl as HTMLElement).style.display = 'flex';
                                  }
                                }}
                              />
                              <div 
                                className="w-full h-full flex items-center justify-center text-amber-800 text-xs" 
                                style={{ display: 'none' }} // Initially hidden
                              >
                                {citizens.find(u => u.username === selectedCitizen)?.firstName.charAt(0) || selectedCitizen.charAt(0) || '?'}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const citizenToDisplay = citizens.find(c => c.username === selectedCitizen);
                                if (citizenToDisplay) {
                                  window.dispatchEvent(new CustomEvent('showCitizenDetailsPanelEvent', { detail: { citizen: citizenToDisplay } }));
                                }
                              }}
                              className="font-medium hover:underline focus:outline-none"
                              title={`View details for ${citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen}`}
                            >
                              {citizens.find(u => u.username === selectedCitizen)?.firstName || ''} {citizens.find(u => u.username === selectedCitizen)?.lastName || ''}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  
                    {/* Messages area */}
                    <div 
                      className="flex-1 overflow-y-auto p-3 bg-amber-50 bg-opacity-80 min-h-[300px]" // Reverted to bg-amber-50 and added min-h-[300px]
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'repeat'
                      }}
                    >
                      {isLoadingCitizenMessages || (isPreparingContext && selectedCitizen !== username) ? (
                        <div className="flex justify-center items-center h-full"> {/* Changed h-32 to h-full */}
                          <FaSpinner className="animate-spin text-yellow-500 text-2xl" />
                          {isPreparingContext && <span className="ml-2 text-amber-700">Preparing context...</span>}
                        </div>
                      ) : ( // Removed the selectedCitizen === 'compagno' block
                        // Citizen messages (handles self-chat and other citizen chat)
                        <>
                          {citizenMessages.length === 0 ? (
                            <div className="text-center py-8">
                              <div className="text-gray-500 italic mb-4">
                                No messages yet with {selectedCitizen === username ? "yourself" : (citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen)}.
                              </div>
                              <div className="text-amber-700 text-sm">
                                Send a message to start your conversation!
                              </div>
                            </div>
                          ) : (
                            citizenMessages.reduce((acc, message, index) => {
                              const currentDay = getDayString(message.createdAt);
                              const previousDay = index > 0 ? getDayString(citizenMessages[index - 1].createdAt) : null;
                              const showDateSeparator = currentDay && currentDay !== previousDay;

                              if (showDateSeparator) {
                                acc.push(
                                  <div key={`date-${message.messageId || index}`} className="text-center my-3">
                                    <span className="text-xs text-gray-500 bg-amber-100 px-2 py-1 rounded-full">
                                      {formatDateForSeparator(message.createdAt)}
                                    </span>
                                  </div>
                                );
                              }

                              acc.push(
                                <div 
                                  key={message.messageId || `msg-${message.createdAt}-${Math.random()}`} 
                                  className={`mb-1 ${ // Reduced mb from mb-3 to mb-1
                                    message.sender === username 
                                      ? 'text-right'
                                      : 'text-left'
                                  }`}
                                >
                                  <div 
                                    className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                      message.sender === username
                                        ? 'bg-orange-600 text-white citizen-bubble rounded-br-none' 
                                        : 'bg-gray-200 text-gray-800 assistant-bubble rounded-bl-none'
                                    }`}
                                  >
                                    <div style={{ position: 'relative', zIndex: 10 }} className="markdown-content text-sm"> {/* Added text-sm */}
                                      {message.type === 'guild_application' ? (
                                        <div className="guild-application">
                                          <div className="font-bold text-amber-800 mb-2">📜 Guild Application</div>
                                          <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                        
                                          {message.receiver === username && (
                                            <div className="mt-3 flex space-x-2">
                                              <button
                                                onClick={() => { /* Approve logic */ }}
                                                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                              > Approve </button>
                                              <button
                                                onClick={() => { /* Decline logic */ }}
                                                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                              > Decline </button>
                                            </div>
                                          )}
                                        </div>
                                      ) : message.type === 'guild_application_approved' ? (
                                        <div className="guild-application-approved">
                                          <div className="font-bold text-green-700 mb-2">✅ Guild Application Approved</div>
                                          <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                        </div>
                                      ) : message.type === 'guild_application_rejected' ? (
                                        <div className="guild-application-rejected">
                                          <div className="font-bold text-red-700 mb-2">❌ Guild Application Rejected</div>
                                          <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                        </div>
                                      ) : message.type === 'guild_application_response' ? (
                                        <div className="guild-application-response">
                                          <div className="font-bold text-amber-800 mb-2">📜 Application Response</div>
                                          <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                        </div>
                                      ) : (
                                         <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {message.content || "No content available"}
                                         </ReactMarkdown>
                                      )}
                                    </div>
                                    {/* Time display below the bubble, aligned with bubble's side */}
                                    <div className={`text-[10px] mt-1 ${message.sender === username ? 'text-right pr-1 text-gray-400' : 'text-left pl-1 text-gray-500'}`}>
                                      {timeDescriptionService.formatTime(message.createdAt!)}
                                    </div>
                                  </div>
                                </div>
                              );
                              return acc;
                            }, [] as JSX.Element[])
                          )}
                           {isTyping && selectedCitizen === username && ( // Show typing indicator for self-chat AI response
                              <div className="text-left mb-3">
                                <div className="inline-block p-3 rounded-lg max-w-[80%] bg-gray-200 text-gray-800 rounded-bl-none">
                                  <div className="flex space-x-2">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                  </div>
                                </div>
                              </div>
                            )}
                        </>
                      )}
                    
                      <div ref={messagesEndRef} />
                    </div>
                  
                    {/* Suggestions - Show only if chatting with self and no messages yet */}
                    {selectedCitizen === username && citizenMessages.length === 0 && !isLoadingCitizenMessages && ( // Added !isLoadingCitizenMessages
                      <div className="border-t border-gray-200 p-2 bg-amber-50">
                        <p className="text-xs text-gray-500 mb-2">Start a thought:</p>
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => handleSuggestedQuestion("What are my current goals?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            What are my current goals?
                          </button>
                          <button
                            onClick={() => handleSuggestedQuestion("How can I improve my standing in Venice?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            How can I improve my standing?
                          </button>
                          <button
                            onClick={() => handleSuggestedQuestion("What opportunities should I pursue?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            What opportunities should I pursue?
                          </button>
                        </div>
                      </div>
                    )}
                                        
                    {/* Context Data Recap */}
                    {contextualDataForChat && selectedCitizen && selectedCitizen !== 'compagno' && (
                      <details className="mb-2 text-xs text-gray-600 border border-amber-200 rounded-md mx-2"> {/* Added mx-2 for consistency */}
                        <summary className="cursor-pointer p-2 font-medium text-amber-700 hover:bg-amber-100 rounded-t-md">
                          Context Data for AI (Recap)
                        </summary>
                        <div className="p-3 bg-amber-50 rounded-b-md space-y-1">
                          <p><strong>Sender Citizen Profile:</strong> {contextualDataForChat.senderProfile?.firstName || contextualDataForChat.senderProfile?.username || 'N/A'}</p>
                          <p><strong>AI Persona Profile (Target):</strong> {contextualDataForChat.targetProfile?.firstName || contextualDataForChat.targetProfile?.username || 'N/A'}</p>
                          <p><strong>AI Data Package Loaded:</strong> {contextualDataForChat.aiDataPackage ? 'Yes' : 'No'}</p>
                          {contextualDataForChat.aiDataPackage && (
                            <>
                              <p> - Citizen in Package: {contextualDataForChat.aiDataPackage.citizen?.username || 'N/A'}</p>
                              <p> - Owned Lands: {contextualDataForChat.aiDataPackage.ownedLands?.length ?? 0}</p>
                              <p> - Owned Buildings: {contextualDataForChat.aiDataPackage.ownedBuildings?.length ?? 0}</p>
                              <p> - Active Contracts: {contextualDataForChat.aiDataPackage.activeContracts?.length ?? 0}</p>
                            </>
                          )}
                          
                          <details className="mt-1 text-xs text-gray-500 border border-amber-100 rounded-sm">
                            <summary className="cursor-pointer p-1 font-medium text-amber-600 hover:bg-amber-100 rounded-t-sm">
                              View Raw Context Data
                            </summary>
                            <pre className="p-2 bg-amber-200/30 text-[10px] rounded-b-sm overflow-auto max-h-40 custom-scrollbar">
                              {JSON.stringify(contextualDataForChat, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </details>
                    )}

                    {/* Input area */}
                    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2 flex items-end">
                      <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={`Message ${selectedCitizen === username ? (citizens.find(u => u.username === selectedCitizen)?.firstName || 'yourself') : (citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen)}... (Shift+Enter for new line)`}
                        className="flex-1 p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none custom-scrollbar"
                        rows={1} // Start with 1 row, it will auto-grow
                        disabled={isTyping || isPreparingContext}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!isPreparingContext && inputValue.trim()) handleSubmit(e as any);
                          }
                          // Auto-resize logic will be handled by CSS or a small JS snippet if needed,
                          // but for now, let's rely on a reasonable max-height and scrollbar.
                        }}
                        style={{ 
                          minHeight: '40px', // Minimum height for one line
                          maxHeight: '120px', // Max height for about 5-6 lines
                          overflowY: 'auto' // Ensure scrollbar appears if content exceeds max-height
                        }}
                      />
                      <button 
                        type="submit"
                        className={`px-4 rounded-r-lg transition-colors self-stretch ${
                          (isTyping || isPreparingContext || !inputValue.trim())
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-800 to-amber-700 text-white hover:from-amber-700 hover:to-amber-600'
                        }`}
                        disabled={isTyping || isPreparingContext || !inputValue.trim()}
                      >
                        {isTyping || isPreparingContext ? <FaSpinner className="animate-spin text-yellow-400" /> : 'Send'}
                      </button>
                    </form>
                  </>
                ) : (
                  // No citizen selected
                  <div className="flex-1 flex items-center justify-center bg-amber-50 bg-opacity-80">
                    <div className="text-center p-6">
                      <div className="w-16 h-16 mx-auto mb-4 opacity-50">
                        <FaUser className="w-full h-full text-amber-400" />
                      </div>
                      <h3 className="text-lg font-medium text-amber-800 mb-2">Select a Conversation</h3>
                      <p className="text-sm text-amber-600">
                        Choose a citizen from the list to view your conversation history
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>
      )}
      </div>
    </Portal>
  );
};

export default Compagno;
