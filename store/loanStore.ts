import { create } from 'zustand';
import { LoanData, LoanService, LoanStatus, LoanPurpose } from '@/lib/services/LoanService';
import { eventBus, EventTypes } from '@/lib/eventBus';

// Loan store
export interface LoanState {
  availableLoans: LoanData[];
  userLoans: LoanData[];
  selectedLoan: LoanData | null;
  loading: boolean;
  error: string | null;
}

export interface LoanActions {
  loadAvailableLoans: () => Promise<LoanData[]>;
  loadUserLoans: (userId: string) => Promise<LoanData[]>;
  setSelectedLoan: (loan: LoanData | null) => void;
  applyForLoan: (application: any) => Promise<LoanData>;
  makePayment: (loanId: string, amount: number) => Promise<LoanData>;
  createLoanOffer: (offer: any) => Promise<LoanData>;
}

export const useLoanStore = create<LoanState & LoanActions>((set, get) => ({
  availableLoans: [],
  userLoans: [],
  selectedLoan: null,
  loading: false,
  error: null,
  
  loadAvailableLoans: async () => {
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      const loans = await loanService.loadAvailableLoans();
      set({ availableLoans: loans, loading: false });
      return loans;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  },
  
  loadUserLoans: async (userId) => {
    set({ loading: true, error: null });
    try {
      const loanService = LoanService.getInstance();
      const loans = await loanService.getUserLoans(userId);
      set({ userLoans: loans, loading: false });
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
      
      // Update user loans
      const userLoans = [...get().userLoans, loan];
      set({ userLoans, loading: false });
      
      // Emit event for loan application
      eventBus.emit(EventTypes.LOAN_APPLIED, { loan });
      
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
      
      // Update user loans
      const userLoans = get().userLoans.map(loan => 
        loan.id === loanId ? updatedLoan : loan
      );
      
      set({ userLoans, loading: false });
      
      // Emit event for loan payment
      eventBus.emit(EventTypes.LOAN_PAYMENT_MADE, { 
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
      eventBus.emit(EventTypes.LOAN_OFFER_CREATED, { loan });
      
      return loan;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
      throw error;
    }
  }
}));
