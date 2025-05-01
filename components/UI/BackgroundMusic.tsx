'use client';

import { useState, useEffect, useRef } from 'react';

interface BackgroundMusicProps {
  initialVolume?: number; // 0 to 1
  autoplay?: boolean;
}

const BackgroundMusic: React.FC<BackgroundMusicProps> = ({ 
  initialVolume = 0.3, 
  autoplay = true 
}) => {
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [volume, setVolume] = useState(initialVolume);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [tracks, setTracks] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showControls, setShowControls] = useState(false);

  // Load available tracks
  useEffect(() => {
    const loadTracks = async () => {
      try {
        // Fetch the list of music files from the server
        const response = await fetch('/api/music-tracks');
        if (response.ok) {
          const data = await response.json();
          if (data.tracks && Array.isArray(data.tracks)) {
            setTracks(data.tracks);
            setIsLoading(false);
          }
        } else {
          console.error('Failed to load music tracks');
          // Fallback to hardcoded tracks if API fails
          setTracks([
            '/music/venetian_boat_song.mp3',
            '/music/venetian_carnival.mp3',
            '/music/venetian_gondola.mp3',
            '/music/venetian_palace.mp3',
            '/music/venetian_waltz.mp3'
          ]);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error loading music tracks:', error);
        // Fallback to hardcoded tracks if API fails
        setTracks([
          '/music/venetian_boat_song.mp3',
          '/music/venetian_carnival.mp3',
          '/music/venetian_gondola.mp3',
          '/music/venetian_palace.mp3',
          '/music/venetian_waltz.mp3'
        ]);
        setIsLoading(false);
      }
    };

    loadTracks();
  }, []);

  // Play a random track
  const playRandomTrack = () => {
    if (tracks.length === 0) return;
    
    // Get a random track that's different from the current one
    let newTrack;
    if (tracks.length === 1) {
      newTrack = tracks[0];
    } else {
      do {
        const randomIndex = Math.floor(Math.random() * tracks.length);
        newTrack = tracks[randomIndex];
      } while (newTrack === currentTrack && tracks.length > 1);
    }
    
    setCurrentTrack(newTrack);
    
    if (audioRef.current) {
      audioRef.current.src = newTrack;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(error => {
        console.error('Error playing audio:', error);
        // If autoplay is blocked, we'll need user interaction
        setIsPlaying(false);
      });
    }
  };

  // Initialize audio and play first track
  useEffect(() => {
    if (!isLoading && tracks.length > 0 && isPlaying && !currentTrack) {
      // Instead of immediately trying to play, set up the audio element first
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const firstTrack = tracks[randomIndex];
      setCurrentTrack(firstTrack);
      
      if (audioRef.current) {
        audioRef.current.src = firstTrack;
        audioRef.current.volume = volume;
        
        // Try to play, but handle the autoplay restriction gracefully
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            // This will happen if autoplay is blocked
            console.log('Autoplay prevented by browser:', error);
            // Update state to show the correct play/pause button
            setIsPlaying(false);
            // Show a visual indicator that music is available
            setShowControls(true); // Automatically show controls when autoplay is blocked
            
            // Hide controls after a few seconds
            setTimeout(() => {
              setShowControls(false);
            }, 5000);
          });
        }
      }
    }
  }, [isLoading, tracks, isPlaying, currentTrack, volume]);

  // Handle track ending - play next random track
  useEffect(() => {
    const audio = audioRef.current;
    
    const handleEnded = () => {
      playRandomTrack();
    };
    
    if (audio) {
      audio.addEventListener('ended', handleEnded);
      return () => {
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [tracks, currentTrack]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Toggle play/pause
  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      if (currentTrack) {
        audioRef.current?.play().catch(console.error);
      } else {
        playRandomTrack();
      }
    }
    setIsPlaying(!isPlaying);
  };

  // Skip to next track
  const nextTrack = () => {
    playRandomTrack();
  };

  // Format track name for display
  const formatTrackName = (track: string | null) => {
    if (!track) return 'No track selected';
    
    // Remove path and extension
    const fileName = track.split('/').pop() || '';
    const nameWithoutExt = fileName.replace('.mp3', '');
    
    // Replace underscores with spaces and capitalize words
    return nameWithoutExt
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Hidden audio element */}
      <audio ref={audioRef} />
      
      {/* Music control button */}
      <div className="relative">
        <button 
          onClick={() => setShowControls(!showControls)}
          className={`bg-amber-700 text-white p-3 rounded-full shadow-lg hover:bg-amber-800 transition-colors ${!isPlaying && currentTrack ? 'animate-pulse' : ''}`}
          title={isPlaying ? "Music Controls" : "Click to Play Music"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </button>
        
        {/* Expanded controls */}
        {showControls && (
          <div className="absolute bottom-14 right-0 bg-amber-50 p-4 rounded-lg shadow-xl border-2 border-amber-300 w-64">
            <div className="flex flex-col space-y-3">
              <div className="text-center font-medium text-amber-800 mb-1">
                {isLoading ? 'Loading music...' : formatTrackName(currentTrack)}
              </div>
              
              <div className="flex justify-center space-x-4">
                <button 
                  onClick={togglePlayPause}
                  className="bg-amber-600 text-white p-2 rounded-full hover:bg-amber-700 transition-colors"
                  disabled={isLoading}
                >
                  {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                
                <button 
                  onClick={nextTrack}
                  className="bg-amber-600 text-white p-2 rounded-full hover:bg-amber-700 transition-colors"
                  disabled={isLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              
              <div className="flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 010-7.072m12.728 0l-3.536 3.536m-7.07-7.072L11.243 8.5" />
                </svg>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-amber-600"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackgroundMusic;
