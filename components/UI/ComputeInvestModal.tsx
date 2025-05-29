import { useState } from 'react';
import ActionButton from './ActionButton';
import AnimatedDucats from './AnimatedDucats';

interface ComputeInvestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvest: (amount: number) => Promise<void>;
}

export default function ComputeInvestModal({ isOpen, onClose, onInvest }: ComputeInvestModalProps) {
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleInvest = async (amount: number) => {
    setError(null);
    setIsProcessing(true);
    try {
      await onInvest(amount);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to invest compute');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCustomInvest = () => {
    const amount = parseFloat(customAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    handleInvest(amount);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Invest Compute</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <p className="mb-4">Select the amount of compute to invest:</p>
        
        <div className="grid grid-cols-3 gap-2 mb-4">
          <ActionButton 
            onClick={() => handleInvest(100000)} 
            variant="primary"
            disabled={isProcessing}
          >
            100,000
          </ActionButton>
          <ActionButton 
            onClick={() => handleInvest(1000000)} 
            variant="primary"
            disabled={isProcessing}
          >
            1,000,000
          </ActionButton>
          <ActionButton 
            onClick={() => handleInvest(10000000)} 
            variant="primary"
            disabled={isProcessing}
          >
            10,000,000
          </ActionButton>
        </div>
        
        <div className="mb-4">
          <p className="mb-2">Or enter a custom amount:</p>
          <div className="flex flex-col">
            <div className="flex space-x-2 mb-2">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder="Enter amount"
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isProcessing}
              />
              <ActionButton 
                onClick={handleCustomInvest} 
                variant="primary"
                disabled={isProcessing}
              >
                Invest
              </ActionButton>
            </div>
            {customAmount && parseFloat(customAmount) > 0 && (
              <div className="text-center text-amber-700 font-medium">
                <AnimatedDucats 
                  value={parseFloat(customAmount)} 
                  suffix="⚜️ ducats" 
                  className="text-lg"
                />
              </div>
            )}
          </div>
        </div>
        
        {error && (
          <div className="text-red-500 mb-4">
            {error}
          </div>
        )}
        
        {isProcessing && (
          <div className="text-blue-500 mb-4">
            Processing transaction...
          </div>
        )}
        
        <p className="text-sm text-gray-500">
          This will transfer tokens from your wallet to the Serenissima treasury and increase your compute allocation.
        </p>
      </div>
    </div>
  );
}
