import { useState } from 'react';
import {
  Settings,
  Eye,
  Palette,
  Grid3X3,
  Upload,
  Download,
  RefreshCw,
  Info,
  Crown,
  Lock
} from 'lucide-react';
import { useSTL } from '../context/STLContext';
import { useAuth } from '../context/AuthContext';
import { useFeatureAccess } from './auth/ProtectedRoute';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';

export default function ViewerControls() {
  const {
    viewerSettings,
    updateViewerSettings,
    loadSTLFromFile,
    loadDefaultSTL,
    fileName,
    isLoading,
    error,
    clearError,
    geometry,
    exportSTL
  } = useSTL();

  const { isAuthenticated, user } = useAuth();
  const { canUseAuthFeatures, canUsePremiumFeatures } = useFeatureAccess();
  const [showControls, setShowControls] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File upload triggered - event details:', event);
    const file = event.target.files?.[0];
    console.log('Selected file:', file);

    if (file) {
      console.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });

      console.log('Calling loadSTLFromFile...');
      loadSTLFromFile(file).catch(err => {
        console.error('Upload failed:', err);
      });
    } else {
      console.log('No file selected');
    }

    // Reset input
    event.target.value = '';
  };

  const downloadSTL = () => {
    exportSTL();
  };

  const getVertexCount = () => {
    if (!geometry?.attributes?.position) return 0;
    return geometry.attributes.position.count;
  };

  const getTriangleCount = () => {
    return Math.floor(getVertexCount() / 3);
  };

  return (
    <>
      {/* Main Controls Panel */}
      <div className="fixed top-4 left-4 md:top-6 md:left-6 z-50">
        <div className="bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-3 md:p-4 space-y-3 md:space-y-4 w-72 md:w-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-lg">STL Viewer</h2>
            <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
              {isLoading ? 'Loading...' : 'Active'}
            </Badge>
          </div>

          {/* File Info */}
          {fileName && (
            <div className="text-sm text-gray-300">
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-4 h-4" />
                <span className="font-medium">{fileName}</span>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <div>Vertices: {getVertexCount().toLocaleString()}</div>
                <div>Triangles: {getTriangleCount().toLocaleString()}</div>
              </div>
            </div>
          )}

          <Separator className="bg-white/10" />

          {/* Quick Actions */}
          <div className="flex gap-2">
            <div className="relative">
              <input
                type="file"
                accept=".stl"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isLoading}
                title="Upload STL file (max 50MB)"
              />
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 relative z-0"
                disabled={isLoading}
                title="Upload STL file from your computer"
                type="button"
              >
                <Upload className="w-4 h-4 mr-2" />
                {isLoading ? 'Loading...' : 'Upload STL'}
              </Button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={loadDefaultSTL}
              disabled={isLoading}
              className="border-gray-300 bg-white/90 text-black font-semibold hover:bg-white hover:shadow-md transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              RANDOM
            </Button>
          </div>

          {/* Settings Toggle */}
          <Popover open={showControls} onOpenChange={setShowControls}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="w-full border-gray-300 bg-white/90 text-black font-semibold hover:bg-white hover:shadow-md transition-all duration-200"
              >
                <Settings className="w-4 h-4 mr-2" />
                SETTINGS
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              sideOffset={8}
              className="w-72 md:w-80 bg-black/90 backdrop-blur-md border-white/10 text-white"
            >
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Display Options</h3>
                
                {/* Show Edges */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Grid3X3 className="w-4 h-4" />
                    <Label htmlFor="edges" className="text-sm">Show Edges</Label>
                  </div>
                  <Switch
                    id="edges"
                    checked={viewerSettings.showEdges}
                    onCheckedChange={(checked) => 
                      updateViewerSettings({ showEdges: checked })
                    }
                  />
                </div>

                {/* Random Colors */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    <Label htmlFor="colors" className="text-sm">Random Colors</Label>
                  </div>
                  <Switch
                    id="colors"
                    checked={viewerSettings.randomColors}
                    onCheckedChange={(checked) => 
                      updateViewerSettings({ randomColors: checked })
                    }
                  />
                </div>

                {/* Wireframe */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <Label htmlFor="wireframe" className="text-sm">Wireframe Mode</Label>
                  </div>
                  <Switch
                    id="wireframe"
                    checked={viewerSettings.wireframe}
                    onCheckedChange={(checked) => 
                      updateViewerSettings({ wireframe: checked })
                    }
                  />
                </div>

                <Separator className="bg-white/10" />

                {/* Background Color */}
                <div className="space-y-2">
                  <Label className="text-sm">Background</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { color: '#0a0a0a', name: 'Space Black' },
                      { color: '#1a1a2e', name: 'Deep Ocean' },
                      { color: '#16213e', name: 'Midnight Blue' },
                      { color: '#2a0845', name: 'Purple Night' },
                      { color: 'linear-gradient(to bottom, #B8E6FF 0%, #E8F5E8 50%, #C8E6C9 100%)', name: 'Meadow Sky' }
                    ].map((bg) => (
                      <button
                        key={bg.color}
                        className={`w-full h-8 rounded border-2 transition-all ${
                          viewerSettings.backgroundColor === bg.color
                            ? 'border-white'
                            : 'border-white/20 hover:border-white/40'
                        }`}
                        style={{ background: bg.color }}
                        onClick={() => updateViewerSettings({ backgroundColor: bg.color })}
                        title={bg.name}
                      />
                    ))}
                  </div>
                </div>

                {geometry && (
                  <>
                    <Separator className="bg-white/10" />
                    <Button
                      onClick={downloadSTL}
                      className="w-full bg-green-600 hover:bg-green-700"
                      size="sm"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export STL
                    </Button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 md:top-6 md:right-6 z-50">
          <div className="bg-red-600/90 backdrop-blur-md text-white p-3 md:p-4 rounded-xl border border-red-500/30 max-w-xs md:max-w-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm">{error}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearError}
                className="text-white hover:bg-white/10 h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 md:bottom-6">
          <div className="bg-black/80 backdrop-blur-md text-white px-4 py-2 md:px-6 md:py-3 rounded-xl border border-white/10">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span className="text-sm">Processing STL file...</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
