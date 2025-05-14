const isProduction = process.env.NODE_ENV === 'production';

// Create a timestamp for log entries
const getTimestamp = () => {
  return new Date().toISOString();
};

// Store recent errors for debugging purposes (only in development)
const recentErrors: Array<{timestamp: string, message: string, details: any, componentStack?: string}> = [];
const MAX_STORED_ERRORS = 20; // Increased from 10 to 20

// Track error frequency to detect recurring issues
const errorFrequency: Map<string, {count: number, firstSeen: Date, lastSeen: Date}> = new Map();

export const log = {
  debug: (...args: any[]) => {
    if (!isProduction) {
      console.debug(`[${getTimestamp()}] [DEBUG]`, ...args);
    }
  },
  info: (...args: any[]) => {
    if (!isProduction) {
      console.info(`[${getTimestamp()}] [INFO]`, ...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn(`[${getTimestamp()}] [WARN]`, ...args);
  },
  error: (...args: any[]) => {
    // Format the error message
    const timestamp = getTimestamp();
    console.error(`[${timestamp}] [ERROR]`, ...args);
    
    // In development, store recent errors for debugging
    if (!isProduction) {
      let errorMessage = '';
      let errorDetails = null;
      let componentStack = undefined;
      
      // Extract error message and details
      if (args.length > 0) {
        if (args[0] instanceof Error) {
          errorMessage = args[0].message || 'Unknown error';
          errorDetails = {
            name: args[0].name,
            stack: args[0].stack,
            additionalInfo: args.slice(1)
          };
          
          // Check for React ErrorInfo object which contains componentStack
          if (args.length > 1 && args[1] && typeof args[1] === 'object' && 'componentStack' in args[1]) {
            componentStack = args[1].componentStack;
          }
        } else if (typeof args[0] === 'string') {
          errorMessage = args[0];
          errorDetails = args.slice(1);
        } else {
          errorMessage = 'Unknown error';
          errorDetails = args;
        }
      }
      
      // Track error frequency
      const errorKey = errorMessage.substring(0, 100); // Use first 100 chars as key
      const now = new Date();
      if (errorFrequency.has(errorKey)) {
        const entry = errorFrequency.get(errorKey)!;
        entry.count += 1;
        entry.lastSeen = now;
        
        // Log if this error is happening frequently
        if (entry.count % 5 === 0) { // Log every 5 occurrences
          console.warn(`Frequent error detected: "${errorKey}" has occurred ${entry.count} times since ${entry.firstSeen.toISOString()}`);
        }
      } else {
        errorFrequency.set(errorKey, {
          count: 1,
          firstSeen: now,
          lastSeen: now
        });
      }
      
      // Add to recent errors
      recentErrors.unshift({
        timestamp,
        message: errorMessage,
        details: errorDetails,
        componentStack
      });
      
      // Keep only the most recent errors
      if (recentErrors.length > MAX_STORED_ERRORS) {
        recentErrors.pop();
      }
    }
  },
  // Get recent errors (for debugging tools)
  getRecentErrors: () => {
    return isProduction ? [] : [...recentErrors];
  },
  // Clear recent errors
  clearRecentErrors: () => {
    recentErrors.length = 0;
  }
};
