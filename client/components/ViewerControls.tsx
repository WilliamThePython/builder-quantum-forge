import { useState } from 'react';
import { 
  Settings, 
  Eye, 
  Palette, 
  Grid3X3, 
  Upload,
  Download,
  RefreshCw,
  Info
} from 'lucide-react';
import { useSTL } from '../context/STLContext';
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
    geometry
  } = useSTL();
  
  const [showControls, setShowControls] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadSTLFromFile(file);
    }
    // Reset input
    event.target.value = '';
  };

  const downloadSTL = () => {
    if (!geometry || !fileName) return;
    
    // For demo purposes - in a real app you'd export the current geometry
    console.log('Download functionality would be implemented here');
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
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".stl"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isLoading}
              />
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isLoading}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </label>

            <Button
              size="sm"
              variant="outline"
              onClick={loadDefaultSTL}
              disabled={isLoading}
              className="border-white/20 text-white hover:bg-white/10"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>

          {/* Settings Toggle */}
          <Popover open={showControls} onOpenChange={setShowControls}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                className="w-full border-white/20 text-white hover:bg-white/10"
              >
                <Settings className="w-4 h-4 mr-2" />
                Viewer Settings
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
                    {['#0a0a0a', '#1a1a2e', '#16213e', '#2a0845'].map((color) => (
                      <button
                        key={color}
                        className={`w-full h-8 rounded border-2 transition-all ${
                          viewerSettings.backgroundColor === color 
                            ? 'border-white' 
                            : 'border-white/20 hover:border-white/40'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateViewerSettings({ backgroundColor: color })}
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
        <div className="fixed top-6 right-6 z-50">
          <div className="bg-red-600/90 backdrop-blur-md text-white p-4 rounded-xl border border-red-500/30 max-w-sm">
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
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-black/80 backdrop-blur-md text-white px-6 py-3 rounded-xl border border-white/10">
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
