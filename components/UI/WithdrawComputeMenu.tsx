import { useState, useEffect } from 'react';
import ActionButton from './ActionButton';
import AnimatedDucats from './AnimatedDucats';
import { useLoanStore } from '@/store/loanStore';
import { getWalletAddress } from '../../lib/utils/walletUtils';
import { LoanStatus } from '@/lib/services/LoanService';

interface WithdrawComputeMenuProps {
  onClose: () => void;
  onWithdraw: (amount: number) => Promise<void>;
  Ducats?: number;
}

export default function WithdrawComputeMenu({ onClose, onWithdraw, Ducats = 0 }: WithdrawComputeMenuProps) {
  const [amount, setAmount] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleWithdraw = async (withdrawAmount: number) => {
    if (withdrawAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (withdrawAmount > Ducats) {
      setError('You cannot withdraw more than your available balance');
      return;
    }

    // Check if citizen has any active loans
    const walletAddress = getWalletAddress();
    if (walletAddress) {
      try {
        const loanStore = useLoanStore.getState();
        const citizenLoans = await loanStore.loadCitizenLoans(walletAddress);
        
        // Check if there are any active loans
        const activeLoans = citizenLoans.filter(loan => loan.status === LoanStatus.ACTIVE);
        
        if (activeLoans.length > 0) {
          setError('You must repay all active loans before withdrawing compute. This is required by the Venetian Banking Guild.');
          return;
        }
      } catch (error) {
        console.error('Error checking citizen loans:', error);
        // Continue with withdrawal if we can't check loans to avoid blocking citizens
      }
    }

    setError(null);
    setSuccess(null);
    setIsProcessing(true);
    
    try {
      // Add a timeout to prevent hanging indefinitely
      const withdrawPromise = onWithdraw(withdrawAmount);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Withdrawal request timed out after 30 seconds')), 30000)
      );
      
      // Race the withdrawal against the timeout
      await Promise.race([withdrawPromise, timeoutPromise]);
      
      setSuccess(`Successfully withdrew ${withdrawAmount.toLocaleString()} ducats!`);
      
      // Reset amount after successful withdrawal
      setAmount(0);
      
      // Close the modal after a short delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error withdrawing compute:', error);
      
      // Handle specific error messages
      if ((error as Error).message && (error as Error).message.includes('tweetnacl')) {
        setError('Withdrawal service is temporarily unavailable. Please try again later.');
      } else if ((error as Error).message && (error as Error).message.includes('parse')) {
        setError('There was an issue processing your withdrawal. The system is being updated. Please try again later.');
      } else if ((error as Error).message && (error as Error).message.includes('Insufficient')) {
        setError('Insufficient balance for withdrawal.');
      } else if ((error as Error).message && (error as Error).message.includes('timeout')) {
        setError('The withdrawal request timed out. Please try again later.');
      } else {
        setError((error as Error).message || 'Failed to withdraw compute. Please try again later.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full border-2 border-amber-600">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-amber-800">Cash out <span className="compute-token">$COMPUTE</span></h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={isProcessing}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="mb-4">
          <div className="bg-amber-50 p-3 rounded-lg mb-4 border border-amber-200">
            <p className="text-amber-800 mb-1">Your current balance:</p>
            <p className="font-bold text-2xl text-amber-700">
              <AnimatedDucats 
                value={Ducats} 
                suffix="⚜️ ducats" 
                duration={1200}
              />
            </p>
          </div>
          
          <p className="mb-4 text-gray-700">Enter the amount of ducats to withdraw:</p>
          
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full px-3 py-2 border border-amber-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="Enter amount..."
            min="1"
            max={Ducats}
          />
          
          {error && (
            <p className="text-red-500 text-sm mb-4 p-2 bg-red-50 rounded border border-red-200">{error}</p>
          )}
          
          {success && (
            <p className="text-green-600 text-sm mb-4 p-2 bg-green-50 rounded border border-green-200">{success}</p>
          )}
          
          <div className="grid grid-cols-2 gap-2 mb-4">
            <ActionButton 
              onClick={() => setAmount(Math.floor(Ducats * 0.25))} 
              variant="secondary"
              disabled={isProcessing}
            >
              25%
            </ActionButton>
            <ActionButton 
              onClick={() => setAmount(Math.floor(Ducats * 0.5))} 
              variant="secondary"
              disabled={isProcessing}
            >
              50%
            </ActionButton>
            <ActionButton 
              onClick={() => setAmount(Math.floor(Ducats * 0.75))} 
              variant="secondary"
              disabled={isProcessing}
            >
              75%
            </ActionButton>
            <ActionButton 
              onClick={() => setAmount(Ducats)} 
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
            disabled={isProcessing || amount <= 0 || amount > Ducats}
          >
            {isProcessing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : <span>Cash out <span className="compute-token">$COMPUTE</span></span>}
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
