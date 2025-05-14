import { useEffect, useState } from 'react';
import useBuildingStore from '@/store/useBuildingStore';
import { log } from '@/lib/utils/logUtils';
import { eventBus } from '@/lib/utils/eventBus';
import { EventTypes } from '@/lib/utils/eventTypes';
import { Building } from '@/lib/models/BuildingModels';
import { BuildingService } from '@/lib/services/BuildingService';

/**
 * Custom hook to handle building menu logic
 * This hook centralizes all building menu related state and actions
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

  // Get the BuildingService instance
  const buildingService = BuildingService.getInstance();

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
    // Normalize the building name to match the expected format
    const normalizedName = building.name?.toLowerCase().replace(/\s+/g, '-') || building.type;
    
    setPlaceableBuilding({
      name: normalizedName,
      variant: variant
    });
    
    // Dispatch an event to notify the BuildingsToolbar to activate the building placement mode
    window.dispatchEvent(new CustomEvent('activateBuildingPlacement', {
      detail: {
        buildingName: normalizedName,
        variant: variant
      }
    }));
    
    // Also emit an event through the event bus for components that listen to it
    eventBus.emit(EventTypes.BUILDING_SELECTED, {
      building: building,
      variant: variant,
      forPlacement: true
    });
    
    setSelectedBuilding(null); // Close the modal if open
  };

  // Function to handle building placement completion
  const handlePlacementComplete = (data: any) => {
    log.info(`Building placed: ${JSON.stringify(data)}`);
    
    // Emit an event through the event bus
    eventBus.emit(EventTypes.BUILDING_PLACED, {
      data: data
    });
    
    // Also dispatch a custom DOM event for backward compatibility
    window.dispatchEvent(new CustomEvent('buildingPlaced', {
      detail: {
        buildingName: placeableBuilding?.name,
        variant: placeableBuilding?.variant,
        position: data.position
      }
    }));
    
    setPlaceableBuilding(null);
  };

  // Function to cancel building placement
  const handleCancelPlacement = () => {
    setPlaceableBuilding(null);
    
    // Emit an event to notify that placement was canceled
    eventBus.emit(EventTypes.BUILDING_PLACEMENT_CANCELED, {});
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
