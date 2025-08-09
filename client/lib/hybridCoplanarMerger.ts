import { EdgeAdjacentMerger, PolygonFace } from "./edgeAdjacentMerger";
import { FlatSurfaceMerger } from "./flatSurfaceMerger";
import { ProceduralFaceMerger } from "./proceduralFaceMerger";
import { CenterTriangulatedMerger } from "./centerTriangulatedMerger";
import { AggressiveCoplanarMerger } from "./aggressiveCoplanarMerger";

/**
 * Hybrid Coplanar Merger
 * Two-stage approach:
 * 1. Edge-adjacent merging for safe boundary-respecting merging
 * 2. Flat surface detection for large planar areas (gear faces, etc.)
 */
export class HybridCoplanarMerger {
  
  /**
   * Apply both edge-adjacent merging and flat surface merging
   */
  static mergeCoplanarTriangles(geometry: THREE.BufferGeometry): PolygonFace[] {
    console.log('🔗 HYBRID COPLANAR MERGER - Two-stage approach');
    
    // Stage 1: Extract faces from geometry
    const faces = EdgeAdjacentMerger.extractTrianglesFromGeometry(geometry);
    console.log(`   Stage 1: Extracted ${faces.length} faces from geometry`);
    
    // Stage 2: Edge-adjacent merging (safe boundary-respecting merging)
    const edgeMergedFaces = EdgeAdjacentMerger.groupEdgeAdjacentTriangles(faces);
    console.log(`   Stage 2: Edge-adjacent merging → ${edgeMergedFaces.length} faces`);
    
    // Stage 3: Flat surface merging (for large planar areas)
    const finalFaces = FlatSurfaceMerger.mergeFlatsurfaces(edgeMergedFaces);
    console.log(`   Stage 3: Flat surface merging → ${finalFaces.length} faces`);
    
    console.log(`✅ Hybrid merging complete: ${faces.length} → ${finalFaces.length} faces`);
    return finalFaces;
  }
  
  /**
   * Apply only flat surface merging (skip edge-adjacent)
   */
  static mergeFlatSurfacesOnly(geometry: THREE.BufferGeometry): PolygonFace[] {
    const faces = EdgeAdjacentMerger.extractTrianglesFromGeometry(geometry);
    return FlatSurfaceMerger.mergeFlatsurfaces(faces);
  }

  /**
   * Strict edge-adjacent merging for procedural shapes (gears, stars, etc.)
   * Only merges triangles that share complete edges - no spatial grouping
   */
  static mergeProceduralTriangles(geometry: THREE.BufferGeometry): PolygonFace[] {
    console.log('🎯 PROCEDURAL EDGE-ADJACENT MERGER - Strict edge-sharing only');

    // Stage 1: Extract faces from geometry
    const faces = EdgeAdjacentMerger.extractTrianglesFromGeometry(geometry);
    console.log(`   Stage 1: Extracted ${faces.length} faces from geometry`);

    // Stage 2: Edge-adjacent merging ONLY (strict edge sharing requirement)
    const edgeMergedFaces = EdgeAdjacentMerger.groupEdgeAdjacentTriangles(faces);
    console.log(`   Stage 2: Edge-adjacent merging → ${edgeMergedFaces.length} faces`);

    // Stage 3: Apply flat surface merging with STRICT edge-adjacency
    const finalFaces = FlatSurfaceMerger.mergeFlatsurfaces(edgeMergedFaces);
    console.log(`   Stage 3: Flat surface merging → ${finalFaces.length} faces`);

    console.log(`✅ Procedural merging: ${faces.length} → ${finalFaces.length} faces`);
    return finalFaces;
  }

  /**
   * Strict flat surface merging - only perfect coplanarity allowed
   */
  private static strictFlatSurfaceMerge(faces: PolygonFace[]): PolygonFace[] {
    const STRICT_NORMAL_TOLERANCE = 0.9999; // Nearly perfect
    const STRICT_DISTANCE_TOLERANCE = 0.001; // Very tight

    // Group by strict normal buckets
    const normalGroups = new Map<string, PolygonFace[]>();

    for (const face of faces) {
      const normal = this.ensureVector3(face.normal).normalize();
      // Use very precise bucketing
      const nx = Math.round(normal.x * 10000) / 10000;
      const ny = Math.round(normal.y * 10000) / 10000;
      const nz = Math.round(normal.z * 10000) / 10000;
      const key = `${nx},${ny},${nz}`;

      if (!normalGroups.has(key)) {
        normalGroups.set(key, []);
      }
      normalGroups.get(key)!.push(face);
    }

    const mergedFaces: PolygonFace[] = [];

    for (const [normalKey, groupFaces] of normalGroups) {
      if (groupFaces.length === 1) {
        mergedFaces.push(groupFaces[0]);
        continue;
      }

      // Check if these faces are truly coplanar and contiguous
      if (this.areStrictlyCoplanar(groupFaces, STRICT_NORMAL_TOLERANCE, STRICT_DISTANCE_TOLERANCE)) {
        console.log(`   Merging ${groupFaces.length} strictly coplanar faces (normal: ${normalKey})`);
        const merged = this.mergeStrictCoplanarFaces(groupFaces);
        mergedFaces.push(merged);
      } else {
        // Keep separate if not strictly coplanar
        mergedFaces.push(...groupFaces);
      }
    }

    return mergedFaces;
  }

  private static areStrictlyCoplanar(faces: PolygonFace[], normalTol: number, distTol: number): boolean {
    if (faces.length < 2) return true;

    const refNormal = this.ensureVector3(faces[0].normal);
    const refCenter = this.getFaceCenter(faces[0].originalVertices);

    for (let i = 1; i < faces.length; i++) {
      const faceNormal = this.ensureVector3(faces[i].normal);
      const faceCenter = this.getFaceCenter(faces[i].originalVertices);

      // Strict normal check
      const dot = Math.abs(refNormal.dot(faceNormal));
      if (dot < normalTol) return false;

      // Strict plane distance check
      const planeDist = Math.abs(faceCenter.clone().sub(refCenter).dot(refNormal));
      if (planeDist > distTol) return false;
    }

    return true;
  }

  private static mergeStrictCoplanarFaces(faces: PolygonFace[]): PolygonFace {
    const allVertices: THREE.Vector3[] = [];
    const allTriangleIndices: number[] = [];

    for (const face of faces) {
      allVertices.push(...face.originalVertices);
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    const uniqueVertices = this.removeDuplicateVertices(allVertices);
    const normal = this.ensureVector3(faces[0].normal);
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, normal);

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
