// src/components/ErrorBoundary.tsx
// Error boundary to catch app crashes and provide graceful recovery

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    console.error('❌ App Error Boundary Caught:', error);
    console.error('Component Stack:', errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo
    });

    // You can also log to an error reporting service here
    // Example: Sentry.captureException(error);
  }

  handleReset = () => {
    // Clear error state and reload
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    // Reload the page to reset app state
    window.location.reload();
  };

  handleClearCache = () => {
    // Clear localStorage and reload
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear service worker cache if available
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      
      window.location.reload();
    } catch (e) {
      console.error('Failed to clear cache:', e);
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
            {/* Error Icon */}
            <div className="flex items-center justify-center mb-6">
              <div className="bg-red-100 rounded-full p-4">
                <AlertCircle className="w-12 h-12 text-red-600" />
              </div>
            </div>

            {/* Error Message */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Something went wrong
              </h1>
              <p className="text-gray-600">
                The app encountered an unexpected error. Don't worry, your data is safe.
              </p>
            </div>

            {/* Error Details (Collapsible) */}
            <details className="mb-6 bg-gray-50 rounded-lg p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                Technical Details
              </summary>
              <div className="mt-4 space-y-2">
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-1">Error Message:</p>
                  <pre className="text-xs text-red-600 bg-white p-2 rounded border border-gray-200 overflow-x-auto">
                    {this.state.error.message}
                  </pre>
                </div>
                {this.state.error.stack && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Stack Trace:</p>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40 overflow-y-auto">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}
                {this.state.errorInfo && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Component Stack:</p>
                    <pre className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 overflow-x-auto max-h-40 overflow-y-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            </details>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Reload App
              </button>
              
              <button
                onClick={this.handleClearCache}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Clear Cache & Reload
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> If this keeps happening:
              </p>
              <ul className="mt-2 text-sm text-blue-700 space-y-1 list-disc list-inside">
                <li>Check your internet connection</li>
                <li>Clear your browser cache completely</li>
                <li>Try accessing the app in incognito/private mode</li>
                <li>Update your browser to the latest version</li>
              </ul>
            </div>

            {/* Support Contact (Optional) */}
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">
                Need help? Check the browser console (F12) for more details.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;