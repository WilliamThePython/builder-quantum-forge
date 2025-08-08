import * as THREE from 'three';

/**
 * CENTRALIZED MATERIAL SYSTEM
 * 
 * Ensures consistent flat shading and material properties across all geometry operations.
 * Eliminates the shading blending issue by providing a single source of truth for normals.
 */
export class MaterialSystem {
  
  /**
   * CORE PRINCIPLE: All geometry normals are computed as FLAT to maintain crisp face shading.
   * This prevents the color blending that occurs with smooth normals.
   */
  static ensureFlatShading(geometry: THREE.BufferGeometry): void {
    
    if (!geometry.index) {
      // Non-indexed geometry already has flat shading by nature
      geometry.computeVertexNormals();
      return;
    }

    this.computeFlatNormals(geometry);
  }

  /**
   * Compute flat normals - each face gets its own distinct normal
   * This is the ONLY method that should be used for normal computation in this app
   */
  private static computeFlatNormals(geometry: THREE.BufferGeometry): void {
    if (!geometry.index) {
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
   * Create standard material with flat shading
   */
  static createStandardMaterial(options: {
    wireframe?: boolean;
    randomColors?: boolean;
    color?: number;
  } = {}): THREE.Material {
    if (options.wireframe) {
      return new THREE.MeshBasicMaterial({
        wireframe: false, // Handled separately with LineSegments
        color: 0x404040,
        transparent: true,
        opacity: 0.1
      });
    }

    const baseColor = options.randomColors ? 0xffffff : (options.color ?? 0x606060);

    return new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: options.randomColors,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.FrontSide,
      transparent: false,
      opacity: 1.0,
      flatShading: true // CRITICAL: Maintains crisp face boundaries
    });
  }

  /**
   * Finalize geometry after any operation - ensures consistent state
   */
  static finalizeGeometry(geometry: THREE.BufferGeometry): void {
    
    // Always ensure flat shading
    this.ensureFlatShading(geometry);
    
    // Update required flags
    geometry.attributes.position.needsUpdate = true;
    if (geometry.attributes.normal) {
      geometry.attributes.normal.needsUpdate = true;
    }
    
    // Generate new UUID for React updates
    geometry.uuid = THREE.MathUtils.generateUUID();
    
  }

  /**
   * DEPRECATED - DO NOT USE
   * This method is here only to catch accidental usage
   */
  static computeVertexNormals(): never {
    throw new Error('❌ DEPRECATED: Use MaterialSystem.ensureFlatShading() instead of computeVertexNormals()');
  }
}
