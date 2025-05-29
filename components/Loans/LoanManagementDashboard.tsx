import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useLoanStore } from '@/store/loanStore';
import { LoanData, LoanStatus } from '@/lib/services/LoanService';
import { getWalletAddress } from '../../lib/utils/walletUtils';
import ErrorBoundary from '@/components/UI/ErrorBoundary';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';
import { useWalletContext } from '@/components/UI/WalletProvider';

const LoanManagementDashboard: React.FC = () => {
  const { citizenLoans, loading, error, loadCitizenLoans, makePayment } = useLoanStore();
  const { citizenProfile } = useWalletContext();
  const [selectedLoan, setSelectedLoan] = useState<LoanData | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  useEffect(() => {
    const walletAddress = getWalletAddress();
    console.log("LoanManagementDashboard: Wallet address:", walletAddress);
    
    if (walletAddress) {
      console.log("LoanManagementDashboard: Loading citizen loans for wallet:", walletAddress);
      loadCitizenLoans(walletAddress)
        .then(loans => {
          console.log("LoanManagementDashboard: Citizen loans loaded:", loans);
          console.log("LoanManagementDashboard: Number of citizen loans:", loans.length);
        })
        .catch(error => {
          console.error("LoanManagementDashboard: Error loading citizen loans:", error);
        });
    } else {
      console.warn("LoanManagementDashboard: No wallet address found, cannot load loans");
    }
    
    // Add event listener for refreshing loans
    const handleRefreshLoans = () => {
      if (walletAddress) {
        console.log("LoanManagementDashboard: Refreshing citizen loans");
        loadCitizenLoans(walletAddress)
          .catch(error => {
            console.error("LoanManagementDashboard: Error refreshing citizen loans:", error);
          });
      }
    };
    
    window.addEventListener('refreshLoans', handleRefreshLoans);
    
    return () => {
      window.removeEventListener('refreshLoans', handleRefreshLoans);
    };
    
    // Subscribe to loan-related events to update the dashboard in real-time
    const loanPaymentMadeSubscription = eventBus.subscribe(
      EventTypes.LOAN_PAYMENT_MADE, 
      (data) => {
        // Refresh loans after payment
        if (walletAddress) {
          loadCitizenLoans(walletAddress);
        }
      }
    );
    
    const loanAppliedSubscription = eventBus.subscribe(
      EventTypes.LOAN_APPLIED, 
      (data) => {
        // Refresh loans after application
        if (walletAddress) {
          loadCitizenLoans(walletAddress);
        }
      }
    );
    
    // Clean up subscriptions when component unmounts
    return () => {
      loanPaymentMadeSubscription.unsubscribe();
      loanAppliedSubscription.unsubscribe();
    };
  }, [loadCitizenLoans]);
  
  const handleOpenPaymentModal = (loan: LoanData) => {
    setSelectedLoan(loan);
    setPaymentAmount(loan.paymentAmount);
    setIsPaymentModalOpen(true);
  };
  
  const handleMakePayment = async () => {
    if (!selectedLoan) return;
    
    setIsSubmitting(true);
    setPaymentError(null);
    
    try {
      await makePayment(selectedLoan.id, paymentAmount);
      setIsPaymentModalOpen(false);
      
      // Emit event for loan paid off if balance is now zero
      if (selectedLoan.remainingBalance - paymentAmount <= 0) {
        eventBus.emit(EventTypes.LOAN_PAID_OFF, { 
          loanId: selectedLoan.id,
          loanName: selectedLoan.name
        });
      }
      
      // Use notification instead of alert for better UX
      eventBus.emit('showNotification', {
        message: 'Payment successful!',
        type: 'success'
      });
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Calculate total debt and daily payment obligations
  const totalDebt = citizenLoans.reduce((sum, loan) => sum + loan.remainingBalance, 0);
  const dailyPayments = citizenLoans.reduce((sum, loan) => {
    // Calculate daily payment for each loan
    const interestDecimal = loan.interestRate / 100;
    const totalInterest = loan.principalAmount * interestDecimal * (loan.termDays / 365);
    const totalPayment = loan.principalAmount + totalInterest;
    const dailyPayment = totalPayment / loan.termDays;
    
    return sum + dailyPayment;
  }, 0);
  
  return (
    <ErrorBoundary fallback={<div className="p-4 text-red-600">Error loading loan dashboard</div>}>
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-4xl mx-auto">
        <h2 className="text-2xl font-serif text-amber-800 mb-6 text-center">
          Your Loans
        </h2>
        
        <div className="flex justify-center mb-6">
          <div className="h-px w-1/3 bg-gradient-to-r from-transparent via-amber-700 to-transparent"></div>
        </div>
        
        {/* Stats overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-parchment p-6 rounded-lg border-2 border-amber-700 shadow-md relative">
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 opacity-20 pointer-events-none">
              <Image 
                src="https://backend.serenissima.ai/public_assets/images/knowledge/seal-of-venice.png" 
                alt="Seal of Venice" 
                width={60} 
                height={60}
              />
            </div>
            <h3 className="text-lg font-serif font-medium text-amber-800 mb-2">Total Debt</h3>
            <p className="text-3xl font-bold text-amber-900">{Math.floor(totalDebt).toLocaleString()} ⚜️ Ducats</p>
          </div>
          
          <div className="bg-parchment p-6 rounded-lg border-2 border-amber-700 shadow-md relative">
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 opacity-20 pointer-events-none">
              <Image 
                src="https://backend.serenissima.ai/public_assets/images/knowledge/seal-of-venice.png" 
                alt="Seal of Venice" 
                width={60} 
                height={60}
              />
            </div>
            <h3 className="text-lg font-serif font-medium text-amber-800 mb-2">Daily Payment Obligations</h3>
            <p className="text-3xl font-bold text-amber-900">{Math.floor(dailyPayments).toLocaleString()} ⚜️ Ducats</p>
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
            {citizenLoans.length === 0 ? (
              <div className="text-center py-8 text-gray-500 italic">
                <p>You have no active loans.</p>
                <p className="mt-2">Browse the available loans above and click "Apply" to request financing for your ventures.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {citizenLoans.map((loan) => (
                  <div key={loan.id} className="bg-parchment rounded-lg border border-amber-700 shadow-md overflow-hidden relative">
                    {/* Add Venetian seal watermark */}
                    <div className="absolute opacity-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                      <Image 
                        src="https://backend.serenissima.ai/public_assets/images/knowledge/seal-of-venice.png" 
                        alt="Seal of Venice" 
                        width={150} 
                        height={150}
                        className="opacity-30"
                      />
                    </div>
                    
                    <div className="p-6 relative z-10">
                      <div className="flex justify-between items-start">
                        <div>
                          {/* Format the loan name to use citizen's name instead of wallet address */}
                          <h3 className="text-lg font-serif font-medium text-amber-800">
                            {loan.name.startsWith('Official Loan - ') 
                              ? `Official Loan - ${citizenProfile?.firstName || ''} ${citizenProfile?.lastName || ''}`
                              : loan.name}
                          </h3>
                          <p className="text-sm text-amber-700 italic">From: {
                            loan.lender === 'Treasury' 
                              ? 'Treasury of Venice' 
                              : loan.lender === 'ConsiglioDeiDieci' 
                                ? 'Council of Ten' 
                                : loan.lender
                          }</p>
                        </div>
                        <div className="flex items-center">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            loan.status === LoanStatus.ACTIVE 
                              ? 'bg-green-100 text-green-800 border border-green-300' 
                              : loan.status === LoanStatus.PAID 
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {loan.status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Add decorative border */}
                      <div className="my-4 h-px bg-gradient-to-r from-transparent via-amber-700 to-transparent"></div>
                      
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-serif text-amber-700">Principal</p>
                          <p className="text-lg font-medium text-amber-900">{Math.floor(loan.principalAmount).toLocaleString()} ⚜️ Ducats</p>
                        </div>
                        <div>
                          <p className="text-sm font-serif text-amber-700">Remaining Balance</p>
                          <p className="text-lg font-medium text-amber-900">{Math.floor(loan.remainingBalance).toLocaleString()} ⚜️ Ducats</p>
                        </div>
                        <div>
                          <p className="text-sm font-serif text-amber-700">Interest Rate</p>
                          <p className="text-lg font-medium text-amber-900">{loan.interestRate}%</p>
                        </div>
                        <div>
                          <p className="text-sm font-serif text-amber-700">Term</p>
                          <p className="text-lg font-medium text-amber-900">{loan.termDays} days</p>
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="mt-6">
                        <div className="flex justify-between text-sm text-amber-700 mb-1">
                          <span>Repayment Progress</span>
                          <span>
                            {Math.round((1 - loan.remainingBalance / loan.principalAmount) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-amber-200 rounded-full h-2.5">
                          <div 
                            className="bg-amber-600 h-2.5 rounded-full" 
                            style={{ width: `${Math.round((1 - loan.remainingBalance / loan.principalAmount) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* Next payment info */}
                      <div className="mt-6 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-serif text-amber-700">Next Payment</p>
                          <p className="text-lg font-medium text-amber-900">{Math.floor(loan.paymentAmount).toLocaleString()} ⚜️ Ducats</p>
                        </div>
                        
                        <button
                          onClick={() => handleOpenPaymentModal(loan)}
                          className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 border border-amber-800 font-serif"
                          disabled={loan.status !== LoanStatus.ACTIVE}
                        >
                          Make Payment
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Payment Modal */}
      {isPaymentModalOpen && selectedLoan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-parchment rounded-lg p-6 max-w-md w-full mx-4 border-2 border-amber-700 relative">
            {/* Add Venetian seal watermark */}
            <div className="absolute opacity-10 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <Image 
                src="https://backend.serenissima.ai/public_assets/images/knowledge/seal-of-venice.png" 
                alt="Seal of Venice" 
                width={100} 
                height={100}
                className="opacity-30"
              />
            </div>
            
            <h3 className="text-lg font-serif font-medium text-amber-800 mb-4">Make Payment</h3>
            
            <div className="my-2 h-px bg-gradient-to-r from-transparent via-amber-700 to-transparent"></div>
            
            <div className="space-y-4 relative z-10">
              <div>
                <label htmlFor="paymentAmount" className="block text-sm font-serif font-medium text-amber-700">
                  Payment Amount
                </label>
                <input
                  type="number"
                  id="paymentAmount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  min={1}
                  max={selectedLoan.remainingBalance}
                  className="mt-1 block w-full border border-amber-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm bg-amber-50"
                />
              </div>
              
              <div className="bg-amber-50 p-4 rounded-md border border-amber-200">
                <p className="text-sm font-serif text-amber-800">
                  Remaining balance after this payment: {Math.floor(selectedLoan.remainingBalance - paymentAmount).toLocaleString()} Ducats
                </p>
              </div>
              
              {paymentError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                  <span className="block sm:inline">{paymentError}</span>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-serif"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMakePayment}
                disabled={isSubmitting || paymentAmount <= 0 || paymentAmount > selectedLoan.remainingBalance}
                className={`px-4 py-2 rounded-md font-serif ${
                  isSubmitting || paymentAmount <= 0 || paymentAmount > selectedLoan.remainingBalance
                    ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                    : 'bg-amber-600 text-white hover:bg-amber-700 border border-amber-800'
                }`}
              >
                {isSubmitting ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default LoanManagementDashboard;
