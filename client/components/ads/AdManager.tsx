import { useState, useEffect } from 'react';
import AdUnit from './AdUnit';
// Auth removed - always show ads

interface AdManagerProps {
  page: 'home' | 'about' | 'profile';
  children: React.ReactNode;
}

export default function AdManager({ page, children }: AdManagerProps) {
  const { isPremium, isAuthenticated } = useAuth();
  const [showBottomBanner, setShowBottomBanner] = useState(true);
  const [showSidebarAd, setShowSidebarAd] = useState(true);

  // Don't show ads to premium users
  if (isPremium) {
    return <>{children}</>;
  }

  const adConfig = {
    home: {
      showBottomBanner: true,
      showSidebarAd: window.innerWidth > 1024, // Only on desktop
      showInlineAds: false
    },
    about: {
      showBottomBanner: true,
      showSidebarAd: false,
      showInlineAds: true
    },
    profile: {
      showBottomBanner: false,
      showSidebarAd: false, 
      showInlineAds: true
    }
  };

  const config = adConfig[page];

  return (
    <div className="relative min-h-screen">
      {/* Main content */}
      <div className={config.showSidebarAd ? 'mr-0 lg:mr-72' : ''}>
        {children}
      </div>

      {/* Sidebar Ad (Desktop only) */}
      {config.showSidebarAd && showSidebarAd && (
        <div className="hidden lg:block fixed top-20 right-4 z-40">
          <AdUnit 
            position="sidebar" 
            size="medium"
            closeable
            onClose={() => setShowSidebarAd(false)}
          />
        </div>
      )}

      {/* Bottom Banner Ad */}
      {config.showBottomBanner && showBottomBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-black/20 to-transparent">
          <AdUnit 
            position="banner" 
            size="large"
            closeable
            onClose={() => setShowBottomBanner(false)}
            className="mx-auto"
          />
        </div>
      )}

      {/* Premium CTA for free users */}
      {!isPremium && isAuthenticated && (
        <div className="fixed bottom-20 left-4 z-40 hidden md:block">
          <div className="bg-gradient-to-r from-yellow-500/90 to-orange-500/90 backdrop-blur-sm text-white p-4 rounded-xl border border-yellow-500/30 max-w-xs">
            <h3 className="font-semibold mb-2">Remove Ads</h3>
            <p className="text-sm mb-3 opacity-90">
              Upgrade to Premium for an ad-free experience and advanced tools.
            </p>
            <button className="bg-white text-yellow-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors">
              Upgrade Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Hook for ad-related analytics
export function useAdAnalytics() {
  const { isPremium } = useAuth();

  const trackAdView = (adId: string, position: string) => {
    if (isPremium) return;
    
    // Track ad impressions
    console.log('Ad viewed:', { adId, position, timestamp: new Date().toISOString() });
    
    // Send to analytics service (Google Analytics, etc.)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'ad_impression', {
        ad_id: adId,
        ad_position: position
      });
    }
  };

  const trackAdClick = (adId: string, position: string, destination: string) => {
    if (isPremium) return;
    
    console.log('Ad clicked:', { adId, position, destination, timestamp: new Date().toISOString() });
    
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'ad_click', {
        ad_id: adId,
        ad_position: position,
        destination_url: destination
      });
    }
  };

  return { trackAdView, trackAdClick };
}
