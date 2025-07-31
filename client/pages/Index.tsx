import { useState } from 'react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, BarChart3 } from 'lucide-react';
import { Button } from '../components/ui/button';
import STLViewer from '../components/STLViewer';
import STLWorkflowPanel from '../components/STLWorkflowPanel';
import TriangleStatsDisplay from '../components/TriangleStatsDisplay';
import OffscreenAds from '../components/OffscreenAds';
import AdManager from '../components/ads/AdManager';
import { AdSenseBottomBanners } from '../components/GoogleAdSenseAds';
import { useSTL } from '../context/STLContext';
import { STLToolMode } from '../lib/stlManipulator';
import { useIsMobile } from '../hooks/use-mobile';

export default function Index() {
  const isMobile = useIsMobile();
  const [showWelcome, setShowWelcome] = useState(true);

  // Defensive STL context access
  let stlContext;
  try {
    stlContext = useSTL();
  } catch (error) {
    console.error('Failed to access STL context:', error);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
          <p>Initializing 3D Tools...</p>
        </div>
      </div>
    );
  }

  const {
    toolMode,
    setToolMode,
    reducePoints,
    isProcessingTool,
    getGeometryStats,
    addError,
    viewerSettings,
    updateViewerSettings
  } = stlContext;

  const handleToolModeChange = (mode: STLToolMode) => {
    setToolMode(mode);
  };

  const handleReducePoints = async (reduction: number, method: 'random' | 'best') => {
    const result = await reducePoints(reduction, method);
    if (result.success) {
      // Success message will be shown in console logs
    } else {
      addError(result.message);
    }
  };

  const handleRandomColorsChange = (checked: boolean) => {
    if (checked) {
      // Turn off wireframe when enabling random colors
      updateViewerSettings({ randomColors: true, wireframe: false });
    } else {
      updateViewerSettings({ randomColors: false });
    }
  };

  const handleWireframeChange = (checked: boolean) => {
    if (checked) {
      // Turn off random colors when enabling wireframe
      updateViewerSettings({ wireframe: true, randomColors: false });
    } else {
      updateViewerSettings({ wireframe: false });
    }
  };
  return (
    // <AdManager page="home">
      <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-black to-slate-800 relative">
      {/* Fullscreen 3D Canvas */}
      <div className="absolute inset-0">
        <STLViewer />
      </div>
      
      {/* Unified STL Workflow Panel */}
      <STLWorkflowPanel
        activeToolMode={toolMode}
        onToolModeChange={handleToolModeChange}
        onReducePoints={handleReducePoints}
        isProcessing={isProcessingTool}
        geometryStats={getGeometryStats()}
        randomColors={viewerSettings.randomColors}
        wireframe={viewerSettings.wireframe}
        onRandomColorsChange={handleRandomColorsChange}
        onWireframeChange={handleWireframeChange}
      />

      {/* Top Right Navigation - adjusted for mobile */}
      <div className={`fixed z-40 ${
        isMobile
          ? 'top-4 right-4'
          : 'top-4 right-4 md:top-6 md:right-6'
      }`}>
        <Link to="/about">
          <Button
            className={`bg-white/90 hover:bg-white text-black font-semibold hover:shadow-lg transition-all duration-200 border border-gray-300 ${
              isMobile ? 'h-10 px-3' : ''
            }`}
            size={isMobile ? "sm" : "sm"}
          >
            <Info className={`${isMobile ? 'w-4 h-4' : 'w-4 h-4 mr-2'}`} />
            {!isMobile && 'About'}
          </Button>
        </Link>
      </div>
      
      {/* Triangle Stats Display */}
      <TriangleStatsDisplay />

      {/* Offscreen Ads (positioned off the right edge) */}
      <OffscreenAds />

      {/* Brand Watermark - mobile optimized */}
      <div className={`absolute z-40 ${
        isMobile
          ? 'bottom-4 right-4'
          : 'bottom-4 right-4 md:bottom-6 md:right-6'
      }`}>
        <div className={`bg-black/60 backdrop-blur-sm text-white/70 rounded-lg border border-white/10 ${
          isMobile ? 'px-2 py-1' : 'px-3 py-2 md:px-4'
        }`}>
          <div className={`font-medium ${
            isMobile ? 'text-xs' : 'text-xs md:text-sm'
          }`}>STL Viewer Platform</div>
          {!isMobile && (
            <div className="text-xs text-white/50 hidden md:block">Interactive 3D Model Viewer</div>
          )}
        </div>
      </div>

      {/* Welcome Overlay for First-Time Users - mobile optimized */}
      {showWelcome && (
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-30 cursor-pointer p-4"
          onClick={() => setShowWelcome(false)}
        >
          <div className={`text-center text-white mx-auto ${
            isMobile ? 'max-w-sm w-full' : 'max-w-xs md:max-w-md px-4 md:px-6'
          }`}>
            <div className={`bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 ${
              isMobile ? 'p-6' : 'p-6 md:p-8'
            }`}>
              <h1 className={`font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent ${
                isMobile ? 'text-xl mb-3' : 'text-2xl md:text-3xl mb-3 md:mb-4'
              }`}>
                STL Viewer Platform
              </h1>
              <p className={`text-white/80 ${
                isMobile ? 'text-sm mb-4' : 'text-base md:text-lg mb-4 md:mb-6'
              }`}>
                Interactive 3D model viewing and manipulation tools
              </p>
              <div className={`text-white/60 space-y-2 ${
                isMobile ? 'text-xs' : 'text-sm'
              }`}>
                <p>🎯 Upload your own STL files</p>
                <p>⚡ Real-time visualization controls</p>
                <p>🛠️ Advanced manipulation tools</p>
                <p>✨ Clean up & reduce STL models</p>
                <p>🔍 Interactive facet highlighting</p>
              </div>
              <div className={`text-white/40 ${
                isMobile ? 'mt-4 text-xs' : 'mt-4 md:mt-6 text-xs'
              }`}>
                {isMobile ? 'Tap the menu button to access tools' : 'Use the tools panel on the left to manipulate STL models'}
              </div>
              <div className={`text-blue-400 ${
                isMobile ? 'mt-2 text-xs' : 'mt-3 text-xs'
              }`}>
                {isMobile ? 'Tap anywhere to start exploring →' : 'Click anywhere to start exploring →'}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Google AdSense Bottom Banner Ads - Temporarily disabled for testing */}
      {/* <AdSenseBottomBanners /> */}

      {/* Analytics Button - mobile optimized positioning */}
      <div className={`fixed z-40 ${
        isMobile
          ? 'bottom-20 left-4'
          : 'bottom-4 left-4 md:bottom-6 md:left-6'
      }`}>
        <Link to="/analytics">
          <button
            className={`bg-black/20 hover:bg-black/40 backdrop-blur-sm transition-all duration-300 rounded-lg opacity-20 hover:opacity-60 border border-white/10 ${
              isMobile ? 'w-12 h-12' : 'w-10 h-10'
            }`}
            title="Analytics Dashboard"
          >
            <BarChart3 className={`text-white/70 mx-auto ${
              isMobile ? 'w-6 h-6' : 'w-5 h-5'
            }`} />
          </button>
        </Link>
      </div>
      </div>
    // </AdManager>
  );
}
