import React, { useState, useEffect } from 'react'; // Added useState, useEffect
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InfoIcon from './InfoIcon'; // Assuming InfoIcon is in the same directory or adjust path

interface Relevancy {
  relevancyId: string;
  title: string;
  description: string;
  score: number;
  asset?: string;
  assetType?: string;
  category?: string;
  type?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  timeHorizon?: string;
}

interface CitizenForFormatting {
  firstName?: string;
  lastName?: string;
  username?: string;
  socialClass?: string;
}

interface CitizenRelevanciesListProps {
  relevancies: Relevancy[];
  isLoadingRelevancies: boolean;
  citizen: CitizenForFormatting | null; // Citizen object for formatting text
}

// Add new interface for Thought
interface Thought {
  messageId: string;
  citizenUsername: string;
  originalContent: string;
  mainThought: string;
  createdAt: string;
}

// Helper function to replace placeholders in relevancy text (moved from CitizenDetailsPanel)
const formatRelevancyText = (text: string, currentCitizen: CitizenForFormatting | null): string => {
  if (!text || !currentCitizen) return text;
  let newText = text;
  newText = newText.replace(/%TARGETCITIZEN%/g, `${currentCitizen.firstName || ''} ${currentCitizen.lastName || ''}`.trim());
  newText = newText.replace(/%FIRSTNAME%/g, currentCitizen.firstName || '');
  newText = newText.replace(/%LASTNAME%/g, currentCitizen.lastName || '');
  newText = newText.replace(/%USERNAME%/g, currentCitizen.username || '');
  newText = newText.replace(/%SOCIALCLASS%/g, currentCitizen.socialClass || '');
  return newText;
};

const CitizenRelevanciesList: React.FC<CitizenRelevanciesListProps> = ({
  relevancies,
  isLoadingRelevancies,
  citizen,
}) => {
  const [citizenThoughts, setCitizenThoughts] = useState<Thought[]>([]);
  const [isLoadingThoughts, setIsLoadingThoughts] = useState<boolean>(false);
  const [sortedRelevancies, setSortedRelevancies] = useState<Relevancy[]>([]);

  // Sort relevancies by score (highest first)
  useEffect(() => {
    const sorted = [...relevancies].sort((a, b) => b.score - a.score);
    setSortedRelevancies(sorted);
  }, [relevancies]);

  useEffect(() => {
    if (citizen && citizen.username) {
      const fetchThoughtsForCitizen = async () => {
        setIsLoadingThoughts(true);
        try {
          const response = await fetch(`/api/thoughts?citizenUsername=${encodeURIComponent(citizen.username!)}&limit=5`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.thoughts)) {
              setCitizenThoughts(data.thoughts);
            } else {
              console.error('Failed to fetch thoughts or invalid format:', data.error);
              setCitizenThoughts([]);
            }
          } else {
            console.error('API error fetching thoughts:', response.status);
            setCitizenThoughts([]);
          }
        } catch (error) {
          console.error('Exception fetching thoughts:', error);
          setCitizenThoughts([]);
        } finally {
          setIsLoadingThoughts(false);
        }
      };
      fetchThoughtsForCitizen();
    } else {
      setCitizenThoughts([]); // Clear thoughts if no citizen or username
    }
  }, [citizen]);

  // Helper to format date for thoughts
  const formatThoughtDate = (dateString: string): string => {
    if (!dateString) return 'Unknown';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Helper function to get priority label based on score
  const getPriorityLabel = (score: number): string => {
    if (score >= 80) return "Critical";
    if (score >= 60) return "High";
    if (score >= 40) return "Moderate";
    return "Low";
  };

  // Helper function to get color classes based on score and category
  const getScoreColorClasses = (score: number, category?: string): string => {
    // Base colors by score
    let baseClasses = "";
    if (score >= 80) baseClasses = "bg-red-200 text-red-800";
    else if (score >= 60) baseClasses = "bg-teal-200 text-teal-800";
    else if (score >= 40) baseClasses = "bg-lime-200 text-lime-800";
    else baseClasses = "bg-gray-200 text-gray-800";
    
    // Override based on category if present
    if (category) {
      switch(category.toLowerCase()) {
        case 'opportunity':
          return "bg-emerald-200 text-emerald-800";
        case 'threat':
          return "bg-red-200 text-red-800";
        case 'proximity':
          return "bg-blue-200 text-blue-800";
        case 'affiliation':
          return "bg-purple-200 text-purple-800";
        case 'ownership_conflict':
          return "bg-amber-200 text-amber-800";
        case 'occupancy_relations':
          return "bg-indigo-200 text-indigo-800";
        default:
          return baseClasses;
      }
    }
    
    return baseClasses;
  };
  
  // Helper function to get icon for relevancy category
  const getCategoryIcon = (category?: string, type?: string): string => {
    if (!category) return "📌"; // Default
    
    switch(category.toLowerCase()) {
      case 'opportunity':
        return "💰";
      case 'threat':
        return "⚠️";
      case 'proximity':
        return type?.includes('connected') ? "🔗" : "📍";
      case 'affiliation':
        return "🤝";
      case 'ownership_conflict':
        return "⚖️";
      case 'occupancy_relations':
        return "🏠";
      case 'domination':
        return "👑";
      default:
        return "📌";
    }
  };

  return (
    <>
      <div className="flex items-center">
        <h3 className="text-lg font-serif text-amber-800 mb-2 border-b border-amber-200 pb-1">Strategic Connections</h3>
        <InfoIcon tooltipText="Opportunities and potential collaborations with this citizen, prioritized by strategic value to your merchant-architect interests." />
      </div>

      {isLoadingRelevancies ? (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : sortedRelevancies.length > 0 ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
          {sortedRelevancies.map((relevancy, index) => (
            <div key={relevancy.relevancyId || index} className="bg-amber-100 rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between mb-1">
                <div className="font-medium text-amber-800 flex-1 pr-2">
                  <span className="mr-1">{getCategoryIcon(relevancy.category, relevancy.type)}</span>
                  {formatRelevancyText(relevancy.title, citizen)}
                </div>
                <div className="text-center">
                  <div className={`px-3 py-1 rounded-full text-xl font-bold ${getScoreColorClasses(relevancy.score, relevancy.category)}`}>
                    {Math.round(relevancy.score)}
                  </div>
                  <p className="text-xs text-amber-600 mt-1">{getPriorityLabel(relevancy.score)}</p>
                </div>
              </div>
              <div className="text-xs text-amber-700 mt-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({node, ...props}) => <p {...props} className="my-1" />
                  }}
                >
                  {formatRelevancyText(relevancy.description, citizen)}
                </ReactMarkdown>
              </div>
              {(relevancy.category || relevancy.type || relevancy.timeHorizon) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {relevancy.category && (
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${
                      relevancy.category.toLowerCase() === 'opportunity' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      relevancy.category.toLowerCase() === 'threat' ? 'bg-red-50 text-red-700 border-red-200' :
                      relevancy.category.toLowerCase() === 'proximity' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      relevancy.category.toLowerCase() === 'affiliation' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      relevancy.category.toLowerCase() === 'ownership_conflict' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      relevancy.category.toLowerCase() === 'occupancy_relations' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {relevancy.category}
                    </span>
                  )}
                  {relevancy.type && (
                    <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] border border-amber-200">
                      {relevancy.type}
                    </span>
                  )}
                  {relevancy.timeHorizon && (
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${
                      relevancy.timeHorizon === 'immediate' ? 'bg-red-50 text-red-700 border-red-200' :
                      relevancy.timeHorizon === 'short' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      relevancy.timeHorizon === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      relevancy.timeHorizon === 'long' ? 'bg-green-50 text-green-700 border-green-200' :
                      relevancy.timeHorizon === 'ongoing' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {relevancy.timeHorizon}
                    </span>
                  )}
                </div>
              )}
              {relevancy.notes && (
                <div className="mt-2 text-xs italic text-amber-600 border-t border-amber-200 pt-1">
                  {formatRelevancyText(relevancy.notes, citizen)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-amber-700 italic text-xs">No strategic connections identified with this citizen at present. Continue to observe for emerging patterns of mutual benefit.</p>
      )}

      {/* Thoughts Section */}
      <div className="mt-4">
        <div className="flex items-center">
          <h4 className="text-md font-serif text-amber-700 mb-2 border-b border-amber-200 pb-1">Strategic Insights</h4>
          <InfoIcon tooltipText="Recent thoughts that may reveal this citizen's priorities, concerns, and potential business opportunities." />
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
          <p className="text-amber-700 italic text-xs">No recent strategic insights available from this citizen.</p>
        )}
      </div>
    </>
  );
};

export default CitizenRelevanciesList;
