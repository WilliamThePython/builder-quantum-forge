import * as THREE from 'three';

/**
 * Unified utility for merging coplanar triangles and polygons
 * Provides consistent methodology across all parts of the application
 */
export class CoplanarMerger {
  
  // Configuration constants - more aggressive for symmetry preservation
  private static readonly DISTANCE_TOLERANCE = 0.01; // Increased for better merging
  private static readonly NORMAL_TOLERANCE = 0.995; // Cos of ~5.7 degrees (slightly more permissive)
  private static readonly MAX_MERGE_ITERATIONS = 15; // More iterations for thorough merging

  /**
   * Main entry point: Merge coplanar triangles/polygons with comprehensive validation
   */
  static mergeCoplanarFaces(faces: PolygonFace[]): PolygonFace[] {
    // console.log('🔄 UNIFIED COPLANAR MERGER - SYMMETRY ANALYSIS');
    // console.log(`   Input: ${faces.length} faces`);

    // Step 0: Analyze potential symmetry issues
    // this.analyzeSymmetryStructure(faces);

    // Step 1: Enhanced iterative merging with symmetry awareness
    const mergedFaces = this.performIterativeMerging(faces);
    // console.log(`   After iterative merging: ${mergedFaces.length} faces`);

    // Step 2: Strict coplanarity validation
    const validatedFaces = this.validateCoplanarity(mergedFaces);
    // console.log(`   After coplanarity validation: ${validatedFaces.length} faces`);

    // Step 3: Final optimization with symmetry preservation
    const optimizedFaces = this.optimizeFacesWithSymmetry(validatedFaces);
    // console.log(`✅ Final result: ${optimizedFaces.length} robust faces`);

    // Step 4: Final symmetry check
    // this.analyzeSymmetryStructure(optimizedFaces);

    return optimizedFaces;
  }

  /**
   * Enhanced iterative merging with multiple passes and symmetry awareness
   */
  private static performIterativeMerging(faces: PolygonFace[]): PolygonFace[] {
    // console.log('🔄 SYMMETRY-AWARE ITERATIVE MERGING');
    let mergedFaces = [...faces];
    let iterationCount = 0;
    let changesMade = true;

    while (changesMade && iterationCount < this.MAX_MERGE_ITERATIONS) {
      changesMade = false;
      iterationCount++;

      // Sort faces by area to process larger faces first (more stable merging)
      mergedFaces.sort((a, b) => {
        const areaA = this.calculatePolygonArea(a.originalVertices);
        const areaB = this.calculatePolygonArea(b.originalVertices);
        return areaB - areaA;
      });

      for (let i = 0; i < mergedFaces.length; i++) {
        for (let j = i + 1; j < mergedFaces.length; j++) {
          const face1 = mergedFaces[i];
          const face2 = mergedFaces[j];

          if (this.canMergeFaces(face1, face2)) {
            const mergedFace = this.mergeTwoFaces(face1, face2);

            // Replace the two faces with the merged one
            mergedFaces = [
              ...mergedFaces.slice(0, i),
              mergedFace,
              ...mergedFaces.slice(i + 1, j),
              ...mergedFaces.slice(j + 1)
            ];

            changesMade = true;
            // console.log(`     Iteration ${iterationCount}: Merged 2 ${face1.type}s into ${mergedFace.type} (${mergedFace.originalVertices.length} vertices)`);
            break;
          }
        }

        if (changesMade) break;
      }
    }

    // console.log(`   Iterative merging completed in ${iterationCount} iterations`);
    return mergedFaces;
  }

  /**
   * Check if two faces can be merged (coplanar and adjacent)
   */
  private static canMergeFaces(face1: PolygonFace, face2: PolygonFace): boolean {
    // Ensure normals are Vector3 objects
    const normal1 = this.ensureVector3(face1.normal);
    const normal2 = this.ensureVector3(face2.normal);

    // Step 1: Check normal similarity
    const normalDot = Math.abs(normal1.dot(normal2));
    if (normalDot < this.NORMAL_TOLERANCE) return false;

    // Step 2: Check if faces are on the same plane
    const face1Center = this.getFaceCenter(face1.originalVertices);
    const face2Center = this.getFaceCenter(face2.originalVertices);
    const planeDistance = this.distanceToPlane(face1Center, face2Center, normal2);
    if (Math.abs(planeDistance) > this.DISTANCE_TOLERANCE) return false;

    // Step 3: Check if faces share vertices (are adjacent)
    if (!this.facesShareVertices(face1, face2)) return false;

    // Step 4: Ensure resulting polygon would be valid
    const combinedVertices = this.getCombinedUniqueVertices(face1, face2);
    return this.wouldResultInValidPolygon(combinedVertices, face1.normal);
  }

  /**
   * Merge two coplanar faces into one optimized polygon
   */
  private static mergeTwoFaces(face1: PolygonFace, face2: PolygonFace): PolygonFace {
    // Combine and deduplicate vertices
    const uniqueVertices = this.getCombinedUniqueVertices(face1, face2);

    // Ensure normal is Vector3
    const normal = this.ensureVector3(face1.normal);

    // Order vertices properly around the perimeter
    const orderedVertices = this.orderPolygonVertices(uniqueVertices, normal);

    // Determine face type
    const faceType = orderedVertices.length === 3 ? 'triangle' :
                     orderedVertices.length === 4 ? 'quad' : 'polygon';

    return {
      type: faceType,
      originalVertices: orderedVertices,
      normal: normal.clone().normalize(),
      triangleIndices: [...(face1.triangleIndices || []), ...(face2.triangleIndices || [])]
    };
  }

  /**
   * Ensure a value is a THREE.Vector3 object
   */
  private static ensureVector3(vector: any): THREE.Vector3 {
    if (vector instanceof THREE.Vector3) {
      return vector;
    }
    if (vector && typeof vector.x === 'number' && typeof vector.y === 'number' && typeof vector.z === 'number') {
      return new THREE.Vector3(vector.x, vector.y, vector.z);
    }
    console.warn('Invalid vector data, using default normal');
    return new THREE.Vector3(0, 0, 1);
  }

  /**
   * Get combined unique vertices from two faces
   */
  private static getCombinedUniqueVertices(face1: PolygonFace, face2: PolygonFace): THREE.Vector3[] {
    const allVertices = [...face1.originalVertices, ...face2.originalVertices];
    return this.removeDuplicateVertices(allVertices);
  }

  /**
   * Check if two faces share vertices
   */
  private static facesShareVertices(face1: PolygonFace, face2: PolygonFace): boolean {
    for (const v1 of face1.originalVertices) {
      for (const v2 of face2.originalVertices) {
        if (v1.distanceTo(v2) < this.DISTANCE_TOLERANCE) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if combined vertices would result in a valid polygon
   */
  private static wouldResultInValidPolygon(vertices: THREE.Vector3[], normal: THREE.Vector3): boolean {
    if (vertices.length < 3 || vertices.length > 20) return false; // Reasonable limits
    
    // Check for minimum area
    const area = this.calculatePolygonArea(vertices);
    if (area < this.DISTANCE_TOLERANCE * this.DISTANCE_TOLERANCE * 100) return false;
    
    // Check for reasonable edge lengths
    for (let i = 0; i < vertices.length; i++) {
      const nextI = (i + 1) % vertices.length;
      const edgeLength = vertices[i].distanceTo(vertices[nextI]);
      if (edgeLength < this.DISTANCE_TOLERANCE * 10) return false;
    }
    
    return true;
  }

  /**
   * Strict coplanarity validation with automatic repair
   */
  private static validateCoplanarity(faces: PolygonFace[]): PolygonFace[] {
    const validatedFaces: PolygonFace[] = [];

    for (const face of faces) {
      if (this.isStrictlyCoplanar(face.originalVertices)) {
        validatedFaces.push(face);
      } else {
        console.warn(`   Repairing non-coplanar ${face.type} face`);
        
        // Repair by splitting into triangles
        const repairedTriangles = this.repairNonCoplanarFace(face);
        repairedTriangles.forEach(triangle => {
          if (this.isStrictlyCoplanar(triangle.originalVertices)) {
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
  private static isStrictlyCoplanar(vertices: THREE.Vector3[]): boolean {
    if (vertices.length < 4) return true; // Triangles are always coplanar

    // Calculate plane from first 3 vertices
    const v1 = vertices[0];
    const v2 = vertices[1];
    const v3 = vertices[2];

    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2);

    // Check if normal is valid
    if (normal.length() < this.DISTANCE_TOLERANCE) return false;
    
    normal.normalize();

    // Check all remaining vertices against this plane
    for (let i = 3; i < vertices.length; i++) {
      const distance = this.distanceToPlane(vertices[i], v1, normal);
      if (Math.abs(distance) > this.DISTANCE_TOLERANCE) {
        return false;
      }
    }

    return true;
  }

  /**
   * Repair non-coplanar face by splitting into triangles
   */
  private static repairNonCoplanarFace(face: PolygonFace): PolygonFace[] {
    const triangles: PolygonFace[] = [];
    const vertices = face.originalVertices;

    if (vertices.length < 3) return triangles;

    // Fan triangulation from first vertex
    for (let i = 1; i < vertices.length - 1; i++) {
      const triangleVertices = [vertices[0], vertices[i], vertices[i + 1]];
      
      // Calculate triangle normal
      const edge1 = new THREE.Vector3().subVectors(triangleVertices[1], triangleVertices[0]);
      const edge2 = new THREE.Vector3().subVectors(triangleVertices[2], triangleVertices[0]);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      triangles.push({
        type: 'triangle',
        originalVertices: triangleVertices,
        normal: normal,
        triangleIndices: face.triangleIndices || []
      });
    }

    return triangles;
  }



  /**
   * Order polygon vertices around the perimeter
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
   * Remove duplicate vertices with tolerance
   */
  private static removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    
    for (const vertex of vertices) {
      let isDuplicate = false;
      for (const existing of unique) {
        if (vertex.distanceTo(existing) < this.DISTANCE_TOLERANCE) {
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
   * Calculate the center point of face vertices
   */
  private static getFaceCenter(vertices: THREE.Vector3[]): THREE.Vector3 {
    const center = new THREE.Vector3();
    vertices.forEach(v => center.add(v));
    center.divideScalar(vertices.length);
    return center;
  }

  /**
   * Calculate distance from point to plane
   */
  private static distanceToPlane(point: THREE.Vector3, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): number {
    const diff = new THREE.Vector3().subVectors(point, planePoint);
    return diff.dot(planeNormal);
  }

  /**
   * Calculate polygon area using shoelace formula (projected to best plane)
   */
  private static calculatePolygonArea(vertices: THREE.Vector3[]): number {
    if (vertices.length < 3) return 0;

    // Calculate polygon normal to determine best projection plane
    let normal = new THREE.Vector3();
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      normal.x += (curr.y - next.y) * (curr.z + next.z);
      normal.y += (curr.z - next.z) * (curr.x + next.x);
      normal.z += (curr.x - next.x) * (curr.y + next.y);
    }

    // Project to the plane with largest normal component
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    let area = 0;
    if (absZ >= absX && absZ >= absY) {
      // Project to XY plane
      for (let i = 0; i < vertices.length; i++) {
        const curr = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        area += (curr.x * next.y - next.x * curr.y);
      }
    } else if (absY >= absX) {
      // Project to XZ plane
      for (let i = 0; i < vertices.length; i++) {
        const curr = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        area += (curr.x * next.z - next.x * curr.z);
      }
    } else {
      // Project to YZ plane
      for (let i = 0; i < vertices.length; i++) {
        const curr = vertices[i];
        const next = vertices[(i + 1) % vertices.length];
        area += (curr.y * next.z - next.y * curr.z);
      }
    }

    return Math.abs(area) * 0.5;
  }

  /**
   * Analyze symmetry structure of faces for debugging
   */
  private static analyzeSymmetryStructure(faces: PolygonFace[]): void {
    // console.log('🔍 SYMMETRY ANALYSIS');

    const facesByVertexCount = new Map<number, PolygonFace[]>();
    const facesByNormal = new Map<string, PolygonFace[]>();

    faces.forEach(face => {
      // Group by vertex count
      const vertexCount = face.originalVertices.length;
      if (!facesByVertexCount.has(vertexCount)) {
        facesByVertexCount.set(vertexCount, []);
      }
      facesByVertexCount.get(vertexCount)!.push(face);

      // Group by normal direction (rounded for comparison)
      const normal = this.ensureVector3(face.normal);
      const normalKey = `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)}`;
      if (!facesByNormal.has(normalKey)) {
        facesByNormal.set(normalKey, []);
      }
      facesByNormal.get(normalKey)!.push(face);
    });

    // console.log('   Face distribution by vertex count:');
    // facesByVertexCount.forEach((faces, count) => {
    //   console.log(`     ${count}-vertex faces: ${faces.length}`);
    // });

    // console.log('   Face distribution by normal direction:');
    // facesByNormal.forEach((faces, normalKey) => {
    //   if (faces.length > 1) {
    //     console.log(`     Normal ${normalKey}: ${faces.length} faces`);
    //     faces.forEach((face, idx) => {
    //       console.log(`       Face ${idx}: ${face.type} with ${face.originalVertices.length} vertices`);
    //     });
    //   }
    // });

    // Check for potential symmetry pairs
    this.detectSymmetryPairs(faces);
  }

  /**
   * Detect potential symmetry pairs in faces
   */
  private static detectSymmetryPairs(faces: PolygonFace[]): void {
    // console.log('🔍 SYMMETRY PAIR DETECTION');

    const symmetryPairs: Array<{face1: PolygonFace, face2: PolygonFace, similarity: number}> = [];

    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const face1 = faces[i];
        const face2 = faces[j];

        // Check if faces might be symmetric
        const similarity = this.calculateFaceSimilarity(face1, face2);
        if (similarity > 0.8) { // High similarity threshold
          symmetryPairs.push({ face1, face2, similarity });
        }
      }
    }

    console.log(`   Found ${symmetryPairs.length} potential symmetry pairs:`);
    // Removed verbose pair logging for cleaner console output
  }

  /**
   * Calculate similarity between two faces for symmetry detection
   */
  private static calculateFaceSimilarity(face1: PolygonFace, face2: PolygonFace): number {
    // Must have same vertex count
    if (face1.originalVertices.length !== face2.originalVertices.length) return 0;

    // Must have similar normal directions (parallel or opposite)
    const normal1 = this.ensureVector3(face1.normal);
    const normal2 = this.ensureVector3(face2.normal);
    const normalSimilarity = Math.abs(normal1.dot(normal2));

    // Must have similar face areas
    const area1 = this.calculatePolygonArea(face1.originalVertices);
    const area2 = this.calculatePolygonArea(face2.originalVertices);
    const areaSimilarity = area1 > 0 && area2 > 0 ?
      Math.min(area1, area2) / Math.max(area1, area2) : 0;

    // Combined similarity score
    return (normalSimilarity * 0.6) + (areaSimilarity * 0.4);
  }

  /**
   * Enhanced face optimization with symmetry preservation
   */
  private static optimizeFacesWithSymmetry(faces: PolygonFace[]): PolygonFace[] {
    console.log('⚡ SYMMETRY-AWARE OPTIMIZATION');

    // First detect symmetry groups
    const symmetryGroups = this.groupSymmetricFaces(faces);

    return faces.map(face => {
      // Ensure normal is Vector3
      const normal = this.ensureVector3(face.normal);

      // Ensure proper vertex ordering
      const optimizedVertices = this.orderPolygonVertices(face.originalVertices, normal);

      // Recalculate type based on vertex count
      const faceType = optimizedVertices.length === 3 ? 'triangle' :
                       optimizedVertices.length === 4 ? 'quad' : 'polygon';

      return {
        ...face,
        type: faceType,
        originalVertices: optimizedVertices,
        normal: normal
      };
    });
  }

  /**
   * Group faces that should be symmetric
   */
  private static groupSymmetricFaces(faces: PolygonFace[]): PolygonFace[][] {
    const groups: PolygonFace[][] = [];
    const processed = new Set<number>();

    faces.forEach((face1, i) => {
      if (processed.has(i)) return;

      const group = [face1];
      processed.add(i);

      faces.forEach((face2, j) => {
        if (i !== j && !processed.has(j)) {
          const similarity = this.calculateFaceSimilarity(face1, face2);
          if (similarity > 0.9) { // Very high threshold for symmetry grouping
            group.push(face2);
            processed.add(j);
          }
        }
      });

      if (group.length > 1) {
        console.log(`   Symmetry group: ${group.length} faces with ${group[0].originalVertices.length} vertices each`);
      }

      groups.push(group);
    });

    return groups;
  }

  /**
   * Convenience method: Merge coplanar triangles from Three.js geometry
   */
  static mergeGeometryTriangles(geometry: THREE.BufferGeometry): PolygonFace[] {
    const triangles = this.extractTrianglesFromGeometry(geometry);
    const faces = this.groupTrianglesIntoFaces(triangles);
    return this.mergeCoplanarFaces(faces);
  }

  /**
   * Extract triangles from Three.js geometry
   */
  private static extractTrianglesFromGeometry(geometry: THREE.BufferGeometry): Triangle[] {
    const positions = geometry.attributes.position;
    const triangles: Triangle[] = [];
    
    for (let i = 0; i < positions.count; i += 3) {
      const v1 = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
      const v2 = new THREE.Vector3(positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1));
      const v3 = new THREE.Vector3(positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2));

      const edge1 = new THREE.Vector3().subVectors(v2, v1);
      const edge2 = new THREE.Vector3().subVectors(v3, v1);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      const centroid = new THREE.Vector3().addVectors(v1, v2).add(v3).divideScalar(3);

      triangles.push({
        vertices: [v1, v2, v3],
        normal,
        centroid,
        index: Math.floor(i / 3)
      });
    }
    
    return triangles;
  }

  /**
   * Group triangles into initial faces before merging
   */
  private static groupTrianglesIntoFaces(triangles: Triangle[]): PolygonFace[] {
    return triangles.map(triangle => ({
      type: 'triangle',
      originalVertices: triangle.vertices,
      normal: triangle.normal,
      triangleIndices: [triangle.index]
    }));
  }
}

// Type definitions
export interface PolygonFace {
  type: 'triangle' | 'quad' | 'polygon';
  originalVertices: THREE.Vector3[];
  normal: THREE.Vector3;
  triangleIndices?: number[];
}

export interface Triangle {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  index: number;
}
