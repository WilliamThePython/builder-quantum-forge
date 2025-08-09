import * as THREE from "three";
import { PolygonFace } from "./edgeAdjacentMerger";

/**
 * Spatial Coplanar Merger
 * Groups triangles that are coplanar AND spatially contiguous
 * Uses bounding box overlap and proximity checks to avoid merging across gaps
 */
export class SpatialCoplanarMerger {
  private static readonly DISTANCE_TOLERANCE = 0.001;
  private static readonly NORMAL_TOLERANCE = 0.999;
  private static readonly PROXIMITY_THRESHOLD = 0.1; // Maximum gap between face boundaries

  /**
   * Group coplanar triangles that are spatially contiguous
   */
  static groupSpatiallyContiguousTriangles(faces: PolygonFace[]): PolygonFace[] {
    console.log('🌐 SPATIAL COPLANAR MERGER');
    console.log(`   Input: ${faces.length} faces`);

    // Group faces by plane (normal + distance)
    const planeGroups = this.groupFacesByPlane(faces);
    
    // For each plane group, find spatially contiguous clusters
    const mergedFaces: PolygonFace[] = [];
    
    for (const [planeKey, planeFaces] of planeGroups) {
      const clusters = this.findSpatialClusters(planeFaces);
      
      for (const cluster of clusters) {
        if (cluster.length === 1) {
          mergedFaces.push(cluster[0]);
        } else {
          const merged = this.mergeFaceCluster(cluster);
          mergedFaces.push(merged);
        }
      }
    }

    console.log(`✅ Output: ${mergedFaces.length} spatially grouped faces`);
    return mergedFaces;
  }

  /**
   * Group faces by their plane (normal + distance from origin)
   */
  private static groupFacesByPlane(faces: PolygonFace[]): Map<string, PolygonFace[]> {
    const planeGroups = new Map<string, PolygonFace[]>();

    for (const face of faces) {
      const planeKey = this.getPlaneKey(face);
      
      if (!planeGroups.has(planeKey)) {
        planeGroups.set(planeKey, []);
      }
      
      planeGroups.get(planeKey)!.push(face);
    }

    return planeGroups;
  }

  /**
   * Generate a unique key for a plane based on normal and distance
   */
  private static getPlaneKey(face: PolygonFace): string {
    const normal = this.ensureVector3(face.normal).normalize();
    const center = this.getFaceCenter(face.originalVertices);
    const distance = center.dot(normal);

    // Round to create discrete plane buckets
    const nx = Math.round(normal.x * 1000) / 1000;
    const ny = Math.round(normal.y * 1000) / 1000;
    const nz = Math.round(normal.z * 1000) / 1000;
    const d = Math.round(distance * 1000) / 1000;

    return `${nx},${ny},${nz},${d}`;
  }

  /**
   * Find spatially contiguous clusters within a plane group
   */
  private static findSpatialClusters(planeFaces: PolygonFace[]): PolygonFace[][] {
    const visited = new Set<number>();
    const clusters: PolygonFace[][] = [];

    for (let i = 0; i < planeFaces.length; i++) {
      if (!visited.has(i)) {
        const cluster = this.buildSpatialCluster(i, planeFaces, visited);
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * Build a spatial cluster starting from a seed face
   */
  private static buildSpatialCluster(
    seedIndex: number,
    planeFaces: PolygonFace[],
    visited: Set<number>
  ): PolygonFace[] {
    const cluster: PolygonFace[] = [];
    const queue = [seedIndex];

    while (queue.length > 0) {
      const currentIndex = queue.shift()!;
      
      if (visited.has(currentIndex)) continue;
      visited.add(currentIndex);
      
      cluster.push(planeFaces[currentIndex]);

      // Find nearby unvisited faces
      for (let i = 0; i < planeFaces.length; i++) {
        if (!visited.has(i) && 
            this.facesAreSpatiallyContiguous(planeFaces[currentIndex], planeFaces[i])) {
          queue.push(i);
        }
      }
    }

    return cluster;
  }

  /**
   * Check if two faces are spatially contiguous (close enough boundaries)
   */
  private static facesAreSpatiallyContiguous(face1: PolygonFace, face2: PolygonFace): boolean {
    // Get bounding boxes
    const bbox1 = this.getFaceBoundingBox(face1);
    const bbox2 = this.getFaceBoundingBox(face2);

    // Check if bounding boxes are close or overlapping
    const gap = this.boundingBoxGap(bbox1, bbox2);
    
    return gap <= this.PROXIMITY_THRESHOLD;
  }

  /**
   * Get bounding box of a face
   */
  private static getFaceBoundingBox(face: PolygonFace): THREE.Box3 {
    const box = new THREE.Box3();
    for (const vertex of face.originalVertices) {
      box.expandByPoint(vertex);
    }
    return box;
  }

  /**
   * Calculate minimum gap between two bounding boxes
   */
  private static boundingBoxGap(box1: THREE.Box3, box2: THREE.Box3): number {
    // If boxes intersect, gap is 0
    if (box1.intersectsBox(box2)) {
      return 0;
    }

    // Calculate minimum distance between boxes
    const center1 = box1.getCenter(new THREE.Vector3());
    const center2 = box2.getCenter(new THREE.Vector3());
    const size1 = box1.getSize(new THREE.Vector3());
    const size2 = box2.getSize(new THREE.Vector3());

    // Distance between centers minus half-sizes
    const dx = Math.max(0, Math.abs(center1.x - center2.x) - (size1.x + size2.x) * 0.5);
    const dy = Math.max(0, Math.abs(center1.y - center2.y) - (size1.y + size2.y) * 0.5);
    const dz = Math.max(0, Math.abs(center1.z - center2.z) - (size1.z + size2.z) * 0.5);

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Merge a cluster of faces into a single polygon
   */
  private static mergeFaceCluster(cluster: PolygonFace[]): PolygonFace {
    // Combine all vertices
    const allVertices: THREE.Vector3[] = [];
    const allTriangleIndices: number[] = [];

    for (const face of cluster) {
      allVertices.push(...face.originalVertices);
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    // Get unique vertices and order them
    const uniqueVertices = this.removeDuplicateVertices(allVertices);
    const normal = this.ensureVector3(cluster[0].normal);
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, normal);

    // Determine face type
    const faceType = orderedVertices.length === 3 ? "triangle" :
                    orderedVertices.length === 4 ? "quad" : "polygon";

    console.log(`   Merged cluster of ${cluster.length} faces into ${faceType} with ${orderedVertices.length} vertices`);

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
    
    for (const vertex of vertices) {
      const isDuplicate = unique.some(existing => 
        existing.distanceTo(vertex) < this.DISTANCE_TOLERANCE
      );
      
      if (!isDuplicate) {
        unique.push(vertex);
      }
    }
    
    return unique;
  }

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
}
