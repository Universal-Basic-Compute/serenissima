"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { FaTimes, FaChevronDown, FaSpinner, FaVolumeUp, FaVolumeMute, FaBell, FaUser, FaSearch, FaArrowLeft } from 'react-icons/fa';
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

const KINOS_BACKEND_BASE_URL = 'https://api.kinos-engine.ai/v2'; // For Compagno direct chat
const BLUEPRINT = 'compagno'; // For Compagno direct chat
const KINOS_API_CHANNEL_BASE_URL = 'https://api.kinos-engine.ai/v2'; // For citizen-to-citizen AI augmented chat
const KINOS_CHANNEL_BLUEPRINT = 'serenissima-ai';
const DEFAULT_CITIZENNAME = 'visitor'; // Default username for anonymous citizens

const Compagno: React.FC<CompagnoProps> = ({ className, onNotificationsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
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
  const [selectedCitizen, setSelectedCitizen] = useState<string | null>(null);
  const [citizenMessages, setCitizenMessages] = useState<Message[]>([]);
  const [isLoadingCitizenMessages, setIsLoadingCitizenMessages] = useState<boolean>(false);
  const [citizenSearchQuery, setCitizenSearchQuery] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isPreparingContext, setIsPreparingContext] = useState<boolean>(false);

  // State for contextual data for Kinos addSystem
  const [contextualDataForChat, setContextualDataForChat] = useState<{
    senderProfile: any | null;
    targetProfile: any | null;
    relationship: any | null;
    targetNotifications: any[] | null;
    relevancies: any[] | null;
    problems: any[] | null;
  } | null>(null);
  

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
      // Always add Compagno as the first citizen
      citizensList.push({
        username: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImageUrl: null,
        // Compagno specific stats can be null or defaults as they are handled differently
        lastMessageTimestamp: null, 
        unreadMessagesFromCitizenCount: 0 
      });

      if (data.success && data.citizens && Array.isArray(data.citizens)) {
        // Append other citizens fetched from API
        citizensList = [...citizensList, ...data.citizens];
      }
      
      setCitizens(citizensList);

    } catch (error) {
      console.error('Error fetching citizens with stats:', error);
      // Fallback to just Compagno if there's an error
      setCitizens([{
        username: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImageUrl: null,
        lastMessageTimestamp: null,
        unreadMessagesFromCitizenCount: 0
      }]);
    } finally {
      setIsLoadingCitizens(false);
    }
  }, [isOpen, activeTab, username]);

  // Fetch messages between current citizen and selected citizen
  const fetchCitizenMessages = useCallback(async (otherCitizen: string) => {
    if (!username || !otherCitizen) return;
    
    setIsLoadingCitizenMessages(true);
    
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentCitizen: username,
          otherCitizen: otherCitizen
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
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
    
    // Optimistically add message to UI
    const tempMessage: Message = {
      messageId: `temp-${Date.now()}`,
      sender: username,
      receiver: selectedCitizen,
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
    
    // For citizen-to-citizen, Kinos call requires context. For compagno, it's simpler.
    if (selectedCitizen && selectedCitizen !== 'compagno') {
      setIsPreparingContext(true); // Show loading while context is used/refreshed
    }

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: username,
          receiver: selectedCitizen,
          content: content,
          type: messageType
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

        // Now, call Kinos AI for an augmented response if not talking to 'compagno'
        if (selectedCitizen && selectedCitizen !== 'compagno' && username) {
          // Construct addSystem payload
          let addSystemPayload = null;
          if (contextualDataForChat) {
            const systemContext = {
              ai_citizen_profile: contextualDataForChat.targetProfile,
              sender_citizen_profile: contextualDataForChat.senderProfile,
              relationship_with_sender: contextualDataForChat.relationship,
              recent_notifications_for_ai: contextualDataForChat.targetNotifications,
              recent_relevancies_ai_to_sender: contextualDataForChat.relevancies,
              recent_problems_involving_ai_or_sender: contextualDataForChat.problems
            };
            addSystemPayload = JSON.stringify(systemContext);
          }

          try {
            const aiDisplayName = contextualDataForChat?.targetProfile?.firstName || selectedCitizen || 'Citizen';
            const senderDisplayName = contextualDataForChat?.senderProfile?.firstName || username || 'User';
            
            const kinosPromptContent = 
`You are ${aiDisplayName}, an AI citizen of Venice. You are responding to a message from ${senderDisplayName}.
IMPORTANT: Your response MUST be VERY SHORT, human-like, and conversational.
DO NOT use formal language, DO NOT write long paragraphs, DO NOT include any fluff or boilerplate.
Be direct, natural, and concise. Imagine you're sending a quick, informal message.

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

Remember: Your reply MUST be VERY SHORT, human-like, conversational, RELEVANT to ${senderDisplayName} using the context, and FOCUSED ON GAMEPLAY. NO FLUFF. Just a natural, brief, and pertinent response.
Your response:`;

            const kinosBody: any = { content: kinosPromptContent };
            if (addSystemPayload) {
              kinosBody.addSystem = addSystemPayload;
            }

            const kinosResponse = await fetch(
              `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${selectedCitizen}/channels/${username}/messages`,
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
              // Use message_id from Kinos if id is not present, and ensure content exists
              if ((kinosData.message_id || kinosData.id) && kinosData.content) {
                const aiMessage: Message = {
                  messageId: kinosData.message_id || kinosData.id || `kinos-msg-${Date.now()}`,
                  sender: selectedCitizen, // AI responds as the target citizen
                  receiver: username,
                  content: kinosData.content,
                  type: 'message_ai_augmented', // Custom type for AI augmented message
                  createdAt: kinosData.timestamp || new Date().toISOString(),
                  role: (kinosData.role || 'assistant') as 'user' | 'assistant',
                };
                setCitizenMessages(prev => [...prev, aiMessage]);

                // Persist AI response to Airtable via our backend
                try {
                  const persistResponse = await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sender: selectedCitizen, // AI is the sender
                      receiver: username,     // User is the receiver
                      content: kinosData.content,
                      type: 'message_ai_augmented' // Consistent type
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
        // This part might need adjustment based on desired behavior on primary send failure
        console.error('Primary message send failed, but attempting Kinos AI call.');
         if (selectedCitizen && selectedCitizen !== 'compagno' && username) {
          // Construct addSystem payload (similar to above)
          let addSystemPayload = null;
          if (contextualDataForChat) {
             const systemContext = {
              ai_citizen_profile: contextualDataForChat.targetProfile,
              sender_citizen_profile: contextualDataForChat.senderProfile,
              relationship_with_sender: contextualDataForChat.relationship,
              recent_notifications_for_ai: contextualDataForChat.targetNotifications,
              recent_relevancies_ai_to_sender: contextualDataForChat.relevancies,
              recent_problems_involving_ai_or_sender: contextualDataForChat.problems
            };
            addSystemPayload = JSON.stringify(systemContext);
          }

          try {
            const aiDisplayName = contextualDataForChat?.targetProfile?.firstName || selectedCitizen || 'Citizen';
            const senderDisplayName = contextualDataForChat?.senderProfile?.firstName || username || 'User';

            const kinosPromptContent = 
`You are ${aiDisplayName}, an AI citizen of Venice. You are responding to a message from ${senderDisplayName}.
IMPORTANT: Your response MUST be VERY SHORT, human-like, and conversational.
DO NOT use formal language, DO NOT write long paragraphs, DO NOT include any fluff or boilerplate.
Be direct, natural, and concise. Imagine you're sending a quick, informal message.

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

Remember: Your reply MUST be VERY SHORT, human-like, conversational, RELEVANT to ${senderDisplayName} using the context, and FOCUSED ON GAMEPLAY. NO FLUFF. Just a natural, brief, and pertinent response.
Your response:`;
            
            const kinosBody: any = { content: kinosPromptContent };
            if (addSystemPayload) {
              kinosBody.addSystem = addSystemPayload;
            }
            
            const kinosResponse = await fetch(
              `${KINOS_API_CHANNEL_BASE_URL}/blueprints/${KINOS_CHANNEL_BLUEPRINT}/kins/${selectedCitizen}/channels/${username}/messages`,
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
                  sender: selectedCitizen,
                  receiver: username,
                  content: kinosData.content,
                  type: 'message_ai_augmented',
                  createdAt: kinosData.timestamp || new Date().toISOString(),
                  role: (kinosData.role || 'assistant') as 'user' | 'assistant',
                };
                // Add AI message even if primary failed, but after the temp user message
                setCitizenMessages(prev => {
                    // Ensure tempMessage is still there if primary send failed before it was replaced
                    const userMsgIndex = prev.findIndex(m => m.messageId === tempMessage.messageId);
                    if (userMsgIndex !== -1) {
                        return [...prev, aiMessage];
                    }
                    // If tempMessage somehow got removed, add it back then AI message
                    return [tempMessage, ...prev.filter(m => m.messageId !== tempMessage.messageId), aiMessage];
                });

                // Persist AI response to Airtable via our backend
                try {
                  const persistResponse = await fetch('/api/messages/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      sender: selectedCitizen, // AI is the sender
                      receiver: username,     // User is the receiver
                      content: kinosData.content,
                      type: 'message_ai_augmented'
                    }),
                  });
                  if (!persistResponse.ok) {
                    console.error('Failed to persist Kinos AI response (after primary send failure) to Airtable:', await persistResponse.text());
                  } else {
                    console.log('Kinos AI response (after primary send failure) persisted to Airtable.');
                  }
                } catch (persistError) {
                  console.error('Error persisting Kinos AI response (after primary send failure):', persistError);
                }
              }
            } else {
              console.error('Error from Kinos AI channel API (after primary send failure):', kinosResponse.status, await kinosResponse.text());
            }
          } catch (kinosError) {
            console.error('Error calling Kinos AI channel API (after primary send failure):', kinosError);
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Keep the temp message in the UI
      // Optionally, inform the user that the main message might not have been sent
    } finally {
      if (selectedCitizen && selectedCitizen !== 'compagno') {
        setIsPreparingContext(false);
      }
    }
  };

  // Format date to be more readable and immersive
  const formatNotificationDate = (dateString: string): JSX.Element => {
    try {
      // Use the message ID or timestamp as an additional seed for variety
      const seed = dateString; // You could also use a message ID if available
      const formattedDate = timeDescriptionService.formatDate(dateString, seed);
      
      // Return a JSX element with updated styling - grey, serif, and extra small
      return (
        <span className="text-gray-500 font-serif text-[10px]">
          {formattedDate}
        </span>
      );
    } catch (error) {
      console.error('Error formatting date:', error);
      return <span className="text-gray-500 font-serif text-[10px]">{dateString}</span>;
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
        const targetProfile = targetProfileData?.success ? targetProfileData.citizen : null;

        // Fetch relationship
        let relationship = null;
        if (currentUsername !== targetUsername) {
          const relRes = await fetch(`/api/relationships?citizen1=${currentUsername}&citizen2=${targetUsername}`);
          const relData = relRes.ok ? await relRes.json() : null;
          relationship = relData?.success ? relData.relationship : null;
        } else {
          relationship = { strengthScore: 100, type: "Self" };
        }

        // Fetch target notifications
        const notifRes = await fetch(`/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citizen: targetUsername, limit: 10 }), // Limit notifications for context
        });
        const notifData = notifRes.ok ? await notifRes.json() : null;
        const targetNotifications = notifData?.success ? notifData.notifications : [];
        
        // Fetch relevancies (target is relevantTo, sender is targetCitizen)
        const relevanciesRes = await fetch(`/api/relevancies?relevantToCitizen=${targetUsername}&targetCitizen=${currentUsername}&limit=10`);
        const relevanciesData = relevanciesRes.ok ? await relevanciesRes.json() : null;
        const relevancies = relevanciesData?.success ? relevanciesData.relevancies : [];

        // Fetch problems for target and sender
        let problems = [];
        const problemsTargetRes = await fetch(`/api/problems?citizen=${targetUsername}&status=active&limit=5`);
        const problemsTargetData = problemsTargetRes.ok ? await problemsTargetRes.json() : null;
        if (problemsTargetData?.success && problemsTargetData.problems) {
          problems.push(...problemsTargetData.problems);
        }
        if (currentUsername !== targetUsername) {
          const problemsSenderRes = await fetch(`/api/problems?citizen=${currentUsername}&status=active&limit=5`);
          const problemsSenderData = problemsSenderRes.ok ? await problemsSenderRes.json() : null;
          if (problemsSenderData?.success && problemsSenderData.problems) {
            // Avoid duplicates
            problemsSenderData.problems.forEach(p => {
              if (!problems.find(existing => existing.problemId === p.problemId)) {
                problems.push(p);
              }
            });
          }
        }
        
        setContextualDataForChat({
          senderProfile,
          targetProfile,
          relationship,
          targetNotifications,
          relevancies,
          problems,
        });

      } catch (error) {
        console.error("Error fetching contextual data for chat:", error);
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
    if (isOpen && activeTab === 'chats' && selectedCitizen === 'compagno') {
      fetchMessageHistory();
    }
    // When chats tab is opened, refresh unread messages count
    if (isOpen && activeTab === 'chats') {
      fetchUnreadMessagesCount();
    }
  }, [isOpen, activeTab, selectedCitizen, fetchUnreadMessagesCount]);

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, citizenMessages, isOpen]);

  // Update UI size when chats tab is active
  useEffect(() => {
    if (activeTab === 'chats') {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [activeTab]);

  const fetchMessageHistory = async (offset = 0) => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `${KINOS_BACKEND_BASE_URL}/blueprints/${BLUEPRINT}/kins/${username}/messages?limit=25&offset=${offset}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch message history: ${response.status}`);
      }

      const data = await response.json();
      
      if (offset === 0) {
        // First page of results
        setMessages(data.messages || []);
      } else {
        // Append to existing messages for pagination
        setMessages(prev => [...prev, ...(data.messages || [])]);
      }
      
      setPagination(data.pagination || null);
    } catch (error) {
      console.error('Error fetching message history:', error);
      // If we can't fetch history, start with a welcome message
      if (offset === 0) {
        setMessages([
          {
            id: 'welcome',
            role: 'assistant',
            content: "Buongiorno! I am Compagno, your guide to La Serenissima. How may I assist you today?",
            timestamp: new Date().toISOString()
          }
        ]);
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const loadMoreMessages = () => {
    if (pagination && pagination.has_more) {
      fetchMessageHistory(pagination.offset + pagination.limit);
    }
  };

  const sendMessage = async (content: string, additionalSystemPrompt?: string, addContext?: string, images?: string[]) => {
    if (!content.trim()) return;
    
    // Optimistically add citizen message to UI
    const citizenMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, citizenMessage]);
    setInputValue('');
    setIsTyping(true);
    
    try {
      // Default system prompt
      const defaultSystemPrompt = "You are Compagno, a Venetian guide in La Serenissima, a digital recreation of Renaissance Venice. Respond in a friendly, helpful manner with a slight Venetian flair. Your knowledge includes Venice's history, the game's mechanics, and how to navigate the digital city. Always be helpful and concise.";
      
      // Extract text from the current page
      const pageText = extractPageText();
      const pageContext = pageText ? `\n\nThe citizen is currently viewing a page with the following content:\n${pageText}` : '';
      
      // Use the additional system prompt if provided, otherwise use the default
      // Add the page context to the system prompt
      const systemPrompt = (additionalSystemPrompt || defaultSystemPrompt) + pageContext;
      
      // Prepare request body
      const requestBody: any = {
        content: content,
        mode: 'creative',
        addSystem: systemPrompt
      };
      
      // Add optional parameters if provided
      if (addContext) {
        requestBody.addContext = addContext;
      }
      
      if (images && images.length > 0) {
        requestBody.images = images;
      }
      
      const response = await fetch(
        `${KINOS_BACKEND_BASE_URL}/blueprints/${BLUEPRINT}/kins/${username}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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
        timestamp: data.timestamp
      }]);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add a fallback response if the API call fails
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Forgive me, but I seem to be unable to respond at the moment. The Council of Ten may be reviewing our conversation. Please try again later.",
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (activeTab === 'chats' && selectedCitizen && selectedCitizen !== 'compagno') {
      await sendCitizenMessage(inputValue);
    } else if (activeTab === 'chats' && selectedCitizen === 'compagno') {
      await sendMessage(inputValue);
    }
  };

  const handleSuggestedQuestion = async (question: string) => {
    await sendMessage(question);
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
    const handleOpenCompagnoChat = () => {
      setIsOpen(true);
      setActiveTab('chats');
      setSelectedCitizen('compagno');
    };
    
    const handleSendCompagnoMessage = (event: CustomEvent) => {
      if (event.detail && event.detail.message) {
        setIsOpen(true);
        setActiveTab('chats');
        setSelectedCitizen('compagno');
        
        // Extract text from the current page
        const pageText = extractPageText();
        const pageContext = pageText ? `\n\nThe citizen is currently viewing a page with the following content:\n${pageText}` : '';
        
        // Add page context to the system prompt if provided
        const systemPrompt = event.detail.addSystem 
          ? event.detail.addSystem + pageContext
          : undefined;
        
        // Small delay to ensure the chat is ready
        setTimeout(() => {
          sendMessage(
            event.detail.message, 
            systemPrompt,
            event.detail.addContext,
            event.detail.images
          );
        }, 100);
      }
    };
    
    // Add event listeners
    window.addEventListener('openCompagnoChat', handleOpenCompagnoChat);
    window.addEventListener('sendCompagnoMessage', handleSendCompagnoMessage as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('openCompagnoChat', handleOpenCompagnoChat);
      window.removeEventListener('sendCompagnoMessage', handleSendCompagnoMessage as EventListener);
    };
  }, []);
  
  // Return null if on mobile
  if (isMobile) {
    return null;
  }

  return (
    <Portal>
      <div 
        className={`fixed bottom-4 right-4 z-[100] ${className}`}
      >
      {/* Collapsed state - just show the mask icon */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 transition-all duration-300 flex items-center justify-center"
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
                className="absolute top-7 right-0 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse z-10"
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
          className={`bg-white rounded-lg shadow-xl flex flex-col border-2 border-amber-600 overflow-hidden slide-in ${
            isExpanded 
              ? 'w-[800px] max-h-[80vh]' 
              : 'w-96 max-h-[700px]'
          }`}
        >
          {/* Header */}
          <div className="bg-amber-700 text-white p-3 flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-8 h-8 mr-2 flex items-center justify-center">
                <img 
                  src="/images/venetian-mask.png" 
                  alt="" 
                  className="w-6 h-6 mask-float"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    if (e.target) {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const sibling = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                      if (sibling) sibling.style.display = 'block';
                    }
                  }}
                />
                <div className="hidden text-xl font-serif">C</div>
              </div>
              <h3 className="font-serif">Compagno</h3>
              
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
              className={`flex-1 py-2 text-sm font-medium ${
                activeTab === 'chats' ? 'bg-amber-200 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              Correspondence
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
                  {notifications.map((notification) => (
                    <div 
                      key={notification.notificationId} 
                      className={`mb-3 p-3 rounded-lg border ${
                        notification.readAt 
                          ? 'border-gray-200 bg-white' 
                          : 'border-amber-300 bg-amber-50 notification-unread shadow-md'
                      }`}
                      onClick={() => {
                        if (!notification.readAt) {
                          markNotificationsAsRead([notification.notificationId]);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          {formatNotificationDate(notification.createdAt)}
                        </div>
                      </div>
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
                    </div>
                  ))}
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
                <div className="flex-1 overflow-y-auto">
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
                            <div className="w-8 h-8 rounded-full bg-amber-300 flex items-center justify-center mr-2 text-amber-800">
                              {citizen.coatOfArmsImageUrl ? (
                                <img 
                                  src={citizen.coatOfArmsImageUrl} 
                                  alt="" 
                                  className="w-8 h-8 rounded-full object-cover"
                                  onError={(e) => {
                                    if (e.target) {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      const nextSibling = (e.target as HTMLImageElement).nextElementSibling;
                                      if (nextSibling) {
                                        (nextSibling as HTMLElement).style.display = 'flex';
                                      }
                                    }
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-amber-300 flex items-center justify-center text-amber-800">
                                  {citizen.firstName.charAt(0)}
                                </div>
                              )}
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
                      
                      {selectedCitizen === 'compagno' ? (
                        <div className="flex items-center">
                          <div className="w-6 h-6 mr-2">
                            <img 
                              src="/images/venetian-mask.png" 
                              alt="" 
                              className="w-6 h-6"
                              onError={(e) => {
                                if (e.target) {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }
                              }}
                            />
                          </div>
                          <span className="font-medium">Compagno</span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-amber-300 flex items-center justify-center mr-2 text-amber-800 text-xs">
                            {citizens.find(u => u.username === selectedCitizen)?.firstName.charAt(0) || '?'}
                          </div>
                          <span className="font-medium">
                            {citizens.find(u => u.username === selectedCitizen)?.firstName || ''} {citizens.find(u => u.username === selectedCitizen)?.lastName || ''}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Messages area */}
                    <div 
                      className="flex-1 overflow-y-auto p-3 bg-amber-50 bg-opacity-80"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'repeat'
                      }}
                    >
                      {isLoadingCitizenMessages ? (
                        <div className="flex justify-center items-center h-32">
                          <FaSpinner className="animate-spin text-yellow-500 text-2xl" />
                        </div>
                      ) : selectedCitizen === 'compagno' ? (
                        // Compagno messages
                        <>
                          {/* Load more button */}
                          {pagination && pagination.has_more && (
                            <div className="text-center mb-4">
                              <button
                                onClick={loadMoreMessages}
                                disabled={isLoadingHistory}
                                className="px-3 py-1 text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-full border border-yellow-200 transition-colors"
                              >
                                {isLoadingHistory ? (
                                  <span className="flex items-center justify-center">
                                    <FaSpinner className="animate-spin mr-2 text-yellow-600" />
                                    Loading...
                                  </span>
                                ) : (
                                  'Load earlier messages'
                                )}
                              </button>
                            </div>
                          )}
                          
                          {/* Messages */}
                          {messages.map((message, index) => (
                            <div 
                              key={message.id || `msg-${index}`} 
                              className={`mb-3 ${
                                message.role === 'user' 
                                  ? 'text-right' 
                                  : 'text-left'
                              }`}
                            >
                              <div 
                                className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                  message.role === 'user'
                                    ? 'bg-orange-600 text-white citizen-bubble rounded-br-none' // Darker orange
                                    : 'bg-gray-200 text-gray-800 assistant-bubble rounded-bl-none'
                                }`}
                              >
                                <div className="markdown-content relative z-10">
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
                                    {message.content || "No content available"}
                                  </ReactMarkdown>
                                </div>
                                
                                {/* Only show voice button for assistant messages */}
                                {message.role === 'assistant' && (
                                  <button
                                    onClick={() => handleTextToSpeech(message)}
                                    className="mt-1 text-amber-700 hover:text-amber-500 transition-colors float-right voice-button"
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
                            <div className="text-left mb-3">
                              <div className="inline-block p-3 rounded-lg max-w-[80%] bg-yellow-500 text-white rounded-bl-none"> {/* Changed container to yellow, or keep gray/amber */}
                                <div className="flex space-x-2">
                                  <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                  <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                  <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        // Citizen messages
                        <>
                          {citizenMessages.length === 0 ? (
                            <div className="text-center py-8">
                              <div className="text-gray-500 italic mb-4">
                                No messages yet with {citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen}.
                              </div>
                              <div className="text-amber-700 text-sm">
                                Send a message to start your conversation!
                              </div>
                            </div>
                          ) : (
                            citizenMessages.map((message) => (
                              <div 
                                key={message.messageId} 
                                className={`mb-3 ${
                                  message.sender === username 
                                    ? 'text-right' 
                                    : 'text-left'
                                }`}
                              >
                                <div 
                                  className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                    message.sender === username
                                      ? 'bg-orange-600 text-white citizen-bubble rounded-br-none' // Darker orange
                                      : 'bg-gray-200 text-gray-800 assistant-bubble rounded-bl-none'
                                  }`}
                                >
                                  <div style={{ position: 'relative', zIndex: 10 }}>
                                    {message.type === 'guild_application' ? (
                                      <div className="guild-application">
                                        <div className="font-bold text-amber-800 mb-2">📜 Guild Application</div>
                                        <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                        
                                        {/* Add response buttons for guild masters */}
                                        {message.receiver === username && (
                                          <div className="mt-3 flex space-x-2">
                                            <button
                                              onClick={() => {
                                                const response = prompt("Enter your response to this application:");
                                                if (response) {
                                                  // Send a response message
                                                  sendCitizenMessage(response, 'guild_application_response');
                                                  
                                                  // Update the application message type to 'approved'
                                                  fetch('/api/messages/update', {
                                                    method: 'POST',
                                                    headers: {
                                                      'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({
                                                      messageId: message.messageId,
                                                      type: 'guild_application_approved'
                                                    })
                                                  }).catch(err => console.error('Error updating message type:', err));
                                                  
                                                  // Update the citizen's guild status
                                                  fetch('/api/citizens/update-guild', {
                                                    method: 'POST',
                                                    headers: {
                                                      'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({
                                                      username: message.sender,
                                                      guildId: message.receiver,
                                                      status: 'approved'
                                                    })
                                                  }).catch(err => console.error('Error updating citizen guild status:', err));
                                                }
                                              }}
                                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                            >
                                              Approve
                                            </button>
                                            <button
                                              onClick={() => {
                                                const response = prompt("Enter your reason for declining this application:");
                                                if (response) {
                                                  // Send a response message
                                                  sendCitizenMessage(response, 'guild_application_response');
                                                  
                                                  // Update the application message type to 'rejected'
                                                  fetch('/api/messages/update', {
                                                    method: 'POST',
                                                    headers: {
                                                      'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({
                                                      messageId: message.messageId,
                                                      type: 'guild_application_rejected'
                                                    })
                                                  }).catch(err => console.error('Error updating message type:', err));
                                                  
                                                  // Update the citizen's guild status
                                                  fetch('/api/citizens/update-guild', {
                                                    method: 'POST',
                                                    headers: {
                                                      'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({
                                                      username: message.sender,
                                                      guildId: null,
                                                      status: 'rejected'
                                                    })
                                                  }).catch(err => console.error('Error updating citizen guild status:', err));
                                                }
                                              }}
                                              className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                                            >
                                              Decline
                                            </button>
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
                                      <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                    )}
                                  </div>
                                  <div className="text-xs mt-1" style={{ position: 'relative', zIndex: 10 }}>
                                    {formatNotificationDate(message.createdAt)}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </>
                      )}
                      
                      <div ref={messagesEndRef} />
                    </div>
                    
                    {/* Suggestions */}
                    {selectedCitizen === 'compagno' && messages.length <= 1 && (
                      <div className="border-t border-gray-200 p-2 bg-amber-50">
                        <p className="text-xs text-gray-500 mb-2">Suggested questions:</p>
                        <div className="flex flex-wrap gap-1">
                          <button
                            onClick={() => handleSuggestedQuestion("How do I purchase land?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            How do I purchase land?
                          </button>
                          <button
                            onClick={() => handleSuggestedQuestion("What are $COMPUTE tokens?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            What are $COMPUTE tokens?
                          </button>
                          <button
                            onClick={() => handleSuggestedQuestion("How do I build structures?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            How do I build structures?
                          </button>
                          <button
                            onClick={() => handleSuggestedQuestion("Tell me about the guilds of Venice")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            Tell me about the guilds of Venice
                          </button>
                          <button
                            onClick={() => handleSuggestedQuestion("How do I adjust my settings?")}
                            className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 px-3 py-1.5 rounded-full border border-amber-300 transition-colors shadow-sm"
                          >
                            How do I adjust my settings?
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Input area */}
                    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2 flex items-end">
                      <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={`Message ${selectedCitizen === 'compagno' ? 'Compagno' : citizens.find(u => u.username === selectedCitizen)?.firstName || selectedCitizen}... (Shift + Enter for new line)`}
                        className="flex-1 p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                        rows={1}
                        disabled={isTyping || isPreparingContext || !inputValue.trim()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!isPreparingContext) handleSubmit(e as any); // Cast to any for form event type
                          }
                        }}
                        style={{ minHeight: '40px', maxHeight: '120px' }}
                      />
                      <button 
                        type="submit"
                        className={`px-4 rounded-r-lg transition-colors self-stretch ${
                          isTyping || isPreparingContext || !inputValue.trim()
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
