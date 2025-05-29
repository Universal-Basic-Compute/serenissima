import React, { useState, useEffect } from 'react';
import { FaTimes, FaSpinner, FaChartLine, FaCoins, FaHandHoldingUsd, FaUsers } from 'react-icons/fa';
import AnimatedDucats from './AnimatedDucats';

interface EconomyPanelProps {
  onClose: () => void;
}

interface EconomyData {
  totalDucats: number;
  transactionsTotal: number;
  projectedYearlyGDP: number;
  totalLoans: number;
  citizenCount: number;
  transactionCount: number;
  loanCount: number;
  lastUpdated: string;
}

const EconomyPanel: React.FC<EconomyPanelProps> = ({ onClose }) => {
  const [economyData, setEconomyData] = useState<EconomyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch economy data
  useEffect(() => {
    fetchEconomyData();
  }, []);
  
  const fetchEconomyData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/economy');
      if (!response.ok) {
        throw new Error(`Failed to fetch economy data: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.economy) {
        setEconomyData(data.economy);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error fetching economy data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto my-20">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800 flex items-center">
            <FaChartLine className="mr-3" />
            Economy of La Serenissima
          </h2>
          <button 
            onClick={onClose}
            className="text-amber-600 hover:text-amber-800 transition-colors"
            aria-label="Close"
          >
            <FaTimes size={24} />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FaSpinner className="animate-spin text-amber-600 text-4xl mb-4" />
              <p className="text-amber-800">Loading economic data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg">
              <p className="font-medium">Error loading economic data</p>
              <p className="text-sm mt-1">{error}</p>
              <button 
                onClick={fetchEconomyData}
                className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : economyData ? (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-amber-100 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center text-amber-800 mb-2">
                    <FaCoins className="mr-2" />
                    <h3 className="font-medium">Total Ducats</h3>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">
                    <AnimatedDucats value={economyData.totalDucats} suffix="" prefix="⚜️ " />
                  </p>
                  <p className="text-xs text-amber-700 mt-2">
                    Across {economyData.citizenCount} citizens
                  </p>
                </div>
                
                <div className="bg-amber-100 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center text-amber-800 mb-2">
                    <FaChartLine className="mr-2" />
                    <h3 className="font-medium">Yearly GDP</h3>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">
                    <AnimatedDucats value={economyData.projectedYearlyGDP} suffix="" prefix="⚜️ " />
                  </p>
                  <p className="text-xs text-amber-700 mt-2">
                    Based on {economyData.transactionCount} transactions
                  </p>
                </div>
                
                <div className="bg-amber-100 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center text-amber-800 mb-2">
                    <FaHandHoldingUsd className="mr-2" />
                    <h3 className="font-medium">Outstanding Loans</h3>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">
                    <AnimatedDucats value={economyData.totalLoans} suffix="" prefix="⚜️ " />
                  </p>
                  <p className="text-xs text-amber-700 mt-2">
                    Across {economyData.loanCount} active loans
                  </p>
                </div>
              </div>
              
              {/* Additional Statistics */}
              <div className="bg-white rounded-lg p-6 shadow-sm border border-amber-200">
                <h3 className="text-lg font-medium text-amber-800 mb-4">Economic Indicators</h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-amber-100">
                    <span className="text-amber-700">Per Capita Wealth</span>
                    <span className="font-medium text-amber-900">
                      ⚜️ {Math.floor(economyData.totalDucats / Math.max(1, economyData.citizenCount))}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-amber-100">
                    <span className="text-amber-700">Average Transaction Value</span>
                    <span className="font-medium text-amber-900">
                      ⚜️ {Math.floor(economyData.transactionsTotal / Math.max(1, economyData.transactionCount))}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-amber-100">
                    <span className="text-amber-700">Average Loan Amount</span>
                    <span className="font-medium text-amber-900">
                      ⚜️ {Math.floor(economyData.totalLoans / Math.max(1, economyData.loanCount))}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center pb-2 border-b border-amber-100">
                    <span className="text-amber-700">Debt to GDP Ratio</span>
                    <span className="font-medium text-amber-900">
                      {((economyData.totalLoans / Math.max(1, economyData.projectedYearlyGDP)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Historical Context */}
              <div className="bg-amber-50 rounded-lg p-6 shadow-sm border border-amber-200">
                <h3 className="text-lg font-medium text-amber-800 mb-2">Historical Context</h3>
                <p className="text-amber-700 italic">
                  "In the 16th century, Venice was one of the richest cities in Europe. The Republic's wealth came from its maritime trade, manufacturing, and banking activities. The city's economy was carefully regulated by the government to ensure stability and prosperity."
                </p>
              </div>
              
              <div className="text-right text-xs text-amber-600">
                Last updated: {formatDate(economyData.lastUpdated)}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-amber-700">
              No economic data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EconomyPanel;
