import React, { useEffect, useState } from 'react';
import NextImage from 'next/image';

interface LoadingScreenProps {
  onLoadingComplete: () => void;
  duration?: number; // in milliseconds
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  onLoadingComplete, 
  duration = 5000 // Changed from 3000 to 5000 (5 seconds)
}) => {
  const [loadingImage, setLoadingImage] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [imageReadyForDisplay, setImageReadyForDisplay] = useState(false); // New state for fade-in

const CACHE_KEY_LOADING_IMAGES = 'loadingImagesList';
const CACHE_DURATION_LOADING_IMAGES = 60 * 60 * 1000; // 1 heure en millisecondes
  
  // Force completion after the specified duration - simplified and more robust
  useEffect(() => {
    console.log('LoadingScreen: Setting up forced completion timer');
    
    // Set a flag to track if we've already completed
    let hasCompleted = false;
    
    const completeLoading = () => {
      if (!hasCompleted) {
        console.log('LoadingScreen: Completing loading');
        hasCompleted = true;
        onLoadingComplete();
      }
    };
    
    // Single reliable timer with a longer timeout
    const timer = setTimeout(() => {
      console.log('LoadingScreen: Forcing completion after timeout');
      completeLoading();
    }, duration); // Use the full duration
    
    // Add visibility change detection as a backup
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('LoadingScreen: Document became visible');
        // Small delay to allow rendering
        setTimeout(completeLoading, 1000); // Increased from 300ms to 1000ms
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also trigger completion when images load or fail
    const handleImageLoad = () => {
      console.log('LoadingScreen: Image loaded');
      // Small delay to allow rendering
      setTimeout(completeLoading, 1000); // Increased from 300ms to 1000ms
    };
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [duration, onLoadingComplete]);

  useEffect(() => {
    const setLoadingImageWithFallback = (imageUrl: string) => {
      const fallbackImagePath = '/loading/fallback.jpg';
      setLoadingImage(fallbackImagePath); // Set fallback immediately

      const img = new window.Image();
      img.onload = () => {
        console.log('LoadingScreen: Image loaded successfully:', imageUrl);
        setLoadingImage(imageUrl);
        setImageError(false);
        setImageReadyForDisplay(true); // Image is ready for display
      };
      img.onerror = (e) => {
        console.error('LoadingScreen: Error preloading image:', imageUrl, e);
        // Fallback is already set.
      };
      img.src = imageUrl;
    };

    const fetchAndSetRandomImage = async () => {
      try {
        console.log('LoadingScreen: Fetching loading images from API...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch('/api/list-loading-images', {
          signal: controller.signal
        }).catch(error => {
          console.warn('LoadingScreen: Fetch failed, using fallback image:', error);
          return null;
        });
        clearTimeout(timeoutId);

        if (!response || !response.ok) {
          console.warn('LoadingScreen: API response not ok, using fallback image');
          setLoadingImage('/loading/fallback.jpg'); // Direct fallback
          return;
        }

        const data = await response.json().catch(error => {
          console.warn('LoadingScreen: Failed to parse JSON, using fallback image:', error);
          return null;
        });

        if (!data || !data.success || !data.images || data.images.length === 0) {
          console.warn('LoadingScreen: No valid images in API response, using fallback');
          setLoadingImage('/loading/fallback.jpg'); // Direct fallback
          return;
        }

        // Store in cache
        localStorage.setItem(CACHE_KEY_LOADING_IMAGES, JSON.stringify({ images: data.images, timestamp: Date.now() }));
        const randomImage = data.images[Math.floor(Math.random() * data.images.length)];
        console.log('LoadingScreen: Selected loading image from API:', randomImage);
        setLoadingImageWithFallback(randomImage);

      } catch (error) {
        console.error('LoadingScreen: Critical error fetching/processing image list:', error);
        setHasError(true);
        setImageError(true);
        setLoadingImage('/loading/fallback.jpg'); // Direct fallback
      }
    };

    const initializeLoadingImage = async () => {
      try {
        const cachedDataJSON = localStorage.getItem(CACHE_KEY_LOADING_IMAGES);
        if (cachedDataJSON) {
          const cachedData = JSON.parse(cachedDataJSON);
          if (cachedData && cachedData.images && Array.isArray(cachedData.images) && cachedData.images.length > 0 && (Date.now() - cachedData.timestamp < CACHE_DURATION_LOADING_IMAGES)) {
            console.log('LoadingScreen: Using cached loading images list.');
            const randomImage = cachedData.images[Math.floor(Math.random() * cachedData.images.length)];
            setLoadingImageWithFallback(randomImage);
            return;
          } else {
            console.log('LoadingScreen: Cached image list is stale or invalid, fetching from API.');
          }
        }
      } catch (cacheError) {
        console.warn('LoadingScreen: Error reading or parsing cache, fetching from API.', cacheError);
      }
      // If cache miss, stale, or error, fetch from API
      await fetchAndSetRandomImage();
    };

    initializeLoadingImage();

    // Set up progress animation with smoother easing
    const startTime = Date.now();
    const endTime = startTime + duration;

    const updateProgress = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      
      // Use a smoother easing function (cubic easing out)
      // This creates a more natural acceleration/deceleration effect
      const t = Math.min(1, elapsed / duration);
      const easedProgress = 1 - Math.pow(1 - t, 3); // Cubic easing out
      const newProgress = easedProgress * 100;
      
      setProgress(newProgress);
      
      if (currentTime < endTime) {
        // Use a higher frequency for smoother updates
        requestAnimationFrame(updateProgress);
      } else {
        // Ensure we reach exactly 100% at the end
        setProgress(100);
        // When duration is complete, call the callback
        onLoadingComplete();
      }
    };

    // Start the animation
    requestAnimationFrame(updateProgress);
  }, [duration, onLoadingComplete]);

  // Log render state
  console.log('Rendering LoadingScreen with:', {
    loadingImage,
    imageError,
    progress
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      {/* Background image with overlay */}
      {loadingImage && !imageError && (
        <div 
          className="absolute inset-0 overflow-hidden transition-opacity duration-1000 ease-in-out"
          style={{ opacity: imageReadyForDisplay ? 1 : 0 }} // Control opacity for fade-in
        >
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url(${loadingImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
          <div className="absolute inset-0 bg-black bg-opacity-40"></div>
        </div>
      )}
      
      {/* Fallback background if no image loads */}
      {(!loadingImage || imageError) && (
        <div 
          className="absolute inset-0 bg-amber-900 transition-opacity duration-1000 ease-in-out"
          style={{ opacity: imageReadyForDisplay ? 1 : 0 }} // Control opacity for fade-in
        >
          {/* Fallback background */}
        </div>
      )}
      
      {/* Content */}
      <div className="relative z-10 text-center px-4">
        <h1 className="text-4xl md:text-6xl font-serif text-amber-100 mb-4">
          La Serenissima
        </h1>
        <p className="text-xl md:text-2xl text-amber-200 italic mb-8">
          The Most Serene Republic of Venice
        </p>
        
        {/* Progress bar with smoother transition */}
        <div className="w-64 md:w-96 h-2 bg-amber-900 rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-amber-500 transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        
        <p className="text-amber-300 text-sm">
          Preparing the beauty of Venice...
        </p>
      </div>
    </div>
  );
};

export default LoadingScreen;
