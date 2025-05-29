/**
 * Utility functions for memory management
 */
import * as THREE from 'three';

/**
 * Force garbage collection if possible
 * Note: This only works in environments that expose gc()
 */
export function forceGarbageCollection(): void {
  if (typeof window !== 'undefined' && (window as any).gc) {
    try {
      (window as any).gc();
      console.log('Forced garbage collection');
    } catch (error) {
      console.warn('Failed to force garbage collection:', error);
    }
  }
}

/**
 * Dispose of Three.js resources
 */
export function disposeThreeJsObject(object: THREE.Object3D): void {
  if (!object) return;
  
  // Remove from parent
  if (object.parent) {
    object.parent.remove(object);
  }
  
  // Traverse all children
  object.traverse((child) => {
    // Dispose of geometries
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      
      // Dispose of materials
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => disposeMaterial(material));
        } else {
          disposeMaterial(child.material);
        }
      }
    }
  });
}

/**
 * Dispose of a Three.js material and its textures
 */
export function disposeMaterial(material: THREE.Material): void {
  // Dispose of textures
  if (material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhongMaterial) {
    
    if (material.map) material.map.dispose();
    if (material.lightMap) material.lightMap.dispose();
    if (material.aoMap) material.aoMap.dispose();
    
    // Handle emissiveMap based on material type
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
      if (material.emissiveMap) material.emissiveMap.dispose();
    }
    
    // Handle maps that exist on specific material types
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
      if (material.bumpMap) material.bumpMap.dispose();
      if (material.normalMap) material.normalMap.dispose();
    }
    
    // Handle displacement map (only exists on certain material types)
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhongMaterial) {
      if (material.displacementMap) material.displacementMap.dispose();
    }
    
    // Handle PBR specific maps
    if (material instanceof THREE.MeshStandardMaterial) {
      if (material.roughnessMap) material.roughnessMap.dispose();
      // Vérifier explicitement que c'est un MeshStandardMaterial avant d'accéder à metalnessMap
      if ('metalnessMap' in material && material.metalnessMap) {
        material.metalnessMap.dispose();
      }
    }
    if (material.alphaMap) material.alphaMap.dispose();
    if (material.envMap) material.envMap.dispose();
  }
  
  // Dispose of the material itself
  material.dispose();
}

/**
 * Interface pour le type de performance.memory
 */
interface MemoryInfo {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

/**
 * Monitor memory usage and log warnings
 */
export function startMemoryMonitoring(): () => void {
  // Vérifier si performance.memory est disponible (uniquement dans Chrome)
  if (typeof performance === 'undefined' || !(performance as any).memory) {
    console.warn('Memory monitoring not supported in this browser');
    return () => {}; // Return empty cleanup function
  }
  
  const memoryInfo = (performance as any).memory as MemoryInfo;
  const warningThreshold = memoryInfo.jsHeapSizeLimit * 0.7; // 70% of limit
  
  const checkMemory = () => {
    const currentUsage = memoryInfo.usedJSHeapSize;
    const percentUsed = (currentUsage / memoryInfo.jsHeapSizeLimit) * 100;
    
    console.log(`Memory usage: ${(currentUsage / 1048576).toFixed(2)} MB (${percentUsed.toFixed(2)}%)`);
    
    if (currentUsage > warningThreshold) {
      console.warn(`High memory usage: ${(currentUsage / 1048576).toFixed(2)} MB (${percentUsed.toFixed(2)}%)`);
      
      // Try to force garbage collection
      forceGarbageCollection();
    }
  };
  
  // Check memory every 10 seconds
  const intervalId = setInterval(checkMemory, 10000);
  
  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}
