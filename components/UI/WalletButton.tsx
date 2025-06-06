'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWalletContext } from './WalletProvider';
import PlayerProfile from './PlayerProfile';
import { eventBus } from '@/lib/utils/eventBus'; // Import eventBus
import ProfileEditor from './ProfileEditor';
import EconomyPanel from './EconomyPanel';
import { FaChartLine, FaTelegramPlane } from 'react-icons/fa'; // Added FaTelegramPlane

interface WalletButtonProps {
  className?: string;
  onSettingsClick?: () => void;
}

export default function WalletButton({ className = '', onSettingsClick }: WalletButtonProps) {
  const { walletAddress, citizenProfile, isConnected, connectWallet, clearWalletState } = useWalletContext(); // Ajouter clearWalletState
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showEconomyPanel, setShowEconomyPanel] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  // Add effect to handle clicking outside the dropdown to close it
  useEffect(function() {
    const handleClickOutside = function(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return function() {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []); // Explicit semicolon added here
  
  return (
    <>
      {/* Main wallet button UI */}
      {isConnected && citizenProfile ? (
        citizenProfile.username ? (
          (!citizenProfile.firstName || !citizenProfile.lastName) ? (
            <button
              onClick={() => router.push('/arrival')}
              className={`bg-red-800 hover:bg-red-900 text-white font-semibold px-6 py-3 rounded-lg shadow-md hover:shadow-lg transition-colors duration-150 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-opacity-50 ${className}`}
            >
              Enter La Serenissima
            </button>
          ) : (
            <div className={`${className} flex-shrink-0`} ref={dropdownRef}>
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
              className="bg-amber-50 px-4 py-2 rounded-lg shadow-md hover:bg-amber-100 transition-colors flex items-center border-2 border-amber-300"
            >
              <PlayerProfile
                username={citizenProfile.username}
                firstName={citizenProfile.firstName}
                lastName={citizenProfile.lastName}
                coatOfArmsImageUrl={citizenProfile.coatOfArmsImageUrl} // For potential separate CoA display
                imageUrl={citizenProfile.imageUrl} // For main profile image
                familyMotto={citizenProfile.familyMotto}
                Ducats={citizenProfile.ducats}
                influence={citizenProfile.influence} // Pass influence
                size="medium"
                className="mr-2"
                showMotto={false}
                showDucats
                showInfluence
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
                  {citizenProfile.familyMotto && (
                    <p className="text-xs italic text-amber-600 mt-1">"{citizenProfile.familyMotto}"</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (citizenProfile) {
                      // Ensure citizenId is part of the event payload, using coatOfArms as the ID
                      const eventPayload = {
                        ...citizenProfile,
                        citizenId: citizenProfile.coatOfArms || citizenProfile.username // Use coatOfArms as ID, fallback to username if ID is missing
                      };
                      eventBus.emit('showCitizenPanelEvent', eventPayload);
                    }
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  My Profile
                </button>
                <button
                  onClick={() => {
                    setShowProfileEditor(true);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => {
                    setShowEconomyPanel(true);
                    setDropdownOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  <span className="flex items-center">
                    <FaChartLine className="mr-2" />
                    Economy
                  </span>
                </button>
                <a
                  href="https://t.me/serenissima_ubc_bot" 
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setDropdownOpen(false)}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  <span className="flex items-center">
                    <FaTelegramPlane className="mr-2" />
                    Telegram
                  </span>
                </a>
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
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onSettingsClick) {
                      onSettingsClick();
                    }
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  Settings
                </button>
                <button
                  onClick={async () => {
                    if (clearWalletState) clearWalletState(); // Effacer l'état du contexte et localStorage
                    
                    // Force Phantom to forget the connection by directly accessing the window.solana object
                    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
                      try {
                        // First try to disconnect using Phantom's own method
                        window.solana.disconnect();
                        
                        // Then reload the page to completely reset the connection state
                        // This is the most reliable way to force Phantom to show the account selector
                        window.location.reload();
                      } catch (e) {
                        console.warn("Could not access Phantom browser API during Switch Account:", e);
                        // If Phantom disconnect fails, still reload to clear state from our side
                        window.location.reload();
                      }
                    } else {
                      // If window.solana is not available, just reload
                      window.location.reload();
                    }
                    // No need to call setDropdownOpen(false) as page reloads.
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-amber-500 hover:text-white transition-colors"
                >
                  Switch Account
                </button>
                <button
                  onClick={async () => {
                    try {
                      setDropdownOpen(false); // Close dropdown first
                      
                      if (clearWalletState) clearWalletState(); // Effacer l'état du contexte et localStorage
                                            
                      // Attempt to disconnect Phantom wallet adapter if available
                      if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom && typeof window.solana.disconnect === 'function') {
                        try {
                          await window.solana.disconnect();
                          console.log("Phantom wallet disconnected successfully via WalletButton.");
                        } catch (e) {
                          console.warn("Error attempting to disconnect Phantom wallet via WalletButton:", e);
                        }
                      }
                                                                
                      // Force a page reload to ensure a clean state
                      window.location.reload();

                    } catch (error) {
                      console.error("Error disconnecting wallet:", error);
                      alert(`Failed to disconnect wallet: ${error instanceof Error ? error.message : String(error)}`);
                    }
                  }}
                  className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-red-500 hover:text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
          ) /* Fin de la condition (!citizenProfile.firstName || !citizenProfile.lastName) */
        ) : null /* Cas où username est null est maintenant géré par UsernamePrompt via WalletProvider */
      ) : isConnected ? (
        // User is connected, but citizenProfile is null (e.g., profile fetch failed or pending, ou en attente du UsernamePrompt)
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
      ) : (
        <button 
          onClick={connectWallet}
          className={`bg-white px-4 py-2 rounded shadow hover:bg-purple-100 transition-colors ${className}`}
        >
          Connect Wallet
        </button>
      )}
      
      {/* Render modals */}
      {showProfileEditor && (
        <ProfileEditor 
          onClose={() => setShowProfileEditor(false)}
          onSuccess={(updatedProfile) => {
            // You can add additional logic here if needed
            console.log('Profile updated successfully:', updatedProfile);
          }}
        />
      )}
      {showEconomyPanel && (
        <EconomyPanel onClose={() => setShowEconomyPanel(false)} />
      )}
    </>
  );
  
}
