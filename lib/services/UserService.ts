/**
 * TODO: Refactor according to architecture
 * - Add comprehensive logging
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

// Cache configuration
interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time-to-live in milliseconds
}

// Cache entry with expiration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

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
  
  // Cache storage
  private usersCache: CacheEntry<Record<string, any>> | null = null;
  private userByUsernameCache: Map<string, CacheEntry<any>> = new Map();
  private userByWalletCache: Map<string, CacheEntry<UserProfile | null>> = new Map();
  
  // Cache configuration
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 5 * 60 * 1000 // 5 minutes default TTL
  };
  
  constructor() {
    log.info('Initializing UserService');
    
    // Initialize wallet address from storage
    this.walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    if (this.walletAddress) {
      log.info(`Restored wallet address from storage: ${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}`);
    } else {
      log.debug('No wallet address found in storage');
    }
    
    // Load user profile from localStorage if available
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      try {
        this.currentUser = JSON.parse(storedProfile);
        log.info(`Restored user profile from storage: ${this.currentUser.username}`);
        log.debug('User profile details:', { 
          username: this.currentUser.username,
          hasCoatOfArms: !!this.currentUser.coatOfArmsImage,
          hasMotto: !!this.currentUser.familyMotto
        });
        
        // Initialize cache with stored profile if wallet address exists
        if (this.walletAddress && this.currentUser) {
          this.setCacheEntry(
            this.userByWalletCache, 
            this.walletAddress, 
            this.currentUser
          );
          log.debug('Initialized user by wallet cache with stored profile');
        }
      } catch (e) {
        log.error('Error parsing stored user profile:', e);
      }
    } else {
      log.debug('No user profile found in storage');
    }
    
    // Listen for wallet changes
    eventBus.subscribe(EventTypes.WALLET_CHANGED, this.handleWalletChanged.bind(this));
    log.debug('Subscribed to WALLET_CHANGED events');
    
    // Listen for cache invalidation events
    eventBus.subscribe(EventTypes.USER_PROFILE_UPDATED, this.invalidateUserCache.bind(this));
    log.debug('Subscribed to USER_PROFILE_UPDATED events for cache invalidation');
    
    log.info('UserService initialized successfully');
  }
  
  /**
   * Configure the cache settings
   */
  public configureCaching(config: Partial<CacheConfig>): void {
    this.cacheConfig = {
      ...this.cacheConfig,
      ...config
    };
    
    log.info('Cache configuration updated', this.cacheConfig);
    
    // Clear cache if disabled
    if (!this.cacheConfig.enabled) {
      this.clearCache();
    }
  }
  
  /**
   * Clear all caches
   */
  public clearCache(): void {
    log.info('Clearing all user data caches');
    this.usersCache = null;
    this.userByUsernameCache.clear();
    this.userByWalletCache.clear();
    log.debug('All user data caches cleared');
  }
  
  /**
   * Check if a cache entry is valid
   */
  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): boolean {
    if (!this.cacheConfig.enabled || !entry) {
      return false;
    }
    
    const now = Date.now();
    return (now - entry.timestamp) < this.cacheConfig.ttl;
  }
  
  /**
   * Set a cache entry with current timestamp
   */
  private setCacheEntry<K, T>(cache: Map<K, CacheEntry<T>>, key: K, data: T): void {
    if (!this.cacheConfig.enabled) {
      return;
    }
    
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  /**
   * Invalidate cache for a specific user
   */
  private invalidateUserCache(user: UserProfile): void {
    if (!user) return;
    
    log.debug(`Invalidating cache for user: ${user.username}`);
    
    // Remove from username cache
    this.userByUsernameCache.delete(user.username);
    
    // Remove from wallet cache if wallet address exists
    if (user.walletAddress) {
      this.userByWalletCache.delete(user.walletAddress);
    }
    
    // Invalidate users cache since it might contain this user
    this.usersCache = null;
    
    log.debug('User cache invalidated');
  }
  
  /**
   * Load all users from the API
   */
  public async loadUsers(): Promise<Record<string, any>> {
    // Check cache first
    if (this.isCacheValid(this.usersCache)) {
      log.info('Returning users from cache');
      return this.usersCache.data;
    }
    
    const endpoint = `${getApiBaseUrl()}/api/users`;
    
    log.info(`Fetching users from endpoint: ${endpoint}`);
    const startTime = performance.now();
    
    try {
      log.debug('Initiating API request to load users');
      const response = await fetch(endpoint);
      
      const responseTime = Math.round(performance.now() - startTime);
      log.debug(`API response received in ${responseTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        log.error(`Failed to load users: HTTP ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          endpoint
        });
        throw new ApiError(
          'Failed to load users', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug(`Parsed response data, received ${Array.isArray(data) ? data.length : 0} users`);
      
      if (!data || !Array.isArray(data)) {
        log.error('Invalid data format received from API', { 
          dataType: typeof data,
          isArray: Array.isArray(data)
        });
        throw new DataFormatError('Expected array of users');
      }
      
      // Convert array to record
      const usersRecord: Record<string, any> = {};
      let validUserCount = 0;
      let invalidUserCount = 0;
      
      data.forEach(user => {
        if (user.user_name) {
          usersRecord[user.user_name] = user;
          validUserCount++;
          log.debug(`Processed user: ${user.user_name}`, {
            hasCoatOfArms: !!user.coat_of_arms_image,
            hasColor: !!user.color
          });
        } else {
          invalidUserCount++;
          log.warn('Found user without user_name', user);
        }
      });
      
      log.info(`Processed ${validUserCount} valid users and ${invalidUserCount} invalid users`);
      this.users = usersRecord;
      
      // Ensure ConsiglioDeiDieci is always present
      if (!this.users['ConsiglioDeiDieci']) {
        log.info('Adding default ConsiglioDeiDieci user to users collection');
        this.users['ConsiglioDeiDieci'] = {
          user_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        };
      }
      
      // Update cache
      this.usersCache = {
        data: this.users,
        timestamp: Date.now()
      };
      log.debug('Updated users cache');
      
      // Clear individual user caches as they might be stale
      this.userByUsernameCache.clear();
      log.debug('Cleared user by username cache');
      
      // Notify listeners that users data has been loaded
      log.debug('Emitting USERS_DATA_LOADED event');
      eventBus.emit(EventTypes.USERS_DATA_LOADED);
      
      const totalTime = Math.round(performance.now() - startTime);
      log.info(`Successfully loaded ${Object.keys(this.users).length} users in ${totalTime}ms`);
      
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
    log.debug(`Getting user by username: ${username}`);
    
    if (!username || typeof username !== 'string') {
      log.warn('Invalid username provided', { username, type: typeof username });
      throw new ValidationError('Invalid username', 'username');
    }
    
    // Check cache first
    const cachedEntry = this.userByUsernameCache.get(username);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning user from cache: ${username}`);
      return cachedEntry.data;
    }
    
    const user = this.users[username];
    
    if (!user) {
      log.warn(`User not found with username: ${username}`);
      throw new NotFoundError('User', username);
    }
    
    // Update cache
    this.setCacheEntry(this.userByUsernameCache, username, user);
    log.debug(`Updated cache for user: ${username}`);
    
    log.debug(`Successfully retrieved user: ${username}`);
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
    log.info('Connecting wallet', { addressLength: address?.length });
    
    // Validate wallet address
    if (!address || typeof address !== 'string' || address.trim() === '') {
      log.warn('Invalid wallet address provided', { 
        address: address || 'undefined', 
        type: typeof address 
      });
      throw new ValidationError('Wallet address cannot be empty', 'address');
    }
    
    // Normalize address
    address = address.trim();
    const maskedAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    log.info(`Connecting wallet: ${maskedAddress}`);
    
    this.walletAddress = address;
    
    // Store wallet address
    log.debug('Storing wallet address in session and local storage');
    sessionStorage.setItem('walletAddress', address);
    localStorage.setItem('walletAddress', address);
    
    // Check cache first
    const cachedEntry = this.userByWalletCache.get(address);
    if (this.isCacheValid(cachedEntry)) {
      log.info(`Returning user profile from cache for wallet: ${maskedAddress}`);
      this.currentUser = cachedEntry.data;
      
      if (this.currentUser) {
        log.debug(`Cached profile found for wallet: ${maskedAddress}, username: ${this.currentUser.username}`);
        
        // Notify listeners
        log.debug('Emitting USER_PROFILE_UPDATED event');
        eventBus.emit(EventTypes.USER_PROFILE_UPDATED, this.currentUser);
      } else {
        log.debug(`Cached null profile for wallet: ${maskedAddress}`);
      }
      
      return this.currentUser;
    }
    
    // Fetch user profile
    const endpoint = `${getApiBaseUrl()}/api/wallet/${address}`;
    log.debug(`Fetching user profile from endpoint: ${endpoint}`);
    
    const startTime = performance.now();
    
    try {
      log.debug('Initiating API request to fetch user profile');
      const response = await fetch(endpoint);
      
      const responseTime = Math.round(performance.now() - startTime);
      log.debug(`API response received in ${responseTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          log.info(`No user profile found for wallet: ${maskedAddress}`);
          
          // Cache the null result
          this.setCacheEntry(this.userByWalletCache, address, null);
          log.debug(`Cached null result for wallet: ${maskedAddress}`);
          
          return null;
        }
        
        log.error(`Failed to fetch user profile: HTTP ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          maskedWallet: maskedAddress
        });
        
        throw new ApiError(
          'Failed to fetch user profile', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Parsed user profile data from API response');
      
      if (data.user_name) {
        log.info(`Found user profile for wallet: ${maskedAddress}, username: ${data.user_name}`);
        log.debug('User profile details', {
          username: data.user_name,
          hasFirstName: !!data.first_name,
          hasLastName: !!data.last_name,
          hasCoatOfArms: !!data.coat_of_arms_image,
          hasMotto: !!data.family_motto,
          hasComputeAmount: typeof data.compute_amount === 'number',
          computeAmount: data.compute_amount
        });
        
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
        
        // Update cache
        this.setCacheEntry(this.userByWalletCache, address, this.currentUser);
        log.debug(`Updated cache for wallet: ${maskedAddress}`);
        
        // Also cache by username
        this.setCacheEntry(this.userByUsernameCache, this.currentUser.username, {
          user_name: this.currentUser.username,
          first_name: this.currentUser.firstName,
          last_name: this.currentUser.lastName,
          coat_of_arms_image: this.currentUser.coatOfArmsImage,
          family_motto: this.currentUser.familyMotto,
          family_coat_of_arms: this.currentUser.familyCoatOfArms,
          compute_amount: this.currentUser.computeAmount,
          color: this.currentUser.color,
          wallet_address: address
        });
        log.debug(`Also cached user by username: ${this.currentUser.username}`);
        
        // Store in localStorage
        log.debug('Storing user profile in local storage');
        localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
        
        // Notify listeners
        log.debug('Emitting USER_PROFILE_UPDATED event');
        eventBus.emit(EventTypes.USER_PROFILE_UPDATED, this.currentUser);
        
        const totalTime = Math.round(performance.now() - startTime);
        log.info(`Successfully connected wallet and loaded profile in ${totalTime}ms`);
        
        return this.currentUser;
      }
      
      log.info(`No username found for wallet: ${maskedAddress}`);
      
      // Cache the null result
      this.setCacheEntry(this.userByWalletCache, address, null);
      log.debug(`Cached null result for wallet: ${maskedAddress}`);
      
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
    log.info('Disconnecting wallet');
    
    if (this.walletAddress) {
      const maskedAddress = this.walletAddress ? 
        `${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}` : 
        'none';
      log.debug(`Disconnecting wallet: ${maskedAddress}`);
      
      // Remove from wallet cache
      this.userByWalletCache.delete(this.walletAddress);
      log.debug(`Removed wallet from cache: ${maskedAddress}`);
    }
    
    if (this.currentUser) {
      log.debug(`Clearing user profile for: ${this.currentUser.username}`);
      
      // Remove from username cache
      this.userByUsernameCache.delete(this.currentUser.username);
      log.debug(`Removed username from cache: ${this.currentUser.username}`);
    }
    
    this.walletAddress = null;
    this.currentUser = null;
    
    // Clear storage
    log.debug('Removing wallet and profile data from storage');
    sessionStorage.removeItem('walletAddress');
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('userProfile');
    
    // Notify listeners
    log.debug('Emitting WALLET_CHANGED event');
    eventBus.emit(EventTypes.WALLET_CHANGED);
    
    log.info('Wallet disconnected successfully');
  }
  
  /**
   * Update user profile
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ValidationError} If profile data is invalid
   * @throws {ApiError} If API request fails
   */
  public async updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile | null> {
    log.info('Updating user profile');
    
    if (!this.walletAddress) {
      log.warn('Attempted to update profile without connected wallet');
      throw new AuthenticationError('Wallet must be connected to update profile');
    }
    
    // Validate profile data
    if (profile.username === '') {
      log.warn('Invalid profile data: empty username');
      throw new ValidationError('Username cannot be empty', 'username');
    }
    
    const maskedAddress = `${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}`;
    log.info(`Updating profile for wallet: ${maskedAddress}`);
    
    // Log what's being updated
    const changedFields = Object.keys(profile).filter(key => 
      profile[key as keyof UserProfile] !== this.currentUser?.[key as keyof UserProfile]
    );
    
    log.debug('Profile update details', {
      changedFields,
      currentUsername: this.currentUser?.username,
      newUsername: profile.username || this.currentUser?.username
    });
    
    const endpoint = `${getApiBaseUrl()}/api/wallet`;
    log.debug(`Sending profile update to endpoint: ${endpoint}`);
    
    const startTime = performance.now();
    
    try {
      const requestBody = {
        wallet_address: this.walletAddress,
        user_name: profile.username || this.currentUser?.username,
        first_name: profile.firstName || this.currentUser?.firstName,
        last_name: profile.lastName || this.currentUser?.lastName,
        family_coat_of_arms: profile.familyCoatOfArms || this.currentUser?.familyCoatOfArms,
        family_motto: profile.familyMotto || this.currentUser?.familyMotto,
        coat_of_arms_image: profile.coatOfArmsImage || this.currentUser?.coatOfArmsImage,
        color: profile.color || this.currentUser?.color
      };
      
      log.debug('Prepared request payload', {
        hasUsername: !!requestBody.user_name,
        hasFirstName: !!requestBody.first_name,
        hasLastName: !!requestBody.last_name,
        hasCoatOfArms: !!requestBody.coat_of_arms_image,
        hasMotto: !!requestBody.family_motto
      });
      
      log.debug('Initiating API request to update profile');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      const responseTime = Math.round(performance.now() - startTime);
      log.debug(`API response received in ${responseTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        log.error(`Failed to update profile: HTTP ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          maskedWallet: maskedAddress
        });
        
        throw new ApiError(
          'Failed to update profile', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Parsed response data from API');
      
      if (!data) {
        log.error('Empty response received from server');
        throw new DataFormatError('Empty response from server');
      }
      
      log.info(`Profile updated successfully for wallet: ${maskedAddress}`);
      
      // Update current user
      const previousComputeAmount = this.currentUser?.computeAmount;
      this.currentUser = {
        ...this.currentUser,
        ...profile,
        computeAmount: data.compute_amount,
        walletAddress: this.walletAddress
      } as UserProfile;
      
      log.debug('Updated user profile', {
        username: this.currentUser.username,
        computeAmountChanged: previousComputeAmount !== this.currentUser.computeAmount,
        previousComputeAmount,
        newComputeAmount: this.currentUser.computeAmount
      });
      
      // Update caches
      if (this.currentUser.username) {
        // Update username cache with API format
        this.setCacheEntry(this.userByUsernameCache, this.currentUser.username, {
          user_name: this.currentUser.username,
          first_name: this.currentUser.firstName,
          last_name: this.currentUser.lastName,
          coat_of_arms_image: this.currentUser.coatOfArmsImage,
          family_motto: this.currentUser.familyMotto,
          family_coat_of_arms: this.currentUser.familyCoatOfArms,
          compute_amount: this.currentUser.computeAmount,
          color: this.currentUser.color,
          wallet_address: this.walletAddress
        });
        log.debug(`Updated username cache for: ${this.currentUser.username}`);
      }
      
      // Update wallet cache
      this.setCacheEntry(this.userByWalletCache, this.walletAddress, this.currentUser);
      log.debug(`Updated wallet cache for: ${maskedAddress}`);
      
      // Store in localStorage
      log.debug('Storing updated profile in local storage');
      localStorage.setItem('userProfile', JSON.stringify(this.currentUser));
      
      // Notify listeners
      log.debug('Emitting USER_PROFILE_UPDATED event');
      eventBus.emit(EventTypes.USER_PROFILE_UPDATED, this.currentUser);
      
      const totalTime = Math.round(performance.now() - startTime);
      log.info(`Successfully updated user profile in ${totalTime}ms`);
      
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
    log.debug('Handling WALLET_CHANGED event');
    
    // Update wallet address from storage
    const previousWallet = this.walletAddress;
    this.walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    
    const previousMasked = previousWallet ? 
      `${previousWallet.substring(0, 6)}...${previousWallet.substring(previousWallet.length - 4)}` : 
      'none';
    
    const currentMasked = this.walletAddress ? 
      `${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}` : 
      'none';
    
    log.info(`Wallet changed from ${previousMasked} to ${currentMasked}`);
    
    // Load user profile if wallet is connected
    if (this.walletAddress) {
      log.debug('Wallet address found, connecting wallet');
      this.connectWallet(this.walletAddress).catch(error => {
        log.error('Error connecting wallet after change event:', error);
      });
    } else {
      log.debug('No wallet address found after change event');
    }
  }
}