import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, DollarSign, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { AdSenseSetupInstructions } from '../components/GoogleAdSenseAds';

export default function AdSenseSetup() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <header className="relative z-10 p-6 bg-white/80 backdrop-blur-sm border-b">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <Link to="/">
            <Button 
              variant="outline" 
              className="hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to 3D Tools
            </Button>
          </Link>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800">AdSense Monetization Setup</h1>
            <p className="text-gray-600">Turn your 3D tools platform into a revenue stream</p>
          </div>
          
          <a 
            href="https://www.adsense.google.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hidden md:block"
          >
            <Button className="bg-green-600 hover:bg-green-700">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open AdSense
            </Button>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Revenue Potential */}
        <div className="bg-gradient-to-r from-green-500 to-blue-500 rounded-2xl p-8 text-white mb-8">
          <div className="text-center">
            <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-90" />
            <h2 className="text-3xl font-bold mb-4">Revenue Potential for Your 3D Tools Platform</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              <div className="text-center">
                <div className="text-4xl font-bold">$30-150</div>
                <div className="text-lg opacity-90">per month</div>
                <div className="text-sm opacity-75">with 1000 daily visitors</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold">$2-7</div>
                <div className="text-lg opacity-90">per 1000 views</div>
                <div className="text-sm opacity-75">3D/tech niche RPM</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold">$100</div>
                <div className="text-lg opacity-90">minimum payout</div>
                <div className="text-sm opacity-75">monthly payments</div>
              </div>
            </div>
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Current Implementation Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-medium text-green-800">Ad Placements Ready</div>
                <div className="text-sm text-green-600">Bottom banners & sidebar ads coded</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <div className="font-medium text-green-800">AdSense Script Added</div>
                <div className="text-sm text-green-600">Ready for your publisher ID</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
              <div>
                <div className="font-medium text-blue-800">AdSense Account Needed</div>
                <div className="text-sm text-blue-600">Apply at adsense.google.com</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">3</div>
              <div>
                <div className="font-medium text-blue-800">Configure Ad Units</div>
                <div className="text-sm text-blue-600">Replace placeholder IDs</div>
              </div>
            </div>
          </div>
        </div>

        {/* Setup Instructions */}
        <AdSenseSetupInstructions />

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6 border">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a 
              href="https://www.adsense.google.com" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button className="w-full bg-green-600 hover:bg-green-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                Apply for AdSense
              </Button>
            </a>
            
            <a 
              href="https://support.google.com/adsense/answer/9902?" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                AdSense Policies
              </Button>
            </a>
            
            <Link to="/about">
              <Button variant="outline" className="w-full">
                View Live Ads
              </Button>
            </Link>
          </div>
        </div>

        {/* Contact Info */}
        <div className="text-center mt-8 p-6 bg-gray-50 rounded-xl">
          <p className="text-gray-600">
            Need help with monetization? The ad placements are already optimized for your 3D platform.
            Just follow the steps above to start earning!
          </p>
        </div>
      </div>
    </div>
  );
}
