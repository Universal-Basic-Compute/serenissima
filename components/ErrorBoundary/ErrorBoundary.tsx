import React, { Component, ErrorInfo, ReactNode } from 'react';
import { log } from '@/lib/utils/logUtils';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: any; // When this prop changes, the error boundary will reset
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component that catches JavaScript errors in its child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      error: error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to our logging service
    log.error('Error caught by ErrorBoundary:', error, errorInfo);
    
    // Call the onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props) {
    // If resetKey changes, reset the error boundary
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ 
        hasError: false,
        error: null
      });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      // Default fallback UI
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-amber-50 p-6">
          <div className="text-red-600 text-2xl font-serif mb-4">Something went wrong</div>
          <div className="text-amber-800 italic text-lg max-w-md text-center mb-4">
            The Council of Ten regrets to inform you that there was an issue with this component.
          </div>
          {this.state.error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-4 max-w-md overflow-auto">
              <p className="text-red-800 font-mono text-sm">{this.state.error.toString()}</p>
            </div>
          )}
          <button 
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
