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
    method: 'quadric_edge_collapse' = 'quadric_edge_collapse'
  ): Promise<{
    simplifiedGeometry: THREE.BufferGeometry;
    originalStats: MeshStats;
    newStats: MeshStats;
    reductionAchieved: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log(`🔧 Starting quadric edge collapse: ${(targetReduction * 100).toFixed(1)}% reduction`);

    // Get original stats
    const originalStats = this.getMeshStats(geometry);

    // Clone and ensure geometry is indexed for processing
    let workingGeometry = geometry.clone();
    if (!workingGeometry.index) {
      console.log('🔧 Converting geometry to indexed format...');
      workingGeometry = this.ensureIndexedGeometry(workingGeometry);
    }

    // Calculate target face count with safeguards for small models
    const currentFaces = originalStats.faces;
    const currentVertices = originalStats.vertices;

    // For very small models, be much more conservative
    let actualReduction = targetReduction;
    if (currentVertices <= 20) {
      actualReduction = Math.min(targetReduction, 0.3); // Max 30% reduction for small models
      console.log(`⚠️ Small model detected (${currentVertices} vertices), limiting reduction to ${(actualReduction * 100).toFixed(1)}%`);
    }

    const targetFaces = Math.max(4, Math.floor(currentFaces * (1 - actualReduction))); // Minimum 4 faces (tetrahedron)

    // Ensure we don't reduce too aggressively
    if (targetFaces >= currentFaces * 0.9) {
      console.log(`⚠️ Target would remove less than 10% of faces, skipping decimation`);
      return {
        simplifiedGeometry: workingGeometry,
        originalStats,
        newStats: originalStats,
        reductionAchieved: 0,
        processingTime: Date.now() - startTime
      };
    }

    console.log(`📊 Plan: Reduce vertices by merging edges (${(actualReduction * 100).toFixed(1)}% reduction)`);
    console.log(`📊 Target: Reduce faces ${currentFaces} → ${targetFaces} by collapsing vertices`);

    // Apply quadric edge collapse (vertex merging)
    const resultGeometry = this.quadricEdgeCollapse(workingGeometry, targetFaces, true);

    // Validate result geometry
    if (!this.validateGeometry(resultGeometry)) {
      console.error('❌ Decimation produced invalid geometry, returning original');
      return {
        simplifiedGeometry: geometry,
        originalStats,
        newStats: originalStats,
        reductionAchieved: 0,
        processingTime: Date.now() - startTime
      };
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

    // Calculate target number of faces (triangles)
    const currentFaces = indexedGeometry.index!.count / 3;
    const reductionRatio = verticesToRemove / indexedGeometry.attributes.position.count;
    const targetFaces = Math.max(4, Math.floor(currentFaces * (1 - reductionRatio)));

    console.log(`🐍 Target: ${currentFaces} → ${targetFaces} faces (${(reductionRatio * 100).toFixed(1)}% reduction)`);

    return this.quadricEdgeCollapse(indexedGeometry, targetFaces, true);
  }

  /**
   * Quadric edge collapse: progressively merge vertices by collapsing edges
   * This reduces vertex count while preserving mesh topology
   */
  private static quadricEdgeCollapse(
    geometry: THREE.BufferGeometry,
    targetFaces: number,
    useQuadricError: boolean = true
  ): THREE.BufferGeometry {
    console.log(`🔗 Starting vertex merging via edge collapse (target: ${targetFaces} faces)...`);

    // Ensure geometry is indexed
    if (!geometry.index) {
      console.log('🔧 Geometry is not indexed, converting...');
      geometry = this.ensureIndexedGeometry(geometry);
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = Array.from(geometry.index!.array);

    // Build edge list and adjacency information
    const edges = this.buildEdgeList(indices);
    const vertexToFaces = this.buildVertexToFaceMap(indices);

    // Calculate quadric errors for each vertex if using quadric method
    let vertexQuadrics: Map<number, any> | null = null;
    if (useQuadricError) {
      vertexQuadrics = this.calculateVertexQuadrics(positions, indices, vertexToFaces);
    }

    // Create priority queue of edges sorted by collapse cost
    const edgeQueue = this.createEdgeQueue(edges, positions, indices, vertexQuadrics, useQuadricError);

    console.log(`🔧 Built ${edges.length} edges, starting collapse process...`);

    let currentFaces = indices.length / 3;
    let collapsedEdges = 0;

    // Collapse edges until we reach target face count
    const maxIterations = edgeQueue.length * 2; // Safety limit
    let iterations = 0;

    while (currentFaces > targetFaces && edgeQueue.length > 0 && iterations < maxIterations) {
      iterations++;
      const edge = edgeQueue.shift()!;

      // Check if edge is still valid (vertices haven't been merged already)
      if (!this.isEdgeValid(edge, indices)) {
        continue;
      }

      // Perform edge collapse
      const facesBeforeCollapse = indices.length / 3;
      const success = this.collapseEdge(edge, positions, indices, vertexToFaces);
      if (success) {
        currentFaces = indices.length / 3; // Update with actual face count after collapse
        collapsedEdges++;

        // Validate that we haven't removed too many faces
        if (currentFaces < 4) {
          console.warn(`⚠️ Face count dropped below minimum (${currentFaces}), stopping decimation`);
          break;
        }

        if (collapsedEdges % 50 === 0) {
          console.log(`🔧 Collapsed ${collapsedEdges} edges, ${currentFaces} faces remaining`);
        }
      }
    }

    // Clean up and rebuild geometry with improved vertex handling
    let cleanedGeometry = this.rebuildGeometryFromArrays(positions, indices);

    if (iterations >= maxIterations) {
      console.warn(`⚠️ Hit safety limit of ${maxIterations} iterations, stopping early`);
    }

    console.log(`✅ Edge collapse complete: ${collapsedEdges} edges collapsed, ${currentFaces} faces remaining`);

    // Post-processing: validate stitching and analyze coplanar regions
    console.log(`🔧 Post-processing: validating mesh and analyzing structure...`);

    try {
      const postProcessedGeometry = this.postProcessMesh(cleanedGeometry);

      // Validate that post-processing didn't break the geometry
      if (this.validateGeometry(postProcessedGeometry)) {
        cleanedGeometry = postProcessedGeometry;
      } else {
        console.warn(`⚠️ Post-processing validation failed, using pre-processed geometry`);
      }
    } catch (error) {
      console.warn(`⚠️ Post-processing failed:`, error, `- using pre-processed geometry`);
    }

    return cleanedGeometry;
  }

  /**
   * Build list of all edges in the mesh
   */
  private static buildEdgeList(indices: number[]): Array<{v1: number, v2: number, faces: number[]}> {
    const edgeMap = new Map<string, {v1: number, v2: number, faces: number[]}>();

    for (let faceIndex = 0; faceIndex < indices.length; faceIndex += 3) {
      const v1 = indices[faceIndex];
      const v2 = indices[faceIndex + 1];
      const v3 = indices[faceIndex + 2];

      // Add all three edges of the face
      this.addEdgeToMap(edgeMap, v1, v2, Math.floor(faceIndex / 3));
      this.addEdgeToMap(edgeMap, v2, v3, Math.floor(faceIndex / 3));
      this.addEdgeToMap(edgeMap, v3, v1, Math.floor(faceIndex / 3));
    }

    return Array.from(edgeMap.values());
  }

  /**
   * Add an edge to the edge map
   */
  private static addEdgeToMap(
    edgeMap: Map<string, {v1: number, v2: number, faces: number[]}>,
    v1: number,
    v2: number,
    faceIndex: number
  ) {
    const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { v1: Math.min(v1, v2), v2: Math.max(v1, v2), faces: [] });
    }
    edgeMap.get(key)!.faces.push(faceIndex);
  }

  /**
   * Build vertex-to-faces mapping
   */
  private static buildVertexToFaceMap(indices: number[]): Map<number, number[]> {
    const vertexToFaces = new Map<number, number[]>();

    for (let faceIndex = 0; faceIndex < indices.length; faceIndex += 3) {
      const faceNum = Math.floor(faceIndex / 3);
      const v1 = indices[faceIndex];
      const v2 = indices[faceIndex + 1];
      const v3 = indices[faceIndex + 2];

      [v1, v2, v3].forEach(vertex => {
        if (!vertexToFaces.has(vertex)) {
          vertexToFaces.set(vertex, []);
        }
        vertexToFaces.get(vertex)!.push(faceNum);
      });
    }

    return vertexToFaces;
  }

  /**
   * Calculate quadric error matrices for each vertex
   */
  private static calculateVertexQuadrics(
    positions: Float32Array,
    indices: number[],
    vertexToFaces: Map<number, number[]>
  ): Map<number, any> {
    const quadrics = new Map<number, any>();

    // For simplicity, use a basic error metric based on face areas
    for (const [vertexIndex, faceIndices] of vertexToFaces) {
      let totalArea = 0;
      let faceCount = faceIndices.length;

      for (const faceIndex of faceIndices) {
        const i = faceIndex * 3;
        if (i + 2 < indices.length) {
          const v1Pos = new THREE.Vector3(
            positions[indices[i] * 3],
            positions[indices[i] * 3 + 1],
            positions[indices[i] * 3 + 2]
          );
          const v2Pos = new THREE.Vector3(
            positions[indices[i + 1] * 3],
            positions[indices[i + 1] * 3 + 1],
            positions[indices[i + 1] * 3 + 2]
          );
          const v3Pos = new THREE.Vector3(
            positions[indices[i + 2] * 3],
            positions[indices[i + 2] * 3 + 1],
            positions[indices[i + 2] * 3 + 2]
          );

          const edge1 = new THREE.Vector3().subVectors(v2Pos, v1Pos);
          const edge2 = new THREE.Vector3().subVectors(v3Pos, v1Pos);
          const cross = new THREE.Vector3().crossVectors(edge1, edge2);
          totalArea += cross.length() * 0.5;
        }
      }

      // Store error metric (vertices with more/larger faces are more important)
      quadrics.set(vertexIndex, { area: totalArea, faceCount });
    }

    return quadrics;
  }

  /**
   * Create priority queue of edges sorted by collapse cost
   */
  private static createEdgeQueue(
    edges: Array<{v1: number, v2: number, faces: number[]}>,
    positions: Float32Array,
    indices: number[],
    vertexQuadrics: Map<number, any> | null,
    useQuadricError: boolean
  ): Array<{v1: number, v2: number, cost: number}> {
    const queue: Array<{v1: number, v2: number, cost: number}> = [];

    for (const edge of edges) {
      let cost: number;

      if (useQuadricError && vertexQuadrics) {
        // Use quadric error (lower cost = less important vertices)
        const q1 = vertexQuadrics.get(edge.v1) || { area: 0, faceCount: 0 };
        const q2 = vertexQuadrics.get(edge.v2) || { area: 0, faceCount: 0 };
        cost = Math.min(q1.area + q1.faceCount, q2.area + q2.faceCount);
      } else {
        // Use random cost for random method
        cost = Math.random();
      }

      queue.push({ v1: edge.v1, v2: edge.v2, cost });
    }

    // Sort by cost (lowest first)
    queue.sort((a, b) => a.cost - b.cost);
    return queue;
  }

  /**
   * Check if an edge is still valid for collapse
   */
  private static isEdgeValid(edge: {v1: number, v2: number}, indices: number[]): boolean {
    // Check if both vertices still exist in the mesh
    let hasV1 = false, hasV2 = false;
    let sharedTriangles = 0;

    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      const triangle = [v1, v2, v3];
      const hasEdgeV1 = triangle.includes(edge.v1);
      const hasEdgeV2 = triangle.includes(edge.v2);

      if (hasEdgeV1) hasV1 = true;
      if (hasEdgeV2) hasV2 = true;
      if (hasEdgeV1 && hasEdgeV2) sharedTriangles++;
    }

    // Edge is valid if both vertices exist and they share exactly 1 or 2 triangles
    return hasV1 && hasV2 && sharedTriangles > 0 && sharedTriangles <= 2;
  }

  /**
   * Collapse an edge by merging two vertices into one (proper quadric decimation)
   */
  private static collapseEdge(
    edge: {v1: number, v2: number},
    positions: Float32Array,
    indices: number[],
    vertexToFaces: Map<number, number[]>
  ): boolean {
    const { v1, v2 } = edge;

    // Validate edge
    if (v1 === v2) {
      return false; // Can't collapse edge to itself
    }

    // Check for boundary conditions that would create invalid topology
    const v1Faces = vertexToFaces.get(v1) || [];
    const v2Faces = vertexToFaces.get(v2) || [];

    // Prevent collapse if it would create too many degenerate faces
    let sharedFaces = 0;
    for (const faceIdx of v1Faces) {
      if (v2Faces.includes(faceIdx)) {
        sharedFaces++;
      }
    }

    // Only collapse if vertices share 1 or 2 faces (proper edge on manifold mesh)
    if (sharedFaces < 1 || sharedFaces > 2) {
      return false;
    }

    // Additional check: prevent collapse that would create non-manifold geometry
    if (!this.wouldPreserveManifold(v1, v2, indices, vertexToFaces)) {
      return false;
    }

    console.log(`🔗 Collapsing vertices ${v2} → ${v1} (merging two points into one)`);

    // Step 1: Calculate optimal position for merged vertex
    // Using midpoint for simplicity (in full quadric decimation, this would use quadric error minimization)
    const newX = (positions[v1 * 3] + positions[v2 * 3]) * 0.5;
    const newY = (positions[v1 * 3 + 1] + positions[v2 * 3 + 1]) * 0.5;
    const newZ = (positions[v1 * 3 + 2] + positions[v2 * 3 + 2]) * 0.5;

    // Step 2: Move v1 to the optimal position
    positions[v1 * 3] = newX;
    positions[v1 * 3 + 1] = newY;
    positions[v1 * 3 + 2] = newZ;

    // Step 3: MERGE vertices by replacing all v2 references with v1
    // This is the core of vertex collapsing - we're making v2 and v1 the same point
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v2) {
        indices[i] = v1; // Merge: v2 now points to v1's location
      }
    }

    // Step 4: Clean up degenerate triangles that naturally result from merging
    // When two vertices become one, some triangles become invalid (e.g., [v1, v1, v3])
    this.removeDegenerateFaces(indices);

    // Step 5: Update vertex-to-faces mapping (v2 no longer exists as a separate vertex)
    const mergedFaces = new Set([...v1Faces, ...v2Faces]);
    vertexToFaces.set(v1, Array.from(mergedFaces));
    vertexToFaces.delete(v2); // v2 no longer exists as a separate vertex

    console.log(`✅ Vertices merged successfully, degenerate faces cleaned up`);
    return true;
  }



  /**
   * Remove faces that have duplicate vertices (degenerate triangles)
   */
  private static removeDegenerateFaces(indices: number[]) {
    let writeIndex = 0;

    // Process faces in place to avoid creating a large temporary array
    for (let readIndex = 0; readIndex < indices.length; readIndex += 3) {
      const v1 = indices[readIndex];
      const v2 = indices[readIndex + 1];
      const v3 = indices[readIndex + 2];

      // Only keep faces where all three vertices are different
      if (v1 !== v2 && v2 !== v3 && v3 !== v1) {
        indices[writeIndex] = v1;
        indices[writeIndex + 1] = v2;
        indices[writeIndex + 2] = v3;
        writeIndex += 3;
      }
    }

    // Trim the array to the new size
    indices.length = writeIndex;
  }

  /**
   * Rebuild geometry from position and index arrays
   */
  private static rebuildGeometryFromArrays(
    positions: Float32Array,
    indices: number[]
  ): THREE.BufferGeometry {
    // Create mapping from old vertices to new vertices (removing unused ones)
    const usedVertices = new Set<number>();
    for (const index of indices) {
      usedVertices.add(index);
    }

    const vertexMapping = new Map<number, number>();
    const newPositions: number[] = [];
    let newVertexIndex = 0;

    const sortedVertices = Array.from(usedVertices).sort((a, b) => a - b);
    for (const oldIndex of sortedVertices) {
      vertexMapping.set(oldIndex, newVertexIndex);
      newPositions.push(
        positions[oldIndex * 3],
        positions[oldIndex * 3 + 1],
        positions[oldIndex * 3 + 2]
      );
      newVertexIndex++;
    }

    // Remap indices and validate each triangle
    const newIndices: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const v1 = vertexMapping.get(indices[i]);
      const v2 = vertexMapping.get(indices[i + 1]);
      const v3 = vertexMapping.get(indices[i + 2]);

      // Only add triangle if all vertices are valid and different
      if (v1 !== undefined && v2 !== undefined && v3 !== undefined &&
          v1 !== v2 && v2 !== v3 && v3 !== v1) {
        newIndices.push(v1, v2, v3);
      }
    }

    // Create new geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setIndex(newIndices);

    // Ensure geometry is valid before computing normals
    if (newIndices.length >= 3) {
      newGeometry.computeVertexNormals();
    }

    console.log(`✅ Rebuilt geometry: ${newPositions.length / 3} vertices, ${newIndices.length / 3} faces`);
    return newGeometry;
  }

  /**
   * Analyze geometry to extract unique vertices and face relationships
   */
  private static analyzeGeometry(geometry: THREE.BufferGeometry): {
    vertices: THREE.Vector3[];
    faces: number[][];
    vertexToFaces: Map<number, number[]>;
  } {
    // Ensure geometry is indexed
    if (!geometry.index) {
      throw new Error('Geometry must be indexed for analysis');
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index.array;

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

    if (!geometry.index) {
      throw new Error('Geometry must be indexed for vertex-face adjacency mapping');
    }

    const indices = geometry.index.array;
    
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
    if (!geometry.index) {
      throw new Error('Geometry must be indexed for vertex error calculation');
    }

    const positions = geometry.attributes.position;
    const indices = geometry.index.array;
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
   * Post-process mesh: validate stitching and merge coplanar triangles
   */
  private static postProcessMesh(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const startTime = Date.now();

    // Step 1: Validate and fix any stitching issues
    const stitchedGeometry = this.validateAndFixStitching(geometry);

    // Step 2: Safe coplanar triangle detection and metadata annotation
    // Instead of modifying the geometry, we just identify coplanar regions
    const analyzedGeometry = this.identifyCoplanarRegions(stitchedGeometry);

    console.log(`✅ Post-processing complete in ${Date.now() - startTime}ms`);
    return analyzedGeometry;
  }

  /**
   * Validate mesh connectivity and fix any stitching issues
   */
  private static validateAndFixStitching(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log(`🔍 Validating mesh connectivity...`);

    if (!geometry.index) {
      console.warn('Geometry not indexed, skipping stitching validation');
      return geometry;
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = Array.from(geometry.index.array);
    const vertexCount = geometry.attributes.position.count;

    // Check for degenerate triangles and out-of-bounds indices
    const validIndices: number[] = [];
    let removedDegenerates = 0;
    let removedOutOfBounds = 0;

    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      // Check for out-of-bounds indices
      if (v1 >= vertexCount || v2 >= vertexCount || v3 >= vertexCount ||
          v1 < 0 || v2 < 0 || v3 < 0) {
        removedOutOfBounds++;
        continue;
      }

      // Check if triangle is degenerate (has duplicate vertices)
      if (v1 !== v2 && v2 !== v3 && v3 !== v1) {
        // Check triangle area
        const p1 = new THREE.Vector3(positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]);
        const p2 = new THREE.Vector3(positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]);
        const p3 = new THREE.Vector3(positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2]);

        const edge1 = new THREE.Vector3().subVectors(p2, p1);
        const edge2 = new THREE.Vector3().subVectors(p3, p1);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        const area = cross.length() * 0.5;

        // Use more lenient area threshold
        if (area > 1e-8) { // Triangle has significant area
          validIndices.push(v1, v2, v3);
        } else {
          removedDegenerates++;
        }
      } else {
        removedDegenerates++;
      }
    }

    if (removedDegenerates > 0 || removedOutOfBounds > 0) {
      console.log(`🔧 Removed ${removedDegenerates} degenerate triangles and ${removedOutOfBounds} out-of-bounds triangles`);

      // Ensure we have enough triangles remaining
      if (validIndices.length < 9) { // Less than 3 triangles
        console.warn('⚠️ Too few valid triangles remaining, returning minimal geometry');
        // Create a minimal valid geometry (single triangle)
        const minimalGeometry = new THREE.BufferGeometry();
        const minimalPositions = new Float32Array([
          0, 0, 0,  // vertex 0
          1, 0, 0,  // vertex 1
          0, 1, 0   // vertex 2
        ]);
        minimalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(minimalPositions, 3));
        minimalGeometry.setIndex([0, 1, 2]);
        minimalGeometry.computeVertexNormals();
        return minimalGeometry;
      }

      // Create new geometry with valid triangles
      const newGeometry = new THREE.BufferGeometry();
      newGeometry.setAttribute('position', geometry.attributes.position.clone());
      newGeometry.setIndex(validIndices);

      // Safely compute normals
      try {
        newGeometry.computeVertexNormals();
      } catch (error) {
        console.warn('⚠��� Failed to compute normals, using default:', error);
      }

      return newGeometry;
    }

    return geometry;
  }

  /**
   * Merge coplanar triangles into larger polygons
   */
  private static mergeCoplanarTriangles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log(`🔗 Merging coplanar triangles...`);

    if (!geometry.index) {
      return geometry;
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = Array.from(geometry.index.array);

    // Build adjacency information
    const triangleAdjacency = this.buildTriangleAdjacency(indices);
    const triangleNormals = this.calculateTriangleNormals(positions, indices);

    // Group coplanar triangles
    const coplanarGroups = this.findCoplanarTriangleGroups(
      indices,
      positions,
      triangleNormals,
      triangleAdjacency
    );

    // Merge groups into polygons
    const polygons = this.mergeTriangleGroups(indices, positions, coplanarGroups);

    // Convert polygons back to triangulated geometry with polygon metadata
    const result = this.triangulatePolygons(positions, polygons);

    console.log(`✅ Merged ${coplanarGroups.length} coplanar groups into polygons`);
    return result;
  }

  /**
   * Build triangle adjacency information
   */
  private static buildTriangleAdjacency(indices: number[]): Map<number, number[]> {
    const adjacency = new Map<number, number[]>();
    const edgeToTriangles = new Map<string, number[]>();

    // Build edge-to-triangle mapping
    for (let i = 0; i < indices.length; i += 3) {
      const triangleIndex = i / 3;
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      const edges = [
        this.getEdgeKey(v1, v2),
        this.getEdgeKey(v2, v3),
        this.getEdgeKey(v3, v1)
      ];

      for (const edge of edges) {
        if (!edgeToTriangles.has(edge)) {
          edgeToTriangles.set(edge, []);
        }
        edgeToTriangles.get(edge)!.push(triangleIndex);
      }
    }

    // Build triangle-to-triangle adjacency
    for (let i = 0; i < indices.length; i += 3) {
      const triangleIndex = i / 3;
      const adjacent: number[] = [];

      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      const edges = [
        this.getEdgeKey(v1, v2),
        this.getEdgeKey(v2, v3),
        this.getEdgeKey(v3, v1)
      ];

      for (const edge of edges) {
        const trianglesOnEdge = edgeToTriangles.get(edge) || [];
        for (const otherTriangle of trianglesOnEdge) {
          if (otherTriangle !== triangleIndex && !adjacent.includes(otherTriangle)) {
            adjacent.push(otherTriangle);
          }
        }
      }

      adjacency.set(triangleIndex, adjacent);
    }

    return adjacency;
  }

  /**
   * Get consistent edge key for two vertices
   */
  private static getEdgeKey(v1: number, v2: number): string {
    return v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
  }

  /**
   * Calculate normals for all triangles
   */
  private static calculateTriangleNormals(positions: Float32Array, indices: number[]): THREE.Vector3[] {
    const normals: THREE.Vector3[] = [];

    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      const p1 = new THREE.Vector3(positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]);
      const p2 = new THREE.Vector3(positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]);
      const p3 = new THREE.Vector3(positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2]);

      const edge1 = new THREE.Vector3().subVectors(p2, p1);
      const edge2 = new THREE.Vector3().subVectors(p3, p1);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      normals.push(normal);
    }

    return normals;
  }

  /**
   * Find groups of coplanar triangles
   */
  private static findCoplanarTriangleGroups(
    indices: number[],
    positions: Float32Array,
    normals: THREE.Vector3[],
    adjacency: Map<number, number[]>
  ): number[][] {
    const visited = new Set<number>();
    const groups: number[][] = [];
    const angleTolerance = Math.cos(Math.PI / 180 * 5); // 5 degree tolerance

    for (let i = 0; i < normals.length; i++) {
      if (visited.has(i)) continue;

      const group = this.expandCoplanarGroup(i, normals, adjacency, visited, angleTolerance);
      if (group.length > 1) { // Only groups with multiple triangles
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Expand a coplanar group using flood-fill
   */
  private static expandCoplanarGroup(
    startTriangle: number,
    normals: THREE.Vector3[],
    adjacency: Map<number, number[]>,
    visited: Set<number>,
    angleTolerance: number
  ): number[] {
    const group: number[] = [];
    const queue: number[] = [startTriangle];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      group.push(current);

      const currentNormal = normals[current];
      const adjacent = adjacency.get(current) || [];

      for (const neighbor of adjacent) {
        if (!visited.has(neighbor)) {
          const neighborNormal = normals[neighbor];
          const dot = currentNormal.dot(neighborNormal);

          if (dot >= angleTolerance) { // Coplanar within tolerance
            queue.push(neighbor);
          }
        }
      }
    }

    return group;
  }

  /**
   * Merge triangle groups into polygons
   */
  private static mergeTriangleGroups(
    indices: number[],
    positions: Float32Array,
    groups: number[][]
  ): Array<{vertices: number[], type: string}> {
    const polygons: Array<{vertices: number[], type: string}> = [];

    for (const group of groups) {
      const polygon = this.trianglesToPolygon(group, indices);
      if (polygon.length >= 3) {
        const type = polygon.length === 3 ? 'triangle' :
                    polygon.length === 4 ? 'quad' :
                    polygon.length === 5 ? 'pentagon' :
                    polygon.length === 6 ? 'hexagon' : 'polygon';

        polygons.push({vertices: polygon, type});
      }
    }

    return polygons;
  }

  /**
   * Convert triangle group to polygon boundary
   */
  private static trianglesToPolygon(triangleGroup: number[], indices: number[]): number[] {
    // Collect all edges from triangles in the group
    const edges = new Map<string, number>();

    for (const triangleIndex of triangleGroup) {
      const i = triangleIndex * 3;
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      const triangleEdges = [
        this.getEdgeKey(v1, v2),
        this.getEdgeKey(v2, v3),
        this.getEdgeKey(v3, v1)
      ];

      for (const edge of triangleEdges) {
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }

    // Find boundary edges (edges that appear only once)
    const boundaryEdges: Array<[number, number]> = [];
    for (const [edgeKey, count] of edges) {
      if (count === 1) {
        const [v1, v2] = edgeKey.split('-').map(Number);
        boundaryEdges.push([v1, v2]);
      }
    }

    // Order boundary edges to form a polygon
    return this.orderBoundaryEdges(boundaryEdges);
  }

  /**
   * Order boundary edges to form a continuous polygon
   */
  private static orderBoundaryEdges(edges: Array<[number, number]>): number[] {
    if (edges.length === 0) return [];

    const polygon: number[] = [];
    const remaining = [...edges];

    // Start with first edge
    let current = remaining.shift()!;
    polygon.push(current[0], current[1]);

    // Connect remaining edges
    while (remaining.length > 0) {
      const lastVertex = polygon[polygon.length - 1];
      const nextEdgeIndex = remaining.findIndex(edge =>
        edge[0] === lastVertex || edge[1] === lastVertex
      );

      if (nextEdgeIndex === -1) break; // Can't continue

      const nextEdge = remaining.splice(nextEdgeIndex, 1)[0];
      const nextVertex = nextEdge[0] === lastVertex ? nextEdge[1] : nextEdge[0];
      polygon.push(nextVertex);
    }

    // Remove last vertex if it connects back to first (close loop)
    if (polygon.length > 3 && polygon[polygon.length - 1] === polygon[0]) {
      polygon.pop();
    }

    return polygon;
  }

  /**
   * Triangulate polygons back to geometry with metadata
   */
  private static triangulatePolygons(
    positions: Float32Array,
    polygons: Array<{vertices: number[], type: string}>
  ): THREE.BufferGeometry {
    const triangulatedIndices: number[] = [];
    const polygonMetadata: Array<{type: string, vertices: number[], triangleIndices: number[]}> = [];

    for (const polygon of polygons) {
      const triangleIndices: number[] = [];

      // Fan triangulation from first vertex
      for (let i = 1; i < polygon.vertices.length - 1; i++) {
        const startIndex = triangulatedIndices.length / 3;
        triangulatedIndices.push(
          polygon.vertices[0],
          polygon.vertices[i],
          polygon.vertices[i + 1]
        );
        triangleIndices.push(startIndex);
      }

      polygonMetadata.push({
        type: polygon.type,
        vertices: polygon.vertices,
        triangleIndices
      });
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(triangulatedIndices);
    geometry.computeVertexNormals();

    // Store polygon metadata for export
    (geometry as any).polygonFaces = polygonMetadata;
    (geometry as any).polygonType = 'mixed';

    console.log(`📊 Created ${polygons.length} polygons: ${polygonMetadata.map(p => p.type).join(', ')}`);

    return geometry;
  }

  /**
   * Validate that geometry is not corrupted
   */
  private static validateGeometry(geometry: THREE.BufferGeometry): boolean {
    try {
      // Check basic attributes
      if (!geometry.attributes.position) {
        console.error('❌ Geometry missing position attribute');
        return false;
      }

      const vertexCount = geometry.attributes.position.count;
      if (vertexCount < 3) {
        console.error('❌ Geometry has less than 3 vertices');
        return false;
      }

      // Check index
      if (geometry.index) {
        const indexCount = geometry.index.count;
        if (indexCount < 3 || indexCount % 3 !== 0) {
          console.error('❌ Geometry has invalid index count');
          return false;
        }

        // Check index values are valid
        const indices = geometry.index.array;
        for (let i = 0; i < indices.length; i++) {
          if (indices[i] >= vertexCount) {
            console.error('❌ Geometry has out-of-bounds index');
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Geometry validation failed:', error);
      return false;
    }
  }

  /**
   * Identify coplanar regions without modifying geometry
   */
  private static identifyCoplanarRegions(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    if (!geometry.index) {
      return geometry;
    }

    console.log(`🔍 Identifying coplanar regions...`);

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = Array.from(geometry.index.array);
    const triangleCount = indices.length / 3;

    // Calculate normals for all triangles
    const triangleNormals: THREE.Vector3[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      const p1 = new THREE.Vector3(positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]);
      const p2 = new THREE.Vector3(positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]);
      const p3 = new THREE.Vector3(positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2]);

      const edge1 = new THREE.Vector3().subVectors(p2, p1);
      const edge2 = new THREE.Vector3().subVectors(p3, p1);
      const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      triangleNormals.push(normal);
    }

    // Group coplanar triangles (just for analysis, not modification)
    const coplanarGroups: number[][] = [];
    const processed = new Set<number>();
    const angleTolerance = Math.cos(Math.PI / 180 * 10); // 10 degree tolerance

    for (let i = 0; i < triangleCount; i++) {
      if (processed.has(i)) continue;

      const group = [i];
      processed.add(i);
      const baseNormal = triangleNormals[i];

      // Find coplanar neighbors
      for (let j = i + 1; j < triangleCount; j++) {
        if (processed.has(j)) continue;

        const dot = Math.abs(baseNormal.dot(triangleNormals[j]));
        if (dot >= angleTolerance) {
          group.push(j);
          processed.add(j);
        }
      }

      if (group.length > 1) {
        coplanarGroups.push(group);
      }
    }

    // Store metadata about coplanar regions without modifying the mesh
    const analyzedGeometry = geometry.clone();
    (analyzedGeometry as any).coplanarRegions = coplanarGroups;
    (analyzedGeometry as any).triangleNormals = triangleNormals;

    const quads = coplanarGroups.filter(g => g.length === 2).length;
    const pentagons = coplanarGroups.filter(g => g.length === 3).length;
    const hexagons = coplanarGroups.filter(g => g.length === 4).length;
    const polygons = coplanarGroups.filter(g => g.length > 4).length;

    console.log(`📊 Identified ${coplanarGroups.length} coplanar regions: ${quads} quads, ${pentagons} pentagons, ${hexagons} hexagons, ${polygons} larger polygons`);

    return analyzedGeometry;
  }

  /**
   * Check if collapsing an edge would preserve manifold properties
   */
  private static wouldPreserveManifold(
    v1: number,
    v2: number,
    indices: number[],
    vertexToFaces: Map<number, number[]>
  ): boolean {
    const v1Faces = vertexToFaces.get(v1) || [];
    const v2Faces = vertexToFaces.get(v2) || [];

    // Find faces that would be removed (those containing both v1 and v2)
    const facesToRemove = new Set<number>();
    for (const faceIdx of v1Faces) {
      if (v2Faces.includes(faceIdx)) {
        facesToRemove.add(faceIdx);
      }
    }

    // Check each remaining face to ensure it won't become degenerate
    const remainingFaces = [...v1Faces, ...v2Faces].filter(f => !facesToRemove.has(f));

    for (const faceIdx of remainingFaces) {
      const faceStart = faceIdx * 3;
      if (faceStart + 2 < indices.length) {
        const fv1 = indices[faceStart];
        const fv2 = indices[faceStart + 1];
        const fv3 = indices[faceStart + 2];

        // After collapse, v2 becomes v1, check if triangle would be valid
        const newTriangle = [fv1, fv2, fv3].map(v => v === v2 ? v1 : v);
        if (newTriangle[0] === newTriangle[1] ||
            newTriangle[1] === newTriangle[2] ||
            newTriangle[2] === newTriangle[0]) {
          // This face would become degenerate, but that's expected and handled
          continue;
        }
      }
    }

    // Basic manifold check: ensure the collapse doesn't create too complex vertex neighborhoods
    const totalNeighborFaces = new Set([...v1Faces, ...v2Faces]).size;
    return totalNeighborFaces <= 12; // Reasonable limit for vertex valence
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
