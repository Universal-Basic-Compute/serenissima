import React, { useState } from 'react';
import { FaTimes, FaPaperPlane, FaSpinner } from 'react-icons/fa';

interface BidPlacementPanelProps {
  buildingId: string;
  buildingName: string;
  currentOwner: string | null;
  currentUser: string;
  onClose: () => void;
  onBidPlaced: () => void; // Callback after successful bid
}

const BidPlacementPanel: React.FC<BidPlacementPanelProps> = ({
  buildingId,
  buildingName,
  currentOwner,
  currentUser,
  onClose,
  onBidPlaced,
}) => {
  const [bidAmount, setBidAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bidAmount === '' || bidAmount <= 0) {
      setError('Please enter a valid bid amount.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      // Placeholder for API call
      console.log('Submitting bid:', {
        buildingId,
        bidder: currentUser,
        amount: bidAmount,
        notes,
      });
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // TODO: Replace with actual API call to /api/contracts (POST)
      // const response = await fetch('/api/contracts', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     ContractId: `building_bid_${buildingId}_${currentUser}_${Date.now()}`,
      //     Type: 'building_bid',
      //     Asset: buildingId,
      //     AssetType: 'building',
      //     Buyer: currentUser, // Bidder
      //     PricePerResource: bidAmount, // Bid amount
      //     TargetAmount: 1, // For the building itself
      //     Status: 'active',
      //     Notes: notes,
      //     // Seller might be set by backend or left null until acceptance
      //   }),
      // });

      // if (!response.ok) {
      //   const errorData = await response.json();
      //   throw new Error(errorData.error || 'Failed to place bid.');
      // }
      
      // const result = await response.json();
      // if (result.success) {
      //   onBidPlaced();
      // } else {
      //   throw new Error(result.error || 'API returned success false.');
      // }

      alert(`Bid of ${bidAmount} Ducats placed for ${buildingName}! (This is a placeholder)`);
      onBidPlaced(); // Call this after successful API call

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      console.error('Error placing bid:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className="bg-amber-50 w-full max-w-md rounded-lg shadow-xl border-2 border-amber-700 flex flex-col">
        <div className="bg-amber-700 text-white p-4 flex justify-between items-center rounded-t-lg">
          <h3 className="font-serif text-xl">Place Bid for: {buildingName}</h3>
          <button onClick={onClose} className="text-white hover:text-amber-200">
            <FaTimes size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmitBid} className="p-6 space-y-4">
          <p className="text-sm text-amber-700">
            Current Owner: <span className="font-medium">{currentOwner || 'N/A'}</span>
          </p>
          
          <div>
            <label htmlFor="bidAmount" className="block text-sm font-medium text-amber-800 mb-1">
              Your Bid Amount (Ducats)
            </label>
            <input
              id="bidAmount"
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-3 py-2 border border-amber-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="e.g., 10000"
              min="1"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-amber-800 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-amber-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              placeholder="Any conditions or comments for the owner..."
              disabled={isSubmitting}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-md hover:bg-amber-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || bidAmount === '' || bidAmount <= 0}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 flex items-center"
            >
              {isSubmitting ? (
                <>
                  <FaSpinner className="animate-spin mr-2" /> Submitting...
                </>
              ) : (
                <>
                  <FaPaperPlane className="mr-2" /> Submit Bid
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BidPlacementPanel;
