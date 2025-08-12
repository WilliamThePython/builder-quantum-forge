import React, { useState } from 'react';
import { Scissors, Minimize2, MousePointer, Settings, X, Palette, Eye } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { STLToolMode } from '../lib/processing/stlManipulator';

interface STLToolsPanelProps {
  activeToolMode: STLToolMode;
  onToolModeChange: (mode: STLToolMode) => void;
  onReducePoints: (reduction: number, method: 'random' | 'best') => void;
  isProcessing: boolean;
  geometryStats: {
    vertices: number;
    triangles: number;
  } | null;
  // Visualization controls
  randomColors: boolean;
  wireframe: boolean;
  onRandomColorsChange: (checked: boolean) => void;
  onWireframeChange: (checked: boolean) => void;
}

export default function STLToolsPanel({
  activeToolMode,
  onToolModeChange,
  onReducePoints,
  isProcessing,
  geometryStats,
  randomColors,
  wireframe,
  onRandomColorsChange,
  onWireframeChange
}: STLToolsPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [reductionAmount, setReductionAmount] = useState(0.5);
  const [reductionMethod, setReductionMethod] = useState<'random' | 'best'>('random');

  const tools = [
    {
      id: STLToolMode.Highlight,
      name: 'Highlight Facet',
      icon: MousePointer,
      description: 'Hover over model to highlight polygon faces',
      color: 'bg-blue-500 hover:bg-blue-600',
      activeColor: 'bg-blue-600'
    },
    {
      id: STLToolMode.Reduce,
      name: 'Reduce Points',
      icon: Minimize2,
      description: 'Reduce vertices using random or best methods',
      color: 'bg-orange-500 hover:bg-orange-600',
      activeColor: 'bg-orange-600',
      hasSettings: true
    }
  ];

  const handleToolClick = (tool: any) => {
    if (tool.id === STLToolMode.Reduce) {
      if (showSettings) {
        onReducePoints(reductionAmount, reductionMethod);
        setShowSettings(false);
      } else {
        setShowSettings(true);
      }
    } else {
      onToolModeChange(tool.id);
    }
  };

  return (
    <div className="fixed left-4 top-1/2 transform -translate-y-1/2 z-40">
      <div className="bg-black/80 backdrop-blur-md rounded-xl border border-white/20 p-4 min-w-[200px] max-w-[280px]">
        {/* Header */}
        <div className="text-white text-sm font-semibold mb-4 text-center">
          STL Tools
        </div>

        {/* Geometry Stats */}
        {geometryStats && (
          <div className="text-xs text-white/70 mb-4 p-2 bg-white/5 rounded-lg">
            <div>Vertices: {geometryStats.vertices.toLocaleString()}</div>
            <div>Triangles: {geometryStats.triangles.toLocaleString()}</div>
          </div>
        )}

        {/* Visualization Controls */}
        <div className="space-y-3 mb-4">
          <div className="text-white text-xs font-semibold text-center opacity-80">
            VISUALIZATION
          </div>

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
        </div>

        <Separator className="bg-white/20 mb-4" />

        {/* Tool Buttons */}
        <div className="space-y-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeToolMode === tool.id;
            
            return (
              <div key={tool.id}>
                <Button
                  onClick={() => handleToolClick(tool)}
                  disabled={isProcessing}
                  className={`
                    w-full justify-start text-left p-3 h-auto relative group
                    ${isActive ? tool.activeColor : tool.color}
                    ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
                    text-white border-0 transition-all duration-200
                  `}
                >
                  <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{tool.name}</div>
                    <div className="text-xs text-white/80 mt-1">
                      {tool.description}
                    </div>
                  </div>
                  {tool.hasSettings && (
                    <Settings className="w-3 h-3 ml-2 opacity-70" />
                  )}
                </Button>

                {/* Reduction Settings */}
                {tool.id === STLToolMode.Reduce && showSettings && (
                  <div className="mt-2 p-3 bg-white/10 rounded-lg border border-white/20">
                    <div className="text-white text-xs font-medium mb-3">
                      Reduction Settings
                    </div>

                    {/* Method Selection */}
                    <div className="mb-3">
                      <div className="text-white text-xs mb-2">Method</div>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => setReductionMethod('random')}
                          className={`flex-1 text-xs py-1 px-2 h-6 ${
                            reductionMethod === 'random'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/20 hover:bg-white/30 text-white/80'
                          }`}
                        >
                          Random
                        </Button>
                        <Button
                          onClick={() => setReductionMethod('best')}
                          className={`flex-1 text-xs py-1 px-2 h-6 ${
                            reductionMethod === 'best'
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/20 hover:bg-white/30 text-white/80'
                          }`}
                        >
                          Best
                        </Button>
                      </div>
                      <div className="text-xs text-white/60 mt-1">
                        {reductionMethod === 'random'
                          ? 'Randomly removes vertices'
                          : 'Removes vertices in flat areas'
                        }
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

                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          onReducePoints(reductionAmount, reductionMethod);
                          setShowSettings(false);
                        }}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs py-1 px-2 h-7"
                        disabled={isProcessing}
                      >
                        Apply
                      </Button>
                      <Button
                        onClick={() => setShowSettings(false)}
                        className="bg-white/20 hover:bg-white/30 text-white text-xs py-1 px-2 h-7"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Active Tool Indicator */}
        {activeToolMode !== STLToolMode.None && (
          <div className="mt-4 p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
            <div className="text-blue-300 text-xs font-medium">
              {activeToolMode === STLToolMode.Highlight && 'Hover over model to highlight polygon faces'}
              {activeToolMode === STLToolMode.Reduce && 'Adjust settings and click "Apply"'}
            </div>
            {activeToolMode === STLToolMode.Highlight && (
              <Button
                onClick={() => onToolModeChange(STLToolMode.None)}
                className="w-full mt-2 bg-white/10 hover:bg-white/20 text-white text-xs py-1 h-6"
              >
                Disable Highlighting
              </Button>
            )}
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="mt-4 p-2 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
            <div className="text-yellow-300 text-xs font-medium flex items-center">
              <div className="w-3 h-3 border-2 border-yellow-300 border-t-transparent rounded-full animate-spin mr-2"></div>
              Processing...
            </div>
          </div>
        )}
      </div>

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
