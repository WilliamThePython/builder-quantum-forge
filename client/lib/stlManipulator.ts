import * as THREE from 'three';
import { FormatConverter } from './formatConverter';

/**
 * STL Manipulation utilities for cleaning, simplifying, and highlighting STL geometries
 * Now uses OBJ format internally for better manipulation capabilities
 */
export class STLManipulator {
  

  
  /**
   * Reduce the number of vertices in the geometry
   */
  static reducePoints(
    geometry: THREE.BufferGeometry,
    targetReduction: number = 0.5,
    method: 'random' | 'best' = 'random'
  ): THREE.BufferGeometry {
    console.log(`Starting ${method} point reduction...`);
    const startTime = Date.now();

    // Clone geometry to avoid modifying original
    const reducedGeometry = geometry.clone();

    const originalPositions = reducedGeometry.attributes.position;
    const originalVertexCount = originalPositions.count;
    const targetVertexCount = Math.floor(originalVertexCount * (1 - targetReduction));

    console.log(`Original: ${originalVertexCount} vertices, target: ${targetVertexCount} vertices`);

    let keptVertices: number[];

    if (method === 'random') {
      keptVertices = this.reducePointsRandom(originalVertexCount, targetVertexCount);
    } else {
      keptVertices = this.reducePointsBest(reducedGeometry, targetVertexCount);
    }

    // Create new position array with only kept vertices
    const newPositions = new Float32Array(keptVertices.length * 3);
    const vertexMapping = new Map<number, number>();

    for (let i = 0; i < keptVertices.length; i++) {
      const originalIndex = keptVertices[i];
      vertexMapping.set(originalIndex, i);

      newPositions[i * 3] = originalPositions.getX(originalIndex);
      newPositions[i * 3 + 1] = originalPositions.getY(originalIndex);
      newPositions[i * 3 + 2] = originalPositions.getZ(originalIndex);
    }

    // Update geometry with new positions
    reducedGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));

    // Create new triangles that only use kept vertices
    const originalTriangleCount = Math.floor(originalVertexCount / 3);
    const newIndices: number[] = [];

    for (let i = 0; i < originalTriangleCount; i++) {
      const v1 = i * 3;
      const v2 = i * 3 + 1;
      const v3 = i * 3 + 2;

      // Only keep triangle if all vertices are kept
      if (vertexMapping.has(v1) && vertexMapping.has(v2) && vertexMapping.has(v3)) {
        newIndices.push(
          vertexMapping.get(v1)!,
          vertexMapping.get(v2)!,
          vertexMapping.get(v3)!
        );
      }
    }

    // Set new indices if we have any triangles left
    if (newIndices.length > 0) {
      reducedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(newIndices), 1));
    }

    // Recompute normals and bounding box
    reducedGeometry.computeVertexNormals();
    reducedGeometry.computeBoundingBox();

    const endTime = Date.now();
    const actualVertexCount = keptVertices.length;
    const actualReduction = ((originalVertexCount - actualVertexCount) / originalVertexCount * 100).toFixed(1);

    console.log(`${method} point reduction completed in ${endTime - startTime}ms`);
    console.log(`Reduced from ${originalVertexCount} to ${actualVertexCount} vertices (${actualReduction}% reduction)`);

    return reducedGeometry;
  }

  /**
   * Random vertex reduction method
   */
  private static reducePointsRandom(originalCount: number, targetCount: number): number[] {
    const indices = Array.from({ length: originalCount }, (_, i) => i);

    // Shuffle and take first targetCount vertices
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    return indices.slice(0, targetCount).sort((a, b) => a - b);
  }

  /**
   * Best vertex reduction method - removes vertices that lie closely flat to the plane
   */
  private static reducePointsBest(geometry: THREE.BufferGeometry, targetCount: number): number[] {
    const positions = geometry.attributes.position;
    const vertexCount = positions.count;

    // Calculate flatness score for each vertex
    const flatnessScores: { index: number; score: number }[] = [];

    for (let i = 0; i < vertexCount; i += 3) {
      // For each triangle, calculate how flat it is
      if (i + 2 < vertexCount) {
        const v1 = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
        const v2 = new THREE.Vector3(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
        const v3 = new THREE.Vector3(positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2));

        // Calculate triangle area (smaller area = flatter)
        const edge1 = v2.clone().sub(v1);
        const edge2 = v3.clone().sub(v1);
        const crossProduct = edge1.cross(edge2);
        const area = crossProduct.length() / 2;

        // Smaller area = higher chance of removal (lower score = removed first)
        flatnessScores.push(
          { index: i, score: area },
          { index: i + 1, score: area },
          { index: i + 2, score: area }
        );
      }
    }

    // Sort by flatness score (lowest first - these will be removed)
    flatnessScores.sort((a, b) => a.score - b.score);

    // Keep the vertices with highest scores (most important for shape)
    const toKeep = flatnessScores.slice(-targetCount).map(item => item.index);
    return toKeep.sort((a, b) => a - b);
  }
  

  
  /**
   * Get triangle index from intersection point
   */
  static getTriangleIndexFromIntersection(geometry: THREE.BufferGeometry, intersection: THREE.Intersection): number | null {
    if (!intersection.face || intersection.face.a === undefined) {
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
