// Interface for land rent data
export interface LandRent {
  id: string;
  centroid: {
    lat: number;
    lng: number;
  };
  areaInSquareMeters: number;
  distanceFromCenter: number;
  locationMultiplier: number;
  dailyRent: number;
  estimatedLandValue: number;
  historicalName: string | null;
}

// Utility functions for Airtable operations
export const airtableUtils = {
  /**
   * Save land rent data to Airtable
   * @param landRents Array of land rent data to save
   */
  async saveLandRents(landRents: LandRent[]): Promise<void> {
    // Implementation would go here
    console.log(`Saving ${landRents.length} land rent records to Airtable`);
    return Promise.resolve();
  },
  
  /**
   * Get land rent data from Airtable
   * @returns Promise resolving to array of land rent data
   */
  async getLandRents(): Promise<LandRent[]> {
    // Implementation would go here
    console.log('Fetching land rent records from Airtable');
    // Return mock data for now
    return Promise.resolve([]);
  },
  
  /**
   * Transfer compute tokens in Airtable
   * @param walletAddress Wallet address to transfer to
   * @param amount Amount to transfer
   */
  async transferComputeInAirtable(walletAddress: string, amount: number) {
    try {
      // We're working with whole tokens in the UI, so we send the amount as is to Airtable
      // The blockchain transaction in tokenUtils.ts will handle the decimal conversion
      console.log(`Transferring ${amount.toLocaleString()} COMPUTE for wallet ${walletAddress}`);
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:10000';
      const response = await fetch(`${apiBaseUrl}/api/transfer-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          compute_amount: amount, // Send the whole token amount as entered by the user
        }),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to transfer compute';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch (e) {
          // If we can't parse the error response, just use the status text
          errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error transferring compute in Airtable:', error);
      throw error;
    }
  }
};

// Export the standalone function for backward compatibility
export async function transferComputeInAirtable(walletAddress: string, amount: number) {
  return airtableUtils.transferComputeInAirtable(walletAddress, amount);
}
