import React from 'react';
import { Polygon } from './types';
import PlayerProfile from '../UI/PlayerProfile';
import ActionButton from '../UI/ActionButton';
import AnimatedDucats from '../UI/AnimatedDucats';

interface LandMarketColumnProps {
  selectedPolygonId: string | null;
  selectedPolygon: Polygon | null;
  ownerDetails: any | null;
  owner: string | null; // dynamicOwner
  isLoading: boolean; // market data loading
  landListingByOwner: any | null;
  myLandListing: any | null;
  incomingBuyOffers: any[];
  myBuyOffer: any | null;
  isOwner: boolean;
  isAvailableFromState: boolean;
  currentCitizenUsername: string | null;
  handleGenericActivity: (activityType: string, parameters: Record<string, any>) => Promise<void>;
  showOfferInput: boolean;
  setShowOfferInput: (show: boolean) => void;
  offerAmount: number;
  setOfferAmount: (amount: number) => void;
  setShowListForSaleModal: (show: boolean) => void;
  normalizeIdentifier: (id: string | null | undefined) => string | null; // Pass normalizeIdentifier
}

const LandMarketColumn: React.FC<LandMarketColumnProps> = ({
  selectedPolygonId,
  selectedPolygon,
  ownerDetails,
  owner,
  isLoading,
  landListingByOwner,
  myLandListing,
  incomingBuyOffers,
  myBuyOffer,
  isOwner,
  isAvailableFromState,
  currentCitizenUsername,
  handleGenericActivity,
  showOfferInput,
  setShowOfferInput,
  offerAmount,
  setOfferAmount,
  setShowListForSaleModal,
  normalizeIdentifier,
}) => {

  const renderActivities = (contract: any, title: string) => {
    if (!contract || contract.isLoadingActivities === true) {
      return <p className="text-xs text-gray-500 italic mt-1">{title}: Loading actions...</p>;
    }
    if (!contract.activities || contract.activities.length === 0) {
      // Optionally, you can choose to render nothing if there are no activities,
      // instead of "No associated actions."
      // return null; 
      return <p className="text-xs text-gray-500 italic mt-1">{title}: No associated actions.</p>;
    }
    return (
      <div className="mt-2">
        <h5 className="text-xs font-semibold text-gray-600 mb-1">{title}:</h5>
        <ul className="space-y-1 text-xs">
          {contract.activities.map((activity: any) => (
            <li key={activity.id || activity.activityId} className="text-gray-700">
              - {activity.type} by {activity.citizen} ({activity.status})
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="flex flex-col space-y-3 overflow-y-auto custom-scrollbar pr-1 h-full"> {/* Ensure full height for scrolling */}
      {/* Owner information */}
      <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200">
        <div className="bg-white rounded-lg p-4 shadow-md border border-amber-200">
          <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Owner</h3>
          {owner && owner !== "" ? (
            <div className="flex items-center justify-center">
              <PlayerProfile 
                username={ownerDetails?.username || owner}
                firstName={ownerDetails?.firstName}
                lastName={ownerDetails?.lastName}
                coatOfArmsImageUrl={ownerDetails?.username ? `https://backend.serenissima.ai/public_assets/images/coat-of-arms/${ownerDetails.username}.png` : undefined}
                familyMotto={ownerDetails?.familyMotto}
                walletAddress={ownerDetails?.walletAddress || owner}
                Ducats={ownerDetails?.ducats}
                size="medium"
                className="mx-auto"
              />
            </div>
          ) : (
            <div className="bg-amber-100 p-3 rounded-lg text-center">
              <p className="font-semibold text-amber-800">Available for Purchase</p>
              <p className="text-xs text-amber-600 mt-1">This land has no current owner</p>
            </div>
          )}
        </div>
      
        {/* Market Status & Actions */}
        <div className="bg-white rounded-lg p-3 shadow-sm border border-amber-200 space-y-3 mt-3"> {/* Added mt-3 for spacing */}
          <h3 className="text-sm uppercase font-medium text-amber-600 mb-2">Market Status</h3>

          {isLoading && <p className="text-xs text-amber-700">Loading market data...</p>}

          {/* Case 1: Land is listed for sale by the owner */}
          {landListingByOwner && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-lg font-semibold text-amber-800">
                For Sale by {landListingByOwner.SellerName || landListingByOwner.Seller}
              </p>
              <p className="text-2xl font-semibold text-center my-2">
                <span style={{ color: '#d4af37' }}>
                  <AnimatedDucats 
                    value={landListingByOwner.PricePerResource} 
                    suffix="⚜️ ducats" 
                    duration={1500}
                  />
                </span>
              </p>
              {!isOwner && currentCitizenUsername && normalizeIdentifier(landListingByOwner.Seller) !== normalizeIdentifier(currentCitizenUsername) && (
                <ActionButton
                  onClick={() => handleGenericActivity('buy_listed_land', { contractId: landListingByOwner.contractId || landListingByOwner.id, landId: selectedPolygonId, price: landListingByOwner.PricePerResource })}
                  variant="primary"
                  className="w-full mt-2"
                >
                  Buy Now at {landListingByOwner.PricePerResource.toLocaleString()} ⚜️
                </ActionButton>
              )}
              {isOwner && normalizeIdentifier(landListingByOwner.Seller) === normalizeIdentifier(currentCitizenUsername) && (
                 <ActionButton
                  onClick={() => handleGenericActivity('cancel_land_listing', { contractId: landListingByOwner.id, landId: selectedPolygonId })}
                  variant="danger"
                  className="w-full mt-2"
                >
                  Cancel Your Listing
                </ActionButton>
              )}
              {renderActivities(landListingByOwner, "Actions on this Listing")}
            </div>
          )}

          {/* Case 2: Current citizen is owner and land is NOT listed by them */}
          {isOwner && !myLandListing && (
            <ActionButton
              onClick={() => setShowListForSaleModal(true)}
              variant="primary"
              className="w-full"
            >
              List Your Land for Sale
            </ActionButton>
          )}
          
          {/* Case 3: Land is unowned (available from state) */}
          {isAvailableFromState && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                  <p className="text-lg font-semibold text-green-800">Available from the Republic</p>
                  <p className="text-xl text-green-700 my-1">Price: 10,000 ⚜️ ducats</p> 
                  <ActionButton
                      onClick={() => handleGenericActivity('buy_available_land', { landId: selectedPolygonId, expectedPrice: 10000, targetBuildingId: "town_hall_default" })}
                      variant="primary"
                      className="w-full mt-2"
                  >
                      Acquire from Republic
                  </ActionButton>
              </div>
          )}

          {/* Display Incoming Buy Offers */}
          {isOwner && incomingBuyOffers.length > 0 && (
            <div className="mt-4">
              <h4 className="text-md font-semibold text-amber-700 mb-2">Incoming Offers to Buy:</h4>
              {incomingBuyOffers.map(offer => (
                <div key={offer.id} className="p-3 mb-2 rounded-lg bg-rose-50 border border-rose-200">
                  <p>Offer from: {offer.BuyerName || offer.Buyer}</p>
                  <p>Amount: {offer.PricePerResource.toLocaleString()} ⚜️ ducats</p>
                  <ActionButton
                    onClick={() => handleGenericActivity('accept_land_offer', { contractId: offer.id, landId: selectedPolygonId })}
                    variant="primary"
                    className="w-full mt-1"
                  >
                    Accept Offer
                  </ActionButton>
                  {renderActivities(offer, "Actions on this Offer")}
                </div>
              ))}
            </div>
          )}

          {/* Display Current Citizen's Buy Offer */}
          {myBuyOffer && !isOwner && (
            <div className="mt-4 p-3 rounded-lg bg-purple-50 border border-purple-200">
              <h4 className="text-md font-semibold text-purple-700 mb-1">Your Offer to Buy:</h4>
              <p>Amount: {myBuyOffer.PricePerResource.toLocaleString()} ⚜️ ducats</p>
              <ActionButton
                onClick={() => handleGenericActivity('cancel_land_offer', { contractId: myBuyOffer.id, landId: selectedPolygonId })}
                variant="danger"
                className="w-full mt-1"
              >
                Cancel Your Offer
              </ActionButton>
              {renderActivities(myBuyOffer, "Actions on Your Offer")}
            </div>
          )}
          
          {/* "Make an Offer" input/button */}
          {/* Condition changed: removed !landListingByOwner to allow making offers even if land is listed */}
          {currentCitizenUsername && !isOwner && !myBuyOffer && !isAvailableFromState && (
            showOfferInput ? (
              <div className="flex flex-col w-full space-y-3 mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label htmlFor="offerRange" className="block text-sm font-medium text-gray-700">
                  Your Offer: <span className="font-semibold text-amber-700">{offerAmount.toLocaleString()} ⚜️</span>
                </label>
                <input
                  id="offerRange"
                  type="range"
                  min="200000"
                  max="20000000"
                  step="50000"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>200k ⚜️</span>
                  <span>20M ⚜️</span>
                </div>
                <div className="flex space-x-2 mt-2">
                  <ActionButton
                    onClick={() => {
                      if (offerAmount < 200000) { // Ensure offer is within valid range
                        alert('Please enter a valid offer amount (min 200,000 ⚜️).');
                        return;
                      }
                      handleGenericActivity('make_offer_for_land', { 
                        landId: selectedPolygonId, 
                        offerPrice: offerAmount, 
                        sellerUsername: owner // This is dynamicOwner, the current land owner
                      });
                    }}
                    variant="primary"
                    disabled={isLoading}
                    className="flex-grow"
                  >
                    Submit Offer
                  </ActionButton>
                  <ActionButton onClick={() => setShowOfferInput(false)} variant="secondary" disabled={isLoading}>
                    Cancel
                  </ActionButton>
                </div>
              </div>
            ) : (
              <ActionButton
                onClick={() => setShowOfferInput(true)}
                variant="primary"
                className="w-full mt-2"
                disabled={isLoading}
              >
                Make an Offer to Purchase
              </ActionButton>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default LandMarketColumn;
