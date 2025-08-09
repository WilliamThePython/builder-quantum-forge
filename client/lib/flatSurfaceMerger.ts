import * as THREE from "three";
import { PolygonFace } from "./edgeAdjacentMerger";

/**
 * Flat Surface Merger
 * Detects large flat surfaces and merges all coplanar triangles into single polygons
 * Perfect for gear faces, star faces, cross sections, etc.
 */
export class FlatSurfaceMerger {
  private static readonly NORMAL_TOLERANCE = 0.95; // More permissive for procedural shapes
  private static readonly DISTANCE_TOLERANCE = 0.01; // Allow for small floating point errors
  private static readonly MIN_SURFACE_AREA = 0.01; // Lower threshold for procedural shapes

  /**
   * Detect flat surfaces and merge all triangles in each surface
   */
  static mergeFlatsurfaces(faces: PolygonFace[]): PolygonFace[] {
    console.log('🔄 FLAT SURFACE MERGER');
    console.log(`   Input: ${faces.length} faces`);

    // Group faces by plane normal (round to discrete buckets)
    const normalGroups = this.groupFacesByNormal(faces);
    
    const mergedFaces: PolygonFace[] = [];
    
    for (const [normalKey, normalFaces] of normalGroups) {
      if (normalFaces.length === 1) {
        mergedFaces.push(normalFaces[0]);
        continue;
      }

      // Check if this is a large flat surface worth merging
      const totalArea = this.calculateTotalArea(normalFaces);
      
      if (totalArea >= this.MIN_SURFACE_AREA && this.isContiguousSurface(normalFaces)) {
        console.log(`   Merging flat surface: ${normalFaces.length} faces → 1 polygon (area: ${totalArea.toFixed(3)})`);
        const merged = this.mergeIntoSinglePolygon(normalFaces);
        mergedFaces.push(merged);
      } else {
        // Keep individual faces if not a large flat surface
        mergedFaces.push(...normalFaces);
      }
    }

    console.log(`✅ Output: ${mergedFaces.length} faces (flat surfaces merged)`);
    return mergedFaces;
  }

  /**
   * Group faces by their normal direction (discretized for grouping)
   */
  private static groupFacesByNormal(faces: PolygonFace[]): Map<string, PolygonFace[]> {
    const groups = new Map<string, PolygonFace[]>();

    for (const face of faces) {
      const normal = this.ensureVector3(face.normal).normalize();
      const key = this.getNormalKey(normal);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(face);
    }

    return groups;
  }

  /**
   * Create a discrete key for a normal vector - more aggressive rounding
   */
  private static getNormalKey(normal: THREE.Vector3): string {
    // Use more aggressive rounding for better grouping
    const nx = Math.round(normal.x * 100) / 100;
    const ny = Math.round(normal.y * 100) / 100;
    const nz = Math.round(normal.z * 100) / 100;
    return `${nx},${ny},${nz}`;
  }

  /**
   * Calculate total area of a group of faces
   */
  private static calculateTotalArea(faces: PolygonFace[]): number {
    let totalArea = 0;
    
    for (const face of faces) {
      totalArea += this.calculatePolygonArea(face.originalVertices);
    }
    
    return totalArea;
  }

  /**
   * Calculate area of a polygon
   */
  private static calculatePolygonArea(vertices: THREE.Vector3[]): number {
    if (vertices.length < 3) return 0;
    
    let area = 0;
    const n = vertices.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  /**
   * Check if faces form a contiguous surface (all on same plane)
   */
  private static isContiguousSurface(faces: PolygonFace[]): boolean {
    if (faces.length < 2) return true;

    const referenceNormal = this.ensureVector3(faces[0].normal);
    const referencePlane = this.getFaceCenter(faces[0].originalVertices);

    // Check all faces are on the same plane
    for (let i = 1; i < faces.length; i++) {
      const faceNormal = this.ensureVector3(faces[i].normal);
      const faceCenter = this.getFaceCenter(faces[i].originalVertices);
      
      // Check normal similarity
      const normalDot = Math.abs(referenceNormal.dot(faceNormal));
      if (normalDot < this.NORMAL_TOLERANCE) return false;
      
      // Check plane distance
      const planeDistance = this.distanceToPlane(faceCenter, referencePlane, referenceNormal);
      if (Math.abs(planeDistance) > this.DISTANCE_TOLERANCE) return false;
    }

    return true;
  }

  /**
   * Merge multiple faces into a single polygon
   */
  private static mergeIntoSinglePolygon(faces: PolygonFace[]): PolygonFace {
    // Collect all vertices and triangle indices
    const allVertices: THREE.Vector3[] = [];
    const allTriangleIndices: number[] = [];

    for (const face of faces) {
      allVertices.push(...face.originalVertices);
      allTriangleIndices.push(...(face.triangleIndices || []));
    }

    // Remove duplicate vertices
    const uniqueVertices = this.removeDuplicateVertices(allVertices);
    
    // Order vertices around the perimeter
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

  private static distanceToPlane(
    point: THREE.Vector3, 
    planePoint: THREE.Vector3, 
    planeNormal: THREE.Vector3
  ): number {
    const diff = point.clone().sub(planePoint);
    return diff.dot(planeNormal);
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
