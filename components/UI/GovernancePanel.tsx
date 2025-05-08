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
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-amber-300">
                  <thead className="bg-amber-100">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">Decree</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">Title & Description</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">Category</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-amber-900 uppercase tracking-wider">Dates</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-amber-200">
                    {mockDecrees.sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime()).map((decree, index) => (
                      <tr key={decree.DecreeId} className={index % 2 === 0 ? 'bg-amber-50' : 'bg-white'}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-amber-900">
                          <div className="font-serif">{decree.DecreeId}</div>
                          <div className="text-xs text-amber-700 mt-1">{decree.Type}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-amber-900">
                          <div className="font-serif font-medium">{decree.Title}</div>
                          <div className="mt-1 text-amber-700">{decree.Description}</div>
                          {decree.FlavorText && (
                            <div className="mt-2 text-xs italic text-amber-600">"{decree.FlavorText}"</div>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            decree.Status === 'Enacted' ? 'bg-green-100 text-green-800' : 
                            decree.Status === 'Proposed' ? 'bg-blue-100 text-blue-800' :
                            decree.Status === 'Rejected' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {decree.Status}
                          </span>
                          <div className="text-xs text-amber-700 mt-1">
                            Proposed by:<br/>{decree.Proposer}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-amber-700">
                          <div>{decree.Category}</div>
                          <div className="text-xs mt-1">{decree.Subcategory}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-amber-700">
                          <div>
                            <span className="font-medium">Created:</span> {decree.CreatedAt}
                          </div>
                          {decree.EnactedAt && (
                            <div className="mt-1">
                              <span className="font-medium">Enacted:</span> {decree.EnactedAt}
                            </div>
                          )}
                          {decree.ExpiresAt && decree.ExpiresAt !== 'None' && (
                            <div className="mt-1">
                              <span className="font-medium">Expires:</span> {decree.ExpiresAt}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <button className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors">
                Propose New Decree
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GovernancePanel;
