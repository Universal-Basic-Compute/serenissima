import React, { useEffect, useState } from 'react';
import Image from 'next/image';

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

  useEffect(() => {
    // List of loading images - make sure these paths are correct
    const loadingImages = [
      '/loading/venice1.jpg',
      '/loading/venice2.jpg',
      '/loading/venice3.jpg',
      '/loading/venice4.jpg',
      '/loading/venice5.jpg',
    ];

    // Log the available images to verify paths
    console.log('Available loading images:', loadingImages);

    // Select a random image
    const randomImage = loadingImages[Math.floor(Math.random() * loadingImages.length)];
    console.log('Selected loading image:', randomImage);
    setLoadingImage(randomImage);

    // Set up progress animation
    const startTime = Date.now();
    const endTime = startTime + duration;

    const updateProgress = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - startTime;
      const newProgress = Math.min(100, (elapsed / duration) * 100);
      
      setProgress(newProgress);
      
      if (currentTime < endTime) {
        requestAnimationFrame(updateProgress);
      } else {
        // When duration is complete, call the callback
        onLoadingComplete();
      }
    };

    requestAnimationFrame(updateProgress);
  }, [duration, onLoadingComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black">
      {/* Background image with overlay */}
      {loadingImage && (
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={loadingImage}
            alt="Loading Venice"
            fill
            style={{ objectFit: 'cover' }}
            priority
            onError={(e) => {
              console.error('Error loading image:', loadingImage);
              setImageError(true);
              // Try to load a fallback image
              setLoadingImage('/loading/fallback.jpg');
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
        
        {/* Progress bar */}
        <div className="w-64 md:w-96 h-2 bg-amber-900 rounded-full overflow-hidden mb-4">
          <div 
            className="h-full bg-amber-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        
        <p className="text-amber-300 text-sm">
          Preparing the charts of Venice...
        </p>
      </div>
    </div>
  );
};

export default LoadingScreen;
