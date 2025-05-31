import React, { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
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

interface GuildManagementPanelProps {
  guild: Guild;
  onClose: () => void;
}

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
      <div className="bg-amber-50 rounded-lg shadow-xl w-full max-w-5xl h-[90vh] max-h-[800px] border-4 border-amber-700 flex flex-col">
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

        <div className="flex flex-grow overflow-hidden">
          {/* Sidebar for tabs */}
          <nav className="w-1/4 bg-amber-100 p-4 overflow-y-auto border-r border-amber-300 flex-shrink-0">
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

          {/* Tab content area */}
          <div className="w-3/4 p-6 overflow-y-auto bg-white">
            <h4 className="text-xl font-serif text-amber-800 mb-4">{activeTab}</h4>
            {/* Placeholder content for each tab */}
            {activeTab === "Charter & Rules" && (
              <div>
                <p className="text-gray-700">Details about the guild's charter, rules, and regulations will be displayed here.</p>
                <p className="mt-2 text-gray-700">Current Charter: <ReactMarkdown>{guild.description || "No charter defined."}</ReactMarkdown></p>
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
                {/* You might want to reuse or adapt the member listing logic from GuildDetails here */}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
