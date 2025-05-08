'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function KnowledgePage() {
  const router = useRouter();
  
  // Redirect to main page with knowledge panel
  useEffect(() => {
    router.push('/', { shallow: true });
  }, [router]);
  
  // Return empty div while redirecting
  return <div></div>;
}
