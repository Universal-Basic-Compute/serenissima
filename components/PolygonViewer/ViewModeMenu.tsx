import { ViewMode, ActiveViewMode } from './types';
import IconButton from '../UI/IconButton';
import { eventBus, EventTypes } from '../../lib/eventBus';

interface ViewModeMenuProps {
  activeView: ActiveViewMode;
  setActiveView: (view: ActiveViewMode) => void;
}

export default function ViewModeMenu({ activeView, setActiveView }: ViewModeMenuProps) {
  // Create a wrapper function to emit the view mode change event
  const handleViewModeChange = (view: ActiveViewMode) => {
    setActiveView(view);
    // Emit event to notify other components about the view mode change
    eventBus.emit(EventTypes.VIEW_MODE_CHANGED, { viewMode: view });
    
    // If switching to buildings view, dispatch a custom event to ensure buildings are visible
    if (view === 'buildings') {
      console.log('Switching to buildings view, dispatching event');
      window.dispatchEvent(new CustomEvent('showBuildings'));
    }
  };
  // Helper function to check if a view is disabled
  const isDisabled = (view: ViewMode): boolean => {
    // Only these views are enabled
    const enabledViews: ActiveViewMode[] = ['buildings', 'land', 'markets', 'citizens', 'resources', 'transport', 'guilds'];
    return !enabledViews.includes(view as ActiveViewMode);
  };

  // Detailed descriptions for each view mode
  const viewDescriptions: Record<ViewMode | 'guilds', string> = {
    'governance': 'Examine political districts, administrative boundaries, and centers of power in the Venetian Republic',
    'markets': 'Explore commercial hubs, trading posts, and economic activity across the Venetian territories',
    'resources': 'Survey natural resources, production centers, and material wealth of La Serenissima',
    'transport': 'Navigate the network of canals, bridges, and maritime routes that connect the Republic',
    'buildings': 'Explore the architectural marvels, palaces, and structures of Venezia in detail',
    'land': 'View land ownership, property boundaries, and territorial divisions of the Republic',
    'citizens': 'Meet the citizens of Venice, see where they live and work, and learn about their lives',
    'guilds': 'Discover the powerful trade guilds that control commerce and crafts in the Venetian Republic'
  };

  return (
    <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 bg-amber-50 rounded-lg shadow-xl p-2 flex flex-col gap-2 border-2 border-amber-600">
      {/* Governance View - Disabled */}
      <IconButton 
        onClick={() => {}}
        active={false}
        title={viewDescriptions.governance + " (Coming Soon)"}
        activeColor="amber"
        compact={true}
        disabled={true}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20h20M4 20V4h16v16M12 2v4M7 8h10M7 12h10M7 16h10"></path>
        </svg>
        <span className="text-[10px] mt-1">Governance</span>
      </IconButton>
      
      {/* Guilds View */}
      <IconButton 
        onClick={() => {
          if (activeView !== 'guilds') {
            console.log('ViewModeMenu: Switching to guilds view');
            // Dispatch a custom event to ensure guilds are loaded
            window.dispatchEvent(new CustomEvent('loadGuilds'));
            handleViewModeChange('guilds' as ActiveViewMode);
          }
        }}
        active={activeView === 'guilds'}
        title={viewDescriptions.guilds}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
        </svg>
        <span className="text-[10px] mt-1">Guilds</span>
      </IconButton>
      
      {/* Citizens View */}
      <IconButton 
        onClick={() => {
          if (activeView !== 'citizens') {
            console.log('ViewModeMenu: Switching to citizens view');
            // Dispatch a custom event to ensure citizens are loaded
            window.dispatchEvent(new CustomEvent('loadCitizens'));
            handleViewModeChange('citizens');
          }
        }}
        active={activeView === 'citizens'}
        title={viewDescriptions.citizens}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span className="text-[10px] mt-1">Citizens</span>
      </IconButton>
      
      {/* Markets View - Now Enabled */}
      <IconButton 
        onClick={() => activeView !== 'markets' ? handleViewModeChange('markets') : null}
        active={activeView === 'markets'}
        title={viewDescriptions.markets}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
        <span className="text-[10px] mt-1">Markets</span>
      </IconButton>
      
      {/* Resources View - Now Enabled */}
      <IconButton 
        onClick={() => activeView !== 'resources' ? handleViewModeChange('resources') : null}
        active={activeView === 'resources'}
        title={viewDescriptions.resources}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 5L5 19M5.5 6.5l3-3 2 2-3 3-2-2zM15.5 16.5l3-3 2 2-3 3-2-2z"></path>
          <path d="M9 5l3 3-3 3-3-3 3-3zM14 15l3 3-3 3-3-3 3-3z"></path>
        </svg>
        <span className="text-[10px] mt-1">Resources</span>
      </IconButton>
      
      <IconButton 
        onClick={() => activeView !== 'buildings' ? handleViewModeChange('buildings') : null}
        active={activeView === 'buildings'}
        title={viewDescriptions.buildings}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span className="text-[10px] mt-1">Buildings</span>
      </IconButton>
      
      {/* Transport View - Now enabled */}
      <IconButton 
        onClick={() => activeView !== 'transport' ? handleViewModeChange('transport') : null}
        active={activeView === 'transport'}
        title={viewDescriptions.transport}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h16M8 14h8M4 18h16M9 6l-5 4 5 4M15 6l5 4-5 4"></path>
        </svg>
        <span className="text-[10px] mt-1">Transport</span>
      </IconButton>
      
      <IconButton 
        onClick={() => activeView !== 'land' ? handleViewModeChange('land') : null}
        active={activeView === 'land'}
        title={viewDescriptions.land}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22v-8m0 0l-5-8.5a5 5 0 1 1 10 0L12 14z"></path>
          <path d="M12 22h4.5a2.5 2.5 0 0 0 0-5H12"></path>
        </svg>
        <span className="text-[10px] mt-1">Lands</span>
      </IconButton>
    </div>
  );
}
