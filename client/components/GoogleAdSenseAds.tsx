import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

interface AdSenseAdProps {
  adSlot: string;
  adFormat?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  className?: string;
  style?: React.CSSProperties;
}

function AdSenseAd({ adSlot, adFormat = 'auto', className = '', style = {} }: AdSenseAdProps) {
  const { isPremium } = useAuth();
  const adRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (adRef.current && !isPremium) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        console.error('AdSense error:', error);
      }
    }
  }, [isPremium]);

  // Don't show ads to premium users
  if (isPremium) return null;

  return (
    <div ref={adRef} className={className} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', ...style }}
        data-ad-client="ca-pub-XXXXXXXXXX" // Replace with your actual publisher ID
        data-ad-slot={adSlot}
        data-ad-format={adFormat}
        data-full-width-responsive="true"
      />
    </div>
  );
}

// Bottom banner ads for main page
export function AdSenseBottomBanners() {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-30 pointer-events-auto">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left banner ad */}
          <AdSenseAd
            adSlot="1234567890" // Replace with your ad slot ID
            adFormat="horizontal"
            className="bg-white rounded-lg shadow-lg border overflow-hidden"
            style={{ minHeight: '90px', minWidth: '320px' }}
          />
          
          {/* Right banner ad */}
          <AdSenseAd
            adSlot="0987654321" // Replace with your ad slot ID  
            adFormat="horizontal"
            className="bg-white rounded-lg shadow-lg border overflow-hidden"
            style={{ minHeight: '90px', minWidth: '320px' }}
          />
        </div>
      </div>
    </div>
  );
}

// Sidebar ads for About page
export function AdSenseSidebarAds() {
  return (
    <>
      {/* Left sidebar ad */}
      <div className="hidden lg:block fixed left-4 top-1/2 transform -translate-y-1/2 z-20">
        <AdSenseAd
          adSlot="1111111111" // Replace with your ad slot ID
          adFormat="vertical"
          className="bg-white rounded-lg shadow-lg border overflow-hidden w-48"
          style={{ minHeight: '250px' }}
        />
      </div>
      
      {/* Right sidebar ad */}
      <div className="hidden lg:block fixed right-4 top-1/2 transform -translate-y-1/2 z-20">
        <AdSenseAd
          adSlot="2222222222" // Replace with your ad slot ID
          adFormat="vertical"
          className="bg-white rounded-lg shadow-lg border overflow-hidden w-48"
          style={{ minHeight: '250px' }}
        />
      </div>
    </>
  );
}

// Setup instructions for AdSense
export function AdSenseSetupInstructions() {
  return (
    <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 m-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-green-800 mb-4">
        💰 Google AdSense Setup - Get Paid!
      </h2>
      
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-lg border border-green-100">
          <h3 className="font-bold text-green-700 mb-2">Step 1: Apply for AdSense</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-green-800">
            <li>Go to <a href="https://www.adsense.google.com" className="underline font-medium" target="_blank">adsense.google.com</a></li>
            <li>Click "Get started" and sign in with your Google account</li>
            <li>Add your website: <strong>intellimesh.pro</strong></li>
            <li>Choose your country and payment currency</li>
            <li>Wait for approval (usually 1-14 days)</li>
          </ol>
        </div>

        <div className="bg-white p-4 rounded-lg border border-green-100">
          <h3 className="font-bold text-green-700 mb-2">Step 2: Get Your Publisher ID</h3>
          <p className="text-sm text-green-800 mb-2">After approval, you'll get a publisher ID that looks like:</p>
          <code className="bg-gray-100 px-2 py-1 rounded text-sm">ca-pub-1234567890123456</code>
          <p className="text-sm text-green-800 mt-2">Replace all instances of "ca-pub-XXXXXXXXXX" in the code with your actual ID.</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-green-100">
          <h3 className="font-bold text-green-700 mb-2">Step 3: Create Ad Units</h3>
          <p className="text-sm text-green-800 mb-2">In your AdSense dashboard, create these ad units:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
            <li><strong>Bottom Banner Left</strong> - 320x100 or responsive display ad</li>
            <li><strong>Bottom Banner Right</strong> - 320x100 or responsive display ad</li>
            <li><strong>Sidebar Left</strong> - 160x600 or vertical display ad</li>
            <li><strong>Sidebar Right</strong> - 160x600 or vertical display ad</li>
          </ul>
          <p className="text-sm text-green-800 mt-2">Replace the ad slot IDs (1234567890, etc.) with your actual slot IDs.</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-green-100">
          <h3 className="font-bold text-green-700 mb-2">Step 4: Payment Setup</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-green-800">
            <li>Add your bank account details in AdSense</li>
            <li>Verify your identity with tax information</li>
            <li>Minimum payout is $100</li>
            <li>Payments are made monthly</li>
          </ul>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-bold text-yellow-800 mb-2">💡 Revenue Expectations</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
            <li><strong>$1-5 per 1000 page views</strong> (RPM varies by niche)</li>
            <li><strong>3D/Tech niche</strong> typically performs well</li>
            <li><strong>1000 visitors/day</strong> = ~$30-150/month</li>
            <li><strong>Geographic traffic</strong> affects earnings (US/EU pays more)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
