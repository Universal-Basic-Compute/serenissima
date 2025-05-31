'use client';

import { useState, useEffect, useRef } from 'react';

interface BackgroundMusicProps {
  initialVolume?: number; // 0 to 1
  autoplay?: boolean;
}

const BackgroundMusic: React.FC<BackgroundMusicProps> = ({ 
  initialVolume = 0.24, // Reduced from 0.3 to 0.24 (20% quieter)
  autoplay = true 
}) => {
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [volume, setVolume] = useState(initialVolume);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [tracks, setTracks] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
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
          // No fallback to hardcoded tracks, API must provide full URLs
          setTracks([]);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error loading music tracks:', error);
        // No fallback to hardcoded tracks, API must provide full URLs
        setTracks([]);
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
      // Get the current track path without domain/origin
      const currentTrackPath = currentTrack && !currentTrack.includes('Pausing') 
        ? currentTrack
        : null;
      
      do {
        const randomIndex = Math.floor(Math.random() * tracks.length);
        newTrack = tracks[randomIndex];
        // Make sure we don't play the same track twice in a row
      } while (newTrack === currentTrackPath && tracks.length > 1);
    }
    
    console.log(`Playing new track: ${newTrack}`);
    setCurrentTrack(newTrack);
    setIsPaused(false);
    
    if (audioRef.current) {
      audioRef.current.src = newTrack;
      audioRef.current.volume = volume;
      audioRef.current.play().catch(error => {
        console.error('Error playing audio:', error);
        // If autoplay is blocked, we'll need citizen interaction
        setIsPlaying(false);
      });
    }
    
    setIsPlaying(true);
  };

  // Initialize audio and play first track
  useEffect(() => {
    if (!isLoading && tracks.length > 0) {
      // Always set up a track, even if we're not sure we can play it yet
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const firstTrack = tracks[randomIndex];
      setCurrentTrack(firstTrack);
      
      if (audioRef.current) {
        audioRef.current.src = firstTrack;
        audioRef.current.volume = volume;
        audioRef.current.loop = true; // Enable looping for continuous play of the current track
        
        // Add a listener for when the citizen interacts with the page
        const handleCitizenInteraction = () => {
          if (!isPlaying && audioRef.current) {
            // Try to play on first citizen interaction
            audioRef.current.play()
              .then(() => {
                setIsPlaying(true);
                // Remove the event listeners once we've successfully started playing
                document.removeEventListener('click', handleCitizenInteraction);
                document.removeEventListener('keydown', handleCitizenInteraction);
                document.removeEventListener('touchstart', handleCitizenInteraction);
              })
              .catch(error => {
                console.error('Still could not play audio after citizen interaction:', error);
              });
          }
        };
        
        // Try to play immediately (this will likely fail due to autoplay restrictions)
        if (autoplay) {
          audioRef.current.play()
            .then(() => {
              setIsPlaying(true);
              console.log('Autoplay successful');
            })
            .catch(error => {
              // This is expected - autoplay is often blocked
              console.log('Autoplay prevented by browser (expected):', error);
              setIsPlaying(false);
              
              // Add event listeners to start playing on first citizen interaction
              document.addEventListener('click', handleCitizenInteraction);
              document.addEventListener('keydown', handleCitizenInteraction);
              document.addEventListener('touchstart', handleCitizenInteraction);
              
              // Show controls briefly to indicate music is available
              setShowControls(true);
              setTimeout(() => {
                setShowControls(false);
              }, 3000);
            });
        }
      }
    }
    
    // Cleanup function to remove event listeners
    return () => {
      document.removeEventListener('click', () => {});
      document.removeEventListener('keydown', () => {});
      document.removeEventListener('touchstart', () => {});
    };
  }, [isLoading, tracks, volume, autoplay]); // Remove isPlaying and currentTrack from dependencies

  // Handle track ending - play next random track immediately
  useEffect(() => {
    const audio = audioRef.current;
    
    const handleEnded = () => {
      console.log('Track ended, playing next random track.');
      playRandomTrack(); // Play the next random track immediately
    };
    
    if (audio) {
      // The 'ended' event will fire when a track finishes, even if loop is true.
      // However, with loop=true, the browser might restart the current track before 'ended' fully processes
      // for our custom logic. For changing tracks, we might need to rely on user action (next button)
      // or a more sophisticated playlist management if we want tracks to change automatically *after* looping.
      // For now, loop=true means the *same* track repeats. If we want a sequence, loop should be false,
      // and 'ended' event should indeed trigger playRandomTrack.
      // Let's assume the request "music should play in loop" means a playlist that loops,
      // so when one track ends, another starts. Thus, audioRef.current.loop should be false.
      
      // Re-evaluating: If "play in loop" means the *playlist* loops, then `audioRef.current.loop` should be `false`,
      // and the `ended` event is the correct place to call `playRandomTrack`.
      // The previous change to `audioRef.current.loop = true` might be a misinterpretation.
      // Let's revert that specific part and ensure `ended` plays the next track.

      // If `audioRef.current.loop` is true, this 'ended' event might not behave as expected for changing tracks.
      // If the goal is for the *playlist* to loop (i.e., play another random track when one finishes),
      // then `audioRef.current.loop` should be `false`.
      // Let's proceed with `audioRef.current.loop = false` and this `ended` handler.
      if (audioRef.current) audioRef.current.loop = false; // Ensure loop is false for track changes

      audio.addEventListener('ended', handleEnded);
      return () => {
        audio.removeEventListener('ended', handleEnded);
      };
    }
  }, [tracks, playRandomTrack]); // playRandomTrack is a dependency now

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
    <div className="relative">
      {/* Hidden audio element */}
      <audio ref={audioRef} />
      
      {/* Music control button - make it smaller and more elegant */}
      <button 
        onClick={() => setShowControls(!showControls)}
        className={`bg-amber-700 text-white p-2 rounded-full shadow-lg hover:bg-amber-800 transition-colors ${
          !isPlaying && currentTrack ? 'opacity-80' : ''
        }`}
        title={isPlaying ? "Music Controls" : "Click to Play Music"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </button>
      
      {/* Expanded controls - position to the left instead of below */}
      {showControls && (
        <div className="absolute top-0 right-10 bg-amber-50 p-4 rounded-lg shadow-xl border-2 border-amber-300 w-64 z-50">
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
  );
};

export default BackgroundMusic;
