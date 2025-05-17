import PlayerProfile from '../../UI/PlayerProfile';

interface BuildingOccupantProps {
  occupant: string;
}

const BuildingOccupant: React.FC<BuildingOccupantProps> = ({ occupant }) => {
  if (!occupant) return null;
  
  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Occupant</h3>
      <div className="flex items-center justify-center">
        <PlayerProfile 
          username={occupant}
          walletAddress={occupant}
          size="medium"
          className="mx-auto"
        />
      </div>
    </div>
  );
};

export default BuildingOccupant;
