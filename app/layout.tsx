"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { useEffect } from "react";

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
        message.includes('Map or Google Maps API not ready')
      ) {
        return;
      }
      
      originalConsoleLog(...args);
    };
    
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
    };
  }, []);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
