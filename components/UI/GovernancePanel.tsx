import React, { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';

interface GovernancePanelProps {
  onClose: () => void;
  standalone?: boolean;
}

interface Decree {
  DecreeId: string;
  Type: string;
  Title: string;
  Description: string;
  Status: 'Proposed' | 'Enacted' | 'Rejected' | 'Expired';
  Category: string;
  Subcategory: string;
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
    Subcategory: "Import Regulations",
    Proposer: "Guild of Silk Merchants",
    CreatedAt: "1525-03-15",
    EnactedAt: "1525-04-01",
    ExpiresAt: "1526-04-01",
    FlavorText: "Let no inferior silk tarnish the reputation of Venetian craftsmanship.",
    HistoricalInspiration: "Based on the 1441 regulations of the Venetian Silk Guild.",
    Notes: "Particularly affects trade with Ottoman territories.",
    Rationale: "This decree protects Venice's reputation for quality silk products, prevents fraud, and ensures fair competition among merchants. By maintaining high standards, we preserve our competitive advantage in luxury textile markets across Europe and the Mediterranean."
  },
  {
    DecreeId: "D-1525-002",
    Type: "Infrastructure",
    Title: "Canal Maintenance Fund",
    Description: "Establishes a special fund for the dredging and maintenance of minor canals, funded by a 2% surcharge on shipping fees.",
    Status: "Proposed",
    Category: "Infrastructure",
    Subcategory: "Waterways",
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
    Subcategory: "Maritime Quarantine",
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
    Subcategory: "Taxation",
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
    Subcategory: "Public Order",
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
  const [governanceTab, setGovernanceTab] = useState<'council' | 'laws'>('laws');
  const [decrees, setDecrees] = useState<Decree[]>(mockDecrees);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Function to fetch decrees from Airtable
  const fetchDecrees = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/decrees`);
      
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

  // Fetch decrees when the component mounts or when the tab changes to 'laws'
  useEffect(() => {
    if (governanceTab === 'laws') {
      fetchDecrees();
    }
  }, [governanceTab]);

  return (
    <div className={`${standalone ? 'fixed inset-0 bg-black/80 z-50' : 'absolute top-20 left-20 right-4 bottom-4 bg-black/30'} rounded-lg p-4 overflow-auto`}>
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
          </nav>
        </div>
        
        {/* Tab content */}
        {governanceTab === 'council' && (
          <div className="text-center py-8 text-gray-500 italic">
            The Council of Ten governs La Serenissima with wisdom and discretion.
            <p className="mt-4">Council features coming soon.</p>
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
              <div className="bg-amber-50 border border-amber-300 rounded-lg overflow-hidden shadow-md">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-amber-300">
                    <thead className="bg-gradient-to-r from-amber-100 to-amber-200">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-serif font-medium text-amber-900 uppercase tracking-wider border-r border-amber-200">Decree</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-serif font-medium text-amber-900 uppercase tracking-wider border-r border-amber-200">Title & Description</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-serif font-medium text-amber-900 uppercase tracking-wider border-r border-amber-200">Status</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-serif font-medium text-amber-900 uppercase tracking-wider border-r border-amber-200">Category</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-serif font-medium text-amber-900 uppercase tracking-wider">Dates</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-amber-200">
                      {decrees.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()).map((decree, index) => (
                      <tr key={decree.DecreeId} className={`${index % 2 === 0 ? 'bg-amber-50' : 'bg-white'} hover:bg-amber-100 transition-colors duration-150`}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-amber-900 border-r border-amber-100">
                          <div className="font-serif">{decree.DecreeId}</div>
                          <div className="text-xs text-amber-700 mt-1">{decree.Type}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-amber-900 border-r border-amber-100">
                          <div className="font-serif font-medium">{decree.Title}</div>
                          <div className="mt-1 text-amber-700">{decree.Description}</div>
                          {decree.FlavorText && (
                            <div className="mt-2 text-xs italic text-amber-600">"{decree.FlavorText}"</div>
                          )}
                          {/* Add the Rationale spoiler */}
                          {decree.Rationale && (
                            <div className="mt-3">
                              <details className="bg-amber-50 rounded border border-amber-200 overflow-hidden">
                                <summary className="px-3 py-2 cursor-pointer text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors">
                                  View Rationale for this Decree
                                </summary>
                                <div className="px-3 py-2 text-xs text-amber-700 border-t border-amber-200 bg-amber-50/50">
                                  {decree.Rationale}
                                </div>
                              </details>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm border-r border-amber-100">
                          <div className="flex flex-col items-center">
                            {decree.Status === 'Enacted' && (
                              <div className="mb-2">
                                <img 
                                  src="/images/venice-seal.png" 
                                  alt="Official Seal" 
                                  className="w-12 h-12 object-contain opacity-80"
                                  title="Officially enacted by the Council of Ten"
                                />
                              </div>
                            )}
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              decree.Status === 'Enacted' ? 'bg-green-100 text-green-800 border border-green-300' : 
                              decree.Status === 'Proposed' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                              decree.Status === 'Rejected' ? 'bg-red-100 text-red-800 border border-red-300' :
                              'bg-gray-100 text-gray-800 border border-gray-300'
                            }`}>
                              {decree.Status}
                            </span>
                            <div className="text-xs text-amber-700 mt-2 text-center">
                              Proposed by:<br/><span className="font-serif">{decree.Proposer}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-amber-700 border-r border-amber-100">
                          <div className="font-serif">{decree.Category}</div>
                          <div className="text-xs mt-1 italic">{decree.Subcategory}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-amber-700">
                          <div>
                            <span className="font-medium">Created:</span> <span className="font-serif">{decree.CreatedAt}</span>
                          </div>
                          {decree.EnactedAt && (
                            <div className="mt-1">
                              <span className="font-medium">Enacted:</span> <span className="font-serif">{decree.EnactedAt}</span>
                            </div>
                          )}
                          {decree.ExpiresAt && decree.ExpiresAt !== 'None' && (
                            <div className="mt-1">
                              <span className="font-medium">Expires:</span> <span className="font-serif">{decree.ExpiresAt}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
      </div>
    </div>
  );
};

export default GovernancePanel;
