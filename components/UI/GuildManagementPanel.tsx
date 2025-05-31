import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaPaperPlane } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';

// Define the Guild interface (copied from GuildsPanel.tsx)
interface Guild {
  guildId: string;
  guildName: string;
  createdAt: string;
  primaryLocation: string;
  description: string;
  shortDescription?: string;
  patronSaint?: string;
  guildTier?: string;
  leadershipStructure?: string;
  entryFee?: number;
  votingSystem?: string;
  meetingFrequency?: string;
  guildHallId?: string;
  guildEmblem?: string;
  guildBanner?: string;
  color?: string;
}

interface Message {
  messageId: string;
  sender: string;
  receiver: string;
  content: string;
  type: string;
  createdAt: string;
  readAt?: string | null;
}

interface GuildManagementPanelProps {
  guild: Guild;
  onClose: () => void;
}

// Helper function to format tab names for receiver IDs
const formatTabNameForId = (tabName: string) => {
  return tabName.replace(/\s+/g, '_').replace(/&/g, 'and');
};

export default function GuildManagementPanel({ guild, onClose }: GuildManagementPanelProps) {
  type GuildManagementTab =
    | "Charter & Rules"
    | "Guild Hall"
    | "Market Intelligence"
    | "Governance"
    | "Treasury & Benefits"
    | "Knowledge Vault"
    | "Alliances & Rivals"
    | "Members Registry";

  const [activeTab, setActiveTab] = useState<GuildManagementTab>("Charter & Rules");
  const [currentCitizenUsername, setCurrentCitizenUsername] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>("");
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const tabs: GuildManagementTab[] = [
    "Charter & Rules",
    "Guild Hall",
    "Market Intelligence",
    "Governance",
    "Treasury & Benefits",
    "Knowledge Vault",
    "Alliances & Rivals",
    "Members Registry"
  ];

  const chatReceiverId = `${guild.guildId}_${formatTabNameForId(activeTab)}`;

  useEffect(() => {
    const profile = localStorage.getItem('citizenProfile');
    if (profile) {
      try {
        const parsedProfile = JSON.parse(profile);
        setCurrentCitizenUsername(parsedProfile.username);
      } catch (e) {
        console.error("Failed to parse citizen profile for chat sender:", e);
      }
    }
  }, []);

  const fetchMessages = async () => {
    if (!chatReceiverId) return;
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/messages?type=guild&receiver=${encodeURIComponent(chatReceiverId)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data = await response.json();
      if (data.success) {
        setChatMessages(data.messages || []);
      } else {
        console.error("Error fetching messages:", data.error);
        setChatMessages([]);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      setChatMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [chatReceiverId]); // Refetch when tab changes

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);


  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentCitizenUsername || !chatReceiverId) return;
    setIsSendingMessage(true);
    const messageToSend = newMessage; // Capture message before clearing
    try {
      // Step 1: Send message to Airtable (central log)
      const airtableResponse = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: currentCitizenUsername,
          receiver: chatReceiverId,
          content: newMessage,
          type: 'guild'
        }),
      });
      const airtableData = await airtableResponse.json();
      if (airtableData.success && airtableData.message) {
        setChatMessages(prevMessages => [...prevMessages, airtableData.message]);
        setNewMessage(""); // Clear input after successful Airtable send

        // Step 2: Notify guild members via KinOS through our new backend route
        // This is a fire-and-forget from the client's perspective for UI responsiveness
        fetch('/api/guilds/notify-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guildId: guild.guildId,
            kinOsChannelId: chatReceiverId, // This is guild.guildId + "_" + formattedTabName
            messageContent: messageToSend, // Use captured message
            originalSenderUsername: currentCitizenUsername,
          }),
        })
        .then(async (notifyResponse) => {
          if (!notifyResponse.ok) {
            const notifyErrorData = await notifyResponse.json();
            console.error("Failed to initiate KinOS notifications:", notifyErrorData.error, notifyErrorData.details);
            // Non-critical for UI, but log it. Could show a subtle error to user if important.
          } else {
            const notifySuccessData = await notifyResponse.json();
            console.log("KinOS notification process initiated:", notifySuccessData.message);
          }
        })
        .catch(notifyError => {
          console.error("Error calling /api/guilds/notify-members:", notifyError);
        });

      } else {
        console.error("Failed to send message to Airtable:", airtableData.error);
        alert(`Error sending message: ${airtableData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert(`Error sending message: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsSendingMessage(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
      <div className="bg-amber-50 rounded-lg shadow-xl w-full max-w-7xl h-[90vh] max-h-[800px] border-4 border-amber-700 flex flex-col">
        {/* Header */}
        <div className="bg-amber-700 text-white p-4 flex justify-between items-center flex-shrink-0">
          <h3 className="text-2xl font-serif">Managing: {guild.guildName}</h3>
          <button
            onClick={onClose}
            className="text-white hover:text-amber-200 transition-colors"
            aria-label="Close guild management"
          >
            <FaTimes size={24} />
          </button>
        </div>

        {/* Main content area (Tabs | Content | Chat) */}
        <div className="flex flex-grow overflow-hidden">
          {/* Sidebar for tabs (1/5 width) */}
          <nav className="w-1/5 bg-amber-100 p-4 overflow-y-auto border-r border-amber-300 flex-shrink-0">
            <ul className="space-y-1">
              {tabs.map((tab) => (
                <li key={tab}>
                  <button
                    onClick={() => setActiveTab(tab)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors
                      ${activeTab === tab
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'text-amber-700 hover:bg-amber-200 hover:text-amber-800'
                      }`}
                  >
                    {tab}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Tab content area (2.5/5 width) */}
          <div className="w-[50%] p-6 overflow-y-auto bg-white border-r border-amber-300">
            <h4 className="text-xl font-serif text-amber-800 mb-4">{activeTab}</h4>
            {activeTab === "Charter & Rules" && (
              <div>
                <p className="text-gray-700">Details about the guild's charter, rules, and regulations will be displayed here.</p>
                <div className="mt-2 text-gray-700">Current Charter: <ReactMarkdown>{guild.description || "No charter defined."}</ReactMarkdown></div>
              </div>
            )}
            {activeTab === "Guild Hall" && (
              <div>
                <p className="text-gray-700">Information and management options for the Guild Hall.</p>
                <p className="mt-2 text-gray-700">Guild Hall ID: {guild.guildHallId || "Not established"}</p>
              </div>
            )}
            {activeTab === "Market Intelligence" && (
              <div>
                <p className="text-gray-700">Market data, contract opportunities, and economic intelligence relevant to the guild.</p>
              </div>
            )}
            {activeTab === "Governance" && (
              <div>
                <p className="text-gray-700">Guild voting systems, proposals, and leadership structure.</p>
                <p className="mt-2 text-gray-700">Leadership: {guild.leadershipStructure || "N/A"}</p>
                <p className="mt-2 text-gray-700">Voting System: {guild.votingSystem || "N/A"}</p>
              </div>
            )}
            {activeTab === "Treasury & Benefits" && (
              <div>
                <p className="text-gray-700">Guild treasury status, member benefits, and financial management.</p>
              </div>
            )}
            {activeTab === "Knowledge Vault" && (
              <div>
                <p className="text-gray-700">Shared knowledge, strategies, and important documents for guild members.</p>
              </div>
            )}
            {activeTab === "Alliances & Rivals" && (
              <div>
                <p className="text-gray-700">Information about allied guilds and rival organizations.</p>
              </div>
            )}
            {activeTab === "Members Registry" && (
              <div>
                <p className="text-gray-700">A detailed list of all guild members and their roles.</p>
              </div>
            )}
          </div>

          {/* Chat area (1.5/5 width) */}
          <div className="w-[30%] bg-amber-50 flex flex-col border-l border-amber-300">
            <div className="p-4 border-b border-amber-200">
              <h5 className="text-md font-serif text-amber-800">Guild Chat: {activeTab}</h5>
            </div>
            <div className="flex-grow p-4 overflow-y-auto space-y-3">
              {isLoadingMessages ? (
                <p className="text-center text-amber-700">Loading messages...</p>
              ) : chatMessages.length === 0 ? (
                <p className="text-center text-amber-600 text-sm">No messages in this channel yet.</p>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.messageId} className={`flex ${msg.sender === currentCitizenUsername ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] p-2 rounded-lg ${msg.sender === currentCitizenUsername ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800'}`}>
                      <p className="text-xs font-semibold">{msg.sender}</p>
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-xs text-opacity-75 mt-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-amber-200 bg-amber-100">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-start space-x-2"> {/* items-start for better alignment with textarea */}
                <textarea
                  rows={3}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={currentCitizenUsername ? "Type your message..." : "Loading user..."}
                  className="flex-grow p-2 border border-amber-300 rounded-md focus:ring-amber-500 focus:border-amber-500 text-sm resize-none" // resize-none to prevent manual resizing
                  disabled={!currentCitizenUsername || isSendingMessage || isLoadingMessages}
                  onKeyDown={(e) => {
                    // Optional: Submit on Enter, new line on Shift+Enter
                    // if (e.key === 'Enter' && !e.shiftKey) {
                    //   e.preventDefault();
                    //   handleSendMessage();
                    // }
                  }}
                />
                <button
                  type="submit"
                  className="p-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:bg-amber-400 self-start" // self-start to align button with top
                  disabled={!currentCitizenUsername || !newMessage.trim() || isSendingMessage || isLoadingMessages}
                >
                  <FaPaperPlane />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
