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
  
  // Force completion after the specified duration
  useEffect(() => {
    console.log('LoadingScreen: Setting up forced completion timer');
    const timer = setTimeout(() => {
      console.log('LoadingScreen: Forcing completion after timeout');
      onLoadingComplete();
    }, duration);
    
    // Add a shorter backup timer as a failsafe
    const backupTimer = setTimeout(() => {
      console.log('LoadingScreen: Backup timer triggered');
      onLoadingComplete();
    }, Math.min(duration * 0.7, 3500)); // 70% of duration or max 3.5 seconds
    
    return () => {
      clearTimeout(timer);
      clearTimeout(backupTimer);
    };
  }, [duration, onLoadingComplete]);

  useEffect(() => {
    // Function to get random loading image
    const getRandomLoadingImage = async () => {
      try {
        console.log('Fetching loading images from API...');
        // Fetch the list of files from the loading directory
        const response = await fetch('/api/list-loading-images');
        console.log('API response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch loading images: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API response data:', data);
        
        if (data.success && data.images && data.images.length > 0) {
          // Select a random image from the returned list
          const randomImage = data.images[Math.floor(Math.random() * data.images.length)];
          console.log('Selected loading image:', randomImage);
          
          // Précharger l'image pour s'assurer qu'elle est disponible
          const img = new window.Image(); // Use the browser's native Image constructor
          console.log('Created Image object, starting to load:', randomImage);
          
          img.onload = () => {
            console.log('Image loaded successfully:', randomImage);
            setLoadingImage(randomImage);
            setImageError(false);
          };
          
          img.onerror = (e) => {
            console.error('Error preloading image:', randomImage, e);
            setImageError(true);
            setLoadingImage('/loading/fallback.jpg');
          };
          
          // Add a timeout to detect if image loading takes too long
          const timeoutId = setTimeout(() => {
            console.warn('Image loading timeout for:', randomImage);
            if (!loadingImage) {
              setImageError(true);
              setLoadingImage('/loading/fallback.jpg');
            }
          }, 5000);
          
          img.src = randomImage;
        } else {
          // Fallback to a default image if no images are found
          console.warn('No loading images found, using fallback');
          setLoadingImage('/loading/fallback.jpg');
        }
      } catch (error) {
        console.error('Critical error in loading screen:', error);
        setHasError(true);
        setImageError(true);
        setLoadingImage('/loading/fallback.jpg');
        
        // Force completion after a short delay if there's a critical error
        setTimeout(() => {
          console.log('LoadingScreen: Forcing completion after critical error');
          onLoadingComplete();
        }, 2000);
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
