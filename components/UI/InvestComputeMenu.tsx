import React, { useState } from 'react';

// Add function to format the number with commas
const formatNumberWithCommas = (num: number): string => {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

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
      setError((error as Error).message || 'Failed to invest compute');
    } finally {
      setIsLoading(false);
    }
  };

  const presetAmounts = [
    { label: '100,000', value: 100000 },
    { label: '1,000,000', value: 1000000 },
    { label: '10,000,000', value: 10000000 }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-lg w-[700px] max-w-[90vw] border-4 border-amber-600">
        <h2 className="text-3xl font-serif font-semibold mb-4 text-amber-800 text-center">Invest Compute</h2>
        
        <div className="mb-8 text-gray-700 text-center">
          <p className="text-lg">Invest your compute resources to support the Republic and become the richest merchant of Venezia.</p>
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-md font-medium text-amber-800">About Ducats in La Serenissima</p>
            <p className="mt-2">Ducats in La Serenissima are backed by real $COMPUTE tokens on the Solana blockchain.</p>
            <p className="mt-1">Each 1 ducat you earn in-game can be withdrawn as 1 $COMPUTE token to your wallet.</p>
            <p className="mt-1 text-amber-700">Please enter whole numbers only - no decimals or fractions.</p>
            <p className="mt-1 font-semibold">Investing $COMPUTE helps build the Republic and earns you rewards over time, increasing your wealth and influence in Venezia.</p>
          </div>
        </div>
        
        <div className="mb-8">
          <label className="block text-xl text-gray-700 mb-3">Amount (in whole ducats)</label>
          
          {/* Quick selection buttons */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            {presetAmounts.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setAmount(preset.value)}
                className={`py-3 text-lg rounded-lg transition-colors ${
                  amount === preset.value 
                    ? 'bg-amber-600 text-white font-medium' 
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          {/* Custom amount input */}
          <div className="flex items-center">
            <input
              type="text"
              value={formatNumberWithCommas(amount)}
              onChange={(e) => {
                // Remove commas before parsing
                const value = e.target.value.replace(/,/g, '');
                setAmount(parseInt(value) || 0);
              }}
              className="w-full px-4 py-3 text-xl border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-500"
              min="1"
            />
          </div>
          {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
        </div>
        
        <div className="flex space-x-6">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-4 text-lg border-2 border-amber-600 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInvest}
            disabled={isLoading}
            className="flex-1 px-6 py-4 text-lg bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
        
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>By investing, you are contributing to the growth and prosperity of La Serenissima.</p>
          <p className="mt-1">Your investment will be recorded on the Solana blockchain and earn you status as a prominent merchant of Venezia.</p>
        </div>
      </div>
    </div>
  );
};

export default InvestComputeMenu;
