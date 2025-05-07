export interface Transaction {
  id: string;
  type: string;
  asset_id: string;
  price: number;
  seller: string | null;
  buyer: string | null;
  created_at: string;
  executed_at: string | null;
  historical_name?: string;
  assetId: string;
  executedAt: string;
}
