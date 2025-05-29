'use client';

import { useRouter } from 'next/navigation';
import CitizenRegistry from '@/components/UI/CitizenRegistry'; // Import the component

export default function CitizensPage() {
  const router = useRouter();

  const handleCloseRegistry = () => {
    router.push('/'); // Navigate to home page when registry is closed
  };

  // Render the CitizenRegistry directly
  // The CitizenRegistry itself is a modal-like component that will overlay the current page.
  // To make it appear as if it's the only thing on the page, we can render a minimal background
  // or rely on the CitizenRegistry's own styling to cover the screen.
  // For simplicity, we'll render it directly. If a background is needed, it can be added here.
  return (
    <>
      {/* Optional: A minimal background if CitizenRegistry doesn't cover everything or for visual consistency */}
      {/* <div className="h-screen w-screen bg-amber-50 fixed inset-0 -z-10" /> */}
      <CitizenRegistry onClose={handleCloseRegistry} />
    </>
  );
}
