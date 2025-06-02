import React, { useState, useEffect } from 'react';

interface GovernancePanelProps {
  onClose: () => void;
  standalone?: boolean;
}

interface SenatePlayer {
  username: string;
  firstName?: string;
  lastName?: string;
  influence: number;
  socialClass?: string;
  coatOfArmsImageUrl?: string | null;
  familyMotto?: string;
  isCurrentUser?: boolean;
}

interface SignoriaPlayer {
  username: string;
  firstName?: string;
  lastName?: string;
  influence: number;
  socialClass?: string;
  coatOfArmsImageUrl?: string | null;
  familyMotto?: string;
  isCurrentUser?: boolean;
}

interface Decree {
  DecreeId: string;
  Type: string;
  Title: string;
  Description: string;
  Status: 'Proposed' | 'Enacted' | 'Rejected' | 'Expired';
  Category: string;
  SubCategory: string;
  Proposer: string;
  CreatedAt: string;
  EnactedAt?: string;
  ExpiresAt?: string;
  FlavorText?: string;
  HistoricalInspiration?: string;
  Notes?: string;
  Rationale?: string; // New field for decree rationale
}

const mockDecrees: Decree[] = [
  {
    DecreeId: "D-1525-001",
    Type: "Trade Regulation",
    Title: "Silk Import Standards",
    Description: "Establishes quality standards for silk imports, requiring certification from approved inspectors.",
    Status: "Enacted",
    Category: "Commerce",
    SubCategory: "Import Regulations",
    Proposer: "Guild of Silk Merchants",
    CreatedAt: "1525-03-15",
    EnactedAt: "1525-04-01",
    ExpiresAt: "1526-04-01",
    FlavorText: "Let no inferior silk tarnish the reputation of Venetian craftsmanship.",
    HistoricalInspiration: "Based on the 1441 regulations of the Venetian Silk Guild.",
    Notes: "Particularly affects trade with Ottoman territories.",
    Rationale: "This decree protects Venice's reputation for quality silk products, prevents fraud, and ensures fair competition among merchants. By maintaining high standards, we preserve our competitive advantage in luxury textile contracts across Europe and the Mediterranean."
  },
  {
    DecreeId: "D-1525-002",
    Type: "Infrastructure",
    Title: "Canal Maintenance Fund",
    Description: "Establishes a special fund for the dredging and maintenance of minor canals, funded by a 2% surcharge on shipping fees.",
    Status: "Proposed",
    Category: "Infrastructure",
    SubCategory: "Waterways",
    Proposer: "Office of the Magistrato alle Acque",
    CreatedAt: "1525-05-10",
    FlavorText: "The lifeblood of our city must flow unimpeded.",
    HistoricalInspiration: "Inspired by the historical Magistrato alle Acque (Water Magistracy) of Venice.",
    Notes: "Awaiting final approval from the Senate.",
    Rationale: "Minor canals are increasingly silting up, impeding transportation and commerce in outer districts. This dedicated fund ensures regular maintenance without burdening the general treasury. The modest surcharge distributes costs fairly among those who benefit most from our waterways, while preventing the long-term economic damage of neglected infrastructure."
  },
  {
    DecreeId: "D-1524-015",
    Type: "Public Health",
    Title: "Quarantine Procedures for Eastern Ships",
    Description: "Updates quarantine requirements for ships arriving from eastern Mediterranean ports, extending the isolation period to 24 days during summer months.",
    Status: "Enacted",
    Category: "Health",
    SubCategory: "Maritime Quarantine",
    Proposer: "Council of Health",
    CreatedAt: "1524-11-20",
    EnactedAt: "1525-01-05",
    FlavorText: "Vigilance is the price of our city's health.",
    HistoricalInspiration: "Based on Venice's pioneering quarantine system established in 1423.",
    Notes: "Seasonal provisions apply from May through September.",
    Rationale: "Recent outbreaks in Constantinople and Alexandria have demonstrated that summer heat accelerates disease spread. Our physicians advise that the standard 14-day quarantine is insufficient during warmer months. While this measure may slightly delay trade, the catastrophic economic and human cost of an epidemic in Venice far outweighs these temporary inconveniences."
  },
  {
    DecreeId: "D-1524-012",
    Type: "Taxation",
    Title: "Luxury Goods Tariff Adjustment",
    Description: "Increases import duties on luxury goods from the Orient by 3%, with exemptions for raw materials used by Venetian craftsmen.",
    Status: "Enacted",
    Category: "Finance",
    SubCategory: "Taxation",
    Proposer: "Council of Ten",
    CreatedAt: "1524-09-05",
    EnactedAt: "1524-10-01",
    FlavorText: "Let those who enjoy luxury contribute to the strength of the Republic.",
    HistoricalInspiration: "Reflects Venice's historical practice of taxing luxury imports while protecting domestic industries.",
    Notes: "Revenue earmarked for naval defense.",
    Rationale: "This targeted tariff increase serves multiple purposes: it raises needed revenue for our naval defenses, encourages domestic production of finished luxury goods, and taxes consumption that is primarily non-essential. By exempting raw materials, we protect our artisans and manufacturers from increased costs, maintaining Venice's competitive advantage in high-value finished goods."
  },
  {
    DecreeId: "D-1524-008",
    Type: "Social Order",
    Title: "Carnival Mask Regulations",
    Description: "Clarifies when and where masks may be worn during Carnival season, with new penalties for violations.",
    Status: "Enacted",
    Category: "Social",
    SubCategory: "Public Order",
    Proposer: "Council of Ten",
    CreatedAt: "1524-07-12",
    EnactedAt: "1524-08-01",
    ExpiresAt: "None",
    FlavorText: "Even in celebration, order must prevail.",
    HistoricalInspiration: "Based on historical Venetian laws regulating mask-wearing to prevent anonymous crimes.",
    Notes: "Permanent decree with seasonal enforcement.",
    Rationale: "While Carnival traditions are essential to Venetian culture, the anonymity of masks has increasingly led to criminal activity and moral transgressions. This decree balances our cherished traditions with necessary public order by clearly defining when and where masks are permitted. The new penalties target only those who abuse this privilege, while preserving the festive spirit that attracts visitors and commerce to our city."
  }
];

const GovernancePanel: React.FC<GovernancePanelProps> = ({ onClose, standalone = false }) => {
  const [governanceTab, setGovernanceTab] = useState<'council' | 'laws' | 'signoria' | 'senate'>('laws');
  const [decrees, setDecrees] = useState<Decree[]>(mockDecrees);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [signoriaPlayers, setSignoriaPlayers] = useState<SignoriaPlayer[]>([]);
  const [isLoadingSignoria, setIsLoadingSignoria] = useState<boolean>(false);
  const [signoriaError, setSignoriaError] = useState<string | null>(null);
  const [senatePlayers, setSenatePlayers] = useState<SenatePlayer[]>([]);
  const [isLoadingSenate, setIsLoadingSenate] = useState<boolean>(false);
  const [senateError, setSenateError] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);

  // Function to fetch decrees from Airtable
  const fetchDecrees = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/decrees');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch decrees: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setDecrees(data);
    } catch (err) {
      console.error('Error fetching decrees:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch decrees');
      // Keep the mock data as fallback if fetch fails
      setDecrees(mockDecrees);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to fetch top players by influence
  const fetchSignoriaPlayers = async () => {
    setIsLoadingSignoria(true);
    setSignoriaError(null);
    
    try {
      // Fetch top 10 citizens by influence from our API
      const response = await fetch('/api/citizens/top-influence');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch top citizens: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.citizens)) {
        console.log(`Loaded ${data.citizens.length} top citizens by influence`);
        
        // Transform the API response to match our SignoriaPlayer interface
        const signoriaPlayers: SignoriaPlayer[] = data.citizens.map((citizen: any) => ({
          username: citizen.username,
          firstName: citizen.firstName,
          lastName: citizen.lastName,
          influence: citizen.influence || 0,
          socialClass: citizen.socialClass,
          coatOfArmsImageUrl: citizen.coatOfArmsImageUrl || 
            `https://backend.serenissima.ai/public/assets/images/coat-of-arms/${citizen.username}.png`,
          familyMotto: citizen.familyMotto || '',
          isCurrentUser: citizen.username === currentUsername
        }));
        
        setSignoriaPlayers(signoriaPlayers);
      } else {
        throw new Error('Invalid response format from API');
      }
    } catch (err) {
      console.error('Error fetching signoria players:', err);
      setSignoriaError(err instanceof Error ? err.message : 'Failed to fetch signoria players');
      setSignoriaPlayers([]);
    } finally {
      setIsLoadingSignoria(false);
    }
  };

  // Function to fetch top 50 players by influence for the Senate
  const fetchSenatePlayers = async () => {
    setIsLoadingSenate(true);
    setSenateError(null);
    
    try {
      // Fetch top 50 citizens by influence from our API
      // For now, we'll use the same endpoint but will need a dedicated one in the future
      const response = await fetch('/api/citizens/top-influence');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch senate citizens: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.citizens)) {
        console.log(`Loaded ${data.citizens.length} citizens for the Senate`);
        
        // Transform the API response to match our SenatePlayer interface
        // In a real implementation, we would fetch 50 citizens instead of 10
        const senatePlayers: SenatePlayer[] = data.citizens.map((citizen: any) => ({
          username: citizen.username,
          firstName: citizen.firstName,
          lastName: citizen.lastName,
          influence: citizen.influence || 0,
          socialClass: citizen.socialClass,
          coatOfArmsImageUrl: citizen.coatOfArmsImageUrl || 
            `https://backend.serenissima.ai/public/assets/images/coat-of-arms/${citizen.username}.png`,
          familyMotto: citizen.familyMotto || '',
          isCurrentUser: citizen.username === currentUsername
        }));
        
        setSenatePlayers(senatePlayers);
      } else {
        throw new Error('Invalid response format from API');
      }
    } catch (err) {
      console.error('Error fetching senate players:', err);
      setSenateError(err instanceof Error ? err.message : 'Failed to fetch senate players');
      setSenatePlayers([]);
    } finally {
      setIsLoadingSenate(false);
    }
  };

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

  // Fetch decrees when the component mounts or when the tab changes to 'laws'
  // Fetch signoria players when the tab changes to 'signoria'
  // Fetch senate players when the tab changes to 'senate'
  useEffect(() => {
    if (governanceTab === 'laws') {
      fetchDecrees();
    } else if (governanceTab === 'signoria') {
      fetchSignoriaPlayers();
    } else if (governanceTab === 'senate') {
      fetchSenatePlayers();
    }
  }, [governanceTab]);

  return (
    <div className={`${standalone ? 'fixed inset-0 bg-black/80 z-50' : 'absolute top-20 left-20 right-4 bottom-4 bg-black/30 z-40'} rounded-lg p-4 overflow-auto`}>
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Governance of La Serenissima
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Close governance panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={"M6 18L18 6M6 6l12 12"} />
            </svg>
          </button>
        </div>
        
        {/* Governance tabs */}
        <div className="border-b border-amber-200 mb-6">
          <nav className="-mb-px flex space-x-8">
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
                governanceTab === 'signoria' 
                  ? 'border-amber-600 text-amber-800' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setGovernanceTab('signoria')}
            >
              The Signoria
            </button>
            <button
              className={`pb-4 px-1 border-b-2 font-medium text-sm ${
                governanceTab === 'senate' 
                  ? 'border-amber-600 text-amber-800' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setGovernanceTab('senate')}
            >
              The Senate
            </button>
          </nav>
        </div>
        
        {/* Tab content */}
        {governanceTab === 'council' && (
          <div className="py-4">
            <h3 className="text-xl font-serif text-amber-800 mb-4 text-center">
              The Council of Ten
            </h3>
            
            <p className="text-amber-700 mb-6">
              The Council of Ten (Consiglio dei Dieci) is one of the most powerful governing bodies in La Serenissima, responsible for state security, important matters of governance, and maintaining the stability of the Republic.
            </p>
            
            {/* v0.3.0 Update Proclamation */}
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Recent Proclamation: v0.3.0 Update</h4>

              <p className="mb-4 text-amber-700">
                The Council of Ten has approved significant improvements to the Republic's systems:
              </p>

              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>
                  <span className="font-bold">Citizen Equality:</span> All citizens (both AI and human) are now equal in the eyes of the Republic, with humans displayed on the map and performing activities like housing and working just as AI citizens do.
                </li>
                <li>
                  <span className="font-bold">Enhanced Pathfinding:</span> The pathfinding system has been enhanced to utilize the canal network, improving transportation efficiency throughout Venice.
                </li>
                <li>
                  <span className="font-bold">Citizen Communication:</span> A new communication system allows humans to directly converse with citizens, including the ability to negotiate with them.
                </li>
              </ul>

              <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800">
                  <span className="font-bold">Rationale:</span> To create a more immersive and realistic experience for all citizens of La Serenissima, and to foster greater interaction between humans and AI citizens.
                </p>
              </div>
            </div>
            
            {/* First proclamation - Social Class System */}
            <div className="bg-amber-100 p-4 rounded-lg border border-amber-300 mb-6">
              <h4 className="text-xl font-serif text-amber-800 mb-2">Recent Proclamation: Social Class System</h4>
              
              <p className="mb-4 text-amber-700">
                The Council of Ten has established a formal social class system that affects all citizens of La Serenissima:
              </p>
              
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>
                  <span className="font-bold">Four Social Classes:</span> All citizens are now categorized into one of four social classes: Nobili (nobles), Cittadini (citizens), Popolani (common people), and Facchini (laborers).
                </li>
                <li>
                  <span className="font-bold">Social Mobility:</span> Citizens can rise through the ranks based on their achievements:
                  <ul className="list-circle pl-5 mt-1 space-y-1">
                    <li>Citizens with Influence &gt; 10,000 become Nobili</li>
                    <li>Citizens with Daily Income &gt; 100,000 Ducats become Cittadini</li>
                    <li>Business building owners are at least Popolani</li>
                    <li>Entrepreneurs (who run buildings) are at least Popolani</li>
                  </ul>
                </li>
                <li>
                  <span className="font-bold">Building Access:</span> Social class determines which building tiers citizens can construct:
                  <ul className="list-circle pl-5 mt-1 space-y-1">
                    <li>Nobili can build all tiers (1-5), with tier 5 requiring special decrees</li>
                    <li>Cittadini can build tiers 1-3</li>
                    <li>Popolani can build tiers 1-2</li>
                    <li>Facchini can build tier 1 only</li>
                  </ul>
                </li>
                <li>
                  <span className="font-bold">Treasury Distribution:</span> The 10% of treasury redistributed daily is allocated based on social class: 40% to Nobili, 30% to Cittadini, 20% to Popolani, and 10% to Facchini.
                </li>
              </ul>
              
              <div className="mt-4 bg-amber-50 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800">
                  <span className="font-bold">Rationale:</span> This system creates a dynamic society where citizens can rise through the social ranks based on their economic achievements and contributions to the city, while maintaining the historical stratification that characterized Renaissance Venice.
                </p>
              </div>
            </div>
            
            <div className="text-center mt-8 text-amber-700">
              <p>Additional Council of Ten features coming soon.</p>
              <p className="text-sm italic mt-2">The Council watches over the Republic with vigilance and discretion.</p>
            </div>
          </div>
        )}
        
        {governanceTab === 'laws' && (
          <div className="py-4">
            <h3 className="text-xl font-serif text-amber-800 mb-4 text-center">
              Laws & Decrees of La Serenissima
            </h3>
            
            {isLoading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
                <p className="mt-2 text-amber-800">Loading decrees from the archives...</p>
              </div>
            )}
            
            {error && (
              <div className="bg-red-50 border border-red-300 text-red-800 p-4 rounded-lg mb-6">
                <p className="font-medium">Failed to retrieve decrees</p>
                <p className="text-sm mt-1">{error}</p>
                <p className="text-sm mt-2 italic">Showing historical records instead.</p>
              </div>
            )}
            
            {!isLoading && decrees.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {decrees.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()).map((decree) => {
                  // Format dates in a more readable way
                  const createdDate = new Date(decree.CreatedAt);
                  const formattedCreatedDate = `${createdDate.getDate()} ${
                    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 
                     'August', 'September', 'October', 'November', 'December'][createdDate.getMonth()]
                  } ${createdDate.getFullYear()}`;
                  
                  // Format enacted date if it exists
                  let formattedEnactedDate = '';
                  if (decree.EnactedAt) {
                    const enactedDate = new Date(decree.EnactedAt);
                    formattedEnactedDate = `${enactedDate.getDate()} ${
                      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 
                       'August', 'September', 'October', 'November', 'December'][enactedDate.getMonth()]
                    } ${enactedDate.getFullYear()}`;
                  }
                  
                  return (
                    <div key={decree.DecreeId} className="transform transition-all duration-300 hover:scale-105 hover:shadow-xl">
                      <div className="relative bg-amber-50 border-2 border-amber-300 rounded-lg overflow-hidden shadow-md">
                        {/* Parchment texture overlay */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" 
                             style={{
                               backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E\")",
                               backgroundRepeat: "repeat"
                             }}>
                        </div>
                        
                        {/* Decorative header */}
                        <div className="bg-gradient-to-r from-amber-200 to-amber-100 px-4 py-3 border-b border-amber-300">
                          <div className="flex justify-between items-center">
                            <div className="font-serif text-amber-800 text-lg font-bold">{decree.Title}</div>
                            <div className="text-xs text-amber-700 font-medium">{decree.Type}</div>
                          </div>
                        </div>
                        
                        {/* Main content */}
                        <div className="p-4">
                          {/* Status and seal */}
                          <div className="flex justify-between items-start mb-4">
                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-serif font-semibold rounded-full ${
                              decree.Status === 'Enacted' ? 'bg-green-100 text-green-800 border border-green-300' : 
                              decree.Status === 'Proposed' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                              decree.Status === 'Rejected' ? 'bg-red-100 text-red-800 border border-red-300' :
                              'bg-gray-100 text-gray-800 border border-gray-300'
                            }`}>
                              {decree.Status}
                            </span>
                            
                            {decree.Status === 'Enacted' && (
                              <div className="relative w-16 h-16 flex-shrink-0">
                                <img 
                                  src="/images/venice-seal.png" 
                                  alt="Official Seal" 
                                  className="w-full h-full object-contain opacity-90"
                                  title="Officially enacted by the Council of Ten"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                  <span className="text-xs text-amber-800 bg-amber-50/80 px-1 rounded">Official Seal</span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Description */}
                          <div className="mb-4 text-sm text-amber-800 font-serif leading-relaxed">
                            {decree.Description}
                          </div>
                          
                          {/* Flavor text */}
                          {decree.FlavorText && (
                            <div className="mb-4 text-xs italic text-amber-600 font-serif border-l-2 border-amber-200 pl-3">
                              "{decree.FlavorText}"
                            </div>
                          )}
                          
                          {/* Category and subCategory */}
                          <div className="flex justify-between text-xs text-amber-700 mb-4">
                            <div>
                              <span className="font-medium">Category:</span> {decree.Category}
                              {decree.SubCategory && <span> • {decree.SubCategory}</span>}
                            </div>
                          </div>
                          
                          {/* Dates */}
                          <div className="text-xs text-amber-700 space-y-1 mb-4">
                            <div>
                              <span className="font-medium">Proposed:</span> <span className="font-serif">{formattedCreatedDate}</span>
                            </div>
                            {decree.EnactedAt && (
                              <div>
                                <span className="font-medium">Enacted:</span> <span className="font-serif">{formattedEnactedDate}</span>
                              </div>
                            )}
                            {decree.ExpiresAt && decree.ExpiresAt !== 'None' && (
                              <div>
                                <span className="font-medium">Expires:</span> <span className="font-serif">{decree.ExpiresAt}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* Proposer */}
                          <div className="text-xs text-amber-700 mb-4">
                            <span className="font-medium">Proposed by:</span> <span className="font-serif">{decree.Proposer}</span>
                          </div>
                          
                          {/* Rationale spoiler */}
                          {decree.Rationale && (
                            <div className="mt-3">
                              <details className="bg-amber-50 rounded border border-amber-200 overflow-hidden">
                                <summary className="px-3 py-2 cursor-pointer text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors">
                                  View Rationale for this Decree
                                </summary>
                                <div className="px-3 py-2 text-xs text-amber-700 border-t border-amber-200 bg-amber-50/50 font-serif">
                                  {decree.Rationale}
                                </div>
                              </details>
                            </div>
                          )}
                          
                          {/* Historical inspiration - hidden by default */}
                          {decree.HistoricalInspiration && (
                            <div className="mt-2">
                              <details className="text-xs">
                                <summary className="cursor-pointer text-amber-600 hover:text-amber-800 transition-colors">
                                  Historical Note
                                </summary>
                                <div className="mt-1 text-amber-700 italic font-serif">
                                  {decree.HistoricalInspiration}
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                        
                        {/* Decorative footer */}
                        <div className="bg-gradient-to-r from-amber-100 to-amber-200 px-4 py-2 border-t border-amber-300 text-xs text-amber-700 text-right font-serif">
                          Decree of La Serenissima
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {!isLoading && decrees.length === 0 && !error && (
              <div className="text-center py-8 text-amber-700 italic">
                No decrees have been recorded in the archives.
              </div>
            )}
            
            <div className="mt-8 text-center">
              <button className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shadow-md border border-amber-700 font-serif">
                <div className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Propose New Decree
                </div>
              </button>
              <p className="mt-2 text-xs text-amber-700 italic">
                Proposals require approval from the Council of Ten
              </p>
            </div>
          </div>
        )}
        
        {governanceTab === 'signoria' && (
          <div className="py-4">
            <h3 className="text-xl font-serif text-amber-800 mb-4 text-center">
              The Signoria - Top 10 Players by Influence
            </h3>
            
            <div className="mb-6 bg-amber-100 p-4 rounded-lg border border-amber-300">
              <p className="text-amber-800 font-serif">
                The Signoria represents the most influential citizens of La Serenissima. These individuals shape the future of the Republic through their political power and influence. Rising to this elite group grants special privileges in proposing and voting on decrees that affect all citizens.
              </p>
            </div>
            
            {isLoadingSignoria && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
                <p className="mt-2 text-amber-800">Assembling the Signoria...</p>
              </div>
            )}
            
            {signoriaError && (
              <div className="bg-red-50 border border-red-300 text-red-800 p-4 rounded-lg mb-6">
                <p className="font-medium">Failed to retrieve Signoria members</p>
                <p className="text-sm mt-1">{signoriaError}</p>
              </div>
            )}
            
            {!isLoadingSignoria && signoriaPlayers.length > 0 && (
              <div className="space-y-4">
                {signoriaPlayers.map((player, index) => {
                  // Get social class color
                  const getSocialClassColor = (socialClass: string = ''): string => {
                    const baseClass = socialClass.toLowerCase();
                    
                    if (baseClass.includes('nobili')) {
                      return 'text-amber-700'; // Gold for nobility
                    } else if (baseClass.includes('cittadini')) {
                      return 'text-blue-700'; // Blue for citizens
                    } else if (baseClass.includes('popolani')) {
                      return 'text-amber-600'; // Brown/amber for common people
                    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
                      return 'text-gray-700'; // Gray for laborers
                    }
                    
                    return 'text-gray-700'; // Default color
                  };

                  // Get social class background color for the card
                  const getSocialClassBgColor = (socialClass: string = ''): string => {
                    const baseClass = socialClass.toLowerCase();
                    
                    if (baseClass.includes('nobili')) {
                      return 'bg-gradient-to-br from-white to-amber-100'; // Subtle gold gradient for nobility
                    } else if (baseClass.includes('cittadini')) {
                      return 'bg-gradient-to-br from-white to-blue-50'; // Subtle blue gradient for citizens
                    } else if (baseClass.includes('popolani')) {
                      return 'bg-white'; // White for common people
                    } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
                      return 'bg-gradient-to-br from-white to-gray-100'; // Subtle gray gradient for laborers
                    }
                    
                    return 'bg-white'; // Default background
                  };
                  
                  // Format influence number with commas
                  const formattedInfluence = player.influence.toLocaleString();
                  
                  return (
                    <div 
                      key={player.username} 
                      className={`${getSocialClassBgColor(player.socialClass)} rounded-lg shadow-md p-4 border ${
                        player.isCurrentUser ? 'border-purple-400 ring-2 ring-purple-300' : 'border-amber-200'
                      } hover:shadow-lg transition-shadow relative`}
                    >
                      {/* Rank indicator */}
                      <div className="absolute -top-3 -left-3 bg-amber-600 text-white text-sm w-8 h-8 rounded-full flex items-center justify-center shadow-md">
                        {index + 1}
                      </div>
                      
                      {/* Current user indicator */}
                      {player.isCurrentUser && (
                        <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                          You
                        </div>
                      )}
                      
                      <div className="flex items-start">
                        {/* Main citizen image */}
                        <div className="w-20 h-20 mr-4 rounded-lg border-2 border-amber-600 shadow-md overflow-hidden flex-shrink-0">
                          <img 
                            src={`https://backend.serenissima.ai/public_assets/images/citizens/${player.username || 'default'}.jpg`}
                            alt={`${player.firstName} ${player.lastName}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to default image if the specific one doesn't exist
                              (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
                            }}
                          />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div>
                              {/* Name and social class */}
                              <h3 className="font-serif text-lg font-bold">{player.firstName} {player.lastName}</h3>
                              <p className={`text-sm font-medium ${getSocialClassColor(player.socialClass)}`}>
                                {player.socialClass}
                              </p>
                              
                              {/* Username */}
                              <p className="text-xs text-gray-500 mt-1">{player.username}</p>
                            </div>
                            
                            {/* Coat of arms - smaller */}
                            {player.coatOfArmsImageUrl && (
                              <div className="w-12 h-12 rounded-full border border-amber-300 overflow-hidden ml-2">
                                <img 
                                  src={player.coatOfArmsImageUrl}
                                  alt="Coat of Arms"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // Fallback to default coat of arms
                                    (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public/assets/images/coat-of-arms/default.png';
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          
                          {/* Influence */}
                          <div className="mt-2 flex items-center">
                            <span className="text-amber-700 font-medium text-lg">⚜️ {formattedInfluence}</span>
                            <span className="text-xs text-gray-500 ml-1">influence</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Family motto */}
                      {player.familyMotto && (
                        <div className="mt-3 pt-2 border-t border-amber-100 italic text-sm text-gray-700 w-full">
                          "{player.familyMotto}"
                        </div>
                      )}
                      
                      {/* Action buttons */}
                      <div className="mt-3 pt-2 border-t border-amber-100 flex justify-between">
                        <button 
                          className="text-xs text-amber-700 hover:text-amber-900 transition-colors"
                          onClick={() => {
                            // Dispatch event to show citizen profile
                            const event = new CustomEvent('showCitizenPanelEvent', { detail: player });
                            window.dispatchEvent(event);
                          }}
                        >
                          View Profile
                        </button>
                        {!player.isCurrentUser && (
                          <button className="text-xs text-amber-700 hover:text-amber-900 transition-colors">
                            Send Message
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {!isLoadingSignoria && signoriaPlayers.length === 0 && !signoriaError && (
              <div className="text-center py-8 text-amber-700 italic">
                No influential citizens found in the Signoria.
              </div>
            )}
            
            <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-lg font-serif text-amber-800 mb-2">How to Join the Signoria</h4>
              <p className="text-amber-700 mb-4">
                The Signoria is composed of the ten citizens with the highest Influence in La Serenissima. To increase your Influence and potentially join this elite group:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>Complete civic projects that benefit the Republic</li>
                <li>Participate actively in guild leadership</li>
                <li>Fund public works and cultural institutions</li>
                <li>Successfully propose and support beneficial decrees</li>
                <li>Maintain strong relationships with other influential citizens</li>
              </ul>
            </div>
          </div>
        )}
        
        {governanceTab === 'senate' && (
          <div className="py-4">
            <h3 className="text-xl font-serif text-amber-800 mb-4 text-center">
              The Senate - Top 50 Citizens by Influence
            </h3>
            
            <div className="mb-6 bg-amber-100 p-4 rounded-lg border border-amber-300">
              <p className="text-amber-800 font-serif">
                <span className="font-bold">Coming Soon:</span> The Senate of La Serenissima is currently under construction. When completed, it will represent the 50 most influential citizens who will debate and vote on major economic and political matters affecting the Republic.
              </p>
              <p className="text-amber-800 font-serif mt-2">
                The Senate will provide a forum for citizens to propose and discuss policies, trade agreements, and diplomatic relations with other states. Membership will be determined by influence ranking, with the top 50 citizens automatically granted a seat.
              </p>
            </div>
            
            {isLoadingSenate && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-600"></div>
                <p className="mt-2 text-amber-800">Assembling the Senate...</p>
              </div>
            )}
            
            {senateError && (
              <div className="bg-red-50 border border-red-300 text-red-800 p-4 rounded-lg mb-6">
                <p className="font-medium">Failed to retrieve Senate members</p>
                <p className="text-sm mt-1">{senateError}</p>
              </div>
            )}
            
            {!isLoadingSenate && senatePlayers.length > 0 && (
              <div>
                <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg mb-6">
                  <table className="min-w-full divide-y divide-amber-300">
                    <thead className="bg-amber-100">
                      <tr>
                        <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-amber-900 sm:pl-6">Rank</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-amber-900">Citizen</th>
                        <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-amber-900">Social Class</th>
                        <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-amber-900">Influence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-200 bg-white">
                      {senatePlayers.map((player, index) => {
                        // Get social class color
                        const getSocialClassColor = (socialClass: string = ''): string => {
                          const baseClass = socialClass.toLowerCase();
                          
                          if (baseClass.includes('nobili')) {
                            return 'text-amber-700'; // Gold for nobility
                          } else if (baseClass.includes('cittadini')) {
                            return 'text-blue-700'; // Blue for citizens
                          } else if (baseClass.includes('popolani')) {
                            return 'text-amber-600'; // Brown/amber for common people
                          } else if (baseClass.includes('laborer') || baseClass.includes('facchini')) {
                            return 'text-gray-700'; // Gray for laborers
                          }
                          
                          return 'text-gray-700'; // Default color
                        };
                        
                        // Format influence number with commas
                        const formattedInfluence = player.influence.toLocaleString();
                        
                        return (
                          <tr key={player.username} className={player.isCurrentUser ? "bg-purple-50" : (index % 2 === 0 ? "bg-amber-50" : "bg-white")}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-amber-900 sm:pl-6">
                              {index + 1}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <div className="flex items-center">
                                <div className="h-10 w-10 flex-shrink-0">
                                  <img 
                                    className="h-10 w-10 rounded-full border border-amber-300"
                                    src={`https://backend.serenissima.ai/public_assets/images/citizens/${player.username || 'default'}.jpg`}
                                    alt={`${player.firstName} ${player.lastName}`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'https://backend.serenissima.ai/public_assets/images/citizens/default.jpg';
                                    }}
                                  />
                                </div>
                                <div className="ml-4">
                                  <div className="font-medium text-gray-900">{player.firstName} {player.lastName}</div>
                                  <div className="text-gray-500">{player.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className={`whitespace-nowrap px-3 py-4 text-sm ${getSocialClassColor(player.socialClass)}`}>
                              {player.socialClass}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-medium">
                              {formattedInfluence}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                <div className="text-center text-sm text-amber-700 italic">
                  Note: The Senate is currently in development. When launched, it will include all 50 top citizens.
                </div>
              </div>
            )}
            
            {!isLoadingSenate && senatePlayers.length === 0 && !senateError && (
              <div className="text-center py-8 text-amber-700 italic">
                No citizens found for the Senate. The institution is still being established.
              </div>
            )}
            
            <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <h4 className="text-lg font-serif text-amber-800 mb-2">The Role of the Senate</h4>
              <p className="text-amber-700 mb-4">
                When fully operational, the Senate of La Serenissima will:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-amber-800">
                <li>Debate and vote on major economic policies affecting the Republic</li>
                <li>Approve or reject significant trade agreements with foreign powers</li>
                <li>Oversee the Republic's finances and taxation systems</li>
                <li>Regulate commerce and industry throughout Venetian territories</li>
                <li>Appoint ambassadors and maintain diplomatic relations</li>
              </ul>
              
              <div className="mt-4 bg-amber-100 p-3 rounded border border-amber-200">
                <p className="italic text-amber-800">
                  <span className="font-bold">Historical Note:</span> The historical Venetian Senate (Consiglio dei Pregadi) was one of the most important political bodies in the Republic, responsible for commerce, finance, and foreign policy. It consisted of 60 ordinary members elected annually, plus additional ex-officio members from other councils.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GovernancePanel;
