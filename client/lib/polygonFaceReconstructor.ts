import * as THREE from 'three';
import { CoplanarMerger, PolygonFace } from './coplanarMerger';

/**
 * PolygonFaceReconstructor analyzes triangulated geometries and attempts to
 * reconstruct the original polygon faces by finding coplanar triangles
 *
 * Now uses the unified CoplanarMerger for consistent methodology
 */
export class PolygonFaceReconstructor {
  
  /**
   * Reconstruct polygon faces from a triangulated geometry using unified CoplanarMerger
   */
  static reconstructPolygonFaces(geometry: THREE.BufferGeometry): any[] {
    if (!geometry || !geometry.attributes.position) {
      return [];
    }


    const triangleCount = Math.floor(geometry.attributes.position.count / 3);

    // Use the unified CoplanarMerger for consistent methodology
    const mergedFaces = CoplanarMerger.mergeGeometryTriangles(geometry);


    return mergedFaces;
  }

  /**
   * Extract triangle data from geometry
   */
  private static extractTriangles(geometry: THREE.BufferGeometry): Triangle[] {
    const positions = geometry.attributes.position;
    const triangles: Triangle[] = [];
    
    for (let i = 0; i < positions.count; i += 3) {
      const v1 = new THREE.Vector3(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i)
      );
      const v2 = new THREE.Vector3(
        positions.getX(i + 1),
        positions.getY(i + 1),
        positions.getZ(i + 1)
      );
      const v3 = new THREE.Vector3(
        positions.getX(i + 2),
        positions.getY(i + 2),
        positions.getZ(i + 2)
      );

      // Calculate normal
      const edge1 = new THREE.Vector3().subVectors(v2, v1);
      const edge2 = new THREE.Vector3().subVectors(v3, v1);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      
      // Skip degenerate triangles
      if (normal.length() > 0.001) {
        triangles.push({
          vertices: [v1, v2, v3],
          normal,
          index: Math.floor(i / 3),
          centroid: new THREE.Vector3().addVectors(v1, v2).add(v3).divideScalar(3)
        });
      }
    }
    
    return triangles;
  }

  /**
   * Group coplanar triangles into polygon faces
   */
  private static groupCoplanarTriangles(triangles: Triangle[]): PolygonFace[] {
    const faces: PolygonFace[] = [];
    const used = new Set<number>();
    const tolerance = 0.01; // Tolerance for coplanar detection
    const normalTolerance = 0.99; // Cos of ~8 degrees

    for (let i = 0; i < triangles.length; i++) {
      if (used.has(i)) continue;

      const baseTriangle = triangles[i];
      const coplanarTriangles = [baseTriangle];
      used.add(i);

      // Find all triangles coplanar with this one
      for (let j = i + 1; j < triangles.length; j++) {
        if (used.has(j)) continue;

        const testTriangle = triangles[j];
        
        // Check if normals are similar (coplanar)
        const normalDot = Math.abs(baseTriangle.normal.dot(testTriangle.normal));
        if (normalDot < normalTolerance) continue;

        // Check if triangles are on the same plane
        const planeDistance = this.distanceToPlane(
          testTriangle.centroid, 
          baseTriangle.centroid, 
          baseTriangle.normal
        );
        
        if (Math.abs(planeDistance) < tolerance) {
          coplanarTriangles.push(testTriangle);
          used.add(j);
        }
      }

      // Create polygon face from coplanar triangles
      if (coplanarTriangles.length === 1) {
        // Single triangle
        faces.push({
          type: 'triangle',
          originalVertices: baseTriangle.vertices,
          normal: baseTriangle.normal,
          triangleIndices: [baseTriangle.index]
        });
      } else {
        // Multiple triangles - try to reconstruct polygon
        const polygonFace = this.reconstructPolygonFromTriangles(coplanarTriangles);
        faces.push(polygonFace);
      }
    }

    return faces;
  }

  /**
   * Calculate distance from point to plane
   */
  private static distanceToPlane(point: THREE.Vector3, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): number {
    const diff = new THREE.Vector3().subVectors(point, planePoint);
    return diff.dot(planeNormal);
  }

  /**
   * Reconstruct a polygon from multiple coplanar triangles
   */
  private static reconstructPolygonFromTriangles(triangles: Triangle[]): PolygonFace {
    // Extract all unique vertices
    const vertices: THREE.Vector3[] = [];
    const vertexMap = new Map<string, THREE.Vector3>();
    const tolerance = 0.001;

    triangles.forEach(triangle => {
      triangle.vertices.forEach(vertex => {
        const key = `${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`;
        if (!vertexMap.has(key)) {
          vertexMap.set(key, vertex.clone());
          vertices.push(vertex.clone());
        }
      });
    });

    // Determine face type and organize vertices
    let faceType: string;
    let orderedVertices: THREE.Vector3[];

    if (vertices.length === 3) {
      faceType = 'triangle';
      orderedVertices = vertices;
    } else if (vertices.length === 4) {
      faceType = 'quad';
      orderedVertices = this.orderQuadVertices(vertices, triangles[0].normal);
    } else {
      faceType = 'polygon';
      orderedVertices = this.orderPolygonVertices(vertices, triangles[0].normal);
    }

    return {
      type: faceType,
      originalVertices: orderedVertices,
      normal: triangles[0].normal,
      triangleIndices: triangles.map(t => t.index)
    };
  }

  /**
   * Order 4 vertices to form a proper quad
   */
  private static orderQuadVertices(vertices: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    if (vertices.length !== 4) return vertices;

    // Find centroid
    const centroid = new THREE.Vector3();
    vertices.forEach(v => centroid.add(v));
    centroid.divideScalar(4);

    // Create local 2D coordinate system
    const localX = new THREE.Vector3().subVectors(vertices[0], centroid).normalize();
    const localY = new THREE.Vector3().crossVectors(normal, localX).normalize();

    // Convert to 2D coordinates and sort by angle
    const points2D = vertices.map(vertex => {
      const localPos = new THREE.Vector3().subVectors(vertex, centroid);
      return {
        vertex,
        angle: Math.atan2(localPos.dot(localY), localPos.dot(localX))
      };
    });

    points2D.sort((a, b) => a.angle - b.angle);
    return points2D.map(p => p.vertex);
  }



  /**
   * Order polygon vertices in proper winding order
   */
  private static orderPolygonVertices(vertices: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    if (vertices.length < 3) return vertices;

    // Find centroid
    const centroid = new THREE.Vector3();
    vertices.forEach(v => centroid.add(v));
    centroid.divideScalar(vertices.length);

    // Create local 2D coordinate system
    const localX = new THREE.Vector3().subVectors(vertices[0], centroid).normalize();
    const localY = new THREE.Vector3().crossVectors(normal, localX).normalize();

    // Convert to 2D coordinates and sort by angle
    const points2D = vertices.map(vertex => {
      const localPos = new THREE.Vector3().subVectors(vertex, centroid);
      return {
        vertex,
        angle: Math.atan2(localPos.dot(localY), localPos.dot(localX))
      };
    });

    points2D.sort((a, b) => a.angle - b.angle);
    return points2D.map(p => p.vertex);
  }

  /**
   * Apply reconstructed polygon faces to geometry
   */
  static applyReconstructedFaces(geometry: THREE.BufferGeometry, faces: PolygonFace[]): void {
    (geometry as any).polygonFaces = faces;
    (geometry as any).polygonType = 'reconstructed';
    
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>));
  }
}

// Types
interface Triangle {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  index: number;
  centroid: THREE.Vector3;
}

interface PolygonFace {
  type: string;
  originalVertices: THREE.Vector3[];
  normal: THREE.Vector3;
  triangleIndices: number[];
}
