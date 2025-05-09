export interface Resource {
  id: string;
  name: string;
  icon: string;
  amount: number;
  category: string;
}

export interface ResourceCategory {
  id: string;
  name: string;
  icon: string;
  resources: Resource[];
}

export class ResourceService {
  private static instance: ResourceService;
  
  public static getInstance(): ResourceService {
    if (!ResourceService.instance) {
      ResourceService.instance = new ResourceService();
    }
    return ResourceService.instance;
  }
  
  public async getResourceCategories(): Promise<ResourceCategory[]> {
    // In the future, this would fetch from your API
    // For now, return mock data
    return [
      {
        id: 'raw_materials',
        name: 'Raw Materials',
        icon: '/images/icons/raw_materials.png',
        resources: [
          { id: 'wood', name: 'Wood', icon: '/images/resources/wood.png', amount: 0, category: 'raw_materials' },
          { id: 'stone', name: 'Stone', icon: '/images/resources/stone.png', amount: 0, category: 'raw_materials' },
          { id: 'iron_ore', name: 'Iron Ore', icon: '/images/resources/iron_ore.png', amount: 0, category: 'raw_materials' },
          { id: 'clay', name: 'Clay', icon: '/images/resources/clay.png', amount: 0, category: 'raw_materials' },
          { id: 'sand', name: 'Sand', icon: '/images/resources/sand.png', amount: 0, category: 'raw_materials' }
        ]
      },
      {
        id: 'processed_materials',
        name: 'Processed Materials',
        icon: '/images/icons/processed_materials.png',
        resources: [
          { id: 'planks', name: 'Planks', icon: '/images/resources/planks.png', amount: 0, category: 'processed_materials' },
          { id: 'bricks', name: 'Bricks', icon: '/images/resources/bricks.png', amount: 0, category: 'processed_materials' },
          { id: 'iron', name: 'Iron', icon: '/images/resources/iron.png', amount: 0, category: 'processed_materials' },
          { id: 'glass', name: 'Glass', icon: '/images/resources/glass.png', amount: 0, category: 'processed_materials' }
        ]
      },
      {
        id: 'luxury_goods',
        name: 'Luxury Goods',
        icon: '/images/icons/luxury_goods.png',
        resources: [
          { id: 'silk', name: 'Silk', icon: '/images/resources/silk.png', amount: 0, category: 'luxury_goods' },
          { id: 'spices', name: 'Spices', icon: '/images/resources/spices.png', amount: 0, category: 'luxury_goods' },
          { id: 'jewelry', name: 'Jewelry', icon: '/images/resources/jewelry.png', amount: 0, category: 'luxury_goods' },
          { id: 'fine_glass', name: 'Fine Glass', icon: '/images/resources/fine_glass.png', amount: 0, category: 'luxury_goods' }
        ]
      },
      {
        id: 'food',
        name: 'Food',
        icon: '/images/icons/food.png',
        resources: [
          { id: 'fish', name: 'Fish', icon: '/images/resources/fish.png', amount: 0, category: 'food' },
          { id: 'bread', name: 'Bread', icon: '/images/resources/bread.png', amount: 0, category: 'food' },
          { id: 'wine', name: 'Wine', icon: '/images/resources/wine.png', amount: 0, category: 'food' },
          { id: 'olive_oil', name: 'Olive Oil', icon: '/images/resources/olive_oil.png', amount: 0, category: 'food' }
        ]
      }
    ];
  }
  
  public async getResourceAmount(resourceId: string): Promise<number> {
    // This would fetch the current amount of a specific resource
    // For now, return 0
    return 0;
  }
  
  public async updateResourceAmount(resourceId: string, amount: number): Promise<void> {
    // This would update the amount of a resource
    console.log(`Updating resource ${resourceId} to amount ${amount}`);
  }
}
