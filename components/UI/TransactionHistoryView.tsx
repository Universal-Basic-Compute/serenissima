import React, { useEffect, useState } from 'react';
import { getTransactionService } from '@/lib/services/TransactionService';
import { Transaction } from '@/lib/store/marketStore';
import { getWalletAddress } from '../../lib/utils/walletUtils';
import { formatDistanceToNow, format } from 'date-fns';
import PlayerProfile from './PlayerProfile';

interface TransactionHistoryViewProps {
  className?: string;
  onClose?: () => void;
  filter?: 'all' | 'buying' | 'selling';
  assetId?: string;
}

const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({
  className = '',
  onClose,
  filter = 'all',
  assetId
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'buying' | 'selling'>(filter);
  
  // Get current wallet address
  const walletAddress = getWalletAddress();
  
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!walletAddress && !assetId) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const transactionService = getTransactionService();
        let transactions: Transaction[] = [];
        
        if (assetId) {
          // If assetId is provided, fetch transactions for that asset
          transactions = await transactionService.getTransactionsByAsset(assetId);
        } else if (activeTab === 'buying') {
          // Fetch transactions where user is buyer
          transactions = await transactionService.getTransactionsByUser(walletAddress, 'buyer');
        } else if (activeTab === 'selling') {
          // Fetch transactions where user is seller
          transactions = await transactionService.getTransactionsByUser(walletAddress, 'seller');
        } else {
          // Fetch all transactions for user
          transactions = await transactionService.getTransactionsByUser(walletAddress);
        }
        
        // Sort transactions by date (newest first)
        transactions.sort((a, b) => 
          new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
        );
        
        setTransactions(transactions);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        console.error('Error fetching transactions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTransactions();
  }, [walletAddress, activeTab, assetId]);
  
  // Format price with commas
  const formatPrice = (price: number) => {
    return price.toLocaleString();
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return {
        full: format(date, 'PPpp'), // e.g., "Apr 29, 2021, 5:30 PM"
        relative: formatDistanceToNow(date, { addSuffix: true }) // e.g., "2 hours ago"
      };
    } catch (e) {
      return { full: dateString, relative: 'unknown date' };
    }
  };
  
  // Get transaction type display
  const getTransactionTypeDisplay = (type: string) => {
    switch (type) {
      case 'land':
        return 'Land Purchase';
      case 'building':
        return 'Building Purchase';
      case 'bridge':
        return 'Bridge Purchase';
      case 'compute':
        return 'Compute Transfer';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
  
  // Get transaction role for current user
  const getTransactionRole = (transaction: Transaction) => {
    if (!walletAddress) return 'unknown';
    if (transaction.buyer === walletAddress) return 'buyer';
    if (transaction.seller === walletAddress) return 'seller';
    return 'unknown';
  };
  
  return (
    <div className={`bg-amber-50 rounded-lg shadow-lg border-2 border-amber-600 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-amber-600 text-white p-4 flex justify-between items-center">
        <h2 className="text-xl font-serif font-semibold">
          {assetId ? 'Asset Transaction History' : 'Transaction History'}
        </h2>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-white hover:text-amber-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Tabs - only show if not filtering by assetId */}
      {!assetId && (
        <div className="flex border-b border-amber-300">
          <button
            className={`flex-1 py-3 px-4 text-center font-medium ${
              activeTab === 'all' 
                ? 'bg-amber-100 text-amber-800 border-b-2 border-amber-600' 
                : 'text-amber-600 hover:bg-amber-50'
            }`}
            onClick={() => setActiveTab('all')}
          >
            All Transactions
          </button>
          <button
            className={`flex-1 py-3 px-4 text-center font-medium ${
              activeTab === 'buying' 
                ? 'bg-amber-100 text-amber-800 border-b-2 border-amber-600' 
                : 'text-amber-600 hover:bg-amber-50'
            }`}
            onClick={() => setActiveTab('buying')}
          >
            Purchases
          </button>
          <button
            className={`flex-1 py-3 px-4 text-center font-medium ${
              activeTab === 'selling' 
                ? 'bg-amber-100 text-amber-800 border-b-2 border-amber-600' 
                : 'text-amber-600 hover:bg-amber-50'
            }`}
            onClick={() => setActiveTab('selling')}
          >
            Sales
          </button>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 m-4 rounded relative">
          <strong className="font-bold">Error!</strong>
          <span className="block sm:inline"> {error}</span>
          <button
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError(null)}
          >
            <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
            </svg>
          </button>
        </div>
      )}
      
      {/* Content */}
      <div className="p-4 overflow-y-auto max-h-[80vh]">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-amber-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg text-amber-800">No transactions found</p>
            <p className="text-sm text-amber-600 mt-2">
              {assetId 
                ? 'This asset has no transaction history yet' 
                : 'You have not made any transactions yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((transaction) => {
              const role = getTransactionRole(transaction);
              const date = formatDate(transaction.executedAt);
              
              return (
                <div 
                  key={transaction.id}
                  className="bg-white rounded-lg shadow border border-amber-100 p-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        transaction.type === 'land' 
                          ? 'bg-green-100 text-green-800' 
                          : transaction.type === 'compute' 
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                      } uppercase`}>
                        {getTransactionTypeDisplay(transaction.type)}
                      </span>
                      
                      {role !== 'unknown' && (
                        <span className={`ml-2 text-xs font-medium px-2 py-1 rounded-full ${
                          role === 'buyer' 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {role === 'buyer' ? 'Purchased' : 'Sold'}
                        </span>
                      )}
                    </div>
                    
                    <span className="text-xs text-gray-500" title={date.full}>
                      {date.relative}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-lg font-semibold text-amber-800">
                      {transaction.assetId.length > 20 
                        ? `${transaction.assetId.substring(0, 10)}...${transaction.assetId.substring(transaction.assetId.length - 10)}`
                        : transaction.assetId}
                    </div>
                    <div className="text-lg font-bold text-amber-700">
                      {formatPrice(transaction.price)} <span className="text-sm">⚜️</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">From</div>
                        <PlayerProfile 
                          username={transaction.seller}
                          walletAddress={transaction.seller}
                          size="tiny"
                        />
                      </div>
                      
                      <div className="text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </div>
                      
                      <div>
                        <div className="text-xs text-gray-500 mb-1">To</div>
                        <PlayerProfile 
                          username={transaction.buyer}
                          walletAddress={transaction.buyer}
                          size="tiny"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionHistoryView;
