import Image from 'next/image';

interface ResourceItemProps {
  resource: {
    resourceType: string;
    name: string;
    category?: string;
    amount?: number;
    count?: number;
    icon?: string;
    description?: string;
    price?: number;
    hourlyAmount?: number;
    transporter?: string;
  };
  type?: 'sell' | 'buy' | 'store' | 'inventory' | 'contract';
}

const ResourceItem: React.FC<ResourceItemProps> = ({ resource, type = 'store' }) => {
  // Determine background color based on type
  const getBgColor = () => {
    switch (type) {
      case 'sell': return 'bg-green-50';
      case 'buy': return 'bg-blue-50';
      case 'store': return 'bg-amber-50';
      case 'inventory': return 'bg-purple-50';
      case 'contract': return 'bg-green-50';
      default: return 'bg-gray-50';
    }
  };

  // Get icon path
  const getIconPath = () => {
    if (!resource.icon) {
      return `/images/resources/${resource.resourceType.toLowerCase().replace(/\s+/g, '_')}.png`;
    }
    
    if (resource.icon.startsWith('/')) {
      return resource.icon;
    }
    
    return `/images/resources/${resource.icon}`;
  };

  return (
    <div 
      className={`flex items-center ${getBgColor()} p-2 rounded-md`} 
      title={resource.description || resource.name}
    >
      <div className="relative w-8 h-8 mr-2">
        <Image 
          src={getIconPath()}
          alt={resource.name}
          width={32}
          height={32}
          className="object-contain"
          loading="lazy"
          unoptimized={true}
          onError={(e) => {
            // Fallback to a default icon if the image fails to load
            (e.target as HTMLImageElement).src = '/images/resources/default.png';
          }}
        />
      </div>
      
      <div className="flex-1">
        <span className="text-sm text-gray-700 capitalize">{resource.name}</span>
        
        {/* Show amount for buy type */}
        {type === 'buy' && resource.amount && (
          <span className="text-xs text-gray-500 ml-2">x{resource.amount}</span>
        )}
        
        {/* Show count for inventory type */}
        {type === 'inventory' && resource.count && (
          <span className="text-sm font-medium text-purple-700 ml-2">{resource.count} units</span>
        )}
      </div>
    </div>
  );
};

export default ResourceItem;
