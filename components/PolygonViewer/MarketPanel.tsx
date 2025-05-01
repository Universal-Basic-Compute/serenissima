import React, { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/apiUtils';
import PlayerProfile from '../UI/PlayerProfile';

interface Transaction {
  id: string;
  type: string;
  asset_id: string;
  price: number;
  seller: string | null;
  buyer: string | null;
  created_at: string;
  executed_at: string | null;
  historical_name?: string;
  english_name?: string;
  description?: string;
}

interface MarketPanelProps {
  visible: boolean;
  onClose: () => void;
}

const MarketPanel: React.FC<MarketPanelProps> = ({ visible, onClose }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('price');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Fetch transactions when component mounts
  useEffect(() => {
    if (!visible) return;

    const fetchTransactions = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/transactions/available`); // Use relative path
        
        if (!response.ok) {
          throw new Error(`Failed to fetch transactions: ${response.status}`);
        }
        
        const data = await response.json();
        
        // If the data is empty or not an array, set an empty array
        if (!data || !Array.isArray(data)) {
          setTransactions([]);
        } else {
          setTransactions(data);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching transactions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
        setTransactions([]); // Set empty array on error
        setLoading(false);
      }
    };

    fetchTransactions();
    
    // Get wallet address from storage
    const storedWallet = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    setWalletAddress(storedWallet);
  }, [visible]);

  // Sort transactions
  const sortedTransactions = [...transactions].sort((a, b) => {
    if (sortField === 'price') {
      return sortDirection === 'asc' ? a.price - b.price : b.price - a.price;
    } else if (sortField === 'date') {
      return sortDirection === 'asc' 
        ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return 0;
  });

  // Filter transactions
  const filteredTransactions = sortedTransactions.filter(transaction => {
    // Filter by type
    if (filterType !== 'all' && transaction.type !== filterType) {
      return false;
    }
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        (transaction.historical_name?.toLowerCase().includes(query)) ||
        (transaction.english_name?.toLowerCase().includes(query)) ||
        (transaction.asset_id.toLowerCase().includes(query)) ||
        (transaction.seller?.toLowerCase().includes(query))
      );
    }
    
    return true;
  });

  // Handle sort change
  const handleSortChange = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Handle transaction purchase
  const handlePurchase = async (transaction: Transaction) => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    
    if (transaction.seller === walletAddress) {
      alert('You cannot purchase your own listing');
      return;
    }
    
    if (!confirm(`Are you sure you want to purchase ${transaction.historical_name || transaction.asset_id} for ${transaction.price.toLocaleString()} ⚜️ ducats?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/transaction/${transaction.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyer: walletAddress
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.error || 'Failed to execute transaction');
      }
      
      alert(`Purchase successful! You are now the owner of ${transaction.historical_name || transaction.asset_id}.`);
      
      // Remove the purchased transaction from the list
      setTransactions(transactions.filter(t => t.id !== transaction.id));
      
      // Dispatch event to update user profile with new compute amount
      window.dispatchEvent(new CustomEvent('landOwnershipChanged', {
        detail: { 
          landId: transaction.asset_id, 
          newOwner: walletAddress
        }
      }));
      
      // Refresh user profile
      window.dispatchEvent(new CustomEvent('userProfileUpdated'));
    } catch (error) {
      console.error('Error executing transaction:', error);
      alert(`Failed to complete purchase: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Handle creating a new listing
  const handleCreateListing = async () => {
    if (!walletAddress) {
      alert('Please connect your wallet first');
      return;
    }
    
    // This is a simplified version - in a real app, you'd have a form
    const assetId = prompt('Enter the ID of the land you want to sell:');
    if (!assetId) return;
    
    const priceStr = prompt('Enter the price in ducats:');
    if (!priceStr) return;
    
    const price = parseInt(priceStr);
    if (isNaN(price) || price <= 0) {
      alert('Please enter a valid price');
      return;
    }
    
    try {
      const response = await fetch(`/api/transaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'land',
          asset_id: assetId,
          seller: walletAddress,
          price
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || errorData.error || 'Failed to create listing');
      }
      
      const data = await response.json();
      alert('Listing created successfully!');
      
      // Add the new listing to the transactions list
      setTransactions([...transactions, data]);
    } catch (error) {
      console.error('Error creating listing:', error);
      alert(`Failed to create listing: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 w-full h-full bg-amber-50 z-30 overflow-auto">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 border-b-2 border-amber-300 pb-4">
          <div>
            <h1 className="text-3xl font-serif text-amber-800">Venetian Marketplace</h1>
            <p className="text-amber-600 italic">The Grand Exchange of La Serenissima</p>
          </div>
          
          <button 
            onClick={onClose}
            className="bg-amber-600 text-white p-2 rounded-full hover:bg-amber-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Filters and Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 border border-amber-200">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-amber-700 mb-1">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or ID..."
                className="w-full px-3 py-2 border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-amber-700 mb-1">Filter by Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">All Types</option>
                <option value="land">Land</option>
                <option value="building">Buildings</option>
                <option value="resource">Resources</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-amber-700 mb-1">Sort by</label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSortChange('price')}
                  className={`px-3 py-2 rounded-md ${
                    sortField === 'price' 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  Price {sortField === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
                <button
                  onClick={() => handleSortChange('date')}
                  className={`px-3 py-2 rounded-md ${
                    sortField === 'date' 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </div>
            </div>
            
            <div className="ml-auto">
              <button
                onClick={handleCreateListing}
                className="bg-amber-600 text-white px-4 py-2 rounded-md hover:bg-amber-700 transition-colors flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Listing
              </button>
            </div>
          </div>
        </div>
        
        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-600"></div>
          </div>
        )}
        
        {/* Error State */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md mb-6">
            <p>{error}</p>
          </div>
        )}
        
        {/* No Results */}
        {!loading && !error && filteredTransactions.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-amber-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4M12 4v16m8-8a8 8 0 11-16 0 8 8 0 0116 0z" />
            </svg>
            <h3 className="text-xl font-medium text-amber-800 mb-2">No Listings Found</h3>
            <p className="text-amber-600 mb-4">There are currently no available listings matching your criteria.</p>
            <button
              onClick={handleCreateListing}
              className="bg-amber-600 text-white px-4 py-2 rounded-md hover:bg-amber-700 transition-colors"
            >
              Create a New Listing
            </button>
          </div>
        )}
        
        {/* Transaction Cards */}
        {!loading && !error && filteredTransactions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-amber-200">
                {/* Transaction Card Header */}
                <div className="bg-amber-100 px-4 py-3 border-b border-amber-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
                      {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                    </span>
                    <span className="text-xs text-amber-700">
                      {new Date(transaction.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                {/* Main content */}
                <div className="p-4">
                  {/* Title */}
                  <h3 className="text-lg font-medium text-amber-800 mb-2">
                    {transaction.historical_name || `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} #${transaction.asset_id.slice(0, 8)}`}
                  </h3>
                  
                  {/* Description if available */}
                  {transaction.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{transaction.description}</p>
                  )}
                  
                  {/* English name if available */}
                  {transaction.english_name && (
                    <p className="text-amber-600 italic text-sm mb-4">{transaction.english_name}</p>
                  )}
                  
                  {/* Price */}
                  <div className="bg-amber-50 p-3 rounded-md border border-amber-200 mb-4">
                    <p className="text-center">
                      <span className="text-2xl font-bold" style={{ color: '#d4af37' }}>{transaction.price.toLocaleString()}</span>
                      <span className="text-amber-700 ml-2">⚜️ ducats</span>
                    </p>
                  </div>
                  
                  {/* Seller */}
                  {transaction.seller && (
                    <div className="flex items-center mb-4">
                      <span className="text-gray-600 text-sm mr-2">Seller:</span>
                      <div className="flex-1">
                        <PlayerProfile
                          walletAddress={transaction.seller}
                          size="small"
                          showMotto={false}
                          showDucats={false}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Action button */}
                  <button
                    onClick={() => handlePurchase(transaction)}
                    disabled={transaction.seller === walletAddress}
                    className={`w-full py-2 rounded-md text-white font-medium ${
                      transaction.seller === walletAddress
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-amber-600 hover:bg-amber-700 transition-colors'
                    }`}
                  >
                    {transaction.seller === walletAddress ? 'Your Listing' : 'Purchase'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketPanel;
