import { useState } from 'react';
import { ExternalLink, Star } from 'lucide-react';
import { Button } from '../ui/button';

interface AffiliateProductProps {
  name: string;
  description: string;
  price: string;
  rating: number;
  image: string;
  affiliateLink: string;
  commission?: string;
  platform: 'amazon' | 'matterhackers' | 'prusa' | 'other';
}

const affiliateProducts = [
  {
    name: "ELEGOO Mars 3 Pro 3D Printer",
    description: "Ultra-precise 4K monochrome LCD resin printer",
    price: "$179.99",
    rating: 4.5,
    image: "https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=300&h=200&fit=crop",
    affiliateLink: "https://amazon.com/dp/B09M3N7JQK?tag=your-tag", // Replace with your affiliate tag
    commission: "3-8%",
    platform: "amazon" as const
  },
  {
    name: "PLA+ Filament Bundle",
    description: "Premium PLA+ in 6 colors, 1.75mm",
    price: "$89.99",
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1612198188060-c7c2a3b66eae?w=300&h=200&fit=crop",
    affiliateLink: "https://www.matterhackers.com/store/l/pla-plus?aff=your-id", // Replace with your affiliate ID
    commission: "5-10%",
    platform: "matterhackers" as const
  },
  {
    name: "Fusion 360 Subscription",
    description: "Professional CAD software for 3D design",
    price: "$60/month",
    rating: 4.3,
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=200&fit=crop",
    affiliateLink: "https://autodesk.com/products/fusion-360?ref=your-ref", // Replace with your referral
    commission: "$50-200",
    platform: "other" as const
  }
];

export function AffiliateProduct({ 
  name, 
  description, 
  price, 
  rating, 
  image, 
  affiliateLink, 
  commission, 
  platform 
}: AffiliateProductProps) {
  
  const handleClick = () => {
    // Track affiliate click
    console.log('Affiliate click:', { name, platform, commission });
    
    // Analytics tracking
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'affiliate_click', {
        product_name: name,
        platform: platform,
        commission: commission
      });
    }
    
    window.open(affiliateLink, '_blank');
  };

  const getPlatformColor = () => {
    switch (platform) {
      case 'amazon': return 'bg-orange-500';
      case 'matterhackers': return 'bg-blue-500';
      case 'prusa': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="relative">
        <img 
          src={image} 
          alt={name}
          className="w-full h-32 object-cover"
        />
        <div className={`absolute top-2 left-2 ${getPlatformColor()} text-white text-xs px-2 py-1 rounded`}>
          {platform}
        </div>
        {commission && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
            {commission}
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-1 line-clamp-1">{name}</h3>
        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{description}</p>
        
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <Star 
                key={i} 
                className={`w-3 h-3 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`} 
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">({rating})</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg text-green-600">{price}</span>
          <Button 
            onClick={handleClick}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 h-auto"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Shop Now
          </Button>
        </div>
        
        <div className="text-xs text-gray-400 mt-2">
          Affiliate link - we earn commission
        </div>
      </div>
    </div>
  );
}

export function AffiliateProductGrid() {
  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-center">Recommended 3D Tools</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {affiliateProducts.map((product, index) => (
          <AffiliateProduct key={index} {...product} />
        ))}
      </div>
    </div>
  );
}

// Revenue tracking component
export function RevenueTracker() {
  const [earnings, setEarnings] = useState({
    adsense: 0,
    affiliates: 0,
    direct: 0
  });

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 m-4">
      <h3 className="text-lg font-semibold text-green-900 mb-4">
        💰 Revenue Tracker
      </h3>
      
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600">${earnings.adsense}</div>
          <div className="text-xs text-green-700">AdSense</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">${earnings.affiliates}</div>
          <div className="text-xs text-blue-700">Affiliates</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-600">${earnings.direct}</div>
          <div className="text-xs text-purple-700">Direct Ads</div>
        </div>
      </div>
      
      <div className="text-center mt-4">
        <div className="text-xl font-bold text-gray-800">
          Total: ${earnings.adsense + earnings.affiliates + earnings.direct}
        </div>
        <div className="text-xs text-gray-500">This month</div>
      </div>
    </div>
  );
}
