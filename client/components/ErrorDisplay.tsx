import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from './ui/button';

interface ErrorMessage {
  id: string;
  message: string;
  timestamp: number;
}

interface ErrorDisplayProps {
  errors: ErrorMessage[];
  onClearError: (id: string) => void;
}

export default function ErrorDisplay({ errors, onClearError }: ErrorDisplayProps) {
  if (errors.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
      <div className="flex flex-col items-center space-y-3 pointer-events-auto max-w-md w-full">
        {errors.map((error, index) => (
          <div
            key={error.id}
            className="bg-red-600/95 backdrop-blur-md text-white p-4 rounded-xl border border-red-500/30 w-full shadow-2xl transform transition-all duration-300 ease-out"
            style={{
              animationDelay: `${index * 100}ms`,
              animation: 'slideInFromTop 0.4s ease-out forwards'
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <AlertCircle className="w-5 h-5 text-red-200 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium leading-relaxed">{error.message}</p>
                  <p className="text-xs text-red-200 mt-1 opacity-75">
                    {new Date(error.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onClearError(error.id)}
                className="text-red-200 hover:text-white hover:bg-red-500/30 h-8 w-8 p-0 flex-shrink-0"
                title="Dismiss error"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      
      {/* CSS Animation Styles */}
      <style jsx>{`
        @keyframes slideInFromTop {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
