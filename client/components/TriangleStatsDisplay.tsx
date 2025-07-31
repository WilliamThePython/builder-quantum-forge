import React from 'react';
import { useSTL } from '../context/STLContext';
import { useIsMobile } from '../hooks/use-mobile';

export default function TriangleStatsDisplay() {
  const { highlightedTriangle, triangleStats, viewerSettings } = useSTL();

  if (highlightedTriangle === null || !triangleStats) {
    return null;
  }

  // Calculate contrast color based on background
  const getContrastColor = (backgroundColor: string) => {
    // Convert hex to RGB
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return white for dark backgrounds, black for light backgrounds
    return luminance < 0.5 ? '#ffffff' : '#000000';
  };

  const textColor = getContrastColor(viewerSettings.backgroundColor);

  // Determine if this is a polygon face or triangle
  const isPolygonFace = triangleStats.faceType && triangleStats.vertexCount;
  const faceLabel = isPolygonFace ?
    `${triangleStats.faceType.charAt(0).toUpperCase() + triangleStats.faceType.slice(1)} Face #${highlightedTriangle + 1}` :
    `Triangle #${highlightedTriangle + 1}`;

  return (
    <div
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg backdrop-blur-sm border border-white/20"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: textColor,
        fontSize: '12px',
        fontFamily: 'monospace'
      }}
    >
      <div className="flex gap-6 items-center">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#ff0000' }}
            title="Highlighted face color"
          />
          <span className="text-white/80">{faceLabel}</span>
          {isPolygonFace && (
            <span className="text-white/60 text-xs">({triangleStats.vertexCount} vertices)</span>
          )}
        </div>

        <div className="flex gap-4 text-xs">
          <span>
            <span className="text-white/60">Area:</span> {triangleStats.area.toFixed(2)} mm²
          </span>
          <span>
            <span className="text-white/60">Perimeter:</span> {triangleStats.perimeter.toFixed(2)} mm
          </span>
          <span>
            <span className="text-white/60">Width:</span> {triangleStats.width.toFixed(2)} mm
          </span>
          <span>
            <span className="text-white/60">Height:</span> {triangleStats.height.toFixed(2)} mm
          </span>
        </div>

        <div className="text-xs text-white/50">
          Centroid: ({triangleStats.centroid.x.toFixed(1)}, {triangleStats.centroid.y.toFixed(1)}, {triangleStats.centroid.z.toFixed(1)})
        </div>
      </div>
    </div>
  );
}
