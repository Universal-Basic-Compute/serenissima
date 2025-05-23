export interface Listing {
  id: string;
  asset: string;
  assetType?: 'land' | 'building' | 'bridge' | 'compute';
  seller: string;
  price: number;
  createdAt: string;
  updatedAt?: string;
  status: 'active' | 'cancelled' | 'sold';
  metadata?: {
    historicalName?: string;
    englishName?: string;
    description?: string;
  };
}

export interface Offer {
  id: string;
  listingId: string;
  buyer: string;
  price: number;
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  metadata?: {
    historicalName?: string;
    englishName?: string;
    description?: string;
  };
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
