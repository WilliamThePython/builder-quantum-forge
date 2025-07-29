import STLViewer from '../components/STLViewer';
import ViewerControls from '../components/ViewerControls';

export default function Index() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-black to-slate-800 relative">
      {/* Fullscreen 3D Canvas */}
      <div className="absolute inset-0">
        <STLViewer />
      </div>
      
      {/* Floating UI Controls */}
      <ViewerControls />
      
      {/* Brand Watermark */}
      <div className="absolute bottom-6 right-6 z-40">
        <div className="bg-black/60 backdrop-blur-sm text-white/70 px-4 py-2 rounded-lg border border-white/10">
          <div className="text-sm font-medium">STL Viewer Platform</div>
          <div className="text-xs text-white/50">Interactive 3D Model Viewer</div>
        </div>
      </div>

      {/* Welcome Overlay for First-Time Users */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-30 pointer-events-none">
        <div className="text-center text-white max-w-md mx-auto px-6">
          <div className="bg-black/60 backdrop-blur-md rounded-2xl p-8 border border-white/10 pointer-events-auto">
            <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              STL Viewer Platform
            </h1>
            <p className="text-lg text-white/80 mb-6">
              Interactive 3D model viewing and manipulation tools
            </p>
            <div className="text-sm text-white/60 space-y-2">
              <p>🎯 Upload your own STL files</p>
              <p>⚡ Real-time visualization controls</p>
              <p>🛠️ Advanced manipulation tools</p>
            </div>
            <div className="mt-6 text-xs text-white/40">
              Use the controls on the left to get started
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
