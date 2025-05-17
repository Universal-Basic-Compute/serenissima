'use client';

import { useState, useEffect } from 'react';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

type ViewType = 'buildings' | 'land' | 'transport' | 'resources' | 'contracts' | 'governance' | 'loans' | 'knowledge' | 'citizens' | 'guilds';

interface ViewControllerProps {
  initialView?: ViewType;
  onViewChange?: (view: ViewType) => void;
  children: (activeView: ViewType) => React.ReactNode;
}

export default function ViewController({ 
  initialView = 'buildings',
  onViewChange,
  children 
}: ViewControllerProps) {
  const [activeView, setActiveView] = useState<ViewType>(initialView);
  
  // Handle view changes
  const handleViewChange = (view: ViewType) => {
    setActiveView(view);
    
    // Call the onViewChange callback if provided
    if (onViewChange) {
      onViewChange(view);
    }
    
    // Dispatch a viewChanged event to notify other components
    window.dispatchEvent(new CustomEvent('viewChanged', { 
      detail: { view }
    }));
    
    // Dispatch additional events for specific views
    if (view === 'land') {
      window.dispatchEvent(new CustomEvent('fetchIncomeData'));
      window.dispatchEvent(new CustomEvent('showIncomeVisualization'));
    } else if (view === 'citizens') {
      window.dispatchEvent(new CustomEvent('loadCitizens'));
    } else if (view === 'governance') {
      window.dispatchEvent(new CustomEvent('openGovernancePanel'));
    } else if (view === 'guilds') {
      window.dispatchEvent(new CustomEvent('openGuildsPanel'));
    } else if (view === 'knowledge') {
      window.dispatchEvent(new CustomEvent('openKnowledgePanel'));
    } else if (view === 'loans') {
      window.dispatchEvent(new CustomEvent('openLoanPanel'));
      // Dispatch event to load loans data
      window.dispatchEvent(new CustomEvent('loadLoans'));
    }
    
    // Always ensure buildings are visible regardless of view
    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
  };
  
  // Listen for external view change requests
  useEffect(() => {
    const handleSwitchToView = (e: CustomEvent) => {
      if (e.detail && e.detail.view) {
        handleViewChange(e.detail.view as ViewType);
      }
    };
    
    window.addEventListener('switchToView' as any, handleSwitchToView);
    
    return () => {
      window.removeEventListener('switchToView' as any, handleSwitchToView);
    };
  }, []);
  
  // Render children with the active view
  return <>{children(activeView)}</>;
}
