import * as THREE from 'three';

/**
 * STL Manipulation utilities for cleaning, simplifying, and highlighting STL geometries
 */
export class STLManipulator {
  

  
  /**
   * Reduce the number of points in the geometry using edge collapse decimation
   */
  static reducePoints(geometry: THREE.BufferGeometry, targetReduction: number = 0.5): THREE.BufferGeometry {
    console.log('Starting point reduction...');
    const startTime = Date.now();
    
    // Clone geometry to avoid modifying original
    const reducedGeometry = geometry.clone();
    
    // Ensure we have an indexed geometry for efficient processing
    if (!reducedGeometry.index) {
      // Convert non-indexed to indexed
      const positions = reducedGeometry.attributes.position;
      const indices: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        indices.push(i);
      }
      reducedGeometry.setIndex(indices);
    }
    
    const originalVertexCount = reducedGeometry.attributes.position.count;
    const originalTriangleCount = reducedGeometry.index!.count / 3;
    
    console.log(`Original: ${originalVertexCount} vertices, ${originalTriangleCount} triangles`);
    
    // Simple decimation: remove every nth triangle based on target reduction
    const targetTriangleCount = Math.floor(originalTriangleCount * (1 - targetReduction));
    const skipRatio = originalTriangleCount / targetTriangleCount;
    
    const oldIndices = reducedGeometry.index!.array;
    const newIndices: number[] = [];
    
    for (let i = 0; i < originalTriangleCount; i++) {
      // Keep triangles based on skip ratio with some randomness for better distribution
      if (i % Math.floor(skipRatio) === 0 || Math.random() > targetReduction) {
        const i3 = i * 3;
        newIndices.push(oldIndices[i3], oldIndices[i3 + 1], oldIndices[i3 + 2]);
      }
    }
    
    // Set new indices
    reducedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
    
    // Remove unused vertices (this is simplified - a full implementation would be more complex)
    // For now, we keep all vertices but only reference the ones in our new indices
    
    // Recompute normals and bounding box
    reducedGeometry.computeVertexNormals();
    reducedGeometry.computeBoundingBox();
    
    const endTime = Date.now();
    const newTriangleCount = newIndices.length / 3;
    const actualReduction = ((originalTriangleCount - newTriangleCount) / originalTriangleCount * 100).toFixed(1);
    
    console.log(`Point reduction completed in ${endTime - startTime}ms`);
    console.log(`Reduced from ${originalTriangleCount} to ${newTriangleCount} triangles (${actualReduction}% reduction)`);
    
    return reducedGeometry;
  }
  
  /**
   * Create a highlighted version of a specific triangle (facet)
   */
  static createFacetHighlight(geometry: THREE.BufferGeometry, triangleIndex: number): THREE.BufferGeometry | null {
    if (!geometry || !geometry.attributes.position) {
      return null;
    }
    
    const positions = geometry.attributes.position;
    const triangleCount = Math.floor(positions.count / 3);
    
    if (triangleIndex < 0 || triangleIndex >= triangleCount) {
      return null;
    }
    
    // Create a new geometry with just the highlighted triangle
    const highlightGeometry = new THREE.BufferGeometry();
    
    const i3 = triangleIndex * 3;
    const highlightPositions = new Float32Array(9); // 3 vertices * 3 components
    
    // Copy triangle vertices
    for (let i = 0; i < 3; i++) {
      const vertexIndex = i3 + i;
      highlightPositions[i * 3] = positions.getX(vertexIndex);
      highlightPositions[i * 3 + 1] = positions.getY(vertexIndex);
      highlightPositions[i * 3 + 2] = positions.getZ(vertexIndex);
    }
    
    highlightGeometry.setAttribute('position', new THREE.BufferAttribute(highlightPositions, 3));
    highlightGeometry.computeVertexNormals();
    
    return highlightGeometry;
  }
  
  /**
   * Get triangle index from intersection point
   */
  static getTriangleIndexFromIntersection(geometry: THREE.BufferGeometry, intersection: THREE.Intersection): number | null {
    if (!intersection.face || !intersection.face.a !== undefined) {
      return null;
    }
    
    // For non-indexed geometry, calculate triangle index from face indices
    if (!geometry.index) {
      return Math.floor(intersection.face.a / 3);
    }
    
    // For indexed geometry, we need to find which triangle contains these vertices
    const indices = geometry.index.array;
    const faceA = intersection.face.a;
    const faceB = intersection.face.b;
    const faceC = intersection.face.c;
    
    // Find the triangle index that contains these face indices
    for (let i = 0; i < indices.length; i += 3) {
      if ((indices[i] === faceA && indices[i + 1] === faceB && indices[i + 2] === faceC) ||
          (indices[i] === faceA && indices[i + 1] === faceC && indices[i + 2] === faceB) ||
          (indices[i] === faceB && indices[i + 1] === faceA && indices[i + 2] === faceC) ||
          (indices[i] === faceB && indices[i + 1] === faceC && indices[i + 2] === faceA) ||
          (indices[i] === faceC && indices[i + 1] === faceA && indices[i + 2] === faceB) ||
          (indices[i] === faceC && indices[i + 1] === faceB && indices[i + 2] === faceA)) {
        return Math.floor(i / 3);
      }
    }
    
    return null;
  }
  
  /**
   * Get geometry statistics for display
   */
  static getGeometryStats(geometry: THREE.BufferGeometry): {
    vertices: number;
    triangles: number;
    hasIndices: boolean;
    boundingBox: THREE.Box3 | null;
  } {
    const vertices = geometry.attributes.position ? geometry.attributes.position.count : 0;
    const triangles = geometry.index ? geometry.index.count / 3 : Math.floor(vertices / 3);
    
    geometry.computeBoundingBox();
    
    return {
      vertices,
      triangles,
      hasIndices: !!geometry.index,
      boundingBox: geometry.boundingBox
    };
  }
}

/**
 * Tool modes for STL manipulation
 */
export enum STLToolMode {
  None = 'none',
  Highlight = 'highlight',
  Cleanup = 'cleanup',
  Reduce = 'reduce'
}

/**
 * Interface for tool operation results
 */
export interface ToolOperationResult {
  success: boolean;
  message: string;
  originalStats?: any;
  newStats?: any;
  processingTime?: number;
}
