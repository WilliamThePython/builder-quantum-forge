import React, { useState } from 'react';
import { useSTL } from '../context/STLContext';
import { useIsMobile } from '../hooks/use-mobile';

export default function TriangleStatsDisplay() {
  const isMobile = useIsMobile();
  const { highlightedTriangle, triangleStats, viewerSettings } = useSTL();
  const [showAllCoords, setShowAllCoords] = useState(false);

  if (highlightedTriangle === null || !triangleStats) {
    return null;
  }

  // Calculate contrast color based on background
  const getContrastColor = (backgroundColor: string) => {
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? '#ffffff' : '#000000';
  };

  const textColor = getContrastColor(viewerSettings.backgroundColor);

  // Get face information
  const isPolygonFace = triangleStats.faceType && triangleStats.vertexCount;
  const faceLabel = isPolygonFace ?
    `${triangleStats.faceType.charAt(0).toUpperCase() + triangleStats.faceType.slice(1)} Face #${highlightedTriangle + 1}` :
    `Triangle #${highlightedTriangle + 1}`;

  // Extract vertex coordinates
  const vertices = triangleStats.vertices || [];
  const vertexCount = vertices.length;
  const edgeCount = vertexCount; // For polygons, edges = vertices (closed shape)

  // Format coordinate for display
  const formatCoord = (coord: number) => coord.toFixed(2);

  // Show first 4 coordinates, then "..." if more than 4
  const maxVisibleCoords = 4;
  const shouldTruncate = vertexCount > maxVisibleCoords && !showAllCoords;
  const visibleVertices = shouldTruncate ? vertices.slice(0, maxVisibleCoords) : vertices;

  if (isMobile) {
    return (
      <div
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-3 py-2 rounded-lg backdrop-blur-sm border border-white/20 max-w-[90vw]"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: textColor,
          fontSize: '11px',
          fontFamily: 'monospace'
        }}
      >
        <div className="flex flex-col gap-1 items-center text-center">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-sm bg-red-500"
              title="Highlighted face"
            />
            <span className="text-white/80 text-xs">{faceLabel}</span>
          </div>

          <div className="flex gap-3 text-xs justify-center">
            <span><span className="text-white/60">V:</span> {vertexCount}</span>
            <span><span className="text-white/60">E:</span> {edgeCount}</span>
          </div>

          <div className="flex gap-3 text-xs justify-center">
            <span><span className="text-white/60">A:</span> {triangleStats.area.toFixed(1)} mm²</span>
            <span><span className="text-white/60">P:</span> {triangleStats.perimeter.toFixed(1)} mm</span>
          </div>

          <div className="flex flex-col gap-1 text-xs max-w-full">
            {visibleVertices.map((vertex, index) => (
              <div key={index} className="text-white/70 truncate">
                V{index + 1}: ({formatCoord(vertex.x)}, {formatCoord(vertex.y)}, {formatCoord(vertex.z)})
              </div>
            ))}
            {shouldTruncate && (
              <button
                onClick={() => setShowAllCoords(true)}
                className="text-blue-400 hover:text-blue-300 text-xs cursor-pointer"
              >
                ... +{vertexCount - maxVisibleCoords} more
              </button>
            )}
            {showAllCoords && vertexCount > maxVisibleCoords && (
              <button
                onClick={() => setShowAllCoords(false)}
                className="text-blue-400 hover:text-blue-300 text-xs cursor-pointer"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-3 rounded-lg backdrop-blur-sm border border-white/20 max-w-4xl"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: textColor,
        fontSize: '12px',
        fontFamily: 'monospace'
      }}
    >
      <div className="flex flex-col gap-2">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm bg-red-500"
              title="Highlighted face"
            />
            <span className="text-white/90 font-medium">{faceLabel}</span>
          </div>

          <div className="flex gap-4 text-sm">
            <span><span className="text-white/60">Vertices:</span> <span className="text-white/90">{vertexCount}</span></span>
            <span><span className="text-white/60">Edges:</span> <span className="text-white/90">{edgeCount}</span></span>
            <span><span className="text-white/60">Area:</span> <span className="text-white/90">{triangleStats.area.toFixed(2)} mm²</span></span>
            <span><span className="text-white/60">Perimeter:</span> <span className="text-white/90">{triangleStats.perimeter.toFixed(1)} mm</span></span>
          </div>
        </div>

        {/* Coordinates */}
        <div className="flex flex-col gap-1">
          <div className="text-white/60 text-xs">Vertex Coordinates:</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {visibleVertices.map((vertex, index) => (
              <span key={index} className="text-white/80">
                <span className="text-white/60">V{index + 1}:</span> ({formatCoord(vertex.x)}, {formatCoord(vertex.y)}, {formatCoord(vertex.z)})
              </span>
            ))}
          </div>

          {shouldTruncate && (
            <button
              onMouseEnter={() => setShowAllCoords(true)}
              className="text-blue-400 hover:text-blue-300 text-xs cursor-pointer self-start"
            >
              ... +{vertexCount - maxVisibleCoords} more (hover to expand)
            </button>
          )}

          {showAllCoords && vertexCount > maxVisibleCoords && (
            <button
              onMouseLeave={() => setShowAllCoords(false)}
              className="text-blue-400 hover:text-blue-300 text-xs cursor-pointer self-start"
            >
              Show less
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
