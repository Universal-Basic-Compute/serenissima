import React, { ErrorInfo } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { log } from '@/lib/logUtils';

interface ThreeDErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: any;
}

/**
 * Specialized error boundary for Three.js components with custom fallback UI
 * and specific error handling for 3D rendering issues.
 */
const ThreeDErrorBoundary: React.FC<ThreeDErrorBoundaryProps> = ({ 
  children, 
  onError,
  resetKey 
}) => {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    // Log with specific 3D context
    log.error('3D Rendering Error:', error, errorInfo);
    
    // Check for common WebGL errors
    const errorString = error.toString().toLowerCase();
    if (errorString.includes('webgl') || errorString.includes('context') || errorString.includes('three')) {
      log.error('WebGL/Three.js specific error detected', {
        browser: navigator.userAgent,
        gpu: (window as any).GPU?.name || 'Unknown',
        errorType: 'webgl'
      });
    }
    
    // Call the parent onError if provided
    if (onError) {
      onError(error, errorInfo);
    }
  };

  // Custom fallback UI for 3D components
  const fallbackUI = (
    <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50">
      <div className="text-red-600 text-2xl font-serif mb-4">3D Rendering Error</div>
      <div className="text-amber-800 italic text-lg max-w-md text-center mb-4">
        The Council of Ten regrets to inform you that there was an issue with the 3D rendering.
      </div>
      <div className="bg-amber-100 border border-amber-200 rounded p-4 mb-6 max-w-md">
        <p className="text-amber-800">This could be due to:</p>
        <ul className="list-disc pl-5 mt-2 text-amber-700">
          <li>Insufficient GPU resources</li>
          <li>Outdated graphics drivers</li>
          <li>Browser compatibility issues</li>
          <li>Limited device capabilities</li>
        </ul>
      </div>
      <div className="flex space-x-4">
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
        >
          Reload Page
        </button>
        <button 
          onClick={() => {
            // Try to enable low performance mode
            try {
              const store = require('@/store/usePolygonStore').default;
              store.getState().setHighQuality(false);
            } catch (e) {
              console.error('Failed to enable low performance mode:', e);
            }
            // Force reload after a short delay
            setTimeout(() => window.location.reload(), 100);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Low Quality Mode
        </button>
      </div>
    </div>
  );

  return (
    <ErrorBoundary 
      onError={handleError} 
      fallback={fallbackUI}
      resetKey={resetKey}
    >
      {children}
    </ErrorBoundary>
  );
};

export default ThreeDErrorBoundary;
