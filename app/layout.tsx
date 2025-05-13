import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/UI/WalletProvider";
import Compagno from "@/components/UI/Compagno";
import ClientSideEffects from "./client-effects";

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
        <WalletProvider>
          {children}
          <Compagno />
          <ClientSideEffects />
        </WalletProvider>
      </body>
    </html>
  );
}
