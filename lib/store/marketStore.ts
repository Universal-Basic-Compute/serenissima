export interface Listing {
  id: string;
  assetId: string;
  assetType: string;
  seller: string;
  price: number;
  status: 'active' | 'cancelled' | 'completed';
  createdAt: string;
}

export interface Offer {
  id: string;
  listingId: string;
  buyer: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: string;
  asset_id?: string;
  assetId: string;
  price: number;
  seller: string | null;
  buyer: string | null;
  created_at?: string;
  executed_at?: string | null;
  createdAt: string;
  executedAt: string | null;
  historical_name?: string;
  historicalName?: string;
}
