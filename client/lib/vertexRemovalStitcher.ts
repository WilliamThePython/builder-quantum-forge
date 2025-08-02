import * as THREE from 'three';
import { MeshStats } from './meshSimplifier';

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

      // STEP 5: Remove degenerate faces (faces with duplicate vertices)
      this.removeDegenerateFaces(resultGeometry);

      // STEP 6: Update polygon metadata
      (resultGeometry as any).polygonFaces = this.updatePolygonFaces(
        polygonFaces,
        vertex1Pos,
        vertex2Pos,
        collapsePosition
      );
      (resultGeometry as any).polygonType = (geometry as any).polygonType;
      (resultGeometry as any).isPolygonPreserved = true;

      // Update position attribute
      resultGeometry.attributes.position.needsUpdate = true;

      // Recompute normals and refresh
      resultGeometry.computeVertexNormals();
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

    this.removeDegenerateFaces(resultGeometry);
    resultGeometry.attributes.position.needsUpdate = true;
    resultGeometry.computeVertexNormals();
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
    keepVertex: number,
    removeVertex: number,
    collapsePosition: THREE.Vector3
  ): any[] {
    console.log(`   Updating polygon faces for vertex removal: ${removeVertex} → ${keepVertex}`);

    return polygonFaces.map((face, faceIndex) => {
      if (!face.originalVertices || !Array.isArray(face.originalVertices)) {
        return face;
      }

      const tolerance = 0.001;
      const newVertices = [];
      let verticesRemoved = 0;

      // Process each vertex in the polygon
      for (let i = 0; i < face.originalVertices.length; i++) {
        const vertex = face.originalVertices[i];

        // Check if this vertex should be merged to collapse position
        // This is a simplified approach for polygon metadata
        newVertices.push(vertex.clone());
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

    // For single edge collapse via painter, just return original
    // This method is primarily used by bulk decimation
    return {
      simplifiedGeometry: geometry.clone(),
      originalStats,
      newStats: originalStats,
      reductionAchieved: 0,
      processingTime: Date.now() - startTime
    };
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
