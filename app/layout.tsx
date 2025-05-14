import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientWalletProvider from "@/components/UI/ClientWalletProvider";
import Compagno from "@/components/UI/Compagno";
import ClientSideEffects from "./client-effects";
import ContextMenuPreventer from "@/components/UI/ContextMenuPreventer";
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
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ClientWalletProvider>
          {children}
          <Compagno />
          <ClientSideEffects />
          <ContextMenuPreventer />
          <script dangerouslySetInnerHTML={{
            __html: `
              // Ensure buildings are always visible
              window.addEventListener('load', function() {
                console.log('Layout: Dispatching ensureBuildingsVisible event on page load');
                window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
                
                // Also set up a periodic check to ensure buildings stay visible
                setInterval(function() {
                  window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
                }, 5000); // Increased frequency to 5 seconds
                
                // Also dispatch the event when switching views
                window.addEventListener('viewChanged', function(e) {
                  console.log('View changed, ensuring buildings are visible');
                  window.dispatchEvent(new CustomEvent('ensureBuildingsVisible'));
                });
              });
            `
          }} />
        </ClientWalletProvider>
      </body>
    </html>
  );
}
