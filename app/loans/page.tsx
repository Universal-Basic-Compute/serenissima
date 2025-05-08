'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoansPage() {
  const router = useRouter();
  
  // Redirect to main page with loans panel
  useEffect(() => {
    router.push('/', { shallow: true });
  }, [router]);
  
  // Return empty div while redirecting
  return <div></div>;
}
