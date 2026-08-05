import React, { useState, useEffect } from 'react';
import { FaBook, FaTimes } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ArtworkFile {
  path: string;
  type?: 'file' | 'directory';
  size: number;
  last_modified: string;
  content?: string;
  is_binary?: boolean;
  name: string;
  artist?: string;
  url?: string;
  source?: 'kinos' | 'generated_painting';
  [key: string]: any;
}

interface Artist {
  username: string;
  firstName?: string;
  lastName?: string;
  socialClass?: string;
  coatOfArms?: string | null;
  clout: number;
  Ducats?: number;
  familyMotto?: string;
  Specialty?: string;
}

interface ArtistiRegistryTabProps {
  onViewProfile: (citizen: any) => void;
  currentUsername: string | null;
}

const ArtistiRegistryTab: React.FC<ArtistiRegistryTabProps> = ({ onViewProfile, currentUsername }) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [allArtworks, setAllArtworks] = useState<ArtworkFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkFile | null>(null);
  const [isArtworkModalOpen, setIsArtworkModalOpen] = useState<boolean>(false);

  const handleArtworkClick = (artwork: ArtworkFile) => {
    setSelectedArtwork(artwork);
    setIsArtworkModalOpen(true);
  };

  const closeArtworkModal = () => {
    setIsArtworkModalOpen(false);
    setSelectedArtwork(null);
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const artistsResponse = await fetch('/api/get-artists');
        if (!artistsResponse.ok) {
          throw new Error(`Failed to fetch artists: ${artistsResponse.statusText}`);
        }
        const artistsData = await artistsResponse.json();
        if (artistsData.success && Array.isArray(artistsData.artists)) {
          setArtists(artistsData.artists);
        } else {
          throw new Error(artistsData.error || 'Invalid data format for artists');
        }

        const artworksResponse = await fetch('/api/get-artworks');
        if (!artworksResponse.ok) {
          throw new Error(`Failed to fetch artworks: ${artworksResponse.statusText}`);
        }
        const artworksData = await artworksResponse.json();
        if (artworksData.success && Array.isArray(artworksData.artworks)) {
          setAllArtworks(artworksData.artworks);
        } else {
          throw new Error(artworksData.error || 'Invalid data format for artworks');
        }

      } catch (err: any) {
        setError(err.message);
        console.error("Error fetching data for Artisti tab:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleViewProfileClick = (artist: Artist) => {
    const profileData = {
      username: artist.username,
      firstName: artist.firstName,
      lastName: artist.lastName,
      coatOfArmsImageUrl: artist.coatOfArms,
      familyMotto: artist.familyMotto,
      Ducats: artist.Ducats,
      socialClass: artist.socialClass,
      isCurrentUser: artist.username === currentUsername,
      citizenId: artist.username,
      ...artist
    };
    onViewProfile(profileData);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-amber-800">Loading artists and their masterpieces...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-red-600">Error loading artists: {error}</div>
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-amber-800">No artists found in the registry.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-6">
        {artists.map((artist) => {
          const artistArtworks = allArtworks.filter(artwork => artwork.artist === artist.username);

          return (
            <div
              key={artist.username}
              className="bg-white rounded-lg shadow-lg p-4 border border-amber-200 hover:shadow-xl transition-shadow duration-300 ease-in-out"
            >
              {/* Top section */}
              <div className="flex items-center space-x-4">
                {/* Citizen Image */}
                <div className="flex-shrink-0 w-32 h-32 rounded-lg border-2 border-amber-600 shadow-md overflow-hidden">
                  <img
                    src={`/public_assets/images/citizens/${artist.username || 'default'}.jpg`}
                    alt={`${artist.firstName || ''} ${artist.lastName || ''}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/public_assets/images/citizens/default.jpg';
                    }}
                  />
                </div>

                <div className="flex-1">
                  <h3 className="text-lg font-serif font-bold text-amber-900">
                    {artist.firstName || ''} {artist.lastName || ''}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{artist.username}</p>

                  {/* Clout */}
                  <div className="mt-3">
                    <div className="inline-block bg-purple-100 text-purple-800 px-3 py-1 rounded-full shadow-sm">
                      <span className="text-sm font-semibold">Clout: </span>
                      <span className="text-sm font-bold">{Math.floor(artist.clout).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Coat of Arms */}
                {artist.coatOfArms && (
                  <div className="flex-shrink-0 w-16 h-16 rounded-full border border-amber-300 overflow-hidden ml-auto mr-4">
                    <img
                      src={artist.coatOfArms}
                      alt="Coat of Arms"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/public_assets/images/coat-of-arms/default.png';
                      }}
                    />
                  </div>
                )}

                {/* View Profile Button */}
                <div className="ml-auto">
                  <button
                    onClick={() => handleViewProfileClick(artist)}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    View Profile
                  </button>
                </div>
              </div> {/* Fin de la "flex items-center" */}

              {/* Artworks List */}
              {artist.Specialty?.toLowerCase() !== 'painter' && (
                <div className="mt-4 pt-4 border-t border-amber-100">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2">Artworks:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {artistArtworks.map((artwork, index) => (
                      <div
                        key={`${artwork.path || artwork.url || artwork.name}-${index}`}
                        className="flex flex-col items-center space-y-1 bg-amber-50 p-2 rounded-lg border border-amber-300 hover:bg-amber-100 cursor-pointer transition-colors shadow-sm hover:shadow-md"
                        title={`View artwork: ${artwork.name}`}
                        onClick={() => handleArtworkClick(artwork)}
                      >
                        <FaBook className="text-amber-700 h-8 w-8" />
                        <span className="text-xs text-amber-900 text-center break-words w-full">{artwork.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Artwork Modal */}
      {isArtworkModalOpen && selectedArtwork && (
        <div
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 sm:p-8"
          onClick={closeArtworkModal}
        >
          <div
            className="bg-amber-50 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] max-h-[800px] flex flex-col overflow-hidden border-4 border-amber-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 bg-amber-700 text-white flex-shrink-0">
              <h3 className="text-xl font-serif">{selectedArtwork.name}</h3>
              <button
                onClick={closeArtworkModal}
                className="text-amber-200 hover:text-white transition-colors"
                aria-label="Close artwork view"
              >
                <FaTimes size={24} />
              </button>
            </div>
            <div className="p-16 overflow-y-auto flex-grow custom-scrollbar-thin prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none">
              {selectedArtwork.is_binary ? (
                selectedArtwork.url ? (
                  <img
                    src={selectedArtwork.url}
                    alt={selectedArtwork.name}
                    className="max-w-full mx-auto"
                  />
                ) : (
                  <p>Binary artwork with no displayable content.</p>
                )
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {selectedArtwork.content || 'No content available.'}
                </ReactMarkdown>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ArtistiRegistryTab;
