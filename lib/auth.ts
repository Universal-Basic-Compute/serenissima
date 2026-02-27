import { NextRequest } from 'next/server';
import { sign, verify } from 'jsonwebtoken';

// Types
export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'citizen' | 'merchant' | 'noble';
  permissions: string[];
}

export interface AuthContext {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET environment variable is required in production'); })() : 'dev-only-insecure-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Security validation
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') {
  console.warn('⚠️  JWT_SECRET not set — using insecure dev-only fallback. Do NOT use in production.');
}

/**
 * Generate JWT token for user
 */
export function generateToken(user: AuthUser): string {
  return sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token and return user
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    return verify(token, JWT_SECRET) as AuthUser;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Extract auth context from request
 */
export function getAuthContext(request: NextRequest): AuthContext {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token) {
    return { user: null, isAuthenticated: false };
  }

  const user = verifyToken(token);
  return {
    user,
    isAuthenticated: user !== null
  };
}

/**
 * Check if user has required permission
 */
export function hasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user) return false;
  
  // Admin has all permissions
  if (user.role === 'admin') return true;
  
  return user.permissions.includes(permission);
}

/**
 * Role-based access control
 */
export function hasRole(user: AuthUser | null, role: string): boolean {
  if (!user) return false;
  return user.role === role;
}

/**
 * Check if user can access citizen data
 */
export function canAccessCitizenData(user: AuthUser | null, citizenId?: string): boolean {
  if (!user) return false;
  
  // Admin can access all citizen data
  if (user.role === 'admin') return true;
  
  // User can access their own data
  if (citizenId && user.id === citizenId) return true;
  
  // Merchants and nobles can access public citizen data
  if (user.role === 'merchant' || user.role === 'noble') {
    return hasPermission(user, 'read:citizen:public');
  }
  
  return false;
}

/**
 * Check if user can access financial data
 */
export function canAccessFinancialData(user: AuthUser | null): boolean {
  if (!user) return false;
  
  return hasPermission(user, 'read:financial') || 
         user.role === 'admin' || 
         user.role === 'merchant';
}

/**
 * Rate limiting store (in-memory for now)
 */
const rateLimitStore = new Map<string, { count: number, resetTime: number }>();

/**
 * Simple rate limiting
 */
export function checkRateLimit(identifier: string, maxRequests: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

/**
 * Get client IP address
 */
export function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return request.ip || 'unknown';
}

/**
 * Default user permissions by role
 */
export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'], // All permissions
  citizen: ['read:citizen:own', 'update:citizen:own'],
  merchant: ['read:citizen:public', 'read:financial', 'create:transaction'],
  noble: ['read:citizen:public', 'read:financial', 'create:decree']
};

/**
 * Create user with default permissions
 */
export function createUser(id: string, username: string, role: 'admin' | 'citizen' | 'merchant' | 'noble'): AuthUser {
  return {
    id,
    username,
    role,
    permissions: DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.citizen
  };
}