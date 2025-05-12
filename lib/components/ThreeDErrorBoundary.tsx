import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary specifically designed for Three.js/WebGL components
 * Provides specialized error handling for 3D rendering issues
 */
export class ThreeDErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Update state with error details
    this.setState({
      errorInfo
    });

    // Log the error
    console.error('ThreeDErrorBoundary caught an error:', error, errorInfo);
    
    // Check for WebGL-specific errors
    const isWebGLError = this.isWebGLError(error);
    if (isWebGLError) {
      console.error('WebGL error detected. This may indicate a problem with the graphics hardware or drivers.');
    }
  }

  /**
   * Attempt to determine if this is a WebGL-related error
   */
  isWebGLError(error: Error): boolean {
    const errorString = error.toString().toLowerCase();
    const stackString = error.stack?.toLowerCase() || '';
    
    // Check for common WebGL error indicators
    return (
      errorString.includes('webgl') ||
      errorString.includes('gl') ||
      errorString.includes('context') ||
      errorString.includes('shader') ||
      errorString.includes('three') ||
      errorString.includes('renderer') ||
      stackString.includes('webgl') ||
      stackString.includes('three.js')
    );
  }

  /**
   * Attempt to recover from the error
   */
  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Check if a custom fallback was provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      const isWebGLError = this.state.error && this.isWebGLError(this.state.error);
      
      return (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
          <h2 className="text-lg font-bold text-red-800">
            {isWebGLError ? '3D Rendering Error' : 'Component Error'}
          </h2>
          
          <p className="text-red-700 mt-2">
            {isWebGLError 
              ? 'There was a problem with the 3D rendering. This may be due to graphics hardware limitations or driver issues.'
              : 'There was a problem rendering this component.'}
          </p>
          
          {isWebGLError && (
            <div className="mt-2 text-red-600 text-sm">
              <p>Possible solutions:</p>
              <ul className="list-disc ml-5">
                <li>Try refreshing the page</li>
                <li>Update your graphics drivers</li>
                <li>Try a different browser</li>
                <li>Disable hardware acceleration in your browser settings</li>
              </ul>
            </div>
          )}
          
          <button
            onClick={this.handleRetry}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
          
          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <details className="mt-4 p-2 bg-gray-100 rounded">
              <summary className="cursor-pointer text-gray-700 font-medium">Error Details</summary>
              <pre className="mt-2 p-2 bg-gray-800 text-gray-200 rounded overflow-auto text-xs">
                {this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
