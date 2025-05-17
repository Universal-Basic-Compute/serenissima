import PlayerProfile from '../../UI/PlayerProfile';

interface BuildingOwnerProps {
  owner: string;
}

const BuildingOwner: React.FC<BuildingOwnerProps> = ({ owner }) => {
  return (
    <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
      <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
      {owner ? (
        <div className="flex items-center justify-center">
          <PlayerProfile 
            username={owner}
            walletAddress={owner}
            size="medium"
            className="mx-auto"
          />
        </div>
      ) : (
        <p className="text-center text-gray-500 italic">No owner information</p>
      )}
    </div>
  );
};

export default BuildingOwner;
