import React, { useState } from 'react';
import { FaTimes, FaCog, FaImage, FaVolumeUp, FaBug } from 'react-icons/fa';

interface SettingsProps {
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'graphics' | 'sound' | 'debug'>('graphics');
  const [isLoading, setIsLoading] = useState(false);

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
                      className="w-full border border-amber-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
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
                      className="w-full border border-amber-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
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
                      defaultValue="80"
                      className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Music Volume
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      defaultValue="60"
                      className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Effects Volume
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      defaultValue="70"
                      className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="mute"
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <label htmlFor="mute" className="ml-2 block text-sm text-gray-700">
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
                      id="showFps"
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <label htmlFor="showFps" className="ml-2 block text-sm text-gray-700">
                      Show FPS Counter
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showDebugInfo"
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                    />
                    <label htmlFor="showDebugInfo" className="ml-2 block text-sm text-gray-700">
                      Show Debug Information
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="bg-amber-100 p-4 border-t border-amber-300 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
