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
    
    // Single reliable timer
    const timer = setTimeout(() => {
      console.log('LoadingScreen: Forcing completion after timeout');
      completeLoading();
    }, Math.min(duration, 5000)); // Cap at 5 seconds maximum
    
    // Add visibility change detection as a backup
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('LoadingScreen: Document became visible');
        // Small delay to allow rendering
        setTimeout(completeLoading, 300);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also trigger completion when images load or fail
    const handleImageLoad = () => {
      console.log('LoadingScreen: Image loaded');
      // Small delay to allow rendering
      setTimeout(completeLoading, 300);
    };
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [duration, onLoadingComplete]);

  useEffect(() => {
    // Function to get random loading image - simplified with better error handling
    const getRandomLoadingImage = async () => {
      try {
        console.log('Fetching loading images from API...');
        
        // Set a timeout for the fetch operation
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        // Fetch the list of files from the loading directory
        const response = await fetch('/api/list-loading-images', {
          signal: controller.signal
        }).catch(error => {
          console.warn('Fetch failed, using fallback image:', error);
          return null;
        });
        
        clearTimeout(timeoutId);
        
        // If fetch failed or response is not ok, use fallback immediately
        if (!response || !response.ok) {
          console.warn('API response not ok, using fallback image');
          setLoadingImage('/loading/fallback.jpg');
          return;
        }
        
        const data = await response.json().catch(error => {
          console.warn('Failed to parse JSON, using fallback image:', error);
          return null;
        });
        
        // If data parsing failed or no images, use fallback
        if (!data || !data.success || !data.images || data.images.length === 0) {
          console.warn('No valid images in API response, using fallback');
          setLoadingImage('/loading/fallback.jpg');
          return;
        }
        
        // Select a random image from the returned list
        const randomImage = data.images[Math.floor(Math.random() * data.images.length)];
        console.log('Selected loading image:', randomImage);
        
        // Use a static fallback image path that we know exists
        const fallbackImagePath = '/loading/fallback.jpg';
        
        // Set fallback immediately so something shows
        setLoadingImage(fallbackImagePath);
        
        // Then try to load the random image
        const img = new window.Image();
        
        img.onload = () => {
          console.log('Image loaded successfully:', randomImage);
          setLoadingImage(randomImage);
          setImageError(false);
        };
        
        img.onerror = (e) => {
          console.error('Error preloading image:', randomImage, e);
          // Keep using the fallback that's already set
        };
        
        // Start loading the image
        img.src = randomImage;
        
      } catch (error) {
        console.error('Critical error in loading screen:', error);
        setHasError(true);
        setImageError(true);
        setLoadingImage('/loading/fallback.jpg');
      }
    };

    // Call the function to get a random image
    getRandomLoadingImage();

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
        <div className="absolute inset-0 overflow-hidden">
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
        <div className="absolute inset-0 bg-amber-900">
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
