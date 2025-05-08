'use client';

import { useRouter } from 'next/navigation';
import { LoanMarketplace, LoanManagementDashboard } from '@/components/Loans';

export default function LoansPage() {
  const router = useRouter();
  
  return (
    <div className="absolute top-20 left-20 right-4 bottom-4 bg-black/30 rounded-lg p-4 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Loans & Banking
          </h2>
          <button 
            onClick={() => router.push('/')}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Return to main view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-8">
          <LoanMarketplace />
          <LoanManagementDashboard />
        </div>
      </div>
    </div>
  );
}
