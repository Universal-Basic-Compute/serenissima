import React from 'react';

interface BuildingForServicePanel {
  subCategory: string;
  runBy?: string | null;
  owner?: string | null;
  name?: string;
  type: string;
}

interface PublicConstructionContractData {
  PricePerResource?: number | null;
  price?: number | null;
  Title?: string | null;
  Notes?: string | null;
  isPlaceholder?: boolean;
}

interface ConstructionServicePanelProps {
  building: BuildingForServicePanel;
  publicConstructionContract: PublicConstructionContractData | null;
  isLoadingPublicConstructionContract: boolean;
  currentUsername: string | null;
  contractTitle: string;
  setContractTitle: (title: string) => void;
  contractDescription: string;
  setContractDescription: (description: string) => void;
  constructionRatePercent: number;
  setConstructionRatePercent: (percent: number) => void;
  isUpdatingConstructionRate: boolean;
  handleSetConstructionRate: () => void;
}

const ConstructionServicePanel: React.FC<ConstructionServicePanelProps> = ({
  building,
  publicConstructionContract,
  isLoadingPublicConstructionContract,
  currentUsername,
  contractTitle,
  setContractTitle,
  contractDescription,
  setContractDescription,
  constructionRatePercent,
  setConstructionRatePercent,
  isUpdatingConstructionRate,
  handleSetConstructionRate,
}) => {
  if (!building || building.subCategory !== 'construction') {
    return null;
  }

  const currentRateValue = Number(publicConstructionContract?.PricePerResource ?? publicConstructionContract?.price ?? 1.0);

  const isRateUpdateButtonDisabled =
    isUpdatingConstructionRate ||
    (publicConstructionContract &&
      Math.round(currentRateValue * 100) === constructionRatePercent &&
      !publicConstructionContract.isPlaceholder);

  return (
    <>
      <div className="space-y-4">
      <h4 className="text-lg font-serif text-amber-700">Public Construction Service Rate</h4>
      {isLoadingPublicConstructionContract ? (
        <p className="text-amber-600 italic">Loading construction service details...</p>
      ) : publicConstructionContract ? (
        <>
          <div className="bg-amber-200 p-4 rounded-lg shadow">
            <p className="text-sm text-amber-800">
              Current Rate: <span className="font-bold text-xl">{currentRateValue.toFixed(2)}</span>
              <span className="text-xs"> (Base Cost Multiplier)</span>
            </p>
            <p className="text-xs text-amber-600 italic mt-1">
              This building offers its construction services publicly. The rate is a multiplier of the standard material and labor cost for a given project.
            </p>
            {publicConstructionContract.Title && (
              <p className="text-sm text-amber-800 mt-2">
                <strong>Title:</strong> {publicConstructionContract.Title}
              </p>
            )}
            {publicConstructionContract.Notes && (
              <p className="text-xs text-amber-700 mt-1">
                <strong>Description:</strong> {publicConstructionContract.Notes}
              </p>
            )}

            {(currentUsername === building.runBy || (!building.runBy && currentUsername === building.owner)) && (
              <>
                <div className="mt-4 pt-4 border-t border-amber-300 space-y-3">
                  <div>
                    <label htmlFor="contractTitle" className="block text-sm font-medium text-amber-700">
                      Contract Title:
                    </label>
                    <input
                      type="text"
                      id="contractTitle"
                      value={contractTitle}
                      onChange={(e) => setContractTitle(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 bg-white border border-amber-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                      disabled={isUpdatingConstructionRate}
                    />
                  </div>
                  <div>
                    <label htmlFor="contractDescription" className="block text-sm font-medium text-amber-700">
                      Contract Description (Notes):
                    </label>
                    <textarea
                      id="contractDescription"
                      value={contractDescription}
                      onChange={(e) => setContractDescription(e.target.value)}
                      rows={3}
                      className="mt-1 block w-full px-3 py-2 bg-white border border-amber-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 sm:text-sm"
                      disabled={isUpdatingConstructionRate}
                    />
                  </div>
                  <div>
                    <label htmlFor="constructionRateSlider" className="block text-sm font-medium text-amber-700 mb-1">
                      Set Public Rate ({constructionRatePercent}%):
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        id="constructionRateSlider"
                        type="range"
                        min="0"
                        max="200"
                        value={constructionRatePercent}
                        onChange={(e) => setConstructionRatePercent(parseInt(e.target.value))}
                        className="w-full h-2 bg-amber-300 rounded-lg appearance-none cursor-pointer accent-amber-600"
                        disabled={isUpdatingConstructionRate}
                      />
                      <span className="text-sm font-semibold text-amber-800 w-16 text-right">
                        {(constructionRatePercent / 100).toFixed(2)}x
                      </span>
                    </div>
                    <button
                      onClick={handleSetConstructionRate}
                      disabled={isRateUpdateButtonDisabled}
                      className="mt-3 w-full px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors disabled:bg-gray-400"
                    >
                      {isUpdatingConstructionRate
                        ? 'Updating...'
                        : publicConstructionContract?.isPlaceholder
                        ? 'Set Initial Rate'
                        : 'Update Rate'}
                    </button>
                    {publicConstructionContract?.isPlaceholder && (
                      <p className="text-xs text-amber-500 italic mt-1">
                        No public rate set yet. Defaulting to 1.0x.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-amber-600 italic">Could not load construction service details.</p>
      )}
      </div>
    </>
  );
};

export default ConstructionServicePanel;
