import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Log context-specific errors
    if (error.message.includes('useSTL must be used within an STLProvider')) {
      console.error('STL Context Error: Component tried to use STL context outside provider');
      console.error('This usually happens during hot reload or component tree changes');
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isContextError = this.state.error?.message.includes('useSTL must be used within an STLProvider');

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <div className="max-w-2xl w-full">
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {isContextError ? 'Application Context Error' : 'Something went wrong'}
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                {isContextError ? (
                  <div>
                    <p>The application context was not properly initialized. This can happen during development or page reloads.</p>
                    <p className="text-sm mt-2">Try refreshing the page or clicking the reset button below.</p>
                  </div>
                ) : (
                  <div>
                    <p>An unexpected error occurred in the application.</p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-medium">Error Details</summary>
                      <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                        {this.state.error?.toString()}
                        {this.state.errorInfo?.componentStack}
                      </pre>
                    </details>
                  </div>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Reset Application
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <Alert className="mt-4">
                <AlertDescription>
                  <div className="text-xs">
                    <strong>Development Mode:</strong> This error boundary is helping catch context initialization issues.
                    If you see this repeatedly, try:
                    <ul className="list-disc ml-4 mt-1">
                      <li>Refreshing the page</li>
                      <li>Checking the browser console for additional errors</li>
                      <li>Restarting the development server</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Functional component wrapper for easier use
export const STLErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary>
      {children}
    </ErrorBoundary>
  );
};
