import * as THREE from 'three';
import { MeshStats } from './meshSimplifier';

/**
 * Clean vertex removal implementation for decimation painter
 */
export class VertexRemovalStitcher {

  /**
   * Simple edge collapse for decimation painter
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
    console.log(`🎯 Edge Collapse: ${vertexIndex1} ↔ ${vertexIndex2} → [${collapsePosition.x.toFixed(2)}, ${collapsePosition.y.toFixed(2)}, ${collapsePosition.z.toFixed(2)}]`);

    try {
      const resultGeometry = geometry.clone();
      const positions = resultGeometry.attributes.position.array as Float32Array;

      // Simply move both vertices to collapse position
      positions[vertexIndex1 * 3] = collapsePosition.x;
      positions[vertexIndex1 * 3 + 1] = collapsePosition.y;
      positions[vertexIndex1 * 3 + 2] = collapsePosition.z;

      positions[vertexIndex2 * 3] = collapsePosition.x;
      positions[vertexIndex2 * 3 + 1] = collapsePosition.y;
      positions[vertexIndex2 * 3 + 2] = collapsePosition.z;

      // Update position attribute
      resultGeometry.attributes.position.needsUpdate = true;

      // Clean up degenerate faces
      this.removeDegenerateFaces(resultGeometry);

      // Update polygon metadata if it exists
      if ((geometry as any).polygonFaces) {
        (resultGeometry as any).polygonFaces = this.updatePolygonFaces(
          (geometry as any).polygonFaces,
          vertexIndex1,
          vertexIndex2,
          collapsePosition
        );
        (resultGeometry as any).polygonType = (geometry as any).polygonType;
        (resultGeometry as any).isPolygonPreserved = true;
      }

      // Recompute normals and refresh geometry
      resultGeometry.computeVertexNormals();
      resultGeometry.uuid = THREE.MathUtils.generateUUID();

      console.log(`✅ Edge collapsed successfully`);
      return {
        success: true,
        message: `Edge collapsed: ${vertexIndex1} ↔ ${vertexIndex2}`,
        geometry: resultGeometry
      };

    } catch (error) {
      console.error('❌ Edge collapse failed:', error);
      return {
        success: false,
        message: `Edge collapse failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
   * Update polygon face metadata after edge collapse
   */
  private static updatePolygonFaces(
    polygonFaces: any[],
    vertexIndex1: number,
    vertexIndex2: number,
    collapsePosition: THREE.Vector3
  ): any[] {
    return polygonFaces.map((face, faceIndex) => {
      if (!face.originalVertices || !Array.isArray(face.originalVertices)) {
        return face;
      }

      const newVertices = [];
      const tolerance = 0.001;

      // Process each vertex in the polygon
      for (let i = 0; i < face.originalVertices.length; i++) {
        const vertex = face.originalVertices[i];
        newVertices.push(vertex.clone());
      }

      // Remove consecutive duplicate vertices
      const cleanedVertices = [];
      for (let i = 0; i < newVertices.length; i++) {
        const currentVertex = newVertices[i];
        const nextVertex = newVertices[(i + 1) % newVertices.length];
        
        if (currentVertex.distanceTo(nextVertex) > tolerance) {
          cleanedVertices.push(currentVertex);
        }
      }

      // Update face type if needed
      let newType = face.type;
      if (cleanedVertices.length === 3) newType = 'triangle';
      else if (cleanedVertices.length === 4) newType = 'quad';
      else if (cleanedVertices.length > 4) newType = 'polygon';

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
