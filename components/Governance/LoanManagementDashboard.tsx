import React, { useEffect, useState } from 'react';
import { useLoanStore } from '@/store/loanStore';
import { LoanData, LoanStatus } from '@/lib/services/LoanService';
import { getWalletAddress } from '@/lib/walletUtils';
import { ErrorBoundary } from '@/components/UI/ErrorBoundary';
import { eventBus, EventTypes } from '@/lib/eventBus';

const LoanManagementDashboard: React.FC = () => {
  const { userLoans, loading, error, loadUserLoans, makePayment } = useLoanStore();
  const [selectedLoan, setSelectedLoan] = useState<LoanData | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  
  useEffect(() => {
    const walletAddress = getWalletAddress();
    if (walletAddress) {
      loadUserLoans(walletAddress);
    }
    
    // Subscribe to loan-related events to update the dashboard in real-time
    const loanPaymentMadeSubscription = eventBus.subscribe(
      EventTypes.LOAN_PAYMENT_MADE, 
      (data) => {
        // Refresh loans after payment
        if (walletAddress) {
          loadUserLoans(walletAddress);
        }
      }
    );
    
    const loanAppliedSubscription = eventBus.subscribe(
      EventTypes.LOAN_APPLIED, 
      (data) => {
        // Refresh loans after application
        if (walletAddress) {
          loadUserLoans(walletAddress);
        }
      }
    );
    
    // Clean up subscriptions when component unmounts
    return () => {
      loanPaymentMadeSubscription.unsubscribe();
      loanAppliedSubscription.unsubscribe();
    };
  }, [loadUserLoans]);
  
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
  const totalDebt = userLoans.reduce((sum, loan) => sum + loan.remainingBalance, 0);
  const dailyPayments = userLoans.reduce((sum, loan) => {
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
        
        {/* Stats overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg border border-amber-200 shadow-sm">
            <h3 className="text-lg font-medium text-amber-800 mb-2">Total Debt</h3>
            <p className="text-3xl font-bold text-gray-900">{totalDebt.toLocaleString()} $COMPUTE</p>
          </div>
          
          <div className="bg-white p-6 rounded-lg border border-amber-200 shadow-sm">
            <h3 className="text-lg font-medium text-amber-800 mb-2">Daily Payment Obligations</h3>
            <p className="text-3xl font-bold text-gray-900">{dailyPayments.toLocaleString()} $COMPUTE</p>
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
            {userLoans.length === 0 ? (
              <div className="text-center py-8 text-gray-500 italic">
                You have no active loans. Visit the Loan Marketplace to apply for a loan.
              </div>
            ) : (
              <div className="space-y-6">
                {userLoans.map((loan) => (
                  <div key={loan.id} className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden">
                    <div className="p-6">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-medium text-gray-900">{loan.name}</h3>
                          <p className="text-sm text-gray-500">From: {loan.lender}</p>
                        </div>
                        <div className="flex items-center">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            loan.status === LoanStatus.ACTIVE 
                              ? 'bg-green-100 text-green-800' 
                              : loan.status === LoanStatus.PAID 
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {loan.status}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Principal</p>
                          <p className="text-lg font-medium text-gray-900">{loan.principalAmount.toLocaleString()} $COMPUTE</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Remaining Balance</p>
                          <p className="text-lg font-medium text-gray-900">{loan.remainingBalance.toLocaleString()} $COMPUTE</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Interest Rate</p>
                          <p className="text-lg font-medium text-gray-900">{loan.interestRate}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Term</p>
                          <p className="text-lg font-medium text-gray-900">{loan.termDays} days</p>
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="mt-6">
                        <div className="flex justify-between text-sm text-gray-500 mb-1">
                          <span>Repayment Progress</span>
                          <span>
                            {Math.round((1 - loan.remainingBalance / loan.principalAmount) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div 
                            className="bg-amber-600 h-2.5 rounded-full" 
                            style={{ width: `${Math.round((1 - loan.remainingBalance / loan.principalAmount) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* Next payment info */}
                      <div className="mt-6 flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-500">Next Payment</p>
                          <p className="text-lg font-medium text-gray-900">{loan.paymentAmount.toLocaleString()} $COMPUTE</p>
                        </div>
                        
                        <button
                          onClick={() => handleOpenPaymentModal(loan)}
                          className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
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
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Make Payment</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="paymentAmount" className="block text-sm font-medium text-gray-700">
                  Payment Amount
                </label>
                <input
                  type="number"
                  id="paymentAmount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  min={1}
                  max={selectedLoan.remainingBalance}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                />
              </div>
              
              <div className="bg-amber-50 p-4 rounded-md">
                <p className="text-sm text-amber-800">
                  Remaining balance after this payment: {(selectedLoan.remainingBalance - paymentAmount).toLocaleString()} $COMPUTE
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
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMakePayment}
                disabled={isSubmitting || paymentAmount <= 0 || paymentAmount > selectedLoan.remainingBalance}
                className={`px-4 py-2 rounded-md ${
                  isSubmitting || paymentAmount <= 0 || paymentAmount > selectedLoan.remainingBalance
                    ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                    : 'bg-amber-600 text-white hover:bg-amber-700'
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
