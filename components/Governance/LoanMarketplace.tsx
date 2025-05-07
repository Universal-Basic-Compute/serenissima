import React, { useEffect, useState } from 'react';
import { useLoanStore } from '@/store/loanStore';
import { LoanData, LoanStatus, LoanPurpose } from '@/lib/services/LoanService';
import { getWalletAddress } from '@/lib/walletUtils';
import { ErrorBoundary } from '@/components/UI/ErrorBoundary';

const LoanMarketplace: React.FC = () => {
  const { availableLoans, loading, error, loadAvailableLoans } = useLoanStore();
  const [sortField, setSortField] = useState<keyof LoanData>('interestRate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedLoanType, setSelectedLoanType] = useState<'all' | 'treasury' | 'private'>('all');
  
  useEffect(() => {
    loadAvailableLoans();
  }, [loadAvailableLoans]);
  
  const handleSort = (field: keyof LoanData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  const filteredLoans = availableLoans.filter(loan => {
    if (selectedLoanType === 'all') return true;
    if (selectedLoanType === 'treasury') return loan.lender === 'Treasury';
    if (selectedLoanType === 'private') return loan.lender !== 'Treasury';
    return true;
  });
  
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
  
  const getInterestRateColor = (rate: number) => {
    if (rate < 5) return 'text-green-500';
    if (rate < 10) return 'text-yellow-500';
    return 'text-red-500';
  };
  
  return (
    <ErrorBoundary fallback={<div className="p-4 text-red-600">Error loading loan marketplace</div>}>
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-serif text-amber-800 mb-6 text-center">
          Loan Marketplace of La Serenissima
        </h2>
        
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
              Treasury Loans
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
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-amber-200 shadow-md rounded-lg overflow-hidden">
                  <thead className="bg-amber-100">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort('name')}
                      >
                        Loan Name
                        {sortField === 'name' && (
                          <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort('lender')}
                      >
                        Lender
                        {sortField === 'lender' && (
                          <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort('principalAmount')}
                      >
                        Amount
                        {sortField === 'principalAmount' && (
                          <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort('interestRate')}
                      >
                        Interest Rate
                        {sortField === 'interestRate' && (
                          <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider cursor-pointer"
                        onClick={() => handleSort('termDays')}
                      >
                        Term
                        {sortField === 'termDays' && (
                          <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200">
                    {sortedLoans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-amber-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {loan.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {loan.lender === 'Treasury' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Treasury of Venice
                            </span>
                          ) : (
                            loan.lender
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {loan.principalAmount.toLocaleString()} $COMPUTE
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getInterestRateColor(loan.interestRate)}`}>
                          {loan.interestRate}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {loan.termDays} days
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => {
                              // Open loan application modal
                              window.dispatchEvent(new CustomEvent('showLoanApplicationModal', {
                                detail: { loan }
                              }));
                            }}
                            className="text-amber-600 hover:text-amber-900"
                          >
                            Apply
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default LoanMarketplace;
