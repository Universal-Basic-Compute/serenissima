/**
 * TODO: Refactor according to architecture
 * - Add comprehensive logging
 * - Implement caching strategy for user data
 * - Add unit tests for service methods
 */
import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';
import { log } from '../logUtils';
import { 
  ApiError, 
  AuthenticationError, 
  DataFormatError, 
  NotFoundError, 
  ValidationError 
} from '../errors/ServiceErrors';

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
    const endpoint = `${getApiBaseUrl()}/api/users`;
    
    try {
      log.info('Loading users from API');
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new ApiError(
          'Failed to load users', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      
      if (!data || !Array.isArray(data)) {
        throw new DataFormatError('Expected array of users');
      }
      
      // Convert array to record
      const usersRecord: Record<string, any> = {};
      data.forEach(user => {
        if (user.user_name) {
          usersRecord[user.user_name] = user;
        } else {
          log.warn('Found user without user_name', user);
        }
      });
      
      this.users = usersRecord;
      
      // Ensure ConsiglioDeiDieci is always present
      if (!this.users['ConsiglioDeiDieci']) {
        log.info('Adding default ConsiglioDeiDieci user');
        this.users['ConsiglioDeiDieci'] = {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        };
      }
      
      // Notify listeners that users data has been loaded
      eventBus.emit(EventTypes.USERS_DATA_LOADED);
      log.info(`Loaded ${Object.keys(this.users).length} users`);
      
      return this.users;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof DataFormatError) {
        log.error(error);
        // Re-throw typed errors
        throw error;
      }
      
      // Convert generic errors to typed errors
      log.error('Unexpected error loading users:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        endpoint
      );
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
   * @throws {ValidationError} If username is invalid
   * @throws {NotFoundError} If user is not found
   */
  public getUserByUsername(username: string): any {
    if (!username || typeof username !== 'string') {
      throw new ValidationError('Invalid username', 'username');
    }
    
    const user = this.users[username];
    
    if (!user) {
      throw new NotFoundError('User', username);
    }
    
    return user;
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
   * @throws {ValidationError} If address is invalid
   * @throws {ApiError} If API request fails
   */
  public async connectWallet(address: string): Promise<UserProfile | null> {
    // Validate wallet address
    if (!address || typeof address !== 'string' || address.trim() === '') {
      throw new ValidationError('Wallet address cannot be empty', 'address');
    }
    
    // Normalize address
    address = address.trim();
    
    log.info(`Connecting wallet: ${address}`);
    this.walletAddress = address;
    
    // Store wallet address
    sessionStorage.setItem('walletAddress', address);
    localStorage.setItem('walletAddress', address);
    
    // Fetch user profile
    const endpoint = `${getApiBaseUrl()}/api/wallet/${address}`;
    
    try {
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        if (response.status === 404) {
          log.info(`No user profile found for wallet: ${address}`);
          return null;
        }
        
        throw new ApiError(
          'Failed to fetch user profile', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      
      if (data.user_name) {
        log.info(`Found user profile for wallet: ${address}, username: ${data.user_name}`);
        
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
      
      log.info(`No username found for wallet: ${address}`);
      return null;
    } catch (error) {
      if (error instanceof ApiError) {
        log.error(error);
        throw error;
      }
      
      log.error('Unexpected error connecting wallet:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        endpoint
      );
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
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ValidationError} If profile data is invalid
   * @throws {ApiError} If API request fails
   */
  public async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile | null> {
    if (!this.walletAddress) {
      throw new AuthenticationError('Wallet must be connected to update profile');
    }
    
    // Validate profile data
    if (profile.username === '') {
      throw new ValidationError('Username cannot be empty', 'username');
    }
    
    log.info(`Updating profile for wallet: ${this.walletAddress}`);
    const endpoint = `${getApiBaseUrl()}/api/wallet`;
    
    try {
      const response = await fetch(endpoint, {
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
        throw new ApiError(
          'Failed to update profile', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      
      if (!data) {
        throw new DataFormatError('Empty response from server');
      }
      
      log.info(`Profile updated successfully for wallet: ${this.walletAddress}`);
      
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
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError ||
          error instanceof DataFormatError) {
        log.error(error);
        throw error;
      }
      
      log.error('Unexpected error updating profile:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        endpoint
      );
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
