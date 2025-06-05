import React from 'react';
import { Polygon } from './types';
import { FaExpand, FaCompress, FaSpinner } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LandChatColumnProps {
  selectedPolygon: Polygon | null;
  messages: any[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isTyping: boolean;
  handleSendMessage: (content: string) => void;
  isCorrespondanceFullScreen: boolean;
  setIsCorrespondanceFullScreen: (isFullScreen: boolean) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  isLoadingHistory?: boolean; 
}

const LandChatColumn: React.FC<LandChatColumnProps> = ({
  selectedPolygon,
  messages,
  inputValue,
  setInputValue,
  isTyping,
  handleSendMessage,
  isCorrespondanceFullScreen,
  setIsCorrespondanceFullScreen,
  messagesEndRef,
  isLoadingHistory,
}) => {
  return (
    <div className="flex flex-col h-full"> {/* Ensure full height for scrolling */}
      <div className="flex items-center flex-shrink-0">
        <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1 flex-grow">Notes & Discussion</h3>
        <button 
          onClick={() => setIsCorrespondanceFullScreen(!isCorrespondanceFullScreen)} 
          className="text-amber-600 hover:text-amber-700 ml-2 p-1 flex-shrink-0"
          title={isCorrespondanceFullScreen ? "Exit full screen" : "Full screen"}
        >
          {isCorrespondanceFullScreen ? <FaCompress size={16} /> : <FaExpand size={16} />}
        </button>
      </div>
      
      <div 
        className="flex-grow overflow-y-auto p-3 bg-amber-50 bg-opacity-80 rounded-lg mb-3 custom-scrollbar min-h-[200px]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
        }}
      >
        {isLoadingHistory ? (
          <div className="flex justify-center items-center h-full">
            <div className="bg-yellow-500 text-white p-3 rounded-lg rounded-bl-none inline-block">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-yellow-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        ) : messages.length === 0 && !isTyping ? (
          <div className="text-center py-8 text-amber-700 italic">
            No discussion yet for this land parcel.
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`mb-3 ${message.role === 'user' ? 'text-right' : 'text-left'}`}
              >
                <div 
                  className={`inline-block p-2 rounded-lg max-w-[80%] text-sm ${
                    message.role === 'user'
                      ? 'bg-amber-100 text-amber-900 rounded-br-none'
                      : 'bg-amber-700 text-white rounded-bl-none'
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="text-left mb-3">
                <div className="inline-block p-2 rounded-lg bg-yellow-500 text-white">
                  <FaSpinner className="animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      
      <form 
        onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }} 
        className="flex flex-shrink-0 items-end"
      >
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={`Discuss ${selectedPolygon?.historicalName || 'this land'}... (Shift+Enter for new line)`} 
          className="flex-1 p-2 border border-amber-300 rounded-l-lg focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none text-sm"
          rows={2}
          disabled={isTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!isTyping && inputValue.trim()) {
                handleSendMessage(inputValue);
              }
            }
          }}
          style={{ maxHeight: '80px' }}
        />
        <button 
          type="submit"
          className={`px-3 py-2 rounded-r-lg transition-colors self-stretch text-sm ${
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
  );
};

export default LandChatColumn;
