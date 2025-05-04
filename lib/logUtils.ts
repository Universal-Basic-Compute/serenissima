const isProduction = process.env.NODE_ENV === 'production';

// Create a timestamp for log entries
const getTimestamp = () => {
  return new Date().toISOString();
};

// Store recent errors for debugging purposes (only in development)
const recentErrors: Array<{timestamp: string, message: string, details: any}> = [];
const MAX_STORED_ERRORS = 10;

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
      
      // Extract error message and details
      if (args.length > 0) {
        if (args[0] instanceof Error) {
          errorMessage = args[0].message || 'Unknown error';
          errorDetails = {
            name: args[0].name,
            stack: args[0].stack,
            additionalInfo: args.slice(1)
          };
        } else if (typeof args[0] === 'string') {
          errorMessage = args[0];
          errorDetails = args.slice(1);
        } else {
          errorMessage = 'Unknown error';
          errorDetails = args;
        }
      }
      
      // Add to recent errors
      recentErrors.unshift({
        timestamp,
        message: errorMessage,
        details: errorDetails
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
