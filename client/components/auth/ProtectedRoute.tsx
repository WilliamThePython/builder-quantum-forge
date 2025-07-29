import { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Lock, Crown } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  requirePremium?: boolean;
  fallback?: ReactNode;
  onAuthRequired?: () => void;
}

export default function ProtectedRoute({ 
  children, 
  requireAuth = false, 
  requirePremium = false, 
  fallback,
  onAuthRequired 
}: ProtectedRouteProps) {
  const { isAuthenticated, isPremium, user } = useAuth();

  // Check authentication requirement
  if (requireAuth && !isAuthenticated) {
    if (fallback) return <>{fallback}</>;
    
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-center bg-white/5 border border-white/10 rounded-xl p-8 backdrop-blur-sm">
          <Lock className="w-12 h-12 mx-auto mb-4 text-blue-400" />
          <h3 className="text-xl font-semibold text-white mb-2">Authentication Required</h3>
          <p className="text-gray-300 mb-4">Please sign in to access this feature.</p>
          <Button 
            onClick={onAuthRequired}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  // Check premium requirement
  if (requirePremium && !isPremium) {
    if (fallback) return <>{fallback}</>;
    
    return (
      <div className="flex items-center justify-center p-6">
        <div className="text-center bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-8 backdrop-blur-sm">
          <Crown className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
          <h3 className="text-xl font-semibold text-white mb-2">Premium Feature</h3>
          <p className="text-gray-300 mb-4">Upgrade to Premium to access advanced 3D tools.</p>
          <Button className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white">
            Upgrade Now
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook for easy feature gating in components
export function useFeatureAccess() {
  const { isAuthenticated, isPremium } = useAuth();
  
  return {
    canUseBasicFeatures: true,
    canUseAuthFeatures: isAuthenticated,
    canUsePremiumFeatures: isAuthenticated && isPremium,
    isGuest: !isAuthenticated,
    isFreeUser: isAuthenticated && !isPremium,
    isPremiumUser: isAuthenticated && isPremium
  };
}
