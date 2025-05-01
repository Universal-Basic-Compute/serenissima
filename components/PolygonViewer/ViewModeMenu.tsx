import { ViewMode } from './types';
import IconButton from '../UI/IconButton';

interface ViewModeMenuProps {
  activeView: ViewMode;
  setActiveView: (view: ViewMode) => void;
}

export default function ViewModeMenu({ activeView, setActiveView }: ViewModeMenuProps) {
  return (
    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-amber-50 rounded-lg shadow-xl p-3 flex flex-col gap-4 border-2 border-amber-600">
      <h3 className="text-amber-800 font-serif text-center text-sm font-semibold border-b border-amber-300 pb-2 px-1">
        La Serenissima
      </h3>
      
      <IconButton 
        onClick={() => setActiveView('buildings')}
        active={activeView === 'buildings'}
        title="Buildings View"
        activeColor="amber"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
          <rect x="10" y="5" width="4" height="4"></rect>
        </svg>
        <span className="text-xs mt-1">Buildings</span>
      </IconButton>
      
      <IconButton 
        onClick={() => setActiveView('transport')}
        active={activeView === 'transport'}
        title="Transport View"
        activeColor="amber"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h16M8 14h8M4 18h16M9 6l-5 4 5 4M15 6l5 4-5 4"></path>
          <path d="M3 6h18v12H3z"></path>
        </svg>
        <span className="text-xs mt-1">Transport</span>
      </IconButton>
      
      <IconButton 
        onClick={() => setActiveView('land')}
        active={activeView === 'land'}
        title="Land View"
        activeColor="amber"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 9v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9"></path>
          <path d="M9 22V12h6v10M2 10.6L12 2l10 8.6"></path>
        </svg>
        <span className="text-xs mt-1">Lands</span>
      </IconButton>
      
      <div className="mt-2 border-t border-amber-300 pt-2 flex justify-center">
        <div className="text-amber-800 text-xs italic text-center">
          Republic of Venice
        </div>
      </div>
    </div>
  );
}
