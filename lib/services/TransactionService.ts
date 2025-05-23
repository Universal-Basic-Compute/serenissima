import { getBackendBaseUrl } from '@/lib/utils/apiUtils';
import { eventBus } from '../utils/eventBus';
import { log } from '../utils/logUtils';
import { 
  ApiError, 
  AuthenticationError, 
  DataFormatError, 
  NotFoundError, 
  ValidationError,
  ServiceError
} from '../errors/ServiceErrors';
import { getWalletAddress } from '../utils/walletUtils';
import { Listing, Offer, Transaction } from '../store/contractStore';

// Extend the Listing interface to include updatedAt
interface ExtendedListing {
  id: string;
  asset: string;
  assetType?: 'land' | 'building' | 'bridge' | 'compute';
  seller: string;
  price: number;
  createdAt: string;
  updatedAt?: string;
  status: 'active' | 'cancelled' | 'sold';
  metadata?: {
    historicalName?: string;
    englishName?: string;
    description?: string;
  };
}

// Extend the Offer interface to include metadata
interface ExtendedOffer extends Offer {
  id: string;
  buyer: string;
  listingId: string;
  metadata?: {
    historicalName?: string;
    englishName?: string;
    description?: string;
  };
}

// Define event types for marketplace events
export const TransactionEventTypes = {
  TRANSACTION_CREATED: 'transactionCreated',
  TRANSACTION_EXECUTED: 'transactionExecuted',
  LISTING_CANCELLED: 'listingCancelled',
  OFFER_ACCEPTED: 'offerAccepted',
  LAND_OWNERSHIP_CHANGED: 'landOwnershipChanged'
};

// Define event types for land ownership changes
export const EventTypes = {
  LAND_OWNERSHIP_CHANGED: 'landOwnershipChanged'
};

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

// Create a singleton instance but don't export it directly
// Instead, provide a getter function to prevent circular dependencies
let transactionServiceInstance: TransactionService | null = null;


export function getTransactionService(): TransactionService {
  if (!transactionServiceInstance) {
    transactionServiceInstance = new TransactionService();
  }
  return transactionServiceInstance;
}

/**
 * Service for handling transactions
 */
export class TransactionService {
  // Cache storage
  private transactionsCache: Map<string, CacheEntry<Transaction>> = new Map();
  private transactionsByAssetCache: Map<string, CacheEntry<Transaction[]>> = new Map();
  private transactionsByCitizenCache: Map<string, CacheEntry<Transaction[]>> = new Map();
  
  // Cache configuration
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 5 * 60 * 1000 // 5 minutes default TTL
  };
  
  constructor() {
    log.info('Initializing TransactionService');
    
    // Listen for events that should invalidate cache
    eventBus.subscribe(TransactionEventTypes.TRANSACTION_CREATED, this.invalidateTransactionsCache.bind(this));
    eventBus.subscribe(TransactionEventTypes.TRANSACTION_EXECUTED, this.invalidateTransactionsCache.bind(this));
    eventBus.subscribe(TransactionEventTypes.LISTING_CANCELLED, this.invalidateTransactionsCache.bind(this));
    eventBus.subscribe(TransactionEventTypes.OFFER_ACCEPTED, this.invalidateTransactionsCache.bind(this));
    
    log.info('TransactionService initialized successfully');
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
    log.info('Clearing all transaction data caches');
    this.transactionsCache.clear();
    this.transactionsByAssetCache.clear();
    this.transactionsByCitizenCache.clear();
    log.debug('All transaction data caches cleared');
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
   * Invalidate transactions cache
   */
  private invalidateTransactionsCache(data: any): void {
    log.debug('Invalidating transactions cache');
    this.transactionsCache.clear();
    this.transactionsByAssetCache.clear();
    this.transactionsByCitizenCache.clear();
    
    // If we have specific transaction data, also invalidate related caches
    if (data && data.asset) {
      this.transactionsByAssetCache.delete(data.asset);
    }
    
    if (data && data.buyer) {
      this.transactionsByCitizenCache.delete(data.buyer);
    }
    
    if (data && data.seller) {
      this.transactionsByCitizenCache.delete(data.seller);
    }
  }
  
  /**
   * Create a new transaction
   * @throws {ValidationError} If required fields are missing
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ApiError} If API request fails
   */
  public async createTransaction(
    asset: string, 
    assetType: 'land' | 'building' | 'bridge' | 'compute', 
    seller: string, 
    buyer: string,
    price: number,
    metadata?: {
      historicalName?: string;
      englishName?: string;
      description?: string;
    }
  ): Promise<Transaction> {
    log.info(`Creating transaction for ${assetType} ${asset} from ${seller} to ${buyer} for ${price}`);
    
    // Validate inputs
    if (!asset) {
      throw new ValidationError('Asset ID is required', 'asset');
    }
    
    if (!assetType) {
      throw new ValidationError('Asset type is required', 'assetType');
    }
    
    if (!seller) {
      throw new ValidationError('Seller is required', 'seller');
    }
    
    if (!buyer) {
      throw new ValidationError('Buyer is required', 'buyer');
    }
    
    if (!price || price <= 0) {
      throw new ValidationError('Price must be greater than 0', 'price');
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction`;
      log.debug(`Creating transaction at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: assetType,
          asset: asset,
          seller: seller,
          buyer: buyer,
          price: price,
          historical_name: metadata?.historicalName,
          english_name: metadata?.englishName,
          description: metadata?.description
        }),
      });
      
      if (!response.ok) {
        throw new ApiError(
          'Failed to create transaction', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Transaction created successfully', data);
      
      // Convert API response to our Transaction interface
      const transaction: Transaction = {
        id: data.id,
        type: data.type,
        asset: data.asset,
        seller: data.seller,
        buyer: data.buyer,
        price: data.price,
        createdAt: data.created_at,
        executedAt: data.executed_at || new Date().toISOString(),
      };
      
      // Invalidate cache
      this.invalidateTransactionsCache({ 
        asset: transaction.asset,
        seller: transaction.seller,
        buyer: transaction.buyer
      });
      
      // Emit event
      eventBus.emit(TransactionEventTypes.TRANSACTION_CREATED, transaction);
      
      // Also emit land ownership changed event if this is a land transaction
      if (assetType === 'land') {
        eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
          landId: asset,
          newOwner: buyer,
          previousOwner: seller,
          timestamp: Date.now()
        });
      }
      
      return transaction;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError) {
        throw error;
      }
      
      log.error('Unexpected error creating transaction:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'createTransaction'
      );
    }
  }
  
  /**
   * Get a transaction by ID
   * @throws {NotFoundError} If transaction is not found
   * @throws {ApiError} If API request fails
   */
  public async getTransaction(transactionId: string): Promise<Transaction | null> {
    log.debug(`Getting transaction by ID: ${transactionId}`);
    
    if (!transactionId) {
      throw new ValidationError('Transaction ID is required', 'transactionId');
    }
    
    // Check cache first
    const cachedEntry = this.transactionsCache.get(transactionId);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning transaction from cache: ${transactionId}`);
      return cachedEntry!.data;
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction/${transactionId}`;
      log.debug(`Fetching transaction from endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        if (response.status === 404) {
          log.warn(`Transaction not found with ID: ${transactionId}`);
          return null;
        }
        
        throw new ApiError(
          'Failed to fetch transaction', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      
      // Convert API response to our Transaction interface
      const transaction: Transaction = {
        id: data.id,
        type: data.type,
        asset: data.asset,
        seller: data.seller,
        buyer: data.buyer,
        price: data.price,
        createdAt: data.created_at,
        executedAt: data.executed_at,
      };
      
      // Update cache
      this.setCacheEntry(this.transactionsCache, transactionId, transaction);
      
      return transaction;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      log.error('Unexpected error fetching transaction:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'getTransaction'
      );
    }
  }
  
  /**
   * Get transactions by asset ID
   * @throws {ApiError} If API request fails
   */
  public async getTransactionsByAsset(asset: string): Promise<Transaction[]> {
    log.debug(`Getting transactions for asset: ${asset}`);
    
    if (!asset) {
      throw new ValidationError('Asset ID is required', 'asset');
    }
    
    // Check cache first
    const cachedEntry = this.transactionsByAssetCache.get(asset);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning transactions from cache for asset: ${asset}`);
      return cachedEntry!.data;
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transactions/land/${asset}`;
      log.debug(`Fetching transactions from endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        if (response.status === 404) {
          log.info(`No transactions found for asset: ${asset}`);
          return [];
        }
        
        throw new ApiError(
          'Failed to fetch transactions', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        log.warn(`Invalid response format for transactions: ${typeof data}`);
        return [];
      }
      
      // Convert API response to our Transaction interface
      const transactions: Transaction[] = data
        .filter(item => item.executed_at) // Only include executed transactions
        .map(item => ({
          id: item.id,
          type: item.type,
          asset: item.asset,
          seller: item.seller,
          buyer: item.buyer,
          price: item.price,
          createdAt: item.created_at,
          executedAt: item.executed_at,
        }));
      
      // Update cache
      this.setCacheEntry(this.transactionsByAssetCache, asset, transactions);
      
      return transactions;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      log.error('Unexpected error fetching transactions by asset:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'getTransactionsByAsset'
      );
    }
  }
  
  /**
   * Get transactions by citizen
   * @throws {ValidationError} If citizen ID is missing
   * @throws {ApiError} If API request fails
   */
  public async getTransactionsByCitizen(citizenId?: string, role?: 'buyer' | 'seller'): Promise<Transaction[]> {
    // Get citizen ID from params or current wallet
    const citizenAddress = citizenId || getWalletAddress();
    if (!citizenAddress) {
      throw new AuthenticationError('Wallet must be connected to get transactions');
    }
    
    log.debug(`Getting transactions for citizen: ${citizenAddress}, role: ${role || 'any'}`);
    
    // Check cache first
    const cacheKey = `${citizenAddress}_${role || 'any'}`;
    const cachedEntry = this.transactionsByCitizenCache.get(cacheKey);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning transactions from cache for citizen: ${citizenAddress}`);
      return cachedEntry!.data;
    }
    
    try {
      // For now, we'll use the transactions API to get all transactions
      // In the future, this could be a dedicated endpoint
      const endpoint = `${getBackendBaseUrl()}/api/transactions`;
      log.debug(`Fetching transactions from endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new ApiError(
          'Failed to fetch transactions', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        log.warn(`Invalid response format for transactions: ${typeof data}`);
        return [];
      }
      
      // Convert API response to our Transaction interface and filter by citizen
      const transactions: Transaction[] = data
        .filter(item => {
          if (!item.executed_at) return false; // Only include executed transactions
          
          if (role === 'buyer') {
            return item.buyer === citizenAddress;
          } else if (role === 'seller') {
            return item.seller === citizenAddress;
          } else {
            return item.buyer === citizenAddress || item.seller === citizenAddress;
          }
        })
        .map(item => ({
          id: item.id,
          type: item.type,
          asset: item.asset,
          seller: item.seller,
          buyer: item.buyer,
          price: item.price,
          createdAt: item.created_at,
          executedAt: item.executed_at,
        }));
      
      // Update cache
      this.setCacheEntry(this.transactionsByCitizenCache, cacheKey, transactions);
      
      return transactions;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof AuthenticationError) {
        throw error;
      }
      
      log.error('Unexpected error fetching transactions by citizen:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'getTransactionsByCitizen'
      );
    }
  }
  
  /**
   * Create a new listing
   * @throws {ValidationError} If required fields are missing
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ApiError} If API request fails
   */
  public async createListing(
    asset: string, 
    assetType: 'land' | 'building' | 'bridge' | 'compute', 
    price: number,
    metadata?: {
      historicalName?: string;
      englishName?: string;
      description?: string;
    }
  ): Promise<Listing> {
    log.info(`Creating listing for ${assetType} ${asset} for ${price}`);
    
    // Validate inputs
    if (!asset) {
      throw new ValidationError('Asset ID is required', 'asset');
    }
    
    if (!assetType) {
      throw new ValidationError('Asset type is required', 'assetType');
    }
    
    if (!price || price <= 0) {
      throw new ValidationError('Price must be greater than 0', 'price');
    }
    
    // Get current wallet address
    const walletAddress = getWalletAddress();
    if (!walletAddress) {
      throw new AuthenticationError('Wallet must be connected to create a listing');
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction`;
      log.debug(`Creating listing at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: assetType,
          asset: asset,
          seller: walletAddress,
          price: price,
          historical_name: metadata?.historicalName,
          english_name: metadata?.englishName,
          description: metadata?.description
        }),
      });
      
      if (!response.ok) {
        throw new ApiError(
          'Failed to create listing', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Listing created successfully', data);
      
      // Convert API response to our Listing interface
      const listing: Listing = {
        id: data.id,
        asset: data.asset,
        assetType: assetType,
        seller: data.seller,
        price: data.price,
        createdAt: data.created_at,
        status: 'active'
      };
      
      // Invalidate cache
      this.invalidateTransactionsCache({ 
        asset: listing.asset,
        seller: listing.seller
      });
      
      // Emit event
      eventBus.emit(TransactionEventTypes.TRANSACTION_CREATED, listing);
      
      return listing;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError) {
        throw error;
      }
      
      log.error('Unexpected error creating listing:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'createListing'
      );
    }
  }
  
  /**
   * Cancel a listing
   * @throws {NotFoundError} If listing is not found
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ApiError} If API request fails
   */
  public async cancelListing(listingId: string): Promise<boolean> {
    log.info(`Canceling listing: ${listingId}`);
    
    if (!listingId) {
      throw new ValidationError('Listing ID is required', 'listingId');
    }
    
    // Get current wallet address
    const walletAddress = getWalletAddress();
    if (!walletAddress) {
      throw new AuthenticationError('Wallet must be connected to cancel a listing');
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction/${listingId}/cancel`;
      log.debug(`Canceling listing at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seller: walletAddress
        }),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError('Listing', listingId);
        }
        
        throw new ApiError(
          'Failed to cancel listing', 
          response.status, 
          endpoint
        );
      }
      
      // Invalidate cache
      this.invalidateTransactionsCache({ id: listingId });
      
      // Emit event
      eventBus.emit(TransactionEventTypes.LISTING_CANCELLED, { id: listingId });
      
      return true;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError ||
          error instanceof NotFoundError) {
        throw error;
      }
      
      log.error('Unexpected error canceling listing:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'cancelListing'
      );
    }
  }
  
  /**
   * Create an offer for an asset
   * @throws {ValidationError} If required fields are missing
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ApiError} If API request fails
   */
  public async createOffer(
    asset: string,
    assetType: 'land' | 'building' | 'bridge' | 'compute',
    seller: string,
    price: number,
    metadata?: {
      historicalName?: string;
      englishName?: string;
      description?: string;
    }
  ): Promise<Offer> {
    log.info(`Creating offer for ${assetType} ${asset} to ${seller} for ${price}`);
    
    // Validate inputs
    if (!asset) {
      throw new ValidationError('Asset ID is required', 'asset');
    }
    
    if (!assetType) {
      throw new ValidationError('Asset type is required', 'assetType');
    }
    
    if (!seller) {
      throw new ValidationError('Seller is required', 'seller');
    }
    
    if (!price || price <= 0) {
      throw new ValidationError('Price must be greater than 0', 'price');
    }
    
    // Get current wallet address
    const walletAddress = getWalletAddress();
    if (!walletAddress) {
      throw new AuthenticationError('Wallet must be connected to create an offer');
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction`;
      log.debug(`Creating offer at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: assetType,
          asset: asset,
          seller: seller,
          buyer: walletAddress,
          price: price,
          historical_name: metadata?.historicalName,
          english_name: metadata?.englishName,
          description: metadata?.description
        }),
      });
      
      if (!response.ok) {
        throw new ApiError(
          'Failed to create offer', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Offer created successfully', data);
      
      // Convert API response to our ExtendedOffer interface
      const offer: ExtendedOffer = {
        id: data.id,
        listingId: data.asset, // Using asset as listingId
        buyer: data.buyer,
        price: data.price,
        createdAt: data.created_at,
        status: 'pending',
        metadata: {
          historicalName: metadata?.historicalName,
          englishName: metadata?.englishName,
          description: metadata?.description
        }
      };
      
      // Invalidate cache
      this.invalidateTransactionsCache({ 
        asset: data.asset,
        seller: data.seller,
        buyer: offer.buyer
      });
      
      // Emit event
      eventBus.emit(TransactionEventTypes.TRANSACTION_CREATED, offer);
      
      return offer;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError) {
        throw error;
      }
      
      log.error('Unexpected error creating offer:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'createOffer'
      );
    }
  }
  
  /**
   * Cancel an offer
   * @throws {NotFoundError} If offer is not found
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ApiError} If API request fails
   */
  public async cancelOffer(offerId: string): Promise<boolean> {
    log.info(`Canceling offer: ${offerId}`);
    
    if (!offerId) {
      throw new ValidationError('Offer ID is required', 'offerId');
    }
    
    // Get current wallet address
    const walletAddress = getWalletAddress();
    if (!walletAddress) {
      throw new AuthenticationError('Wallet must be connected to cancel an offer');
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction/${offerId}/cancel`;
      log.debug(`Canceling offer at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyer: walletAddress
        }),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError('Offer', offerId);
        }
        
        throw new ApiError(
          'Failed to cancel offer', 
          response.status, 
          endpoint
        );
      }
      
      // Invalidate cache
      this.invalidateTransactionsCache({ offerId });
      
      // Emit event
      eventBus.emit(TransactionEventTypes.LISTING_CANCELLED, { offerId });
      
      return true;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError ||
          error instanceof NotFoundError) {
        throw error;
      }
      
      log.error('Unexpected error canceling offer:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'cancelOffer'
      );
    }
  }
  
  /**
   * Execute a transaction
   * @throws {NotFoundError} If transaction is not found
   * @throws {ApiError} If API request fails
   */
  public async executeTransaction(transactionId: string, buyer?: string): Promise<Transaction> {
    log.info(`Executing transaction: ${transactionId}`);
    
    if (!transactionId) {
      throw new ValidationError('Transaction ID is required', 'transactionId');
    }
    
    // Get buyer from params or current wallet
    const buyerAddress = buyer || getWalletAddress();
    if (!buyerAddress) {
      throw new AuthenticationError('Wallet must be connected to execute a transaction');
    }
    
    try {
      const endpoint = `${getBackendBaseUrl()}/api/transaction/${transactionId}/execute`;
      log.debug(`Executing transaction at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          buyer: buyerAddress
        }),
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundError('Transaction', transactionId);
        }
        
        throw new ApiError(
          'Failed to execute transaction', 
          response.status, 
          endpoint
        );
      }
      
      const data = await response.json();
      log.debug('Transaction executed successfully', data);
      
      // Convert API response to our Transaction interface
      const transaction: Transaction = {
        id: data.id,
        type: data.type,
        asset: data.asset,
        seller: data.seller,
        buyer: data.buyer,
        price: data.price,
        createdAt: data.created_at,
        executedAt: data.executed_at || new Date().toISOString(),
      };
      
      // Invalidate cache
      this.invalidateTransactionsCache({
        transactionId: transaction.id,
        asset: transaction.asset,
        seller: transaction.seller,
        buyer: transaction.buyer
      });
      
      // Emit event
      eventBus.emit(TransactionEventTypes.TRANSACTION_EXECUTED, transaction);
      
      // Also emit land ownership changed event if this is a land transaction
      if (transaction.type === 'land') {
        eventBus.emit(TransactionEventTypes.LAND_OWNERSHIP_CHANGED, {
          landId: transaction.asset,
          newOwner: transaction.buyer,
          previousOwner: transaction.seller,
          timestamp: Date.now()
        });
      }
      
      return transaction;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof ValidationError || 
          error instanceof AuthenticationError ||
          error instanceof NotFoundError) {
        throw error;
      }
      
      log.error('Unexpected error executing transaction:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'executeTransaction'
      );
    }
  }
}
