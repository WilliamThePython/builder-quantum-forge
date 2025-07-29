import { useState } from 'react';
import { X } from 'lucide-react';

interface SimpleAdProps {
  type: 'banner' | 'vertical';
  position?: 'left' | 'right' | 'bottom';
  className?: string;
}

const adSamples = {
  banner: [
    {
      title: "Professional 3D Printing",
      text: "High-quality STL printing services",
      cta: "Learn More",
      color: "bg-blue-50 border-blue-200 text-blue-800"
    },
    {
      title: "CAD Software 50% Off",
      text: "Professional design tools for creators",
      cta: "Get Deal", 
      color: "bg-green-50 border-green-200 text-green-800"
    }
  ],
  vertical: [
    {
      title: "3D Design Course",
      text: "Master STL creation from scratch",
      cta: "Start Free",
      color: "bg-purple-50 border-purple-200 text-purple-800"
    },
    {
      title: "Premium Filaments",
      text: "High-quality materials for your prints",
      cta: "Shop Now",
      color: "bg-orange-50 border-orange-200 text-orange-800"
    },
    {
      title: "3D Scanner Pro",
      text: "Turn real objects into STL files",
      cta: "Explore",
      color: "bg-indigo-50 border-indigo-200 text-indigo-800"
    }
  ]
};

export function SimpleAd({ type, position = 'bottom', className = '' }: SimpleAdProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [currentAd, setCurrentAd] = useState(0);
  
  if (!isVisible) return null;

  const ads = adSamples[type];
  const ad = ads[currentAd % ads.length];

  const handleClose = () => setIsVisible(false);

  if (type === 'banner') {
    return (
      <div className={`relative ${className}`}>
        <div className={`${ad.color} border rounded-lg p-3 shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <div>
                  <h4 className="font-medium text-sm">{ad.title}</h4>
                  <p className="text-xs opacity-75">{ad.text}</p>
                </div>
                <button className="text-xs px-3 py-1 bg-white/70 rounded border hover:bg-white/90 transition-colors">
                  {ad.cta}
                </button>
              </div>
            </div>
            <button 
              onClick={handleClose}
              className="ml-2 p-1 hover:bg-white/50 rounded transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs opacity-50 mt-1">Advertisement</div>
        </div>
      </div>
    );
  }

  if (type === 'vertical') {
    return (
      <div className={`relative ${className}`}>
        <div className={`${ad.color} border rounded-lg p-4 shadow-sm`}>
          <button 
            onClick={handleClose}
            className="absolute top-2 right-2 p-1 hover:bg-white/50 rounded transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
          
          <div className="text-center">
            <h4 className="font-medium text-sm mb-2">{ad.title}</h4>
            <p className="text-xs opacity-75 mb-3">{ad.text}</p>
            <button className="text-xs px-3 py-1.5 bg-white/70 rounded border hover:bg-white/90 transition-colors w-full">
              {ad.cta}
            </button>
          </div>
          
          <div className="text-xs opacity-50 mt-3 text-center">Ad</div>
        </div>
      </div>
    );
  }

  return null;
}

// Banner ads for bottom of main page
export function BottomBannerAds() {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-30 pointer-events-none">
      <div className="max-w-6xl mx-auto pointer-events-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SimpleAd type="banner" />
          <SimpleAd type="banner" />
        </div>
      </div>
    </div>
  );
}

// Vertical ads for About page sides
export function SidebarAds() {
  return (
    <>
      {/* Left sidebar ad */}
      <div className="hidden lg:block fixed left-4 top-1/2 transform -translate-y-1/2 z-20 w-48">
        <SimpleAd type="vertical" position="left" />
      </div>
      
      {/* Right sidebar ad */}
      <div className="hidden lg:block fixed right-4 top-1/2 transform -translate-y-1/2 z-20 w-48">
        <SimpleAd type="vertical" position="right" />
      </div>
    </>
  );
}
