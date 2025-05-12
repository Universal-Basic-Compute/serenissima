// This file is deprecated and will be removed in a future update.
// Please use the components from the building system architecture instead.
// See docs/architecture/building-system.md for more information.

import React from 'react';
import { ThreeDErrorBoundary } from '@/lib/components/ThreeDErrorBoundary';
import { eventBus } from '@/lib/eventBus';
import { EventTypes } from '@/lib/eventTypes';
import { useEffect } from 'react';

const BuildingRenderer = ({ active }) => {
  // Log deprecation warning
  useEffect(() => {
    console.warn(
      'BuildingRenderer is deprecated and will be removed in a future update. ' +
      'Please use the components described in the building system architecture instead.'
    );
    
    // Emit event to notify that this component is deprecated
    eventBus.emit(EventTypes.BUILDING_RENDERER_DEPRECATED, {
      message: 'BuildingRenderer is deprecated',
      timestamp: Date.now()
    });
  }, []);
  
  return (
    <ThreeDErrorBoundary>
      <div className="p-4 bg-amber-100 border-2 border-amber-500 rounded-lg">
        <h2 className="text-lg font-bold text-amber-800">BuildingRenderer Deprecated</h2>
        <p className="text-amber-700">
          This component is deprecated and will be removed in a future update.
          Please use the components described in the building system architecture instead.
        </p>
        <p className="mt-2 text-amber-600 text-sm">
          See <code>docs/architecture/building-system.md</code> for more information.
        </p>
      </div>
    </ThreeDErrorBoundary>
  );
};

export default BuildingRenderer;
