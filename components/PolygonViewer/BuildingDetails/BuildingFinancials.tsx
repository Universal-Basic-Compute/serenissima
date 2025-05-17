interface BuildingFinancialsProps {
  leaseAmount?: number | string;
  rentAmount?: number | string;
}

const BuildingFinancials: React.FC<BuildingFinancialsProps> = ({ 
  leaseAmount, 
  rentAmount 
}) => {
  if (!leaseAmount && !rentAmount) return null;
  
  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Financial Details</h3>

      {leaseAmount !== undefined && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700">Lease Amount:</span>
          <span className="font-semibold text-amber-800">
            {typeof leaseAmount === 'number' 
              ? `${leaseAmount.toLocaleString()} ⚜️ ducats`
              : `${String(leaseAmount || '')} ⚜️ ducats`}
          </span>
        </div>
      )}

      {rentAmount !== undefined && (
        <div className="flex justify-between items-center">
          <span className="text-gray-700">Rent Amount:</span>
          <span className="font-semibold text-amber-800">
            {typeof rentAmount === 'number'
              ? `${rentAmount.toLocaleString()} ⚜️ ducats`
              : `${String(rentAmount)} ⚜️ ducats`}
          </span>
        </div>
      )}
    </div>
  );
};

export default BuildingFinancials;
