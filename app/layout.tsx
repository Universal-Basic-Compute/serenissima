"use client"; // Make this a Client Component to use usePathname

import { Geist, Geist_Mono } from "next/font/google";
import { usePathname } from "next/navigation"; // Import usePathname
import "./globals.css";
import ClientWalletProvider from "@/components/UI/ClientWalletProvider";
import Compagno from "@/components/UI/Compagno";
import ContextMenuPreventer from "@/components/UI/ContextMenuPreventer";
import { Toaster } from 'react-hot-toast';
// BackgroundMusic sera déplacé vers app/page.tsx
// Add this to ensure buildings are always visible

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const showCompagno = pathname !== "/arrival";

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ClientWalletProvider>
          <Toaster position="top-center" reverseOrder={false} />
          {children}
          {/* BackgroundMusic a été déplacé vers app/page.tsx pour un meilleur contrôle basé sur l'état */}
          {showCompagno && <Compagno />}
          <ContextMenuPreventer />
          <script dangerouslySetInnerHTML={{
            __html: `
              // Ensure buildings are always visible
              window.addEventListener('load', function() {
                console.log('Layout: Dispatching ensureBuildingsVisible event on page load');
                window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
                
                // Create coat of arms directory if needed
                try {
                  // Check if the coat of arms directory exists
                  const checkCoatOfArmsDir = async () => {
                    try {
                      // Create the directory if it doesn't exist
                      await fetch('/api/create-coat-of-arms-dir', { method: 'POST' });
                      
                      // Then check if the default image exists
                      const response = await fetch('https://backend.serenissima.ai/public/assets/images/coat-of-arms/default.png', { method: 'HEAD' });
                      if (!response.ok) {
                        console.warn('Default coat of arms image not found. Using generated avatars instead.');
                      }
                    } catch (e) {
                      console.warn('Error checking coat of arms directory:', e);
                    }
                  };
                  
                  // Run the check
                  checkCoatOfArmsDir();
                } catch (e) {
                  console.error('Error in coat of arms directory check:', e);
                }
                
                // Also set up a periodic check to ensure buildings stay visible
                // Use a debounced version to prevent too many updates
                let lastDispatchTime = 0;
                let isDispatching = false; // Add a flag to prevent overlapping dispatches
                
                const ensureBuildingsVisibleInterval = setInterval(function() {
                  // Only dispatch if the page has been loaded for more than 5 seconds
                  // And at least 30 seconds since last dispatch
                  // And not currently dispatching
                  const now = performance.now();
                  if (document.readyState === 'complete' && 
                      now > 5000 && 
                      now - lastDispatchTime > 30000 &&
                      !isDispatching) {
                    console.log('Layout: Periodic ensureBuildingsVisible check');
                    isDispatching = true;
                    window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
                    lastDispatchTime = now;
                    // Reset the flag after a short delay
                    setTimeout(() => {
                      isDispatching = false;
                    }, 1000);
                  }
                }, 30000); // Keep at 30 seconds
                
                // Clean up interval on page unload
                window.addEventListener('beforeunload', function() {
                  clearInterval(ensureBuildingsVisibleInterval);
                });
                
                // Also dispatch the event when switching views, but with debounce
                let viewChangeTimeout;
                window.addEventListener('viewChanged', function(e) {
                  clearTimeout(viewChangeTimeout);
                  viewChangeTimeout = setTimeout(function() {
                    if (!isDispatching) {
                      console.log('View changed, ensuring buildings are visible');
                      isDispatching = true;
                      window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
                      // Reset the flag after a short delay
                      setTimeout(() => {
                        isDispatching = false;
                      }, 1000);
                    }
                  }, 300); // Debounce for 300ms
                });
                
                // Fix for React 18 double-rendering in development mode
                // This helps prevent invalid hook call errors
                window.__REACT_DEVTOOLS_APPEND_COMPONENT_STACK__ = false;
                window.__REACT_DEVTOOLS_BREAK_ON_CONSOLE_ERRORS__ = false;
                window.__REACT_DEVTOOLS_SHOW_INLINE_WARNINGS_AND_ERRORS__ = false;
              });
            `
          }} />
        </ClientWalletProvider>
      </body>
    </html>
  );
}
