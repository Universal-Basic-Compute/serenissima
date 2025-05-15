'use client';

import { useEffect, useState, useRef } from 'react';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import ViewportCanvas from './ViewportCanvas';
import LandDetailsPanel from './LandDetailsPanel';
import BuildingDetailsPanel from './BuildingDetailsPanel';
import CitizenDetailsPanel from '../UI/CitizenDetailsPanel';
import { buildingService } from '@/lib/services/BuildingService';
import { transportService } from '@/lib/services/TransportService';
import { citizenService } from '@/lib/services/CitizenService';
import { incomeService } from '@/lib/services/IncomeService';
import { buildingPointsService } from '@/lib/services/BuildingPointsService';
import { viewportService } from '@/lib/services/ViewportService';
import { uiStateService } from '@/lib/services/UIStateService';
import { dataService } from '@/lib/services/DataService';
import { renderService } from '@/lib/services/RenderService';
import { interactionService } from '@/lib/services/InteractionService';

interface IsometricViewerProps {
  activeView: 'buildings' | 'land' | 'transport' | 'resources' | 'markets' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';
}

export default function IsometricViewer({ activeView }: IsometricViewerProps) {
  // Get UI state from service
  const [uiState, setUiState] = useState(uiStateService.getState());
  
  // Get viewport state from service
  const [scale, setScale] = useState(viewportService.getScale());
  const [offset, setOffset] = useState(viewportService.getOffset());
  
  // Data state - managed by DataService
  const [loading, setLoading] = useState<boolean>(true);
  
  // Canvas ref for direct DOM access when needed
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Building image path fetching is now handled by the UIStateService

  // Set up event listeners
  useEffect(() => {
    // Handle UI state changes
    const handleUIStateChange = () => {
      setUiState(uiStateService.getState());
    };
    
    // Handle viewport state changes
    const handleViewportScaleChanged = (data: any) => {
      setScale(data.scale);
    };
    
    const handleViewportOffsetChanged = (data: any) => {
      setOffset(data.offset);
    };
    
    // Subscribe to events
    const subscriptions = [
      eventBus.subscribe(EventTypes.BUILDING_HOVER_STATE_CHANGED, handleUIStateChange),
      eventBus.subscribe(EventTypes.BUILDING_IMAGE_LOADING_STATE_CHANGED, handleUIStateChange),
      eventBus.subscribe(EventTypes.POLYGON_SELECTED, handleUIStateChange),
      eventBus.subscribe(EventTypes.BUILDING_SELECTED, handleUIStateChange),
      eventBus.subscribe(EventTypes.CITIZEN_SELECTED, handleUIStateChange),
      eventBus.subscribe(EventTypes.VIEWPORT_SCALE_CHANGED, handleViewportScaleChanged),
      eventBus.subscribe(EventTypes.VIEWPORT_OFFSET_CHANGED, handleViewportOffsetChanged)
    ];
    
    // Cleanup function
    return () => {
      // Unsubscribe from all events
      subscriptions.forEach(sub => sub.unsubscribe());
    };
  }, []);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      
      try {
        // Initialize all required services
        await buildingPointsService.loadBuildingPoints();
        await dataService.loadPolygons();
        await dataService.loadBuildings();
        
        // Load view-specific data
        if (activeView === 'land') {
          await incomeService.loadIncomeData();
        } else if (activeView === 'citizens') {
          await citizenService.loadCitizens();
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading initial data:', error);
        setLoading(false);
      }
    };
    
    loadInitialData();
    
    // Handle transport routes activation
    const handleShowTransportRoutes = () => {
      // Force the active view to be 'transport' first
      if (activeView !== 'transport') {
        window.dispatchEvent(new CustomEvent('switchToTransportView', {
          detail: { view: 'transport' }
        }));
      }
      
      // Set a small timeout to ensure view has changed before activating transport mode
      setTimeout(() => {
        transportService.setTransportMode(true);
      }, 100);
    };
    
    // Add window event listeners
    window.addEventListener('showTransportRoutes', handleShowTransportRoutes);
    window.addEventListener('ensureBuildingsVisible', buildingService.ensureBuildingsVisible);
    
    // Dispatch initial event to ensure buildings are visible
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
    
    return () => {
      window.removeEventListener('showTransportRoutes', handleShowTransportRoutes);
      window.removeEventListener('ensureBuildingsVisible', buildingService.ensureBuildingsVisible);
    };
  }, [activeView]);
  
  // Load view-specific data when activeView changes
  useEffect(() => {
    const loadViewData = async () => {
      if (activeView === 'land') {
        await incomeService.loadIncomeData();
      } else if (activeView === 'citizens') {
        await citizenService.loadCitizens();
      }
      
      // Notify other components about the view change
      window.dispatchEvent(new CustomEvent('viewChanged', { 
        detail: { view: activeView }
      }));
    };
    
    loadViewData();
  }, [activeView]);

  // Set up periodic refresh of buildings data
  useEffect(() => {
    // Set up interval to refresh buildings every 30 seconds
    const interval = setInterval(() => {
      dataService.loadBuildings().catch(error => {
        console.error('Error refreshing buildings data:', error);
      });
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);
  
  // This functionality is now handled by BuildingService
  
  // This functionality is now handled by CitizenService
  
  // This functionality is now handled by CitizenService
  
  // This functionality is now handled by DataService

  // Mouse handling is now delegated to ViewportService and InteractionService

  // Map transformation events are now handled by ViewportService

  // Income color calculation is now fully delegated to IncomeService
  
  // Mouse interaction is now handled by InteractionService in ViewportCanvas

  // Helper functions are now in CoordinateService and BuildingService
  
  // Citizen marker creation is now fully delegated to RenderService

  // Isometric projection functions are now fully delegated to CoordinateService

  // Rendering is now handled by RenderService in ViewportCanvas
  

  // Window resize handling is now in ViewportCanvas

  // Building size and color functions are now fully delegated to BuildingService

  // Helper functions are now in RenderService

  return (
    <div className="w-screen h-screen">
      <ViewportCanvas 
        activeView={activeView}
        scale={scale}
        offset={offset}
        onScaleChange={(newScale) => {
          viewportService.setScale(newScale);
          setScale(newScale);
        }}
        onOffsetChange={(newOffset) => {
          viewportService.setOffset(newOffset);
          setOffset(newOffset);
        }}
      />
      
      {/* Building Hover Tooltip */}
      {uiState.hoveredBuildingName && uiState.hoveredBuildingPosition && (
        <div 
          className="absolute bg-black/80 text-white rounded text-sm pointer-events-none z-50 overflow-hidden"
          style={{
            left: uiState.hoveredBuildingPosition.x + 15, // Offset from cursor
            top: uiState.hoveredBuildingPosition.y - 10,
            maxWidth: '200px',
            width: '200px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
          }}
        >
          {/* Building image */}
          {uiState.hoveredBuildingImagePath && (
            <div className="w-full aspect-square overflow-hidden">
              <img 
                src={uiState.hoveredBuildingImagePath}
                alt={uiState.hoveredBuildingName}
                className="w-full h-full object-cover"
                onError={(e) => {
                  console.error('Error loading building image in hover tooltip:', e);
                  e.currentTarget.src = '/images/buildings/market_stall.jpg';
                }}
              />
            </div>
          )}
          
          {/* Building name */}
          <div className="px-2 py-1 text-center font-medium">
            {uiState.hoveredBuildingName}
          </div>
          
          {/* Loading indicator */}
          {uiState.isLoadingBuildingImage && !uiState.hoveredBuildingImagePath && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <div className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}
      
      {/* Land Details Panel */}
      {uiState.showLandDetailsPanel && uiState.selectedPolygonId && (
        <LandDetailsPanel
          selectedPolygonId={uiState.selectedPolygonId}
          onClose={() => uiStateService.setSelectedPolygon(null, false)}
          visible={uiState.showLandDetailsPanel}
        />
      )}
      
      {/* Building Details Panel */}
      {uiState.showBuildingDetailsPanel && uiState.selectedBuildingId && (activeView === 'buildings' || activeView === 'land' || activeView === 'citizens') && (
        <BuildingDetailsPanel
          selectedBuildingId={uiState.selectedBuildingId}
          onClose={() => uiStateService.setSelectedBuilding(null, false)}
          visible={uiState.showBuildingDetailsPanel}
        />
      )}
      
      {/* Citizen Details Panel */}
      {uiState.showCitizenDetailsPanel && uiState.selectedCitizen && (
        <CitizenDetailsPanel
          citizen={uiState.selectedCitizen}
          onClose={() => uiStateService.setSelectedCitizen(null, false)}
        />
      )}
      
      {/* Income Legend - only visible in land view */}
      {activeView === 'land' && (
        <div className="absolute top-20 left-20 bg-black/70 text-white px-3 py-2 rounded text-sm pointer-events-none">
          <p>Income per building point</p>
          <div className="w-full h-2 mt-1 rounded" style={{background: 'linear-gradient(to right, #6699CC, #CCB266, #A54A2A)'}}></div>
          <div className="flex justify-between text-xs mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>
      )}
      
      {/* Controls */}
      <div className="absolute bottom-4 right-4 bg-black/70 text-white p-3 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2">
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <button 
            onClick={() => viewportService.resetViewport()}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white ml-2"
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Exit Transport Mode button */}
      {activeView === 'transport' && transportService.getTransportMode() && (
        <button
          onClick={() => {
            transportService.reset();
            transportService.setTransportMode(false);
            // Dispatch event to notify components that transport mode has been exited
            window.dispatchEvent(new CustomEvent('transportModeExited'));
          }}
          className="absolute top-20 right-4 bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Exit Transport Mode
        </button>
      )}
    </div>
  );
}
