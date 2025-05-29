'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

declare global {
  interface Window {
    __isClientNavigation?: boolean;
    __directNavigation?: boolean;
  }
}

export default function GuildsPage() {
  const router = useRouter();
  
  // Instead of redirecting, check if we're in a client-side navigation
  useEffect(() => {
    // If this is a direct page load (not client navigation)
    if (typeof window !== 'undefined' && window.location.pathname === '/guilds' && !window.__isClientNavigation) {
      // Set a flag to indicate this was a direct navigation
      window.__directNavigation = true;
      router.push('/');
    }
  }, [router]);
  
  return null;
}
