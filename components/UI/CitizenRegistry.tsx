import React, { useState, useEffect, useMemo } from 'react';
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
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortOption, setSortOption] = useState<'wealth' | 'name' | 'class'>('wealth');
  const [filterClass, setFilterClass] = useState<string>('all');

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
      setCitizens(allCitizens);
      setIsLoading(false);
    };
    
    loadCitizens();
  }, []);

  // Filter and sort citizens
  const filteredAndSortedCitizens = useMemo(() => {
    // First filter by search term and social class
    let result = citizens.filter(citizen => {
      const firstName = citizen.firstName || citizen.firstname || citizen.FirstName || '';
      const lastName = citizen.lastName || citizen.lastname || citizen.LastName || '';
      const username = citizen.username || '';
      const socialClass = (citizen.socialClass || citizen.socialclass || citizen.SocialClass || '').toLowerCase();
      
      const matchesSearch = searchTerm === '' || 
        firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        username.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesClass = filterClass === 'all' || socialClass.includes(filterClass.toLowerCase());
      
      return matchesSearch && matchesClass;
    });
    
    // Then sort based on selected option
    return result.sort((a, b) => {
      if (sortOption === 'wealth') {
        const ducatsA = a.Ducats || a.ducats || 0;
        const ducatsB = b.Ducats || b.ducats || 0;
        return ducatsB - ducatsA;
      } else if (sortOption === 'name') {
        const nameA = `${a.firstName || a.firstname || a.FirstName || ''} ${a.lastName || a.lastname || a.LastName || ''}`.trim().toLowerCase();
        const nameB = `${b.firstName || b.firstname || b.FirstName || ''} ${b.lastName || b.lastname || b.LastName || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      } else if (sortOption === 'class') {
        const classA = (a.socialClass || a.socialclass || a.SocialClass || '').toLowerCase();
        const classB = (b.socialClass || b.socialclass || b.SocialClass || '').toLowerCase();
        return classA.localeCompare(classB);
      }
      return 0;
    });
  }, [citizens, searchTerm, sortOption, filterClass]);

  // Get unique social classes for filter dropdown
  const socialClasses = useMemo(() => {
    const classes = new Set<string>();
    citizens.forEach(citizen => {
      const socialClass = citizen.socialClass || citizen.socialclass || citizen.SocialClass;
      if (socialClass) {
        classes.add(socialClass);
      }
    });
    return Array.from(classes);
  }, [citizens]);

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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h3 className="text-xl font-serif text-amber-900">Citizens of Venice</h3>
              
              {/* Search and filter controls */}
              <div className="flex flex-col md:flex-row gap-3">
                {/* Search box */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search citizen..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-3 top-2.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                
                {/* Sort dropdown */}
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as 'wealth' | 'name' | 'class')}
                  className="px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                >
                  <option value="wealth">Sort by Wealth</option>
                  <option value="name">Sort by Name</option>
                  <option value="class">Sort by Social Class</option>
                </select>
                
                {/* Class filter dropdown */}
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                >
                  <option value="all">All Classes</option>
                  {socialClasses.map(socialClass => (
                    <option key={socialClass} value={socialClass}>{socialClass}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-amber-800">Loading registry...</div>
              </div>
            ) : filteredAndSortedCitizens.length === 0 ? (
              <div className="flex justify-center items-center h-64">
                <div className="text-amber-800">No citizens found</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAndSortedCitizens.map((citizen) => {
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
                        isCurrentUser={citizen.username === currentUsername}
                        onViewProfile={(citizen) => setSelectedRegistryCitizen(citizen)}
                      />
                      
                      {/* Relevancies Section */}
                      {citizenRelevancies.length > 0 && (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                          <details className="group">
                            <summary className="flex justify-between items-center p-3 bg-amber-100 cursor-pointer">
                              <span className="font-medium text-amber-800">Relations ({citizenRelevancies.length})</span>
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
            
            {/* Results count */}
            <div className="mt-4 text-sm text-amber-700">
              Showing {filteredAndSortedCitizens.length} of {citizens.length} citizens
            </div>
          </>
        ) : (
          <div className="flex justify-center items-center h-64">
            <div className="text-amber-800 italic">The Merchant's Map will be available soon...</div>
          </div>
        )}
      </div>
    </div>
    
    {/* Render the CitizenDetailsPanel when a citizen is selected */}
    {selectedRegistryCitizen && (
      <CitizenDetailsPanel 
        citizen={selectedRegistryCitizen} 
        onClose={() => setSelectedRegistryCitizen(null)} 
      />
    )}
  );
};

export default CitizenRegistry;
