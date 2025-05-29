import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import InfoIcon from '../../UI/InfoIcon'; // Adjusted path

interface Relevancy {
  id: string;
  relevancyId?: string;
  title: string;
  description: string;
  score: number;
  // Add any other fields from the relevancy object that are used
}

interface BuildingRelevanciesListProps {
  buildingId: string | null;
  citizenUsername: string | null; // Username of the currently logged-in citizen
}

const BuildingRelevanciesList: React.FC<BuildingRelevanciesListProps> = ({
  buildingId,
  citizenUsername,
}) => {
  const [relevancies, setRelevancies] = useState<Relevancy[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buildingId || !citizenUsername) {
      setRelevancies([]);
      return;
    }

    const fetchRelevancies = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/relevancies/for-asset?assetId=${encodeURIComponent(buildingId)}&assetType=building&relevantToCitizen=${encodeURIComponent(citizenUsername)}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch relevancies: ${response.status}`);
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.relevancies)) {
          setRelevancies(data.relevancies);
        } else {
          throw new Error(data.error || 'Invalid data format for relevancies');
        }
      } catch (err) {
        console.error('Error fetching building relevancies:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setRelevancies([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRelevancies();
  }, [buildingId, citizenUsername]);

  if (!buildingId || !citizenUsername) {
    return null; // Don't render if essential props are missing
  }

  return (
    <div className="mt-4">
      <div className="flex items-center mb-2">
        <h4 className="text-md font-serif text-amber-800 border-b border-amber-200 pb-1">
          Building Relevancies for You
        </h4>
        <InfoIcon tooltipText="Opportunities and information related to this building that are relevant to you." />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : error ? (
        <p className="text-red-600 italic text-xs">Error: {error}</p>
      ) : relevancies.length > 0 ? (
        <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
          {relevancies.map((relevancy) => (
            <div key={relevancy.id} className="bg-amber-100 rounded-lg p-2.5 text-xs shadow-sm">
              <div className="flex items-start justify-between mb-1">
                <div className="font-medium text-amber-800 flex-1 pr-2">
                  {relevancy.title}
                </div>
                <div className="text-center">
                  <div className={`px-2.5 py-0.5 rounded-full text-lg font-bold ${
                    relevancy.score > 75 ? 'bg-teal-100 text-teal-700' :
                    relevancy.score > 25 ? 'bg-lime-100 text-lime-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {Math.round(relevancy.score)}
                  </div>
                  <p className="text-[10px] text-amber-600 mt-0.5">Score</p>
                </div>
              </div>
              <div className="text-amber-700 mt-1.5">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({node, ...props}) => <p {...props} className="my-0.5" />
                  }}
                >
                  {relevancy.description}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-amber-600 italic text-xs">No specific relevancies found for you regarding this building.</p>
      )}
    </div>
  );
};

export default BuildingRelevanciesList;
