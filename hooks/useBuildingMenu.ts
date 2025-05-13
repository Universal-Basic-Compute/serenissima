import { useEffect, useState } from 'react';
import useBuildingStore from '@/store/useBuildingStore';
import { log } from '@/lib/logUtils';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';

// Define the Building interface locally instead of importing it
interface Building {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description?: string;
  thumbnail?: string;
  size?: string;
  era?: string;
  variant?: string;
}

/**
 * Custom hook to handle building menu logic
 */
export function useBuildingMenu(visible: boolean) {
  // Get state and actions from the store
  const { 
    categories, 
    loading, 
    selectedBuilding, 
    selectedVariant, 
    availableVariants, 
    placeableBuilding,
    loadBuildingCategories,
    getBuildingVariants,
    setSelectedBuilding,
    setSelectedVariant,
    setAvailableVariants,
    setPlaceableBuilding
  } = useBuildingStore();

  // Fetch available variants when a new building is selected
  useEffect(() => {
    if (selectedBuilding) {
      setSelectedVariant("model");
      
      // Fetch variants from the store
      getBuildingVariants(selectedBuilding.name);
    }
  }, [selectedBuilding, getBuildingVariants, setSelectedVariant]);

  // Load building data when the menu becomes visible
  useEffect(() => {
    if (!visible) return;
    loadBuildingCategories();
  }, [visible, loadBuildingCategories]);
  
  // Listen for custom events to show the building menu
  useEffect(() => {
    const handleShowBuildingMenu = () => {
      // This will be handled by the parent component that controls visibility
      console.log('Show building menu event received');
    };
    
    window.addEventListener('showBuildingMenu', handleShowBuildingMenu);
    
    return () => {
      window.removeEventListener('showBuildingMenu', handleShowBuildingMenu);
    };
  }, []);

  // Function to handle building selection
  const handleSelectBuilding = (building: Building) => {
    setSelectedBuilding(building);
    
    // Dispatch an event to hide the 3D view
    window.dispatchEvent(new CustomEvent('hide3DView'));
  };

  // Function to handle variant selection
  const handleSelectVariant = (variant: string) => {
    setSelectedVariant(variant);
  };

  // Function to handle building placement
  const handlePlaceBuilding = (building: Building, variant: string = 'model') => {
    setPlaceableBuilding({
      name: building.name,
      variant: variant
    });
    
    // Dispatch an event to notify the BuildingsToolbar to activate the building placement mode
    window.dispatchEvent(new CustomEvent('activateBuildingPlacement', {
      detail: {
        buildingName: building.name,
        variant: variant
      }
    }));
    
    setSelectedBuilding(null); // Close the modal if open
  };

  // Function to handle building placement completion
  const handlePlacementComplete = (position: { x: number, y: number }) => {
    log.info(`Building placed at position: ${position.x}, ${position.y}`);
    
    // Dispatch a custom event to notify other components about building placement
    window.dispatchEvent(new CustomEvent('buildingPlaced', {
      detail: {
        buildingName: placeableBuilding?.name,
        variant: placeableBuilding?.variant,
        position
      }
    }));
    
    setPlaceableBuilding(null);
  };

  // Function to cancel building placement
  const handleCancelPlacement = () => {
    setPlaceableBuilding(null);
  };

  // Function to close the building detail modal
  const handleCloseDetailModal = () => {
    setSelectedBuilding(null);
    
    // Dispatch an event to show the 3D view
    window.dispatchEvent(new CustomEvent('show3DView'));
  };

  // Function to navigate to previous variant
  const handlePreviousVariant = () => {
    const currentIndex = availableVariants.indexOf(selectedVariant);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : availableVariants.length - 1;
    setSelectedVariant(availableVariants[prevIndex]);
  };

  // Function to navigate to next variant
  const handleNextVariant = () => {
    const currentIndex = availableVariants.indexOf(selectedVariant);
    const nextIndex = currentIndex < availableVariants.length - 1 ? currentIndex + 1 : 0;
    setSelectedVariant(availableVariants[nextIndex]);
  };

  return {
    // State
    categories,
    loading,
    selectedBuilding,
    selectedVariant,
    availableVariants,
    placeableBuilding,
    
    // Actions
    handleSelectBuilding,
    handleSelectVariant,
    handlePlaceBuilding,
    handlePlacementComplete,
    handleCancelPlacement,
    handleCloseDetailModal,
    handlePreviousVariant,
    handleNextVariant,
    
    // Original store actions (for advanced use cases)
    loadBuildingCategories,
    setSelectedBuilding
  };
}
