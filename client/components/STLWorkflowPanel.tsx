import React, { useState } from 'react';
import {
  Upload,
  RefreshCw,
  Info,
  Download,
  Settings,
  Palette,
  Eye,
  X,
  ChevronDown,
  ChevronRight,
  Package,
  Wrench
} from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { STLToolMode } from '../lib/stlManipulator';
import { useSTL } from '../context/STLContext';

interface STLWorkflowPanelProps {
  activeToolMode: STLToolMode;
  onToolModeChange: (mode: STLToolMode) => void;
  onReducePoints: (reduction: number, method: 'random' | 'best') => void;
  isProcessing: boolean;
  geometryStats: {
    vertices: number;
    triangles: number;
  } | null;
  randomColors: boolean;
  wireframe: boolean;
  onRandomColorsChange: (checked: boolean) => void;
  onWireframeChange: (checked: boolean) => void;
}

export default function STLWorkflowPanel({
  activeToolMode,
  onToolModeChange,
  onReducePoints,
  isProcessing,
  geometryStats,
  randomColors,
  wireframe,
  onRandomColorsChange,
  onWireframeChange
}: STLWorkflowPanelProps) {
  const {
    fileName,
    isLoading,
    geometry,
    loadSTLFromFile,
    loadDefaultSTL,
    exportSTL,
    exportParts,
    viewerSettings,
    updateViewerSettings,
    getDetailedGeometryStats
  } = useSTL();

  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [reductionAmount, setReductionAmount] = useState(0.5);
  const [reductionMethod, setReductionMethod] = useState<'quadric_edge_collapse' | 'vertex_clustering' | 'adaptive' | 'random'>('adaptive');
  const [expandedSections, setExpandedSections] = useState({
    upload: true,
    visualization: true,
    tools: true,
    export: true
  });

  // Triangle export settings
  const [showTriangleSettings, setShowTriangleSettings] = useState(false);
  const [triangleOptions, setTriangleOptions] = useState({
    partThickness: 2,
    scale: 1
  });

  // Export format selection
  const [showExportFormatDialog, setShowExportFormatDialog] = useState(false);
  const [exportType, setExportType] = useState<'complete' | 'parts'>('complete');

  // Professional simplification settings
  const [simplificationStats, setSimplificationStats] = useState<{
    originalStats?: any;
    newStats?: any;
    reductionAchieved?: number;
    processingTime?: number;
  }>({});

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadSTLFromFile(file).catch(err => {
        console.error('Upload failed:', err);
      });
    }
    event.target.value = '';
  };

  const handleExportClick = (type: 'complete' | 'parts') => {
    setExportType(type);
    setShowExportFormatDialog(true);
  };

  const handleFormatSelection = (format: 'stl' | 'obj') => {
    setShowExportFormatDialog(false);

    if (exportType === 'complete') {
      // Export complete model
      if (format === 'stl') {
        exportSTL();
      } else {
        // For OBJ export, we'll need to add this functionality to the context
        console.log('OBJ export selected - functionality to be implemented');
        // For now, show a message
        alert('OBJ export functionality coming soon!');
      }
    } else {
      // Export parts
      if (format === 'stl') {
        exportParts(triangleOptions);
      } else {
        // For OBJ parts export
        console.log('OBJ parts export selected - functionality to be implemented');
        alert('OBJ parts export functionality coming soon!');
      }
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const SectionHeader = ({ 
    title, 
    isExpanded, 
    onToggle, 
    badge 
  }: { 
    title: string; 
    isExpanded: boolean; 
    onToggle: () => void;
    badge?: string;
  }) => (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full text-white text-sm font-semibold py-2 hover:text-white/80 transition-colors"
    >
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span>{title}</span>
      </div>
      {badge && (
        <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
          {badge}
        </Badge>
      )}
    </button>
  );

  return (
    <div className="fixed left-4 top-4 bottom-4 z-50 w-80 max-h-[calc(100vh-2rem)]">
      <div className="bg-black/85 backdrop-blur-lg rounded-2xl border border-white/20 p-5 h-full overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-white font-bold text-xl mb-1">STL Workflow</h2>
          <p className="text-white/60 text-sm">Upload → Modify → Export</p>
        </div>

        {/* 1. UPLOAD SECTION */}
        <div className="mb-6">
          <SectionHeader
            title="1. UPLOAD & LOAD"
            isExpanded={expandedSections.upload}
            onToggle={() => toggleSection('upload')}
            badge={fileName ? "Ready" : "Upload File"}
          />
          
          {expandedSections.upload && (
            <div className="mt-4 space-y-4">
              {/* File Upload */}
              <div className="relative">
                <input
                  type="file"
                  accept=".stl,.obj"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  disabled={isLoading}
                  title="Upload STL or OBJ file (max 50MB)"
                />
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 relative z-0 h-12"
                  disabled={isLoading}
                  title="Upload STL or OBJ file from your computer"
                  type="button"
                >
                  <Upload className="w-5 h-5 mr-3" />
                  {isLoading ? 'Loading...' : 'Upload STL/OBJ File'}
                </Button>
              </div>

              {/* Random Model */}
              <Button
                onClick={loadDefaultSTL}
                disabled={isLoading}
                className="w-full border-gray-300 bg-white/10 hover:bg-white/20 text-white font-medium h-10"
                variant="outline"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Load Random Model
              </Button>

              {/* File Info */}
              {fileName && (
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    <span className="font-medium text-white text-sm">{fileName}</span>
                  </div>
                  {(() => {
                    const detailedStats = getDetailedGeometryStats();
                    if (!detailedStats) return null;

                    return (
                      <div className="text-xs text-white/70 space-y-1">
                        <div>Vertices: {detailedStats.vertices.toLocaleString()}</div>
                        <div>Edges: {detailedStats.edges.toLocaleString()}</div>
                        {detailedStats.polygonBreakdown.map(({ type, count }) => (
                          <div key={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}s: {count.toLocaleString()}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        <Separator className="bg-white/20 my-6" />

        {/* 2. VISUALIZATION SECTION */}
        <div className="mb-6">
          <SectionHeader
            title="2. VISUALIZATION"
            isExpanded={expandedSections.visualization}
            onToggle={() => toggleSection('visualization')}
          />
          
          {expandedSections.visualization && (
            <div className="mt-4 space-y-4">
              {/* Random Colors */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-white/70" />
                  <Label htmlFor="colors" className="text-sm text-white/80">Random Colors</Label>
                </div>
                <Switch
                  id="colors"
                  checked={randomColors}
                  onCheckedChange={onRandomColorsChange}
                />
              </div>

              {/* Wireframe */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-white/70" />
                  <Label htmlFor="wireframe" className="text-sm text-white/80">Wireframe Mode</Label>
                </div>
                <Switch
                  id="wireframe"
                  checked={wireframe}
                  onCheckedChange={onWireframeChange}
                />
              </div>

              {/* Background Settings */}
              <Popover open={showBackgroundSettings} onOpenChange={setShowBackgroundSettings}>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    className="w-full border-white/20 bg-white/5 hover:bg-white/10 text-white font-medium h-10"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Background Options
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="right"
                  sideOffset={8}
                  className="w-72 bg-black/90 backdrop-blur-md border-white/10 text-white"
                >
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">Background Options</h3>
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
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <Separator className="bg-white/20 my-6" />

        {/* 3. TOOLS SECTION */}
        <div className="mb-6">
          <SectionHeader
            title="3. REDUCE MODEL"
            isExpanded={expandedSections.tools}
            onToggle={() => toggleSection('tools')}
          />
          
          {expandedSections.tools && (
            <div className="mt-4 space-y-3">


              {/* Reduction Settings */}
              <div className="p-4 bg-white/10 rounded-lg border border-white/20">
                    <div className="text-white text-sm font-medium mb-3">
                      Model Reduction Settings
                    </div>

                    {/* Method Selection */}
                    <div className="mb-4">
                      <div className="text-white text-xs mb-2">Simplification Method</div>
                      <div className="grid grid-cols-2 gap-1">
                        <Button
                          onClick={() => setReductionMethod('random_vertex')}
                          className={`text-xs py-1 px-2 h-8 ${
                            reductionMethod === 'random_vertex'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/20 hover:bg-white/30 text-white/80'
                          }`}
                        >
                          Random Vertex
                        </Button>
                        <Button
                          onClick={() => setReductionMethod('quadric')}
                          className={`text-xs py-1 px-2 h-8 ${
                            reductionMethod === 'quadric'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/20 hover:bg-white/30 text-white/80'
                          }`}
                        >
                          Quadric ⭐
                        </Button>
                        <Button
                          onClick={() => setReductionMethod('grid_based')}
                          className={`text-xs py-1 px-2 h-8 ${
                            reductionMethod === 'grid_based'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/20 hover:bg-white/30 text-white/80'
                          }`}
                        >
                          Grid-Based
                        </Button>
                        <Button
                          onClick={() => setReductionMethod('triangle_collapse')}
                          className={`text-xs py-1 px-2 h-8 ${
                            reductionMethod === 'triangle_collapse'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/20 hover:bg-white/30 text-white/80'
                          }`}
                        >
                          Triangle Collapse
                        </Button>
                      </div>
                      <div className="text-xs text-white/60 mt-2 bg-white/5 rounded p-2">
                        {reductionMethod === 'random_vertex' && '🧪 Experimental: Fast vertex removal with reconnection. Good for high-poly models.'}
                        {reductionMethod === 'quadric' && '✅ Recommended: Shape-preserving decimation with minimal distortion. Best quality.'}
                        {reductionMethod === 'grid_based' && '🧱 Voxel simplification. Works well for mechanical/architectural parts.'}
                        {reductionMethod === 'triangle_collapse' && '🧩 Collapses triangles by curvature. Stable for medium-quality reductions.'}
                      </div>
                    </div>

                    {/* Reduction Amount */}
                    <div className="mb-3">
                      <div className="text-white text-xs mb-2">
                        Reduction Amount
                      </div>
                      <div className="space-y-2">
                        <input
                          type="range"
                          min="0.1"
                          max="0.9"
                          step="0.1"
                          value={reductionAmount}
                          onChange={(e) => setReductionAmount(parseFloat(e.target.value))}
                          className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                        />
                        <div className="flex justify-between text-xs text-white/70">
                          <span>10%</span>
                          <span className="font-medium text-white">
                            {Math.round(reductionAmount * 100)}%
                          </span>
                          <span>90%</span>
                        </div>
                      </div>
                    </div>

                    {/* Before/After Statistics */}
                    {simplificationStats.originalStats && simplificationStats.newStats && (
                      <div className="mb-3 p-2 bg-white/5 rounded border border-white/10">
                        <div className="text-white text-xs font-medium mb-1">Last Simplification Results:</div>
                        <div className="text-xs text-white/70 space-y-1">
                          <div className="flex justify-between">
                            <span>Vertices:</span>
                            <span>{simplificationStats.originalStats.vertices.toLocaleString()} → {simplificationStats.newStats.vertices.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Faces:</span>
                            <span>{simplificationStats.originalStats.faces.toLocaleString()} → {simplificationStats.newStats.faces.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Reduction:</span>
                            <span className="text-green-400">{(simplificationStats.reductionAchieved! * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Time:</span>
                            <span>{simplificationStats.processingTime}ms</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          onReducePoints(reductionAmount, reductionMethod);
                        }}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs py-2 h-8"
                        disabled={isProcessing}
                      >
                        Apply Simplification
                      </Button>

                    </div>
              </div>

            </div>
          )}
        </div>

        <Separator className="bg-white/20 my-6" />

        {/* 4. EXPORT SECTION */}
        <div>
          <SectionHeader
            title="4. EXPORT OPTIONS"
            isExpanded={expandedSections.export}
            onToggle={() => toggleSection('export')}
            badge={geometry ? "Ready" : "No Model"}
          />

          {expandedSections.export && (
            <div className="mt-4 space-y-4">
              {/* Standard STL Export */}
              <div>
                <div className="text-white text-xs font-medium mb-2 flex items-center gap-2">
                  <Download className="w-3 h-3" />
                  Standard Export
                </div>
                <Button
                  onClick={() => handleExportClick('complete')}
                  disabled={!geometry}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold h-10"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Complete Model
                </Button>
                <p className="text-xs text-white/60 mt-1">
                  Download the complete model in STL or OBJ format
                </p>
              </div>

              <Separator className="bg-white/20" />

              {/* Triangle Export */}
              <div>
                <div className="text-white text-xs font-medium mb-2 flex items-center gap-2">
                  <Package className="w-3 h-3" />
                  Polygon Parts Export
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleExportClick('parts')}
                    disabled={!geometry}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold h-10"
                  >
                    <Package className="w-4 h-4 mr-2" />
                    Export Polygon Parts
                  </Button>
                  <Button
                    onClick={() => setShowTriangleSettings(!showTriangleSettings)}
                    disabled={!geometry}
                    className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white h-10 px-3"
                    title="Configure parts settings"
                  >
                    <Wrench className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-white/60 mt-1">
                  Download individual polygon parts in STL or OBJ format
                </p>

                {/* Triangle Export Settings */}
                {showTriangleSettings && (
                  <div className="mt-3 p-4 bg-white/10 rounded-lg border border-white/20">
                    <div className="text-white text-sm font-medium mb-3">
                      Polygon Parts Settings
                    </div>

                    {/* Thickness Setting */}
                    <div className="mb-3">
                      <div className="text-white text-xs mb-2">
                        Part Thickness: {triangleOptions.partThickness}mm
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={triangleOptions.partThickness}
                        onChange={(e) => setTriangleOptions(prev => ({
                          ...prev,
                          partThickness: parseFloat(e.target.value)
                        }))}
                        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div className="flex justify-between text-xs text-white/70 mt-1">
                        <span>1mm</span>
                        <span>10mm</span>
                      </div>
                    </div>

                    {/* Scale Setting */}
                    <div className="mb-3">
                      <div className="text-white text-xs mb-2">
                        Scale Factor: {triangleOptions.scale}x
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3"
                        step="0.1"
                        value={triangleOptions.scale}
                        onChange={(e) => setTriangleOptions(prev => ({
                          ...prev,
                          scale: parseFloat(e.target.value)
                        }))}
                        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                      />
                      <div className="flex justify-between text-xs text-white/70 mt-1">
                        <span>0.5x</span>
                        <span>3x</span>
                      </div>
                    </div>

                    {/* Export Stats Preview */}
                    {geometry && (
                      <div className="mb-4 p-2 bg-white/5 rounded border border-white/10">
                        <div className="text-white text-xs font-medium mb-1">Polygon Parts Preview:</div>
                        <div className="text-xs text-white/70 space-y-1">
                          {(() => {
                            const polygonFaces = (geometry as any).polygonFaces;
                            const polygonType = (geometry as any).polygonType;
                            if (polygonFaces) {
                              const faceTypes = [...new Set(polygonFaces.map((f: any) => f.type))];
                              return (
                                <>
                                  <div>• {polygonFaces.length} polygon parts ({polygonType})</div>
                                  <div>• Face types: {faceTypes.join(', ')}</div>
                                  <div>• Est. print time: ~{Math.floor(polygonFaces.length * 15 * (triangleOptions.partThickness / 2) / 60)}h</div>
                                  <div>• Est. material: ~{Math.round(polygonFaces.length * 2.5 * (triangleOptions.partThickness / 2))}g filament</div>
                                </>
                              );
                            } else {
                              return (
                                <>
                                  <div>• {Math.floor(geometry.attributes.position.count / 3)} triangle fallback</div>
                                  <div>• Est. print time: ~{Math.floor((geometry.attributes.position.count / 3) * 10 * (triangleOptions.partThickness / 2) / 60)}h</div>
                                  <div>• Est. material: ~{Math.round((geometry.attributes.position.count / 3) * 1.5 * (triangleOptions.partThickness / 2))}g filament</div>
                                </>
                              );
                            }
                          })()}
                          <div>• Part thickness: {triangleOptions.partThickness}mm</div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          exportParts(triangleOptions);
                          setShowTriangleSettings(false);
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 h-8"
                        disabled={isProcessing || !geometry}
                      >
                        Generate Polygon Parts
                      </Button>
                      <Button
                        onClick={() => setShowTriangleSettings(false)}
                        className="bg-white/20 hover:bg-white/30 text-white text-xs py-2 px-3 h-8"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {!geometry && (
                <p className="text-xs text-white/50 text-center mt-4">
                  Upload or load a model first to enable exports
                </p>
              )}
            </div>
          )}
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mt-6 p-3 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
            <div className="text-yellow-300 text-sm font-medium flex items-center">
              <div className="w-4 h-4 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin mr-3"></div>
              Processing model...
            </div>
          </div>
        )}
      </div>

      {/* Export Format Selection Dialog */}
      {showExportFormatDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-black/90 backdrop-blur-md border border-white/20 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-white text-lg font-semibold mb-4 text-center">
              Choose Export Format
            </h3>
            <p className="text-white/70 text-sm mb-6 text-center">
              {exportType === 'complete'
                ? 'Select format for complete model export:'
                : 'Select format for polygon parts export:'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleFormatSelection('stl')}
                className="w-full p-4 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-3"
              >
                <Download className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold">STL Format</div>
                  <div className="text-sm text-green-100">Best for 3D printing and viewing</div>
                </div>
              </button>

              <button
                onClick={() => handleFormatSelection('obj')}
                className="w-full p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-3"
              >
                <Package className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold">OBJ Format</div>
                  <div className="text-sm text-blue-100">Better topology for editing and groups</div>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowExportFormatDialog(false)}
              className="w-full mt-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
}
