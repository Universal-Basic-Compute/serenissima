import React, { useState, useEffect } from 'react';
import ResourceDropdown from './ResourceDropdown';

// Mock data - this would eventually come from your resource service
const resourceCategories = [
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

const ResourceDropdowns: React.FC = () => {
  // In the future, you would fetch this data from your resource service
  const [categories, setCategories] = useState(resourceCategories);
  
  // This would be replaced with actual data fetching
  useEffect(() => {
    // Simulate fetching updated resource amounts
    const fetchResourceAmounts = () => {
      // This is where you would call your API or service
      console.log('Fetching resource amounts...');
    };
    
    fetchResourceAmounts();
    
    // Refresh periodically (every 30 seconds)
    const intervalId = setInterval(fetchResourceAmounts, 30000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map(category => (
        <ResourceDropdown 
          key={category.id}
          category={category.id}
          icon={category.icon}
          resources={category.resources}
        />
      ))}
    </div>
  );
};

export default ResourceDropdowns;
