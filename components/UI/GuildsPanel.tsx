import React, { useState, useEffect } from 'react';
import { fetchGuilds, Guild } from '@/lib/utils/airtableUtils';
import ReactMarkdown from 'react-markdown'; // Keep for GuildDetails if it uses it, or remove if not.
import { FaTimes } from 'react-icons/fa'; // Keep for GuildDetails if it uses it, or remove if not.
import GuildManagementPanel from './GuildManagementPanel'; // Import the new component

// Extend the Window interface to include the __polygonData property
declare global {
  interface Window {
    __polygonData?: any[];
  }
}

interface GuildsPanelProps {
  onClose: () => void;
  standalone?: boolean;
}

// Define the GuildMember interface
interface GuildMember {
  citizenId: string;
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImageUrl: string | null;
  color: string | null;
}

export default function GuildsPanel({ onClose, standalone = false }: GuildsPanelProps) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);

  useEffect(() => {
    async function loadGuilds() {
      try {
        setLoading(true);
        const fetchedGuilds = await fetchGuilds();
        setGuilds(fetchedGuilds);
        setError(null);
      } catch (err) {
        console.error('Error loading guilds:', err);
        setError('Failed to load guilds. Please try again later.');
      } finally {
        setLoading(false);
      }
    }

    loadGuilds();
  }, []);

  // Helper function to format date
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    
    try {
      const date = new Date(dateString);
      // Subtract 1000 years from the date
      date.setFullYear(date.getFullYear() - 500);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  // Helper function to get land name from localStorage or polygon data
  const getLandName = (locationId: string): string => {
    if (!locationId) return 'Unknown Location';
    
    try {
      // First try to get land data from window.__polygonData
      if (typeof window !== 'undefined' && window.__polygonData) {
        const polygon = window.__polygonData.find((p: any) => p.id === locationId);
        if (polygon) {
          // If both historical and English names exist, show both
          if (polygon.historicalName && polygon.englishName) {
            return `${polygon.historicalName} (${polygon.englishName})`;
          }
          // Otherwise return whichever one exists
          return polygon.historicalName || polygon.englishName || locationId;
        }
      }
      
      // Try to get land name from localStorage as a fallback
      const landData = localStorage.getItem('landNames');
      if (landData) {
        const lands = JSON.parse(landData);
        if (lands[locationId]) {
          return lands[locationId];
        }
      }
      
      // If we can't find it, check if there's a polygonData item in localStorage
      const polygonData = localStorage.getItem('polygonData');
      if (polygonData) {
        const polygons = JSON.parse(polygonData);
        const polygon = polygons.find((p: any) => p.id === locationId);
        if (polygon) {
          // If both historical and English names exist, show both
          if (polygon.historicalName && polygon.englishName) {
            return `${polygon.historicalName} (${polygon.englishName})`;
          }
          // Otherwise return whichever one exists
          return polygon.historicalName || polygon.englishName || locationId;
        }
      }
      
      // If we still can't find it, return a formatted version of the ID
      return locationId.replace('polygon-', 'Land ');
    } catch (error) {
      console.error('Error getting land name:', error);
      return locationId;
    }
  };

  return (
    <div className={`${standalone ? 'p-8' : 'absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-50 rounded-lg p-4 overflow-auto'}`}>
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Guilds of Venice
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Return to main view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : selectedGuild ? (
          <GuildDetails 
            guild={selectedGuild} 
            onBack={() => setSelectedGuild(null)} 
            formatDate={formatDate}
            getLandName={getLandName}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {/* Guild Cards */}
            {guilds.length === 0 ? (
              <div className="col-span-full text-center py-10">
                <p className="text-amber-800 text-lg">No guilds found. Check back later.</p>
              </div>
            ) : (
              guilds.map((guild) => (
                <div 
                  key={guild.guildId} 
                  className="border-2 border-amber-600 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                  onClick={() => setSelectedGuild(guild)}
                >
                  {/* Guild Banner (full width) */}
                  <div 
                    className="h-48 w-full bg-cover bg-center" 
                    style={{ 
                      backgroundColor: guild.color || '#8B4513',
                      backgroundImage: guild.guildBanner ? `url(${guild.guildBanner})` : 'none',
                      position: 'relative'
                    }}
                  >
                    {/* Guild Emblem overlay */}
                    {guild.guildEmblem && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <img 
                          src={guild.guildEmblem} 
                          alt={`${guild.guildName} emblem`} 
                          className="h-24 w-24 object-contain"
                        />
                      </div>
                    )}
                    
                    {/* Guild Name overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2">
                      <h3 className="text-xl font-serif">{guild.guildName}</h3>
                    </div>
                  </div>
                  
                  {/* Guild Details */}
                  <div className="p-4">
                    <div className="flex flex-wrap justify-between mb-3">
                      <p className="text-sm text-amber-800 mr-4">
                        <span className="font-semibold">Patron Saint:</span> {guild.patronSaint || 'None'}
                      </p>
                      
                      <p className="text-sm text-amber-800">
                        <span className="font-semibold">Entry Fee:</span> {guild.entryFee ? `⚜️ ${Number(guild.entryFee).toLocaleString()} ducats` : 'None'}
                      </p>
                    </div>
                    
                    <p className="text-sm text-gray-700 mt-3 line-clamp-6">
                      {/* Use ShortDescription with more lines visible */}
                      {guild.shortDescription || guild.description || 'No description available.'}
                    </p>
                    
                    <button 
                      className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGuild(guild);
                      }}
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface GuildDetailsProps {
  guild: Guild;
  onBack: () => void;
  formatDate: (dateString: string) => string;
  getLandName: (locationId: string) => string;
}

function GuildDetails({ guild, onBack, formatDate, getLandName }: GuildDetailsProps) {
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [showApplicationModal, setShowApplicationModal] = useState<boolean>(false);
  const [applicationText, setApplicationText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [citizenGuildId, setCitizenGuildId] = useState<string | null>(null);
  const [showGuildManagementPanel, setShowGuildManagementPanel] = useState<boolean>(false);

  // Fetch guild members when the component mounts
  useEffect(() => {
    async function fetchGuildMembers() {
      try {
        setLoadingMembers(true);
        const response = await fetch(`/api/guild-members/${guild.guildId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch guild members: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setMembers(data.members || []);
        setMembersError(null);
      } catch (error) {
        console.error('Error fetching guild members:', error);
        setMembersError('Failed to load guild members');
      } finally {
        setLoadingMembers(false);
      }
    }

    fetchGuildMembers();
  }, [guild.guildId]);
  
  // Check if the current citizen is already in a guild
  useEffect(() => {
    const updateCitizenGuild = () => {
      const savedProfile = localStorage.getItem('citizenProfile');
      if (savedProfile) {
        try {
          const profile = JSON.parse(savedProfile);
          if (profile.guildId) {
            setCitizenGuildId(profile.guildId);
            // console.log(`[GuildDetails] Citizen's Guild ID from localStorage: ${profile.guildId} (for viewed guild: ${guild.guildId})`);
          } else {
            setCitizenGuildId(null); // Explicitly set to null if not found in profile
            // console.log(`[GuildDetails] No guildId in citizenProfile (for viewed guild: ${guild.guildId})`);
          }
        } catch (error) {
          console.error('[GuildDetails] Error parsing citizen profile:', error);
          setCitizenGuildId(null); // Set to null on error
        }
      } else {
        setCitizenGuildId(null); // No profile in localStorage
        // console.log(`[GuildDetails] No citizenProfile in localStorage (for viewed guild: ${guild.guildId})`);
      }
    };

    updateCitizenGuild(); // Initial check when guild.guildId changes or component mounts

    // Listen for profile updates from other parts of the app
    const handleProfileUpdate = () => {
      // console.log('[GuildDetails] citizenProfileUpdated event received. Re-checking guild membership.');
      updateCitizenGuild();
    };

    window.addEventListener('citizenProfileUpdated', handleProfileUpdate);

    // Cleanup listener when component unmounts or guild.guildId changes (before effect re-runs)
    return () => {
      window.removeEventListener('citizenProfileUpdated', handleProfileUpdate);
    };
  }, [guild.guildId]); // Re-run when the viewed guild changes

  // Debugging logs (optional, can be removed after verification)
  // console.log(`[GuildDetails Render] Current citizenGuildId: '${citizenGuildId}', Viewed guild.guildId: '${guild.guildId}', Is member? ${citizenGuildId === guild.guildId}`);

  // Add this log for debugging
  console.log(
    `[GuildDetails DEBUG] Render check for guild "${guild?.guildName}" (ID: "${guild?.guildId}"): 
    Citizen's Guild ID from state (citizenGuildId): "${citizenGuildId}"
    Is member (citizenGuildId === guild.guildId): ${citizenGuildId === guild.guildId}`
  );

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header with banner image */}
      <div 
        className="h-48 bg-cover bg-center relative"
        style={{ 
          backgroundColor: guild.color || '#8B4513',
          backgroundImage: guild.guildBanner ? `url(${guild.guildBanner})` : 'none'
        }}
      >
        {/* Back button */}
        <button 
          onClick={onBack}
          className="absolute top-4 left-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        {/* Guild emblem */}
        {guild.guildEmblem && (
          <div className="absolute top-4 right-4 h-20 w-20 bg-white/80 rounded-full p-2 flex items-center justify-center">
            <img 
              src={guild.guildEmblem} 
              alt={`${guild.guildName} emblem`} 
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        
        {/* Guild name overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
          <h2 className="text-3xl font-serif text-white">{guild.guildName}</h2>
          <p className="text-white/80 italic">
            Est. {formatDate(guild.createdAt) || 'Unknown'}
          </p>
        </div>
      </div>
      
      {/* Guild details */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-serif text-amber-800 mb-4">About the Guild</h3>
            {/* Use ReactMarkdown for the description */}
            <div className="text-gray-700 mb-4 prose prose-amber max-w-none">
              <ReactMarkdown>
                {guild.description || 'No description available.'}
              </ReactMarkdown>
            </div>
            
            <h4 className="text-lg font-serif text-amber-700 mt-6 mb-2">Location</h4>
            <p className="text-gray-700">
              {getLandName(guild.primaryLocation) || 'Various locations throughout Venice'}
            </p>
            
            <h4 className="text-lg font-serif text-amber-700 mt-6 mb-2">Patron Saint</h4>
            <p className="text-gray-700">{guild.patronSaint || 'None'}</p>
          </div>
          
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <h3 className="text-xl font-serif text-amber-800 mb-4">Guild Information</h3>
            
            {/* Members Section */}
            <div className="mb-4">
              <h4 className="font-semibold text-amber-700 text-sm mb-2">Members</h4>
              
              {loadingMembers ? (
                <div className="flex justify-center items-center h-20">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-600"></div>
                </div>
              ) : membersError ? (
                <p className="text-xs text-red-600">{membersError}</p>
              ) : members.length === 0 ? (
                <p className="text-xs">No members found</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {members.map(member => (
                    <div key={member.citizenId} className="flex items-center space-x-2">
                      {member.coatOfArmsImageUrl ? (
                        <img 
                          src={member.coatOfArmsImageUrl} 
                          alt={`${member.firstName} ${member.lastName}'s coat of arms`}
                          className="w-8 h-8 rounded-full object-cover"
                          style={{ backgroundColor: member.color || '#8B4513' }}
                        />
                      ) : (
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: member.color || '#8B4513' }}
                        >
                          {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                        </div>
                      )}
                      <div className="text-xs">
                        <p className="font-medium">{member.username}</p>
                        <p className="text-gray-600">{member.firstName} {member.lastName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Visit Guild button - always visible */}
              <div className="mt-4">
                <button
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                  onClick={() => setShowGuildManagementPanel(true)}
                >
                  Visit
                </button>
              </div>

              {/* Guild Management Panel Modal */}
              {showGuildManagementPanel && (
                <GuildManagementPanel
                  guild={guild}
                  onClose={() => setShowGuildManagementPanel(false)}
                />
              )}
              
              {/* Guild Application Modal */}
              {showApplicationModal && !citizenGuildId && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-lg w-[800px] max-w-[95vw] max-h-[90vh] border-4 border-amber-700 overflow-hidden">
                    <div className="bg-amber-700 text-white p-4 flex justify-between items-center">
                      <h3 className="text-xl font-serif">Application to {guild.guildName}</h3>
                      <button 
                        onClick={() => setShowApplicationModal(false)}
                        className="text-white hover:text-amber-200 transition-colors"
                      >
                        <FaTimes size={20} />
                      </button>
                    </div>
                    
                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
                      <div className="mb-6">
                        <h4 className="text-lg font-serif text-amber-800 mb-2">Guild Information</h4>
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-4">
                          <p className="mb-2"><span className="font-semibold">Guild Name:</span> {guild.guildName}</p>
                          <p className="mb-2"><span className="font-semibold">Patron Saint:</span> {guild.patronSaint || 'None'}</p>
                          <p className="mb-2"><span className="font-semibold">Entry Fee:</span> {guild.entryFee ? `⚜️ ${Number(guild.entryFee).toLocaleString()} ducats` : 'None'}</p>
                          <p className="mb-2"><span className="font-semibold">Location:</span> {getLandName(guild.primaryLocation)}</p>
                          <p><span className="font-semibold">Leadership:</span> {guild.leadershipStructure || 'Traditional guild structure'}</p>
                        </div>
                        
                        <h4 className="text-lg font-serif text-amber-800 mb-2">Your Application</h4>
                        <p className="text-sm text-amber-700 mb-4">
                          Please write your application to join the {guild.guildName}. Explain why you wish to join and what skills or contributions you can offer.
                        </p>
                        
                        <textarea
                          value={applicationText}
                          onChange={(e) => setApplicationText(e.target.value)}
                          className="w-full h-64 p-4 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4 font-serif"
                          placeholder="Write your application here..."
                        />
                        
                        <div className="flex justify-between items-center">
                          <button
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center"
                            onClick={() => {
                              // Create guild info for the system prompt
                              const guildInfo = `
Guild Name: ${guild.guildName}
Description: ${guild.description}
Patron Saint: ${guild.patronSaint || 'None'}
Entry Fee: ${guild.entryFee ? `${guild.entryFee} ducats` : 'None'}
Leadership Structure: ${guild.leadershipStructure || 'Traditional guild structure'}
Voting System: ${guild.votingSystem || 'Standard guild voting'}
Meeting Frequency: ${guild.meetingFrequency || 'As needed'}
                              `;
                              
                              // Dispatch events directly instead of relying on page.tsx handlers
                              // First open the chat
                              window.dispatchEvent(new CustomEvent('openCompagnoChat'));
                              
                              // Then send the message with a slight delay
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('sendCompagnoMessage', {
                                  detail: {
                                    message: `Hey Compagno, can you help me to apply to the ${guild.guildName} Guild?`,
                                    addSystem: `The citizen is asking about applying to a guild in Venice. Here is information about the guild they're interested in:\n${guildInfo}\n\nHelp them understand the application process, requirements, and benefits of joining this guild. Be encouraging but also explain any obligations or fees they should be aware of.`
                                  }
                                }));
                              }, 200);
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            Get Help with Application
                          </button>
                          
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setShowApplicationModal(false)}
                              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                            >
                              Cancel
                            </button>
                            
                            <button
                              onClick={async () => {
                                setIsSubmitting(true);
                                try {
                                  // Get the current citizen profile from localStorage
                                  const savedProfile = localStorage.getItem('citizenProfile');
                                  if (!savedProfile) {
                                    throw new Error('Citizen profile not found. Please create a profile first.');
                                  }
                                  
                                  const profile = JSON.parse(savedProfile);
                                  const username = profile.username;
                                  
                                  if (!username) {
                                    throw new Error('Username not found in profile.');
                                  }
                                  
                                  // 1. Send a message to the guild (as a guild application)
                                  const messageResponse = await fetch('/api/messages/send', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      sender: username,
                                      receiver: guild.guildId,
                                      content: applicationText,
                                      type: 'guild_application'
                                    }),
                                  });
                                  
                                  if (!messageResponse.ok) {
                                    throw new Error('Failed to send application message');
                                  }
                                  
                                  const messageData = await messageResponse.json();
                                  
                                  // 2. Update the citizen's guild membership status to pending
                                  const citizenUpdateResponse = await fetch('/api/citizens/update-guild', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      username: username,
                                      guildId: guild.guildId,
                                      status: 'pending'
                                    }),
                                  });
                                  
                                  if (!citizenUpdateResponse.ok) {
                                    throw new Error('Failed to update citizen guild status');
                                  }
                                  
                                  // Show success message
                                  alert(`Your application to the ${guild.guildName} has been submitted successfully! The guild masters will review your application and contact you soon.`);
                                  
                                  // Reset form and close modal
                                  setApplicationText('');
                                  setShowApplicationModal(false);
                                } catch (error) {
                                  console.error('Error submitting guild application:', error);
                                  alert(`There was an error submitting your application: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                } finally {
                                  setIsSubmitting(false);
                                }
                              }}
                              disabled={isSubmitting || !applicationText.trim()}
                              className={`px-4 py-2 rounded-md flex items-center ${
                                isSubmitting || !applicationText.trim()
                                  ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                            >
                              {isSubmitting ? (
                                <>
                                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Submitting...
                                </>
                              ) : (
                                'Submit Application'
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Make the guild information text smaller */}
            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Leadership Structure</h4>
                <p>{guild.leadershipStructure || 'Traditional guild structure'}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Entry Fee</h4>
                <p>{guild.entryFee ? `⚜️ ${Number(guild.entryFee).toLocaleString()} ducats` : 'No fee required'}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Voting System</h4>
                <p>{guild.votingSystem || 'Standard guild voting'}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Meeting Frequency</h4>
                <p>{guild.meetingFrequency || 'As needed'}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Guild Hall</h4>
                <p>{guild.guildHallId ? 'Located in Venice' : 'No permanent guild hall'}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="text-xl font-serif text-amber-800 mb-4">Guild Activities</h3>
          <p className="text-gray-700">
            The guild organizes regular meetings, training for apprentices, quality control of products, 
            and represents its members' interests before the Venetian government.
          </p>
        </div>
      </div>
    </div>
  );
}
