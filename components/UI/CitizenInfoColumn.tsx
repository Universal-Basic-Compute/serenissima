import React, { useMemo } from 'react';
import InfoIcon from './InfoIcon';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CitizenRelevanciesList from './CitizenRelevanciesList'; // Assurez-vous que ce chemin est correct

interface CitizenInfoColumnProps {
  citizen: any;
  isLoadingRelationship: boolean;
  relationship: any;
  noRelationshipMessage: string;
  relevancies: any[];
  isLoadingRelevancies: boolean;
  problems: any[];
  isLoadingProblems: boolean;
  activities: any[];
  isLoadingActivities: boolean;
  transportResources: any[];
  isLoadingTransports: boolean;
  activeTab: 'relations' | 'citizen' | 'ledger'; // Type updated to reflect parent's state, though only 'relations'/'citizen' are handled here
  // setActiveTab is no longer needed as tabs are managed by the parent
  citizenThoughts: any[]; 
  isLoadingThoughts: boolean; 
  journalFiles: any[]; // Add this
  isLoadingJournal: boolean; 
  onJournalFileClick: (file: any) => void; 
  currentUsername: string | null | undefined; // Add this to check for mentions
}

const CitizenInfoColumn: React.FC<CitizenInfoColumnProps> = ({
  citizen,
  isLoadingRelationship,
  relationship,
  noRelationshipMessage,
  relevancies,
  isLoadingRelevancies,
  problems,
  isLoadingProblems,
  activities,
  isLoadingActivities,
  transportResources,
  isLoadingTransports,
  activeTab,
  citizenThoughts, 
  isLoadingThoughts, 
  journalFiles, // Add this
  isLoadingJournal, 
  onJournalFileClick, 
  currentUsername, // Add this
}) => {

  const thoughtActivities = useMemo(() => {
    return activities.filter(activity => activity.thought || activity.notes);
  }, [activities]);

  // Helper function to format activity type
  const formatActivityType = (type: string): string => {
    if (!type) return 'Unknown';
    let formatted = type.replace(/[_-]/g, ' ');
    formatted = formatted.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return formatted;
  };

  // Helper function to get activity icon based on type
  const getActivityIcon = (type: string): JSX.Element => {
    const lowerType = type?.toLowerCase() || '';
    if (lowerType.includes('transport') || lowerType.includes('move')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      );
    } else if (lowerType.includes('trade') || lowerType.includes('buy') || lowerType.includes('sell')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    } else if (lowerType.includes('work') || lowerType.includes('labor')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    } else if (lowerType.includes('craft') || lowerType.includes('create') || lowerType.includes('produce')) {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    }
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };
  
  // Helper function to format date in a readable way
  const formatActivityDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      date.setFullYear(date.getFullYear() - 500); // Renaissance setting
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Helper function to format journal file name
  const formatJournalFileName = (fileName: string): string => {
    if (!fileName) return 'Untitled Entry';
    // Remove extension (e.g., .md, .txt)
    const nameWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    // Replace underscores with spaces and capitalize each word
    return nameWithoutExtension
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Helper function to format thought date (similar to activity date but might have different needs)
  const formatThoughtDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      // Assuming thoughts are contemporary to the game's "Renaissance" setting
      // If they are real-world timestamps, adjust as needed.
      // For now, let's assume they are also "Renaissance" time.
      date.setFullYear(date.getFullYear() - 500); 
      return date.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric', 
        hour: 'numeric', minute: '2-digit' 
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  return (
    <div className="flex flex-col h-full"> {/* Ensure column takes full height */}
      {/* Tab Navigation has been moved to CitizenDetailsPanel.tsx */}

      {/* Tab Content */}
      <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1"> {/* Removed fixed height, let flexbox handle it */}
        {activeTab === 'relations' && (
          <>
            {/* Relationship Section */}
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Relationship</h3>
              <InfoIcon className="relative translate-x-[-2px] -translate-y-[4px] z-10" tooltipText="Strength: Measures relationship strength based on shared relevancies and common interests. Trust: Assesses reliability from positive direct interactions (messages, loans, contracts)." />
            </div>
            {isLoadingRelationship ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : relationship && typeof relationship.strengthScore !== 'undefined' ? (
              <div className="bg-amber-100 rounded-lg p-3 text-sm mb-4">
                {relationship.type === "Self" ? (
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-amber-800">Self-Regard</div>
                    <div className={`px-3 py-1 rounded-full text-lg font-bold text-center ${
                      relationship.strengthScore >= 75 ? 'bg-green-200 text-green-800' :
                      relationship.strengthScore > 25 ? 'bg-amber-200 text-amber-800' :
                      'bg-red-200 text-red-800'
                    }`}>
                      {Math.round(relationship.strengthScore)}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <div className="text-center mb-2">
                        <span className="inline-block px-3 py-1 bg-gray-200 text-gray-800 rounded-full font-bold">
                          {relationship.title || "Acquaintance"}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-around text-center">
                      <div title="Strength Score: Quantifies the relationship's strength based on shared relevancies and common interests. A higher score indicates more shared ground or potential for mutual benefit. Useful for understanding alignment and potential for collaboration.">
                        <div className={`px-3 py-1 rounded-full text-xl font-bold ${
                          relationship.strengthScore > 75 ? 'bg-green-200 text-green-800' :
                          relationship.strengthScore > 25 ? 'bg-amber-200 text-amber-800' :
                          'bg-red-200 text-red-800'
                        }`}>
                          {Math.round(relationship.strengthScore)}
                        </div>
                        <p className="text-xs text-amber-600 mt-1">Strength</p>
                      </div>
                      {typeof relationship.trustScore !== 'undefined' && (
                        <div title="Trust Score: Quantifies the level of trust built through direct positive interactions (messages, loans, contracts, transactions). A higher score suggests a more reliable and positive direct relationship history. Useful for gauging reliability in direct dealings.">
                          <div className={`px-3 py-1 rounded-full text-xl font-bold ${
                            relationship.trustScore > 75 ? 'bg-sky-200 text-sky-800' :
                            relationship.trustScore > 25 ? 'bg-orange-200 text-orange-800' :
                            'bg-rose-200 text-rose-800'
                          }`}>
                            {Math.round(relationship.trustScore)}
                          </div>
                          <p className="text-xs text-amber-600 mt-1">Trust</p>
                        </div>
                      )}
                    </div>
                    {relationship.description && (
                      <div className="mt-3 text-center">
                        <p className="text-xs font-serif italic text-amber-700">
                          {relationship.description.split('.').slice(0, 2).join('.') + (relationship.description.split('.').length > 2 ? '.' : '')}
                        </p>
                      </div>
                    )}
                    {relationship.tier && (
                      <div className="text-center mt-3">
                        <p className="text-xs text-amber-600">Tier</p>
                        <p className="text-sm font-medium text-amber-800">{relationship.tier}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-amber-700 italic text-sm mb-4">
                {noRelationshipMessage}
              </p>
            )}

            <CitizenRelevanciesList
              relevancies={relevancies}
              isLoadingRelevancies={isLoadingRelevancies}
              citizen={citizen}
            />
            {/* Recent Activities Section - Moved to 'relations' tab */}
            <div className="mt-4">
              <div className="flex items-center">
                <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Recent Activities</h3>
                <InfoIcon className="relative translate-x-[-2px] -translate-y-[4px] z-10" tooltipText="A log of this citizen's recent actions and engagements within Venice, providing insights into their daily life and interactions." />
              </div>
              {isLoadingActivities ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {activities.map((activity, index) => (
                    <div key={activity.activityId || index} className="bg-amber-100 rounded-lg p-2 text-sm"> 
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-amber-700">
                          {getActivityIcon(activity.type)} 
                        </div>
                        <div className="font-medium text-amber-800">
                          {formatActivityType(activity.type)} 
                        </div>
                        <div className="ml-auto text-xs text-amber-600">
                          {formatActivityDate(activity.endDate || activity.startDate || activity.createdAt)} 
                        </div>
                      </div>
                      {activity.fromBuilding && activity.toBuilding && ( 
                        <div className="flex items-center text-xs text-amber-700 mb-1">
                          <span className="font-medium">{activity.fromBuilding}</span> 
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          <span className="font-medium">{activity.toBuilding}</span> 
                        </div>
                      )}
                      {activity.resourceId && activity.amount && ( 
                        <div className="text-xs text-amber-700 mb-1">
                          <span className="font-medium">{activity.amount}</span> units of <span className="font-medium">{activity.resourceId}</span> 
                        </div>
                      )}
                      {activity.notes && ( 
                        <div className="text-xs italic text-amber-600 mt-1">
                          {activity.notes} 
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-amber-700 italic text-xs">No recent activities found.</p>
              )}
            </div>
          </>
        )}

        {activeTab === 'citizen' && (
          <>
            {/* Problems Section */}
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Problems</h3>
              <InfoIcon className="relative translate-x-[-2px] -translate-y-[4px] z-10" tooltipText="Active issues or challenges faced by this citizen that may require attention or offer opportunities for assistance." />
            </div>
            {isLoadingProblems ? (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : problems.length > 0 ? (
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {problems.map((problem, index) => (
                  <div key={problem.problemId || index} className={`rounded-lg p-3 text-sm border ${
                    problem.severity === 'high' ? 'bg-red-50 border-red-200' :
                    problem.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-green-50 border-green-200'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <h4 className={`font-semibold text-md ${
                        problem.severity === 'high' ? 'text-red-800' :
                        problem.severity === 'medium' ? 'text-yellow-800' :
                        'text-green-800'
                      }`}>
                        {problem.title || "Untitled Problem"}
                      </h4>
                      <div className="text-right">
                        <span className={`px-2 py-0.5 inline-block rounded-full text-xs font-medium ${
                          problem.severity === 'high' ? 'bg-red-200 text-red-900' :
                          problem.severity === 'medium' ? 'bg-yellow-200 text-yellow-900' :
                          'bg-green-200 text-green-900'
                        }`}>
                          {problem.severity && typeof problem.severity === 'string' ? problem.severity.charAt(0).toUpperCase() + problem.severity.slice(1) : 'Standard'}
                        </span>
                      </div>
                    </div>
                    <div className={`text-sm mt-1 ${
                      problem.severity === 'high' ? 'text-red-700' :
                      problem.severity === 'medium' ? 'text-yellow-700' :
                      'text-green-700'
                    }`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {problem.description || "No description provided."}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-amber-700 italic">No active problems reported for this citizen. A sign of good fortune, or perhaps, discretion.</p>
            )}

            {/* Transports Section */}
            <div className="mt-4">
              <div className="flex items-center">
                <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Transports</h3>
                <InfoIcon className="relative translate-x-[-2px] -translate-y-[4px] z-10" tooltipText="Means of conveyance (gondolas, barges, etc.) currently listed under this citizen's name, indicating their capacity for transporting goods or people." />
              </div>
              {isLoadingTransports ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : transportResources.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                  {transportResources.map((transport, index) => (
                    <div key={transport.id || index} className="bg-amber-100 rounded-lg p-2 text-sm flex items-center">
                      <img 
                        src={`/public_assets/images/resources/${(transport.Name || transport.name || 'default_boat').toLowerCase().replace(/\s+/g, '_')}.png`} 
                        alt={transport.Name || transport.name} 
                        className="w-8 h-8 mr-3 object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/public_assets/images/resources/default_boat.png';}}
                      />
                      <div>
                        <div className="font-medium text-amber-800">{transport.Name || transport.name}</div>
                        {(transport.Quantity !== undefined || transport.quantity !== undefined) && (
                          <p className="text-xs text-amber-700">
                            Quantity: {transport.Quantity !== undefined ? transport.Quantity : transport.quantity}
                          </p>
                        )}
                        {transport.Description && <p className="text-xs text-amber-600 italic">{transport.Description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-amber-700 italic">This citizen is not currently transporting any resources.</p>
              )}
            </div>
            
          {/* New Thoughts Section */}
          <div className="mt-4">
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Recent Thoughts</h3>
              <InfoIcon className="relative translate-x-[-2px] -translate-y-[4px] z-10" tooltipText="Latest thoughts recorded by this citizen." />
            </div>

            {isLoadingThoughts ? (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : citizenThoughts.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {citizenThoughts.map((thought) => (
                  <div key={thought.messageId} className="bg-stone-100 rounded-lg p-2.5 text-xs border border-stone-200">
                    <p className="text-stone-700 italic">"{thought.mainThought}"</p>
                    <p className="text-right text-stone-500 mt-1 text-[10px]">{formatThoughtDate(thought.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-amber-700 italic text-xs">No recent thoughts recorded for this citizen.</p>
            )}
          </div>

          {/* Journal Section */}
          <div className="mt-4">
            <div className="flex items-center">
              <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Journal</h3>
              <InfoIcon className="relative translate-x-[-2px] -translate-y-[4px] z-10" tooltipText="Personal journal entries and notes recorded by this citizen in their KinOS AI-Memories." />
            </div>
            {isLoadingJournal ? (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : journalFiles.length > 0 ? (
              <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {journalFiles.map((file) => {
                  const isMentioned = currentUsername && file.content && typeof file.content === 'string' && file.content.includes(currentUsername);
                  const buttonClasses = `w-full text-left rounded-md p-2 text-xs border transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    isMentioned 
                      ? 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300' 
                      : 'bg-stone-100 hover:bg-stone-200 border-stone-200'
                  }`;
                  const textColor = isMentioned ? 'text-yellow-800' : 'text-stone-700';

                  return (
                    <button
                      key={file.path}
                      onClick={() => onJournalFileClick(file)}
                      className={buttonClasses}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-grow min-w-0"> {/* min-w-0 for truncate to work */}
                          <span className="mr-2 text-sm">📜</span>
                          <span className={`${textColor} font-medium truncate italic`}>{formatJournalFileName(file.name)}</span>
                        </div>
                        {isMentioned && (
                          <span className="text-gray-500 italic text-[10px] ml-2 whitespace-nowrap">mentioned</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-amber-700 italic text-xs">No journal entries found for this citizen.</p>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CitizenInfoColumn;
