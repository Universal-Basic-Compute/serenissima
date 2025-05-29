/**
 * Base error class for service-related errors
 */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
    // Ensures proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

/**
 * Error thrown when API requests fail
 */
export class ApiError extends ServiceError {
  public status: number;
  public endpoint: string;
  
  constructor(message: string, status: number, endpoint: string) {
    super(`API Error (${status}): ${message} [${endpoint}]`);
    this.name = 'ApiError';
    this.status = status;
    this.endpoint = endpoint;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Error thrown when authentication is required but not provided
 */
export class AuthenticationError extends ServiceError {
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when data validation fails
 */
export class ValidationError extends ServiceError {
  public field?: string;
  
  constructor(message: string, field?: string) {
    super(field ? `Validation error for ${field}: ${message}` : `Validation error: ${message}`);
    this.name = 'ValidationError';
    this.field = field;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when data is not found
 */
export class NotFoundError extends ServiceError {
  public resourceType: string;
  public identifier?: string;
  
  constructor(resourceType: string, identifier?: string) {
    super(identifier 
      ? `${resourceType} not found with identifier: ${identifier}` 
      : `${resourceType} not found`);
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.identifier = identifier;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error thrown when data format is invalid
 */
export class DataFormatError extends ServiceError {
  constructor(message: string) {
    super(`Data format error: ${message}`);
    this.name = 'DataFormatError';
    Object.setPrototypeOf(this, DataFormatError.prototype);
  }
}

/**
 * Error thrown when citizen is not authorized to perform an action
 */
export class UnauthorizedActionError extends ServiceError {
  constructor(message: string) {
    super(`Unauthorized action: ${message}`);
    this.name = 'UnauthorizedActionError';
    Object.setPrototypeOf(this, UnauthorizedActionError.prototype);
  }
}

/**
 * Error thrown when a listing is not found
 */
export class ListingNotFoundError extends NotFoundError {
  constructor(listingId: string) {
    super('Listing', listingId);
    this.name = 'ListingNotFoundError';
    Object.setPrototypeOf(this, ListingNotFoundError.prototype);
  }
}

/**
 * Error thrown when an offer is not found
 */
export class OfferNotFoundError extends NotFoundError {
  constructor(offerId: string) {
    super('Offer', offerId);
    this.name = 'OfferNotFoundError';
    Object.setPrototypeOf(this, OfferNotFoundError.prototype);
  }
}
