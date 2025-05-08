import React, { useState } from 'react';

interface GovernancePanelProps {
  onClose: () => void;
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
    Notes: "Particularly affects trade with Ottoman territories."
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
    Notes: "Awaiting final approval from the Senate."
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
    Notes: "Seasonal provisions apply from May through September."
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
    Notes: "Revenue earmarked for naval defense."
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
    Notes: "Permanent decree with seasonal enforcement."
  }
];

const GovernancePanel: React.FC<GovernancePanelProps> = ({ onClose }) => {
  const [governanceTab, setGovernanceTab] = useState<'council' | 'laws'>('council');

  return (
    <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 rounded-lg p-4 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-serif text-amber-800 mb-6 text-center">
          Governance of La Serenissima
        </h2>
        
        {/* Governance tabs */}
        <div className="border-b border-amber-200 mb-6">
          <nav className="-mb-px flex space-x-8">
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
                governanceTab === 'laws' 
                  ? 'border-amber-600 text-amber-800' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setGovernanceTab('laws')}
            >
              Laws & Decrees
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
                    {mockDecrees.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()).map((decree, index) => (
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
