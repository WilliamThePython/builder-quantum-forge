import * as THREE from "three";
import { PolygonFace } from "./edgeAdjacentMerger";

/**
 * Procedural Face Merger
 * Ultra-aggressive merging specifically for clean procedural shapes
 * Perfect for gears, stars, crosses where we know faces should merge completely
 */
export class ProceduralFaceMerger {
  private static readonly NORMAL_TOLERANCE = 0.9; // Very permissive for procedural shapes
  private static readonly DISTANCE_TOLERANCE = 0.1; // Large tolerance for floating point variations

  /**
   * Aggressively merge all coplanar faces in procedural shapes
   */
  static mergeProceduralFaces(faces: PolygonFace[]): PolygonFace[] {
    console.log('🎯 PROCEDURAL FACE MERGER - Ultra-aggressive merging');
    console.log(`   Input: ${faces.length} faces`);

    // Group by normal direction with very aggressive bucketing
    const normalGroups = this.groupByAggressiveNormals(faces);
    
    const mergedFaces: PolygonFace[] = [];
    
    for (const [normalKey, groupFaces] of normalGroups) {
      if (groupFaces.length === 1) {
        mergedFaces.push(groupFaces[0]);
        continue;
      }

      // Merge all faces in this normal group into one big polygon
      console.log(`   Merging ${groupFaces.length} faces with normal ${normalKey} → 1 polygon`);
      const merged = this.mergeAllFacesInGroup(groupFaces);
      mergedFaces.push(merged);
    }

    console.log(`✅ Procedural merging: ${faces.length} → ${mergedFaces.length} faces`);
    return mergedFaces;
  }

  /**
   * Group faces by normal with very aggressive bucketing
   */
  private static groupByAggressiveNormals(faces: PolygonFace[]): Map<string, PolygonFace[]> {
    const groups = new Map<string, PolygonFace[]>();

    for (const face of faces) {
      const normal = this.ensureVector3(face.normal).normalize();
      const key = this.getAggressiveNormalKey(normal);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(face);
    }

    return groups;
  }

  /**
   * Create very aggressive normal key - rounds to major directions
   */
  private static getAggressiveNormalKey(normal: THREE.Vector3): string {
    // Round to major cardinal directions for procedural shapes
    let nx = Math.round(normal.x * 10) / 10;
    let ny = Math.round(normal.y * 10) / 10;
    let nz = Math.round(normal.z * 10) / 10;

    // Snap to perfect cardinal directions if close
    if (Math.abs(nx) > 0.9) nx = Math.sign(nx);
    if (Math.abs(ny) > 0.9) ny = Math.sign(ny);
    if (Math.abs(nz) > 0.9) nz = Math.sign(nz);

    return `${nx},${ny},${nz}`;
  }

  /**
   * Merge all faces in a group into one big polygon
   */
  private static mergeAllFacesInGroup(faces: PolygonFace[]): PolygonFace {
    // Collect all vertices and triangle indices
    const allVertices: THREE.Vector3[] = [];
    const allTriangleIndices: number[] = [];

    for (const face of faces) {
      allVertices.push(...face.originalVertices);
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    // Remove duplicates with generous tolerance
    const uniqueVertices = this.removeAggressiveDuplicates(allVertices);
    
    // Order vertices around perimeter
    const normal = this.ensureVector3(faces[0].normal);
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, normal);

    // Determine face type
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
   * Remove duplicate vertices with generous tolerance
   */
  private static removeAggressiveDuplicates(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    const tolerance = 0.05; // Very generous tolerance
    
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

  /**
   * Order polygon vertices around perimeter
   */
  private static orderPolygonVertices(vertices: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    if (vertices.length <= 3) return vertices;

    // Calculate centroid
    const centroid = new THREE.Vector3();
    for (const vertex of vertices) {
      centroid.add(vertex);
    }
    centroid.divideScalar(vertices.length);

    // Create coordinate system on the plane
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.dot(u)) > 0.9) {
      u.set(0, 1, 0);
    }
    u.cross(normal).normalize();
    const v = normal.clone().cross(u).normalize();

    // Sort vertices by angle around centroid
    return vertices.sort((a, b) => {
      const vecA = a.clone().sub(centroid);
      const vecB = b.clone().sub(centroid);
      
      const angleA = Math.atan2(vecA.dot(v), vecA.dot(u));
      const angleB = Math.atan2(vecB.dot(v), vecB.dot(u));
      
      return angleA - angleB;
    });
  }

  // Helper methods
  private static ensureVector3(vector: any): THREE.Vector3 {
    if (vector instanceof THREE.Vector3) return vector;
    if (vector?.x !== undefined && vector?.y !== undefined && vector?.z !== undefined) {
      return new THREE.Vector3(vector.x, vector.y, vector.z);
    }
    return new THREE.Vector3(0, 0, 1);
  }
}
