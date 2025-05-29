// Extend the Window interface to include our custom property
declare global {
  interface Window {
    _polygonSnapshotCache?: {
      result: any | null;
      deps: any | null;
    };
  }
}

/**
 * Clears all caches related to land ownership
 */
export function clearLandOwnershipCaches(): void {
  console.log('Clearing all land ownership caches');
  
  // Clear localStorage caches
  localStorage.removeItem('landOwnersCache');
  localStorage.removeItem('polygonsCache');
  
  // Clear sessionStorage caches
  sessionStorage.removeItem('landOwnersCache');
  sessionStorage.removeItem('polygonsCache');
  
  // Clear any in-memory caches
  if (typeof window !== 'undefined' && window._polygonSnapshotCache) {
    window._polygonSnapshotCache = { result: null, deps: null };
  }
  
  // Dispatch events to notify components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cachesCleared', {
      detail: { type: 'landOwnership' }
    }));
    
    // Also dispatch the clearPolygonRendererCaches event
    window.dispatchEvent(new CustomEvent('clearPolygonRendererCaches'));
  }
}
