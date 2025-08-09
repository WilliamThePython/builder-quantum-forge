import * as THREE from "three";
import { PolygonFace } from "./edgeAdjacentMerger";

/**
 * Center Triangulated Merger
 * Specifically for shapes with center triangulation (gears, stars, crosses)
 * Merges triangles that share perimeter edges while respecting center void
 */
export class CenterTriangulatedMerger {
  private static readonly NORMAL_TOLERANCE = 0.999; // Very strict coplanarity
  private static readonly DISTANCE_TOLERANCE = 0.001;

  /**
   * Merge center-triangulated faces - only perimeter triangles on same plane
   */
  static mergeCenterTriangulatedFaces(faces: PolygonFace[]): PolygonFace[] {
    console.log('🎯 CENTER TRIANGULATED MERGER');
    console.log(`   Input: ${faces.length} faces`);

    // Group faces by plane normal
    const planeGroups = this.groupFacesByPlane(faces);
    const mergedFaces: PolygonFace[] = [];

    for (const [planeKey, planeFaces] of planeGroups) {
      if (planeFaces.length <= 1) {
        mergedFaces.push(...planeFaces);
        continue;
      }

      // Check if this group forms a center-triangulated pattern
      if (this.isCenterTriangulatedGroup(planeFaces)) {
        console.log(`   Merging center-triangulated group: ${planeFaces.length} triangles → 1 polygon`);
        const merged = this.mergeCenterTriangulatedGroup(planeFaces);
        mergedFaces.push(merged);
      } else {
        // Keep individual faces if not center-triangulated
        mergedFaces.push(...planeFaces);
      }
    }

    console.log(`✅ Center triangulated merging: ${faces.length} → ${mergedFaces.length} faces`);
    return mergedFaces;
  }

  /**
   * Group faces by their plane (normal + distance)
   */
  private static groupFacesByPlane(faces: PolygonFace[]): Map<string, PolygonFace[]> {
    const groups = new Map<string, PolygonFace[]>();

    for (const face of faces) {
      const normal = this.ensureVector3(face.normal).normalize();
      const center = this.getFaceCenter(face.originalVertices);
      const distance = center.dot(normal);

      // Create discrete plane key
      const nx = Math.round(normal.x * 1000) / 1000;
      const ny = Math.round(normal.y * 1000) / 1000;
      const nz = Math.round(normal.z * 1000) / 1000;
      const d = Math.round(distance * 1000) / 1000;
      const key = `${nx},${ny},${nz},${d}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(face);
    }

    return groups;
  }

  /**
   * Check if a group of faces forms a center-triangulated pattern
   */
  private static isCenterTriangulatedGroup(faces: PolygonFace[]): boolean {
    // All faces must be triangles
    if (!faces.every(face => face.originalVertices.length === 3)) {
      return false;
    }

    // For any group of triangles on the same plane, try to merge them
    // This is more aggressive but safer for procedural shapes
    if (faces.length >= 3) {
      console.log(`   Attempting to merge ${faces.length} triangular faces as center-triangulated group`);
      return true;
    }

    return false;
  }

  /**
   * Merge center-triangulated group into a single polygon
   */
  private static mergeCenterTriangulatedGroup(faces: PolygonFace[]): PolygonFace {
    // Find center vertex (most frequently used)
    const vertexCounts = new Map<string, THREE.Vector3>();
    const vertexFreq = new Map<string, number>();

    for (const face of faces) {
      for (const vertex of face.originalVertices) {
        const key = `${vertex.x.toFixed(3)},${vertex.y.toFixed(3)},${vertex.z.toFixed(3)}`;
        vertexCounts.set(key, vertex);
        vertexFreq.set(key, (vertexFreq.get(key) || 0) + 1);
      }
    }

    // Find center vertex (highest frequency)
    let centerVertex: THREE.Vector3 | null = null;
    let maxFreq = 0;
    for (const [key, freq] of vertexFreq) {
      if (freq > maxFreq) {
        maxFreq = freq;
        centerVertex = vertexCounts.get(key)!;
      }
    }

    if (!centerVertex) {
      // Fallback: merge all vertices
      return this.fallbackMerge(faces);
    }

    // Collect perimeter vertices (non-center vertices)
    const perimeterVertices: THREE.Vector3[] = [];
    const tolerance = 0.001;

    for (const face of faces) {
      for (const vertex of face.originalVertices) {
        if (vertex.distanceTo(centerVertex) > tolerance) {
          // Check if we already have this perimeter vertex
          const isDuplicate = perimeterVertices.some(existing => 
            existing.distanceTo(vertex) < tolerance
          );
          if (!isDuplicate) {
            perimeterVertices.push(vertex);
          }
        }
      }
    }

    // Order perimeter vertices around center
    const normal = this.ensureVector3(faces[0].normal);
    const orderedVertices = this.orderVerticesAroundCenter(perimeterVertices, centerVertex, normal);

    // Collect all triangle indices
    const allTriangleIndices: number[] = [];
    for (const face of faces) {
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    const faceType = orderedVertices.length === 3 ? "triangle" :
                    orderedVertices.length === 4 ? "quad" : "polygon";

    return {
      type: faceType,
      originalVertices: orderedVertices,
      normal: normal.clone().normalize(),
      triangleIndices: allTriangleIndices,
    };
  }

  /**
   * Order vertices around a center point
   */
  private static orderVerticesAroundCenter(
    vertices: THREE.Vector3[], 
    center: THREE.Vector3, 
    normal: THREE.Vector3
  ): THREE.Vector3[] {
    if (vertices.length <= 3) return vertices;

    // Create coordinate system on the plane
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.dot(u)) > 0.9) {
      u.set(0, 1, 0);
    }
    u.cross(normal).normalize();
    const v = normal.clone().cross(u).normalize();

    // Sort by angle around center
    return vertices.sort((a, b) => {
      const vecA = a.clone().sub(center);
      const vecB = b.clone().sub(center);
      
      const angleA = Math.atan2(vecA.dot(v), vecA.dot(u));
      const angleB = Math.atan2(vecB.dot(v), vecB.dot(u));
      
      return angleA - angleB;
    });
  }

  /**
   * Fallback merge if center detection fails
   */
  private static fallbackMerge(faces: PolygonFace[]): PolygonFace {
    const allVertices = faces.flatMap(face => face.originalVertices);
    const uniqueVertices = this.removeDuplicateVertices(allVertices);
    const normal = this.ensureVector3(faces[0].normal);
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, normal);

    const allTriangleIndices: number[] = [];
    for (const face of faces) {
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    const faceType = orderedVertices.length === 3 ? "triangle" :
                    orderedVertices.length === 4 ? "quad" : "polygon";

    return {
      type: faceType,
      originalVertices: orderedVertices,
      normal: normal.clone().normalize(),
      triangleIndices: allTriangleIndices,
    };
  }

  // Helper methods
  private static ensureVector3(vector: any): THREE.Vector3 {
    if (vector instanceof THREE.Vector3) return vector;
    if (vector?.x !== undefined && vector?.y !== undefined && vector?.z !== undefined) {
      return new THREE.Vector3(vector.x, vector.y, vector.z);
    }
    return new THREE.Vector3(0, 0, 1);
  }

  private static getFaceCenter(vertices: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    for (const vertex of vertices) {
      center.add(vertex);
    }
    center.divideScalar(vertices.length);
    return center;
  }

  private static removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    const tolerance = 0.001;
    
    for (const vertex of vertices) {
      const isDuplicate = unique.some(existing => 
        existing.distanceTo(vertex) < tolerance
      );
      
      if (!isDuplicate) {
        unique.push(vertex);
      }
    }
    
    return unique;
  }

  private static orderPolygonVertices(vertices: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    if (vertices.length <= 3) return vertices;

    const centroid = new THREE.Vector3();
    for (const vertex of vertices) {
      centroid.add(vertex);
    }
    centroid.divideScalar(vertices.length);

    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.dot(u)) > 0.9) {
      u.set(0, 1, 0);
    }
    u.cross(normal).normalize();
    const v = normal.clone().cross(u).normalize();

    return vertices.sort((a, b) => {
      const vecA = a.clone().sub(centroid);
      const vecB = b.clone().sub(centroid);
      
      const angleA = Math.atan2(vecA.dot(v), vecA.dot(u));
      const angleB = Math.atan2(vecB.dot(v), vecB.dot(u));
      
      return angleA - angleB;
    });
  }
}
