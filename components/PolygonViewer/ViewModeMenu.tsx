import { ViewMode, ActiveViewMode } from '../PolygonViewer/types';
import IconButton from '../UI/IconButton';
import { eventBus, EventTypes } from '../../lib/utils/eventBus';
import { useRouter } from 'next/navigation'; // Import useRouter

interface ViewModeMenuProps {
  activeView: ActiveViewMode;
  setActiveView: (view: ActiveViewMode) => void;
}

export default function ViewModeMenu({ activeView, setActiveView }: ViewModeMenuProps) {
  const router = useRouter(); // Initialize useRouter

  // Create a wrapper function to emit the view mode change event
  const handleViewModeChange = (view: ActiveViewMode) => {
    setActiveView(view);
    // Emit event to notify other components about the view mode change
    eventBus.emit(EventTypes.VIEW_MODE_CHANGED, { viewMode: view });
    
    // Dispatch events to open specific panels or navigate
    // First, ensure other main panels are closed if a new one is explicitly opened,
    // or if a view that doesn't have a main panel is selected.
    if (view !== 'governance') {
      window.dispatchEvent(new CustomEvent('closeGovernancePanel'));
    }
    if (view !== 'guilds') {
      window.dispatchEvent(new CustomEvent('closeGuildsPanel'));
    }
    if (view !== 'citizens') {
      window.dispatchEvent(new CustomEvent('closeCitizenRegistry'));
    }
    // Assuming 'knowledge' panel might still be relevant for closure, even if no button opens it.
    window.dispatchEvent(new CustomEvent('closeKnowledgePanel'));


    if (view === 'governance') {
      window.dispatchEvent(new CustomEvent('openGovernancePanel'));
    } else if (view === 'guilds') {
      window.dispatchEvent(new CustomEvent('openGuildsPanel'));
    } else if (view === 'citizens') {
      // Dispatch an event to open the CitizenRegistry, similar to GovernancePanel
      window.dispatchEvent(new CustomEvent('openCitizenRegistry'));
      // The existing event dispatch for loadCitizens can remain if other components listen to it.
    } 
    // Note: The 'else' block that previously closed panels is now handled by the upfront closing logic.
  };

  // Detailed descriptions for each view mode
  const viewDescriptions: Record<ViewMode | string, string> = {
    'governance': 'Examine political districts, administrative boundaries, and centers of power in the Venetian Republic',
    'contracts': 'Explore commercial hubs, trading posts, and economic activity across the Venetian territories',
    'resources': 'Survey natural resources, production centers, and material wealth of La Serenissima',
    'transport': 'Navigate the network of canals, bridges, and maritime routes that connect the Republic',
    'buildings': 'Explore the architectural marvels, palaces, and structures of Venezia in detail',
    'land': 'View land ownership, property boundaries, and territorial divisions of the Republic',
    'citizens': 'Meet the citizens of Venice, see where they live and work, and learn about their lives',
    'guilds': 'Discover the powerful trade guilds that control commerce and crafts in the Venetian Republic',
    'loans': 'Access banking services, apply for loans, and manage your financial obligations'
  };

  return (
    <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 bg-amber-50 rounded-lg shadow-xl p-2 flex flex-col gap-2 border-2 border-amber-600">
      {/* Governance View - Now Enabled */}
      <IconButton 
        onClick={() => {
          if (activeView !== 'governance') {
            console.log('ViewModeMenu: Switching to governance view');
            handleViewModeChange('governance');
          }
        }}
        active={activeView === 'governance'}
        title={viewDescriptions.governance}
        activeColor="amber"
        compact={true}
        disabled={false}
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
            handleViewModeChange('guilds');
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
            handleViewModeChange('citizens');
            // Dispatch a custom event to ensure citizens are loaded
            // Do this after view change to ensure components are listening
            setTimeout(() => {
              console.log('ViewModeMenu: Dispatching loadCitizens event');
              window.dispatchEvent(new CustomEvent('loadCitizens'));
            }, 100);
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
      
      {/* Loans View */}
      <IconButton 
        onClick={() => activeView !== 'loans' ? handleViewModeChange('loans') : null}
        active={activeView === 'loans'}
        title="Manage your loans and explore financing options"
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12a8 8 0 01-8 8m0 0a8 8 0 01-8-8m8 8a8 8 0 018-8m-8 0a8 8 0 00-8 8m8-8v14m0-14v14" />
        </svg>
        <span className="text-[10px] mt-1">Loans</span>
      </IconButton>
      
      {/* Contracts View - Now Enabled */}
      <IconButton 
        onClick={() => activeView !== 'contracts' ? handleViewModeChange('contracts') : null}
        active={activeView === 'contracts'}
        title={viewDescriptions.contracts}
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
        <span className="text-[10px] mt-1">Contracts</span>
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
