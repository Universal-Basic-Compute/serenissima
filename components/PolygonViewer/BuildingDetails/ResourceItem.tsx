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
    if (!resource.icon && resource.resourceType) {
      // Fallback: resource.icon is falsy, use resource.resourceType
      const baseResourceType = resource.resourceType.toLowerCase().replace(/\s+/g, '_').replace(/\.png$/, '');
      return `/images/resources/${baseResourceType}.png`; // e.g. /images/resources/stone_block.png
    } else if (!resource.icon) {
      // If both icon and resourceType are missing, use default
      return '/images/resources/default.png';
    }
    
    // resource.icon is truthy
    if (resource.icon.startsWith('/')) { 
      return resource.icon; // e.g. /images/custom/my_icon.png or /already_absolute_path.png
    }
    
    // resource.icon is relative, e.g., "foo.png" or "resources/foo.png" or "Iron Ore" or "Iron Ore.png"
    // Remove .png suffix for consistent processing before re-adding it.
    const baseIconString = resource.icon.replace(/\.png$/, ''); // "foo" or "resources/foo" or "Iron Ore"
    
    if (baseIconString.startsWith('resources/')) { // e.g. icon was "resources/foo.png" -> baseIconString is "resources/foo"
      return `/images/${baseIconString}.png`; // -> /images/resources/foo.png
    } else if (!baseIconString.includes('/')) { // e.g. icon was "foo.png" or "Iron Ore" or "Iron Ore.png"
      // Sanitize simple names: lowercase and replace spaces with underscores.
      const sanitizedBaseIcon = baseIconString.toLowerCase().replace(/\s+/g, '_'); // "foo" or "iron_ore"
      return `/images/resources/${sanitizedBaseIcon}.png`; // -> /images/resources/foo.png or /images/resources/iron_ore.png
    } else { 
      // e.g. icon was "category/foo.png" -> baseIconString is "category/foo"
      // Assumes if resource.icon contains '/', it's a well-formed relative path fragment.
      return `/images/${baseIconString}.png`; // -> /images/category/foo.png
    }
  };

  // Handle click on resource item
  const handleResourceClick = () => {
    if (type === 'sell' || type === 'buy') {
      // Dispatch event to filter contracts by this resource type
      window.dispatchEvent(new CustomEvent('filterContractsByResource', {
        detail: { resourceType: resource.resourceType }
      }));
      
      // Also switch to contracts view
      window.dispatchEvent(new CustomEvent('viewChanged', { 
        detail: { view: 'contracts' }
      }));
    }
  };

  return (
    <div 
      className={`flex items-center ${getBgColor()} p-2 rounded-md cursor-pointer hover:brightness-95 transition-all`} 
      title={resource.description || resource.name}
      onClick={handleResourceClick}
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
            const currentSrc = (e.target as HTMLImageElement).src;
            console.error(`Failed to load resource image: ${currentSrc}. Falling back to default.`);
            (e.target as HTMLImageElement).src = '/images/resources/default.png';
            // Prevent infinite loops if default.png also fails by removing the onerror handler.
            (e.target as HTMLImageElement).onerror = null; 
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
