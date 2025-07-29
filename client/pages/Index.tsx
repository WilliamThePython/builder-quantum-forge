import { useState } from 'react';
import STLViewer from '../components/STLViewer';
import ViewerControls from '../components/ViewerControls';

export default function Index() {
  const [showWelcome, setShowWelcome] = useState(true);
  return (
    <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-black to-slate-800 relative">
      {/* Fullscreen 3D Canvas */}
      <div className="absolute inset-0">
        <STLViewer />
      </div>
      
      {/* Floating UI Controls */}
      <ViewerControls />
      
      {/* Brand Watermark */}
      <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 z-40">
        <div className="bg-black/60 backdrop-blur-sm text-white/70 px-3 py-2 md:px-4 rounded-lg border border-white/10">
          <div className="text-xs md:text-sm font-medium">STL Viewer Platform</div>
          <div className="text-xs text-white/50 hidden md:block">Interactive 3D Model Viewer</div>
        </div>
      </div>

      {/* Welcome Overlay for First-Time Users */}
      {showWelcome && (
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-30 cursor-pointer"
          onClick={() => setShowWelcome(false)}
        >
          <div className="text-center text-white max-w-xs md:max-w-md mx-auto px-4 md:px-6">
            <div className="bg-black/60 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/10">
              <h1 className="text-2xl md:text-3xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
                STL Viewer Platform
              </h1>
              <p className="text-base md:text-lg text-white/80 mb-4 md:mb-6">
                Interactive 3D model viewing and manipulation tools
              </p>
              <div className="text-sm text-white/60 space-y-2">
                <p>🎯 Upload your own STL files</p>
                <p>⚡ Real-time visualization controls</p>
                <p>🛠️ Advanced manipulation tools</p>
              </div>
              <div className="mt-4 md:mt-6 text-xs text-white/40">
                Use the controls on the left to get started
              </div>
              <div className="mt-3 text-xs text-blue-400">
                Click anywhere to start exploring →
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
