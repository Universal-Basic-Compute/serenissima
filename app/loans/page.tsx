'use client';

import { useRouter } from 'next/navigation';
import { LoanMarketplace, LoanManagementDashboard } from '@/components/Loans';
import { FaTimes } from 'react-icons/fa';

export default function LoansPage() {
  const router = useRouter();
  
  // Instead of redirecting, render the loans panel directly
  return (
    <div className="absolute inset-0 bg-black/80 z-50 overflow-auto">
      <div className="bg-amber-50 border-2 border-amber-700 rounded-lg p-6 max-w-6xl mx-auto my-20">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-serif text-amber-800">
            Loans & Banking
          </h2>
          <button 
            onClick={() => router.push('/')}
            className="text-amber-600 hover:text-amber-800 p-2"
            aria-label="Return to main view"
          >
            <FaTimes />
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
