import React, { useState } from 'react';
import { FaGavel, FaTimes, FaEdit, FaTrash } from 'react-icons/fa';

interface Bid {
  id: string; // Airtable record ID
  contractId: string; // Custom ContractId
  buyer: string; // Bidder's username
  price: number; // Bid amount
  createdAt: string;
  status: 'active' | 'accepted' | 'refused' | 'withdrawn';
  notes?: string;
}

interface BuildingBidsListProps {
  bids: Bid[];
  isLoading: boolean;
  currentUser: string | null;
  buildingOwner: string | null;
  onPlaceBid: () => void;
  onAcceptBid: (bidId: string) => void;
  onRefuseBid: (bidId: string) => void;
  onAdjustBid: (bid: Bid) => void; // For opening adjustment panel
  onWithdrawBid: (bidId: string) => void;
}

const BuildingBidsList: React.FC<BuildingBidsListProps> = ({
  bids,
  isLoading,
  currentUser,
  buildingOwner,
  onPlaceBid,
  onAcceptBid,
  onRefuseBid,
  onAdjustBid,
  onWithdrawBid,
}) => {
  const formatDucats = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null) return 'N/A';
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + ' ⚜️';
  };

  const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  const activeBids = bids.filter(bid => bid.status === 'active');
  const historicalBids = bids.filter(bid => bid.status !== 'active');

  const canPlaceBid = currentUser && currentUser !== buildingOwner;

  return (
    <div className="bg-amber-100 p-4 rounded-lg shadow-sm border border-amber-200 mt-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-lg font-serif text-amber-700 flex items-center">
          <FaGavel className="mr-2" /> Building Bids
        </h4>
        {canPlaceBid && (
          <button
            onClick={onPlaceBid}
            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
          >
            Place Bid
          </button>
        )}
      </div>

      {isLoading && <p className="text-amber-600 italic">Loading bids...</p>}

      {!isLoading && activeBids.length === 0 && (
        <p className="text-amber-600 italic text-sm">No active bids for this building.</p>
      )}

      {!isLoading && activeBids.length > 0 && (
        <div className="space-y-3">
          {activeBids.map((bid) => (
            <div key={bid.id} className="bg-white p-3 rounded-md shadow border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-amber-800">Bidder: {bid.buyer}</p>
                  <p className="text-lg font-bold text-green-700">{formatDucats(bid.price)}</p>
                  <p className="text-xs text-gray-500">Placed: {formatDate(bid.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    Active
                  </span>
                  {currentUser === buildingOwner && (
                    <div className="flex space-x-1 mt-1">
                      <button
                        onClick={() => onAcceptBid(bid.id)}
                        className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-xs"
                        title="Accept Bid"
                      >
                        <FaGavel />
                      </button>
                      <button
                        onClick={() => onRefuseBid(bid.id)}
                        className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                        title="Refuse Bid"
                      >
                        <FaTimes />
                      </button>
                    </div>
                  )}
                  {currentUser === bid.buyer && (
                     <div className="flex space-x-1 mt-1">
                      <button
                        onClick={() => onAdjustBid(bid)}
                        className="p-1.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-xs"
                        title="Adjust Bid"
                      >
                        <FaEdit />
                      </button>
                      <button
                        onClick={() => onWithdrawBid(bid.id)}
                        className="p-1.5 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs"
                        title="Withdraw Bid"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {bid.notes && <p className="text-xs italic text-gray-600 mt-1">Notes: {bid.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {!isLoading && historicalBids.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm font-medium text-amber-600 cursor-pointer hover:text-amber-800">
            View Historical Bids ({historicalBids.length})
          </summary>
          <div className="mt-2 space-y-2">
            {historicalBids.map((bid) => (
              <div key={bid.id} className="bg-gray-50 p-2 rounded-md border border-gray-200 opacity-70">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Bidder: {bid.buyer}</p>
                    <p className="text-sm font-medium text-gray-600">{formatDucats(bid.price)}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    bid.status === 'accepted' ? 'bg-green-100 text-green-700' :
                    bid.status === 'refused' ? 'bg-red-100 text-red-700' :
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Date: {formatDate(bid.createdAt)}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default BuildingBidsList;
