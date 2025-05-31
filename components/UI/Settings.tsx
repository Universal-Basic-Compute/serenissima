import React, { useState, useEffect } from 'react';
import { FaTimes, FaCog, FaImage, FaVolumeUp, FaBug, FaSave } from 'react-icons/fa';
import { getWalletAddress } from '../../lib/utils/walletUtils';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'graphics' | 'sound' | 'debug'>('graphics');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [qualityMode, setQualityMode] = useState<'high' | 'performance'>('high');
  const [waterQuality, setWaterQuality] = useState<'high' | 'medium' | 'low' | 'minimal'>('high');
  const [masterVolume, setMasterVolume] = useState<number>(80);
  const [musicVolume, setMusicVolume] = useState<number>(60);
  const [effectsVolume, setEffectsVolume] = useState<number>(70);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showFps, setShowFps] = useState<boolean>(false);
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [settingsDisabled, setSettingsDisabled] = useState(false); // Set to false to enable settings

  // Load settings from localStorage on component mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedSettings = localStorage.getItem('citizenSettings');
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          
          // Apply saved settings
          if (settings.qualityMode) setQualityMode(settings.qualityMode);
          if (settings.waterQuality) setWaterQuality(settings.waterQuality);
          if (settings.masterVolume !== undefined) setMasterVolume(settings.masterVolume);
          if (settings.musicVolume !== undefined) setMusicVolume(settings.musicVolume);
          if (settings.effectsVolume !== undefined) setEffectsVolume(settings.effectsVolume);
          if (settings.isMuted !== undefined) setIsMuted(settings.isMuted);
          if (settings.showFps !== undefined) setShowFps(settings.showFps);
          if (settings.showDebugInfo !== undefined) setShowDebugInfo(settings.showDebugInfo);
          
          // Apply audio settings immediately
          applyAudioSettings(settings.masterVolume, settings.musicVolume, settings.effectsVolume, settings.isMuted);
          
          // Apply water quality settings immediately
          applyWaterQualitySettings(settings.waterQuality);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    
    loadSettings();
  }, []);

  useEffect(() => {
    // This effect runs when audio-related states change,
    // ensuring that the audio settings are applied (e.g., events dispatched)
    // This provides real-time feedback.
    // applyAudioSettings is defined below and is stable in terms of its own dependencies.
    applyAudioSettings(masterVolume, musicVolume, effectsVolume, isMuted);
  }, [masterVolume, musicVolume, effectsVolume, isMuted]);
  
  // Apply audio settings to the game
  const applyAudioSettings = (master: number, music: number, effects: number, muted: boolean) => {
    // Dispatch custom event for audio settings
    window.dispatchEvent(new CustomEvent('audioSettingsChanged', {
      detail: {
        masterVolume: master,
        musicVolume: music,
        effectsVolume: effects,
        isMuted: muted
      }
    }));
    
    // Also notify Compagno about audio settings changes
    window.dispatchEvent(new CustomEvent('compagnoSettingsChanged', {
      detail: {
        type: 'audio',
        settings: {
          masterVolume: master,
          musicVolume: music,
          effectsVolume: effects,
          isMuted: muted
        }
      }
    }));
  };
  
  // Apply water quality settings to the game
  const applyWaterQualitySettings = (quality: 'high' | 'medium' | 'low' | 'minimal') => {
    // Dispatch custom event for water quality settings
    window.dispatchEvent(new CustomEvent('waterQualityChanged', {
      detail: {
        waterQuality: quality
      }
    }));
  };
  
  // Save settings to localStorage and backend
  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    
    try {
      // Create settings object
      const settings = {
        qualityMode,
        waterQuality,
        masterVolume,
        musicVolume,
        effectsVolume,
        isMuted,
        showFps,
        showDebugInfo
      };
      
      // Save to localStorage
      localStorage.setItem('citizenSettings', JSON.stringify(settings));
      
      // Apply audio settings
      applyAudioSettings(masterVolume, musicVolume, effectsVolume, isMuted);
      
      // Apply water quality settings
      applyWaterQualitySettings(waterQuality);
      
      // Dispatch event for graphics settings
      window.dispatchEvent(new CustomEvent('graphicsSettingsChanged', {
        detail: {
          qualityMode,
          waterQuality
        }
      }));
      
      // Dispatch event for debug settings
      window.dispatchEvent(new CustomEvent('debugSettingsChanged', {
        detail: {
          showFps,
          showDebugInfo
        }
      }));
      
      // Notify Compagno about all settings changes
      window.dispatchEvent(new CustomEvent('compagnoSettingsChanged', {
        detail: {
          type: 'all',
          settings: {
            qualityMode,
            waterQuality,
            masterVolume,
            musicVolume,
            effectsVolume,
            isMuted,
            showFps,
            showDebugInfo
          }
        }
      }));
      
      // Get username from localStorage instead of wallet address
      const username = (() => {
        try {
          const savedProfile = localStorage.getItem('citizenProfile');
          if (savedProfile) {
            const profile = JSON.parse(savedProfile);
            return profile.username;
          }
          return null;
        } catch (error) {
          console.error('Error getting username from localStorage:', error);
          return null;
        }
      })();
      
      // If username is available, save to backend
      if (username) {
        const response = await fetch('/api/citizen/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wallet_address: username, // We're using the wallet_address field to pass the username
            settings: settings // Send the whole settings object
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to save settings to server');
        }
        
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Unknown error saving settings');
        }
      }
      
      // Show success message
      setSaveMessage({
        type: 'success',
        text: 'Settings saved successfully'
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings'
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleFlushCaches = async () => {
    setIsLoading(true);
    try {
      // Call the API to flush caches
      const response = await fetch('/api/flush-cache', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to flush caches');
      }
      
      // Show success message
      alert('All caches have been flushed successfully. The page will reload.');
      
      // Reload the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error flushing caches:', error);
      alert('Failed to flush caches. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg w-[800px] max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-amber-700 text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-serif">Settings</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-amber-200 transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 bg-amber-100 p-4 border-r border-amber-300">
            <ul className="space-y-2">
              <li>
                <button
                  onClick={() => setActiveTab('graphics')}
                  className={`w-full text-left px-3 py-2 rounded flex items-center ${
                    activeTab === 'graphics' 
                      ? 'bg-amber-600 text-white' 
                      : 'hover:bg-amber-200 text-amber-900'
                  }`}
                >
                  <FaImage className="mr-2" />
                  Graphics
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveTab('sound')}
                  className={`w-full text-left px-3 py-2 rounded flex items-center ${
                    activeTab === 'sound' 
                      ? 'bg-amber-600 text-white' 
                      : 'hover:bg-amber-200 text-amber-900'
                  }`}
                >
                  <FaVolumeUp className="mr-2" />
                  Sound
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveTab('debug')}
                  className={`w-full text-left px-3 py-2 rounded flex items-center ${
                    activeTab === 'debug' 
                      ? 'bg-amber-600 text-white' 
                      : 'hover:bg-amber-200 text-amber-900'
                  }`}
                >
                  <FaBug className="mr-2" />
                  Debug
                </button>
              </li>
            </ul>
          </div>
          
          {/* Main content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'graphics' && (
              <div>
                <h3 className="text-lg font-medium text-amber-800 mb-4">Graphics Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quality Mode
                    </label>
                    <select 
                      value={qualityMode}
                      onChange={(e) => setQualityMode(e.target.value as 'high' | 'performance')}
                      className={`w-full border border-amber-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500 ${settingsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={settingsDisabled}
                    >
                      <option value="high">High Quality</option>
                      <option value="performance">Performance Mode</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Water Quality
                    </label>
                    <select 
                      value={waterQuality}
                      onChange={(e) => setWaterQuality(e.target.value as 'high' | 'medium' | 'low' | 'minimal')}
                      className={`w-full border border-amber-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500 ${settingsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={settingsDisabled}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="minimal">Minimal (Best Performance)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'sound' && (
              <div>
                <h3 className="text-lg font-medium text-amber-800 mb-4">Sound Settings</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Master Volume
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={masterVolume}
                      onChange={(e) => setMasterVolume(parseInt(e.target.value))}
                      className={`w-full h-2 bg-amber-200 rounded-lg appearance-none ${settingsDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      disabled={settingsDisabled}
                    />
                    <div className="text-right text-xs text-gray-500 mt-1">{masterVolume}%</div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Music Volume
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={musicVolume}
                      onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                      className={`w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer`}
                      disabled={false}
                    />
                    <div className="text-right text-xs text-gray-500 mt-1">{musicVolume}%</div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Effects Volume
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={effectsVolume}
                      onChange={(e) => setEffectsVolume(parseInt(e.target.value))}
                      className={`w-full h-2 bg-amber-200 rounded-lg appearance-none ${settingsDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      disabled={settingsDisabled}
                    />
                    <div className="text-right text-xs text-gray-500 mt-1">{effectsVolume}%</div>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="mute"
                      checked={isMuted}
                      onChange={(e) => setIsMuted(e.target.checked)}
                      className={`h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded ${settingsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={settingsDisabled}
                    />
                    <label htmlFor="mute" className={`ml-2 block text-sm text-gray-700 ${settingsDisabled ? 'opacity-50' : ''}`}>
                      Mute All Sounds
                    </label>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'debug' && (
              <div>
                <h3 className="text-lg font-medium text-amber-800 mb-4">Debug Options</h3>
                <div className="space-y-4">
                  <div className="bg-amber-100 p-4 rounded-md border border-amber-300">
                    <h4 className="font-medium text-amber-800 mb-2">Cache Management</h4>
                    <p className="text-sm text-amber-700 mb-3">
                      Flushing all caches will clear stored data and reload the application. 
                      This can help resolve display issues but will reset some of your preferences.
                    </p>
                    <button
                      onClick={handleFlushCaches}
                      disabled={isLoading}
                      className={`px-4 py-2 rounded-md ${
                        isLoading 
                          ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                          : 'bg-amber-600 text-white hover:bg-amber-700'
                      }`}
                    >
                      {isLoading ? 'Flushing Caches...' : 'Flush All Caches'}
                    </button>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showDebugInfo"
                      checked={showDebugInfo}
                      onChange={(e) => setShowDebugInfo(e.target.checked)}
                      className={`h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded ${settingsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={settingsDisabled}
                    />
                    <label htmlFor="showDebugInfo" className={`ml-2 block text-sm text-gray-700 ${settingsDisabled ? 'opacity-50' : ''}`}>
                      Show Debug Information
                    </label>
                  </div>
                  
                  <div className="flex items-center mt-2">
                    <input
                      type="checkbox"
                      id="showTransportDebug"
                      checked={false}
                      onChange={() => {
                        // Dispatch an event to show the transport debug panel
                        window.dispatchEvent(new CustomEvent('showTransportDebug'));
                      }}
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <label htmlFor="showTransportDebug" className="ml-2 block text-sm text-gray-700">
                      Show Transport Debug Panel
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="bg-amber-100 p-4 border-t border-amber-300 flex justify-between items-center">
          {/* Save message */}
          {saveMessage && (
            <div className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage.text}
            </div>
          )}
          
          <div className="flex space-x-3">
            <button
              onClick={saveSettings}
              disabled={isSaving || settingsDisabled}
              className={`px-4 py-2 rounded-md flex items-center ${
                isSaving || settingsDisabled ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <FaSave className="mr-2" />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
