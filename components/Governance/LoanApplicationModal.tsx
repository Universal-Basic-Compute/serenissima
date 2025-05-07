import React, { useState, useEffect } from 'react';
import { useLoanStore } from '@/store/loanStore';
import { LoanData, LoanPurpose } from '@/lib/services/LoanService';
import { getWalletAddress } from '@/lib/walletUtils';
import { ErrorBoundary } from '@/components/UI/ErrorBoundary';

interface LoanApplicationModalProps {
  loan: LoanData;
  onClose: () => void;
}

const LoanApplicationModal: React.FC<LoanApplicationModalProps> = ({ loan, onClose }) => {
  const { applyForLoan } = useLoanStore();
  const [step, setStep] = useState(1);
  const [loanAmount, setLoanAmount] = useState(loan.principalAmount);
  const [loanPurpose, setLoanPurpose] = useState<LoanPurpose>(LoanPurpose.BUILDING_CONSTRUCTION);
  const [applicationText, setApplicationText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Calculate loan details
  const interestDecimal = loan.interestRate / 100;
  const totalInterest = loanAmount * interestDecimal * (loan.termDays / 365);
  const totalPayment = loanAmount + totalInterest;
  const dailyPayment = totalPayment / loan.termDays;
  
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const walletAddress = getWalletAddress();
      
      if (!walletAddress) {
        throw new Error('Please connect your wallet first');
      }
      
      await applyForLoan({
        loanId: loan.id,
        borrower: walletAddress,
        principalAmount: loanAmount,
        loanPurpose,
        applicationText
      });
      
      // Show success message and close modal
      alert('Loan application submitted successfully!');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <ErrorBoundary fallback={<div className="p-4 text-red-600">Error in loan application</div>}>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h2 className="text-2xl font-serif text-amber-800 mb-6 text-center">
            Loan Application
          </h2>
          
          {/* Progress indicator */}
          <div className="flex items-center justify-center mb-8">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step >= 1 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              1
            </div>
            <div className={`h-1 w-12 ${step >= 2 ? 'bg-amber-600' : 'bg-gray-200'}`}></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step >= 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              2
            </div>
            <div className={`h-1 w-12 ${step >= 3 ? 'bg-amber-600' : 'bg-gray-200'}`}></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step >= 3 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              3
            </div>
          </div>
          
          {/* Step 1: Select Loan Purpose */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-amber-800">Select Loan Purpose</h3>
              
              <div className="space-y-4">
                {Object.values(LoanPurpose).map((purpose) => (
                  <div key={purpose} className="flex items-center">
                    <input
                      type="radio"
                      id={purpose}
                      name="loanPurpose"
                      value={purpose}
                      checked={loanPurpose === purpose}
                      onChange={() => setLoanPurpose(purpose as LoanPurpose)}
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor={purpose} className="ml-3 block text-sm font-medium text-gray-700">
                      {purpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </label>
                  </div>
                ))}
              </div>
              
              <div className="mt-8 flex justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          
          {/* Step 2: Amount & Collateral */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-amber-800">Loan Amount</h3>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700">
                    Amount ({loanAmount.toLocaleString()} $COMPUTE)
                  </label>
                  <input
                    type="range"
                    id="loanAmount"
                    min={loan.principalAmount * 0.1}
                    max={loan.principalAmount}
                    step={loan.principalAmount * 0.05}
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                    className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer mt-2"
                  />
                </div>
                
                <div className="bg-white p-4 rounded-md border border-amber-200">
                  <h4 className="font-medium text-amber-800 mb-2">Loan Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-600">Principal:</div>
                    <div className="text-gray-900 font-medium">{loanAmount.toLocaleString()} $COMPUTE</div>
                    
                    <div className="text-gray-600">Interest Rate:</div>
                    <div className="text-gray-900 font-medium">{loan.interestRate}%</div>
                    
                    <div className="text-gray-600">Term:</div>
                    <div className="text-gray-900 font-medium">{loan.termDays} days</div>
                    
                    <div className="text-gray-600">Total Interest:</div>
                    <div className="text-gray-900 font-medium">{totalInterest.toLocaleString()} $COMPUTE</div>
                    
                    <div className="text-gray-600">Total Payment:</div>
                    <div className="text-gray-900 font-medium">{totalPayment.toLocaleString()} $COMPUTE</div>
                    
                    <div className="text-gray-600">Daily Payment:</div>
                    <div className="text-gray-900 font-medium">{dailyPayment.toLocaleString()} $COMPUTE</div>
                  </div>
                </div>
                
                <div>
                  <label htmlFor="applicationText" className="block text-sm font-medium text-gray-700">
                    Application Statement
                  </label>
                  <textarea
                    id="applicationText"
                    rows={4}
                    value={applicationText}
                    onChange={(e) => setApplicationText(e.target.value)}
                    placeholder="Explain why you need this loan and how you plan to repay it..."
                    className="mt-1 block w-full border border-amber-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                  />
                </div>
              </div>
              
              <div className="mt-8 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          
          {/* Step 3: Review & Accept */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-amber-800">Review & Accept</h3>
              
              <div className="bg-white p-6 rounded-md border border-amber-200">
                <h4 className="font-medium text-amber-800 mb-4 text-center">Loan Summary</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-gray-600">Loan Name:</div>
                  <div className="text-gray-900 font-medium">{loan.name}</div>
                  
                  <div className="text-gray-600">Lender:</div>
                  <div className="text-gray-900 font-medium">{loan.lender}</div>
                  
                  <div className="text-gray-600">Purpose:</div>
                  <div className="text-gray-900 font-medium">
                    {loanPurpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                  
                  <div className="text-gray-600">Principal Amount:</div>
                  <div className="text-gray-900 font-medium">{loanAmount.toLocaleString()} $COMPUTE</div>
                  
                  <div className="text-gray-600">Interest Rate:</div>
                  <div className="text-gray-900 font-medium">{loan.interestRate}%</div>
                  
                  <div className="text-gray-600">Term:</div>
                  <div className="text-gray-900 font-medium">{loan.termDays} days</div>
                  
                  <div className="text-gray-600">Total Repayment:</div>
                  <div className="text-gray-900 font-medium">{totalPayment.toLocaleString()} $COMPUTE</div>
                  
                  <div className="text-gray-600">Daily Payment:</div>
                  <div className="text-gray-900 font-medium">{dailyPayment.toLocaleString()} $COMPUTE</div>
                </div>
                
                {loan.requirementsText && (
                  <div className="mt-4 p-3 bg-amber-50 rounded border border-amber-200">
                    <h5 className="text-sm font-medium text-amber-800 mb-1">Requirements:</h5>
                    <p className="text-sm text-gray-700">{loan.requirementsText}</p>
                  </div>
                )}
                
                <div className="mt-6">
                  <div className="relative flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id="terms"
                        name="terms"
                        type="checkbox"
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-3 text-sm">
                      <label htmlFor="terms" className="font-medium text-gray-700">
                        I agree to the terms and conditions
                      </label>
                      <p className="text-gray-500">
                        I understand that failure to repay this loan may result in penalties, including seizure of assets and damage to my reputation in La Serenissima.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                  <strong className="font-bold">Error!</strong>
                  <span className="block sm:inline"> {error}</span>
                </div>
              )}
              
              <div className="mt-8 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`px-4 py-2 rounded-md ${
                    isSubmitting 
                      ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  }`}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default LoanApplicationModal;
