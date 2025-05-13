export interface Building {
  name: string;
  category: string;
  subcategory: string;
  tier: number;
  size: string;
  unlockCondition: string;
  shortDescription: string;
  fullDescription: string;
  flavorText: string;
  constructionCosts: {
    ducats: number;
    [key: string]: number;
  };
  maintenanceCost: number;
  constructionTime: number;
  id?: string;
  thumbnail?: string;
  era?: string;
  variant?: string;
  type?: string; // Added to fix TypeScript error in useBuildingMenu.ts
}

export interface BuildingCategory {
  name: string;
  buildings: Building[];
}
