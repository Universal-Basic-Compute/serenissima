import { create } from 'zustand';
import { LoanData, LoanService, LoanStatus, LoanPurpose } from '@/lib/services/LoanService';
import { eventBus, EventTypes } from '@/lib/utils/eventBus';

// Define custom event types if they don't exist in EventTypes
interface ExtendedEventTypes {
  LOAN_APPLIED: string;
  LOAN_PAYMENT_MADE: string;
  LOAN_OFFER_CREATED: string;
}

// Create extended event types by combining with existing EventTypes
const ExtendedEventTypes = {
  ...EventTypes,
  LOAN_APPLIED: 'LOAN_APPLIED',
  LOAN_PAYMENT_MADE: 'LOAN_PAYMENT_MADE',
  LOAN_OFFER_CREATED: 'LOAN_OFFER_CREATED'
};

// Loan store
export interface LoanState {
  availableLoans: LoanData[];
  citizenLoans: LoanData[];
  selectedLoan: LoanData | null;
  loading: boolean;
  error: string | null;
}

export interface LoanActions {
  loadAvailableLoans: () => Promise<LoanData[]>;
  loadCitizenLoans: (citizenId: string) => Promise<LoanData[]>;
  setSelectedLoan: (loan: LoanData | null) => void;
  applyForLoan: (application: any) => Promise<LoanData>;
  makePayment: (loanId: string, amount: number) => Promise<LoanData>;
  createLoanOffer: (offer: any) => Promise<LoanData>;
}

export const useLoanStore = create<LoanState & LoanActions>((set, get) => ({
  availableLoans: [],
  citizenLoans: [],
  selectedLoan: null,
  loading: false,
  error: null,
  
  loadAvailableLoans: async () => {
    console.log('LoanStore: Starting to load available loans');
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      console.log('LoanStore: Calling loanService.loadAvailableLoans()');
      const loans = await loanService.loadAvailableLoans();
      console.log('LoanStore: Received loans from service:', loans);
      console.log('LoanStore: Number of loans:', loans.length);
      set({ availableLoans: loans, loading: false });
      return loans;
    } catch (error) {
      console.error('LoanStore: Error loading available loans:', error);
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  },
  
  loadCitizenLoans: async (citizenId) => {
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      const loans = await loanService.getCitizenLoans(citizenId);
      set({ citizenLoans: loans, loading: false });
      return loans;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  },
  
  setSelectedLoan: (loan) => set({ selectedLoan: loan }),
  
  applyForLoan: async (application) => {
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      const loan = await loanService.applyForLoan(application);
      
      // Check if the loan was auto-approved
      const isAutoApproved = loan.autoApproved === true;
      
      // If auto-approved, update available loans list by removing this loan
      if (isAutoApproved) {
        const availableLoans = get().availableLoans.filter(l => l.id !== loan.id);
        set({ availableLoans });
      }
      
      // Update citizen loans
      const citizenLoans = [...get().citizenLoans, loan];
      set({ citizenLoans, loading: false });
      
      // Emit event for loan application
      eventBus.emit(ExtendedEventTypes.LOAN_APPLIED, { 
        loan,
        autoApproved: isAutoApproved
      });
      
      return loan;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  },
  
  makePayment: async (loanId, amount) => {
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      const updatedLoan = await loanService.makePayment(loanId, amount);
      
      // Update citizen loans
      const citizenLoans = get().citizenLoans.map(loan => 
        loan.id === loanId ? updatedLoan : loan
      );
      
      set({ citizenLoans, loading: false });
      
      // Emit event for loan payment
      eventBus.emit(ExtendedEventTypes.LOAN_PAYMENT_MADE, { 
        loanId, 
        amount, 
        remainingBalance: updatedLoan.remainingBalance 
      });
      
      return updatedLoan;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  },
  
  createLoanOffer: async (offer) => {
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      const loan = await loanService.createLoanOffer(offer);
      
      // Update available loans
      const availableLoans = [...get().availableLoans, loan];
      set({ availableLoans, loading: false });
      
      // Emit event for loan offer creation
      eventBus.emit(ExtendedEventTypes.LOAN_OFFER_CREATED, { loan });
      
      return loan;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  }
}));
