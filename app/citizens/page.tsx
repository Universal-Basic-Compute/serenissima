'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CitizensPage() {
  const router = useRouter();
  
  useEffect(() => {
    // Set a flag to indicate this was a direct navigation to /citizens
    if (typeof window !== 'undefined') {
      window.__directNavigation = true;
      
      // Navigate to the main page, which will detect the flag and open citizens view
      router.push('/');
    }
  }, [router]);
  
  // Return a loading state while redirecting
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-amber-50">
      <div className="text-center">
        <h1 className="text-2xl font-serif text-amber-800 mb-4">Loading Citizens View...</h1>
        <div className="w-16 h-16 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    </div>
  );
}
