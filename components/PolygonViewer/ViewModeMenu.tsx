import { ViewMode } from './types';
import IconButton from '../UI/IconButton';

interface ViewModeMenuProps {
  activeView: ViewMode;
  setActiveView: (view: ViewMode) => void;
}

export default function ViewModeMenu({ activeView, setActiveView }: ViewModeMenuProps) {
  // Helper function to check if a view is disabled
  const isDisabled = (view: ViewMode): boolean => {
    return view !== 'buildings' && view !== 'land';
  };

  return (
    <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 bg-amber-50 rounded-lg shadow-xl p-2 flex flex-col gap-2 border-2 border-amber-600">
      <h3 className="text-amber-800 font-serif text-center text-xs font-semibold border-b border-amber-300 pb-1 px-1">
        La Serenissima
      </h3>
      
      {/* Governance View - Disabled */}
      <IconButton 
        onClick={() => {}}
        active={false}
        title="Governance View (Coming Soon)"
        activeColor="amber"
        compact={true}
        disabled={true}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20h20M4 20V4h16v16M12 2v4M7 8h10M7 12h10M7 16h10"></path>
        </svg>
        <span className="text-[10px] mt-1">Governance</span>
      </IconButton>
      
      {/* Markets View - Disabled */}
      <IconButton 
        onClick={() => {}}
        active={false}
        title="Markets View (Coming Soon)"
        activeColor="amber"
        compact={true}
        disabled={true}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
        <span className="text-[10px] mt-1">Markets</span>
      </IconButton>
      
      {/* Resources View - Disabled */}
      <IconButton 
        onClick={() => {}}
        active={false}
        title="Resources View (Coming Soon)"
        activeColor="amber"
        compact={true}
        disabled={true}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 5L5 19M5.5 6.5l3-3 2 2-3 3-2-2zM15.5 16.5l3-3 2 2-3 3-2-2z"></path>
          <path d="M9 5l3 3-3 3-3-3 3-3zM14 15l3 3-3 3-3-3 3-3z"></path>
        </svg>
        <span className="text-[10px] mt-1">Resources</span>
      </IconButton>
      
      {/* Transport View - Disabled */}
      <IconButton 
        onClick={() => {}}
        active={false}
        title="Transport View (Coming Soon)"
        activeColor="amber"
        compact={true}
        disabled={true}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h16M8 14h8M4 18h16M9 6l-5 4 5 4M15 6l5 4-5 4"></path>
        </svg>
        <span className="text-[10px] mt-1">Transport</span>
      </IconButton>
      
      <IconButton 
        onClick={() => setActiveView('buildings')}
        active={activeView === 'buildings'}
        title="Buildings View"
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
      
      <IconButton 
        onClick={() => setActiveView('land')}
        active={activeView === 'land'}
        title="Land View"
        activeColor="amber"
        compact={true}
        disabled={false}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"></path>
          <path d="M9 22V12h6v10M2 10.6L12 2l10 8.6"></path>
        </svg>
        <span className="text-[10px] mt-1">Lands</span>
      </IconButton>
      
      <div className="mt-1 border-t border-amber-300 pt-1 flex justify-center">
        <div className="text-amber-800 text-[9px] italic text-center">
          Venezia
        </div>
      </div>
    </div>
  );
}
