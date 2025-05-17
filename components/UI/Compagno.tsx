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
  citizenname: string;
  firstName: string;
  lastName: string;
  coatOfArmsImage: string | null;
}

interface Message {
  id?: string;
  messageId?: string;
  role?: 'citizen' | 'assistant';
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

const KINOS_BACKEND_BASE_URL = 'https://api.kinos-engine.ai/v2';
const BLUEPRINT = 'compagno';
const DEFAULT_CITIZENNAME = 'visitor'; // Default citizenname for anonymous citizens

const Compagno: React.FC<CompagnoProps> = ({ className, onNotificationsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [citizenname, setCitizenname] = useState<string>(DEFAULT_CITIZENNAME);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
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
  

  // Fetch notifications
  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    // Skip fetching if the component isn't open to reduce unnecessary API calls
    if (!isOpen && activeTab !== 'notifications') return;
    
    // Add debug output in pink
    console.log('%c[DEBUG] Starting notification fetch', 'color: #ff69b4; font-weight: bold');
    console.log('%c[DEBUG] isOpen:', 'color: #ff69b4', isOpen);
    console.log('%c[DEBUG] activeTab:', 'color: #ff69b4', activeTab);
    console.log('%c[DEBUG] Current citizenname:', 'color: #ff69b4', citizenname);
    
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
      // Get the current citizenname from localStorage if not already set
      let citizenToFetch = citizenname;
      
      if (!citizenToFetch || citizenToFetch === DEFAULT_CITIZENNAME) {
        // Try to get citizenname from localStorage
        const savedProfile = localStorage.getItem('citizenProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.citizenname) {
              citizenToFetch = profile.citizenname;
              // Update the component state
              setCitizenname(profile.citizenname);
            }
          } catch (error) {
            console.error('Error parsing citizen profile:', error);
          }
        }
      }
      
      // If still no citizenname, use the default
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
      
      if (data.success && data.notifications && Array.isArray(data.notifications)) {
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
            citizen: citizenname || DEFAULT_CITIZENNAME,
            content: 'Welcome to La Serenissima! This is a test notification.',
            createdAt: new Date().toISOString(),
            readAt: null
          },
          {
            notificationId: 'dummy-2',
            type: 'Market',
            citizen: citizenname || DEFAULT_CITIZENNAME,
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
  }, [citizenname, lastFetchTime, notifications.length, isOpen, activeTab]);

  // Fetch citizens
  const fetchCitizens = useCallback(async () => {
    if (!isOpen || activeTab !== 'chats') return;
    
    setIsLoadingCitizens(true);
    
    try {
      const response = await fetch('/api/citizens');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch citizens: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.citizens && Array.isArray(data.citizens)) {
        // Add Compagno as the first citizen if not already present
        const compagnoExists = data.citizens.some((citizen: Citizen) => citizen.citizenname === 'compagno');
        
        let citizensList = [...data.citizens];
        
        if (!compagnoExists) {
          citizensList.unshift({
            citizenname: 'compagno',
            firstName: 'Compagno',
            lastName: 'Bot',
            coatOfArmsImage: null
          });
        }
        
        setCitizens(citizensList);
      } else {
        // If no citizens returned but request was successful, just ensure Compagno is available
        setCitizens([{
          citizenname: 'compagno',
          firstName: 'Compagno',
          lastName: 'Bot',
          coatOfArmsImage: null
        }]);
      }
    } catch (error) {
      console.error('Error fetching citizens:', error);
      
      // Just ensure Compagno is available when there's an error
      setCitizens([{
        citizenname: 'compagno',
        firstName: 'Compagno',
        lastName: 'Bot',
        coatOfArmsImage: null
      }]);
    } finally {
      setIsLoadingCitizens(false);
    }
  }, [isOpen, activeTab]);

  // Fetch messages between current citizen and selected citizen
  const fetchCitizenMessages = useCallback(async (otherCitizen: string) => {
    if (!citizenname || !otherCitizen) return;
    
    setIsLoadingCitizenMessages(true);
    
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentCitizen: citizenname,
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
  }, [citizenname]);

  // Send message to selected citizen
  const sendCitizenMessage = async (content: string, messageType: string = 'message') => {
    if (!content.trim() || !citizenname || !selectedCitizen) return;
    
    // Optimistically add message to UI
    const tempMessage: Message = {
      messageId: `temp-${Date.now()}`,
      sender: citizenname,
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
    
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: citizenname,
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
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Keep the temp message in the UI
    }
  };

  // Format date to be more readable and immersive
  const formatNotificationDate = (dateString: string): JSX.Element => {
    try {
      // Use the message ID or timestamp as an additional seed for variety
      const seed = dateString; // You could also use a message ID if available
      const formattedDate = timeDescriptionService.formatDate(dateString, seed);
      
      // Return a JSX element with styling
      return (
        <span className="time-description">{formattedDate}</span>
      );
    } catch (error) {
      console.error('Error formatting date:', error);
      return <span>{dateString}</span>;
    }
  };

  // Mark notifications as read
  const markNotificationsAsRead = async (notificationIds: string[]) => {
    try {
      const apiUrl = `/api/notifications/mark-read`;
      
      console.log(`Marking notifications as read at: ${apiUrl}`);
      
      const response = await fetch(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            citizen: citizenname,
            notificationIds
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to mark notifications as read: ${response.status}`);
      }

      // Update local state
      setNotifications(prev => 
        prev.map(notif => 
          notificationIds.includes(notif.notificationId) 
            ? { ...notif, readAt: new Date().toISOString() } 
            : notif
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - notificationIds.length));
      
      // Call the callback if provided
      if (onNotificationsRead) {
        onNotificationsRead(notificationIds);
      }
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      
      // Fallback: Update local state even if the API call fails
      setNotifications(prev => 
        prev.map(notif => 
          notificationIds.includes(notif.notificationId) 
            ? { ...notif, readAt: new Date().toISOString() } 
            : notif
        )
      );
      
      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - notificationIds.length));
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
    // Try to get citizenname from localStorage or other source
    const savedProfile = localStorage.getItem('citizenProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.citizenname) {
          console.log('%c[DEBUG] Found citizenname in localStorage:', 'color: #ff69b4', profile.citizenname);
          setCitizenname(profile.citizenname);
        }
      } catch (error) {
        console.error('Error parsing citizen profile:', error);
      }
    } else {
      console.log('%c[DEBUG] No citizen profile found in localStorage, using default citizenname:', 'color: #ff69b4', DEFAULT_CITIZENNAME);
    }
    
    // Also listen for profile updates
    const handleProfileUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.citizenname) {
        console.log('%c[DEBUG] Profile updated, new citizenname:', 'color: #ff69b4', event.detail.citizenname);
        setCitizenname(event.detail.citizenname);
      }
    };
    
    window.addEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdate as EventListener);
    };
  }, []);

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

  // Fetch messages when a citizen is selected
  useEffect(() => {
    if (selectedCitizen) {
      fetchCitizenMessages(selectedCitizen);
    }
  }, [fetchCitizenMessages, selectedCitizen]);

  // Load message history when chat is opened
  useEffect(() => {
    if (isOpen && activeTab === 'chats' && selectedCitizen === 'compagno') {
      fetchMessageHistory();
    }
  }, [isOpen, activeTab, selectedCitizen]);

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
        `${KINOS_BACKEND_BASE_URL}/blueprints/${BLUEPRINT}/kins/${citizenname}/messages?limit=25&offset=${offset}`,
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
      role: 'citizen',
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
        model: 'claude-3-7-sonnet-latest',
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
        `${KINOS_BACKEND_BASE_URL}/blueprints/${BLUEPRINT}/kins/${citizenname}/messages`,
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
        citizen.citizenname.toLowerCase().includes(citizenSearchQuery.toLowerCase()) ||
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
            
            {/* Notification badge */}
            {unreadCount > 0 && (
              <div className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse">
                {unreadCount}
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
              ? 'w-[800px] max-h-[700px]' 
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
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
                    {unreadCount}
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center">
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-white hover:text-amber-200 transition-colors"
                aria-label="Minimize chat"
              >
                <FaChevronDown />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="ml-3 text-white hover:text-amber-200 transition-colors"
                aria-label="Close chat"
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
                // Fetch latest notifications when switching to notifications view
                fetchNotifications(true);
              }}
              className={`flex-1 py-2 text-sm font-medium relative ${
                activeTab === 'notifications' ? 'bg-amber-200 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              Notifications
              {unreadCount > 0 && (
                <span className="absolute top-1 right-2 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">
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
              Chats
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
                <h3 className="text-amber-800 font-serif text-lg">Notifications</h3>
                <div className="flex items-center">
                  {/* Add refresh button */}
                  <button 
                    onClick={() => fetchNotifications(true)}
                    className="mr-3 text-amber-600 hover:text-amber-800 flex items-center"
                    title="Refresh notifications"
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
                  No notifications to display
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
                        <div className="text-xs">
                          {formatNotificationDate(notification.createdAt)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs">{notification.content}</div>
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
                      <FaSpinner className="animate-spin text-amber-600 text-2xl" />
                    </div>
                  ) : filteredCitizens.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 italic text-sm">
                      No citizens found
                    </div>
                  ) : (
                    <ul>
                      {filteredCitizens.map(citizen => (
                        <li key={citizen.citizenname}>
                          <button
                            onClick={() => setSelectedCitizen(citizen.citizenname)}
                            className={`w-full text-left p-3 flex items-center ${
                              selectedCitizen === citizen.citizenname 
                                ? 'bg-amber-200' 
                                : 'hover:bg-amber-100'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-full bg-amber-300 flex items-center justify-center mr-2 text-amber-800">
                              {citizen.coatOfArmsImage ? (
                                <img 
                                  src={citizen.coatOfArmsImage} 
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
                              <div className="font-medium text-sm">
                                {citizen.citizenname === 'compagno' ? 'Compagno' : `${citizen.firstName} ${citizen.lastName}`}
                              </div>
                              <div className="text-xs text-gray-500">
                                {citizen.citizenname === 'compagno' ? 'Virtual Assistant' : citizen.citizenname}
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
                            {citizens.find(u => u.citizenname === selectedCitizen)?.firstName.charAt(0) || '?'}
                          </div>
                          <span className="font-medium">
                            {citizens.find(u => u.citizenname === selectedCitizen)?.firstName || ''} {citizens.find(u => u.citizenname === selectedCitizen)?.lastName || ''}
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
                          <FaSpinner className="animate-spin text-amber-600 text-2xl" />
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
                                className="px-3 py-1 text-sm bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-full border border-amber-200 transition-colors"
                              >
                                {isLoadingHistory ? (
                                  <span className="flex items-center justify-center">
                                    <FaSpinner className="animate-spin mr-2" />
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
                                message.role === 'citizen' 
                                  ? 'text-right' 
                                  : 'text-left'
                              }`}
                            >
                              <div 
                                className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                  message.role === 'citizen'
                                    ? 'citizen-bubble rounded-br-none'
                                    : 'assistant-bubble rounded-bl-none'
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
                              <div className="inline-block p-3 rounded-lg max-w-[80%] typing-indicator rounded-bl-none">
                                <div className="flex space-x-2">
                                  <div className="typing-dot animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                  <div className="typing-dot animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                  <div className="typing-dot animate-bounce" style={{ animationDelay: '300ms' }}></div>
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
                                No messages yet with {citizens.find(u => u.citizenname === selectedCitizen)?.firstName || selectedCitizen}.
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
                                  message.sender === citizenname 
                                    ? 'text-right' 
                                    : 'text-left'
                                }`}
                              >
                                <div 
                                  className={`inline-block p-3 rounded-lg max-w-[80%] ${
                                    message.sender === citizenname
                                      ? 'citizen-bubble rounded-br-none'
                                      : 'assistant-bubble rounded-bl-none'
                                  }`}
                                >
                                  <div style={{ position: 'relative', zIndex: 10 }}>
                                    {message.type === 'guild_application' ? (
                                      <div className="guild-application">
                                        <div className="font-bold text-amber-800 mb-2">📜 Guild Application</div>
                                        <div className="whitespace-pre-wrap">{message.content || "No content available"}</div>
                                        
                                        {/* Add response buttons for guild masters */}
                                        {message.receiver === citizenname && (
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
                                                      citizenname: message.sender,
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
                                                      citizenname: message.sender,
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
                    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2 flex">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={`Message ${selectedCitizen === 'compagno' ? 'Compagno' : citizens.find(u => u.citizenname === selectedCitizen)?.firstName || selectedCitizen}...`}
                        className="flex-1 p-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                        disabled={isTyping}
                      />
                      <button 
                        type="submit"
                        className={`px-4 rounded-r-lg transition-colors ${
                          isTyping || !inputValue.trim()
                            ? 'bg-gray-400 text-white cursor-not-allowed'
                            : 'bg-gradient-to-r from-amber-800 to-amber-700 text-white hover:from-amber-700 hover:to-amber-600'
                        }`}
                        disabled={isTyping || !inputValue.trim()}
                      >
                        {isTyping ? <FaSpinner className="animate-spin" /> : 'Send'}
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
