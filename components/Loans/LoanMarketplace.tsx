import React, { useEffect, useState } from 'react';
import { useLoanStore } from '@/store/loanStore';
import { LoanData, LoanStatus, LoanPurpose } from '@/lib/services/LoanService';
import { getWalletAddress } from '../../lib/utils/walletUtils';
import ErrorBoundary from '@/components/UI/ErrorBoundary';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

// Define missing event types
type LoanEventData = {
  loan?: LoanData;
  [key: string]: any;
};

const LoanMarketplace: React.FC = () => {
  const { availableLoans: storeLoans, loading, error, loadAvailableLoans } = useLoanStore();
  const [availableLoans, setAvailableLoans] = useState<LoanData[]>([]);
  const [sortField, setSortField] = useState<keyof LoanData>('interestRate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedLoanType, setSelectedLoanType] = useState<'all' | 'treasury' | 'private'>('all');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);
  
  useEffect(() => {
    const fetchLoans = async () => {
      console.log("LoanMarketplace: Fetching available loans...");
      try {
        await loadAvailableLoans();
        console.log("LoanMarketplace: Loans loaded successfully");
      } catch (error) {
        console.error("LoanMarketplace: Error loading loans:", error);
      }
    };
    
    fetchLoans();
    
    // Add event listener for refreshing loans
    const handleRefreshLoans = () => {
      console.log("LoanMarketplace: Refreshing available loans");
      fetchLoans();
    };
    
    window.addEventListener('refreshLoans', handleRefreshLoans);
    
    return () => {
      window.removeEventListener('refreshLoans', handleRefreshLoans);
    };
    
    // Subscribe to loan-related events to update the marketplace in real-time
    const loanOfferCreatedSubscription = eventBus.subscribe(
      EventTypes.OFFER_CREATED, 
      (data: LoanEventData) => {
        console.log("LoanMarketplace: Loan offer created event received:", data);
        // Add the new loan to the available loans list
        if (data.loan && data.loan.status === LoanStatus.AVAILABLE) {
          setAvailableLoans(prevLoans => [...prevLoans, data.loan]);
        }
      }
    );
    
    const loanAppliedSubscription = eventBus.subscribe(
      'LOAN_APPLIED', // Using string literal as fallback
      (data: LoanEventData) => {
        console.log("LoanMarketplace: Loan applied event received:", data);
        // Remove the loan from available loans if it was just applied for
        if (data.loan && data.loan.id) {
          setAvailableLoans(prevLoans => 
            prevLoans.filter(loan => loan.id !== data.loan.id)
          );
        }
      }
    );
    
    // Clean up subscriptions when component unmounts
    return () => {
      loanOfferCreatedSubscription.unsubscribe();
      loanAppliedSubscription.unsubscribe();
    };
  }, [loadAvailableLoans]);
  
  const handleSort = (field: keyof LoanData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Update local state when store loans change
  useEffect(() => {
    console.log("LoanMarketplace: Store loans updated:", storeLoans);
    console.log("LoanMarketplace: Store loans length:", storeLoans?.length || 0);
    if (storeLoans && storeLoans.length > 0) {
      console.log("LoanMarketplace: Setting available loans from store");
      setAvailableLoans(storeLoans);
    }
  }, [storeLoans]);
  
  // Filter loans based on selected type
  const filteredLoans = availableLoans.filter(loan => {
    if (selectedLoanType === 'all') return true;
    if (selectedLoanType === 'treasury') {
      return loan.lender === 'Treasury' || loan.lender === 'ConsiglioDeiDieci';
    }
    if (selectedLoanType === 'private') {
      return loan.lender !== 'Treasury' && loan.lender !== 'ConsiglioDeiDieci';
    }
    return true;
  });
  
  // Sort loans based on selected field and direction
  const sortedLoans = [...filteredLoans].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue) 
        : bValue.localeCompare(aValue);
    }
    
    return 0;
  });
  
  // Add a check to ensure we have loans before rendering
  useEffect(() => {
    console.log("LoanMarketplace: Available loans in state:", availableLoans);
    console.log("LoanMarketplace: Filtered loans:", filteredLoans);
    console.log("LoanMarketplace: Sorted loans:", sortedLoans);
  }, [availableLoans, filteredLoans, sortedLoans]);
  
  // Show notification when events occur
  useEffect(() => {
    const handleLoanApplied = (data: LoanEventData) => {
      // Check if the loan was auto-approved
      if (data.autoApproved) {
        setNotification({
          message: `Your loan has been automatically approved and ${data.loan?.principalAmount.toLocaleString()} Ducats have been transferred to your account!`,
          type: 'success'
        });
      } else {
        setNotification({
          message: `Loan application submitted successfully!`,
          type: 'success'
        });
      }
      
      // Clear notification after 5 seconds
      setTimeout(() => {
        setNotification(null);
      }, 5000);
    };
    
    const handleLoanOfferCreated = (data: LoanEventData) => {
      setNotification({
        message: `New loan offer created: ${data.loan?.name || 'Unnamed loan'}`,
        type: 'info'
      });
      
      // Clear notification after 5 seconds
      setTimeout(() => {
        setNotification(null);
      }, 5000);
    };
    
    // Subscribe to events
    const loanAppliedSubscription = eventBus.subscribe('LOAN_APPLIED', handleLoanApplied);
    const loanOfferCreatedSubscription = eventBus.subscribe(EventTypes.OFFER_CREATED, handleLoanOfferCreated);
    
    // Clean up subscriptions
    return () => {
      loanAppliedSubscription.unsubscribe();
      loanOfferCreatedSubscription.unsubscribe();
    };
  }, []);
  
  // These are now defined above the useEffect that references them
  
  return (
    <ErrorBoundary fallback={<div className="p-4 text-red-600">Error loading loan marketplace</div>}>
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-serif text-amber-800 mb-6 text-center">
          Loan Marketplace of La Serenissima
        </h2>
        
        {/* Notification banner */}
        {notification && (
          <div className={`mb-6 p-4 rounded-md ${
            notification.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' :
            notification.type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' :
            'bg-blue-100 text-blue-800 border border-blue-300'
          }`}>
            <div className="flex items-center">
              <span className="mr-2">
                {notification.type === 'success' ? '✓' : 
                 notification.type === 'error' ? '✗' : 'ℹ'}
              </span>
              <p>{notification.message}</p>
            </div>
          </div>
        )}
        
        {/* Loan type filter */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                selectedLoanType === 'all' 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-white text-amber-700 hover:bg-amber-100'
              }`}
              onClick={() => setSelectedLoanType('all')}
            >
              All Loans
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${
                selectedLoanType === 'treasury' 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-white text-amber-700 hover:bg-amber-100'
              }`}
              onClick={() => setSelectedLoanType('treasury')}
            >
              Official Loans
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                selectedLoanType === 'private' 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-white text-amber-700 hover:bg-amber-100'
              }`}
              onClick={() => setSelectedLoanType('private')}
            >
              Private Loans
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="flex justify-center my-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : (
          <>
            {sortedLoans.length === 0 ? (
              <div className="text-center py-8 text-gray-500 italic">
                No loans available at this time. Check back later or visit the Doge's Palace to inquire about special financing options.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedLoans.map((loan) => (
                  <div 
                    key={loan.id} 
                    className="bg-white rounded-lg border border-amber-200 shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300"
                  >
                    {/* Loan header with type indicator */}
                    <div className="bg-gradient-to-r from-amber-100 to-amber-200 px-4 py-3 border-b border-amber-200">
                      <div className="flex justify-between items-center">
                        <h3 className="font-serif text-lg font-medium text-amber-800">{loan.name}</h3>
                        {loan.lender === 'Treasury' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            Treasury
                          </span>
                        ) : loan.lender === 'ConsiglioDeiDieci' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                            Council of Ten
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                            Private
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Loan details */}
                    <div className="p-4">
                      <div className="mb-4">
                        <div className="text-sm text-gray-500 mb-1">Offered by</div>
                        <div className="font-medium text-gray-700">
                          {loan.lender === 'Treasury' ? 'Treasury of Venice' : 
                           loan.lender === 'ConsiglioDeiDieci' ? 'Council of Ten' : 
                           loan.lender}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-gray-500 mb-1">Amount</div>
                          <div className="font-medium text-gray-900">{Math.floor(loan.principalAmount).toLocaleString()} ⚜️</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-1">Term</div>
                          <div className="font-medium text-gray-900">{loan.termDays} days</div>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <div className="text-sm text-gray-500 mb-1">Interest Rate</div>
                        <div className={`text-lg font-bold ${
                          loan.interestRate < 5 ? 'text-green-600' : 
                          loan.interestRate < 10 ? 'text-amber-600' : 
                          'text-red-600'
                        }`}>
                          {loan.interestRate}%
                        </div>
                      </div>
                      
                      {/* Loan details visualization */}
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-4">
                        <div className="flex justify-between items-center text-xs text-amber-800 mb-2">
                          <span>Principal</span>
                          <span>Interest</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                          <div 
                            className="bg-amber-600 h-2.5 rounded-full" 
                            style={{ 
                              width: `${100 - (loan.interestRate * loan.termDays / 365)}%` 
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>{Math.round(100 - (loan.interestRate * loan.termDays / 365))}%</span>
                          <span>{Math.round(loan.interestRate * loan.termDays / 365)}%</span>
                        </div>
                      </div>
                      
                      {/* Apply button */}
                      <button
                        onClick={() => {
                          // Open loan application modal
                          window.dispatchEvent(new CustomEvent('showLoanApplicationModal', {
                            detail: { loan }
                          }));
                        }}
                        className="w-full px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors flex items-center justify-center"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                        </svg>
                        Apply for Loan
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default LoanMarketplace;
