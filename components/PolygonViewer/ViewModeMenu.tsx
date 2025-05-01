import { ViewMode } from './types';
import IconButton from '../UI/IconButton';

interface ViewModeMenuProps {
  activeView: ViewMode;
  setActiveView: (view: ViewMode) => void;
}

export default function ViewModeMenu({ activeView, setActiveView }: ViewModeMenuProps) {
  return (
    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 bg-white rounded-lg shadow-lg p-2 flex flex-col gap-3">
      <IconButton 
        onClick={() => setActiveView('buildings')}
        active={activeView === 'buildings'}
        title="Buildings View"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </IconButton>
      <IconButton 
        onClick={() => setActiveView('transport')}
        active={activeView === 'transport'}
        title="Transport View"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </IconButton>
      <IconButton 
        onClick={() => setActiveView('land')}
        active={activeView === 'land'}
        title="Land View"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      </IconButton>
    </div>
  );
}
