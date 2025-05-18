import React, { useState, useEffect } from 'react';
import { citizenService } from '@/lib/services/CitizenService';
import CitizenRegistryCard from '@/components/UI/CitizenRegistryCard';

interface CitizenRegistryProps {
  onClose: () => void;
}

interface Relevancy {
  relevancyId: string;
  assetId: string;
  assetType: string;
  category: string;
  type: string;
  targetCitizen: string;
  relevantToCitizen: string;
  score: number;
  timeHorizon: string;
  title: string;
  description: string;
  notes: string;
  createdAt: string;
  status: string;
}

const CitizenRegistry: React.FC<CitizenRegistryProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'registro' | 'carta'>('registro');
  const [citizens, setCitizens] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [relevancies, setRelevancies] = useState<Record<string, Relevancy[]>>({});
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  // Get current username from localStorage
  useEffect(() => {
    try {
      const profileStr = localStorage.getItem('citizenProfile');
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        if (profile && profile.username) {
          setCurrentUsername(profile.username);
        }
      }
    } catch (error) {
      console.error('Error getting current username:', error);
    }
  }, []);

  // Fetch relevancies
  useEffect(() => {
    const fetchRelevancies = async () => {
      if (!currentUsername) return;
      
      try {
        console.log('Fetching relevancies for citizen:', currentUsername);
        const response = await fetch(`/api/relevancies?relevantToCitizen=${currentUsername}&assetType=citizen`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.relevancies) {
            console.log(`Loaded ${data.relevancies.length} relevancies`);
            
            // Group relevancies by target citizen
            const relevanciesByTarget: Record<string, Relevancy[]> = {};
            
            data.relevancies.forEach((relevancy: Relevancy) => {
              if (!relevanciesByTarget[relevancy.targetCitizen]) {
                relevanciesByTarget[relevancy.targetCitizen] = [];
              }
              relevanciesByTarget[relevancy.targetCitizen].push(relevancy);
            });
            
            setRelevancies(relevanciesByTarget);
          }
        } else {
          console.error('Failed to fetch relevancies:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error fetching relevancies:', error);
      }
    };
    
    fetchRelevancies();
  }, [currentUsername]);

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
                {citizens.map((citizen) => {
                  const username = citizen.username;
                  const citizenRelevancies = relevancies[username] || [];
                  
                  return (
                    <div key={citizen.id || citizen.citizenId || citizen.username} className="flex flex-col">
                      <CitizenRegistryCard
                        username={citizen.username}
                        firstName={citizen.firstName || citizen.firstname || citizen.FirstName}
                        lastName={citizen.lastName || citizen.lastname || citizen.LastName}
                        coatOfArmsImage={citizen.coatOfArmsImage || `/coat-of-arms/${citizen.username}.png`}
                        familyMotto={citizen.familyMotto}
                        Ducats={citizen.Ducats || citizen.ducats}
                        socialClass={citizen.socialClass || citizen.socialclass || citizen.SocialClass}
                      />
                      
                      {/* Relevancies Section */}
                      {citizenRelevancies.length > 0 && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                          <details className="group">
                            <summary className="flex justify-between items-center p-3 bg-amber-100 cursor-pointer">
                              <span className="font-medium text-amber-800">Relazioni ({citizenRelevancies.length})</span>
                              <svg className="w-5 h-5 text-amber-700 group-open:rotate-180 transition-transform" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </summary>
                            <div className="p-3 text-sm">
                              {citizenRelevancies.map((relevancy) => (
                                <div key={relevancy.relevancyId} className="mb-3 pb-3 border-b border-amber-100 last:border-0">
                                  <div className="flex justify-between">
                                    <span className="font-medium text-amber-900">{relevancy.title}</span>
                                    <span className="text-amber-700">Score: {relevancy.score}</span>
                                  </div>
                                  <p className="text-gray-700 mt-1">{relevancy.description}</p>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div><span className="text-amber-800">Type:</span> {relevancy.type}</div>
                                    <div><span className="text-amber-800">Category:</span> {relevancy.category}</div>
                                    <div><span className="text-amber-800">Time Horizon:</span> {relevancy.timeHorizon}</div>
                                    <div><span className="text-amber-800">Status:</span> {relevancy.status}</div>
                                  </div>
                                  {relevancy.notes && (
                                    <div className="mt-2 text-xs italic text-gray-600">
                                      <span className="text-amber-800">Notes:</span> {relevancy.notes}
                                    </div>
                                  )}
                                  <div className="mt-1 text-xs text-gray-500">
                                    Created: {new Date(relevancy.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  );
                })}
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
