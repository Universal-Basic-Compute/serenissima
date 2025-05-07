/**
 * Type definitions for Phantom wallet
 */

interface PhantomProvider {
  isPhantom: boolean;
  connect: () => Promise<{ publicKey: string }>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
  signMessage: (message: Uint8Array) => Promise<{ signature: Uint8Array }>;
}

interface Window {
  solana?: PhantomProvider;
}
