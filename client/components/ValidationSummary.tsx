import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { ValidationReport } from '../lib/stlGeometryValidator';

interface ValidationSummaryProps {
  report: ValidationReport;
  onClose?: () => void;
}

export default function ValidationSummary({ report, onClose }: ValidationSummaryProps) {
  const { issues, warnings, stats, isValid } = report;

  const getStatusIcon = () => {
    if (!isValid) return <XCircle className="w-5 h-5 text-red-500" />;
    if (warnings.length > 0) return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    return <CheckCircle className="w-5 h-5 text-green-500" />;
  };

  const getStatusText = () => {
    if (!isValid) return 'Validation Failed';
    if (warnings.length > 0) return 'Validation Passed with Warnings';
    return 'Validation Passed';
  };

  const getStatusColor = () => {
    if (!isValid) return 'border-red-500 bg-red-50';
    if (warnings.length > 0) return 'border-yellow-500 bg-yellow-50';
    return 'border-green-500 bg-green-50';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className={`p-4 border-l-4 ${getStatusColor()}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <h2 className="text-lg font-semibold text-gray-900">
                STL Geometry Validation
              </h2>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">{getStatusText()}</p>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {/* Statistics */}
          <div className="mb-6">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Geometry Statistics
            </h3>
            <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-600">Triangles:</span>
                <span className="ml-2 font-medium">{stats.totalTriangles.toLocaleString()}</span>
              </div>
              {stats.totalPolygonFaces > 0 && (
                <div>
                  <span className="text-gray-600">Polygon Faces:</span>
                  <span className="ml-2 font-medium">{stats.totalPolygonFaces.toLocaleString()}</span>
                </div>
              )}
              <div>
                <span className="text-gray-600">Min Area:</span>
                <span className="ml-2 font-medium">{stats.minArea.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-gray-600">Max Area:</span>
                <span className="ml-2 font-medium">{stats.maxArea.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-gray-600">Avg Area:</span>
                <span className="ml-2 font-medium">{stats.avgArea.toFixed(6)}</span>
              </div>
              {stats.zeroAreaFaces > 0 && (
                <div>
                  <span className="text-red-600">Zero Area Faces:</span>
                  <span className="ml-2 font-medium text-red-600">{stats.zeroAreaFaces}</span>
                </div>
              )}
            </div>
          </div>

          {/* Critical Issues */}
          {issues.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-red-700 mb-2 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Critical Issues ({issues.length})
              </h3>
              <div className="space-y-2">
                {issues.map((issue, index) => (
                  <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="font-medium text-red-800 text-sm">{issue.message}</div>
                    <div className="text-red-600 text-xs mt-1">{issue.details}</div>
                    <div className="text-red-500 text-xs mt-1 opacity-75">
                      Category: {issue.category}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium text-yellow-700 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Warnings ({warnings.length})
              </h3>
              <div className="space-y-2">
                {warnings.map((warning, index) => (
                  <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="font-medium text-yellow-800 text-sm">{warning.message}</div>
                    <div className="text-yellow-600 text-xs mt-1">{warning.details}</div>
                    <div className="text-yellow-500 text-xs mt-1 opacity-75">
                      Category: {warning.category}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">Recommendations</h3>
            <div className="text-blue-700 text-sm space-y-1">
              {!isValid && (
                <p>• Fix critical issues before exporting parts to ensure accuracy</p>
              )}
              {stats.zeroAreaFaces > 0 && (
                <p>• Remove or fix zero-area faces for proper parts generation</p>
              )}
              {stats.degenerateTriangles > 0 && (
                <p>• Clean degenerate triangles in your 3D modeling software</p>
              )}
              {stats.nonManifoldEdges > 0 && (
                <p>• Ensure the model is a closed, manifold mesh</p>
              )}
              {warnings.length === 0 && isValid && (
                <p>• Your STL is ready for accurate parts export! ✅</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-end">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
