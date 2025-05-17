interface BuildingDescriptionProps {
  fullDescription?: string;
  createdAt?: string;
  createdBy?: string;
}

const BuildingDescription: React.FC<BuildingDescriptionProps> = ({
  fullDescription,
  createdAt,
  createdBy
}) => {
  if (!fullDescription && !createdAt && !createdBy) return null;
  
  // Function to adjust date by subtracting 500 years
  const adjustDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      date.setFullYear(date.getFullYear() - 500);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error adjusting date:', error);
      return 'Unknown date';
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-3">Detailed Information</h3>

      {fullDescription && (
        <div className="text-sm text-gray-700 border-t border-amber-200 pt-3">
          <p className="whitespace-pre-line">{fullDescription}</p>
        </div>
      )}

      {/* Creation details */}
      {(createdAt || createdBy) && (
        <div className="mt-4 pt-3 border-t border-amber-100">
          <h4 className="font-medium text-amber-700 mb-2">Creation Details</h4>
          <div className="text-xs">
            {createdAt && (
              <p className="text-gray-700">
                Created: <span className="font-medium">
                  {adjustDate(createdAt)}
                </span>
              </p>
            )}
            {createdBy && (
              <p className="text-gray-700 mt-1">
                Created by: <span className="font-medium">{createdBy}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildingDescription;
