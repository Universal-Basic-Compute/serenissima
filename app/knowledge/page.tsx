'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function KnowledgePage() {
  const router = useRouter();
  
  // Instead of redirecting, check if we're in a client-side navigation
  useEffect(() => {
    // If this is a direct page load (not client navigation)
    if (typeof window !== 'undefined' && window.location.pathname === '/knowledge' && !window.__isClientNavigation) {
      // Set a flag to indicate this was a direct navigation
      window.__directNavigation = true;
      router.push('/', { shallow: true });
    }
  }, [router]);
  
  // Return empty div while redirecting
  return <div></div>;
}
