import * as THREE from 'three';

/**
 * Mesh statistics interface
 */
export interface MeshStats {
  vertices: number;
  faces: number;
  edges: number;
  volume: number;
  hasNormals: boolean;
  hasUVs: boolean;
  isIndexed: boolean;
}

/**
 * Simple mesh statistics calculator
 */
export class MeshSimplifier {
  
  /**
   * Calculate mesh statistics
   */
  static getMeshStats(geometry: THREE.BufferGeometry): MeshStats {
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
