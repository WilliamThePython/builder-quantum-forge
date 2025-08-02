import * as THREE from 'three';
import { MeshStats } from './meshSimplifier';

/**
 * Clean vertex removal implementation for decimation painter
 */
export class VertexRemovalStitcher {

  /**
   * Logical vertex merging - finds all instances of edge vertices and merges them
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
    console.log(`🎯 LOGICAL VERTEX MERGE: ${vertexIndex1} ↔ ${vertexIndex2} → [${collapsePosition.x.toFixed(2)}, ${collapsePosition.y.toFixed(2)}, ${collapsePosition.z.toFixed(2)}]`);
    console.log(`   Original buffer vertices: ${originalVertexCount}`);

    try {
      const positions = geometry.attributes.position.array as Float32Array;

      // STEP 1: Find all instances of the two logical vertices
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

      // Find ALL instances of these logical vertices
      const tolerance = 0.001;
      const vertex1Instances = [];
      const vertex2Instances = [];

      for (let i = 0; i < originalVertexCount; i++) {
        const currentPos = new THREE.Vector3(
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2]
        );

        if (currentPos.distanceTo(vertex1Pos) < tolerance) {
          vertex1Instances.push(i);
        } else if (currentPos.distanceTo(vertex2Pos) < tolerance) {
          vertex2Instances.push(i);
        }
      }

      console.log(`   Found ${vertex1Instances.length} instances of logical vertex 1: [${vertex1Instances.join(', ')}]`);
      console.log(`   Found ${vertex2Instances.length} instances of logical vertex 2: [${vertex2Instances.join(', ')}]`);

      // STEP 2: Simple approach - just move all instances to collapse position
      const resultGeometry = geometry.clone();
      const resultPositions = resultGeometry.attributes.position.array as Float32Array;

      // Move all instances of both logical vertices to the collapse position
      [...vertex1Instances, ...vertex2Instances].forEach(vertexIndex => {
        resultPositions[vertexIndex * 3] = collapsePosition.x;
        resultPositions[vertexIndex * 3 + 1] = collapsePosition.y;
        resultPositions[vertexIndex * 3 + 2] = collapsePosition.z;
      });

      console.log(`   Moved ${vertex1Instances.length + vertex2Instances.length} vertex instances to collapse position`);

      // Copy vertices before the removed vertex
      for (let i = 0; i < removeVertex; i++) {
        newPositions[i * 3] = oldPositions[i * 3];
        newPositions[i * 3 + 1] = oldPositions[i * 3 + 1];
        newPositions[i * 3 + 2] = oldPositions[i * 3 + 2];
      }

      // Copy vertices after the removed vertex (shifted down by 1)
      for (let i = removeVertex + 1; i < originalVertexCount; i++) {
        const newIndex = i - 1;
        newPositions[newIndex * 3] = oldPositions[i * 3];
        newPositions[newIndex * 3 + 1] = oldPositions[i * 3 + 1];
        newPositions[newIndex * 3 + 2] = oldPositions[i * 3 + 2];
      }

      // Update the kept vertex to the collapse position
      const finalKeepIndex = keepVertex < removeVertex ? keepVertex : keepVertex - 1;
      newPositions[finalKeepIndex * 3] = collapsePosition.x;
      newPositions[finalKeepIndex * 3 + 1] = collapsePosition.y;
      newPositions[finalKeepIndex * 3 + 2] = collapsePosition.z;

      console.log(`   Keep vertex ${keepVertex} moved to index ${finalKeepIndex} at collapse position`);

      // STEP 2: Update indices if geometry is indexed
      let newIndices = null;
      if (geometry.index) {
        const oldIndices = geometry.index.array;
        const updatedIndices = [];

        for (let i = 0; i < oldIndices.length; i++) {
          let vertexRef = oldIndices[i];

          // Replace references to removeVertex with keepVertex
          if (vertexRef === removeVertex) {
            vertexRef = keepVertex;
          }

          // Shift indices down for vertices above removeVertex
          if (vertexRef > removeVertex) {
            vertexRef--;
          }

          updatedIndices.push(vertexRef);
        }

        // Remove degenerate triangles
        const validIndices = [];
        for (let i = 0; i < updatedIndices.length; i += 3) {
          const a = updatedIndices[i];
          const b = updatedIndices[i + 1];
          const c = updatedIndices[i + 2];

          if (a !== b && b !== c && a !== c) {
            validIndices.push(a, b, c);
          } else {
            console.log(`   Removed degenerate triangle: [${a}, ${b}, ${c}]`);
          }
        }

        newIndices = validIndices;
        console.log(`   Updated indices: ${oldIndices.length} → ${newIndices.length}`);
      } else {
        console.log(`   Non-indexed geometry - using direct vertex merging`);
        // For non-indexed geometry, merge duplicated vertices
        newIndices = this.mergeNonIndexedVertices(newPositions, keepVertex, removeVertex, collapsePosition, originalVertexCount);
      }

      // STEP 3: Create new geometry
      const resultGeometry = new THREE.BufferGeometry();
      resultGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));

      if (newIndices && newIndices.length > 0) {
        resultGeometry.setIndex(newIndices);
      }

      // Copy other attributes with compaction
      for (const attributeName in geometry.attributes) {
        if (attributeName !== 'position') {
          const oldAttribute = geometry.attributes[attributeName];
          const newAttribute = this.compactAttribute(oldAttribute, removeVertex, originalVertexCount);
          if (newAttribute) {
            resultGeometry.setAttribute(attributeName, newAttribute);
          }
        }
      }

      // Update polygon metadata
      if ((geometry as any).polygonFaces) {
        (resultGeometry as any).polygonFaces = this.updatePolygonFaces(
          (geometry as any).polygonFaces,
          keepVertex,
          removeVertex,
          collapsePosition
        );
        (resultGeometry as any).polygonType = (geometry as any).polygonType;
        (resultGeometry as any).isPolygonPreserved = true;
      }

      // Recompute normals and refresh
      resultGeometry.computeVertexNormals();
      resultGeometry.uuid = THREE.MathUtils.generateUUID();

      const finalVertexCount = resultGeometry.attributes.position.count;
      console.log(`✅ TRUE VERTEX MERGE COMPLETE: ${originalVertexCount} → ${finalVertexCount} vertices`);
      console.log(`   Successfully removed 1 vertex through edge collapse`);

      return {
        success: true,
        message: `Vertex merge: ${originalVertexCount} → ${finalVertexCount} vertices`,
        geometry: resultGeometry
      };

    } catch (error) {
      console.error('❌ Vertex merge failed:', error);
      return {
        success: false,
        message: `Vertex merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
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
