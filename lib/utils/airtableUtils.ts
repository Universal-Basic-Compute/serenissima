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

// Interface for guild data
export interface Guild {
  guildId: string;
  guildName: string;
  createdAt: string;
  primaryLocation: string;
  description: string;
  shortDescription?: string;
  patronSaint?: string;
  guildTier?: string;
  leadershipStructure?: string;
  entryFee?: number;
  votingSystem?: string;
  meetingFrequency?: string;
  guildHallId?: string;
  guildEmblem?: string;
  guildBanner?: string;
  color?: string;
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
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBaseUrl}/api/transfer-compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          ducats: amount, // Send the whole token amount as entered by the citizen
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
  },
  
  /**
   * Fetch guilds from Airtable
   * @returns Promise resolving to array of guild data
   */
  async fetchGuilds(): Promise<Guild[]> {
    try {
      // Use relative URL instead of apiBaseUrl
      const response = await fetch('/api/guilds');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch guilds: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.guilds || [];
    } catch (error) {
      console.error('Error fetching guilds:', error);
      return [];
    }
  },
  
  /**
   * Get a specific guild by ID
   * @param guildId The ID of the guild to fetch
   * @returns Promise resolving to the guild data or null if not found
   */
  async getGuildById(guildId: string): Promise<Guild | null> {
    try {
      const guilds = await this.fetchGuilds();
      return guilds.find(guild => guild.guildId === guildId) || null;
    } catch (error) {
      console.error(`Error fetching guild with ID ${guildId}:`, error);
      return null;
    }
  }
};

// Export the standalone function for backward compatibility
export async function transferComputeInAirtable(walletAddress: string, amount: number) {
  return airtableUtils.transferComputeInAirtable(walletAddress, amount);
}

// Standalone functions for guild operations
export async function fetchGuilds(): Promise<Guild[]> {
  return airtableUtils.fetchGuilds();
}

export async function getGuildById(guildId: string): Promise<Guild | null> {
  return airtableUtils.getGuildById(guildId);
}
