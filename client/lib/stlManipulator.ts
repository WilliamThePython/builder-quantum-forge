import * as THREE from 'three';
import { MeshStats } from './meshSimplifier';
import { VertexRemovalStitcher } from './vertexRemovalStitcher';

/**
 * STL Manipulation utilities for cleaning, simplifying, and highlighting STL geometries
 * Now uses OBJ format internally for better manipulation capabilities
 */
export class STLManipulator {
  

  
  /**
   * Simple mesh decimation using JavaScript implementation
   */
  static async reducePoints(
    geometry: THREE.BufferGeometry,
    targetReduction: number = 0.5,
    method: 'quadric_edge_collapse' = 'quadric_edge_collapse'
  ): Promise<{
    geometry: THREE.BufferGeometry;
    originalStats: MeshStats;
    newStats: MeshStats;
    reductionAchieved: number;
    processingTime: number;
  }> {
    console.log(`🔄 Starting mesh decimation (${(targetReduction * 100).toFixed(1)}% reduction)...`);

    const originalStats = this.calculateMeshStats(geometry);

    // Use JavaScript implementation
    const result = await VertexRemovalStitcher.removeVertices(geometry, targetReduction, 'quadric_edge_collapse');

    console.log(`✅ Decimation completed: ${result.originalStats.vertices} → ${result.newStats.vertices} vertices`);

    return {
      geometry: result.simplifiedGeometry,
      originalStats: result.originalStats,
      newStats: result.newStats,
      reductionAchieved: result.reductionAchieved,
      processingTime: result.processingTime
    };
  }

  /**
   * Decimate a single edge by merging two vertices
   */
  static async decimateSingleEdge(
    geometry: THREE.BufferGeometry,
    vertexIndex1: number,
    vertexIndex2: number
  ): Promise<ToolOperationResult> {
    if (!geometry) {
      return { success: false, message: 'No geometry loaded' };
    }

    try {
      const positions = geometry.attributes.position.array as Float32Array;
      const vertexCount = geometry.attributes.position.count;

      if (vertexIndex1 >= vertexCount || vertexIndex2 >= vertexCount) {
        return { success: false, message: 'Invalid vertex indices' };
      }

      // Get vertex positions
      const v1 = new THREE.Vector3(
        positions[vertexIndex1 * 3],
        positions[vertexIndex1 * 3 + 1],
        positions[vertexIndex1 * 3 + 2]
      );

      const v2 = new THREE.Vector3(
        positions[vertexIndex2 * 3],
        positions[vertexIndex2 * 3 + 1],
        positions[vertexIndex2 * 3 + 2]
      );

      console.log(`🎯 GEOMETRIC EDGE COLLAPSE ANALYSIS`);
      console.log(`   Edge vertices: v${vertexIndex1} [${v1.x.toFixed(3)}, ${v1.y.toFixed(3)}, ${v1.z.toFixed(3)}]`);
      console.log(`                  v${vertexIndex2} [${v2.x.toFixed(3)}, ${v2.y.toFixed(3)}, ${v2.z.toFixed(3)}]`);

      // Analyze faces connected to this edge to determine optimal collapse position
      const collapsePosition = this.calculateOptimalCollapsePosition(geometry, v1, v2, vertexIndex1, vertexIndex2);

      console.log(`   Optimal collapse position: [${collapsePosition.x.toFixed(3)}, ${collapsePosition.y.toFixed(3)}, ${collapsePosition.z.toFixed(3)}]`);

      // Perform edge collapse
      const result = await VertexRemovalStitcher.collapseSingleEdge(
        geometry,
        vertexIndex1,
        vertexIndex2,
        collapsePosition
      );

      if (result.success) {
        return {
          success: true,
          message: `Edge collapsed: ${vertexIndex1}↔${vertexIndex2}`,
          geometry: result.geometry,
          originalStats: { vertices: vertexCount, faces: 0 },
          newStats: { vertices: result.geometry?.attributes.position.count || 0, faces: 0 }
        };
      }

      return result;

    } catch (error) {
      return {
        success: false,
        message: `Edge decimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Calculate mesh statistics
   */
  private static calculateMeshStats(geometry: THREE.BufferGeometry): MeshStats {
    const vertices = geometry.attributes.position ? geometry.attributes.position.count : 0;
    const faces = geometry.index ? geometry.index.count / 3 : Math.floor(vertices / 3);

    return {
      vertices,
      faces,
      edges: vertices + faces - 2, // Euler's formula approximation
      volume: 0,
      hasNormals: !!geometry.attributes.normal,
      hasUVs: !!geometry.attributes.uv,
      isIndexed: !!geometry.index
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
   * Get polygon face from intersection point
   */
  static getPolygonFaceFromIntersection(geometry: THREE.BufferGeometry, intersection: THREE.Intersection): number | null {
    if (!intersection.face || intersection.face.a === undefined) {
      return null;
    }

    const polygonFaces = (geometry as any).polygonFaces;
    if (!polygonFaces || !Array.isArray(polygonFaces)) {
      // Fallback to triangle index for non-polygon geometries
      return this.getTriangleIndexFromIntersection(geometry, intersection);
    }

    // Get the triangle index that was hit
    const triangleIndex = !geometry.index ?
      Math.floor(intersection.face.a / 3) :
      this.findTriangleIndexFromFace(geometry, intersection.face);

    if (triangleIndex === null) return null;

    // Find which polygon face contains this triangle
    let currentTriangleCount = 0;
    for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
      const face = polygonFaces[faceIndex];
      const faceTriangleCount = this.getTriangleCountForPolygon(face);

      if (triangleIndex >= currentTriangleCount && triangleIndex < currentTriangleCount + faceTriangleCount) {
        return faceIndex;
      }

      currentTriangleCount += faceTriangleCount;
    }

    return null;
  }

  /**
   * Get number of triangles that make up a polygon face
   */
  static getTriangleCountForPolygon(face: any): number {
    if (!face.originalVertices) {
      if (face.type === 'triangle') return 1;
      if (face.type === 'quad') return 2;
      return 3; // estimate for polygon
    }

    const vertexCount = face.originalVertices.length;
    if (vertexCount === 3) return 1;
    if (vertexCount === 4) return 2;
    return vertexCount - 2; // fan triangulation
  }

  /**
   * Find triangle index from face for indexed geometry
   */
  private static findTriangleIndexFromFace(geometry: THREE.BufferGeometry, face: THREE.Face): number | null {
    if (!geometry.index) return null;

    const indices = geometry.index.array;
    const faceA = face.a;
    const faceB = face.b;
    const faceC = face.c;

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
   * Get detailed statistics for a specific polygon face
   */
  static getPolygonFaceStats(geometry: THREE.BufferGeometry, faceIndex: number): {
    area: number;
    perimeter: number;
    width: number;
    height: number;
    centroid: THREE.Vector3;
    vertices: THREE.Vector3[];
    faceType: string;
    vertexCount: number;
  } | null {
    const polygonFaces = (geometry as any).polygonFaces;

    if (!polygonFaces || !Array.isArray(polygonFaces) || faceIndex < 0 || faceIndex >= polygonFaces.length) {
      // Fallback to triangle stats for non-polygon geometries
      const triangleStats = this.getTriangleStats(geometry, faceIndex);
      if (!triangleStats) return null;

      return {
        ...triangleStats,
        faceType: 'triangle',
        vertexCount: 3
      };
    }

    const face = polygonFaces[faceIndex];
    const vertices = face.originalVertices || [];

    if (vertices.length < 3) return null;

    // Calculate polygon properties
    let area = 0;
    let perimeter = 0;

    // Calculate 3D polygon area using cross products (for planar polygons)
    if (vertices.length === 3) {
      // Triangle area
      const edge1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
      const edge2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
      area = edge1.cross(edge2).length() / 2;
    } else {
      // For polygons, use fan triangulation from centroid
      const centroid = new THREE.Vector3();
      vertices.forEach((v: THREE.Vector3) => centroid.add(v));
      centroid.divideScalar(vertices.length);

      for (let i = 0; i < vertices.length; i++) {
        const next = (i + 1) % vertices.length;
        const edge1 = new THREE.Vector3().subVectors(vertices[i], centroid);
        const edge2 = new THREE.Vector3().subVectors(vertices[next], centroid);
        area += edge1.cross(edge2).length() / 2;
      }
    }

    // Calculate perimeter
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      const edge = new THREE.Vector3().subVectors(vertices[next], vertices[i]);
      perimeter += edge.length();
    }

    // Calculate centroid (if not already calculated above)
    let centroid: THREE.Vector3;
    if (vertices.length === 3) {
      centroid = new THREE.Vector3();
      vertices.forEach((v: THREE.Vector3) => centroid.add(v));
      centroid.divideScalar(vertices.length);
    } else {
      // Already calculated above for area calculation
      centroid = new THREE.Vector3();
      vertices.forEach((v: THREE.Vector3) => centroid.add(v));
      centroid.divideScalar(vertices.length);
    }

    // Calculate bounding box dimensions
    const minX = Math.min(...vertices.map((v: THREE.Vector3) => v.x));
    const maxX = Math.max(...vertices.map((v: THREE.Vector3) => v.x));
    const minY = Math.min(...vertices.map((v: THREE.Vector3) => v.y));
    const maxY = Math.max(...vertices.map((v: THREE.Vector3) => v.y));

    const width = maxX - minX;
    const height = maxY - minY;

    return {
      area,
      perimeter,
      width,
      height,
      centroid,
      vertices,
      faceType: face.type || 'polygon',
      vertexCount: vertices.length
    };
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

    // Check bounds based on geometry type
    if (geometry.index) {
      // Indexed geometry: check triangle index against face count
      const faceCount = geometry.index.count / 3;
      if (triangleIndex >= faceCount) return null;
    } else {
      // Non-indexed geometry: check triangle index against vertex count
      const faceCount = positions.count / 3;
      if (triangleIndex >= faceCount) return null;
    }

    // Get triangle vertices - handle both indexed and non-indexed geometry
    let v1, v2, v3;

    if (geometry.index) {
      // Indexed geometry: use triangle index to get face indices
      const indices = geometry.index.array;
      const faceStart = triangleIndex * 3;

      if (faceStart + 2 >= indices.length) return null;

      const i1 = indices[faceStart];
      const i2 = indices[faceStart + 1];
      const i3_indexed = indices[faceStart + 2];

      v1 = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1));
      v2 = new THREE.Vector3(positions.getX(i2), positions.getY(i2), positions.getZ(i2));
      v3 = new THREE.Vector3(positions.getX(i3_indexed), positions.getY(i3_indexed), positions.getZ(i3_indexed));
    } else {
      // Non-indexed geometry: vertices are stored sequentially
      const vertexStart = triangleIndex * 3;

      if (vertexStart + 2 >= positions.count) return null;

      v1 = new THREE.Vector3(positions.getX(vertexStart), positions.getY(vertexStart), positions.getZ(vertexStart));
      v2 = new THREE.Vector3(positions.getX(vertexStart + 1), positions.getY(vertexStart + 1), positions.getZ(vertexStart + 1));
      v3 = new THREE.Vector3(positions.getX(vertexStart + 2), positions.getY(vertexStart + 2), positions.getZ(vertexStart + 2));
    }

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
   * Get detailed geometry analysis including polygon types
   */
  static getDetailedGeometryStats(geometry: THREE.BufferGeometry): {
    vertices: number;
    edges: number;
    polygonBreakdown: { type: string; count: number }[];
    hasPolygonData: boolean;
    geometryType: string;
  } {
    if (!geometry) return {
      vertices: 0,
      edges: 0,
      polygonBreakdown: [],
      hasPolygonData: false,
      geometryType: 'unknown'
    };

    const vertices = geometry.attributes.position.count;

    // Check if geometry has polygon face data
    const polygonFaces = (geometry as any).polygonFaces;
    const polygonType = (geometry as any).polygonType;

    if (polygonFaces && Array.isArray(polygonFaces)) {
      // Analyze polygon face data to get actual geometric properties
      const faceTypeCounts: Record<string, number> = {};
      const uniqueVertices = new Set<string>();
      const edges = new Set<string>();
      const tolerance = 0.001; // Tolerance for vertex uniqueness

      polygonFaces.forEach((face: any) => {
        const faceType = face.type;
        faceTypeCounts[faceType] = (faceTypeCounts[faceType] || 0) + 1;

        if (face.originalVertices && Array.isArray(face.originalVertices)) {
          const faceVertices = face.originalVertices;

          // Add unique vertices (using string representation for uniqueness)
          faceVertices.forEach((vertex: any) => {
            const vertexKey = `${vertex.x.toFixed(3)},${vertex.y.toFixed(3)},${vertex.z.toFixed(3)}`;
            uniqueVertices.add(vertexKey);
          });

          // Add edges (each edge connects two consecutive vertices in the face)
          for (let i = 0; i < faceVertices.length; i++) {
            const v1 = faceVertices[i];
            const v2 = faceVertices[(i + 1) % faceVertices.length];

            // Create edge key (sorted to avoid duplicates like AB and BA)
            const v1Key = `${v1.x.toFixed(3)},${v1.y.toFixed(3)},${v1.z.toFixed(3)}`;
            const v2Key = `${v2.x.toFixed(3)},${v2.y.toFixed(3)},${v2.z.toFixed(3)}`;
            const edgeKey = v1Key < v2Key ? `${v1Key}|${v2Key}` : `${v2Key}|${v1Key}`;
            edges.add(edgeKey);
          }
        }
      });

      // Convert to sorted breakdown with proper naming
      const polygonBreakdown = Object.entries(faceTypeCounts)
        .map(([type, count]) => ({
          type: type === 'triangle' ? 'triangle' :
                type === 'quad' ? 'quad' :
                type === 'polygon' ? 'polygon' : type,
          count
        }))
        .sort((a, b) => {
          // Sort by polygon complexity (triangles first, then quads, etc.)
          const order = { 'triangle': 1, 'quad': 2, 'polygon': 3 };
          return (order[a.type as keyof typeof order] || 4) - (order[b.type as keyof typeof order] || 4);
        });

      return {
        vertices: uniqueVertices.size,
        edges: edges.size,
        polygonBreakdown,
        hasPolygonData: true,
        geometryType: polygonType || 'polygon-based'
      };
    } else {
      // Fallback to triangle analysis
      const triangleCount = Math.floor(vertices / 3);
      const edgeCount = triangleCount * 3; // Approximate edge count for triangulated mesh

      return {
        vertices,
        edges: Math.floor(edgeCount / 2),
        polygonBreakdown: [{ type: 'triangle', count: triangleCount }],
        hasPolygonData: false,
        geometryType: 'triangulated'
      };
    }
  }

  /**
   * Get geometry statistics for display (legacy method for compatibility)
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

  /**
   * Calculate collapse position - simplified to always use midpoint
   * Coplanar faces are handled separately during merging (not decimation)
   */
  private static calculateOptimalCollapsePosition(
    geometry: THREE.BufferGeometry,
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    vertexIndex1: number,
    vertexIndex2: number
  ): THREE.Vector3 {
    console.log(`   Using midpoint for edge collapse (simplified algorithm)`);

    // Always use midpoint - simple, predictable, and preserves mesh quality
    // Coplanar face merging happens separately in viewer/export pipeline
    return v1.clone().add(v2).multiplyScalar(0.5);
  }

  /**
   * Calculate collapse position for edge shared by two faces
   */
  private static calculateCollapseForTwoFaces(face1: any, face2: any, v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
    console.log(`   Analyzing two-face edge collapse`);

    // For two coplanar faces, the optimal position maintains planarity
    // For non-coplanar faces, we need to find a position that minimizes distortion

    const normal1 = face1.normal instanceof THREE.Vector3
      ? face1.normal
      : new THREE.Vector3(face1.normal.x, face1.normal.y, face1.normal.z);
    const normal2 = face2.normal instanceof THREE.Vector3
      ? face2.normal
      : new THREE.Vector3(face2.normal.x, face2.normal.y, face2.normal.z);

    // Check if faces are coplanar
    const normalDot = Math.abs(normal1.dot(normal2));
    const coplanar = normalDot > 0.99; // ~8 degree tolerance

    if (coplanar) {
      console.log(`     Faces are coplanar - using midpoint`);
      return v1.clone().add(v2).multiplyScalar(0.5);
    } else {
      console.log(`     Faces are non-coplanar (dot=${normalDot.toFixed(3)}) - using weighted position`);
      // For non-coplanar faces, bias towards the face with larger area
      const area1 = this.calculateFaceArea(face1);
      const area2 = this.calculateFaceArea(face2);

      const totalArea = area1 + area2;
      if (totalArea > 0) {
        const weight1 = area1 / totalArea;
        const weight2 = area2 / totalArea;
        console.log(`     Area weighting: face1=${weight1.toFixed(3)}, face2=${weight2.toFixed(3)}`);

        // Weight towards larger face to preserve more geometry
        return v1.clone().multiplyScalar(weight2).add(v2.clone().multiplyScalar(weight1));
      } else {
        return v1.clone().add(v2).multiplyScalar(0.5);
      }
    }
  }

  /**
   * Calculate collapse position for boundary edge (one face)
   */
  private static calculateCollapseForBoundaryEdge(face: any, v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
    console.log(`   Analyzing boundary edge collapse`);
    // For boundary edges, preserve the face shape by using midpoint
    return v1.clone().add(v2).multiplyScalar(0.5);
  }

  /**
   * Calculate collapse position for multiple faces (non-manifold)
   */
  private static calculateCollapseForMultipleFaces(faces: any[], v1: THREE.Vector3, v2: THREE.Vector3): THREE.Vector3 {
    console.log(`   Analyzing multi-face edge collapse`);

    // Calculate weighted average based on face areas
    let totalArea = 0;
    let weightedPosition = new THREE.Vector3();

    faces.forEach(face => {
      const area = this.calculateFaceArea(face);
      totalArea += area;

      // Weight towards larger faces
      const faceCenter = this.calculateFaceCenter(face);
      const edgeCenter = v1.clone().add(v2).multiplyScalar(0.5);

      // Project edge center onto face plane for optimal position
      const normal = face.normal instanceof THREE.Vector3
        ? face.normal
        : new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z);

      weightedPosition.add(edgeCenter.clone().multiplyScalar(area));
    });

    if (totalArea > 0) {
      weightedPosition.divideScalar(totalArea);
      return weightedPosition;
    } else {
      return v1.clone().add(v2).multiplyScalar(0.5);
    }
  }

  /**
   * Calculate face area
   */
  private static calculateFaceArea(face: any): number {
    if (!face.originalVertices || face.originalVertices.length < 3) return 0;

    const vertices = face.originalVertices.map((v: any) =>
      v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z)
    );

    if (vertices.length === 3) {
      // Triangle area
      const edge1 = vertices[1].clone().sub(vertices[0]);
      const edge2 = vertices[2].clone().sub(vertices[0]);
      return edge1.cross(edge2).length() * 0.5;
    } else {
      // Polygon area using shoelace formula (simplified)
      let area = 0;
      for (let i = 0; i < vertices.length; i++) {
        const curr = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        area += (curr.x * next.y - next.x * curr.y);
      }
      return Math.abs(area) * 0.5;
    }
  }

  /**
   * Calculate face center
   */
  private static calculateFaceCenter(face: any): THREE.Vector3 {
    if (!face.originalVertices || face.originalVertices.length === 0) {
      return new THREE.Vector3();
    }

    const center = new THREE.Vector3();
    face.originalVertices.forEach((v: any) => {
      const vertex = v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z);
      center.add(vertex);
    });
    center.divideScalar(face.originalVertices.length);

    return center;
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
  geometry?: THREE.BufferGeometry;
  originalStats?: any;
  newStats?: any;
  processingTime?: number;
  stats?: any;
}
