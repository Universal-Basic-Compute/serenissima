'use client';

import { useState, useRef, useEffect } from 'react';
import { useWalletContext } from './WalletProvider';
import PlayerProfile from './PlayerProfile';

interface WalletButtonProps {
  className?: string;
}

export default function WalletButton({ className = '' }: WalletButtonProps) {
  const { walletAddress, userProfile, isConnected, connectWallet } = useWalletContext();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Add effect to handle clicking outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  if (isConnected && userProfile) {
    return (
      <div className={`${className}`} ref={dropdownRef}>
        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="bg-amber-50 px-6 py-3 rounded-lg shadow-md hover:bg-amber-100 transition-colors flex items-center border-2 border-amber-300"
        >
          <PlayerProfile
            username={userProfile.username}
            firstName={userProfile.firstName}
            lastName={userProfile.lastName}
            coatOfArmsImage={userProfile.coatOfArmsImage}
            familyMotto={userProfile.familyMotto}
            computeAmount={userProfile.computeAmount}
            size="medium"
            className="mr-3"
            showMotto={false}
            showDucats
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl py-1 z-20 border-2 border-amber-300 overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50">
              <p className="text-xs text-amber-700">Wallet</p>
              <p className="text-sm truncate font-medium">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</p>
              {userProfile.familyMotto && (
                <p className="text-xs italic text-amber-600 mt-1">"{userProfile.familyMotto}"</p>
              )}
            </div>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('showUsernamePrompt'));
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
            >
              Edit Profile
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('showTransferMenu'));
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
            >
              Inject <span className="compute-token">$COMPUTE</span>
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('showWithdrawMenu'));
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
            >
              Cash out <span className="compute-token">$COMPUTE</span>
            </button>
            <button
              onClick={async () => {
                // Clear current wallet connection but keep the session
                localStorage.removeItem('userProfile');
                
                // Disconnect the current wallet first
                sessionStorage.removeItem('walletAddress');
                localStorage.removeItem('walletAddress');
                
                // Dispatch event to notify components about wallet change
                window.dispatchEvent(new Event('walletChanged'));
                
                // Wait a moment for the disconnect to complete
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Then trigger wallet connection flow to select a new wallet
                connectWallet();
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
            >
              Switch Account
            </button>
            <button
              onClick={() => {
                connectWallet();
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-red-500 hover:text-white transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  } else if (isConnected) {
    // Show wallet address if profile not loaded yet
    return (
      <div className={`${className}`} ref={dropdownRef}>
        <button 
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="bg-white px-4 py-2 rounded shadow hover:bg-gray-100 transition-colors flex items-center"
        >
          <span className="mr-2">{walletAddress?.slice(0, 4)}...{walletAddress?.slice(-4)}</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20">
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('showTransferMenu'));
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-blue-500 hover:text-white transition-colors"
            >
              Transfer Compute
            </button>
            <button
              onClick={() => {
                connectWallet();
                setDropdownOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-red-500 hover:text-white transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  } else {
    // Not connected
    return (
      <button 
        onClick={connectWallet}
        className={`bg-white px-4 py-2 rounded shadow hover:bg-purple-100 transition-colors ${className}`}
      >
        Connect Wallet
      </button>
    );
  }
}
