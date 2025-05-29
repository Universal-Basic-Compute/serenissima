interface BuildingFinancialsProps {
  leasePrice?: number | string;
  rentPrice?: number | string;
}

const BuildingFinancials: React.FC<BuildingFinancialsProps> = ({ 
  leasePrice, 
  rentPrice 
}) => {
  if (!leasePrice && !rentPrice) return null;
  
  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Financial Details</h3>

      {leasePrice !== undefined && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700">Lease Amount:</span>
          <span className="font-semibold text-amber-800">
            {typeof leasePrice === 'number' 
              ? `${leasePrice.toLocaleString()} ⚜️ ducats`
              : `${String(leasePrice || '')} ⚜️ ducats`}
          </span>
        </div>
      )}

      {rentPrice !== undefined && (
        <div className="flex justify-between items-center">
          <span className="text-gray-700">Rent Amount:</span>
          <span className="font-semibold text-amber-800">
            {typeof rentPrice === 'number'
              ? `${rentPrice.toLocaleString()} ⚜️ ducats`
              : `${String(rentPrice)} ⚜️ ducats`}
          </span>
        </div>
      )}
    </div>
  );
};

export default BuildingFinancials;
