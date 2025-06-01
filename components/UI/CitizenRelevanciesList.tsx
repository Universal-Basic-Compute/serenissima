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

  // Helper function to get color classes based on score
  const getScoreColorClasses = (score: number): string => {
    if (score >= 80) return "bg-red-200 text-red-800";
    if (score >= 60) return "bg-teal-200 text-teal-800";
    if (score >= 40) return "bg-lime-200 text-lime-800";
    return "bg-gray-200 text-gray-800";
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
                  {formatRelevancyText(relevancy.title, citizen)}
                </div>
                <div className="text-center">
                  <div className={`px-3 py-1 rounded-full text-xl font-bold ${getScoreColorClasses(relevancy.score)}`}>
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
                    <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] border border-amber-200">
                      {relevancy.category}
                    </span>
                  )}
                  {relevancy.type && (
                    <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] border border-amber-200">
                      {relevancy.type}
                    </span>
                  )}
                  {relevancy.timeHorizon && (
                    <span className="inline-block px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] border border-amber-200">
                      {relevancy.timeHorizon}
                    </span>
                  )}
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
