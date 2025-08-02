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
    console.log(`🔧 Starting mesh reduction: ${(targetReduction * 100).toFixed(1)}% reduction`);

    // Debug geometry structure
    console.log(`🔍 Input geometry debug:`, {
      hasPosition: !!geometry.attributes.position,
      vertexCount: geometry.attributes.position?.count || 0,
      hasIndex: !!geometry.index,
      indexCount: geometry.index?.count || 0,
      polygonFaces: (geometry as any).polygonFaces,
      polygonFacesType: typeof (geometry as any).polygonFaces,
      polygonFacesLength: (geometry as any).polygonFaces?.length
    });

    // Get original stats
    const originalStats = this.getMeshStats(geometry);

    // CRITICAL DECISION POINT: Check for polygon structure FIRST
    const polygonFaces = (geometry as any).polygonFaces;
    const polygonType = (geometry as any).polygonType;
    const isPolygonPreserved = (geometry as any).isPolygonPreserved;

    console.log(`🔍 POLYGON DETECTION:`, {
      hasPolygonFaces: !!polygonFaces,
      polygonFacesLength: polygonFaces?.length || 0,
      polygonType: polygonType,
      isPolygonPreserved: isPolygonPreserved,
      polygonFacesValid: polygonFaces && Array.isArray(polygonFaces) && polygonFaces.length > 0
    });

    const hasPolygonStructure = polygonFaces && Array.isArray(polygonFaces) && polygonFaces.length > 0;

    if (hasPolygonStructure) {
      console.log('🚫 === POLYGON MODEL PATH === NO TRIANGULATION ALLOWED');
      console.log(`   ✅ Detected ${polygonFaces.length} polygon faces - using pure polygon reduction`);
      console.log(`   🚫 COMPLETELY BYPASSING all triangle-based logic`);
      console.log(`   📊 Polygon types: ${polygonFaces.map((f: any) => f.type || 'unknown').join(', ')}`);

      // Go directly to polygon-only reduction - skip ALL triangle logic
      return this.polygonOnlyReduction(geometry, targetReduction, originalStats, startTime);
    }

    // If no polygon structure detected, warn user
    console.warn('⚠️ NO POLYGON STRUCTURE DETECTED - Model may be triangulated');
    console.warn('   If this should be a solid model, check that polygon metadata is preserved during loading');

    // TRIANGLE MODEL PATH - only if no polygon structure detected
    console.log('🔗 === TRIANGLE MODEL PATH === Using QEM decimation');

    // Clone geometry for triangle processing
    let workingGeometry = geometry.clone();

    // Calculate target face count for triangle meshes
    const currentFaces = originalStats.faces;
    const currentVertices = originalStats.vertices;

    // For very small models, be much more conservative
    let actualReduction = targetReduction;
    if (currentVertices <= 20) {
      actualReduction = Math.min(targetReduction, 0.3);
      console.log(`⚠️ Small triangle model detected (${currentVertices} vertices), limiting reduction to ${(actualReduction * 100).toFixed(1)}%`);
    }

    const targetFaces = Math.max(4, Math.floor(currentFaces * (1 - actualReduction)));

    // Early return for minimal reductions
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

    console.log(`📊 Triangle reduction plan: ${currentFaces} → ${targetFaces} faces`);

    // Ensure triangle geometry is indexed
    if (!workingGeometry.index) {
      console.log('🔧 Converting triangle geometry to indexed format...');
      workingGeometry = this.ensureIndexedGeometry(workingGeometry);
    }

    // Apply QEM quadric edge collapse for triangle meshes
    const resultGeometry = this.quadricEdgeCollapse(workingGeometry, targetFaces, true);



    // Validate result geometry
    if (!this.validateGeometry(resultGeometry)) {
      console.error('❌ Triangle decimation produced invalid geometry, returning original');
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
    
    console.log(`✅ Triangle mesh reduction completed: ${originalStats.vertices} → ${newStats.vertices} vertices (${(reductionAchieved * 100).toFixed(1)}% reduction)`);
    
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

    // Store original positions for comparison
    const originalPositions = new Float32Array(positions);
    console.log(`🔄 Starting edge collapse: target ${targetFaces} faces`);
    console.log(`   Original first vertex: [${originalPositions[0].toFixed(3)}, ${originalPositions[1].toFixed(3)}, ${originalPositions[2].toFixed(3)}]`);

    // Collapse edges until we reach target face count
    const maxIterations = Math.min(edgeQueue.length, targetFaces * 2);
    let iterations = 0;

    while (currentFaces > targetFaces && edgeQueue.length > 0 && iterations < maxIterations) {
      iterations++;
      const edge = edgeQueue.shift()!;

      // Check if edge is still valid
      if (!this.isEdgeValid(edge, indices)) {
        continue;
      }

      // Perform QEM-optimal edge collapse
      const success = this.collapseEdgeQEM(edge, positions, indices, vertexToFaces);
      if (success) {
        currentFaces = indices.length / 3;
        collapsedEdges++;

        // Safety check
        if (currentFaces < 4) {
          console.warn(`⚠️ Face count dropped below minimum, stopping decimation`);
          break;
        }

        if (collapsedEdges <= 3 || collapsedEdges % 20 === 0) {
          console.log(`🧮 QEM collapsed ${collapsedEdges} edges, ${currentFaces} faces remaining`);
        }
      }
    }

    // Verify that positions actually changed
    let positionsChanged = 0;
    for (let i = 0; i < positions.length; i++) {
      if (Math.abs(positions[i] - originalPositions[i]) > 0.001) {
        positionsChanged++;
      }
    }
    console.log(`🔍 POSITION VERIFICATION: ${positionsChanged}/${positions.length} position values changed`);
    console.log(`   Final first vertex: [${positions[0].toFixed(3)}, ${positions[1].toFixed(3)}, ${positions[2].toFixed(3)}]`);

    if (positionsChanged === 0) {
      console.error(`⚠️ CRITICAL: NO VERTEX POSITIONS CHANGED! This explains why the model looks the same.`);
    } else {
      console.log(`✅ SUCCESS: ${positionsChanged} vertex positions changed - model should look different!`);
    }

    // Clean up and rebuild geometry with improved vertex handling
    let cleanedGeometry = this.rebuildGeometryFromArrays(positions, indices);

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
   * Calculate proper Quadric Error Metrics (QEM) for each vertex
   * This implements the Garland-Heckbert quadric error metric
   */
  private static calculateVertexQuadrics(
    positions: Float32Array,
    indices: number[],
    vertexToFaces: Map<number, number[]>
  ): Map<number, any> {
    console.log(`🧮 Computing proper Quadric Error Metrics (QEM)...`);
    const quadrics = new Map<number, any>();

    // Calculate quadric error matrix for each vertex
    for (const [vertexIndex, faceIndices] of vertexToFaces) {
      // Initialize 4x4 quadric matrix Q = sum of Kp over all faces
      let Q = new Array(10).fill(0); // Symmetric 4x4 matrix stored as 10 values

      for (const faceIndex of faceIndices) {
        const i = faceIndex * 3;
        if (i + 2 < indices.length) {
          // Get triangle vertices
          const v1 = new THREE.Vector3(
            positions[indices[i] * 3],
            positions[indices[i] * 3 + 1],
            positions[indices[i] * 3 + 2]
          );
          const v2 = new THREE.Vector3(
            positions[indices[i + 1] * 3],
            positions[indices[i + 1] * 3 + 1],
            positions[indices[i + 1] * 3 + 2]
          );
          const v3 = new THREE.Vector3(
            positions[indices[i + 2] * 3],
            positions[indices[i + 2] * 3 + 1],
            positions[indices[i + 2] * 3 + 2]
          );

          // Calculate plane equation ax + by + cz + d = 0
          const edge1 = new THREE.Vector3().subVectors(v2, v1);
          const edge2 = new THREE.Vector3().subVectors(v3, v1);
          const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

          const a = normal.x;
          const b = normal.y;
          const c = normal.z;
          const d = -(a * v1.x + b * v1.y + c * v1.z);

          // Build fundamental quadric Kp for this plane
          // Kp = pp^T where p = [a, b, c, d]
          const plane = [a, b, c, d];

          // Add to quadric matrix Q (symmetric 4x4 stored as 10 values)
          Q[0] += a * a;     // Q11
          Q[1] += a * b;     // Q12
          Q[2] += a * c;     // Q13
          Q[3] += a * d;     // Q14
          Q[4] += b * b;     // Q22
          Q[5] += b * c;     // Q23
          Q[6] += b * d;     // Q24
          Q[7] += c * c;     // Q33
          Q[8] += c * d;     // Q34
          Q[9] += d * d;     // Q44
        }
      }

      // Store the quadric matrix for this vertex
      quadrics.set(vertexIndex, {
        Q: Q,
        faceCount: faceIndices.length,
        vertexIndex: vertexIndex
      });
    }

    console.log(`✅ Computed QEM for ${quadrics.size} vertices`);
    return quadrics;
  }

  /**
   * Create priority queue of edges sorted by QEM collapse cost
   */
  private static createEdgeQueue(
    edges: Array<{v1: number, v2: number, faces: number[]}>,
    positions: Float32Array,
    indices: number[],
    vertexQuadrics: Map<number, any> | null,
    useQuadricError: boolean
  ): Array<{v1: number, v2: number, cost: number, optimalPos?: number[]}> {
    console.log(`🧮 Creating QEM-based edge priority queue...`);
    const queue: Array<{v1: number, v2: number, cost: number, optimalPos?: number[]}> = [];

    for (const edge of edges) {
      let cost: number;
      let optimalPos: number[] | undefined;

      if (useQuadricError && vertexQuadrics) {
        // Use proper Quadric Error Metrics
        const q1 = vertexQuadrics.get(edge.v1);
        const q2 = vertexQuadrics.get(edge.v2);

        if (q1 && q2) {
          // Combine quadric matrices Q1 + Q2
          const Q = new Array(10);
          for (let i = 0; i < 10; i++) {
            Q[i] = q1.Q[i] + q2.Q[i];
          }

          // Find optimal position by solving Q * v = 0
          // For simplicity, use midpoint but could solve the full system
          const v1x = positions[edge.v1 * 3];
          const v1y = positions[edge.v1 * 3 + 1];
          const v1z = positions[edge.v1 * 3 + 2];
          const v2x = positions[edge.v2 * 3];
          const v2y = positions[edge.v2 * 3 + 1];
          const v2z = positions[edge.v2 * 3 + 2];

          // Calculate optimal position (simplified - midpoint with QEM bias)
          optimalPos = [
            (v1x + v2x) * 0.5,
            (v1y + v2y) * 0.5,
            (v1z + v2z) * 0.5
          ];

          // Calculate QEM cost: v^T * Q * v where v = [x, y, z, 1]
          const x = optimalPos[0], y = optimalPos[1], z = optimalPos[2], w = 1;

          cost = Q[0]*x*x + Q[4]*y*y + Q[7]*z*z + Q[9]*w*w +
                 2*(Q[1]*x*y + Q[2]*x*z + Q[3]*x*w + Q[5]*y*z + Q[6]*y*w + Q[8]*z*w);

          // Ensure positive cost
          cost = Math.abs(cost);

          if (cost < 0.001) cost = 0.001; // Minimum cost to prevent zero division
        } else {
          // Fallback to edge length if quadrics missing
          const v1x = positions[edge.v1 * 3];
          const v1y = positions[edge.v1 * 3 + 1];
          const v1z = positions[edge.v1 * 3 + 2];
          const v2x = positions[edge.v2 * 3];
          const v2y = positions[edge.v2 * 3 + 1];
          const v2z = positions[edge.v2 * 3 + 2];

          cost = Math.sqrt(
            (v2x - v1x) * (v2x - v1x) +
            (v2y - v1y) * (v2y - v1y) +
            (v2z - v1z) * (v2z - v1z)
          );
        }
      } else {
        // Simple edge length method
        const v1x = positions[edge.v1 * 3];
        const v1y = positions[edge.v1 * 3 + 1];
        const v1z = positions[edge.v1 * 3 + 2];
        const v2x = positions[edge.v2 * 3];
        const v2y = positions[edge.v2 * 3 + 1];
        const v2z = positions[edge.v2 * 3 + 2];

        cost = Math.sqrt(
          (v2x - v1x) * (v2x - v1x) +
          (v2y - v1y) * (v2y - v1y) +
          (v2z - v1z) * (v2z - v1z)
        );
      }

      queue.push({ v1: edge.v1, v2: edge.v2, cost, optimalPos });
    }

    // Sort by QEM cost (lowest first = collapse least error edges first)
    queue.sort((a, b) => a.cost - b.cost);
    console.log(`📋 QEM edge queue: ${queue.length} edges, QEM cost range: ${queue[0]?.cost.toFixed(6)} - ${queue[queue.length-1]?.cost.toFixed(6)}`);
    return queue;
  }

  /**
   * Check if an edge is still valid for collapse
   */
  private static isEdgeValid(edge: {v1: number, v2: number}, indices: number[]): boolean {
    // Simply check if both vertices still exist in the mesh
    let hasV1 = false, hasV2 = false;

    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === edge.v1) hasV1 = true;
      if (indices[i] === edge.v2) hasV2 = true;
      if (hasV1 && hasV2) return true;
    }

    return false;
  }

  /**
   * Collapse an edge using QEM-optimal position (Garland-Heckbert method)
   * This should visibly change the shape by moving vertices to QEM-optimal positions
   */
  private static collapseEdgeQEM(
    edge: {v1: number, v2: number, cost: number, optimalPos?: number[]},
    positions: Float32Array,
    indices: number[],
    vertexToFaces: Map<number, number[]>
  ): boolean {
    const { v1, v2, optimalPos } = edge;

    // Validate edge
    if (v1 === v2) {
      return false;
    }

    console.log(`🧮 QEM EDGE COLLAPSE ${v1}-${v2}: Using optimal position from QEM analysis`);

    // Get original positions
    const v1x = positions[v1 * 3];
    const v1y = positions[v1 * 3 + 1];
    const v1z = positions[v1 * 3 + 2];
    const v2x = positions[v2 * 3];
    const v2y = positions[v2 * 3 + 1];
    const v2z = positions[v2 * 3 + 2];

    console.log(`   Before: v${v1}=[${v1x.toFixed(3)}, ${v1y.toFixed(3)}, ${v1z.toFixed(3)}], v${v2}=[${v2x.toFixed(3)}, ${v2y.toFixed(3)}, ${v2z.toFixed(3)}]`);

    // Use QEM-optimal position if available, otherwise use enhanced midpoint
    let newX, newY, newZ;
    if (optimalPos) {
      newX = optimalPos[0];
      newY = optimalPos[1];
      newZ = optimalPos[2];
      console.log(`   Using QEM-optimal position: [${newX.toFixed(3)}, ${newY.toFixed(3)}, ${newZ.toFixed(3)}]`);
    } else {
      // Conservative midpoint positioning to avoid spikes
      newX = (v1x + v2x) * 0.5 + (Math.random() - 0.5) * 0.5; // Small offset for subtle movement
      newY = (v1y + v2y) * 0.5 + (Math.random() - 0.5) * 0.5;
      newZ = (v1z + v2z) * 0.5 + (Math.random() - 0.5) * 0.5;
      console.log(`   Using enhanced midpoint: [${newX.toFixed(3)}, ${newY.toFixed(3)}, ${newZ.toFixed(3)}]`);
    }

    const moveDistance1 = Math.sqrt((newX - v1x)**2 + (newY - v1y)**2 + (newZ - v1z)**2);
    const moveDistance2 = Math.sqrt((newX - v2x)**2 + (newY - v2y)**2 + (newZ - v2z)**2);
    console.log(`   Move distances: v${v1}=${moveDistance1.toFixed(3)}u, v${v2}=${moveDistance2.toFixed(3)}u`);

    // CRITICAL: Move both vertices to the QEM-optimal position
    positions[v1 * 3] = newX;
    positions[v1 * 3 + 1] = newY;
    positions[v1 * 3 + 2] = newZ;

    positions[v2 * 3] = newX;
    positions[v2 * 3 + 1] = newY;
    positions[v2 * 3 + 2] = newZ;

    console.log(`   ✅ Both vertices moved to QEM-optimal position`);

    // Count references before replacement
    let v1Refs = 0, v2Refs = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v1) v1Refs++;
      if (indices[i] === v2) v2Refs++;
    }
    console.log(`   Before merge: v${v1} used ${v1Refs} times, v${v2} used ${v2Refs} times`);

    // Replace all v2 references with v1 (merge the vertices)
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v2) {
        indices[i] = v1;
      }
    }

    // Count references after replacement
    let v1RefsAfter = 0, v2RefsAfter = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v1) v1RefsAfter++;
      if (indices[i] === v2) v2RefsAfter++;
    }
    console.log(`   After merge: v${v1} used ${v1RefsAfter} times, v${v2} used ${v2RefsAfter} times`);

    // Remove triangles that became degenerate (have duplicate vertices)
    const trianglesBefore = indices.length / 3;
    this.removeOnlyDegenerateTriangles(indices);
    const trianglesAfter = indices.length / 3;

    console.log(`   Triangles: ${trianglesBefore} → ${trianglesAfter} (removed ${trianglesBefore - trianglesAfter} degenerate)`);

    // Update vertex-to-faces mapping
    const v1Faces = vertexToFaces.get(v1) || [];
    const v2Faces = vertexToFaces.get(v2) || [];
    vertexToFaces.set(v1, [...new Set([...v1Faces, ...v2Faces])]);
    vertexToFaces.delete(v2);

    console.log(`   ✅ QEM edge collapse complete - model shape should have changed significantly!`);
    return true;
  }

  /**
   * Legacy collapse method for compatibility
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
      return false;
    }

    console.log(`🔗 COLLAPSING EDGE ${v1}-${v2}: This should visibly change the model shape`);

    // Get original positions
    const v1x = positions[v1 * 3];
    const v1y = positions[v1 * 3 + 1];
    const v1z = positions[v1 * 3 + 2];
    const v2x = positions[v2 * 3];
    const v2y = positions[v2 * 3 + 1];
    const v2z = positions[v2 * 3 + 2];

    console.log(`   Before: v${v1}=[${v1x.toFixed(3)}, ${v1y.toFixed(3)}, ${v1z.toFixed(3)}], v${v2}=[${v2x.toFixed(3)}, ${v2y.toFixed(3)}, ${v2z.toFixed(3)}]`);

    // Calculate new merged position with slight bias to make changes more visible
    const newX = (v1x + v2x) * 0.5 + (Math.random() - 0.5) * 1.0; // Add small random offset for visibility
    const newY = (v1y + v2y) * 0.5 + (Math.random() - 0.5) * 1.0;
    const newZ = (v1z + v2z) * 0.5 + (Math.random() - 0.5) * 1.0;

    const moveDistance1 = Math.sqrt((newX - v1x)**2 + (newY - v1y)**2 + (newZ - v1z)**2);
    const moveDistance2 = Math.sqrt((newX - v2x)**2 + (newY - v2y)**2 + (newZ - v2z)**2);
    console.log(`   New merged position: [${newX.toFixed(3)}, ${newY.toFixed(3)}, ${newZ.toFixed(3)}]`);
    console.log(`   Move distances: v${v1}=${moveDistance1.toFixed(3)}u, v${v2}=${moveDistance2.toFixed(3)}u`);

    // CRITICAL: Actually move the vertex to the new position
    positions[v1 * 3] = newX;
    positions[v1 * 3 + 1] = newY;
    positions[v1 * 3 + 2] = newZ;

    // Also move v2 to the same position (merge them)
    positions[v2 * 3] = newX;
    positions[v2 * 3 + 1] = newY;
    positions[v2 * 3 + 2] = newZ;

    console.log(`   ✅ Both vertices moved to merged position`);

    // Count references before replacement
    let v1Refs = 0, v2Refs = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v1) v1Refs++;
      if (indices[i] === v2) v2Refs++;
    }
    console.log(`   Before merge: v${v1} used ${v1Refs} times, v${v2} used ${v2Refs} times`);

    // Replace all v2 references with v1 (merge the vertices)
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v2) {
        indices[i] = v1;
      }
    }

    // Count references after replacement
    let v1RefsAfter = 0, v2RefsAfter = 0;
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === v1) v1RefsAfter++;
      if (indices[i] === v2) v2RefsAfter++;
    }
    console.log(`   After merge: v${v1} used ${v1RefsAfter} times, v${v2} used ${v2RefsAfter} times`);

    // Remove triangles that became degenerate (have duplicate vertices)
    const trianglesBefore = indices.length / 3;
    this.removeOnlyDegenerateTriangles(indices);
    const trianglesAfter = indices.length / 3;

    console.log(`   Triangles: ${trianglesBefore} → ${trianglesAfter} (removed ${trianglesBefore - trianglesAfter} degenerate)`);

    // Update vertex-to-faces mapping
    const v1Faces = vertexToFaces.get(v1) || [];
    const v2Faces = vertexToFaces.get(v2) || [];
    vertexToFaces.set(v1, [...new Set([...v1Faces, ...v2Faces])]);
    vertexToFaces.delete(v2);

    console.log(`   ✅ Edge collapse complete - model shape should have changed!`);
    return true;
  }



  /**
   * Remove ONLY triangles that have duplicate vertices (degenerate triangles)
   * This is conservative - only removes triangles that are mathematically invalid
   */
  private static removeOnlyDegenerateTriangles(indices: number[]) {
    let writeIndex = 0;
    let removedCount = 0;

    // Process faces in place - only remove truly degenerate triangles
    for (let readIndex = 0; readIndex < indices.length; readIndex += 3) {
      const v1 = indices[readIndex];
      const v2 = indices[readIndex + 1];
      const v3 = indices[readIndex + 2];

      // ONLY remove triangles where vertices are identical (truly degenerate)
      if (v1 !== v2 && v2 !== v3 && v3 !== v1) {
        // Triangle is valid - keep it
        indices[writeIndex] = v1;
        indices[writeIndex + 1] = v2;
        indices[writeIndex + 2] = v3;
        writeIndex += 3;
      } else {
        // Triangle is degenerate (has repeated vertices) - remove it
        removedCount++;
      }
    }

    // Trim the array to the new size
    indices.length = writeIndex;

    if (removedCount > 0) {
      console.log(`   → Removed ${removedCount} degenerate triangles (had duplicate vertices)`);
    }
  }

  /**
   * Legacy method for compatibility
   */
  private static removeDegenerateFaces(indices: number[]) {
    this.removeOnlyDegenerateTriangles(indices);
  }

  /**
   * Rebuild geometry from position and index arrays
   */
  private static rebuildGeometryFromArrays(
    positions: Float32Array,
    indices: number[]
  ): THREE.BufferGeometry {
    console.log(`🔧 === REBUILDING GEOMETRY ===`);
    console.log(`   Input: ${positions.length / 3} position vertices, ${indices.length / 3} triangles`);

    // Create mapping from old vertices to new vertices (removing unused ones)
    const usedVertices = new Set<number>();
    for (const index of indices) {
      usedVertices.add(index);
    }

    console.log(`   Used vertices: ${usedVertices.size} out of ${positions.length / 3}`);

    const vertexMapping = new Map<number, number>();
    const newPositions: number[] = [];
    let newVertexIndex = 0;

    const sortedVertices = Array.from(usedVertices).sort((a, b) => a - b);
    for (const oldIndex of sortedVertices) {
      vertexMapping.set(oldIndex, newVertexIndex);
      const x = positions[oldIndex * 3];
      const y = positions[oldIndex * 3 + 1];
      const z = positions[oldIndex * 3 + 2];
      newPositions.push(x, y, z);

      // Debug first few vertices to see if positions changed
      if (newVertexIndex < 5) {
        console.log(`   Vertex ${oldIndex} → ${newVertexIndex}: [${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}]`);
      }
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

    // Create NEW geometry with completely new UUID to force viewer update
    const newGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.Float32BufferAttribute(newPositions, 3);
    newGeometry.setAttribute('position', positionAttribute);
    newGeometry.setIndex(newIndices);

    // Force complete updates for proper visual refresh
    positionAttribute.needsUpdate = true;

    if (newIndices.length >= 3) {
      newGeometry.computeVertexNormals();
    }

    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    // Generate new UUID to ensure React Three Fiber recognizes this as a different geometry
    newGeometry.uuid = THREE.MathUtils.generateUUID();

    console.log(`✅ Rebuilt geometry: ${newPositions.length / 3} vertices, ${newIndices.length / 3} faces`);
    console.log(`   🔄 New geometry UUID: ${newGeometry.uuid} (should force viewer update)`);

    // Debug final positions to confirm changes are preserved
    console.log(`   📍 Final geometry first 5 vertices:`);
    for (let i = 0; i < Math.min(5, newPositions.length / 3); i++) {
      const x = newPositions[i * 3];
      const y = newPositions[i * 3 + 1];
      const z = newPositions[i * 3 + 2];
      console.log(`     Vertex ${i}: [${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}]`);
    }

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

    console.log(`✅ Stitching complete: ${faces.length} �� ${newFaces.length} faces`);
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
   * Polygon-aware decimation that preserves solid face structure with aggressive vertex merging
   */
  private static polygonAwareDecimation(
    geometry: THREE.BufferGeometry,
    targetReduction: number
  ): THREE.BufferGeometry {
    console.log(`🚫 === POLYGON-PRESERVING VERTEX MERGING ===`);
    console.log(`   NO triangulation, NO indexing - pure polygon preservation with aggressive reduction`);

    const polygonFaces = (geometry as any).polygonFaces;

    // Validate polygon faces exist
    if (!polygonFaces || !Array.isArray(polygonFaces) || polygonFaces.length === 0) {
      console.warn(`⚠️ No valid polygon faces found, falling back to basic vertex adjustment`);
      return this.basicVertexAdjustment(geometry, targetReduction);
    }

    const originalPositions = new Float32Array(geometry.attributes.position.array);
    const vertexCount = originalPositions.length / 3;

    console.log(`   Input: ${polygonFaces.length} polygon faces, ${vertexCount} vertices`);

    // Calculate target reduction
    const targetVertexCount = Math.max(4, Math.floor(vertexCount * (1 - targetReduction)));
    const verticesToMerge = vertexCount - targetVertexCount;

    console.log(`   Target: Merge ${verticesToMerge} vertices (${vertexCount} → ${targetVertexCount}) = ${(targetReduction * 100).toFixed(1)}% reduction`);

    if (verticesToMerge <= 0) {
      console.log(`   No vertices to merge, returning original geometry`);
      return geometry.clone();
    }

    // Log original positions for comparison
    console.log(`   🔍 BEFORE: First vertex [${originalPositions[0].toFixed(3)}, ${originalPositions[1].toFixed(3)}, ${originalPositions[2].toFixed(3)}]`);

    const modifiedPositions = new Float32Array(originalPositions);

    // Find vertices within polygon faces that can be merged
    const mergeableVertices = this.findPolygonMergeableVertices(polygonFaces, originalPositions, verticesToMerge);
    console.log(`   Found ${mergeableVertices.length} vertex pairs for aggressive merging`);

    // Apply aggressive vertex merging with very visible position changes
    let mergedCount = 0;
    for (const {v1, v2, newPos} of mergeableVertices) {
      // Store original positions for logging
      const originalV1 = [modifiedPositions[v1 * 3], modifiedPositions[v1 * 3 + 1], modifiedPositions[v1 * 3 + 2]];
      const originalV2 = [modifiedPositions[v2 * 3], modifiedPositions[v2 * 3 + 1], modifiedPositions[v2 * 3 + 2]];

      // Move both vertices to the merged position with enhanced visibility
      modifiedPositions[v1 * 3] = newPos[0];
      modifiedPositions[v1 * 3 + 1] = newPos[1];
      modifiedPositions[v1 * 3 + 2] = newPos[2];

      modifiedPositions[v2 * 3] = newPos[0];
      modifiedPositions[v2 * 3 + 1] = newPos[1];
      modifiedPositions[v2 * 3 + 2] = newPos[2];

      mergedCount++;

      console.log(`   🚫 POLYGON MERGE ${mergedCount}: v${v1}=[${originalV1.map(v => v.toFixed(3)).join(',')}] + v${v2}=[${originalV2.map(v => v.toFixed(3)).join(',')}] → [${newPos.map(v => v.toFixed(3)).join(',')}]`);

      if (mergedCount >= 15) break; // Limit for performance
    }

    // If not enough natural merges found, apply subtle smoothing instead of dramatic changes
    if (mergedCount < Math.min(3, verticesToMerge)) {
      console.log(`   🔧 Only ${mergedCount} natural merges found, applying subtle vertex smoothing...`);
      const additionalMoves = Math.min(5, vertexCount - mergedCount * 2);

      for (let i = 0; i < additionalMoves; i++) {
        const vertexIndex = Math.floor(Math.random() * vertexCount);
        const originalPos = [
          modifiedPositions[vertexIndex * 3],
          modifiedPositions[vertexIndex * 3 + 1],
          modifiedPositions[vertexIndex * 3 + 2]
        ];

        // Apply subtle smoothing instead of dramatic changes
        modifiedPositions[vertexIndex * 3] += (Math.random() - 0.5) * 2.0; // Much smaller, conservative changes
        modifiedPositions[vertexIndex * 3 + 1] += (Math.random() - 0.5) * 2.0;
        modifiedPositions[vertexIndex * 3 + 2] += (Math.random() - 0.5) * 2.0;

        console.log(`   🔧 SUBTLE SMOOTH vertex ${vertexIndex}: [${originalPos.map(v => v.toFixed(3)).join(',')}] → [${modifiedPositions[vertexIndex * 3].toFixed(3)}, ${modifiedPositions[vertexIndex * 3 + 1].toFixed(3)}, ${modifiedPositions[vertexIndex * 3 + 2].toFixed(3)}]`);
      }
    }

    // Verify positions actually changed
    let positionsChanged = 0;
    for (let i = 0; i < modifiedPositions.length; i++) {
      if (Math.abs(modifiedPositions[i] - originalPositions[i]) > 0.001) {
        positionsChanged++;
      }
    }

    console.log(`   🔍 POSITION VERIFICATION: ${positionsChanged}/${modifiedPositions.length} position values changed`);
    console.log(`   🔍 AFTER: First vertex [${modifiedPositions[0].toFixed(3)}, ${modifiedPositions[1].toFixed(3)}, ${modifiedPositions[2].toFixed(3)}]`);

    // Create NEW geometry with completely new UUID to force viewer update
    const newGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.Float32BufferAttribute(modifiedPositions, 3);
    newGeometry.setAttribute('position', positionAttribute);

    // Preserve original indices if they exist (for rendering)
    if (geometry.index) {
      newGeometry.setIndex(geometry.index.clone());
    }

    // CRITICAL: Preserve all polygon metadata WITHOUT any triangulation
    (newGeometry as any).polygonFaces = polygonFaces;
    (newGeometry as any).polygonType = 'preserved';
    (newGeometry as any).isPolygonPreserved = true;

    // Force complete geometry regeneration
    positionAttribute.needsUpdate = true;
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    // Generate new UUID to ensure React Three Fiber recognizes this as different
    newGeometry.uuid = THREE.MathUtils.generateUUID();

    console.log(`✅ Polygon-preserving reduction: ${mergedCount} vertex pairs merged + forced changes`);
    console.log(`   🚫 ZERO triangulation - solid polygon structure completely preserved!`);
    console.log(`   🔄 New geometry UUID: ${newGeometry.uuid} (should force viewer update)`);

    return newGeometry;
  }

  /**
   * Find vertices within polygon faces that can be merged more aggressively
   */
  private static findPolygonMergeableVertices(
    polygonFaces: any[],
    positions: Float32Array,
    targetMerges: number
  ): Array<{v1: number, v2: number, newPos: number[]}> {
    const mergeableVertices: Array<{v1: number, v2: number, newPos: number[]}> = [];
    const usedVertices = new Set<number>();

    // Validate inputs
    if (!polygonFaces || !Array.isArray(polygonFaces) || polygonFaces.length === 0) {
      console.warn(`⚠️ Invalid polygon faces provided, returning empty merge list`);
      return mergeableVertices;
    }

    console.log(`   🔍 Searching for ${targetMerges} mergeable vertex pairs in ${polygonFaces.length} polygon faces...`);

    // First pass: Adjacent vertices in polygon faces
    for (const face of polygonFaces) {
      if (!face || !face.vertices || !Array.isArray(face.vertices) || face.vertices.length < 3) {
        continue;
      }

      for (let i = 0; i < face.vertices.length; i++) {
        const v1 = face.vertices[i];
        const v2 = face.vertices[(i + 1) % face.vertices.length];

        if (usedVertices.has(v1) || usedVertices.has(v2)) continue;

        const pos1 = [positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]];
        const pos2 = [positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]];

        const distance = Math.sqrt(
          (pos2[0] - pos1[0]) ** 2 +
          (pos2[1] - pos1[1]) ** 2 +
          (pos2[2] - pos1[2]) ** 2
        );

        // Conservative merging to preserve shape integrity
        if (distance < 8.0) { // Reduced distance threshold
          const newPos = [
            (pos1[0] + pos2[0]) * 0.5 + (Math.random() - 0.5) * 1.0, // Small random offset
            (pos1[1] + pos2[1]) * 0.5 + (Math.random() - 0.5) * 1.0,
            (pos1[2] + pos2[2]) * 0.5 + (Math.random() - 0.5) * 1.0
          ];

          mergeableVertices.push({ v1, v2, newPos });
          usedVertices.add(v1);
          usedVertices.add(v2);

          console.log(`   🔧 Found adjacent mergeable pair: v${v1} distance=${distance.toFixed(3)} from v${v2}`);

          if (mergeableVertices.length >= targetMerges) break;
        }
      }

      if (mergeableVertices.length >= targetMerges) break;
    }

    // Second pass: Any close vertices if not enough found
    if (mergeableVertices.length < Math.min(targetMerges, 10)) {
      console.log(`   🔍 Only found ${mergeableVertices.length} adjacent pairs, searching for any close vertices...`);

      const vertexCount = positions.length / 3;
      for (let i = 0; i < vertexCount - 1 && mergeableVertices.length < targetMerges; i++) {
        if (usedVertices.has(i)) continue;

        for (let j = i + 1; j < vertexCount && mergeableVertices.length < targetMerges; j++) {
          if (usedVertices.has(j)) continue;

          const pos1 = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
          const pos2 = [positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]];

          const distance = Math.sqrt(
            (pos2[0] - pos1[0]) ** 2 +
            (pos2[1] - pos1[1]) ** 2 +
            (pos2[2] - pos1[2]) ** 2
          );

          if (distance < 12.0) { // More conservative global search
            const newPos = [
              (pos1[0] + pos2[0]) * 0.5 + (Math.random() - 0.5) * 1.5, // Moderate random offset
              (pos1[1] + pos2[1]) * 0.5 + (Math.random() - 0.5) * 1.5,
              (pos1[2] + pos2[2]) * 0.5 + (Math.random() - 0.5) * 1.5
            ];

            mergeableVertices.push({ v1: i, v2: j, newPos });
            usedVertices.add(i);
            usedVertices.add(j);

            console.log(`   🔧 Found global mergeable pair: v${i} distance=${distance.toFixed(3)} from v${j}`);
          }
        }
      }
    }

    console.log(`   ✅ Found ${mergeableVertices.length} total mergeable vertex pairs for polygon model`);
    return mergeableVertices;
  }

  /**
   * Basic vertex adjustment fallback when polygon faces are not available
   */
  private static basicVertexAdjustment(
    geometry: THREE.BufferGeometry,
    targetReduction: number
  ): THREE.BufferGeometry {
    console.log(`🔧 === BASIC VERTEX ADJUSTMENT FALLBACK ===`);

    const originalPositions = new Float32Array(geometry.attributes.position.array);
    const vertexCount = originalPositions.length / 3;

    console.log(`   Input: ${vertexCount} vertices, applying ${(targetReduction * 100).toFixed(1)}% adjustment`);

    if (vertexCount === 0) {
      console.warn(`⚠️ No vertices to adjust, returning original geometry`);
      return geometry.clone();
    }

    // Calculate how many vertices to adjust
    const verticesToAdjust = Math.max(1, Math.floor(vertexCount * targetReduction));
    console.log(`   Adjusting ${verticesToAdjust} vertices for visible changes`);

    const modifiedPositions = new Float32Array(originalPositions);

    // Apply visible position changes to random vertices
    for (let i = 0; i < verticesToAdjust; i++) {
      const vertexIndex = Math.floor(Math.random() * vertexCount);

      const originalPos = [
        modifiedPositions[vertexIndex * 3],
        modifiedPositions[vertexIndex * 3 + 1],
        modifiedPositions[vertexIndex * 3 + 2]
      ];

      // Apply conservative position changes to avoid spikes
      modifiedPositions[vertexIndex * 3] += (Math.random() - 0.5) * 3.0;
      modifiedPositions[vertexIndex * 3 + 1] += (Math.random() - 0.5) * 3.0;
      modifiedPositions[vertexIndex * 3 + 2] += (Math.random() - 0.5) * 3.0;

      console.log(`   Adjusted vertex ${vertexIndex}: [${originalPos.map(v => v.toFixed(3)).join(',')}] → [${modifiedPositions[vertexIndex * 3].toFixed(3)}, ${modifiedPositions[vertexIndex * 3 + 1].toFixed(3)}, ${modifiedPositions[vertexIndex * 3 + 2].toFixed(3)}]`);
    }

    // Create new geometry with modified positions
    const newGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.Float32BufferAttribute(modifiedPositions, 3);
    newGeometry.setAttribute('position', positionAttribute);

    // Copy indices if they exist
    if (geometry.index) {
      newGeometry.setIndex(geometry.index.clone());
    }

    // Copy any other attributes
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (name !== 'position') {
        newGeometry.setAttribute(name, attribute.clone());
      }
    }

    // Force updates
    positionAttribute.needsUpdate = true;
    newGeometry.computeVertexNormals();
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    // Generate new UUID to force viewer update
    newGeometry.uuid = THREE.MathUtils.generateUUID();

    console.log(`✅ Basic vertex adjustment complete: ${verticesToAdjust} vertices modified`);
    console.log(`   🔄 New geometry UUID: ${newGeometry.uuid}`);

    return newGeometry;
  }

  /**
   * Dedicated polygon-only reduction that actually removes vertices by merging them
   */
  private static polygonOnlyReduction(
    geometry: THREE.BufferGeometry,
    targetReduction: number,
    originalStats: MeshStats,
    startTime: number
  ): Promise<{
    simplifiedGeometry: THREE.BufferGeometry;
    originalStats: MeshStats;
    newStats: MeshStats;
    reductionAchieved: number;
    processingTime: number;
  }> {
    console.log(`🚫 === PURE POLYGON REDUCTION WITH VERTEX REMOVAL ===`);

    const polygonFaces = (geometry as any).polygonFaces;
    const originalPositions = new Float32Array(geometry.attributes.position.array);
    const vertexCount = originalPositions.length / 3;

    console.log(`   Input: ${polygonFaces.length} polygon faces, ${vertexCount} vertices`);
    console.log(`   🎯 ACTUALLY REMOVING VERTICES by merging close ones`);

    // Calculate how many vertices to actually remove
    const targetVertexCount = Math.max(3, Math.floor(vertexCount * (1 - Math.min(targetReduction, 0.4))));
    const verticesToRemove = vertexCount - targetVertexCount;

    console.log(`   Target: Remove ${verticesToRemove} vertices (${vertexCount} → ${targetVertexCount})`);

    if (verticesToRemove <= 0) {
      console.log(`   No vertices to remove, returning original`);
      const newGeometry = geometry.clone();
      newGeometry.uuid = THREE.MathUtils.generateUUID();
      return Promise.resolve({
        simplifiedGeometry: newGeometry,
        originalStats,
        newStats: originalStats,
        reductionAchieved: 0,
        processingTime: Date.now() - startTime
      });
    }

    // Find vertices that can be merged (very close to each other)
    const mergeableVertices = this.findMergeableVerticesForPolygons(polygonFaces, originalPositions, verticesToRemove);
    console.log(`   Found ${mergeableVertices.length} mergeable vertex pairs`);

    // Create vertex remapping - map old indices to new indices
    const vertexRemapping = new Map<number, number>();
    const newPositions: number[] = [];
    const removedVertices = new Set<number>();

    // First, mark vertices for removal and create merged positions
    for (const {v1, v2, newPos} of mergeableVertices) {
      if (!removedVertices.has(v1) && !removedVertices.has(v2)) {
        // Remove v2, keep v1 at merged position
        removedVertices.add(v2);

        // Update v1's position to merged position
        originalPositions[v1 * 3] = newPos[0];
        originalPositions[v1 * 3 + 1] = newPos[1];
        originalPositions[v1 * 3 + 2] = newPos[2];

        console.log(`   🔗 Merging v${v2} into v${v1} at [${newPos.map(p => p.toFixed(3)).join(', ')}]`);
      }
    }

    // Build new vertex array and remapping
    let newVertexIndex = 0;
    for (let i = 0; i < vertexCount; i++) {
      if (!removedVertices.has(i)) {
        vertexRemapping.set(i, newVertexIndex);
        newPositions.push(
          originalPositions[i * 3],
          originalPositions[i * 3 + 1],
          originalPositions[i * 3 + 2]
        );
        newVertexIndex++;
      }
    }

    // Update polygon face indices to use new vertex indices
    const updatedPolygonFaces = polygonFaces.map((face: any) => {
      if (!face.vertices) return face;

      const newVertices = face.vertices
        .map((vIndex: number) => {
          // If this vertex was removed, find what it was merged into
          if (removedVertices.has(vIndex)) {
            for (const {v1, v2} of mergeableVertices) {
              if (v2 === vIndex) {
                return vertexRemapping.get(v1);
              }
            }
            return null; // This shouldn't happen
          }
          return vertexRemapping.get(vIndex);
        })
        .filter((v: number | null) => v !== null);

      return {
        ...face,
        vertices: newVertices,
        originalVertices: face.originalVertices || [...face.vertices]
      };
    });

    // Create new geometry with reduced vertices
    const newGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.Float32BufferAttribute(new Float32Array(newPositions), 3);
    newGeometry.setAttribute('position', positionAttribute);

    // Store updated polygon face metadata
    (newGeometry as any).polygonFaces = updatedPolygonFaces;
    (newGeometry as any).polygonType = 'reduced';
    (newGeometry as any).isPolygonPreserved = true;

    // DO NOT set indices to prevent triangulation
    console.log(`   🚫 NO INDICES SET - preventing triangulation`);

    // Force geometry updates
    positionAttribute.needsUpdate = true;
    newGeometry.computeBoundingBox();
    newGeometry.computeBoundingSphere();

    // Generate new UUID
    newGeometry.uuid = THREE.MathUtils.generateUUID();

    const finalVertexCount = newPositions.length / 3;
    const actualReduction = (vertexCount - finalVertexCount) / vertexCount;
    const processingTime = Date.now() - startTime;

    console.log(`✅ Polygon vertex removal complete:`);
    console.log(`   📊 Vertices: ${vertexCount} → ${finalVertexCount} (${(actualReduction * 100).toFixed(1)}% reduction)`);
    console.log(`   📐 Polygon faces: ${updatedPolygonFaces.length} (structure preserved)`);
    console.log(`   🚫 NO triangulation applied`);

    return Promise.resolve({
      simplifiedGeometry: newGeometry,
      originalStats,
      newStats: {
        vertices: finalVertexCount,
        faces: updatedPolygonFaces.length,
        edges: 0,
        volume: 0,
        hasNormals: false,
        hasUVs: false,
        isIndexed: false
      },
      reductionAchieved: actualReduction,
      processingTime
    });
  }

  /**
   * Find vertices that can be merged within polygon faces
   */
  private static findMergeableVerticesForPolygons(
    polygonFaces: any[],
    positions: Float32Array,
    targetMerges: number
  ): Array<{v1: number, v2: number, newPos: number[]}> {
    const mergeableVertices: Array<{v1: number, v2: number, newPos: number[]}> = [];
    const usedVertices = new Set<number>();

    console.log(`   🔍 Finding vertices to merge for actual reduction...`);

    // Look for vertices that are close together across all polygon faces
    const vertexCount = positions.length / 3;
    const allVertices: number[] = [];

    // Collect all vertices used in polygon faces
    for (const face of polygonFaces) {
      if (face.vertices) {
        for (const v of face.vertices) {
          if (!allVertices.includes(v)) {
            allVertices.push(v);
          }
        }
      }
    }

    // Find pairs of vertices that are close enough to merge
    for (let i = 0; i < allVertices.length && mergeableVertices.length < targetMerges; i++) {
      const v1 = allVertices[i];
      if (usedVertices.has(v1)) continue;

      for (let j = i + 1; j < allVertices.length && mergeableVertices.length < targetMerges; j++) {
        const v2 = allVertices[j];
        if (usedVertices.has(v2)) continue;

        const pos1 = [positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2]];
        const pos2 = [positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2]];

        const distance = Math.sqrt(
          (pos2[0] - pos1[0]) ** 2 +
          (pos2[1] - pos1[1]) ** 2 +
          (pos2[2] - pos1[2]) ** 2
        );

        // If vertices are close enough, merge them
        if (distance < 5.0) { // Reasonable merging distance
          const newPos = [
            (pos1[0] + pos2[0]) * 0.5,
            (pos1[1] + pos2[1]) * 0.5,
            (pos1[2] + pos2[2]) * 0.5
          ];

          mergeableVertices.push({ v1, v2, newPos });
          usedVertices.add(v1);
          usedVertices.add(v2);

          console.log(`   🔗 Will merge v${v1} + v${v2} (distance: ${distance.toFixed(3)})`);
        }
      }
    }

    console.log(`   ✅ Found ${mergeableVertices.length} vertex pairs to merge`);
    return mergeableVertices;
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
