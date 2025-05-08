import React, { useState } from 'react';

interface GovernancePanelProps {
  onClose: () => void;
}

const GovernancePanel: React.FC<GovernancePanelProps> = ({ onClose }) => {
  const [governanceTab, setGovernanceTab] = useState<'council' | 'laws'>('council');

  return (
    <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 rounded-lg p-4 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-serif text-amber-800 mb-6 text-center">
          Governance of La Serenissima
        </h2>
        
        {/* Governance tabs */}
        <div className="border-b border-amber-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                governanceTab === 'council' 
                  ? 'border-amber-600 text-amber-800' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setGovernanceTab('council')}
            >
              Council of Ten
            </button>
            <button
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                governanceTab === 'laws' 
                  ? 'border-amber-600 text-amber-800' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setGovernanceTab('laws')}
            >
              Laws & Decrees
            </button>
          </nav>
        </div>
        
        {/* Tab content */}
        {governanceTab === 'council' && (
          <div className="text-center py-8 text-gray-500 italic">
            The Council of Ten governs La Serenissima with wisdom and discretion.
            <p className="mt-4">Council features coming soon.</p>
          </div>
        )}
        
        {governanceTab === 'laws' && (
          <div className="text-center py-8 text-gray-500 italic">
            The laws and decrees of Venice ensure order and prosperity.
            <p className="mt-4">Legal system features coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GovernancePanel;
