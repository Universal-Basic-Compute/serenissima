import React, { useState, useEffect } from 'react';
import { useLoanStore } from '@/store/loanStore';
import { LoanData, LoanPurpose } from '@/lib/services/LoanService';

// Extended interface to include autoApproved property from API response
interface LoanApplicationResponse extends LoanData {
  autoApproved?: boolean;
}
import { getWalletAddress } from '../../lib/utils/walletUtils';
import ErrorBoundary from '@/components/UI/ErrorBoundary';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

// Ensure EventTypes has LOAN_APPROVED
declare module '@/lib/utils/eventBus' {
  interface EventTypes {
    LOAN_APPROVED: string;
  }
}

interface LoanApplicationModalProps {
  loan: LoanData;
  onClose: () => void;
}

// Helper function to provide descriptions for loan purposes
const getPurposeDescription = (purpose: string): string => {
  switch (purpose) {
    case LoanPurpose.BUILDING_CONSTRUCTION:
      return "Finance the construction of new buildings or renovation of existing structures.";
    case LoanPurpose.TRADE_VENTURE:
      return "Fund trading expeditions, purchase of goods, or establishment of trade routes.";
    case LoanPurpose.LAND_PURCHASE:
      return "Acquire new land parcels or properties within La Serenissima.";
    case LoanPurpose.DEBT_CONSOLIDATION:
      return "Combine multiple existing debts into a single loan with better terms.";
    case LoanPurpose.OTHER:
      return "Other purposes not listed above. Please provide details in your application.";
    default:
      return "Select a purpose for your loan application.";
  }
};

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
      
      const result: LoanApplicationResponse = await applyForLoan({
        loanId: loan.id,
        borrower: walletAddress,
        principalAmount: loanAmount,
        loanPurpose,
        applicationText
      });
      
      // Check if the loan was auto-approved (for first-time borrowers with template loans)
      const isAutoApproved = result.autoApproved === true;
      
      // The event is already emitted in the store, but we can add more specific data here
      eventBus.emit(EventTypes.LOAN_APPLIED, { 
        loan: result,
        borrower: walletAddress,
        loanAmount,
        loanPurpose,
        lender: loan.lender,
        autoApproved: isAutoApproved
      });
      
      // If auto-approved, also emit a loan approval event
      if (isAutoApproved) {
        eventBus.emit('LOAN_APPROVED', {
          loan: result,
          borrower: walletAddress,
          lender: loan.lender,
          amount: loanAmount,
          autoApproved: true
        });
      }
      
      // Close modal - no need for alert as we'll show a notification via the event system
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
          {/* Decorative header with Venetian styling */}
          <div className="relative mb-6">
            <h2 className="text-2xl font-serif text-amber-800 text-center">
              Loan Application
            </h2>
            <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-amber-600 to-transparent"></div>
          </div>
          
          {/* Progress indicator with Venetian styling */}
          <div className="flex items-center justify-center mb-8">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              step >= 1 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'
            } border-2 border-amber-700 shadow-md`}>
              1
            </div>
            <div className={`h-1 w-12 ${step >= 2 ? 'bg-amber-600' : 'bg-gray-200'}`}></div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              step >= 2 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'
            } border-2 border-amber-700 shadow-md`}>
              2
            </div>
            <div className={`h-1 w-12 ${step >= 3 ? 'bg-amber-600' : 'bg-gray-200'}`}></div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              step >= 3 ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-600'
            } border-2 border-amber-700 shadow-md`}>
              3
            </div>
          </div>
          
          {/* Step 1: Select Loan Purpose - Enhanced with Venetian styling */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-amber-100 to-amber-200 px-4 py-3 border-b border-amber-300 rounded-t-lg">
                <h3 className="text-lg font-serif font-medium text-amber-800">Select Loan Purpose</h3>
              </div>
              
              <div className="bg-white p-6 rounded-lg border border-amber-200 shadow-md">
                <div className="space-y-4">
                  {Object.values(LoanPurpose).map((purpose) => (
                    <div key={purpose} className={`flex items-center p-3 rounded-lg transition-colors ${
                      loanPurpose === purpose ? 'bg-amber-100 border-2 border-amber-300' : 'border border-gray-200 hover:bg-amber-50'
                    }`}>
                      <input
                        type="radio"
                        id={purpose}
                        name="loanPurpose"
                        value={purpose}
                        checked={loanPurpose === purpose}
                        onChange={() => setLoanPurpose(purpose as LoanPurpose)}
                        className="h-4 w-4 text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor={purpose} className="ml-3 flex-1 cursor-pointer">
                        <div className="font-medium text-gray-700">
                          {purpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {getPurposeDescription(purpose)}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 text-sm text-amber-700 italic text-center">
                  <p>The purpose of your loan affects how it will be evaluated by the lender.</p>
                  <p>Choose the option that best represents your intended use of the funds.</p>
                </div>
              </div>
              
              <div className="mt-8 flex justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 flex items-center"
                >
                  Next
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          {/* Step 2: Amount & Collateral - Enhanced with Venetian styling */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-amber-100 to-amber-200 px-4 py-3 border-b border-amber-300 rounded-t-lg">
                <h3 className="text-lg font-serif font-medium text-amber-800">Loan Amount & Terms</h3>
              </div>
              
              <div className="bg-white p-6 rounded-lg border border-amber-200 shadow-md">
                <div className="space-y-6">
                  <div>
                    <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-700 mb-1">
                      Amount ({loanAmount.toLocaleString()} ⚜️ Ducats)
                    </label>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{(loan.principalAmount * 0.1).toLocaleString()}</span>
                      <input
                        type="range"
                        id="loanAmount"
                        min={loan.principalAmount * 0.1}
                        max={loan.principalAmount}
                        step={loan.principalAmount * 0.05}
                        value={loanAmount}
                        onChange={(e) => setLoanAmount(Number(e.target.value))}
                        className="w-full h-2 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-sm text-gray-500">{loan.principalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 p-5 rounded-lg border border-amber-200">
                    <h4 className="font-serif font-medium text-amber-800 mb-3 text-center">Loan Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-3 rounded border border-amber-100">
                        <div className="text-sm text-gray-500">Principal</div>
                        <div className="text-lg font-medium text-gray-900">{Math.floor(loanAmount).toLocaleString()} ⚜️</div>
                      </div>
                      <div className="bg-white p-3 rounded border border-amber-100">
                        <div className="text-sm text-gray-500">Interest Rate</div>
                        <div className="text-lg font-medium text-gray-900">{loan.interestRate}%</div>
                      </div>
                      <div className="bg-white p-3 rounded border border-amber-100">
                        <div className="text-sm text-gray-500">Term</div>
                        <div className="text-lg font-medium text-gray-900">{loan.termDays} days</div>
                      </div>
                      <div className="bg-white p-3 rounded border border-amber-100">
                        <div className="text-sm text-gray-500">Total Interest</div>
                        <div className="text-lg font-medium text-gray-900">{Math.floor(totalInterest).toLocaleString()} ⚜️</div>
                      </div>
                      <div className="bg-white p-3 rounded border border-amber-100">
                        <div className="text-sm text-gray-500">Total Payment</div>
                        <div className="text-lg font-medium text-gray-900">{Math.floor(totalPayment).toLocaleString()} ⚜️</div>
                      </div>
                      <div className="bg-white p-3 rounded border border-amber-100">
                        <div className="text-sm text-gray-500">Daily Payment</div>
                        <div className="text-lg font-medium text-gray-900">{Math.floor(dailyPayment).toLocaleString()} ⚜️</div>
                      </div>
                    </div>
                    
                    {/* Visualization of loan breakdown */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-amber-800 mb-1">
                        <span>Principal</span>
                        <span>Interest</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className="bg-amber-600 h-2.5 rounded-full" 
                          style={{ 
                            width: `${100 - (totalInterest / totalPayment * 100)}%` 
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>{Math.round(100 - (totalInterest / totalPayment * 100))}%</span>
                        <span>{Math.round(totalInterest / totalPayment * 100)}%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="applicationText" className="block text-sm font-medium text-gray-700 mb-1">
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
                    <p className="mt-1 text-xs text-gray-500">
                      A well-written statement increases your chances of approval. Describe your business plan and repayment strategy.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 flex items-center"
                >
                  Next
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          
          {/* Step 3: Review & Accept - Enhanced with Venetian styling */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-amber-100 to-amber-200 px-4 py-3 border-b border-amber-300 rounded-t-lg">
                <h3 className="text-lg font-serif font-medium text-amber-800">Review & Accept Terms</h3>
              </div>
              
              <div className="bg-white p-6 rounded-lg border border-amber-200 shadow-md">
                {/* Decorative seal */}
                <div className="flex justify-center mb-4">
                  <div className="relative w-20 h-20">
                    <div className="absolute inset-0 bg-amber-600 rounded-full opacity-20"></div>
                    <div className="absolute inset-2 border-2 border-amber-700 rounded-full flex items-center justify-center">
                      <span className="text-amber-800 font-serif text-xs text-center">Seal of<br/>La Serenissima</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-center mb-4">
                  <h4 className="font-serif text-lg font-medium text-amber-800">Loan Contract</h4>
                  <p className="text-sm text-gray-500">Review all terms before accepting</p>
                </div>
                
                <div className="bg-amber-50 p-5 rounded-lg border border-amber-200 mb-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="text-gray-600 font-medium">Loan Name:</div>
                    <div className="text-gray-900">{loan.name}</div>
                    
                    <div className="text-gray-600 font-medium">Lender:</div>
                    <div className="text-gray-900">{
                      loan.lender === 'Treasury' ? 'Treasury of Venice' : 
                      loan.lender === 'ConsiglioDeiDieci' ? 'Council of Ten' : 
                      loan.lender
                    }</div>
                    
                    <div className="text-gray-600 font-medium">Purpose:</div>
                    <div className="text-gray-900">
                      {loanPurpose.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    
                    <div className="text-gray-600 font-medium">Principal Amount:</div>
                    <div className="text-gray-900 font-medium">{Math.floor(loanAmount).toLocaleString()} ⚜️ Ducats</div>
                    
                    <div className="text-gray-600 font-medium">Interest Rate:</div>
                    <div className="text-gray-900">{loan.interestRate}% per annum</div>
                    
                    <div className="text-gray-600 font-medium">Term:</div>
                    <div className="text-gray-900">{loan.termDays} days</div>
                    
                    <div className="text-gray-600 font-medium">Total Repayment:</div>
                    <div className="text-gray-900 font-medium">{Math.floor(totalPayment).toLocaleString()} ⚜️ Ducats</div>
                    
                    <div className="text-gray-600 font-medium">Daily Payment:</div>
                    <div className="text-gray-900">{dailyPayment.toLocaleString()} ⚜️ Ducats</div>
                  </div>
                </div>
                
                {loan.requirementsText && (
                  <div className="mb-4 p-4 bg-blue-50 rounded border border-blue-200 text-sm text-blue-800">
                    <h5 className="font-medium mb-1">Lender Requirements:</h5>
                    <p>{loan.requirementsText}</p>
                  </div>
                )}
                
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
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
                      <p className="text-gray-500 mt-1">
                        I, <span className="font-serif">{getWalletAddress()?.substring(0, 8) || 'Applicant'}</span>, understand that failure to repay this loan may result in penalties, including seizure of assets and damage to my reputation in La Serenissima. I swear on my honor as a Venetian citizen to fulfill this obligation.
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
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`px-6 py-2 rounded-md ${
                    isSubmitting 
                      ? 'bg-gray-400 text-gray-700 cursor-not-allowed' 
                      : 'bg-amber-600 text-white hover:bg-amber-700'
                  } flex items-center`}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Submit Application
                    </>
                  )}
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
