import * as THREE from 'three';
import { FormatConverter } from './formatConverter';
import { MeshSimplifier, MeshStats } from './meshSimplifier';

/**
 * STL Manipulation utilities for cleaning, simplifying, and highlighting STL geometries
 * Now uses OBJ format internally for better manipulation capabilities
 */
export class STLManipulator {
  

  
  /**
   * Professional mesh simplification using industry-standard algorithms
   */
  static async reducePoints(
    geometry: THREE.BufferGeometry,
    targetReduction: number = 0.5,
    method: 'quadric_edge_collapse' | 'vertex_clustering' | 'adaptive' | 'random' = 'adaptive'
  ): Promise<{
    geometry: THREE.BufferGeometry;
    originalStats: MeshStats;
    newStats: MeshStats;
    reductionAchieved: number;
    processingTime: number;
  }> {
    console.log(`Starting professional mesh simplification using ${method}...`);

    // Convert to OBJ format for better manipulation if needed
    let processingGeometry = geometry;

    // For complex operations, convert through OBJ format for better topology handling
    if (method === 'quadric_edge_collapse' || method === 'adaptive') {
      try {
        const objContent = FormatConverter.createManipulationOBJ(geometry);
        processingGeometry = FormatConverter.objToGeometry(objContent);
        console.log('Using OBJ format for enhanced topology processing');
      } catch (error) {
        console.warn('OBJ conversion failed, using original geometry:', error);
        processingGeometry = geometry;
      }
    }

    // Apply professional mesh simplification
    const result = await MeshSimplifier.simplifyMesh(processingGeometry, {
      method: method as any,
      targetReduction,
      preserveBoundaries: true,
      preserveNormals: true,
      qualityThreshold: 0.8
    });

    console.log('Mesh simplification completed:', {
      method,
      originalVertices: result.originalStats.vertices,
      newVertices: result.newStats.vertices,
      reductionAchieved: `${(result.reductionAchieved * 100).toFixed(1)}%`,
      processingTime: `${result.processingTime}ms`
    });

    return {
      geometry: result.simplifiedGeometry,
      originalStats: result.originalStats,
      newStats: result.newStats,
      reductionAchieved: result.reductionAchieved,
      processingTime: result.processingTime
    };
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
