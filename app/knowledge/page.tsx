'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Add custom window interface to handle our custom properties
declare global {
  interface Window {
    __isClientNavigation?: boolean;
    __directNavigation?: boolean;
    __knowledgeDirectNavigation?: boolean; // Add this new property
  }
}

export default function KnowledgePage() {
  const router = useRouter();
  
  // Instead of redirecting, check if we're in a client-side navigation
  useEffect(() => {
    // If this is a direct page load (not client navigation)
    if (typeof window !== 'undefined' && window.location.pathname === '/knowledge' && !window.__isClientNavigation) {
      // Set a flag to indicate this was a direct navigation
      window.__directNavigation = true;
      // Set a specific flag for knowledge page
      window.__knowledgeDirectNavigation = true;
      // Remove the shallow option as it's not supported in Next.js App Router
      router.push('/');
    }
  }, [router]);
  
  // Return empty div while redirecting
  return <div></div>;
}
