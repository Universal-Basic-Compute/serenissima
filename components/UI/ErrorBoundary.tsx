import React, { Component, ErrorInfo, ReactNode } from 'react';
import { log } from '@/lib/utils/logUtils';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  componentName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component to catch JavaScript errors in child component trees,
 * log those errors, and display a fallback UI instead of crashing the whole app.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      error: error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to the console
    log.error(
      `Error caught by ErrorBoundary${this.props.componentName ? ` in ${this.props.componentName}` : ''}:`, 
      error, 
      errorInfo
    );
    
    // Call the optional onError callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Render the fallback UI if provided, otherwise render a default error message
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="p-4 bg-red-50 border border-red-300 rounded-md">
          <h2 className="text-lg font-medium text-red-800 mb-2">
            Something went wrong
          </h2>
          <div className="text-sm text-red-700 mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
