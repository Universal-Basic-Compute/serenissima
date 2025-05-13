'use client';

import { useState, useEffect } from 'react';
import { FaCog, FaTimes, FaCheck, FaAdjust, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [volume, setVolume] = useState<number>(50);
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  
  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('serenissima-settings');
      if (savedSettings) {
        try {
          const settings = JSON.parse(savedSettings);
          if (settings.volume !== undefined) setVolume(settings.volume);
          if (settings.quality !== undefined) setQuality(settings.quality);
          if (settings.darkMode !== undefined) setDarkMode(settings.darkMode);
          if (settings.soundEnabled !== undefined) setSoundEnabled(settings.soundEnabled);
        } catch (e) {
          console.error('Error parsing saved settings:', e);
        }
      }
    }
  }, []);
  
  // Save settings to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const settings = { volume, quality, darkMode, soundEnabled };
      localStorage.setItem('serenissima-settings', JSON.stringify(settings));
      
      // Apply dark mode setting
      if (darkMode) {
        document.documentElement.classList.add('dark-mode');
      } else {
        document.documentElement.classList.remove('dark-mode');
      }
      
      // Dispatch event to notify other components about settings changes
      window.dispatchEvent(new CustomEvent('settingsChanged', { 
        detail: settings 
      }));
    }
  }, [volume, quality, darkMode, soundEnabled]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-amber-50 rounded-lg shadow-xl w-full max-w-md p-6 relative border-2 border-amber-600">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-red-600 transition-colors"
        >
          <FaTimes size={24} />
        </button>
        
        <h2 className="text-2xl font-serif text-amber-800 mb-6 flex items-center">
          <FaCog className="mr-2" /> Settings
        </h2>
        
        <div className="space-y-6">
          {/* Graphics Quality */}
          <div>
            <h3 className="text-lg font-serif text-amber-700 mb-2">Graphics Quality</h3>
            <div className="flex space-x-2">
              {['low', 'medium', 'high'].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuality(q as any)}
                  className={`px-4 py-2 rounded-lg flex-1 ${
                    quality === q 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  {q.charAt(0).toUpperCase() + q.slice(1)}
                  {quality === q && <FaCheck className="ml-2 inline" />}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Lower quality improves performance on older devices.
            </p>
          </div>
          
          {/* Volume Control */}
          <div>
            <h3 className="text-lg font-serif text-amber-700 mb-2 flex items-center">
              {soundEnabled ? <FaVolumeUp className="mr-2" /> : <FaVolumeMute className="mr-2" />}
              Sound Volume
            </h3>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-lg ${
                  soundEnabled ? 'bg-amber-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}
              >
                {soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseInt(e.target.value))}
                className="flex-1 accent-amber-600"
                disabled={!soundEnabled}
              />
              <span className="text-amber-800 w-8 text-right">{volume}%</span>
            </div>
          </div>
          
          {/* Dark Mode Toggle */}
          <div>
            <h3 className="text-lg font-serif text-amber-700 mb-2 flex items-center">
              <FaAdjust className="mr-2" /> Dark Mode
            </h3>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-full px-4 py-3 rounded-lg flex items-center justify-between ${
                darkMode 
                  ? 'bg-gray-800 text-white' 
                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              }`}
            >
              <span>{darkMode ? 'Enabled' : 'Disabled'}</span>
              <div 
                className={`w-12 h-6 rounded-full relative ${darkMode ? 'bg-amber-600' : 'bg-gray-300'}`}
              >
                <div 
                  className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
                    darkMode ? 'right-0.5' : 'left-0.5'
                  }`} 
                />
              </div>
            </button>
          </div>
        </div>
        
        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-serif"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
