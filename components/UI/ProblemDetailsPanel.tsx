'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';

interface ProblemDetailsPanelProps {
  problemId: string;
  onClose: () => void;
}

interface Problem {
  id: string;
  problemId: string;
  citizen: string;
  assetType: string;
  asset: string;
  severity: string;
  status: string;
  position: { lat: number; lng: number };
  location: string;
  title: string;
  description: string;
  solutions: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export default function ProblemDetailsPanel({ problemId, onClose }: ProblemDetailsPanelProps) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProblemDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/problems/${problemId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch problem details: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.problem) {
          setProblem(data.problem);
        } else {
          throw new Error(data.error || 'Failed to fetch problem details');
        }
      } catch (error) {
        console.error('Error fetching problem details:', error);
        setError(error.message || 'An error occurred while fetching problem details');
      } finally {
        setLoading(false);
      }
    };
    
    if (problemId) {
      fetchProblemDetails();
    }
  }, [problemId]);

  // Get severity color
  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-yellow-500 text-black';
    }
  };

  // Get status color
  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-red-500 text-white';
      case 'pending': return 'bg-yellow-500 text-black';
      case 'resolved': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  // Format date
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return dateString || 'Unknown';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-ui-panel="true">
      <div className="bg-amber-50 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-amber-800 text-white px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-serif">
            {loading ? 'Loading Problem Details...' : error ? 'Error' : problem?.title || 'Problem Details'}
          </h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-amber-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-800"></div>
            </div>
          ) : error ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p>{error}</p>
            </div>
          ) : problem ? (
            <div className="space-y-6">
              {/* Problem metadata */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-amber-800 font-medium">Location</div>
                  <div>{problem.location || 'Unknown location'}</div>
                </div>
                <div>
                  <div className="text-sm text-amber-800 font-medium">Severity</div>
                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getSeverityColor(problem.severity)}`}>
                    {problem.severity.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-amber-800 font-medium">Since</div>
                  <div className="text-sm text-gray-500 font-serif">{formatDate(problem.createdAt)}</div>
                </div>
              </div>
              
              {/* Description */}
              <div>
                <div className="text-amber-800 font-medium mb-2">Description</div>
                <div className="bg-amber-100 p-4 rounded-lg prose prose-amber max-w-none">
                  <ReactMarkdown>
                    {problem.description}
                  </ReactMarkdown>
                </div>
              </div>
              
              {/* Solutions */}
              {problem.solutions && (
                <div>
                  <div className="text-amber-800 font-medium mb-2">Possible Solutions</div>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200 prose prose-green max-w-none">
                    <ReactMarkdown>
                      {problem.solutions}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
              
              {/* Position */}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              No problem details found
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-amber-100 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
