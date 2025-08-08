import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Heart, Users, Zap, Globe } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 text-white mesh-pattern">
      {/* Header with Back Button */}
      <header className="relative z-10 p-6">
        <Link to="/">
          <Button 
            variant="outline" 
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Intellimesh
          </Button>
        </Link>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="intellimesh-title text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            About Intellimesh
          </h1>
          <p className="text-xl text-blue-200/90 max-w-2xl mx-auto leading-relaxed intellimesh-mono">
            Next-generation platform for intelligent 3D mesh manipulation and fabrication. 
            Built for designers, engineers, and 3D enthusiasts worldwide.
          </p>
        </div>

        {/* About Us Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-8 flex items-center">
            <Users className="w-8 h-8 mr-3 text-blue-400" />
            About Us
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4 text-blue-400">Our Mission</h3>
                <p className="text-gray-300 leading-relaxed">
                  We believe intelligent mesh manipulation should be accessible to all creators.
                  Intellimesh provides smart tools for analyzing, optimizing, and fabricating 3D models
                  with AI-powered precision and professional-grade results.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4 text-green-400">Our Vision</h3>
                <p className="text-gray-300 leading-relaxed">
                  To bridge the gap between creative modeling and precision fabrication. We're building
                  the future where intelligent mesh processing enables seamless workflows from design
                  concept to physical creation.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center text-purple-400">
                  <Zap className="w-5 h-5 mr-2" />
                  Why Choose Intellimesh?
                </h3>
                <div className="grid md:grid-cols-3 gap-6 mt-4">
                  <div>
                    <h4 className="font-semibold text-white mb-2">🧠 AI-Powered</h4>
                    <p className="text-sm text-gray-400">Intelligent mesh analysis and automated optimization</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">🏭 Fabrication-Ready</h4>
                    <p className="text-sm text-gray-400">Optimized outputs for 3D printing and manufacturing</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white mb-2">⚡ Professional Grade</h4>
                    <p className="text-sm text-gray-400">Advanced geometric processing for creators and pros</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Contact Us Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-8 flex items-center">
            <Mail className="w-8 h-8 mr-3 text-green-400" />
            Contact Us
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4 text-green-400">Get in Touch</h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <Mail className="w-5 h-5 mr-3 text-gray-400" />
                    <div>
                      <p className="font-medium">General Inquiries</p>
                      <p className="text-sm text-gray-400">hello@intellimesh.pro</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Users className="w-5 h-5 mr-3 text-gray-400" />
                    <div>
                      <p className="font-medium">Support</p>
                      <p className="text-sm text-gray-400">support@intellimesh.pro</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Zap className="w-5 h-5 mr-3 text-gray-400" />
                    <div>
                      <p className="font-medium">Feature Requests</p>
                      <p className="text-sm text-gray-400">features@intellimesh.pro</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-4 text-blue-400">Connect With Us</h3>
                <p className="text-gray-300 mb-4">
                  Join our community of 3D enthusiasts and stay updated with the latest features and updates.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                    GitHub
                  </Button>
                  <Button variant="outline" size="sm" className="border-green-500/30 text-green-400 hover:bg-green-500/10">
                    Discord
                  </Button>
                  <Button variant="outline" size="sm" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                    Twitter
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Donate Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-8 flex items-center">
            <Heart className="w-8 h-8 mr-3 text-red-400" />
            Support Our Work
          </h2>
          
          <Card className="bg-gradient-to-r from-red-500/10 to-pink-500/10 border-red-500/20 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <Heart className="w-12 h-12 mx-auto mb-4 text-red-400" />
              <h3 className="text-2xl font-bold mb-4 text-white">Help Us Build the Future of 3D</h3>
              <p className="text-gray-300 mb-6 max-w-2xl mx-auto leading-relaxed">
                3D Tools is a passion project built by developers who believe in making 3D technology 
                accessible to everyone. Your support helps us maintain the platform, add new features, 
                and keep it free for the community.
              </p>
              
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                <div className="text-center">
                  <h4 className="font-semibold text-white mb-2">☕ Buy us Coffee</h4>
                  <p className="text-sm text-gray-400">Small donations that fuel late-night coding sessions</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-white mb-2">🚀 Feature Sponsor</h4>
                  <p className="text-sm text-gray-400">Help fund specific features and improvements</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-white mb-2">🌟 Platform Patron</h4>
                  <p className="text-sm text-gray-400">Ongoing support for platform development</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  <Heart className="w-4 h-4 mr-2" />
                  Donate via PayPal
                </Button>
                <Button variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10">
                  Support on Ko-fi
                </Button>
                <Button variant="outline" className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                  GitHub Sponsors
                </Button>
              </div>

              <p className="text-xs text-gray-500 mt-6">
                All donations go directly to platform development and hosting costs. We're grateful for any support! ❤️
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="text-center pt-8 border-t border-white/10">
          <p className="text-gray-400 mb-4">
            Built with ❤️ for the 3D community
          </p>
          <div className="flex justify-center items-center gap-2 text-sm text-gray-500">
            <Globe className="w-4 h-4" />
            <span>Making 3D accessible worldwide</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
