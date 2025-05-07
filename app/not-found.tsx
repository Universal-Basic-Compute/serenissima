'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function NotFound() {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = '/';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg border-2 border-amber-600">
        <h1 className="text-3xl font-serif text-amber-800 mb-4 text-center">Page Not Found</h1>
        
        <div className="my-6 p-4 bg-amber-100 rounded-lg border border-amber-300">
          <p className="text-amber-800 text-center">
            The Council of Ten has no record of this location in La Serenissima.
          </p>
        </div>
        
        <p className="text-gray-600 mb-6 text-center">
          Redirecting to the main square in {countdown} seconds...
        </p>
        
        <div className="flex justify-center">
          <Link 
            href="/"
            className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            Return to Venice
          </Link>
        </div>
      </div>
    </div>
  );
}
