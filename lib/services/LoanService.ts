// Define the loan data model
export interface LoanData {
  id: string;
  name: string;
  borrower: string;
  lender: string;
  status: LoanStatus;
  principalAmount: number;
  interestRate: number;
  termDays: number;
  paymentAmount: number;
  remainingBalance: number;
  createdAt: string;
  updatedAt: string;
  finalPaymentDate: string;
  requirementsText: string;
  applicationText: string;
  loanPurpose: LoanPurpose;
  notes: string;
}

// Define loan status enum
export enum LoanStatus {
  AVAILABLE = 'available',
  PENDING = 'pending',
  ACTIVE = 'active',
  PAID = 'paid',
  DEFAULTED = 'defaulted',
  REJECTED = 'rejected'
}

// Define loan purpose enum
export enum LoanPurpose {
  BUILDING_CONSTRUCTION = 'building_construction',
  TRADE_VENTURE = 'trade_venture',
  LAND_PURCHASE = 'land_purchase',
  DEBT_CONSOLIDATION = 'debt_consolidation',
  OTHER = 'other'
}

import { getBackendBaseUrl } from '@/lib/utils/apiUtils';

export class LoanService {
  private static instance: LoanService;
  private loans: LoanData[] = [];
  private loading: boolean = false;
  private error: string | null = null;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): LoanService {
    if (!LoanService.instance) {
      LoanService.instance = new LoanService();
    }
    return LoanService.instance;
  }
  
  /**
   * Load all available loans
   */
  public async loadAvailableLoans(): Promise<LoanData[]> {
    this.loading = true;
    this.error = null;
    
    console.log('LoanService: Loading available loans...');
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/loans/available`);
      
      console.log('LoanService: API response status:', response.status);
      
      if (!response.ok) {
        console.error('LoanService: Failed to load loans:', response.status, response.statusText);
        throw new Error(`Failed to load loans: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('LoanService: Received loan data:', data);
      console.log('LoanService: Number of loans received:', Array.isArray(data) ? data.length : 'Not an array');
      this.loans = data;
      return data;
    } catch (error) {
      console.error('LoanService: Error in loadAvailableLoans:', error);
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Get active loans for a citizen
   */
  public async getCitizenLoans(citizenId: string): Promise<LoanData[]> {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/loans/citizen/${citizenId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load citizen loans: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Apply for a loan
   */
  public async applyForLoan(loanApplication: {
    loanId?: string;
    borrower: string;
    principalAmount: number;
    loanPurpose: LoanPurpose;
    applicationText: string;
  }): Promise<LoanData & { autoApproved?: boolean }> {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/loans/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loanApplication),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to apply for loan: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Make a payment on a loan
   */
  public async makePayment(loanId: string, amount: number): Promise<LoanData> {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/loans/${loanId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to make payment: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Create a loan offer (for lenders)
   */
  public async createLoanOffer(loanOffer: {
    name: string;
    lender: string;
    principalAmount: number;
    interestRate: number;
    termDays: number;
    requirementsText: string;
    loanPurpose?: LoanPurpose;
  }): Promise<LoanData> {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/loans/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loanOffer),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create loan offer: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Calculate loan details (payment amount, total interest, etc.)
   */
  public calculateLoanDetails(principal: number, interestRate: number, termDays: number): {
    paymentAmount: number;
    totalInterest: number;
    totalPayment: number;
    dailyPayment: number;
  } {
    // Simple interest calculation
    const interestDecimal = interestRate / 100;
    const totalInterest = principal * interestDecimal * (termDays / 365);
    const totalPayment = principal + totalInterest;
    const dailyPayment = totalPayment / termDays;
    
    return {
      paymentAmount: totalPayment,
      totalInterest,
      totalPayment,
      dailyPayment
    };
  }
}
