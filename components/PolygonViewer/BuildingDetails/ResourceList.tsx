import { FaStore, FaBox, FaWarehouse } from 'react-icons/fa';
import ResourceItem from './ResourceItem';

interface ResourceListProps {
  title: string;
  resources: any[];
  type: 'sell' | 'buy' | 'store' | 'inventory';
  icon?: React.ReactNode;
  storageCapacity?: number;
}

const ResourceList: React.FC<ResourceListProps> = ({ 
  title, 
  resources, 
  type,
  icon,
  storageCapacity
}) => {
  if (!resources || resources.length === 0) return null;

  // Determine icon based on type if not provided
  const getIcon = () => {
    if (icon) return icon;
    
    switch (type) {
      case 'sell': return <FaStore className="mr-2" />;
      case 'buy': return <FaBox className="mr-2 transform rotate-180" />;
      case 'store': return <FaWarehouse className="mr-2" />;
      case 'inventory': return <FaBox className="mr-2" />;
      default: return null;
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2 flex items-center">
        {getIcon()} {title}
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {resources.map((resource, index) => (
          <ResourceItem 
            key={`${type}-${resource.resourceType || resource.type}-${index}`} 
            resource={resource} 
            type={type} 
          />
        ))}
      </div>
      
      {type === 'store' && storageCapacity && storageCapacity > 0 && (
        <div className="mt-2 text-sm text-gray-700">
          <span className="font-medium">Total Capacity:</span> {storageCapacity} units
        </div>
      )}
    </div>
  );
};

export default ResourceList;
