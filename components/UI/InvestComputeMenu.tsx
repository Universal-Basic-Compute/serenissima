import React, { useState } from 'react';

interface InvestComputeMenuProps {
  onClose: () => void;
  onInvest: (amount: number) => Promise<void>;
}

const InvestComputeMenu: React.FC<InvestComputeMenuProps> = ({ onClose, onInvest }) => {
  const [amount, setAmount] = useState<number>(10000000); // Default 10M compute
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvest = async () => {
    if (amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onInvest(amount);
      onClose();
    } catch (error) {
      setError(error.message || 'Failed to invest compute');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-96 max-w-full border-2 border-amber-600">
        <h2 className="text-xl font-serif font-semibold mb-4 text-amber-800 text-center">Invest Compute</h2>
        
        <div className="mb-6 text-gray-700 text-center">
          <p>Invest your compute resources to support the Republic of Venice and earn rewards.</p>
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 mb-2">Amount (in ducats)</label>
          <div className="flex items-center">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
              min="1"
            />
          </div>
          {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
        </div>
        
        <div className="flex space-x-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-amber-600 text-amber-600 rounded hover:bg-amber-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInvest}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Investing...
              </>
            ) : (
              'Invest Compute'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestComputeMenu;
