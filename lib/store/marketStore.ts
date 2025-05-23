// Define types for marketplace entities
export interface Listing {
  id: string;
  asset: string;
  assetType?: 'land' | 'building' | 'bridge' | 'compute';
  seller: string;
  price: number;
  createdAt: string;
  status: 'active' | 'cancelled' | 'sold';
}

export interface Offer {
  id: string;
  listingId: string;
  buyer: string;
  price: number;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
}

export interface Transaction {
  id: string;
  type: string;
  asset: string;
  seller: string;
  buyer: string;
  price: number;
  createdAt: string;
  executedAt?: string;
}
