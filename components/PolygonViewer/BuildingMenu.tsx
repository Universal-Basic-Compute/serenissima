/**
 * Building menu component for browsing and placing buildings
 */
import React from 'react';
import { Tab } from '@headlessui/react';
import BuildingModelViewer from '../UI/BuildingModelViewer';
import PlaceableBuilding from './PlaceableBuilding';
import { Building } from '@/lib/services/BuildingService';
import ErrorBoundary from '../ErrorBoundary/ErrorBoundary';
import { useBuildingMenu } from '@/hooks/useBuildingMenu';
import { log } from '@/lib/logUtils';

interface BuildingMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function BuildingMenu({ visible, onClose }: BuildingMenuProps) {
  // Use the custom hook to handle all building menu logic
  const {
    categories,
    loading,
    selectedBuilding,
    selectedVariant,
    availableVariants,
    placeableBuilding,
    handleSelectBuilding,
    handleSelectVariant,
    handlePlaceBuilding,
    handlePlacementComplete,
    handleCancelPlacement,
    handleCloseDetailModal,
    handlePreviousVariant,
    handleNextVariant,
    loadBuildingCategories,
    setSelectedBuilding
  } = useBuildingMenu(visible);

  if (!visible) return null;

  return (
    <div>
      <div className="fixed inset-x-0 bottom-0 z-30 transform transition-transform duration-300 ease-in-out" 
        onClick={(e) => {
          // Only stop propagation, don't close the menu when clicking inside
          e.stopPropagation();
        }}
      >
        <div className="bg-amber-50 border-t-4 border-amber-600 shadow-lg max-h-[70vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-amber-300">
            <h2 className="text-2xl font-serif text-amber-800">Buildings of La Serenissima</h2>
            <button 
              onClick={onClose}
              className="text-amber-700 hover:text-amber-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-grow overflow-auto">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <p className="text-amber-700 mb-4">Building menu is being repaired. Please check back later.</p>
                <button 
                  onClick={() => loadBuildingCategories()}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                >
                  Retry Loading Buildings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Placeable Building */}
      {placeableBuilding && (
        <PlaceableBuilding
          buildingName={placeableBuilding?.name?.toLowerCase().replace(/\s+/g, '-') || ''}
          variant={placeableBuilding?.variant}
          onPlace={handlePlacementComplete}
          onCancel={handleCancelPlacement}
        />
      )}
    </div>
  );
}
