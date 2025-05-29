'use client';

import React from 'react';
import LoanMarketplace from '@/components/Loans/LoanMarketplace';
import LoanManagementDashboard from '@/components/Loans/LoanManagementDashboard';

interface LoanPanelProps {
  onClose: () => void;
}

const LoanPanel: React.FC<LoanPanelProps> = ({ onClose }) => {
  return (
    <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-20 rounded-lg p-4 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Venetian Banking & Finance
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Close loan panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="grid grid-cols-1 gap-8">
          <LoanMarketplace />
          <LoanManagementDashboard />
        </div>
      </div>
    </div>
  );
};

export default LoanPanel;
