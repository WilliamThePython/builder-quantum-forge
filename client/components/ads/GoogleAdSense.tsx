import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

interface GoogleAdSenseProps {
  adSlot: string;
  adFormat?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  adLayout?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function GoogleAdSense({ 
  adSlot, 
  adFormat = 'auto', 
  adLayout,
  className = '',
  style = {}
}: GoogleAdSenseProps) {
  const { isPremium } = useAuth();

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.adsbygoogle) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (error) {
      console.error('AdSense error:', error);
    }
  }, []);

  // Don't show ads to premium users
  if (isPremium) return null;

  return (
    <div className={className} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', ...style }}
        data-ad-client="ca-pub-XXXXXXXXXX" // Replace with your AdSense publisher ID
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-ad-layout={adLayout}
        data-full-width-responsive="true"
      />
    </div>
  );
}

// Ready-to-use AdSense components for your specific needs
export function AdSenseBanner() {
  return (
    <GoogleAdSense
      adSlot="1234567890" // Replace with your ad slot ID
      adFormat="horizontal"
      className="w-full max-w-4xl mx-auto"
      style={{ minHeight: '90px' }}
    />
  );
}

export function AdSenseSidebar() {
  return (
    <GoogleAdSense
      adSlot="0987654321" // Replace with your ad slot ID
      adFormat="vertical"
      className="w-64"
      style={{ minHeight: '250px' }}
    />
  );
}

export function AdSenseSquare() {
  return (
    <GoogleAdSense
      adSlot="1111111111" // Replace with your ad slot ID
      adFormat="rectangle"
      className="w-80 h-64"
    />
  );
}

// Setup instructions component
export function AdSenseSetupGuide() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 m-4">
      <h3 className="text-lg font-semibold text-blue-900 mb-4">
        🚀 AdSense Setup Instructions
      </h3>
      
      <div className="space-y-4 text-sm text-blue-800">
        <div>
          <h4 className="font-medium mb-2">Step 1: Get AdSense Account</h4>
          <p>Visit <a href="https://www.adsense.google.com" className="underline">adsense.google.com</a> and apply</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-2">Step 2: Get Your Publisher ID</h4>
          <p>Replace "ca-pub-XXXXXXXXXX" with your actual publisher ID</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-2">Step 3: Create Ad Units</h4>
          <p>Create ad units in AdSense dashboard and replace slot IDs</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-2">Step 4: Add AdSense Script</h4>
          <p>Add this to your index.html head:</p>
          <code className="block bg-gray-100 p-2 rounded mt-1">
            {`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>`}
          </code>
        </div>
      </div>
    </div>
  );
}
