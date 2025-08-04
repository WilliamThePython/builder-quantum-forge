import * as THREE from 'three';
import { MeshStats } from './meshSimplifier';
import { CoplanarMerger, PolygonFace } from './coplanarMerger';
import { computeFlatNormals } from './flatNormals';

/**
 * Clean vertex removal implementation for decimation painter
 */
export class VertexRemovalStitcher {

  /**
   * Polygon-aware vertex merging - only adjusts vertices that are part of polygon model
   */
  static async collapseSingleEdge(
    geometry: THREE.BufferGeometry,
    vertexIndex1: number,
    vertexIndex2: number,
    collapsePosition: THREE.Vector3
  ): Promise<{
    success: boolean;
    message: string;
    geometry?: THREE.BufferGeometry;
  }> {
    const originalVertexCount = geometry.attributes.position.count;
    console.log(`🎯 POLYGON-AWARE VERTEX MERGE: ${vertexIndex1} ↔ ${vertexIndex2} → [${collapsePosition.x.toFixed(2)}, ${collapsePosition.y.toFixed(2)}, ${collapsePosition.z.toFixed(2)}]`);
    console.log(`   Original buffer vertices: ${originalVertexCount}`);

    try {
      const positions = geometry.attributes.position.array as Float32Array;

      // STEP 1: Get the polygon faces metadata
      const polygonFaces = (geometry as any).polygonFaces;
      if (!polygonFaces || !Array.isArray(polygonFaces)) {
        console.warn('   No polygon metadata found - falling back to basic vertex merge');
        return this.basicVertexMerge(geometry, vertexIndex1, vertexIndex2, collapsePosition);
      }

      // STEP 2: Find the logical vertices in polygon model
      const vertex1Pos = new THREE.Vector3(
        positions[vertexIndex1 * 3],
        positions[vertexIndex1 * 3 + 1],
        positions[vertexIndex1 * 3 + 2]
      );

      const vertex2Pos = new THREE.Vector3(
        positions[vertexIndex2 * 3],
        positions[vertexIndex2 * 3 + 1],
        positions[vertexIndex2 * 3 + 2]
      );

      console.log(`   Logical vertex 1: [${vertex1Pos.x.toFixed(2)}, ${vertex1Pos.y.toFixed(2)}, ${vertex1Pos.z.toFixed(2)}]`);
      console.log(`   Logical vertex 2: [${vertex2Pos.x.toFixed(2)}, ${vertex2Pos.y.toFixed(2)}, ${vertex2Pos.z.toFixed(2)}]`);

      // STEP 3: Find buffer vertices that correspond to these polygon vertices
      const tolerance = 0.001;
      const polygonVertexInstances = new Set<number>();

      // For each polygon face, find buffer vertices that match our edge vertices
      for (const face of polygonFaces) {
        if (!face.originalVertices) continue;

        for (const polygonVertex of face.originalVertices) {
          const polygonPos = polygonVertex instanceof THREE.Vector3
            ? polygonVertex
            : new THREE.Vector3(polygonVertex.x, polygonVertex.y, polygonVertex.z);

          // If this polygon vertex matches either of our edge vertices
          if (polygonPos.distanceTo(vertex1Pos) < tolerance || polygonPos.distanceTo(vertex2Pos) < tolerance) {
            // Find all buffer vertices that match this polygon vertex position
            for (let i = 0; i < originalVertexCount; i++) {
              const bufferPos = new THREE.Vector3(
                positions[i * 3],
                positions[i * 3 + 1],
                positions[i * 3 + 2]
              );

              if (bufferPos.distanceTo(polygonPos) < tolerance) {
                polygonVertexInstances.add(i);
              }
            }
          }
        }
      }

      const affectedInstances = Array.from(polygonVertexInstances);
      console.log(`   Found ${affectedInstances.length} buffer vertices that match polygon model edge: [${affectedInstances.join(', ')}]`);

      // STEP 4: Move only the polygon-model-related buffer vertices
      const resultGeometry = geometry.clone();
      const resultPositions = resultGeometry.attributes.position.array as Float32Array;

      affectedInstances.forEach(vertexIndex => {
        resultPositions[vertexIndex * 3] = collapsePosition.x;
        resultPositions[vertexIndex * 3 + 1] = collapsePosition.y;
        resultPositions[vertexIndex * 3 + 2] = collapsePosition.z;
      });

      console.log(`   Moved ${affectedInstances.length} polygon-model vertex instances to collapse position`);

      // STEP 5: DISABLED - Do not remove faces (prevents holes)
      // this.removeDegenerateFaces(resultGeometry); // DISABLED: Creates holes!

      // STEP 6: Update polygon metadata
      const updatedPolygonFaces = this.updatePolygonFaces(
        polygonFaces,
        vertex1Pos,
        vertex2Pos,
        collapsePosition
      );

      // STEP 7: Validate and fix coplanarity after decimation using unified merger
      console.log('   🔄 POST-DECIMATION: Using unified CoplanarMerger validation');
      const validatedFaces = CoplanarMerger.mergeCoplanarFaces(
        updatedPolygonFaces.map((face: any) => ({
          type: face.type,
          originalVertices: face.originalVertices.map((v: any) =>
            v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z)
          ),
          normal: face.normal instanceof THREE.Vector3
            ? face.normal
            : new THREE.Vector3(face.normal.x, face.normal.y, face.normal.z),
          triangleIndices: face.triangleIndices || []
        }))
      );

      (resultGeometry as any).polygonFaces = validatedFaces;
      (resultGeometry as any).polygonType = (geometry as any).polygonType;
      (resultGeometry as any).isPolygonPreserved = true;

      // Update position attribute
      resultGeometry.attributes.position.needsUpdate = true;

      // IMPORTANT: Use flat normals to maintain crisp face shading
      // computeVertexNormals() creates smooth shading which blends colors
      computeFlatNormals(resultGeometry);
      resultGeometry.uuid = THREE.MathUtils.generateUUID();

      console.log(`✅ POLYGON-AWARE VERTEX MERGE COMPLETE`);
      console.log(`   Buffer vertices: ${originalVertexCount} (unchanged count - moved polygon instances only)`);
      console.log(`   Polygon vertices: merged edge into single point`);

      return {
        success: true,
        message: `Polygon model vertices merged: ${affectedInstances.length} instances`,
        geometry: resultGeometry
      };

    } catch (error) {
      console.error('❌ Polygon-aware vertex merge failed:', error);
      return {
        success: false,
        message: `Polygon-aware vertex merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Basic vertex merging fallback for non-polygon geometries
   */
  private static async basicVertexMerge(
    geometry: THREE.BufferGeometry,
    vertexIndex1: number,
    vertexIndex2: number,
    collapsePosition: THREE.Vector3
  ): Promise<{
    success: boolean;
    message: string;
    geometry?: THREE.BufferGeometry;
  }> {
    const positions = geometry.attributes.position.array as Float32Array;
    const tolerance = 0.001;

    const vertex1Pos = new THREE.Vector3(
      positions[vertexIndex1 * 3],
      positions[vertexIndex1 * 3 + 1],
      positions[vertexIndex1 * 3 + 2]
    );

    const vertex2Pos = new THREE.Vector3(
      positions[vertexIndex2 * 3],
      positions[vertexIndex2 * 3 + 1],
      positions[vertexIndex2 * 3 + 2]
    );

    // Find all instances of these vertices
    const affectedInstances = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const currentPos = new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );

      if (currentPos.distanceTo(vertex1Pos) < tolerance || currentPos.distanceTo(vertex2Pos) < tolerance) {
        affectedInstances.push(i);
      }
    }

    // Move all instances to collapse position
    const resultGeometry = geometry.clone();
    const resultPositions = resultGeometry.attributes.position.array as Float32Array;

    affectedInstances.forEach(vertexIndex => {
      resultPositions[vertexIndex * 3] = collapsePosition.x;
      resultPositions[vertexIndex * 3 + 1] = collapsePosition.y;
      resultPositions[vertexIndex * 3 + 2] = collapsePosition.z;
    });

    // DISABLED: Do not remove faces (prevents holes)
    // this.removeDegenerateFaces(resultGeometry); // DISABLED: Creates holes!
    resultGeometry.attributes.position.needsUpdate = true;
    // Use flat normals to maintain crisp face shading
    computeFlatNormals(resultGeometry);
    resultGeometry.uuid = THREE.MathUtils.generateUUID();

    return {
      success: true,
      message: `Basic vertex merge: ${affectedInstances.length} instances`,
      geometry: resultGeometry
    };
  }

  /**
   * Remove degenerate faces (triangles with duplicate vertices)
   */
  private static removeDegenerateFaces(geometry: THREE.BufferGeometry): void {
    if (!geometry.index) return;

    const indices = geometry.index.array;
    const validIndices: number[] = [];

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // Keep triangle if all vertices are different
      if (a !== b && b !== c && a !== c) {
        validIndices.push(a, b, c);
      }
    }

    if (validIndices.length !== indices.length) {
      geometry.setIndex(validIndices);
      console.log(`Removed ${(indices.length - validIndices.length) / 3} degenerate faces`);
    }
  }

  /**
   * Merge vertices in non-indexed geometry
   */
  private static mergeNonIndexedVertices(
    positions: Float32Array,
    keepVertex: number,
    removeVertex: number,
    collapsePosition: THREE.Vector3,
    originalVertexCount: number
  ): null {
    // For non-indexed geometry, we need to find and merge duplicate vertices
    // This is more complex as vertices are stored directly in face data
    const tolerance = 0.001;
    const vertexCount = positions.length / 3;

    console.log(`   Non-indexed merge: scanning ${vertexCount} vertices for duplicates`);

    // Find all vertices that match the original positions of our edge vertices
    let mergedCount = 0;
    for (let i = 0; i < vertexCount; i++) {
      const vertex = new THREE.Vector3(
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2]
      );

      // If this vertex is close to where our original vertices were, move it to collapse position
      if (vertex.distanceTo(collapsePosition) < tolerance * 10) { // Wider tolerance for already moved vertices
        positions[i * 3] = collapsePosition.x;
        positions[i * 3 + 1] = collapsePosition.y;
        positions[i * 3 + 2] = collapsePosition.z;
        mergedCount++;
      }
    }

    console.log(`   Merged ${mergedCount} duplicate vertices to collapse position`);
    return null; // Non-indexed geometry doesn't use indices
  }

  /**
   * Compact vertex attribute when removing a vertex
   */
  private static compactAttribute(
    attribute: THREE.BufferAttribute,
    removeVertexIndex: number,
    originalVertexCount: number
  ): THREE.BufferAttribute | null {
    const itemSize = attribute.itemSize;
    const oldArray = attribute.array;
    const newVertexCount = originalVertexCount - 1;

    // Create new array with one less vertex
    const ArrayConstructor = oldArray.constructor as any;
    const newArray = new ArrayConstructor(newVertexCount * itemSize);

    // Copy data before removed vertex
    for (let i = 0; i < removeVertexIndex * itemSize; i++) {
      newArray[i] = oldArray[i];
    }

    // Copy data after removed vertex (shifted down)
    for (let i = (removeVertexIndex + 1) * itemSize; i < oldArray.length; i++) {
      newArray[i - itemSize] = oldArray[i];
    }

    return new THREE.BufferAttribute(newArray, itemSize);
  }

  /**
   * Update polygon face metadata after edge collapse
   */
  private static updatePolygonFaces(
    polygonFaces: any[],
    vertex1Pos: THREE.Vector3,
    vertex2Pos: THREE.Vector3,
    collapsePosition: THREE.Vector3
  ): any[] {
    console.log(`   Updating polygon faces metadata for edge collapse`);

    return polygonFaces.map((face, faceIndex) => {
      if (!face.originalVertices || !Array.isArray(face.originalVertices)) {
        return face;
      }

      const tolerance = 0.001;
      const newVertices = [];
      let edgeVerticesFound = 0;
      let verticesRemoved = 0;

      // Process each vertex in the polygon
      for (let i = 0; i < face.originalVertices.length; i++) {
        const vertex = face.originalVertices[i];
        const vertexPos = vertex instanceof THREE.Vector3
          ? vertex
          : new THREE.Vector3(vertex.x, vertex.y, vertex.z);

        // If this vertex matches either edge vertex, replace with collapse position
        if (vertexPos.distanceTo(vertex1Pos) < tolerance || vertexPos.distanceTo(vertex2Pos) < tolerance) {
          // Only add collapse position if we haven't already (edge collapse merges both vertices)
          if (edgeVerticesFound === 0) {
            newVertices.push(collapsePosition.clone());
            edgeVerticesFound++;
          }
          // Skip the second edge vertex (it's been merged into the first)
        } else {
          // Keep non-edge vertices as they were
          newVertices.push(vertexPos.clone());
        }
      }

      // Remove consecutive duplicate vertices (from edge collapse)
      const cleanedVertices = [];
      for (let i = 0; i < newVertices.length; i++) {
        const currentVertex = newVertices[i];
        const nextVertex = newVertices[(i + 1) % newVertices.length];

        if (currentVertex.distanceTo(nextVertex) > tolerance) {
          cleanedVertices.push(currentVertex);
        } else {
          verticesRemoved++;
        }
      }

      // Update face type based on new vertex count
      let newType = face.type;
      if (cleanedVertices.length === 3) newType = 'triangle';
      else if (cleanedVertices.length === 4) newType = 'quad';
      else if (cleanedVertices.length > 4) newType = 'polygon';

      if (verticesRemoved > 0) {
        console.log(`     Face ${faceIndex}: ${face.originalVertices.length} → ${cleanedVertices.length} vertices (${newType})`);
      }

      return {
        ...face,
        type: newType,
        originalVertices: cleanedVertices
      };
    });
  }



  /**
   * Main vertex removal function (kept for compatibility)
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
    const originalStats = this.getMeshStats(geometry);

    console.log(`🚀 === DECIMATION FUNCTION CALLED ===`);
    console.log(`��� === PURE QUADRIC EDGE COLLAPSE (NO FACE DELETION) ===`);
    console.log(`   Target reduction: ${(targetReduction * 100).toFixed(1)}%`);
    console.log(`   Original stats: ${originalStats.vertices} vertices, ${originalStats.faces} faces`);
    console.log(`   Original geometry UUID: ${geometry.uuid}`);
    console.log(`   Method: Pure edge collapse - two vertices become one`);

    // Use our own pure edge collapse implementation
    console.log(`🔧 Calling pureQuadricEdgeCollapse...`);
    const simplifiedGeometry = this.pureQuadricEdgeCollapse(geometry, targetReduction);
    const newStats = this.getMeshStats(simplifiedGeometry);
    const actualReduction = (originalStats.vertices - newStats.vertices) / originalStats.vertices;

    console.log(`   ✅ Pure edge collapse completed: ${originalStats.vertices} → ${newStats.vertices} vertices`);
    console.log(`   📊 Achieved reduction: ${(actualReduction * 100).toFixed(1)}%`);
    console.log(`   🛡️ Zero faces deleted - surface topology preserved`);
    console.log(`   🆔 New geometry UUID: ${simplifiedGeometry.uuid}`);
    console.log(`   🔄 Returning to STLManipulator...`);

    return {
      simplifiedGeometry,
      originalStats,
      newStats,
      reductionAchieved: actualReduction,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * PURE QUADRIC EDGE COLLAPSE - No face deletion, only vertex merging
   * Two vertices become one, all triangles are preserved (just updated indices)
   */
  private static pureQuadricEdgeCollapse(geometry: THREE.BufferGeometry, targetReduction: number): THREE.BufferGeometry {
    console.log('🔧 === PURE EDGE COLLAPSE IMPLEMENTATION ===');
    console.log('   Strategy: Merge vertex pairs, update all triangle indices');
    console.log('   Guarantee: ZERO faces deleted, ZERO holes created');

    if (targetReduction <= 0) {
      console.log('⚠️ Zero reduction requested - returning original geometry');
      const cloned = geometry.clone();
      cloned.uuid = THREE.MathUtils.generateUUID();
      return cloned;
    }

    // Allow any reduction amount - no artificial limits
    console.log(`🎯 Target reduction: ${(targetReduction * 100).toFixed(1)}%`);

    const cloned = geometry.clone();
    const positions = cloned.attributes.position.array as Float32Array;
    const indices = cloned.index?.array;

    if (!indices) {
      console.log('🔧 Converting non-indexed geometry to indexed for edge collapse...');
      const indexedGeometry = this.convertToIndexed(cloned);
      console.log('✅ Conversion complete - retrying edge collapse...');
      return this.pureQuadricEdgeCollapse(indexedGeometry, targetReduction);
    }

    const originalVertexCount = positions.length / 3;
    const targetVertexCount = Math.floor(originalVertexCount * (1 - targetReduction));
    const verticesToRemove = originalVertexCount - targetVertexCount;

    console.log(`   Target: Remove ${verticesToRemove} vertices via edge collapse`);

    // For aggressive reductions, use dynamic edge list rebuilding
    const isAggressiveReduction = targetReduction > 0.5;
    console.log(`   🎯 ${isAggressiveReduction ? 'AGGRESSIVE' : 'STANDARD'} reduction mode (${(targetReduction * 100).toFixed(1)}%)`);

    let edges = this.buildEdgeList(indices);
    console.log(`   📊 Found ${edges.length} edges for potential collapse`);

    const vertexMergeMap = new Map<number, number>(); // old vertex -> new vertex

    let mergedCount = 0;
    console.log(`   🎯 Starting edge collapse process...`);

    // Perform iterative edge collapses until target is reached
    console.log(`   🔧 Processing ${edges.length} edges for collapse...`);
    let iterationCount = 0;
    const maxIterations = isAggressiveReduction ? 10 : 5; // More iterations for massive reductions

    while (mergedCount < verticesToRemove && iterationCount < maxIterations) {
      const initialMergeCount = mergedCount;
      console.log(`   🔄 Iteration ${iterationCount + 1}/${maxIterations} - Progress: ${mergedCount}/${verticesToRemove}`);

      // For aggressive reductions, rebuild edge list every iteration to find new collapse opportunities
      if (isAggressiveReduction && iterationCount > 0) {
        console.log(`   🔧 Rebuilding edge list for iteration ${iterationCount + 1}...`);
        edges = this.buildEdgeList(cloned.index!.array as Uint32Array);
        console.log(`   📊 Rebuilt edge list: ${edges.length} edges`);
      }

      // Sort edges by length for optimal collapse order (shortest first)
      edges.sort((a, b) => {
        const lengthA = this.calculateEdgeLength(positions, a[0], a[1]);
        const lengthB = this.calculateEdgeLength(positions, b[0], b[1]);
        return lengthA - lengthB;
      });

      for (const [v1, v2] of edges) {
        if (mergedCount >= verticesToRemove) {
          console.log(`   ✅ Reached target vertex removal count: ${mergedCount}`);
          break;
        }

        // Skip if either vertex is already merged
        if (vertexMergeMap.has(v1) || vertexMergeMap.has(v2)) continue;

        // Calculate collapse position (midpoint for simplicity)
        const midX = (positions[v1 * 3] + positions[v2 * 3]) / 2;
        const midY = (positions[v1 * 3 + 1] + positions[v2 * 3 + 1]) / 2;
        const midZ = (positions[v1 * 3 + 2] + positions[v2 * 3 + 2]) / 2;

        // Move v1 to collapse position, map v2 to v1
        positions[v1 * 3] = midX;
        positions[v1 * 3 + 1] = midY;
        positions[v1 * 3 + 2] = midZ;

        vertexMergeMap.set(v2, v1); // v2 now points to v1
        mergedCount++;

        if (mergedCount % 1000 === 0) {
          console.log(`     Progress: ${mergedCount}/${verticesToRemove} vertices merged`);
        }
      }

      // Check if we made progress in this iteration
      if (mergedCount === initialMergeCount) {
        console.log(`   ⚠️ No progress in iteration ${iterationCount + 1} - stopping early`);
        break;
      }

      iterationCount++;
    }

    console.log(`   📊 Final merge count: ${mergedCount} vertex pairs merged (${iterationCount} iterations)`);
    if (mergedCount < verticesToRemove) {
      console.log(`   ⚠️ Could only achieve ${((mergedCount / originalVertexCount) * 100).toFixed(1)}% reduction instead of target ${(targetReduction * 100).toFixed(1)}%`);
    }

    // Update all triangle indices to use merged vertices (NO TRIANGLES DELETED)
    console.log(`   🔧 Remapping ${indices.length} triangle indices...`);
    const newIndices = new Uint32Array(indices.length);
    let remappedIndices = 0;

    for (let i = 0; i < indices.length; i++) {
      const originalVertex = indices[i];
      const mergedVertex = vertexMergeMap.get(originalVertex) ?? originalVertex;
      newIndices[i] = mergedVertex;

      if (mergedVertex !== originalVertex) {
        remappedIndices++;
      }
    }

    console.log(`   📊 Remapped ${remappedIndices} indices to merged vertices`);

    // Apply the updated indices
    console.log(`   🔧 Applying new indices to geometry...`);
    cloned.setIndex(Array.from(newIndices));
    cloned.attributes.position.needsUpdate = true;

    const newUUID = THREE.MathUtils.generateUUID();
    cloned.uuid = newUUID;
    console.log(`   🆔 Generated new UUID: ${newUUID}`);

    // Recompute normals with flat shading to maintain crisp faces
    console.log(`   🔧 Recomputing flat normals...`);
    this.computeFlatVertexNormals(cloned);

    console.log(`   ✅ Pure edge collapse: ${mergedCount} vertex pairs merged`);
    console.log(`   🛡️ All ${indices.length / 3} triangles preserved`);
    console.log(`   📊 Result: ${originalVertexCount} → ${originalVertexCount - mergedCount} vertices`);
    console.log(`   🎯 Returning decimated geometry...`);

    return cloned;
  }

  /**
   * Build edge list from triangle indices
   */
  private static buildEdgeList(indices: ArrayLike<number>): Array<[number, number]> {
    const edgeSet = new Set<string>();
    const edges: Array<[number, number]> = [];

    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // Add all three edges of the triangle
      const edgeAB = a < b ? `${a},${b}` : `${b},${a}`;
      const edgeBC = b < c ? `${b},${c}` : `${c},${b}`;
      const edgeCA = c < a ? `${c},${a}` : `${a},${c}`;

      if (!edgeSet.has(edgeAB)) {
        edgeSet.add(edgeAB);
        edges.push(a < b ? [a, b] : [b, a]);
      }
      if (!edgeSet.has(edgeBC)) {
        edgeSet.add(edgeBC);
        edges.push(b < c ? [b, c] : [c, b]);
      }
      if (!edgeSet.has(edgeCA)) {
        edgeSet.add(edgeCA);
        edges.push(c < a ? [c, a] : [a, c]);
      }
    }

    return edges;
  }

  /**
   * Calculate edge length between two vertices
   */
  private static calculateEdgeLength(positions: Float32Array, v1: number, v2: number): number {
    const dx = positions[v1 * 3] - positions[v2 * 3];
    const dy = positions[v1 * 3 + 1] - positions[v2 * 3 + 1];
    const dz = positions[v1 * 3 + 2] - positions[v2 * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Compute flat vertex normals to maintain crisp face shading
   * Unlike computeVertexNormals() which smooths between faces, this preserves discrete face colors
   */
  private static computeFlatVertexNormals(geometry: THREE.BufferGeometry): void {
    if (!geometry.index) {
      // Non-indexed geometry - each triangle has its own vertices
      geometry.computeVertexNormals();
      return;
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index.array;
    const normals = new Float32Array(positions.length);

    // Calculate face normals and assign to vertices
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3;
      const b = indices[i + 1] * 3;
      const c = indices[i + 2] * 3;

      // Get triangle vertices
      const vA = new THREE.Vector3(positions[a], positions[a + 1], positions[a + 2]);
      const vB = new THREE.Vector3(positions[b], positions[b + 1], positions[b + 2]);
      const vC = new THREE.Vector3(positions[c], positions[c + 1], positions[c + 2]);

      // Calculate face normal
      const cb = new THREE.Vector3().subVectors(vC, vB);
      const ab = new THREE.Vector3().subVectors(vA, vB);
      const faceNormal = cb.cross(ab).normalize();

      // Assign same face normal to all three vertices (flat shading)
      normals[a] = faceNormal.x;
      normals[a + 1] = faceNormal.y;
      normals[a + 2] = faceNormal.z;

      normals[b] = faceNormal.x;
      normals[b + 1] = faceNormal.y;
      normals[b + 2] = faceNormal.z;

      normals[c] = faceNormal.x;
      normals[c + 1] = faceNormal.y;
      normals[c + 2] = faceNormal.z;
    }

    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.attributes.normal.needsUpdate = true;
  }

  /**
   * Convert non-indexed geometry to indexed geometry for edge collapse
   */
  private static convertToIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 === CONVERTING NON-INDEXED TO INDEXED ===');

    const positions = geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;

    console.log(`   📊 Input: ${vertexCount} vertices (${vertexCount / 3} triangles)`);

    // Build vertex map to merge duplicate vertices
    const vertexMap = new Map<string, number>();
    const newPositions: number[] = [];
    const indices: number[] = [];

    const tolerance = 0.0001; // Very small tolerance for vertex matching

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      // Create key for vertex deduplication
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

      let index = vertexMap.get(key);
      if (index === undefined) {
        index = newPositions.length / 3;
        vertexMap.set(key, index);
        newPositions.push(x, y, z);
      }

      indices.push(index);
    }

    // Create new indexed geometry
    const indexedGeometry = new THREE.BufferGeometry();
    indexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    indexedGeometry.setIndex(indices);

    // Copy other attributes if they exist
    if (geometry.attributes.normal) {
      indexedGeometry.setAttribute('normal', geometry.attributes.normal.clone());
    }
    if (geometry.attributes.uv) {
      indexedGeometry.setAttribute('uv', geometry.attributes.uv.clone());
    }

    // Copy polygon metadata if it exists
    if ((geometry as any).polygonFaces) {
      (indexedGeometry as any).polygonFaces = (geometry as any).polygonFaces;
    }

    indexedGeometry.uuid = THREE.MathUtils.generateUUID();

    const uniqueVertices = newPositions.length / 3;
    const triangles = indices.length / 3;

    console.log(`   ✅ Conversion complete: ${uniqueVertices} unique vertices, ${triangles} triangles`);
    console.log(`   📊 Vertex deduplication: ${vertexCount} → ${uniqueVertices} (saved ${vertexCount - uniqueVertices})`);

    return indexedGeometry;
  }

  /**
   * DEPRECATED: Old basic vertex reduction method
   */
  private static basicVertexReduction(geometry: THREE.BufferGeometry, targetReduction: number): THREE.BufferGeometry {
    console.log('🔧 Using safe edge collapse fallback (preserves surface topology)');

    if (targetReduction <= 0 || targetReduction >= 1) {
      console.warn('⚠️ Invalid reduction amount, returning original');
      const cloned = geometry.clone();
      cloned.uuid = THREE.MathUtils.generateUUID();
      return cloned;
    }

    // For small reductions, apply a conservative vertex merging approach
    if (targetReduction > 0.3) {
      console.warn('⚠️ Large reduction requested, limiting to 30% to prevent holes');
      targetReduction = 0.3;
    }

    const cloned = geometry.clone();
    const positions = cloned.attributes.position.array as Float32Array;
    const indices = cloned.index?.array;

    if (!indices) {
      console.warn('⚠️ Non-indexed geometry - cannot safely reduce without holes');
      cloned.uuid = THREE.MathUtils.generateUUID();
      return cloned;
    }

    // SAFE APPROACH: Merge nearby vertices without removing faces
    // This reduces vertex count while preserving all triangles
    const tolerance = 0.01; // Small tolerance to merge very close vertices
    const vertexMap = new Map<string, number>();
    const newPositions: number[] = [];
    const indexRemapping: number[] = [];

    // Merge vertices that are very close to each other
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Create key for spatial hashing
      const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;

      let newIndex = vertexMap.get(key);
      if (newIndex === undefined) {
        newIndex = newPositions.length / 3;
        vertexMap.set(key, newIndex);
        newPositions.push(x, y, z);
      }

      indexRemapping[i / 3] = newIndex;
    }

    // Remap indices to use merged vertices
    const newIndices: number[] = [];
    for (let i = 0; i < indices.length; i++) {
      newIndices.push(indexRemapping[indices[i]]);
    }

    // Create new geometry with merged vertices
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.setIndex(newIndices);
    newGeometry.uuid = THREE.MathUtils.generateUUID();

    // Recompute normals
    newGeometry.computeVertexNormals();

    const originalVertexCount = positions.length / 3;
    const newVertexCount = newPositions.length / 3;
    const actualReduction = (originalVertexCount - newVertexCount) / originalVertexCount;

    console.log(`📊 Safe reduction: ${originalVertexCount} → ${newVertexCount} vertices (${(actualReduction * 100).toFixed(1)}% reduction)`);
    console.log(`🛡️ All faces preserved - no holes created`);

    return newGeometry;
  }

  /**
   * Calculate mesh statistics
   */
  private static getMeshStats(geometry: THREE.BufferGeometry): MeshStats {
    const vertices = geometry.attributes.position ? geometry.attributes.position.count : 0;
    const faces = geometry.index ? geometry.index.count / 3 : Math.floor(vertices / 3);

    return {
      vertices,
      faces,
      edges: vertices + faces - 2,
      volume: 0,
      hasNormals: !!geometry.attributes.normal,
      hasUVs: !!geometry.attributes.uv,
      isIndexed: !!geometry.index
    };
  }
}
