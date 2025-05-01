import { useState } from 'react';
import ActionButton from './ActionButton';

interface WithdrawComputeMenuProps {
  onClose: () => void;
  onWithdraw: (amount: number) => Promise<void>;
  computeAmount?: number;
}

export default function WithdrawComputeMenu({ onClose, onWithdraw, computeAmount = 0 }: WithdrawComputeMenuProps) {
  const [amount, setAmount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async (withdrawAmount: number) => {
    if (withdrawAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (withdrawAmount > computeAmount) {
      setError('You cannot withdraw more than your available balance');
      return;
    }

    setError(null);
    setIsProcessing(true);
    
    try {
      await onWithdraw(withdrawAmount);
      onClose();
    } catch (error) {
      console.error('Error withdrawing compute:', error);
      setError('Failed to withdraw compute. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Withdraw Compute</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-gray-700 mb-2">Your current balance: <span className="font-bold">{computeAmount.toLocaleString()} ducats</span></p>
          <p className="mb-4">Enter the amount of compute to withdraw:</p>
          
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
            placeholder="Enter amount..."
            min="1"
            max={computeAmount}
          />
          
          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            <ActionButton 
              onClick={() => setAmount(Math.floor(computeAmount * 0.25))} 
              variant="secondary"
              disabled={isProcessing}
            >
              25%
            </ActionButton>
            <ActionButton 
              onClick={() => setAmount(Math.floor(computeAmount * 0.5))} 
              variant="secondary"
              disabled={isProcessing}
            >
              50%
            </ActionButton>
            <ActionButton 
              onClick={() => setAmount(Math.floor(computeAmount * 0.75))} 
              variant="secondary"
              disabled={isProcessing}
            >
              75%
            </ActionButton>
            <ActionButton 
              onClick={() => setAmount(computeAmount)} 
              variant="secondary"
              disabled={isProcessing}
            >
              100%
            </ActionButton>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <ActionButton 
            onClick={() => handleWithdraw(amount)} 
            variant="primary"
            disabled={isProcessing || amount <= 0 || amount > computeAmount}
          >
            {isProcessing ? 'Processing...' : 'Withdraw'}
          </ActionButton>
          <ActionButton 
            onClick={onClose} 
            variant="secondary"
            disabled={isProcessing}
          >
            Cancel
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
