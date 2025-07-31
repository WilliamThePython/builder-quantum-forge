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
  Wrench,
  Menu,
  ArrowLeft
} from 'lucide-react';
import { useIsMobile } from '../hooks/use-mobile';
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
  const isMobile = useIsMobile();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const {
    fileName,
    isLoading,
    loadingProgress,
    geometry,
    loadModelFromFile,
    loadDefaultSTL,
    exportSTL,
    exportParts,
    viewerSettings,
    updateViewerSettings,
    getDetailedGeometryStats,
    hasBackup,
    restoreFromBackup
  } = useSTL();

  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [reductionAmount, setReductionAmount] = useState(0.5);
  const [reductionMethod, setReductionMethod] = useState<'random_vertex' | 'quadric' | 'grid_based' | 'triangle_collapse'>('quadric');
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
      console.log(`🚀 Starting upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      loadModelFromFile(file).catch(err => {
        console.error('❌ Upload failed:', err);
        // Make sure the error is visible to the user
        alert(`Upload failed: ${err.message}`);
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

  // Close drawer when clicking outside on mobile
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && isMobile) {
      setIsDrawerOpen(false);
    }
  };

  if (isMobile) {
    return (
      <div className="fixed left-2 top-2 z-50 w-64 max-w-[80vw]">
        <div className="bg-black/90 backdrop-blur-lg rounded-lg border border-white/20 overflow-hidden">
          {/* Compact Mobile Header */}
          <div className="bg-black/95 backdrop-blur-lg border-b border-white/20 p-2">
            <h2 className="text-white font-semibold text-sm text-center">STL Workflow</h2>
          </div>

          {/* Mobile Content with compact sections */}
          <div className="p-2">
            <MobileWorkflowContent
              {...{
                fileName,
                isLoading,
                loadingProgress,
                geometry,
                loadModelFromFile,
                loadDefaultSTL,
                exportSTL,
                exportParts,
                viewerSettings,
                updateViewerSettings,
                getDetailedGeometryStats,
                hasBackup,
                restoreFromBackup,
                activeToolMode,
                onToolModeChange,
                onReducePoints,
                isProcessing,
                geometryStats,
                randomColors,
                wireframe,
                onRandomColorsChange,
                onWireframeChange
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="fixed left-4 top-4 bottom-4 z-50 w-80 max-h-[calc(100vh-2rem)]">
      <div className="bg-black/85 backdrop-blur-lg rounded-2xl border border-white/20 p-5 h-full overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-white font-bold text-xl mb-1">STL Workflow</h2>
          <p className="text-white/60 text-sm">Upload → Modify → Export</p>

          {/* Enhanced Loading Progress Bar */}
          {isLoading && (
            <div className="mt-3 p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-blue-200">
                    {loadingProgress.stage || 'Processing'}
                  </div>
                  <div className="text-xs text-blue-300/80">
                    {loadingProgress.details || 'Please wait...'}
                  </div>
                </div>
                <div className="text-xs font-mono text-blue-300 bg-blue-500/20 px-2 py-1 rounded">
                  {loadingProgress.percentage}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${loadingProgress.percentage}%` }}
                >
                  <div className="h-full bg-white/20 animate-pulse"></div>
                </div>
              </div>

              {/* Stage Indicators */}
              <div className="flex justify-between mt-2 text-xs">
                <div className={`px-1 ${loadingProgress.percentage >= 10 ? 'text-green-400' : 'text-white/50'}`}>
                  Validate
                </div>
                <div className={`px-1 ${loadingProgress.percentage >= 35 ? 'text-green-400' : 'text-white/50'}`}>
                  Parse
                </div>
                <div className={`px-1 ${loadingProgress.percentage >= 60 ? 'text-green-400' : 'text-white/50'}`}>
                  Process
                </div>
                <div className={`px-1 ${loadingProgress.percentage >= 85 ? 'text-green-400' : 'text-white/50'}`}>
                  Validate
                </div>
                <div className={`px-1 ${loadingProgress.percentage >= 100 ? 'text-green-400' : 'text-white/50'}`}>
                  Complete
                </div>
              </div>
            </div>
          )}
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
                  <div className="text-white text-sm font-medium mb-2">
                      Model Reduction Settings
                  </div>
                  <div className="text-xs text-white/60 mb-4 bg-white/5 rounded p-2">
                    🎯 <span className="font-medium">Goal:</span> Reduce complexity while preserving shape & topology.
                    Uses vertex/triangle manipulation with automatic mesh repair.
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
                        Target Reduction Percentage
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

                    {/* Additional Options */}
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Eye className="w-3 h-3 text-white/70" />
                          <span className="text-white text-xs">Show Wireframe</span>
                        </div>
                        <Switch
                          checked={wireframe}
                          onCheckedChange={onWireframeChange}
                        />
                      </div>

                      <Button
                        onClick={() => {
                          restoreFromBackup();
                        }}
                        className={`w-full text-white text-xs py-2 h-8 ${
                          hasBackup
                            ? 'bg-yellow-600 hover:bg-yellow-700'
                            : 'bg-gray-600 cursor-not-allowed opacity-50'
                        }`}
                        disabled={!hasBackup}
                        title={hasBackup ? "Restore model to state before last simplification" : "No backup available - perform a simplification first"}
                      >
                        <RefreshCw className="w-3 h-3 mr-2" />
                        {hasBackup ? '🔄 Undo Simplification' : '⚪ No Backup Available'}
                      </Button>
                    </div>

                    {/* Reduction Results */}
                    {simplificationStats.originalStats && simplificationStats.newStats && (
                      <div className="mb-3 p-3 bg-green-500/10 border border-green-500/20 rounded">
                        <div className="text-green-200 text-xs font-medium mb-2 flex items-center gap-1">
                          ✅ Reduction Complete
                        </div>
                        <div className="text-xs text-white/70 space-y-1">
                          <div className="flex justify-between">
                            <span>Vertices:</span>
                            <span>{simplificationStats.originalStats.vertices.toLocaleString()} → {simplificationStats.newStats.vertices.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Triangles:</span>
                            <span>{simplificationStats.originalStats.faces.toLocaleString()} → {simplificationStats.newStats.faces.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Reduction:</span>
                            <span className="text-green-400 font-medium">{(simplificationStats.reductionAchieved! * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Method:</span>
                            <span className="text-blue-300 capitalize">{reductionMethod.replace('_', ' ')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Processing:</span>
                            <span>{simplificationStats.processingTime}ms</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Button
                        onClick={() => {
                          // Map new UI method names to existing backend methods
                          const methodMapping: Record<string, string> = {
                            'random_vertex': 'random',
                            'quadric': 'quadric_edge_collapse',
                            'grid_based': 'vertex_clustering',
                            'triangle_collapse': 'adaptive'
                          };
                          const backendMethod = methodMapping[reductionMethod] || reductionMethod;
                          onReducePoints(reductionAmount, backendMethod as any);
                        }}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs py-2 h-9"
                        disabled={isProcessing}
                      >
                        🔧 Apply Model Reduction
                      </Button>

                      <div className="text-xs text-white/60 bg-blue-500/10 border border-blue-500/20 rounded p-2">
                        <div className="font-medium text-blue-200 mb-1">📋 Process:</div>
                        <div>• Uses .OBJ format for better topology preservation</div>
                        <div>• Includes automatic mesh stitching & cleanup</div>
                        <div>• Validates manifold geometry post-reduction</div>
                      </div>
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

// Mobile Content Component
function MobileWorkflowContent(props: any) {
  const {
    fileName,
    isLoading,
    loadingProgress,
    geometry,
    loadModelFromFile,
    loadDefaultSTL,
    exportSTL,
    exportParts,
    viewerSettings,
    updateViewerSettings,
    getDetailedGeometryStats,
    hasBackup,
    restoreFromBackup,
    activeToolMode,
    onToolModeChange,
    onReducePoints,
    isProcessing,
    geometryStats,
    randomColors,
    wireframe,
    onRandomColorsChange,
    onWireframeChange
  } = props;

  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [reductionAmount, setReductionAmount] = useState(0.5);
  const [reductionMethod, setReductionMethod] = useState<'random_vertex' | 'quadric' | 'grid_based' | 'triangle_collapse'>('quadric');
  const [expandedSections, setExpandedSections] = useState({
    upload: false,
    visualization: false,
    tools: false,
    export: false
  });

  const [showTriangleSettings, setShowTriangleSettings] = useState(false);
  const [triangleOptions, setTriangleOptions] = useState({
    partThickness: 2,
    scale: 1
  });

  const [showExportFormatDialog, setShowExportFormatDialog] = useState(false);
  const [exportType, setExportType] = useState<'complete' | 'parts'>('complete');

  const [simplificationStats, setSimplificationStats] = useState<{
    originalStats?: any;
    newStats?: any;
    reductionAchieved?: number;
    processingTime?: number;
  }>({});

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log(`🚀 Starting upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      loadModelFromFile(file).catch(err => {
        console.error('❌ Upload failed:', err);
        alert(`Upload failed: ${err.message}`);
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
      if (format === 'stl') {
        exportSTL();
      } else {
        console.log('OBJ export selected - functionality to be implemented');
        alert('OBJ export functionality coming soon!');
      }
    } else {
      if (format === 'stl') {
        exportParts(triangleOptions);
      } else {
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
      className="flex items-center justify-between w-full text-white text-xs font-medium py-1.5 px-1.5 hover:bg-white/10 rounded-md transition-colors"
    >
      <div className="flex items-center gap-1.5">
        {isExpanded ? (
          <ChevronDown className="w-2.5 h-2.5" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5" />
        )}
        <span className="text-xs">{title}</span>
      </div>
      {badge && (
        <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs px-1 py-0 text-xs">
          {badge}
        </Badge>
      )}
    </button>
  );

  return (
    <div className="space-y-1">
      {/* Compact mobile content with collapsible sections */}

      {/* Enhanced Loading Progress Bar - Compact */}
      {isLoading && (
        <div className="p-1.5 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-md">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <div className="flex-1">
              <div className="text-xs font-medium text-blue-200">
                {loadingProgress.stage || 'Processing'}
              </div>
            </div>
            <div className="text-xs font-mono text-blue-300 bg-blue-500/20 px-1 py-0.5 rounded text-xs">
              {loadingProgress.percentage}%
            </div>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress.percentage}%` }}
            >
            </div>
          </div>
        </div>
      )}

      {/* 1. UPLOAD SECTION */}
      <div>
        <SectionHeader
          title="1. UPLOAD & LOAD"
          isExpanded={expandedSections.upload}
          onToggle={() => toggleSection('upload')}
          badge={fileName ? "Ready" : "Upload File"}
        />

        {expandedSections.upload && (
          <div className="mt-1 space-y-1.5">
            {/* File Upload - compact for mobile */}
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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 relative z-0 h-8 text-xs"
                disabled={isLoading}
                title="Upload STL or OBJ file from your computer"
                type="button"
              >
                <Upload className="w-3 h-3 mr-1" />
                {isLoading ? 'Loading...' : 'Upload File'}
              </Button>
            </div>

            {/* Random Model - compact for mobile */}
            <Button
              onClick={loadDefaultSTL}
              disabled={isLoading}
              className="w-full border-gray-300 bg-white/10 hover:bg-white/20 text-white font-medium h-7 text-xs"
              variant="outline"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Random Model
            </Button>

            {/* File Info - compact */}
            {fileName && (
              <div className="bg-white/5 rounded-md p-1.5 border border-white/10">
                <div className="flex items-center gap-1 mb-1">
                  <Info className="w-2.5 h-2.5 text-blue-400" />
                  <span className="font-medium text-white text-xs">{fileName}</span>
                </div>
                {(() => {
                  const detailedStats = getDetailedGeometryStats();
                  if (!detailedStats) return null;

                  return (
                    <div className="text-xs text-white/70 space-y-0.5">
                      <div>V: {detailedStats.vertices.toLocaleString()}</div>
                      <div>E: {detailedStats.edges.toLocaleString()}</div>
                      {detailedStats.polygonBreakdown.slice(0, 2).map(({ type, count }) => (
                        <div key={type}>
                          {type.charAt(0).toUpperCase()}: {count.toLocaleString()}
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

      <Separator className="bg-white/20 my-0.5" />

      {/* 2. VISUALIZATION SECTION */}
      <div>
        <SectionHeader
          title="2. VISUALIZATION"
          isExpanded={expandedSections.visualization}
          onToggle={() => toggleSection('visualization')}
        />

        {expandedSections.visualization && (
          <div className="mt-1 space-y-1.5">
            {/* Random Colors - compact for mobile */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5">
                <Palette className="w-3 h-3 text-white/70" />
                <Label htmlFor="colors-mobile" className="text-xs text-white/80">Colors</Label>
              </div>
              <Switch
                id="colors-mobile"
                checked={randomColors}
                onCheckedChange={onRandomColorsChange}
              />
            </div>

            {/* Wireframe - compact for mobile */}
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3 h-3 text-white/70" />
                <Label htmlFor="wireframe-mobile" className="text-xs text-white/80">Wireframe</Label>
              </div>
              <Switch
                id="wireframe-mobile"
                checked={wireframe}
                onCheckedChange={onWireframeChange}
              />
            </div>

            {/* Background Settings - compact */}
            <Popover open={showBackgroundSettings} onOpenChange={setShowBackgroundSettings}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-white/20 bg-white/5 hover:bg-white/10 text-white font-medium h-7 text-xs"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Background
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                sideOffset={8}
                className="w-52 bg-black/90 backdrop-blur-md border-white/10 text-white"
              >
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Background</h3>
                  <div className="space-y-1">
                    <div className="grid grid-cols-3 gap-1">
                      {[
                        { color: '#0a0a0a', name: 'Black' },
                        { color: '#1a1a2e', name: 'Ocean' },
                        { color: '#16213e', name: 'Blue' },
                        { color: '#2a0845', name: 'Purple' }
                      ].map((bg) => (
                        <button
                          key={bg.color}
                          className={`w-full h-7 rounded border-2 transition-all ${
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

      <Separator className="bg-white/20" />

      {/* 3. TOOLS SECTION */}
      <div>
        <SectionHeader
          title="3. REDUCE MODEL"
          isExpanded={expandedSections.tools}
          onToggle={() => toggleSection('tools')}
        />

        {expandedSections.tools && (
          <div className="mt-4 space-y-4">
            {/* Reduction Settings */}
            <div className="p-4 bg-white/10 rounded-lg border border-white/20">
              <div className="text-white text-base font-medium mb-3">
                Model Reduction Settings
              </div>

              {/* Method Selection - larger buttons for mobile */}
              <div className="mb-4">
                <div className="text-white text-sm mb-3">Simplification Method</div>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    onClick={() => setReductionMethod('quadric')}
                    className={`text-sm py-3 px-4 h-auto ${
                      reductionMethod === 'quadric'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/20 hover:bg-white/30 text-white/80'
                    }`}
                  >
                    Quadric ⭐ (Recommended)
                  </Button>
                  <Button
                    onClick={() => setReductionMethod('random_vertex')}
                    className={`text-sm py-3 px-4 h-auto ${
                      reductionMethod === 'random_vertex'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/20 hover:bg-white/30 text-white/80'
                    }`}
                  >
                    Random Vertex (Fast)
                  </Button>
                </div>
              </div>

              {/* Reduction Amount - larger slider for mobile */}
              <div className="mb-4">
                <div className="text-white text-sm mb-3">
                  Target Reduction: {Math.round(reductionAmount * 100)}%
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.1"
                  value={reductionAmount}
                  onChange={(e) => setReductionAmount(parseFloat(e.target.value))}
                  className="w-full h-3 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-white/70 mt-2">
                  <span>10%</span>
                  <span>90%</span>
                </div>
              </div>

              <Button
                onClick={() => {
                  const methodMapping: Record<string, string> = {
                    'random_vertex': 'random',
                    'quadric': 'quadric_edge_collapse',
                    'grid_based': 'vertex_clustering',
                    'triangle_collapse': 'adaptive'
                  };
                  const backendMethod = methodMapping[reductionMethod] || reductionMethod;
                  onReducePoints(reductionAmount, backendMethod as any);
                }}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white text-base py-3 h-auto"
                disabled={isProcessing}
              >
                🔧 Apply Model Reduction
              </Button>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-white/20" />

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
            {/* Standard Export - larger buttons for mobile */}
            <div>
              <div className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                <Download className="w-4 h-4" />
                Standard Export
              </div>
              <Button
                onClick={() => handleExportClick('complete')}
                disabled={!geometry}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold h-12 text-base"
              >
                <Download className="w-5 h-5 mr-2" />
                Export Complete Model
              </Button>
            </div>

            <Separator className="bg-white/20" />

            {/* Parts Export */}
            <div>
              <div className="text-white text-sm font-medium mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Polygon Parts Export
              </div>
              <Button
                onClick={() => handleExportClick('parts')}
                disabled={!geometry}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold h-12 text-base"
              >
                <Package className="w-5 h-5 mr-2" />
                Export Polygon Parts
              </Button>
            </div>

            {!geometry && (
              <p className="text-sm text-white/50 text-center mt-4">
                Upload or load a model first to enable exports
              </p>
            )}
          </div>
        )}
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="mt-6 p-4 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
          <div className="text-yellow-300 text-base font-medium flex items-center">
            <div className="w-5 h-5 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin mr-3"></div>
            Processing model...
          </div>
        </div>
      )}

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
              className="w-full mt-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-base"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-moz-range-thumb {
          height: 20px;
          width: 20px;
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
