import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, BarChart3, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import STLViewer from '../components/STLViewer';
import ViewerControls from '../components/ViewerControls';
import STLToolsPanel from '../components/STLToolsPanel';
import AdManager from '../components/ads/AdManager';
import { AdSenseBottomBanners } from '../components/GoogleAdSenseAds';
import { useSTL } from '../context/STLContext';
import { STLToolMode } from '../lib/stlManipulator';

export default function Index() {
  const [showWelcome, setShowWelcome] = useState(true);
  const {
    toolMode,
    setToolMode,
    cleanupSTL,
    reducePoints,
    isProcessingTool,
    getGeometryStats,
    addError,
    viewerSettings,
    updateViewerSettings,
    exportSTL,
    geometry
  } = useSTL();

  const handleToolModeChange = (mode: STLToolMode) => {
    setToolMode(mode);
  };

  const handleCleanupSTL = async () => {
    const result = await cleanupSTL();
    if (result.success) {
      // Success message will be shown in console logs
    } else {
      addError(result.message);
    }
  };

  const handleReducePoints = async (reduction: number) => {
    const result = await reducePoints(reduction);
    if (result.success) {
      // Success message will be shown in console logs
    } else {
      addError(result.message);
    }
  };

  const handleRandomColorsChange = (checked: boolean) => {
    updateViewerSettings({ randomColors: checked });
  };

  const handleWireframeChange = (checked: boolean) => {
    updateViewerSettings({ wireframe: checked });
  };
  return (
    // <AdManager page="home">
      <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-black to-slate-800 relative">
      {/* Fullscreen 3D Canvas */}
      <div className="absolute inset-0">
        <STLViewer />
      </div>
      
      {/* Floating UI Controls */}
      <ViewerControls />

      {/* STL Tools Panel */}
      <STLToolsPanel
        activeToolMode={toolMode}
        onToolModeChange={handleToolModeChange}
        onCleanupSTL={handleCleanupSTL}
        onReducePoints={handleReducePoints}
        isProcessing={isProcessingTool}
        geometryStats={getGeometryStats()}
        randomColors={viewerSettings.randomColors}
        wireframe={viewerSettings.wireframe}
        onRandomColorsChange={handleRandomColorsChange}
        onWireframeChange={handleWireframeChange}
      />

      {/* Top Right Navigation */}
      <div className="fixed top-4 right-4 md:top-6 md:right-6 z-50 flex gap-3">
        {geometry && (
          <Button
            onClick={exportSTL}
            className="bg-green-600 hover:bg-green-700 text-white font-semibold hover:shadow-lg transition-all duration-200"
            size="sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export STL
          </Button>
        )}

        <Link to="/about">
          <Button
            className="bg-white/90 hover:bg-white text-black font-semibold hover:shadow-lg transition-all duration-200 border border-gray-300"
            size="sm"
          >
            <Info className="w-4 h-4 mr-2" />
            About
          </Button>
        </Link>
      </div>
      
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
                <p>✨ Clean up & reduce STL models</p>
                <p>🔍 Interactive facet highlighting</p>
              </div>
              <div className="mt-4 md:mt-6 text-xs text-white/40">
                Use the tools panel on the left to manipulate STL models
              </div>
              <div className="mt-3 text-xs text-blue-400">
                Click anywhere to start exploring →
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Google AdSense Bottom Banner Ads - Temporarily disabled for testing */}
      {/* <AdSenseBottomBanners /> */}

      {/* Invisible Analytics Button - Bottom Left */}
      <div className="fixed bottom-4 left-4 md:bottom-6 md:left-6 z-50">
        <Link to="/analytics">
          <button
            className="w-10 h-10 bg-black/20 hover:bg-black/40 backdrop-blur-sm transition-all duration-300 rounded-lg opacity-20 hover:opacity-60 border border-white/10"
            title="Analytics Dashboard"
          >
            <BarChart3 className="w-5 h-5 text-white/70 mx-auto" />
          </button>
        </Link>
      </div>
      </div>
    // </AdManager>
  );
}
