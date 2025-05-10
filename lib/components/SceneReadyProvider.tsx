import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import * as THREE from 'three';

// Add type declarations for global window properties
declare global {
  interface Window {
    __threeContext?: {
      scene?: THREE.Scene;
      camera?: THREE.Camera;
      renderer?: THREE.WebGLRenderer;
      controls?: any;
    };
  }
  
  interface HTMLCanvasElement {
    __scene?: THREE.Scene;
    __camera?: THREE.Camera;
  }
}

interface SceneReadyContextType {
  isSceneReady: boolean;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  setSceneReady?: (scene: THREE.Scene, camera: THREE.PerspectiveCamera) => void;
}

const SceneReadyContext = createContext<SceneReadyContextType>({
  isSceneReady: false,
  scene: null,
  camera: null
});

export const useSceneReady = () => useContext(SceneReadyContext);

interface SceneReadyProviderProps {
  children: React.ReactNode;
  maxAttempts?: number;
  checkInterval?: number;
}

export const SceneReadyProvider: React.FC<SceneReadyProviderProps> = ({ 
  children,
  maxAttempts = 20,
  checkInterval = 250
}) => {
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [camera, setCamera] = useState<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const handleSceneReady = (event: CustomEvent) => {
      const { scene, camera } = event.detail;
      setScene(scene);
      // Ensure camera is a PerspectiveCamera before setting it
      if (camera instanceof THREE.PerspectiveCamera) {
        setCamera(camera);
      } else {
        console.warn('SceneReadyProvider: Camera from event is not a PerspectiveCamera');
      }
      setIsSceneReady(true);
      console.log('SceneReadyProvider: Received sceneReady event');
    };
    
    window.addEventListener('sceneReady', handleSceneReady as EventListener);
    
    let attempts = 0;
    let intervalId: NodeJS.Timeout;

    const checkSceneReady = () => {
      // Try to get scene from window.__threeContext
      if (typeof window !== 'undefined' && window.__threeContext && window.__threeContext.scene) {
        setScene(window.__threeContext.scene);
        // Ensure camera is a PerspectiveCamera before setting it
        if (window.__threeContext.camera && window.__threeContext.camera instanceof THREE.PerspectiveCamera) {
          setCamera(window.__threeContext.camera);
        } else {
          console.warn('SceneReadyProvider: Camera from window.__threeContext is not a PerspectiveCamera');
        }
        setIsSceneReady(true);
        console.log('SceneReadyProvider: Scene found in window.__threeContext');
        return true;
      }
      
      // Try to get scene from canvas element
      if (typeof document !== 'undefined') {
        const canvas = document.querySelector('canvas');
        if (canvas && canvas.__scene) {
          setScene(canvas.__scene);
          // Ensure camera is a PerspectiveCamera before setting it
          if (canvas.__camera && canvas.__camera instanceof THREE.PerspectiveCamera) {
            setCamera(canvas.__camera);
          } else {
            console.warn('SceneReadyProvider: Camera is not a PerspectiveCamera');
          }
          setIsSceneReady(true);
          console.log('SceneReadyProvider: Scene found in canvas.__scene');
          return true;
        }
      }
      
      return false;
    };

    // Check immediately
    if (!checkSceneReady()) {
      // If not found, set up interval to check periodically
      intervalId = setInterval(() => {
        attempts++;
        if (checkSceneReady() || attempts >= maxAttempts) {
          clearInterval(intervalId);
          if (attempts >= maxAttempts) {
            console.warn(`SceneReadyProvider: Failed to find scene after ${maxAttempts} attempts`);
          }
        }
      }, checkInterval);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener('sceneReady', handleSceneReady as EventListener);
    };
  }, [maxAttempts, checkInterval]);

  // Add a method to manually set scene readiness
  const setSceneReadyManually = useCallback((scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    setScene(scene);
    setCamera(camera);
    setIsSceneReady(true);
    console.log('SceneReadyProvider: Scene manually set as ready');
  }, []);
  
  // Expose this method through context
  const contextValue = {
    isSceneReady,
    scene,
    camera,
    setSceneReady: setSceneReadyManually
  };
  
  return (
    <SceneReadyContext.Provider value={contextValue}>
      {children}
    </SceneReadyContext.Provider>
  );
};
