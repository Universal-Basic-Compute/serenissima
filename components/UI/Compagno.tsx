import { useState, useRef, useEffect, useCallback } from 'react';
import { FaTimes, FaChevronDown, FaSpinner, FaVolumeUp, FaVolumeMute, FaBell } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Notification {
  notificationId: string;
  type: string;
  user: string;
  content: string;
  details?: any;
  createdAt: string;
  readAt: string | null;
}

interface CompagnoProps {
  className?: string;
  onNotificationsRead?: (notificationIds: string[]) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isPlaying?: boolean; // Add this property to track audio playback state
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const KINOS_BACKEND_BASE_URL = 'https://api.kinos-engine.ai/v2';
const BLUEPRINT = 'compagno';
const DEFAULT_USERNAME = 'visitor'; // We'll use a default username for anonymous users

const Compagno: React.FC<CompagnoProps> = ({ className, onNotificationsRead }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifications, setShowNotifications] = useState<boolean>(true);
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now());
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const fetchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);

  // Fetch notifications
  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    // Skip fetching if the component isn't open to reduce unnecessary API calls
    if (!isOpen && !showNotifications) return;
    
    // Add debug output in pink
    console.log('%c[DEBUG] Starting notification fetch', 'color: #ff69b4; font-weight: bold');
    console.log('%c[DEBUG] isOpen:', 'color: #ff69b4', isOpen);
    console.log('%c[DEBUG] showNotifications:', 'color: #ff69b4', showNotifications);
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
      let userToFetch = username;
      
      if (!userToFetch || userToFetch === DEFAULT_USERNAME) {
        // Try to get username from localStorage
        const savedProfile = localStorage.getItem('userProfile');
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.username) {
              userToFetch = profile.username;
              // Update the component state
              setUsername(profile.username);
            }
          } catch (error) {
            console.error('Error parsing user profile:', error);
          }
        }
      }
      
      // If still no username, use the default
      if (!userToFetch) {
        userToFetch = DEFAULT_USERNAME;
      }
      
      // Use the local API endpoint
      const apiUrl = `/api/notifications`;
      
      console.log(`%c[DEBUG] Fetching notifications from: ${apiUrl} for user: ${userToFetch}`, 'color: #ff69b4');
      
      // Only pass the since parameter on refresh requests, not on initial load
      // This way, initial load will use the default 1-week lookback
      const requestBody = forceRefresh 
        ? { user: userToFetch, since: lastFetchTime } 
        : { user: userToFetch };
    
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
        // Replace existing notifications instead of combining them
        setNotifications(data.notifications);
        
        // Update unread count
        const unreadCount = data.notifications.filter((n: Notification) => n.readAt === null).length;
        setUnreadCount(unreadCount);
        
        console.log(`%c[DEBUG] Set ${data.notifications.length} notifications, ${unreadCount} unread`, 'color: #ff69b4');
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
            user: username || DEFAULT_USERNAME,
            content: 'Welcome to La Serenissima! This is a test notification.',
            createdAt: new Date().toISOString(),
            readAt: null
          },
          {
            notificationId: 'dummy-2',
            type: 'Market',
            user: username || DEFAULT_USERNAME,
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
  }, [username, lastFetchTime, notifications.length, isOpen, showNotifications]);

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
            user: username,
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

  // Fetch user information if available
  useEffect(() => {
    // Try to get username from localStorage or other source
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.username) {
          console.log('%c[DEBUG] Found username in localStorage:', 'color: #ff69b4', profile.username);
          setUsername(profile.username);
        }
      } catch (error) {
        console.error('Error parsing user profile:', error);
      }
    } else {
      console.log('%c[DEBUG] No user profile found in localStorage, using default username:', 'color: #ff69b4', DEFAULT_USERNAME);
    }
    
    // Also listen for profile updates
    const handleProfileUpdate = (event: CustomEvent) => {
      if (event.detail && event.detail.username) {
        console.log('%c[DEBUG] Profile updated, new username:', 'color: #ff69b4', event.detail.username);
        setUsername(event.detail.username);
      }
    };
    
    window.addEventListener('userProfileUpdated', handleProfileUpdate as EventListener);
    
    return () => {
      window.removeEventListener('userProfileUpdated', handleProfileUpdate as EventListener);
    };
  }, []);

  // Set up notification polling
  useEffect(() => {
    // Only fetch notifications when the component is open or when notifications panel is shown
    if (isOpen || showNotifications) {
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
  }, [fetchNotifications, isOpen, showNotifications]); // Add isOpen and showNotifications as dependencies

  // Load message history when chat is opened
  useEffect(() => {
    if (isOpen) {
      fetchMessageHistory();
    }
  }, [isOpen, username]);

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

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

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    
    // Optimistically add user message to UI
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    
    try {
      const response = await fetch(
        `${KINOS_BACKEND_BASE_URL}/blueprints/${BLUEPRINT}/kins/${username}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: content,
            model: 'claude-3-7-sonnet-latest',
            mode: 'creative',
            addSystem: "You are Compagno, a Venetian guide in La Serenissima, a digital recreation of Renaissance Venice. Respond in a friendly, helpful manner with a slight Venetian flair. Your knowledge includes Venice's history, the game's mechanics, and how to navigate the digital city. Always be helpful and concise."
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
    await sendMessage(inputValue);
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

  // Return null if on mobile
  if (isMobile) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
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
                (e.target as HTMLImageElement).style.display = 'none';
                const sibling = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                if (sibling) sibling.style.display = 'block';
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
        <div className="bg-white rounded-lg shadow-xl w-96 max-h-[700px] flex flex-col border-2 border-amber-600 overflow-hidden slide-in">
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
                    (e.target as HTMLImageElement).style.display = 'none';
                    const sibling = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                    if (sibling) sibling.style.display = 'block';
                  }}
                />
                <div className="hidden text-xl font-serif">C</div>
              </div>
              <h3 className="font-serif">Compagno</h3>
              
              {/* Notification indicator */}
              {unreadCount > 0 && (
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
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
                setShowNotifications(true);
                // Fetch latest notifications when switching to notifications view
                fetchNotifications(true);
              }}
              className={`flex-1 py-2 text-sm font-medium relative ${
                showNotifications ? 'bg-amber-200 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
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
              onClick={() => setShowNotifications(false)}
              className={`flex-1 py-2 text-sm font-medium ${
                !showNotifications ? 'bg-amber-200 text-amber-800' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              Chat
            </button>
          </div>
          
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 bg-amber-50 bg-opacity-80" 
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat'
            }}
          >
            {/* Show notifications if in notification view */}
            {showNotifications ? (
              <>
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
                    <button 
                      onClick={() => setShowNotifications(false)}
                      className="text-amber-600 hover:text-amber-800"
                    >
                      Return to Chat
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
                          notification.readAt ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50 notification-unread'
                        }`}
                        onClick={() => {
                          if (!notification.readAt) {
                            markNotificationsAsRead([notification.notificationId]);
                          }
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div className="text-xs text-gray-500">
                            {formatNotificationDate(notification.createdAt)}
                          </div>
                        </div>
                        <div className="mt-1 text-sm">{notification.content}</div>
                      </div>
                    ))}
                    
                    {/* Mark all as read button */}
                    {notifications.some(n => !n.readAt) && (
                      <button
                        onClick={() => markNotificationsAsRead(
                          notifications.filter(n => !n.readAt).map(n => n.notificationId)
                        )}
                        className="mt-2 w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-sm transition-colors"
                      >
                        Mark all as read
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              // Original messages content
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
                
                {/* Loading indicator for initial load */}
                {isLoadingHistory && messages.length === 0 && (
                  <div className="flex justify-center items-center h-32">
                    <FaSpinner className="animate-spin text-amber-600 text-2xl" />
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
                          ? 'user-bubble rounded-br-none'
                          : 'assistant-bubble rounded-bl-none'
                      }`}
                    >
                      <div className="markdown-content">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // Customize how certain markdown elements are rendered
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
                          {message.content}
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
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Suggestions */}
          {messages.length <= 1 && (
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
              </div>
            </div>
          )}
          
          {/* Input area */}
          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2 flex">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask Compagno a question..."
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
        </div>
      )}
    </div>
  );
};

export default Compagno;
