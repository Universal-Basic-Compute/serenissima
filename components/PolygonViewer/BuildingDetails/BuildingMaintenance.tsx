interface BuildingMaintenanceProps {
  maintenanceCost?: number | string;
}

const BuildingMaintenance: React.FC<BuildingMaintenanceProps> = ({ maintenanceCost }) => {
  if (maintenanceCost === undefined) return null;
  
  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Maintenance</h3>
      <div className="flex justify-between items-center bg-amber-50 p-2 rounded-lg">
        <span className="text-gray-700 font-medium">Daily Cost:</span>
        <span className="font-semibold text-amber-800">
          {typeof maintenanceCost === 'number' 
            ? `${maintenanceCost.toLocaleString()} ⚜️ ducats`
            : `${String(maintenanceCost || '')} ⚜️ ducats`}
        </span>
      </div>
    </div>
  );
};

export default BuildingMaintenance;
