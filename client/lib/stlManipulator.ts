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
   * Get detailed statistics for a specific triangle
   */
  static getTriangleStats(geometry: THREE.BufferGeometry, triangleIndex: number): {
    area: number;
    perimeter: number;
    width: number;
    height: number;
    centroid: THREE.Vector3;
    vertices: THREE.Vector3[];
  } | null {
    if (!geometry || triangleIndex < 0) return null;

    const positions = geometry.attributes.position;
    const i3 = triangleIndex * 3;

    // Check bounds
    if (i3 + 2 >= positions.count / 3) return null;

    // Get triangle vertices
    const v1 = new THREE.Vector3(
      positions.getX(i3 * 3),
      positions.getY(i3 * 3),
      positions.getZ(i3 * 3)
    );
    const v2 = new THREE.Vector3(
      positions.getX(i3 * 3 + 3),
      positions.getY(i3 * 3 + 3),
      positions.getZ(i3 * 3 + 3)
    );
    const v3 = new THREE.Vector3(
      positions.getX(i3 * 3 + 6),
      positions.getY(i3 * 3 + 6),
      positions.getZ(i3 * 3 + 6)
    );

    // Calculate edges
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const edge3 = new THREE.Vector3().subVectors(v3, v2);

    // Calculate area using cross product
    const area = edge1.clone().cross(edge2).length() / 2;

    // Calculate perimeter
    const perimeter = edge1.length() + edge2.length() + edge3.length();

    // Calculate centroid
    const centroid = new THREE.Vector3()
      .addVectors(v1, v2)
      .add(v3)
      .divideScalar(3);

    // Calculate bounding box dimensions
    const minX = Math.min(v1.x, v2.x, v3.x);
    const maxX = Math.max(v1.x, v2.x, v3.x);
    const minY = Math.min(v1.y, v2.y, v3.y);
    const maxY = Math.max(v1.y, v2.y, v3.y);

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      area,
      perimeter,
      width,
      height,
      centroid,
      vertices: [v1, v2, v3]
    };
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
