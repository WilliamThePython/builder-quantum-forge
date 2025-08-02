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
   * Reconstruct polygon faces from a triangulated geometry with comprehensive coplanar merging
   */
  static reconstructPolygonFaces(geometry: THREE.BufferGeometry): any[] {
    if (!geometry || !geometry.attributes.position) {
      return [];
    }

    console.log('🔄 COMPREHENSIVE POLYGON RECONSTRUCTION');

    const positions = geometry.attributes.position;
    const triangleCount = Math.floor(positions.count / 3);
    console.log(`   Input: ${triangleCount} triangles`);

    const triangles = this.extractTriangles(geometry);

    // Step 1: Group triangles by coplanar faces with enhanced tolerance
    const rawFaces = this.groupCoplanarTriangles(triangles);
    console.log(`   Raw grouping: ${rawFaces.length} faces`);

    // Step 2: Enhanced coplanar merging with iterative refinement
    const mergedFaces = this.enhancedCoplanarMerging(rawFaces);
    console.log(`   After enhanced merging: ${mergedFaces.length} faces`);

    // Step 3: Validate all faces are truly coplanar
    const validatedFaces = this.validateAndFixCoplanarity(mergedFaces);
    console.log(`   After coplanarity validation: ${validatedFaces.length} faces`);

    // Step 4: Final polygon optimization
    const optimizedFaces = this.optimizePolygonFaces(validatedFaces);
    console.log(`✅ Final result: ${optimizedFaces.length} robust polygon faces`);

    return optimizedFaces;
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
   * Enhanced coplanar merging with iterative refinement
   */
  private static enhancedCoplanarMerging(faces: PolygonFace[]): PolygonFace[] {
    console.log('   🔄 Enhanced coplanar merging...');

    const tolerance = 0.001;
    const normalTolerance = 0.999;
    let mergedFaces = [...faces];
    let iterationCount = 0;
    let changesMade = true;

    while (changesMade && iterationCount < 10) {
      changesMade = false;
      iterationCount++;

      for (let i = 0; i < mergedFaces.length; i++) {
        for (let j = i + 1; j < mergedFaces.length; j++) {
          const face1 = mergedFaces[i];
          const face2 = mergedFaces[j];

          if (this.canMergeFaces(face1, face2, tolerance, normalTolerance)) {
            const mergedFace = this.mergeTwoFaces(face1, face2);

            mergedFaces = [
              ...mergedFaces.slice(0, i),
              mergedFace,
              ...mergedFaces.slice(i + 1, j),
              ...mergedFaces.slice(j + 1)
            ];

            changesMade = true;
            console.log(`     Iteration ${iterationCount}: Merged 2 faces`);
            break;
          }
        }

        if (changesMade) break;
      }
    }

    console.log(`     Enhanced merging completed in ${iterationCount} iterations`);
    return mergedFaces;
  }

  /**
   * Check if two faces can be merged
   */
  private static canMergeFaces(face1: PolygonFace, face2: PolygonFace, tolerance: number, normalTolerance: number): boolean {
    const normalDot = Math.abs(face1.normal.dot(face2.normal));
    if (normalDot < normalTolerance) return false;

    const face1Center = this.getFaceCenter(face1.originalVertices);
    const planeDistance = this.distanceToPlane(face1Center, this.getFaceCenter(face2.originalVertices), face2.normal);
    if (Math.abs(planeDistance) > tolerance) return false;

    return this.facesShareVertices(face1, face2, tolerance);
  }

  /**
   * Merge two coplanar faces
   */
  private static mergeTwoFaces(face1: PolygonFace, face2: PolygonFace): PolygonFace {
    const allVertices = [...face1.originalVertices, ...face2.originalVertices];
    const uniqueVertices = this.removeDuplicateVertices(allVertices, 0.001);
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, face1.normal);

    return {
      type: orderedVertices.length === 3 ? 'triangle' :
            orderedVertices.length === 4 ? 'quad' : 'polygon',
      originalVertices: orderedVertices,
      normal: face1.normal,
      triangleIndices: [...(face1.triangleIndices || []), ...(face2.triangleIndices || [])]
    };
  }

  /**
   * Check if faces share vertices
   */
  private static facesShareVertices(face1: PolygonFace, face2: PolygonFace, tolerance: number): boolean {
    for (const v1 of face1.originalVertices) {
      for (const v2 of face2.originalVertices) {
        if (v1.distanceTo(v2) < tolerance) return true;
      }
    }
    return false;
  }

  /**
   * Get face center
   */
  private static getFaceCenter(vertices: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    vertices.forEach(v => center.add(v));
    center.divideScalar(vertices.length);
    return center;
  }

  /**
   * Remove duplicate vertices
   */
  private static removeDuplicateVertices(vertices: THREE.Vector3[], tolerance: number): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];

    for (const vertex of vertices) {
      let isDuplicate = false;
      for (const existing of unique) {
        if (vertex.distanceTo(existing) < tolerance) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        unique.push(vertex.clone());
      }
    }

    return unique;
  }

  /**
   * Validate and fix coplanarity
   */
  private static validateAndFixCoplanarity(faces: PolygonFace[]): PolygonFace[] {
    console.log('   🔍 Validating coplanarity...');

    const validatedFaces: PolygonFace[] = [];
    const tolerance = 0.001;

    for (const face of faces) {
      if (this.isStrictlyCoplanar(face.originalVertices, tolerance)) {
        validatedFaces.push(face);
      } else {
        console.warn(`     Removing non-coplanar face with ${face.originalVertices.length} vertices`);
        const triangles = this.splitIntoTriangles(face);
        triangles.forEach(triangle => {
          if (this.isStrictlyCoplanar(triangle.originalVertices, tolerance)) {
            validatedFaces.push(triangle);
          }
        });
      }
    }

    return validatedFaces;
  }

  /**
   * Strict coplanarity check
   */
  private static isStrictlyCoplanar(vertices: THREE.Vector3[], tolerance: number): boolean {
    if (vertices.length < 4) return true;

    const v1 = vertices[0];
    const v2 = vertices[1];
    const v3 = vertices[2];

    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    for (let i = 3; i < vertices.length; i++) {
      const distance = this.distanceToPlane(vertices[i], v1, normal);
      if (Math.abs(distance) > tolerance) return false;
    }

    return true;
  }

  /**
   * Split polygon into triangles
   */
  private static splitIntoTriangles(face: PolygonFace): PolygonFace[] {
    const triangles: PolygonFace[] = [];
    const vertices = face.originalVertices;

    if (vertices.length < 3) return triangles;

    for (let i = 1; i < vertices.length - 1; i++) {
      triangles.push({
        type: 'triangle',
        originalVertices: [vertices[0], vertices[i], vertices[i + 1]],
        normal: face.normal,
        triangleIndices: face.triangleIndices || []
      });
    }

    return triangles;
  }

  /**
   * Final polygon optimization
   */
  private static optimizePolygonFaces(faces: PolygonFace[]): PolygonFace[] {
    console.log('   ⚡ Final polygon optimization...');

    return faces.map(face => {
      const optimizedVertices = this.ensureProperVertexOrder(face.originalVertices, face.normal);

      return {
        ...face,
        originalVertices: optimizedVertices,
        type: optimizedVertices.length === 3 ? 'triangle' :
              optimizedVertices.length === 4 ? 'quad' : 'polygon'
      };
    });
  }

  /**
   * Ensure proper vertex ordering
   */
  private static ensureProperVertexOrder(vertices: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector3[] {
    if (vertices.length <= 3) return vertices;

    if (vertices.length === 4) {
      return this.orderQuadVertices(vertices, normal);
    } else {
      return this.orderPolygonVertices(vertices, normal);
    }
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
    
    console.log(`Applied ${faces.length} reconstructed polygon faces to geometry`);
    console.log('Face types:', faces.map(f => f.type).reduce((acc, type) => {
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
