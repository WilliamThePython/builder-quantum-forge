import * as THREE from 'three';
import { MaterialSystem } from './MaterialSystem';

export interface ColoringOptions {
  randomColors: boolean;
  polygonAware: boolean;
}

export interface WireframeOptions {
  enabled: boolean;
  polygonAware: boolean;
}

/**
 * CENTRALIZED RENDERING SYSTEM
 * 
 * Handles all visual presentation: colors, wireframes, materials.
 * Ensures consistent flat shading and polygon-aware rendering.
 */
export class RenderingSystem {

  /**
   * Apply consistent coloring to geometry
   */
  static applyColoring(
    geometry: THREE.BufferGeometry, 
    options: ColoringOptions
  ): void {

    if (!options.randomColors) {
      // Remove any existing color attributes
      if (geometry.attributes.color) {
        geometry.deleteAttribute('color');
      }
      return;
    }

    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const polygonFaces = (geometry as any).polygonFaces;

    if (options.polygonAware && polygonFaces && Array.isArray(polygonFaces)) {
      this.applyPolygonAwareColoring(geometry, colors, polygonFaces);
    } else {
      this.applyTriangleBasedColoring(geometry, colors);
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.attributes.color.needsUpdate = true;
    
  }

  /**
   * Apply polygon-aware coloring (each polygon gets one color)
   */
  private static applyPolygonAwareColoring(
    geometry: THREE.BufferGeometry,
    colors: Float32Array,
    polygonFaces: any[]
  ): void {
    
    let triangleOffset = 0;

    for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
      const face = polygonFaces[faceIndex];
      const triangleCount = this.getTriangleCountForPolygon(face);

      // Generate one color per polygon face
      const color = new THREE.Color();
      color.setHSL(Math.random(), 0.8, 0.6);

      // Apply this color to all triangles that make up this polygon face
      for (let t = 0; t < triangleCount; t++) {
        const triangleStart = (triangleOffset + t) * 9; // 9 values per triangle

        // Apply same color to all 3 vertices of the triangle
        for (let v = 0; v < 9; v += 3) {
          if (triangleStart + v + 2 < colors.length) {
            colors[triangleStart + v] = color.r;
            colors[triangleStart + v + 1] = color.g;
            colors[triangleStart + v + 2] = color.b;
          }
        }
      }

      triangleOffset += triangleCount;
    }

  }

  /**
   * Apply triangle-based coloring (each triangle gets one color)
   */
  private static applyTriangleBasedColoring(
    geometry: THREE.BufferGeometry,
    colors: Float32Array
  ): void {
    
    const color = new THREE.Color();
    for (let i = 0; i < colors.length; i += 9) {
      color.setHSL(Math.random(), 0.7, 0.6);

      for (let j = 0; j < 9; j += 3) {
        colors[i + j] = color.r;
        colors[i + j + 1] = color.g;
        colors[i + j + 2] = color.b;
      }
    }

  }

  /**
   * Create wireframe geometry
   */
  static createWireframe(
    geometry: THREE.BufferGeometry,
    options: WireframeOptions
  ): THREE.BufferGeometry | null {
    if (!options.enabled) return null;


    const polygonFaces = (geometry as any).polygonFaces;

    if (options.polygonAware && polygonFaces && Array.isArray(polygonFaces)) {
      return this.createPolygonAwareWireframe(polygonFaces);
    } else {
      return this.createStandardWireframe(geometry);
    }
  }

  /**
   * Create polygon-aware wireframe (shows original polygon edges)
   */
  private static createPolygonAwareWireframe(polygonFaces: any[]): THREE.BufferGeometry {
    
    const wireframePositions: number[] = [];

    for (const face of polygonFaces) {
      if (face.originalVertices && face.originalVertices.length >= 3) {
        const vertices = face.originalVertices;

        for (let i = 0; i < vertices.length; i++) {
          const currentVertex = vertices[i];
          const nextVertex = vertices[(i + 1) % vertices.length];

          wireframePositions.push(
            currentVertex.x, currentVertex.y, currentVertex.z,
            nextVertex.x, nextVertex.y, nextVertex.z
          );
        }
      }
    }

    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireframePositions, 3));

    return wireGeometry;
  }

  /**
   * Create standard edge wireframe
   */
  private static createStandardWireframe(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    
    return edgeGeometry;
  }

  /**
   * Create material based on rendering settings
   */
  static createMaterial(options: {
    wireframe: boolean;
    randomColors: boolean;
    color?: number;
  }): THREE.Material {
    return MaterialSystem.createStandardMaterial(options);
  }

  /**
   * Get triangle count for polygon (helper function)
   */
  private static getTriangleCountForPolygon(face: any): number {
    if (!face.originalVertices) return 1;
    
    const vertexCount = face.originalVertices.length;
    return Math.max(1, vertexCount - 2); // Fan triangulation: n-2 triangles for n vertices
  }

  /**
   * Update highlighting colors
   */
  static updateHighlighting(
    geometry: THREE.BufferGeometry,
    originalColors: Float32Array | null,
    highlightedTriangle: number | null,
    isHighlighted: boolean
  ): void {
    if (!geometry.attributes.color || !originalColors) return;

    const colors = geometry.attributes.color.array as Float32Array;

    if (highlightedTriangle !== null && isHighlighted) {
      // Brighten the highlighted triangle
      const triangleStart = highlightedTriangle * 9;
      for (let i = 0; i < 9; i += 3) {
        if (triangleStart + i + 2 < colors.length) {
          colors[triangleStart + i] = Math.min(1, originalColors[triangleStart + i] * 1.5);
          colors[triangleStart + i + 1] = Math.min(1, originalColors[triangleStart + i + 1] * 1.5);
          colors[triangleStart + i + 2] = Math.min(1, originalColors[triangleStart + i + 2] * 1.5);
        }
      }
    } else {
      // Restore original colors
      colors.set(originalColors);
    }

    geometry.attributes.color.needsUpdate = true;
  }
}
