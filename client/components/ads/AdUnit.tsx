import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
// Auth removed - always show ads

interface AdUnitProps {
  position: 'banner' | 'sidebar' | 'modal' | 'inline';
  size?: 'small' | 'medium' | 'large';
  className?: string;
  closeable?: boolean;
  onClose?: () => void;
}

export default function AdUnit({ 
  position, 
  size = 'medium', 
  className = '', 
  closeable = false,
  onClose 
}: AdUnitProps) {
  const { isPremium } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const [currentAd, setCurrentAd] = useState(0);
  const adRef = useRef<HTMLDivElement>(null);

  // Don't show ads to premium users
  if (isPremium || !isVisible) return null;

  // Sample ads - replace with real ad network
  const ads = [
    {
      id: 1,
      type: 'product',
      title: 'Professional 3D Printer',
      description: 'High-precision printing for your STL models',
      image: 'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=400&h=200&fit=crop',
      cta: 'Shop Now',
      url: '#',
      sponsor: 'TechCorp'
    },
    {
      id: 2,
      type: 'software',
      title: 'CAD Design Software',
      description: 'Create stunning 3D models with ease',
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=200&fit=crop',
      cta: 'Free Trial',
      url: '#',
      sponsor: 'DesignPro'
    },
    {
      id: 3,
      type: 'service',
      title: 'Upgrade to Premium',
      description: 'Remove ads and unlock advanced tools',
      image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400&h=200&fit=crop',
      cta: 'Upgrade Now',
      url: '/upgrade',
      sponsor: '3D Tools',
      isPremiumAd: true
    }
  ];

  const ad = ads[currentAd];

  // Rotate ads every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAd((prev) => (prev + 1) % ads.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // AdSense integration point
  useEffect(() => {
    if (adRef.current && process.env.NODE_ENV === 'production') {
      // Initialize Google AdSense here
      try {
        // (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.error('AdSense error:', error);
      }
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  const handleAdClick = () => {
    // Track ad clicks for analytics
    console.log('Ad clicked:', ad.title);
    if (ad.url !== '#') {
      window.open(ad.url, '_blank');
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'small': return 'w-64 h-32';
      case 'medium': return 'w-80 h-40';
      case 'large': return 'w-96 h-48';
      default: return 'w-80 h-40';
    }
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'banner': return 'w-full max-w-4xl mx-auto';
      case 'sidebar': return 'w-64';
      case 'modal': return 'w-full max-w-md';
      case 'inline': return 'w-full';
      default: return '';
    }
  };

  return (
    <div 
      ref={adRef}
      className={`relative bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl ${getPositionClasses()} ${getSizeClasses()} ${className}`}
    >
      {/* Close button */}
      {closeable && (
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 z-10 p-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {/* Ad content */}
      <div 
        className="cursor-pointer h-full flex flex-col group"
        onClick={handleAdClick}
      >
        {/* Image */}
        <div className="relative overflow-hidden flex-1">
          <img 
            src={ad.image} 
            alt={ad.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <ExternalLink className="w-6 h-6 text-white" />
          </div>

          {/* Premium badge */}
          {ad.isPremiumAd && (
            <div className="absolute top-2 left-2">
              <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                <Zap className="w-3 h-3 mr-1" />
                Premium
              </Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 flex-shrink-0">
          <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">
            {ad.title}
          </h3>
          <p className="text-xs text-gray-600 mb-3 line-clamp-2">
            {ad.description}
          </p>
          
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Sponsored by {ad.sponsor}
            </span>
            <Button 
              size="sm" 
              className={`text-xs px-3 py-1 h-auto ${
                ad.isPremiumAd 
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {ad.cta}
            </Button>
          </div>
        </div>
      </div>

      {/* Ad indicators */}
      <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-1">
        {ads.map((_, index) => (
          <div
            key={index}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              index === currentAd ? 'bg-blue-500' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Google AdSense component for production
export function GoogleAdSenseUnit({ 
  adSlot, 
  adFormat = 'auto',
  className = '' 
}: {
  adSlot: string;
  adFormat?: string;
  className?: string;
}) {
  const { isPremium } = useAuth();
  
  if (isPremium) return null;

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-XXXXXXXXXX" // Replace with your AdSense client ID
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      />
    </div>
  );
}
