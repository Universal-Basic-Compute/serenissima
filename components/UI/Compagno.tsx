import { useState, useRef, useEffect } from 'react';
import { FaTimes, FaChevronDown, FaSpinner } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CompagnoProps {
  className?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

const KINOS_API_BASE_URL = 'https://api.kinos-engine.ai/v2';
const BLUEPRINT = 'compagno';
const DEFAULT_USERNAME = 'visitor'; // We'll use a default username for anonymous users

const Compagno: React.FC<CompagnoProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [username, setUsername] = useState<string>(DEFAULT_USERNAME);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch user information if available
  useEffect(() => {
    // Try to get username from localStorage or other source
    const savedProfile = localStorage.getItem('userProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        if (profile.username) {
          setUsername(profile.username);
        }
      } catch (error) {
        console.error('Error parsing user profile:', error);
      }
    }
  }, []);

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
        `${KINOS_API_BASE_URL}/blueprints/${BLUEPRINT}/kins/${username}/messages?limit=25&offset=${offset}`,
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
        `${KINOS_API_BASE_URL}/blueprints/${BLUEPRINT}/kins/${username}/messages`,
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
                (e.target as HTMLImageElement).nextElementSibling!.style.display = 'block';
              }}
            />
            <div className="hidden text-2xl font-serif">C</div>
          </div>
        </button>
      )}

      {/* Expanded chat window */}
      {isOpen && (
        <div className="bg-white rounded-lg shadow-xl w-96 max-h-[600px] flex flex-col border-2 border-amber-600 overflow-hidden slide-in">
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
                    (e.target as HTMLImageElement).nextElementSibling!.style.display = 'block';
                  }}
                />
                <div className="hidden text-xl font-serif">C</div>
              </div>
              <h3 className="font-serif">Compagno</h3>
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
          
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3 bg-amber-50">
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
                </div>
                <div className="text-xs text-gray-500 mt-1 px-1">
                  {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="border-t border-gray-200 p-2 bg-amber-50">
              <p className="text-xs text-gray-500 mb-2">Suggested questions:</p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => handleSuggestedQuestion("How do I purchase land?")}
                  className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200 transition-colors shadow-sm"
                >
                  How do I purchase land?
                </button>
                <button
                  onClick={() => handleSuggestedQuestion("What are $COMPUTE tokens?")}
                  className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200 transition-colors shadow-sm"
                >
                  What are $COMPUTE tokens?
                </button>
                <button
                  onClick={() => handleSuggestedQuestion("How do I build structures?")}
                  className="text-xs bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-800 px-3 py-1.5 rounded-full border border-amber-200 transition-colors shadow-sm"
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
                  : 'bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400'
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
