import React, { useState, useEffect } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import CitizenRegistryCard from '@/components/UI/CitizenRegistryCard';

interface CitizenRegistryProps {
  onClose: () => void;
}

const CitizenRegistry: React.FC<CitizenRegistryProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'registro' | 'carta'>('registro');
  const [citizens, setCitizens] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadCitizens = async () => {
      setIsLoading(true);
      
      if (!citizenService.isDataLoaded()) {
        await citizenService.loadCitizens();
      }
      
      const allCitizens = citizenService.getCitizens();
      
      // Sort citizens by Ducats in descending order
      const sortedCitizens = [...allCitizens].sort((a, b) => {
        const ducatsA = a.Ducats || a.ducats || 0;
        const ducatsB = b.Ducats || b.ducats || 0;
        return ducatsB - ducatsA;
      });
      
      setCitizens(sortedCitizens);
      setIsLoading(false);
    };
    
    loadCitizens();
  }, []);

  return (
    <div className="absolute top-20 left-20 right-20 bottom-20 bg-amber-50 border-2 border-amber-700 rounded-lg shadow-xl z-40 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-amber-700 text-white p-4 flex justify-between items-center">
        <h2 className="text-2xl font-serif">Registro dei Cittadini</h2>
        <button 
          onClick={onClose}
          className="text-white hover:text-amber-200 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* Tabs */}
      <div className="flex border-b border-amber-300">
        <button
          className={`px-6 py-3 font-serif text-lg ${
            activeTab === 'registro' 
              ? 'bg-amber-100 text-amber-900 border-t-2 border-l-2 border-r-2 border-amber-300 rounded-t-lg -mb-px' 
              : 'text-amber-700 hover:text-amber-900'
          }`}
          onClick={() => setActiveTab('registro')}
        >
          Il Registro Mercantile
        </button>
        <button
          className={`px-6 py-3 font-serif text-lg ${
            activeTab === 'carta' 
              ? 'bg-amber-100 text-amber-900 border-t-2 border-l-2 border-r-2 border-amber-300 rounded-t-lg -mb-px' 
              : 'text-amber-700 hover:text-amber-900'
          }`}
          onClick={() => setActiveTab('carta')}
        >
          La Carta Mercantile
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-6 bg-amber-100">
        {activeTab === 'registro' ? (
          <>
            <h3 className="text-xl font-serif text-amber-900 mb-4">Cittadini di Venezia (ordinati per ricchezza)</h3>
            
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-amber-800">Caricamento del registro...</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {citizens.map((citizen) => (
                  <CitizenRegistryCard
                    key={citizen.id || citizen.citizenId || citizen.username}
                    username={citizen.username}
                    firstName={citizen.firstName || citizen.firstname || citizen.FirstName}
                    lastName={citizen.lastName || citizen.lastname || citizen.LastName}
                    coatOfArmsImage={citizen.coatOfArmsImage || `/coat-of-arms/${citizen.username}.png`}
                    familyMotto={citizen.familyMotto}
                    Ducats={citizen.Ducats || citizen.ducats}
                    socialClass={citizen.socialClass || citizen.socialclass || citizen.SocialClass}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex justify-center items-center h-64">
            <div className="text-amber-800 italic">La Carta Mercantile sarà disponibile presto...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CitizenRegistry;
