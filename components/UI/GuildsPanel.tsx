import React, { useState, useEffect } from 'react';
import { fetchGuilds, Guild } from '@/lib/airtableUtils';
import ReactMarkdown from 'react-markdown';

interface GuildsPanelProps {
  onClose: () => void;
  standalone?: boolean;
}

// Define the GuildMember interface
interface GuildMember {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImage: string | null;
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
        const polygon = window.__polygonData.find(p => p.id === locationId);
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
    <div className={`${standalone ? 'p-8' : 'absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-40 rounded-lg p-4 overflow-auto'}`}>
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
                    <div key={member.userId} className="flex items-center space-x-2">
                      {member.coatOfArmsImage ? (
                        <img 
                          src={member.coatOfArmsImage} 
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
              
              {/* Apply for Membership button right after members list */}
              <button 
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors w-full"
                onClick={() => {
                  // This would be where you'd handle joining the guild
                  alert('Guild membership application will be available soon!');
                }}
              >
                Apply for Membership
              </button>
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
