/**
 * TODO: Refactor according to architecture
 * - Add comprehensive logging
 * - Add unit tests for service methods
 */
import { eventBus, EventTypes } from '../utils/eventBus';
import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import { log } from '../utils/logUtils';
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

// Create a singleton instance but don't export it directly
// Instead, provide a getter function to prevent circular dependencies
let citizenServiceInstance: CitizenService | null = null;

export function getCitizenService(): CitizenService {
  if (!citizenServiceInstance) {
    citizenServiceInstance = CitizenService.getInstance();
  }
  return citizenServiceInstance;
}

// Cache entry with expiration
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface CitizenProfile {
  username: string;
  firstName: string;
  lastName: string;
  coatOfArmsImageUrl: string | null;
  familyMotto?: string;
  coatOfArms?: string;
  color?: string;
  Ducats?: number;
  walletAddress?: string;
  guildId?: string | null; // Ajout de guildId
}

/**
 * Service for handling citizen data
 */
export class CitizenService {
  private citizens: Record<string, any> = {};
  private currentCitizen: CitizenProfile | null = null;
  private walletAddress: string | null = null;
  
  // Cache storage
  private citizensCache: CacheEntry<Record<string, any>> | null = null;
  private citizenByUsernameCache: Map<string, CacheEntry<any>> = new Map();
  private citizenByWalletCache: Map<string, CacheEntry<CitizenProfile | null>> = new Map();
  
  // Cache configuration
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 5 * 60 * 1000 // 5 minutes default TTL
  };
  
  constructor() {
    log.info('Initializing CitizenService');
    
    // Initialize wallet address from storage
    this.walletAddress = sessionStorage.getItem('walletAddress') || localStorage.getItem('walletAddress');
    if (this.walletAddress) {
      log.info(`Restored wallet address from storage: ${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}`);
    } else {
      log.debug('No wallet address found in storage');
    }
    
    // Load citizen profile from localStorage if available
    const storedProfile = localStorage.getItem('citizenProfile');
    if (storedProfile) {
      try {
        this.currentCitizen = JSON.parse(storedProfile);
        log.info(`Restored citizen profile from storage: ${this.currentCitizen?.username}`);
        log.debug('Citizen profile details:', { 
          username: this.currentCitizen?.username,
          hasCoatOfArms: !!this.currentCitizen?.coatOfArmsImageUrl,
          hasMotto: !!this.currentCitizen?.familyMotto
        });
        
        // Initialize cache with stored profile if wallet address exists
        if (this.walletAddress && this.currentCitizen) {
          this.setCacheEntry(
            this.citizenByWalletCache, 
            this.walletAddress, 
            this.currentCitizen
          );
          log.debug('Initialized citizen by wallet cache with stored profile');
        }
      } catch (e) {
        log.error('Error parsing stored citizen profile:', e);
      }
    } else {
      log.debug('No citizen profile found in storage');
    }
    
    // Listen for wallet changes
    eventBus.subscribe(EventTypes.WALLET_CHANGED, this.handleWalletChanged.bind(this));
    log.debug('Subscribed to WALLET_CHANGED events');
    
    // Listen for cache invalidation events
    eventBus.subscribe(EventTypes.CITIZEN_PROFILE_UPDATED, this.invalidateCitizenCache.bind(this));
    log.debug('Subscribed to CITIZEN_PROFILE_UPDATED events for cache invalidation');
    
    log.info('CitizenService initialized successfully');
  }
  
  // Singleton instance
  private static instance: CitizenService | null = null;
  
  /**
   * Get the singleton instance of CitizenService
   */
  public static getInstance(): CitizenService {
    if (!CitizenService.instance) {
      CitizenService.instance = new CitizenService();
    }
    return CitizenService.instance;
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
    log.info('Clearing all citizen data caches');
    this.citizensCache = null;
    this.citizenByUsernameCache.clear();
    this.citizenByWalletCache.clear();
    log.debug('All citizen data caches cleared');
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
   * Invalidate cache for a specific citizen
   */
  private invalidateCitizenCache(citizen: CitizenProfile): void {
    if (!citizen) return;
    
    log.debug(`Invalidating cache for citizen: ${citizen.username}`);
    
    // Remove from username cache
    this.citizenByUsernameCache.delete(citizen.username);
    
    // Remove from wallet cache if wallet address exists
    if (citizen.walletAddress) {
      this.citizenByWalletCache.delete(citizen.walletAddress);
    }
    
    // Invalidate citizens cache since it might contain this citizen
    this.citizensCache = null;
    
    log.debug('Citizen cache invalidated');
  }
  
  /**
   * Load all citizens from the API
   */
  public async loadCitizens(): Promise<Record<string, any>> {
    // Check cache first
    if (this.isCacheValid(this.citizensCache)) {
      log.info('Returning citizens from cache');
      return this.citizensCache!.data;
    }
    
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const endpoint = `${apiBaseUrl}/api/citizens`;
    
    log.info(`Fetching citizens from endpoint: ${endpoint}`);
    const startTime = performance.now();
    
    try {
      log.debug('Initiating API request to load citizens');
      const response = await fetch(endpoint);
      
      const responseTime = Math.round(performance.now() - startTime);
      log.debug(`API response received in ${responseTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        log.error(`Failed to load citizens: HTTP ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          endpoint
        });
        throw new ApiError(
          'Failed to load citizens', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug(`Parsed response data, received ${Array.isArray(data) ? data.length : 0} citizens`);
      
      if (!data || !Array.isArray(data)) {
        log.error('Invalid data format received from API', { 
          dataType: typeof data,
          isArray: Array.isArray(data)
        });
        throw new DataFormatError('Expected array of citizens');
      }
      
      // Convert array to record
      const citizensRecord: Record<string, any> = {};
      let validCitizenCount = 0;
      let invalidCitizenCount = 0;
      
      data.forEach(citizen => {
        if (citizen.citizen_name) {
          citizensRecord[citizen.citizen_name] = citizen;
          validCitizenCount++;
          log.debug(`Processed citizen: ${citizen.citizen_name}`, {
            hasCoatOfArms: !!citizen.coat_of_arms_image,
            hasColor: !!citizen.color
          });
        } else {
          invalidCitizenCount++;
          log.warn('Found citizen without citizen_name', citizen);
        }
      });
      
      log.info(`Processed ${validCitizenCount} valid citizens and ${invalidCitizenCount} invalid citizens`);
      this.citizens = citizensRecord;
      
      // Ensure ConsiglioDeiDieci is always present
      if (!this.citizens['ConsiglioDeiDieci']) {
        log.info('Adding default ConsiglioDeiDieci citizen to citizens collection');
        this.citizens['ConsiglioDeiDieci'] = {
          citizen_name: 'ConsiglioDeiDieci',
          color: '#8B0000', // Dark red
          coat_of_arms_image: null
        };
      }
      
      // Update cache
      this.citizensCache = {
        data: this.citizens,
        timestamp: Date.now()
      };
      log.debug('Updated citizens cache');
      
      // Clear individual citizen caches as they might be stale
      this.citizenByUsernameCache.clear();
      log.debug('Cleared citizen by username cache');
      
      // Notify listeners that citizens data has been loaded
      log.debug('Emitting CITIZENS_DATA_LOADED event');
      eventBus.emit(EventTypes.CITIZENS_DATA_LOADED, null);
      
      const totalTime = Math.round(performance.now() - startTime);
      log.info(`Successfully loaded ${Object.keys(this.citizens).length} citizens in ${totalTime}ms`);
      
      return this.citizens;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof DataFormatError) {
        log.error(error);
        // Re-throw typed errors
        throw error;
      }
      
      // Convert generic errors to typed errors
      log.error('Unexpected error loading citizens:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        endpoint
      );
    }
  }
  
  /**
   * Get all citizens
   */
  public getCitizens(): Record<string, any> {
    return this.citizens;
  }
  
  /**
   * Get a citizen by username
   * @throws {ValidationError} If username is invalid
   * @throws {NotFoundError} If citizen is not found
   */
  public getCitizenByUsername(username: string): any {
    log.debug(`Getting citizen by username: ${username}`);
    
    if (!username || typeof username !== 'string') {
      log.warn('Invalid username provided', { username, type: typeof username });
      throw new ValidationError('Invalid username', 'username');
    }
    
    // Check cache first
    const cachedEntry = this.citizenByUsernameCache.get(username);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning citizen from cache: ${username}`);
      return cachedEntry!.data;
    }
    
    const citizen = this.citizens[username];
    
    if (!citizen) {
      log.warn(`Citizen not found with username: ${username}`);
      throw new NotFoundError('Citizen', username);
    }
    
    // Update cache
    this.setCacheEntry(this.citizenByUsernameCache, username, citizen);
    log.debug(`Updated cache for citizen: ${username}`);
    
    log.debug(`Successfully retrieved citizen: ${username}`);
    return citizen;
  }
  
  /**
   * Get the current citizen profile
   */
  public getCurrentCitizen(): CitizenProfile | null {
    return this.currentCitizen;
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
  public async connectWallet(address: string): Promise<CitizenProfile | null> {
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
    const cachedEntry = this.citizenByWalletCache.get(address);
    if (this.isCacheValid(cachedEntry)) {
      log.info(`Returning citizen profile from cache for wallet: ${maskedAddress}`);
      this.currentCitizen = cachedEntry!.data;
      
      if (this.currentCitizen) {
        log.debug(`Cached profile found for wallet: ${maskedAddress}, username: ${this.currentCitizen.username}`);
        
        // Notify listeners
        log.debug('Emitting CITIZEN_PROFILE_UPDATED event');
        eventBus.emit(EventTypes.CITIZEN_PROFILE_UPDATED, this.currentCitizen);
      } else {
        log.debug(`Cached null profile for wallet: ${maskedAddress}`);
      }
      
      return this.currentCitizen;
    }
    
    // Fetch citizen profile
    const endpoint = `${getBackendBaseUrl()}/api/wallet/${address}`;
    log.debug(`Fetching citizen profile from endpoint: ${endpoint}`);
    
    const startTime = performance.now();
    
    try {
      log.debug('Initiating API request to fetch citizen profile');
      const response = await fetch(endpoint);
      
      const responseTime = Math.round(performance.now() - startTime);
      log.debug(`API response received in ${responseTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          log.info(`No citizen profile found for wallet: ${maskedAddress}`);
          
          // Cache the null result
          this.setCacheEntry(this.citizenByWalletCache, address, null);
          log.debug(`Cached null result for wallet: ${maskedAddress}`);
          
          return null;
        }
        
        log.error(`Failed to fetch citizen profile: HTTP ${response.status}`, {
          status: response.status,
          statusText: response.statusText,
          endpoint,
          maskedWallet: maskedAddress
        });
        
        throw new ApiError(
          'Failed to fetch citizen profile', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Parsed citizen profile data from API response', data);
      
      if (data.success && data.citizen && data.citizen.username) {
        const citizenData = data.citizen;
        log.info(`Found citizen profile for wallet: ${maskedAddress}, username: ${citizenData.username}`);
        log.debug('Citizen profile details from API', citizenData);
        
        // Create citizen profile
        this.currentCitizen = {
          username: citizenData.username,
          firstName: citizenData.firstName || citizenData.username.split(' ')[0] || '',
          lastName: citizenData.lastName || citizenData.username.split(' ').slice(1).join(' ') || '',
          coatOfArmsImageUrl: citizenData.coatOfArmsImageUrl || null,
          familyMotto: citizenData.familyMotto || undefined,
          // coatOfArms: citizenData.coatOfArms, // This field is not standard in CitizenProfile, ensure API provides if needed
          Ducats: citizenData.ducats || 0,
          color: citizenData.color || '#8B4513', // Default color if not provided
          walletAddress: address,
          guildId: citizenData.guildId || null // Include guildId
        };
        
        // Update cache
        this.setCacheEntry(this.citizenByWalletCache, address, this.currentCitizen);
        log.debug(`Updated cache for wallet: ${maskedAddress}`);
        
        // Also cache by username (using the structure expected by getCitizenByUsername if different)
        // For simplicity, let's assume getCitizenByUsername can handle CitizenProfile structure or adapt it.
        // If getCitizenByUsername expects a different structure, this part needs adjustment.
        this.setCacheEntry(this.citizenByUsernameCache, this.currentCitizen.username, this.currentCitizen);
        log.debug(`Also cached citizen by username: ${this.currentCitizen.username}`);
        
        // Store in localStorage
        log.debug('Storing citizen profile in local storage');
        localStorage.setItem('citizenProfile', JSON.stringify(this.currentCitizen));
        
        // Notify listeners
        log.debug('Emitting CITIZEN_PROFILE_UPDATED event');
        eventBus.emit(EventTypes.CITIZEN_PROFILE_UPDATED, this.currentCitizen);
        
        const totalTime = Math.round(performance.now() - startTime);
        log.info(`Successfully connected wallet and loaded profile in ${totalTime}ms`);
        
        return this.currentCitizen;
      }
      
      log.info(`No citizen data or username found for wallet: ${maskedAddress}`);
      
      // Cache the null result
      this.setCacheEntry(this.citizenByWalletCache, address, null);
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
      if (!this.walletAddress) {
        throw new ValidationError('Wallet address is not available', 'walletAddress');
      }
    
      const maskedAddress = `${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}`;
      log.debug(`Disconnecting wallet: ${maskedAddress}`);
      
      // Remove from wallet cache
      this.citizenByWalletCache.delete(this.walletAddress);
      log.debug(`Removed wallet from cache: ${maskedAddress}`);
    }
    
    if (this.currentCitizen) {
      log.debug(`Clearing citizen profile for: ${this.currentCitizen.username}`);
      
      // Remove from username cache
      this.citizenByUsernameCache.delete(this.currentCitizen.username);
      log.debug(`Removed username from cache: ${this.currentCitizen.username}`);
    }
    
    this.walletAddress = null;
    this.currentCitizen = null;
    
    // Clear storage
    log.debug('Removing wallet and profile data from storage');
    sessionStorage.removeItem('walletAddress');
    localStorage.removeItem('walletAddress');
    localStorage.removeItem('citizenProfile');
    
    // Notify listeners
    log.debug('Emitting WALLET_CHANGED event');
    eventBus.emit(EventTypes.WALLET_CHANGED);
    
    log.info('Wallet disconnected successfully');
  }
  
  /**
   * Update citizen profile
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ValidationError} If profile data is invalid
   * @throws {ApiError} If API request fails
   */
  public async updateCitizenProfile(profile: Partial<CitizenProfile>): Promise<CitizenProfile | null> {
    log.info('Updating citizen profile');
    
    if (!this.walletAddress) {
      log.warn('Attempted to update profile without connected wallet');
      throw new AuthenticationError('Wallet must be connected to update profile');
    }
    
    // Validate profile data
    if (profile.username === '') {
      log.warn('Invalid profile data: empty username');
      throw new ValidationError('Username cannot be empty', 'username');
    }
    
    const maskedAddress = this.walletAddress ? `${this.walletAddress.substring(0, 6)}...${this.walletAddress.substring(this.walletAddress.length - 4)}` : 'unknown';
    log.info(`Updating profile for wallet: ${maskedAddress}`);
    
    // Log what's being updated
    const changedFields = Object.keys(profile).filter(key => 
      profile[key as keyof CitizenProfile] !== this.currentCitizen?.[key as keyof CitizenProfile]
    );
    
    log.debug('Profile update details', {
      changedFields,
      currentUsername: this.currentCitizen?.username,
      newUsername: profile.username || this.currentCitizen?.username
    });
    
    const endpoint = `${getBackendBaseUrl()}/api/wallet`;
    log.debug(`Sending profile update to endpoint: ${endpoint}`);
    
    const startTime = performance.now();
    
    try {
      const requestBody = {
        wallet_address: this.walletAddress,
        citizen_name: profile.username || this.currentCitizen?.username,
        first_name: profile.firstName || this.currentCitizen?.firstName,
        last_name: profile.lastName || this.currentCitizen?.lastName,
        family_coat_of_arms: profile.coatOfArms || this.currentCitizen?.coatOfArms,
        family_motto: profile.familyMotto || this.currentCitizen?.familyMotto,
        coat_of_arms_image: profile.coatOfArmsImageUrl || this.currentCitizen?.coatOfArmsImageUrl,
        color: profile.color || this.currentCitizen?.color
      };
      
      log.debug('Prepared request payload', {
        hasUsername: !!requestBody.citizen_name,
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
      
      // Update current citizen
      const previousDucats = this.currentCitizen?.Ducats;
      this.currentCitizen = {
        ...this.currentCitizen,
        ...profile,
        Ducats: data.ducats,
        walletAddress: this.walletAddress
      } as CitizenProfile;
      
      log.debug('Updated citizen profile', {
        username: this.currentCitizen.username,
        DucatsChanged: previousDucats !== this.currentCitizen.Ducats,
        previousDucats,
        newDucats: this.currentCitizen.Ducats
      });
      
      // Update caches
      if (this.currentCitizen.username) {
        // Update username cache with API format
        this.setCacheEntry(this.citizenByUsernameCache, this.currentCitizen.username, {
          citizen_name: this.currentCitizen.username,
          first_name: this.currentCitizen.firstName,
          last_name: this.currentCitizen.lastName,
          coat_of_arms_image: this.currentCitizen.coatOfArmsImageUrl,
          family_motto: this.currentCitizen.familyMotto,
          family_coat_of_arms: this.currentCitizen.coatOfArms,
          ducats: this.currentCitizen.Ducats,
          color: this.currentCitizen.color,
          wallet_address: this.walletAddress
        });
        log.debug(`Updated username cache for: ${this.currentCitizen.username}`);
      }
      
      // Update wallet cache
      this.setCacheEntry(this.citizenByWalletCache, this.walletAddress, this.currentCitizen);
      log.debug(`Updated wallet cache for: ${maskedAddress}`);
      
      // Store in localStorage
      log.debug('Storing updated profile in local storage');
      localStorage.setItem('citizenProfile', JSON.stringify(this.currentCitizen));
      
      // Notify listeners
      log.debug('Emitting CITIZEN_PROFILE_UPDATED event');
      eventBus.emit(EventTypes.CITIZEN_PROFILE_UPDATED, this.currentCitizen);
      
      const totalTime = Math.round(performance.now() - startTime);
      log.info(`Successfully updated citizen profile in ${totalTime}ms`);
      
      return this.currentCitizen;
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
    
    // Load citizen profile if wallet is connected
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
