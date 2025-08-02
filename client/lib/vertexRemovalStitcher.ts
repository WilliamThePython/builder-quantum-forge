import * as THREE from 'three';
import { MeshStats } from './meshSimplifier';

/**
 * Vertex removal with proper geometry stitching
 * Implements two methods: random removal and Python-style removal
 */
export class VertexRemovalStitcher {

  /**
   * Main vertex removal function
   */
  static async removeVertices(
    geometry: THREE.BufferGeometry,
    targetReduction: number,
    method: 'random_vertex' | 'python_vertex'
  ): Promise<{
    simplifiedGeometry: THREE.BufferGeometry;
    originalStats: MeshStats;
    newStats: MeshStats;
    reductionAchieved: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log(`🔧 Starting vertex removal: ${method}, ${(targetReduction * 100).toFixed(1)}% reduction`);

    // Get original stats
    const originalStats = this.getMeshStats(geometry);
    
    // Clone geometry for processing
    const workingGeometry = geometry.clone();
    
    // Calculate target vertex count
    const currentVertices = originalStats.vertices;
    const targetVertices = Math.max(4, Math.floor(currentVertices * (1 - targetReduction))); // Minimum 4 vertices (tetrahedron)
    const verticesToRemove = Math.max(0, currentVertices - targetVertices);
    
    console.log(`📊 Plan: Remove ${verticesToRemove} vertices (${currentVertices} → ${targetVertices})`);
    
    let resultGeometry: THREE.BufferGeometry;
    
    if (method === 'random_vertex') {
      resultGeometry = await this.randomVertexRemoval(workingGeometry, verticesToRemove);
    } else {
      resultGeometry = await this.pythonStyleRemoval(workingGeometry, verticesToRemove);
    }
    
    // Get final stats
    const newStats = this.getMeshStats(resultGeometry);
    const reductionAchieved = Math.max(0, 1 - (newStats.vertices / originalStats.vertices));
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Vertex removal completed: ${originalStats.vertices} → ${newStats.vertices} vertices (${(reductionAchieved * 100).toFixed(1)}% reduction)`);
    
    return {
      simplifiedGeometry: resultGeometry,
      originalStats,
      newStats,
      reductionAchieved,
      processingTime
    };
  }

  /**
   * Random vertex removal with proper stitching
   */
  private static async randomVertexRemoval(
    geometry: THREE.BufferGeometry,
    verticesToRemove: number
  ): Promise<THREE.BufferGeometry> {
    console.log('🎲 Applying proper vertex removal with stitching...');

    // Convert to indexed geometry if not already
    const indexedGeometry = this.ensureIndexedGeometry(geometry);

    // Get unique vertices and build adjacency information
    const { vertices, faces, vertexToFaces } = this.analyzeGeometry(indexedGeometry);

    console.log(`📊 Geometry analysis: ${vertices.length} unique vertices, ${faces.length} faces`);

    // Select vertices to remove randomly
    const verticesToRemoveSet = this.selectRandomVerticesForRemoval(vertices.length, verticesToRemove);
    console.log(`🎲 Selected ${verticesToRemoveSet.size} vertices for removal: [${Array.from(verticesToRemoveSet).slice(0, 5).join(', ')}...]`);

    // Remove vertices and stitch holes
    const newFaces = this.removeVerticesAndStitch(faces, verticesToRemoveSet, vertexToFaces, vertices);

    // Rebuild geometry
    return this.rebuildGeometry(vertices, newFaces, verticesToRemoveSet);
  }

  /**
   * Python-style vertex removal (quadric decimation approach)
   */
  private static async pythonStyleRemoval(
    geometry: THREE.BufferGeometry,
    verticesToRemove: number
  ): Promise<THREE.BufferGeometry> {
    console.log('��� Applying Python-style vertex removal...');
    
    // Convert to indexed geometry if not already
    const indexedGeometry = this.ensureIndexedGeometry(geometry);

    // Get unique vertices and build adjacency information
    const { vertices, faces, vertexToFaces } = this.analyzeGeometry(indexedGeometry);

    console.log(`📊 Geometry analysis: ${vertices.length} unique vertices, ${faces.length} faces`);

    // Calculate vertex importance scores (similar to quadric error)
    const vertexScores = this.calculateVertexImportance(vertices, faces, vertexToFaces);

    // Select vertices with lowest importance scores
    const verticesToRemoveSet = this.selectLeastImportantVertices(vertexScores, verticesToRemove);
    console.log(`🐍 Selected ${verticesToRemoveSet.size} least important vertices for removal`);

    // Remove vertices and stitch holes
    const newFaces = this.removeVerticesAndStitch(faces, verticesToRemoveSet, vertexToFaces, vertices);

    // Rebuild geometry
    return this.rebuildGeometry(vertices, newFaces, verticesToRemoveSet);
  }

  /**
   * Analyze geometry to extract unique vertices and face relationships
   */
  private static analyzeGeometry(geometry: THREE.BufferGeometry): {
    vertices: THREE.Vector3[];
    faces: number[][];
    vertexToFaces: Map<number, number[]>;
  } {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index!.array;

    // Extract unique vertices
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    }

    // Extract faces as arrays of vertex indices
    const faces: number[][] = [];
    for (let i = 0; i < indices.length; i += 3) {
      faces.push([indices[i], indices[i + 1], indices[i + 2]]);
    }

    // Build vertex-to-faces mapping
    const vertexToFaces = new Map<number, number[]>();
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      for (const vertexIndex of faces[faceIndex]) {
        if (!vertexToFaces.has(vertexIndex)) {
          vertexToFaces.set(vertexIndex, []);
        }
        vertexToFaces.get(vertexIndex)!.push(faceIndex);
      }
    }

    return { vertices, faces, vertexToFaces };
  }

  /**
   * Select random vertices for removal
   */
  private static selectRandomVerticesForRemoval(totalVertices: number, targetCount: number): Set<number> {
    const verticesToRemove = new Set<number>();
    const maxToRemove = Math.min(targetCount, Math.floor(totalVertices * 0.8)); // Don't remove more than 80%

    while (verticesToRemove.size < maxToRemove) {
      const randomVertex = Math.floor(Math.random() * totalVertices);
      verticesToRemove.add(randomVertex);
    }

    return verticesToRemove;
  }

  /**
   * Calculate vertex importance scores
   */
  private static calculateVertexImportance(
    vertices: THREE.Vector3[],
    faces: number[][],
    vertexToFaces: Map<number, number[]>
  ): Map<number, number> {
    const scores = new Map<number, number>();

    for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex++) {
      const adjacentFaces = vertexToFaces.get(vertexIndex) || [];

      // Score based on:
      // 1. Number of adjacent faces (more faces = more important)
      // 2. Total area of adjacent faces
      let totalArea = 0;
      for (const faceIndex of adjacentFaces) {
        const face = faces[faceIndex];
        const v1 = vertices[face[0]];
        const v2 = vertices[face[1]];
        const v3 = vertices[face[2]];

        // Calculate triangle area
        const edge1 = new THREE.Vector3().subVectors(v2, v1);
        const edge2 = new THREE.Vector3().subVectors(v3, v1);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        totalArea += cross.length() * 0.5;
      }

      // Higher score = more important (harder to remove)
      const importance = adjacentFaces.length * totalArea;
      scores.set(vertexIndex, importance);
    }

    return scores;
  }

  /**
   * Select least important vertices for removal
   */
  private static selectLeastImportantVertices(
    vertexScores: Map<number, number>,
    targetCount: number
  ): Set<number> {
    // Sort vertices by importance (lowest first)
    const sortedVertices = Array.from(vertexScores.entries())
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);

    const maxToRemove = Math.min(targetCount, Math.floor(sortedVertices.length * 0.8));
    return new Set(sortedVertices.slice(0, maxToRemove));
  }

  /**
   * Remove vertices and stitch the resulting holes
   */
  private static removeVerticesAndStitch(
    faces: number[][],
    verticesToRemove: Set<number>,
    vertexToFaces: Map<number, number[]>,
    vertices: THREE.Vector3[]
  ): number[][] {
    console.log(`🧵 Stitching holes from ${verticesToRemove.size} removed vertices...`);

    const newFaces: number[][] = [];
    const processedFaces = new Set<number>();

    // Process each face
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      if (processedFaces.has(faceIndex)) continue;

      const face = faces[faceIndex];
      const removedVerticesInFace = face.filter(v => verticesToRemove.has(v));

      if (removedVerticesInFace.length === 0) {
        // Face has no removed vertices, keep as-is
        newFaces.push([...face]);
      } else if (removedVerticesInFace.length < face.length) {
        // Face has some removed vertices, need to stitch
        const stitchedFaces = this.stitchFaceWithRemovedVertices(
          face,
          verticesToRemove,
          vertices,
          vertexToFaces
        );
        newFaces.push(...stitchedFaces);
      }
      // If all vertices in face are removed, skip the face entirely

      processedFaces.add(faceIndex);
    }

    console.log(`✅ Stitching complete: ${faces.length} → ${newFaces.length} faces`);
    return newFaces;
  }

  /**
   * Stitch a face that has some removed vertices
   */
  private static stitchFaceWithRemovedVertices(
    face: number[],
    verticesToRemove: Set<number>,
    vertices: THREE.Vector3[],
    vertexToFaces: Map<number, number[]>
  ): number[][] {
    const keptVertices = face.filter(v => !verticesToRemove.has(v));

    if (keptVertices.length >= 3) {
      // Enough vertices to form a face, triangulate if needed
      const triangulatedFaces: number[][] = [];
      for (let i = 1; i < keptVertices.length - 1; i++) {
        triangulatedFaces.push([keptVertices[0], keptVertices[i], keptVertices[i + 1]]);
      }
      return triangulatedFaces;
    } else if (keptVertices.length === 2) {
      // Only 2 vertices left, connect to a nearby vertex
      const nearbyVertex = this.findNearbyVertex(keptVertices, vertices, verticesToRemove);
      if (nearbyVertex !== -1) {
        return [[keptVertices[0], keptVertices[1], nearbyVertex]];
      }
    } else if (keptVertices.length === 1) {
      // Only 1 vertex left, connect to two nearby vertices
      const nearbyVertices = this.findTwoNearbyVertices(keptVertices[0], vertices, verticesToRemove);
      if (nearbyVertices.length === 2) {
        return [[keptVertices[0], nearbyVertices[0], nearbyVertices[1]]];
      }
    }

    return []; // Cannot stitch, return empty
  }

  /**
   * Find a nearby vertex to complete a triangle
   */
  private static findNearbyVertex(
    existingVertices: number[],
    vertices: THREE.Vector3[],
    verticesToRemove: Set<number>
  ): number {
    const center = new THREE.Vector3();
    for (const vIndex of existingVertices) {
      center.add(vertices[vIndex]);
    }
    center.divideScalar(existingVertices.length);

    let closestVertex = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < vertices.length; i++) {
      if (existingVertices.includes(i) || verticesToRemove.has(i)) continue;

      const distance = center.distanceTo(vertices[i]);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestVertex = i;
      }
    }

    return closestVertex;
  }

  /**
   * Find two nearby vertices to complete a triangle
   */
  private static findTwoNearbyVertices(
    vertex: number,
    vertices: THREE.Vector3[],
    verticesToRemove: Set<number>
  ): number[] {
    const center = vertices[vertex];
    const distances: { index: number; distance: number }[] = [];

    for (let i = 0; i < vertices.length; i++) {
      if (i === vertex || verticesToRemove.has(i)) continue;

      const distance = center.distanceTo(vertices[i]);
      distances.push({ index: i, distance });
    }

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, 2).map(d => d.index);
  }

  /**
   * Rebuild geometry from vertices and faces
   */
  private static rebuildGeometry(
    originalVertices: THREE.Vector3[],
    newFaces: number[][],
    verticesToRemove: Set<number>
  ): THREE.BufferGeometry {
    // Create mapping from old vertex indices to new ones (excluding removed vertices)
    const vertexMapping = new Map<number, number>();
    const keptVertices: THREE.Vector3[] = [];
    let newVertexIndex = 0;

    for (let i = 0; i < originalVertices.length; i++) {
      if (!verticesToRemove.has(i)) {
        vertexMapping.set(i, newVertexIndex);
        keptVertices.push(originalVertices[i].clone());
        newVertexIndex++;
      }
    }

    // Convert faces to use new vertex indices
    const newIndices: number[] = [];
    for (const face of newFaces) {
      if (face.length === 3) {
        const mappedFace = face.map(v => vertexMapping.get(v)).filter(v => v !== undefined) as number[];
        if (mappedFace.length === 3) {
          newIndices.push(...mappedFace);
        }
      }
    }

    // Build new geometry
    const positions = new Float32Array(keptVertices.length * 3);
    for (let i = 0; i < keptVertices.length; i++) {
      const vertex = keptVertices[i];
      positions[i * 3] = vertex.x;
      positions[i * 3 + 1] = vertex.y;
      positions[i * 3 + 2] = vertex.z;
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

    console.log(`✅ Rebuilt geometry: ${keptVertices.length} vertices, ${newFaces.length} faces`);
    return newGeometry;
  }

  /**
   * Ensure geometry is indexed for easier manipulation
   */
  private static ensureIndexedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    if (geometry.index) {
      return geometry;
    }
    
    // Convert non-indexed to indexed
    const positions = geometry.attributes.position.array as Float32Array;
    const indices: number[] = [];
    
    for (let i = 0; i < positions.length / 3; i++) {
      indices.push(i);
    }
    
    const indexedGeometry = geometry.clone();
    indexedGeometry.setIndex(indices);
    return indexedGeometry;
  }

  /**
   * Build vertex-to-faces adjacency map
   */
  private static buildVertexFaceAdjacency(geometry: THREE.BufferGeometry): Map<number, number[]> {
    const vertexFaceMap = new Map<number, number[]>();
    const indices = geometry.index!.array;
    
    // Initialize map
    const vertexCount = geometry.attributes.position.count;
    for (let i = 0; i < vertexCount; i++) {
      vertexFaceMap.set(i, []);
    }
    
    // Build adjacency
    for (let faceIndex = 0; faceIndex < indices.length; faceIndex += 3) {
      const face = Math.floor(faceIndex / 3);
      const v1 = indices[faceIndex];
      const v2 = indices[faceIndex + 1];
      const v3 = indices[faceIndex + 2];
      
      vertexFaceMap.get(v1)!.push(face);
      vertexFaceMap.get(v2)!.push(face);
      vertexFaceMap.get(v3)!.push(face);
    }
    
    return vertexFaceMap;
  }

  /**
   * Find vertices that can be safely removed without breaking topology
   */
  private static findRemovableVertices(
    geometry: THREE.BufferGeometry,
    vertexFaceMap: Map<number, number[]>
  ): number[] {
    const removable: number[] = [];
    const vertexCount = geometry.attributes.position.count;

    // Much more aggressive - allow removal of most vertices
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      const adjacentFaces = vertexFaceMap.get(vertexIndex) || [];

      // Only exclude vertices with no faces or too many faces
      if (adjacentFaces.length >= 1 && adjacentFaces.length <= 20) {
        removable.push(vertexIndex);
      }
    }

    console.log(`🔍 Vertex analysis: ${removable.length}/${vertexCount} vertices marked as removable`);
    return removable;
  }

  /**
   * Check if removing a vertex can be properly stitched
   */
  private static canStitchVertexRemoval(
    vertexIndex: number,
    adjacentFaces: number[],
    geometry: THREE.BufferGeometry
  ): boolean {
    // For now, simple check: vertex with reasonable number of faces can be removed
    // More sophisticated topology checking could be added here
    return adjacentFaces.length >= 3 && adjacentFaces.length <= 6;
  }

  /**
   * Randomly select vertices to remove
   */
  private static selectRandomVertices(removableVertices: number[], count: number): number[] {
    const shuffled = [...removableVertices].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Calculate quadric error for each vertex (simplified)
   */
  private static calculateVertexErrors(
    geometry: THREE.BufferGeometry,
    vertexFaceMap: Map<number, number[]>
  ): number[] {
    const positions = geometry.attributes.position;
    const indices = geometry.index!.array;
    const vertexCount = positions.count;
    const errors = new Array(vertexCount).fill(0);
    
    // Simple error metric: sum of angles at vertex (flatter = lower error)
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      const adjacentFaces = vertexFaceMap.get(vertexIndex) || [];
      let totalAngle = 0;
      
      for (const faceIndex of adjacentFaces) {
        const face = faceIndex * 3;
        const v1 = indices[face];
        const v2 = indices[face + 1];
        const v3 = indices[face + 2];
        
        if (v1 === vertexIndex || v2 === vertexIndex || v3 === vertexIndex) {
          // Calculate angle at this vertex
          const angle = this.calculateVertexAngleInTriangle(vertexIndex, v1, v2, v3, positions);
          totalAngle += angle;
        }
      }
      
      errors[vertexIndex] = totalAngle;
    }
    
    return errors;
  }

  /**
   * Calculate angle at a vertex in a triangle
   */
  private static calculateVertexAngleInTriangle(
    targetVertex: number,
    v1: number, v2: number, v3: number,
    positions: THREE.BufferAttribute
  ): number {
    let centerVertex = targetVertex;
    let vertex1, vertex2;
    
    if (v1 === targetVertex) {
      centerVertex = v1; vertex1 = v2; vertex2 = v3;
    } else if (v2 === targetVertex) {
      centerVertex = v2; vertex1 = v1; vertex2 = v3;
    } else if (v3 === targetVertex) {
      centerVertex = v3; vertex1 = v1; vertex2 = v2;
    } else {
      return 0; // Vertex not in triangle
    }
    
    const center = new THREE.Vector3().fromBufferAttribute(positions, centerVertex);
    const p1 = new THREE.Vector3().fromBufferAttribute(positions, vertex1);
    const p2 = new THREE.Vector3().fromBufferAttribute(positions, vertex2);
    
    const v1Vec = p1.sub(center).normalize();
    const v2Vec = p2.sub(center).normalize();
    
    return Math.acos(Math.max(-1, Math.min(1, v1Vec.dot(v2Vec))));
  }

  /**
   * Remove vertices and stitch the resulting holes
   */
  private static removeVerticesAndStitch(
    geometry: THREE.BufferGeometry,
    verticesToRemove: number[],
    vertexFaceMap: Map<number, number[]>
  ): THREE.BufferGeometry {
    console.log(`🧵 Removing ${verticesToRemove.length} vertices and stitching...`);
    
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index!.array;
    
    // Create new position array without removed vertices
    const vertexMapping = new Map<number, number>();
    const newPositions: number[] = [];
    let newVertexIndex = 0;
    
    for (let i = 0; i < positions.length / 3; i++) {
      if (!verticesToRemove.includes(i)) {
        // Keep this vertex
        vertexMapping.set(i, newVertexIndex);
        newPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        newVertexIndex++;
      }
    }
    
    // Remove faces that used deleted vertices and stitch holes
    const newFaces: number[] = [];
    const facesToRemove = new Set<number>();
    
    // Mark faces for removal
    for (const vertexIndex of verticesToRemove) {
      const adjacentFaces = vertexFaceMap.get(vertexIndex) || [];
      for (const faceIndex of adjacentFaces) {
        facesToRemove.add(faceIndex);
      }
    }
    
    // Add remaining faces with remapped vertices
    for (let faceIndex = 0; faceIndex < indices.length / 3; faceIndex++) {
      if (!facesToRemove.has(faceIndex)) {
        const face = faceIndex * 3;
        const v1 = indices[face];
        const v2 = indices[face + 1];
        const v3 = indices[face + 2];
        
        const newV1 = vertexMapping.get(v1);
        const newV2 = vertexMapping.get(v2);
        const newV3 = vertexMapping.get(v3);
        
        if (newV1 !== undefined && newV2 !== undefined && newV3 !== undefined) {
          newFaces.push(newV1, newV2, newV3);
        }
      }
    }
    
    // Stitch holes where vertices were removed
    const stitchedFaces = this.stitchHoles(verticesToRemove, vertexFaceMap, vertexMapping, geometry);
    newFaces.push(...stitchedFaces);
    
    // Create new geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setIndex(newFaces);
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    
    console.log(`✅ Stitching complete: ${newFaces.length / 3} faces`);
    return newGeometry;
  }

  /**
   * Stitch holes created by vertex removal
   */
  private static stitchHoles(
    removedVertices: number[],
    vertexFaceMap: Map<number, number[]>,
    vertexMapping: Map<number, number>,
    originalGeometry: THREE.BufferGeometry
  ): number[] {
    const stitchedFaces: number[] = [];
    const indices = originalGeometry.index!.array;
    
    // For each removed vertex, find the boundary vertices and triangulate
    for (const removedVertex of removedVertices) {
      const adjacentFaces = vertexFaceMap.get(removedVertex) || [];
      const boundaryVertices = this.findBoundaryVertices(removedVertex, adjacentFaces, indices);
      
      // Triangulate the boundary to fill the hole
      const triangulation = this.triangulateBoundary(boundaryVertices, vertexMapping);
      stitchedFaces.push(...triangulation);
    }
    
    return stitchedFaces;
  }

  /**
   * Find boundary vertices around a removed vertex
   */
  private static findBoundaryVertices(
    removedVertex: number,
    adjacentFaces: number[],
    indices: Uint32Array | Uint16Array | Array<number>
  ): number[] {
    const boundaryVertices = new Set<number>();
    
    for (const faceIndex of adjacentFaces) {
      const face = faceIndex * 3;
      const v1 = indices[face];
      const v2 = indices[face + 1];
      const v3 = indices[face + 2];
      
      // Add vertices that are not the removed vertex
      if (v1 !== removedVertex) boundaryVertices.add(v1);
      if (v2 !== removedVertex) boundaryVertices.add(v2);
      if (v3 !== removedVertex) boundaryVertices.add(v3);
    }
    
    return Array.from(boundaryVertices);
  }

  /**
   * Triangulate boundary vertices to fill hole
   */
  private static triangulateBoundary(
    boundaryVertices: number[],
    vertexMapping: Map<number, number>
  ): number[] {
    const triangulation: number[] = [];
    
    // Simple fan triangulation for now
    if (boundaryVertices.length >= 3) {
      const mappedVertices = boundaryVertices
        .map(v => vertexMapping.get(v))
        .filter(v => v !== undefined) as number[];
      
      if (mappedVertices.length >= 3) {
        // Fan triangulation from first vertex
        for (let i = 1; i < mappedVertices.length - 1; i++) {
          triangulation.push(
            mappedVertices[0],
            mappedVertices[i],
            mappedVertices[i + 1]
          );
        }
      }
    }
    
    return triangulation;
  }

  /**
   * Build new geometry from selected faces
   */
  private static buildGeometryFromFaces(
    geometry: THREE.BufferGeometry,
    faceIndices: number[]
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index!.array;

    // Collect unique vertices used by selected faces
    const usedVertices = new Set<number>();
    for (const faceIndex of faceIndices) {
      const i = faceIndex * 3;
      usedVertices.add(indices[i]);
      usedVertices.add(indices[i + 1]);
      usedVertices.add(indices[i + 2]);
    }

    // Create vertex mapping from old to new indices
    const vertexMapping = new Map<number, number>();
    const newPositions: number[] = [];
    let newVertexIndex = 0;

    for (const vertexIndex of Array.from(usedVertices).sort((a, b) => a - b)) {
      vertexMapping.set(vertexIndex, newVertexIndex);
      newPositions.push(
        positions[vertexIndex * 3],
        positions[vertexIndex * 3 + 1],
        positions[vertexIndex * 3 + 2]
      );
      newVertexIndex++;
    }

    // Build new index array
    const newIndices: number[] = [];
    for (const faceIndex of faceIndices) {
      const i = faceIndex * 3;
      newIndices.push(
        vertexMapping.get(indices[i])!,
        vertexMapping.get(indices[i + 1])!,
        vertexMapping.get(indices[i + 2])!
      );
    }

    // Create new geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

    console.log(`✅ Built new geometry: ${newVertexIndex} vertices, ${faceIndices.length} faces`);
    return newGeometry;
  }

  /**
   * Get mesh statistics
   */
  private static getMeshStats(geometry: THREE.BufferGeometry): MeshStats {
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
}
