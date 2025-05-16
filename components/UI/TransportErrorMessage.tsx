import React, { useEffect, useState } from 'react';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

const TransportErrorMessage: React.FC = () => {
  const [error, setError] = useState<{error: string, detail: string, severity: string} | null>(null);
  const [visible, setVisible] = useState(false);
  
  useEffect(() => {
    const handleError = (errorData: any) => {
      setError(errorData);
      setVisible(true);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        setVisible(false);
      }, 5000);
    };
    
    const subscription = eventBus.subscribe(EventTypes.TRANSPORT_ROUTE_ERROR, handleError);
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  if (!visible || !error) return null;
  
  return (
    <div className="fixed top-1/4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
      <div className="bg-black/70 text-white p-4 rounded-lg border-2 border-amber-600 shadow-lg max-w-md">
        <div className="flex items-center mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-serif text-amber-400">{error.error}</h3>
        </div>
        <p className="text-amber-100">{error.detail}</p>
      </div>
    </div>
  );
};

export default TransportErrorMessage;
