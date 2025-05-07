import React, { useState } from 'react';
import MarketplaceView from './MarketplaceView';
import MyOffersView from './MyOffersView';
import TransactionHistoryView from './TransactionHistoryView';

interface MarketplaceButtonProps {
  className?: string;
}

const MarketplaceButton: React.FC<MarketplaceButtonProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'myOffers' | 'history'>('marketplace');
  
  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 transition-colors ${className}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Marketplace
      </button>
      
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl">
            {/* Tabs */}
            <div className="flex bg-amber-700 text-white rounded-t-lg overflow-hidden">
              <button
                className={`flex-1 py-3 px-4 text-center font-medium ${
                  activeTab === 'marketplace' 
                    ? 'bg-amber-600 text-white' 
                    : 'text-amber-200 hover:bg-amber-600 hover:text-white'
                }`}
                onClick={() => setActiveTab('marketplace')}
              >
                <span className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Marketplace
                </span>
              </button>
              <button
                className={`flex-1 py-3 px-4 text-center font-medium ${
                  activeTab === 'myOffers' 
                    ? 'bg-amber-600 text-white' 
                    : 'text-amber-200 hover:bg-amber-600 hover:text-white'
                }`}
                onClick={() => setActiveTab('myOffers')}
              >
                <span className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  My Offers
                </span>
              </button>
              <button
                className={`flex-1 py-3 px-4 text-center font-medium ${
                  activeTab === 'history' 
                    ? 'bg-amber-600 text-white' 
                    : 'text-amber-200 hover:bg-amber-600 hover:text-white'
                }`}
                onClick={() => setActiveTab('history')}
              >
                <span className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  History
                </span>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 text-white hover:text-amber-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Content */}
            {activeTab === 'marketplace' && (
              <MarketplaceView onClose={() => setIsOpen(false)} />
            )}
            
            {activeTab === 'myOffers' && (
              <MyOffersView onClose={() => setIsOpen(false)} />
            )}
            
            {activeTab === 'history' && (
              <TransactionHistoryView onClose={() => setIsOpen(false)} />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default MarketplaceButton;
