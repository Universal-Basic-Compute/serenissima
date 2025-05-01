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
