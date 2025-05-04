import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';

export interface UserProfile {
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImage: string | null;
  familyMotto?: string;
  familyCoatOfArms?: string;
  color?: string;
  computeAmount?: number;
  walletAddress?: string;
}

/**
 * Service for handling user data
 */
export class UserService {
  private users: Record<string, any> = {};
  private currentUser: UserProfile | null = null;
  private walletAddress: string | null = null;
  
  constructor() {
    // Initialize wallet address from storage
    this.walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    
    // Load user profile from localStorage if available
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      try {
        this.currentUser = JSON.parse(storedProfile);
      } catch (e) {
        console.error('Error parsing stored profile:', e);
      }
    }
    
    // Listen for wallet changes
    eventBus.subscribe(EventTypes.WALLET_CHANGED, this.handleWalletChanged.bind(this));
  }
  
  /**
   * Load all users from the API
   */
  public async loadUsers(): Promise<Record<string, any>> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/users`);
      
      if (!response.ok) {
        throw new Error(`Failed to load users: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid users data format');
      }
      
      // Convert array to record
      const usersRecord: Record<string, any> = {};
      data.forEach(user => {
        if (user.user_name) {
          usersRecord[user.user_name] = user;
        }
      });
      
      this.users = usersRecord;
      
      // Ensure ConsiglioDeiDieci is always present
      if (!this.users['ConsiglioDeiDieci']) {
        this.users['ConsiglioDeiDieci'] = {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        };
      }
      
      // Notify listeners that users data has been loaded
      eventBus.emit(EventTypes.USERS_DATA_LOADED);
      
      return this.users;
    } catch (error) {
      console.error('Error loading users:', error);
      return {};
    }
  }
  
  /**
   * Get all users
   */
  public getUsers(): Record<string, any> {
    return this.users;
  }
  
  /**
   * Get a user by username
   */
  public getUserByUsername(username: string): any {
    return this.users[username];
  }
  
  /**
   * Get the current user profile
   */
  public getCurrentUser(): UserProfile | null {
    return this.currentUser;
  }
  
  /**
   * Get the current wallet address
   */
  public getWalletAddress(): string | null {
    return this.walletAddress;
  }
  
  /**
   * Connect wallet
   */
  public async connectWallet(address: string): Promise<UserProfile | null> {
    this.walletAddress = address;
    
    // Store wallet address
    sessionStorage.setItem('walletAddress', address);
    localStorage.setItem('walletAddress', address);
    
    // Fetch user profile
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wallet/${address}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.user_name) {
        // Create user profile
        this.currentUser = {
          username: data.user_name,
          firstName: data.first_name || data.user_name.split(' ')[0] || '',
          lastName: data.last_name || data.user_name.split(' ').slice(1).join(' ') || '',
          coatOfArmsImage: data.coat_of_arms_image,
          familyMotto: data.family_motto,
          familyCoatOfArms: data.family_coat_of_arms,
          computeAmount: data.compute_amount,
          color: data.color || '#8B4513',
          walletAddress: address
        };
        
        // Store in localStorage
        localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
        
        // Notify listeners
        eventBus.emit(EventTypes.USER_PROFILE_UPDATED, this.currentUser);
        
        return this.currentUser;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }
  
  /**
   * Disconnect wallet
   */
  public disconnectWallet(): void {
    this.walletAddress = null;
    this.currentUser = null;
    
    // Clear storage
    sessionStorage.removeItem('walletAddress');
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('userProfile');
    
    // Notify listeners
    eventBus.emit(EventTypes.WALLET_CHANGED);
  }
  
  /**
   * Update user profile
   */
  public async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!this.walletAddress) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: this.walletAddress,
          user_name: profile.username || this.currentUser?.username,
          first_name: profile.firstName || this.currentUser?.firstName,
          last_name: profile.lastName || this.currentUser?.lastName,
          family_coat_of_arms: profile.familyCoatOfArms || this.currentUser?.familyCoatOfArms,
          family_motto: profile.familyMotto || this.currentUser?.familyMotto,
          coat_of_arms_image: profile.coatOfArmsImage || this.currentUser?.coatOfArmsImage,
          color: profile.color || this.currentUser?.color
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update profile: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update current user
      this.currentUser = {
        ...this.currentUser,
        ...profile,
        computeAmount: data.compute_amount,
        walletAddress: this.walletAddress
      } as UserProfile;
      
      // Store in localStorage
      localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
      
      // Notify listeners
      eventBus.emit(EventTypes.USER_PROFILE_UPDATED, this.currentUser);
      
      return this.currentUser;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }
  
  /**
   * Handle wallet changed event
   */
  private handleWalletChanged(): void {
    // Update wallet address from storage
    this.walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    
    // Load user profile if wallet is connected
    if (this.walletAddress) {
      this.connectWallet(this.walletAddress);
    }
  }
}

// Create a singleton instance
export const userService = new UserService();
