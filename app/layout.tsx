import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientWalletProvider from "@/components/UI/ClientWalletProvider";
import Compagno from "@/components/UI/Compagno";
import ClientSideEffects from "./client-effects";
import { useEffect } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Create a client component to handle the context menu prevention
function ContextMenuPreventer() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    
    // Add the event listener to the document
    document.addEventListener('contextmenu', handleContextMenu);
    
    // Clean up the event listener when the component unmounts
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
  
  return null;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ClientWalletProvider>
          {children}
          <Compagno />
          <ClientSideEffects />
          <ContextMenuPreventer />
        </ClientWalletProvider>
      </body>
    </html>
  );
}
