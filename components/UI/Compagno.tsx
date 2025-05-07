import { useState, useRef, useEffect } from 'react';
import { FaTimes, FaChevronUp, FaChevronDown } from 'react-icons/fa';

interface CompagnoProps {
  className?: string;
}

const Compagno: React.FC<CompagnoProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{text: string; sender: 'user' | 'compagno'}[]>([
    { text: "Buongiorno! I am Compagno, your guide to La Serenissima. How may I assist you today?", sender: 'compagno' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (message: string) => {
    setIsTyping(true);
    
    try {
      // In a real implementation, this would call an API endpoint
      // For now, we'll simulate a response after a delay
      setTimeout(() => {
        const responses = [
          "Ah, an excellent question about Venice!",
          "The Council of Ten would be most interested in your inquiry.",
          "As your loyal guide, I shall help you navigate the canals of knowledge.",
          "The Doge himself would approve of your curiosity!",
          "Venice's history is rich with stories that answer your question."
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        setMessages(prev => [...prev, { text: randomResponse, sender: 'compagno' }]);
        setIsTyping(false);
      }, 1000);
      
    } catch (error) {
      console.error('Error getting response:', error);
      setMessages(prev => [...prev, { 
        text: "Forgive me, but I seem to be unable to respond at the moment.", 
        sender: 'compagno' 
      }]);
      setIsTyping(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim()) return;
    
    // Add user message
    const userMessage = { text: inputValue, sender: 'user' as const };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    
    // Show typing indicator
    setIsTyping(true);
    
    try {
      // In a real implementation, this would call an API endpoint
      // For now, we'll simulate a response after a delay
      setTimeout(() => {
        const responses = [
          "Ah, an excellent question about Venice!",
          "The Council of Ten would be most interested in your inquiry.",
          "As your loyal guide, I shall help you navigate the canals of knowledge.",
          "The Doge himself would approve of your curiosity!",
          "Venice's history is rich with stories that answer your question."
        ];
        
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        setMessages(prev => [...prev, { text: randomResponse, sender: 'compagno' }]);
        setIsTyping(false);
      }, 1000);
      
    } catch (error) {
      console.error('Error getting response:', error);
      setMessages(prev => [...prev, { 
        text: "Forgive me, but I seem to be unable to respond at the moment.", 
        sender: 'compagno' 
      }]);
      setIsTyping(false);
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      {/* Collapsed state - just show the mask icon */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-amber-700 text-white p-3 rounded-full shadow-lg hover:bg-amber-600 transition-all duration-300 flex items-center justify-center"
          aria-label="Open Compagno chat assistant"
        >
          <div className="relative">
            <img 
              src="/images/venetian-mask.png" 
              alt="Compagno" 
              className="w-10 h-10 mask-float"
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
        <div className="bg-white rounded-lg shadow-xl w-80 max-h-96 flex flex-col border-2 border-amber-600 overflow-hidden slide-in">
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
            {messages.map((message, index) => (
              <div 
                key={index} 
                className={`mb-3 ${
                  message.sender === 'user' 
                    ? 'text-right' 
                    : 'text-left'
                }`}
              >
                <div 
                  className={`inline-block p-2 rounded-lg max-w-[80%] ${
                    message.sender === 'user'
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : 'bg-amber-100 text-gray-800 rounded-bl-none border border-amber-200'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="text-left mb-3">
                <div className="inline-block p-2 rounded-lg max-w-[80%] bg-amber-100 text-gray-800 rounded-bl-none border border-amber-200">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          {/* Suggestions */}
          {messages.length <= 2 && (
            <div className="border-t border-gray-200 p-2 bg-amber-50">
              <p className="text-xs text-gray-500 mb-2">Suggested questions:</p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => {
                    const question = "How do I purchase land?";
                    setMessages(prev => [...prev, { text: question, sender: 'user' }]);
                    handleSendMessage(question);
                  }}
                  className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded-full border border-amber-200 transition-colors"
                >
                  How do I purchase land?
                </button>
                <button
                  onClick={() => {
                    const question = "What are $COMPUTE tokens?";
                    setMessages(prev => [...prev, { text: question, sender: 'user' }]);
                    handleSendMessage(question);
                  }}
                  className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded-full border border-amber-200 transition-colors"
                >
                  What are $COMPUTE tokens?
                </button>
                <button
                  onClick={() => {
                    const question = "How do I build structures?";
                    setMessages(prev => [...prev, { text: question, sender: 'user' }]);
                    handleSendMessage(question);
                  }}
                  className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 rounded-full border border-amber-200 transition-colors"
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
            />
            <button 
              type="submit"
              className="bg-amber-600 text-white px-4 rounded-r-lg hover:bg-amber-500 transition-colors"
              disabled={!inputValue.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Compagno;
