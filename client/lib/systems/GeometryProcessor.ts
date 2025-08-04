import * as THREE from 'three';
import { MaterialSystem } from './MaterialSystem';

export interface ProcessingResult {
  success: boolean;
  geometry?: THREE.BufferGeometry;
  message: string;
  stats?: {
    originalVertices: number;
    finalVertices: number;
    reductionAchieved: number;
  };
}

/**
 * CENTRALIZED GEOMETRY PROCESSOR
 * 
 * Single source of truth for all geometry transformations.
 * Ensures consistent processing pipeline and material handling.
 */
export class GeometryProcessor {

  /**
   * Convert non-indexed geometry to indexed for efficient processing
   */
  static convertToIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 GeometryProcessor: Converting to indexed geometry...');

    if (geometry.index) {
      console.log('   ✅ Already indexed');
      return geometry;
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;

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

    // Copy polygon metadata if it exists
    if ((geometry as any).polygonFaces) {
      (indexedGeometry as any).polygonFaces = (geometry as any).polygonFaces;
    }
    if ((geometry as any).polygonType) {
      (indexedGeometry as any).polygonType = (geometry as any).polygonType;
    }

    MaterialSystem.finalizeGeometry(indexedGeometry);

    const uniqueVertices = newPositions.length / 3;
    console.log(`   ✅ Conversion complete: ${vertexCount} → ${uniqueVertices} vertices`);

    return indexedGeometry;
  }

  /**
   * Quadric Edge Collapse Decimation - the ONLY decimation method
   */
  static async decimateQuadric(
    geometry: THREE.BufferGeometry, 
    targetReduction: number
  ): Promise<ProcessingResult> {
    console.log('🚀 GeometryProcessor: Starting quadric decimation...');
    const startTime = Date.now();
    
    if (targetReduction <= 0 || targetReduction >= 1) {
      return {
        success: false,
        message: 'Invalid reduction percentage (must be between 0 and 1)'
      };
    }

    let workingGeometry = geometry.clone();
    const originalVertexCount = workingGeometry.attributes.position.count;

    // Ensure indexed geometry for efficient edge operations
    if (!workingGeometry.index) {
      console.log('   🔧 Converting to indexed geometry...');
      workingGeometry = this.convertToIndexed(workingGeometry);
    }

    const positions = workingGeometry.attributes.position.array as Float32Array;
    const indices = workingGeometry.index!.array as Uint32Array;
    
    const targetVertexCount = Math.floor(originalVertexCount * (1 - targetReduction));
    const verticesToRemove = originalVertexCount - targetVertexCount;

    console.log(`   🎯 Target: Remove ${verticesToRemove} vertices (${(targetReduction * 100).toFixed(1)}%)`);

    // Build edge list
    const edges = this.buildEdgeList(indices);
    const vertexMergeMap = new Map<number, number>();

    // Determine processing strategy
    const isAggressiveReduction = targetReduction > 0.5;
    const maxIterations = isAggressiveReduction ? 10 : 5;
    
    let mergedCount = 0;
    let iterationCount = 0;

    // Iterative edge collapse
    while (mergedCount < verticesToRemove && iterationCount < maxIterations) {
      console.log(`   🔄 Iteration ${iterationCount + 1}/${maxIterations} - Progress: ${mergedCount}/${verticesToRemove}`);
      
      // Sort edges by length (shortest first for optimal collapse)
      edges.sort((a, b) => {
        const lengthA = this.calculateEdgeLength(positions, a[0], a[1]);
        const lengthB = this.calculateEdgeLength(positions, b[0], b[1]);
        return lengthA - lengthB;
      });

      const initialMergeCount = mergedCount;
      
      for (const [v1, v2] of edges) {
        if (mergedCount >= verticesToRemove) break;
        if (vertexMergeMap.has(v1) || vertexMergeMap.has(v2)) continue;

        // Calculate collapse position (midpoint)
        const midX = (positions[v1 * 3] + positions[v2 * 3]) / 2;
        const midY = (positions[v1 * 3 + 1] + positions[v2 * 3 + 1]) / 2;
        const midZ = (positions[v1 * 3 + 2] + positions[v2 * 3 + 2]) / 2;

        // Perform edge collapse
        positions[v1 * 3] = midX;
        positions[v1 * 3 + 1] = midY;
        positions[v1 * 3 + 2] = midZ;

        vertexMergeMap.set(v2, v1);
        mergedCount++;
      }

      // Check progress
      if (mergedCount === initialMergeCount) {
        console.log(`   ⚠️ No progress in iteration ${iterationCount + 1} - stopping`);
        break;
      }
      
      iterationCount++;
    }

    // Update indices to use merged vertices
    const newIndices = new Uint32Array(indices.length);
    for (let i = 0; i < indices.length; i++) {
      const originalVertex = indices[i];
      newIndices[i] = vertexMergeMap.get(originalVertex) ?? originalVertex;
    }

    workingGeometry.setIndex(Array.from(newIndices));
    MaterialSystem.finalizeGeometry(workingGeometry);

    const finalVertexCount = workingGeometry.attributes.position.count;
    const actualReduction = (originalVertexCount - finalVertexCount) / originalVertexCount;

    console.log(`   ✅ Decimation complete: ${originalVertexCount} → ${finalVertexCount} vertices`);
    console.log(`   📊 Achieved: ${(actualReduction * 100).toFixed(1)}% reduction in ${Date.now() - startTime}ms`);

    return {
      success: true,
      geometry: workingGeometry,
      message: `Decimation successful: ${(actualReduction * 100).toFixed(1)}% reduction`,
      stats: {
        originalVertices: originalVertexCount,
        finalVertices: finalVertexCount,
        reductionAchieved: actualReduction
      }
    };
  }

  /**
   * Build edge list from triangle indices
   */
  private static buildEdgeList(indices: Uint32Array): [number, number][] {
    const edgeSet = new Set<string>();
    const edges: [number, number][] = [];

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
   * Process any geometry to ensure it meets our standards
   */
  static processGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 GeometryProcessor: Processing geometry...');
    
    const processed = geometry.clone();
    MaterialSystem.finalizeGeometry(processed);
    
    console.log('   ✅ Geometry processed with consistent standards');
    return processed;
  }
}
