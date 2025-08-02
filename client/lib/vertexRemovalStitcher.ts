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

    // Calculate target face count
    const currentFaces = originalStats.faces;
    const targetFaces = Math.max(4, Math.floor(currentFaces * (1 - targetReduction))); // Minimum 4 faces (tetrahedron)

    console.log(`📊 Plan: Reduce faces ${currentFaces} → ${targetFaces}`);

    // Apply quadric edge collapse
    const resultGeometry = this.quadricEdgeCollapse(workingGeometry, targetFaces, true);

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
   * Quadric edge collapse simplification (like Open3D's quadric decimation)
   */
  private static quadricEdgeCollapse(
    geometry: THREE.BufferGeometry,
    targetFaces: number,
    useQuadricError: boolean = true
  ): THREE.BufferGeometry {
    console.log(`🔧 Starting quadric edge collapse to ${targetFaces} faces...`);

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

        if (collapsedEdges % 100 === 0) {
          console.log(`🔧 Collapsed ${collapsedEdges} edges, ${currentFaces} faces remaining`);
        }
      }
    }

    // Clean up and rebuild geometry
    const cleanedGeometry = this.rebuildGeometryFromArrays(positions, indices);

    if (iterations >= maxIterations) {
      console.warn(`⚠️ Hit safety limit of ${maxIterations} iterations, stopping early`);
    }

    console.log(`✅ Edge collapse complete: ${collapsedEdges} edges collapsed, ${currentFaces} faces remaining`);
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

    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === edge.v1) hasV1 = true;
      if (indices[i] === edge.v2) hasV2 = true;
      if (hasV1 && hasV2) return true;
    }

    return false;
  }

  /**
   * Collapse an edge by merging v2 into v1
   */
  private static collapseEdge(
    edge: {v1: number, v2: number},
    positions: Float32Array,
    indices: number[],
    vertexToFaces: Map<number, number[]>
  ): boolean {
    const { v1, v2 } = edge;

    // Calculate new position (midpoint of the edge)
    const newX = (positions[v1 * 3] + positions[v2 * 3]) * 0.5;
    const newY = (positions[v1 * 3 + 1] + positions[v2 * 3 + 1]) * 0.5;
    const newZ = (positions[v1 * 3 + 2] + positions[v2 * 3 + 2]) * 0.5;

    // Update v1 position to the new position
    positions[v1 * 3] = newX;
    positions[v1 * 3 + 1] = newY;
    positions[v1 * 3 + 2] = newZ;

    // Replace all occurrences of v2 with v1 in the index array
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v2) {
        indices[i] = v1;
      }
    }

    // Remove degenerate faces (faces with duplicate vertices)
    this.removeDegenerateFaces(indices);

    // Update vertex-to-faces mapping
    const v2Faces = vertexToFaces.get(v2) || [];
    const v1Faces = vertexToFaces.get(v1) || [];
    vertexToFaces.set(v1, [...v1Faces, ...v2Faces]);
    vertexToFaces.delete(v2);

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

    // Remap indices
    const newIndices = indices.map(oldIndex => vertexMapping.get(oldIndex)!);

    // Create new geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

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
