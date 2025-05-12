import React, { useState, useEffect } from 'react';
import { fetchGuilds, Guild } from '@/lib/airtableUtils';
import ReactMarkdown from 'react-markdown';

interface GuildsPanelProps {
  onClose: () => void;
  standalone?: boolean;
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
          <GuildDetails guild={selectedGuild} onBack={() => setSelectedGuild(null)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  {/* Guild Banner (2:1 aspect ratio) */}
                  <div 
                    className="h-40 bg-cover bg-center" 
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
                    <p className="text-sm text-amber-800 mb-2">
                      <span className="font-semibold">Patron Saint:</span> {guild.patronSaint || 'None'}
                    </p>
                    <p className="text-sm text-amber-800 mb-2">
                      <span className="font-semibold">Tier:</span> {guild.guildTier || 'Minor'}
                    </p>
                    <p className="text-sm text-amber-800 mb-2">
                      <span className="font-semibold">Entry Fee:</span> {guild.entryFee ? `${guild.entryFee} ducats` : 'None'}
                    </p>
                    <p className="text-sm text-gray-700 mt-3 line-clamp-3">
                      {/* Use ShortDescription instead of description */}
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
}

function GuildDetails({ guild, onBack }: GuildDetailsProps) {
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
          <p className="text-white/80 italic">{guild.guildTier || 'Minor'} Guild • Est. {guild.createdAt || 'Unknown'}</p>
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
            <p className="text-gray-700">{guild.primaryLocation || 'Various locations throughout Venice'}</p>
            
            <h4 className="text-lg font-serif text-amber-700 mt-6 mb-2">Patron Saint</h4>
            <p className="text-gray-700">{guild.patronSaint || 'None'}</p>
          </div>
          
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
            <h3 className="text-xl font-serif text-amber-800 mb-4">Guild Information</h3>
            
            {/* Make the guild information text smaller */}
            <div className="space-y-3 text-xs">
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Leadership Structure</h4>
                <p>{guild.leadershipStructure || 'Traditional guild structure'}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-amber-700 text-sm">Entry Fee</h4>
                <p>{guild.entryFee ? `${guild.entryFee} ducats` : 'No fee required'}</p>
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
          
          <div className="mt-6 flex justify-end">
            <button 
              className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              onClick={() => {
                // This would be where you'd handle joining the guild
                alert('Guild membership application will be available soon!');
              }}
            >
              Apply for Membership
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
