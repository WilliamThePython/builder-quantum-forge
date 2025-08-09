import * as THREE from "three";
import { PolygonFace } from "./edgeAdjacentMerger";

/**
 * Aggressive Coplanar Merger
 * Ultra-aggressive merging for procedural shapes
 * Merges ALL triangles on the same plane into single polygons
 */
export class AggressiveCoplanarMerger {
  private static readonly NORMAL_TOLERANCE = 0.95; // Very permissive
  private static readonly DISTANCE_TOLERANCE = 0.1; // Very permissive

  /**
   * Aggressively merge all coplanar triangles
   */
  static mergeAggressively(faces: PolygonFace[]): PolygonFace[] {
    console.log('⚡ AGGRESSIVE COPLANAR MERGER - Max aggression mode');
    console.log(`   Input: ${faces.length} faces`);

    // Group by major plane directions only
    const planeGroups = this.groupByMajorPlanes(faces);
    const mergedFaces: PolygonFace[] = [];

    for (const [planeKey, planeFaces] of planeGroups) {
      if (planeFaces.length === 1) {
        mergedFaces.push(planeFaces[0]);
        continue;
      }

      console.log(`   Merging plane ${planeKey}: ${planeFaces.length} faces → 1 polygon`);
      const merged = this.mergeAllFacesInPlane(planeFaces);
      mergedFaces.push(merged);
    }

    console.log(`✅ Aggressive merging: ${faces.length} → ${mergedFaces.length} faces`);
    return mergedFaces;
  }

  /**
   * Group by major plane directions (up, down, sides)
   */
  private static groupByMajorPlanes(faces: PolygonFace[]): Map<string, PolygonFace[]> {
    const groups = new Map<string, PolygonFace[]>();

    for (const face of faces) {
      const normal = this.ensureVector3(face.normal).normalize();
      
      // Determine major direction with more permissive thresholds
      let key: string;
      if (Math.abs(normal.y) > 0.5) {
        // More permissive vertical grouping (up/down)
        key = normal.y > 0 ? "UP" : "DOWN";
      } else if (Math.abs(normal.x) > 0.5) {
        // More permissive X direction
        key = normal.x > 0 ? "RIGHT" : "LEFT";
      } else if (Math.abs(normal.z) > 0.5) {
        // More permissive Z direction
        key = normal.z > 0 ? "FRONT" : "BACK";
      } else {
        // Diagonal - use very loose rounding
        const nx = Math.round(normal.x * 2) / 2; // Round to 0.5 increments
        const ny = Math.round(normal.y * 2) / 2;
        const nz = Math.round(normal.z * 2) / 2;
        key = `${nx},${ny},${nz}`;
      }
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(face);
    }

    console.log(`   Created ${groups.size} major plane groups:`);
    for (const [key, groupFaces] of groups) {
      console.log(`     ${key}: ${groupFaces.length} faces`);
    }

    return groups;
  }

  /**
   * Merge all faces in a plane into one big polygon
   */
  private static mergeAllFacesInPlane(faces: PolygonFace[]): PolygonFace {
    // Collect all vertices
    const allVertices = faces.flatMap(face => face.originalVertices);
    
    // Remove duplicates with generous tolerance
    const uniqueVertices = this.removeDuplicateVertices(allVertices);
    
    // Order vertices around perimeter
    const normal = this.ensureVector3(faces[0].normal);
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, normal);

    // Collect all triangle indices
    const allTriangleIndices: number[] = [];
    for (const face of faces) {
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    const faceType = orderedVertices.length === 3 ? "triangle" :
                    orderedVertices.length === 4 ? "quad" : "polygon";

    console.log(`   Created ${faceType} with ${orderedVertices.length} vertices from ${faces.length} input faces`);

    return {
      type: faceType,
      originalVertices: orderedVertices,
      normal: normal.clone().normalize(),
      triangleIndices: allTriangleIndices,
    };
  }

  /**
   * Remove duplicate vertices with very generous tolerance
   */
  private static removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
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
