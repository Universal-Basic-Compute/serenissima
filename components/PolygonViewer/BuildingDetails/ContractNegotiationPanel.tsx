import { useState, useEffect, useCallback, useRef } from 'react';
import { FaTimes, FaPaperPlane, FaSpinner } from 'react-icons/fa';
import Image from 'next/image';
import { getNormalizedResourceIconPath } from '../../../lib/utils/resourceUtils';
import { timeDescriptionService } from '@/lib/services/TimeDescriptionService'; // For formatting dates

interface Message {
  id?: string;
  messageId?: string;
  role?: 'user' | 'assistant'; // 'user' for buyer, 'assistant' for seller in this context
  sender?: string;
  receiver?: string;
  content: string;
  type?: string;
  timestamp?: string;
  createdAt?: string;
  readAt?: string | null;
  context?: MessageContext; // Added context property
}

// Define the structure of the context object
interface MessageContext {
  buildingId?: string;
  resourceType?: string;
  resourceName?: string;
  negotiatedPrice?: number;
  originalOfferId?: string; // For offer responses
  respondedPrice?: number;  // For offer responses
}

interface ContractNegotiationPanelProps {
  resource: any; // Should include name, resourceType, importPrice, price (current listing price)
  sellerUsername: string;
  buyerUsername: string;
  buildingId: string;
  onClose: () => void;
  isVisible: boolean;
}

const ContractNegotiationPanel: React.FC<ContractNegotiationPanelProps> = ({
  resource,
  sellerUsername,
  buyerUsername,
  buildingId,
  onClose,
  isVisible,
}) => {
  const [negotiatedPrice, setNegotiatedPrice] = useState<number>(resource.price || 0);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInputValue, setChatInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null); // Added state for current user

  const minPrice = 0;
  const [offerStates, setOfferStates] = useState<Record<string, 'accepted' | 'refused' | null>>({}); // To track offer responses


  // Determine the reference price: higher of public sell price or import price
  const publicSellPrice = resource.price || 0;
  const importPrice = resource.importPrice || 0;
  const referencePrice = Math.max(publicSellPrice, importPrice);

  // Set maxPrice to 20% above the reference price, or a default if reference is 0
  const maxPrice = referencePrice > 0 
    ? Math.ceil(referencePrice * 1.2) 
    : 100; // Default max price if both public and import prices are 0

  const formatChatMessageDate = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      return timeDescriptionService.formatDate(dateString, dateString);
    } catch (error) {
      return new Date(dateString).toLocaleTimeString();
    }
  };

  const fetchMessages = useCallback(async () => {
    if (!buyerUsername || !sellerUsername) return;
    setIsLoadingMessages(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentCitizen: buyerUsername,
          otherCitizen: sellerUsername,
          // Potentially add a context filter like `negotiation_${buildingId}_${resource.resourceType}`
        }),
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      if (data.success && data.messages) {
        setChatMessages(data.messages.map((msg: any) => ({
          ...msg,
          role: msg.sender === buyerUsername ? 'user' : 'assistant'
        })));
      } else {
        setChatMessages([]);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      setChatMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [buyerUsername, sellerUsername, buildingId, resource.resourceType]);

  useEffect(() => {
    if (isVisible) {
      fetchMessages();
      setNegotiatedPrice(resource.price || 0); // Reset price on open

      // Get current username from localStorage
      if (typeof window !== 'undefined') {
        try {
          const profileStr = localStorage.getItem('citizenProfile');
          if (profileStr) {
            const profile = JSON.parse(profileStr);
            if (profile.username) {
              setCurrentUsername(profile.username);
            } else {
              setCurrentUsername(null); // Explicitly set to null if no username
            }
          } else {
            setCurrentUsername(null); // Explicitly set to null if no profile
          }
        } catch (error) {
          console.error('Error getting current username in ContractNegotiationPanel:', error);
          setCurrentUsername(null); // Set to null on error
        }
      }
    }
  }, [isVisible, resource.price, fetchMessages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSendMessage = async (customContent?: string, messageType: string = 'negotiation_offer') => {
    const contentToSend = customContent || chatInputValue;
    if (!contentToSend.trim() || !buyerUsername || !sellerUsername) return;
    
    setIsSending(true);

    let finalMessageContent = contentToSend;
    if (messageType === 'negotiation_offer' && !customContent) { // Standard chat message
      finalMessageContent = `Regarding ${resource.name}: ${chatInputValue} (Offer: ${negotiatedPrice} Ducats)`;
    }
    
    const tempMessage: Message = {
      messageId: `temp-${Date.now()}`,
      sender: buyerUsername,
      receiver: sellerUsername,
      content: finalMessageContent,
      role: 'user',
      type: messageType, // Use the passed messageType
      createdAt: new Date().toISOString(),
      context: { // Include context for all message types now
        buildingId: buildingId,
        resourceType: resource.resourceType,
        resourceName: resource.name,
        negotiatedPrice: negotiatedPrice // Current slider price for context
      }
    };
    setChatMessages(prev => [...prev, tempMessage]);
    if (!customContent) { // Clear input only if it wasn't a custom content send
      setChatInputValue('');
    }

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: buyerUsername,
          receiver: sellerUsername,
          content: finalMessageContent,
          type: messageType, 
          context: tempMessage.context
        }),
      });
      if (!response.ok) throw new Error('Failed to send message');
      const data = await response.json();
      if (data.success && data.message) {
        setChatMessages(prev => prev.map(msg => msg.messageId === tempMessage.messageId ? {...data.message, role: 'user'} : msg));
      } else {
        setChatMessages(prev => prev.filter(msg => msg.messageId !== tempMessage.messageId));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setChatMessages(prev => prev.filter(msg => msg.messageId !== tempMessage.messageId));
    } finally {
      setIsSending(false);
    }
  };

  const handleSendDailyBuyOffer = async () => {
    const offerContent = `I'd like to buy daily ${resource.name} for a price of ${negotiatedPrice} Ducats.`;
    // Send this specific offer type
    await handleSendMessage(offerContent, 'resource_buy_offer');
  };

  const handleOfferResponse = async (originalOffer: Message, responseType: 'resource_buy_accept' | 'resource_buy_refuse') => {
    if (!originalOffer.messageId || !originalOffer.context) return;
    setIsSending(true);

    const actionText = responseType === 'resource_buy_accept' ? 'ACCEPTED' : 'REFUSED';
    const responseContent = `Offer for ${originalOffer.context.resourceName} at ${originalOffer.context.negotiatedPrice} Ducats daily ${actionText}.`;

    const responseMessage: Message = {
      messageId: `temp-response-${Date.now()}`,
      sender: sellerUsername, // Current user (seller) is responding
      receiver: originalOffer.sender, // Send back to the original offer sender
      content: responseContent,
      role: 'user', // From the perspective of the current user sending it
      type: responseType,
      createdAt: new Date().toISOString(),
      context: {
        originalOfferId: originalOffer.messageId,
        resourceType: originalOffer.context.resourceType,
        resourceName: originalOffer.context.resourceName,
        respondedPrice: originalOffer.context.negotiatedPrice,
        buildingId: originalOffer.context.buildingId,
      }
    };
    setChatMessages(prev => [...prev, responseMessage]);

    try {
      const apiResponse = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: responseMessage.sender,
          receiver: responseMessage.receiver,
          content: responseMessage.content,
          type: responseMessage.type,
          context: responseMessage.context
        }),
      });
      if (!apiResponse.ok) throw new Error('Failed to send offer response');
      const data = await apiResponse.json();
      if (data.success && data.message) {
        setChatMessages(prev => prev.map(msg => msg.messageId === responseMessage.messageId ? {...data.message, role: 'user'} : msg));
        setOfferStates(prev => ({ ...prev, [originalOffer.messageId!]: responseType === 'resource_buy_accept' ? 'accepted' : 'refused' }));
      } else {
        setChatMessages(prev => prev.filter(msg => msg.messageId !== responseMessage.messageId));
      }
    } catch (error) {
      console.error('Error sending offer response:', error);
      setChatMessages(prev => prev.filter(msg => msg.messageId !== responseMessage.messageId));
    } finally {
      setIsSending(false);
    }
  };

  if (!isVisible) return null;

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-amber-50 w-full max-w-2xl rounded-lg shadow-xl border-2 border-amber-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-amber-700 text-white p-4 flex justify-between items-center rounded-t-lg">
          <h3 className="font-serif text-xl">Negotiate: {resource.name}</h3>
          <button onClick={onClose} className="text-white hover:text-amber-200">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-grow overflow-y-auto custom-scrollbar">
          {/* Resource Info */}
          <div className="flex items-center mb-6 p-3 bg-amber-100 rounded-md border border-amber-200">
            <div className="relative w-16 h-16 mr-4">
              <Image
                src={getNormalizedResourceIconPath(resource.icon, resource.resourceType || resource.name)}
                alt={resource.name}
                layout="fill"
                objectFit="contain"
                unoptimized
              />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-amber-800">{resource.name}</h4>
              <p className="text-sm text-amber-700">
                Current Price: {resource.price || 'N/A'} ⚜️
                {resource.importPrice && ` (Import: ${resource.importPrice} ⚜️)`}
              </p>
              <p className="text-xs text-gray-600">Seller: {sellerUsername}</p>
            </div>
          </div>

          {/* Price Slider */}
          <div className="mb-6">
            <label htmlFor="price-slider" className="block text-sm font-medium text-amber-800 mb-1">
              Your Offer: <span className="font-bold text-lg">{negotiatedPrice}</span> ⚜️
            </label>
            <div className="relative w-full">
              <input
                id="price-slider"
                type="range"
                min={minPrice}
                max={maxPrice}
                value={negotiatedPrice}
                onChange={(e) => setNegotiatedPrice(Number(e.target.value))}
                className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
              />
              {/* Import Price Marker */}
              {resource.importPrice !== undefined && maxPrice > minPrice && (
                <div
                  className="absolute top-1/2 h-3 w-1 bg-red-500 rounded-sm transform -translate-y-1/2"
                  style={{
                    left: `${((resource.importPrice - minPrice) / (maxPrice - minPrice)) * 100}%`,
                    display: resource.importPrice >= minPrice && resource.importPrice <= maxPrice ? 'block' : 'none',
                  }}
                  title={`Import Price: ${resource.importPrice} ⚜️`}
                ></div>
              )}
            </div>
            <div className="flex justify-between text-xs text-amber-600 mt-1">
              <span>{minPrice} ⚜️</span>
              {resource.importPrice !== undefined && (
                <span className="text-red-600" title={`Import Price: ${resource.importPrice} ⚜️`}>
                  Import: {resource.importPrice} ⚜️
                </span>
              )}
              <span>{maxPrice} ⚜️</span>
            </div>
          </div>

          {/* Premade Offer Button */}
          {buyerUsername === currentUsername && ( // Only buyer can propose this
            <div className="mb-4 text-center">
              <button
                onClick={handleSendDailyBuyOffer}
                disabled={isSending}
                className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:bg-gray-400 text-sm font-medium"
              >
                Propose Daily Purchase at {negotiatedPrice} ⚜️
              </button>
            </div>
          )}

          {/* Chat Area */}
          <div className="h-64 bg-white border border-amber-200 rounded-md p-3 overflow-y-auto mb-4 custom-scrollbar">
            {isLoadingMessages ? (
              <div className="flex justify-center items-center h-full">
                <FaSpinner className="animate-spin text-amber-600 text-2xl" />
              </div>
            ) : chatMessages.length === 0 ? (
              <p className="text-center text-gray-500 italic">Start the conversation.</p>
            ) : (
              chatMessages.map((msg, index) => (
                <div
                  key={msg.messageId || `chat-${index}`}
                  className={`mb-3 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-2 rounded-lg ${
                      msg.sender === currentUsername // Messages sent by the current logged-in user
                        ? 'bg-orange-600 text-white rounded-br-none' // Darker orange
                        : 'bg-gray-200 text-gray-800 rounded-bl-none' // Messages received by the current logged-in user
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {/* Offer buttons are always visible for 'resource_buy_offer' type, but only active for the receiver */}
                    {msg.type === 'resource_buy_offer' && !offerStates[msg.messageId!] && (
                      <div className="mt-2 flex space-x-2 justify-end">
                        <button
                          onClick={() => handleOfferResponse(msg, 'resource_buy_accept')}
                          disabled={isSending || msg.sender === currentUsername} // Disabled if sending or if current user is the sender
                          className={`px-3 py-1 text-xs rounded ${
                            msg.sender === currentUsername 
                              ? 'bg-gray-500 text-gray-800 cursor-not-allowed' // Visibly disabled (greyed out) for sender
                              : 'bg-purple-700 hover:bg-purple-800 text-white disabled:bg-gray-400' // Active for receiver
                          }`}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleOfferResponse(msg, 'resource_buy_refuse')}
                          disabled={isSending || msg.sender === currentUsername} // Disabled if sending or if current user is the sender
                          className={`px-3 py-1 text-xs rounded ${
                            msg.sender === currentUsername
                              ? 'bg-gray-500 text-gray-800 cursor-not-allowed' // Visibly disabled (greyed out) for sender
                              : 'bg-emerald-700 hover:bg-emerald-800 text-white disabled:bg-gray-400' // Active for receiver
                          }`}
                        >
                          Refuse
                        </button>
                      </div>
                    )}
                     {msg.type === 'resource_buy_offer' && offerStates[msg.messageId!] === 'accepted' && (
                      <p className="text-xs mt-1 text-green-700 italic">Offer accepted.</p>
                    )}
                    {msg.type === 'resource_buy_offer' && offerStates[msg.messageId!] === 'refused' && (
                      <p className="text-xs mt-1 text-red-700 italic">Offer refused.</p>
                    )}
                    <p className="text-xs mt-1 opacity-70 text-right">
                      {formatChatMessageDate(msg.createdAt || msg.timestamp)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="flex items-end">
            <textarea
              value={chatInputValue}
              onChange={(e) => setChatInputValue(e.target.value)}
              placeholder="Type your message... (Shift + Enter for new line)"
              className="flex-grow p-2 border border-amber-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSending) handleSendMessage();
                }
              }}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isSending || !chatInputValue.trim()}
              className="bg-amber-600 text-white px-4 py-2 rounded-r-md hover:bg-amber-700 disabled:bg-gray-400 flex items-center justify-center self-stretch"
            >
              {isSending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractNegotiationPanel;
