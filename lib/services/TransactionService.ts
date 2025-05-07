import { getApiBaseUrl } from '../apiUtils';
import { eventBus, EventTypes } from '../eventBus';
import { log } from '../logUtils';
import { 
  ApiError, 
  AuthenticationError, 
  DataFormatError, 
  NotFoundError, 
  ValidationError,
  ServiceError
} from '../errors/ServiceErrors';
import { getWalletAddress } from '../walletUtils';
import { Listing, Offer, Transaction } from '../store/marketStore';

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
  private transactionsByUserCache: Map<string, CacheEntry<Transaction[]>> = new Map();
  
  // Cache configuration
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 5 * 60 * 1000 // 5 minutes default TTL
  };
  
  constructor() {
    log.info('Initializing TransactionService');
    
    // Listen for events that should invalidate cache
    eventBus.subscribe(EventTypes.TRANSACTION_CREATED, this.invalidateTransactionsCache.bind(this));
    eventBus.subscribe(EventTypes.TRANSACTION_EXECUTED, this.invalidateTransactionsCache.bind(this));
    eventBus.subscribe(EventTypes.LISTING_CANCELLED, this.invalidateTransactionsCache.bind(this));
    eventBus.subscribe(EventTypes.OFFER_ACCEPTED, this.invalidateTransactionsCache.bind(this));
    
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
    this.transactionsByUserCache.clear();
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
    this.transactionsByUserCache.clear();
    
    // If we have specific transaction data, also invalidate related caches
    if (data && data.assetId) {
      this.transactionsByAssetCache.delete(data.assetId);
    }
    
    if (data && data.buyer) {
      this.transactionsByUserCache.delete(data.buyer);
    }
    
    if (data && data.seller) {
      this.transactionsByUserCache.delete(data.seller);
    }
  }
  
  /**
   * Create a new transaction
   * @throws {ValidationError} If required fields are missing
   * @throws {AuthenticationError} If wallet is not connected
   * @throws {ApiError} If API request fails
   */
  public async createTransaction(
    assetId: string, 
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
    log.info(`Creating transaction for ${assetType} ${assetId} from ${seller} to ${buyer} for ${price}`);
    
    // Validate inputs
    if (!assetId) {
      throw new ValidationError('Asset ID is required', 'assetId');
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
      const endpoint = `${getApiBaseUrl()}/api/transaction`;
      log.debug(`Creating transaction at endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: assetType,
          asset_id: assetId,
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
        assetId: data.asset_id,
        seller: data.seller,
        buyer: data.buyer,
        price: data.price,
        createdAt: data.created_at,
        executedAt: data.executed_at || new Date().toISOString(),
      };
      
      // Invalidate cache
      this.invalidateTransactionsCache({ 
        assetId: transaction.assetId,
        seller: transaction.seller,
        buyer: transaction.buyer
      });
      
      // Emit event
      eventBus.emit(EventTypes.TRANSACTION_CREATED, transaction);
      
      // Also emit land ownership changed event if this is a land transaction
      if (assetType === 'land') {
        eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
          landId: assetId,
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
      const endpoint = `${getApiBaseUrl()}/api/transaction/${transactionId}`;
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
        assetId: data.asset_id,
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
  public async getTransactionsByAsset(assetId: string): Promise<Transaction[]> {
    log.debug(`Getting transactions for asset: ${assetId}`);
    
    if (!assetId) {
      throw new ValidationError('Asset ID is required', 'assetId');
    }
    
    // Check cache first
    const cachedEntry = this.transactionsByAssetCache.get(assetId);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning transactions from cache for asset: ${assetId}`);
      return cachedEntry!.data;
    }
    
    try {
      const endpoint = `${getApiBaseUrl()}/api/transactions/land/${assetId}`;
      log.debug(`Fetching transactions from endpoint: ${endpoint}`);
      
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        if (response.status === 404) {
          log.info(`No transactions found for asset: ${assetId}`);
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
          assetId: item.asset_id,
          seller: item.seller,
          buyer: item.buyer,
          price: item.price,
          createdAt: item.created_at,
          executedAt: item.executed_at,
        }));
      
      // Update cache
      this.setCacheEntry(this.transactionsByAssetCache, assetId, transactions);
      
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
   * Get transactions by user
   * @throws {ValidationError} If user ID is missing
   * @throws {ApiError} If API request fails
   */
  public async getTransactionsByUser(userId?: string, role?: 'buyer' | 'seller'): Promise<Transaction[]> {
    // Get user ID from params or current wallet
    const userAddress = userId || getWalletAddress();
    if (!userAddress) {
      throw new AuthenticationError('Wallet must be connected to get transactions');
    }
    
    log.debug(`Getting transactions for user: ${userAddress}, role: ${role || 'any'}`);
    
    // Check cache first
    const cacheKey = `${userAddress}_${role || 'any'}`;
    const cachedEntry = this.transactionsByUserCache.get(cacheKey);
    if (this.isCacheValid(cachedEntry)) {
      log.debug(`Returning transactions from cache for user: ${userAddress}`);
      return cachedEntry!.data;
    }
    
    try {
      // For now, we'll use the transactions API to get all transactions
      // In the future, this could be a dedicated endpoint
      const endpoint = `${getApiBaseUrl()}/api/transactions`;
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
      
      // Convert API response to our Transaction interface and filter by user
      const transactions: Transaction[] = data
        .filter(item => {
          if (!item.executed_at) return false; // Only include executed transactions
          
          if (role === 'buyer') {
            return item.buyer === userAddress;
          } else if (role === 'seller') {
            return item.seller === userAddress;
          } else {
            return item.buyer === userAddress || item.seller === userAddress;
          }
        })
        .map(item => ({
          id: item.id,
          type: item.type,
          assetId: item.asset_id,
          seller: item.seller,
          buyer: item.buyer,
          price: item.price,
          createdAt: item.created_at,
          executedAt: item.executed_at,
        }));
      
      // Update cache
      this.setCacheEntry(this.transactionsByUserCache, cacheKey, transactions);
      
      return transactions;
    } catch (error) {
      if (error instanceof ApiError || 
          error instanceof AuthenticationError) {
        throw error;
      }
      
      log.error('Unexpected error fetching transactions by user:', error);
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'getTransactionsByUser'
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
      const endpoint = `${getApiBaseUrl()}/api/transaction/${transactionId}/execute`;
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
        assetId: data.asset_id,
        seller: data.seller,
        buyer: data.buyer,
        price: data.price,
        createdAt: data.created_at,
        executedAt: data.executed_at || new Date().toISOString(),
      };
      
      // Invalidate cache
      this.invalidateTransactionsCache({
        id: transaction.id,
        assetId: transaction.assetId,
        seller: transaction.seller,
        buyer: transaction.buyer
      });
      
      // Emit event
      eventBus.emit(EventTypes.TRANSACTION_EXECUTED, transaction);
      
      // Also emit land ownership changed event if this is a land transaction
      if (transaction.type === 'land') {
        eventBus.emit(EventTypes.LAND_OWNERSHIP_CHANGED, {
          landId: transaction.assetId,
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
