import * as THREE from 'three';

export interface FileSizeEstimate {
  stl: {
    size: number;
    formatted: string;
  };
  obj: {
    size: number;
    formatted: string;
  };
}

export interface PartsFileSizeEstimate {
  totalSize: number;
  averagePartSize: number;
  partCount: number;
  totalFormatted: string;
  averageFormatted: string;
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Estimate STL file size based on triangle count
 * STL format: 80-byte header + (50 bytes per triangle)
 */
function estimateSTLSize(triangleCount: number): number {
  const headerSize = 80;
  const bytesPerTriangle = 50; // 4 bytes for triangle count + 12*3 bytes for vertices + 12 bytes for normal + 2 bytes for attribute
  
  return headerSize + (triangleCount * bytesPerTriangle);
}

/**
 * Estimate OBJ file size based on vertex and face count
 * OBJ format is text-based, so we estimate based on average line lengths
 */
function estimateOBJSize(vertexCount: number, faceCount: number): number {
  // Average vertex line: "v -1.234567 2.345678 -3.456789\n" ≈ 35 bytes
  const avgVertexLineSize = 35;
  
  // Average face line varies by polygon type:
  // Triangle: "f 1 2 3\n" ≈ 8 bytes
  // Quad: "f 1 2 3 4\n" ≈ 10 bytes
  // Pentagon: "f 1 2 3 4 5\n" ≈ 12 bytes
  // We'll estimate an average of 10 bytes per face
  const avgFaceLineSize = 10;
  
  // Additional overhead for headers, comments, etc.
  const overhead = 200;
  
  return (vertexCount * avgVertexLineSize) + (faceCount * avgFaceLineSize) + overhead;
}

/**
 * Get triangle count from geometry
 */
function getTriangleCount(geometry: THREE.BufferGeometry): number {
  if (geometry.index) {
    return geometry.index.count / 3;
  } else {
    return geometry.attributes.position.count / 3;
  }
}

/**
 * Get vertex count from geometry
 */
function getVertexCount(geometry: THREE.BufferGeometry): number {
  return geometry.attributes.position.count;
}

/**
 * Get polygon face count for OBJ estimation
 */
function getPolygonFaceCount(geometry: THREE.BufferGeometry): number {
  const polygonFaces = (geometry as any).polygonFaces;
  
  if (polygonFaces && Array.isArray(polygonFaces)) {
    return polygonFaces.length;
  }
  
  // Fallback to triangle count if no polygon face data
  return getTriangleCount(geometry);
}

/**
 * Estimate file sizes for complete model export
 */
export function estimateModelFileSize(geometry: THREE.BufferGeometry | null): FileSizeEstimate | null {
  if (!geometry) return null;
  
  const triangleCount = getTriangleCount(geometry);
  const vertexCount = getVertexCount(geometry);
  const polygonFaceCount = getPolygonFaceCount(geometry);
  
  const stlSize = estimateSTLSize(triangleCount);
  const objSize = estimateOBJSize(vertexCount, polygonFaceCount);
  
  return {
    stl: {
      size: stlSize,
      formatted: formatBytes(stlSize)
    },
    obj: {
      size: objSize,
      formatted: formatBytes(objSize)
    }
  };
}

/**
 * Estimate file sizes for polygon parts export
 */
export function estimatePartsFileSize(
  geometry: THREE.BufferGeometry | null,
  partThickness: number,
  scale: number
): PartsFileSizeEstimate | null {
  if (!geometry) return null;
  
  const polygonFaces = (geometry as any).polygonFaces;
  let partCount = 1;
  
  if (polygonFaces && Array.isArray(polygonFaces)) {
    partCount = polygonFaces.length;
  } else {
    // Fallback to triangle count if no polygon face data
    partCount = getTriangleCount(geometry);
  }
  
  // Each part is roughly a polygon extruded by thickness
  // Estimate triangles per part based on polygon complexity and thickness
  const avgTrianglesPerPart = 6; // Conservative estimate for simple parts
  
  // Scale factor affects file size roughly cubically for 3D models
  const scaleFactor = Math.pow(scale, 2); // Simplified to quadratic for surface area
  
  // Thickness affects the complexity slightly (more edge faces)
  const thicknessFactor = 1 + (partThickness / 10); // Small impact
  
  const avgTrianglesAdjusted = avgTrianglesPerPart * scaleFactor * thicknessFactor;
  const avgSTLSize = estimateSTLSize(avgTrianglesAdjusted);
  
  // For parts, we typically use STL format
  const totalSize = avgSTLSize * partCount;
  
  return {
    totalSize,
    averagePartSize: avgSTLSize,
    partCount,
    totalFormatted: formatBytes(totalSize),
    averageFormatted: formatBytes(avgSTLSize)
  };
}

/**
 * Get test data from random shapes for calibration
 */
export function getTestFileSizeData(geometry: THREE.BufferGeometry): any {
  if (!geometry) return null;
  
  const triangleCount = getTriangleCount(geometry);
  const vertexCount = getVertexCount(geometry);
  const polygonFaces = (geometry as any).polygonFaces;
  const polygonType = (geometry as any).polygonType;
  
  const estimate = estimateModelFileSize(geometry);
  
  return {
    geometryInfo: {
      triangles: triangleCount,
      vertices: vertexCount,
      polygonFaces: polygonFaces?.length || 0,
      polygonType: polygonType || 'unknown'
    },
    estimates: estimate,
    timestamp: new Date().toISOString()
  };
}
