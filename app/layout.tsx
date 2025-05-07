"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { useEffect } from "react";
import { WalletProvider } from "@/components/UI/WalletProvider";
import Compagno from "@/components/UI/Compagno"; // Add this import

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
  useEffect(() => {
    // Silence non-essential console logs in development
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      const message = args[0]?.toString() || '';
      
      // Filter out specific messages
      if (
        message.includes('Camera position changed') ||
        message.includes('Map or Google Maps API not ready') ||
        message.includes('Ensuring visibility of') ||
        message.includes('Ensuring all polygons remain visible')
      ) {
        return;
      }
      
      originalConsoleLog(...args);
    };
    
    // Add error handler for unhandled errors
    const handleError = (event: ErrorEvent) => {
      console.error('Unhandled error:', event.error || event.message);
      // Log to analytics or monitoring service if available
    };
    
    // Add error handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      // Log to analytics or monitoring service if available
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // Register service worker for offline support
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Wait until the page is fully loaded
      window.addEventListener('load', async () => {
        try {
          // Unregister any existing service workers first
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
            console.log('Service Worker unregistered');
          }
          
          // Register the new service worker
          const registration = await navigator.serviceWorker.register('/service-worker.js');
          console.log('Service Worker registered with scope:', registration.scope);
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      });
    }
    
    return () => {
      // Restore original console.log when component unmounts
      console.log = originalConsoleLog;
      
      // Remove event listeners
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletProvider>
          {children}
          <Compagno /> {/* Add Compagno component here */}
        </WalletProvider>
      </body>
    </html>
  );
}
