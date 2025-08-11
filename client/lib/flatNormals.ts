import * as THREE from "three";

/**
 * UTILITY: Compute flat normals for crisp face shading
 *
 * This replaces all computeVertexNormals() calls to prevent smooth color blending.
 * Each triangle gets its own distinct normal for crisp face boundaries.
 */
export function computeFlatNormals(geometry: THREE.BufferGeometry): void {
  if (!geometry.index) {
    // Non-indexed geometry - compute proper flat normals for each triangle
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = new Float32Array(positions.length);

    // Each group of 3 vertices forms a triangle - compute face normal for each
    for (let i = 0; i < positions.length; i += 9) {
      // 9 = 3 vertices * 3 components
      // Get triangle vertices
      const vA = new THREE.Vector3(
        positions[i],
        positions[i + 1],
        positions[i + 2],
      );
      const vB = new THREE.Vector3(
        positions[i + 3],
        positions[i + 4],
        positions[i + 5],
      );
      const vC = new THREE.Vector3(
        positions[i + 6],
        positions[i + 7],
        positions[i + 8],
      );

      // Calculate face normal
      const cb = new THREE.Vector3().subVectors(vC, vB);
      const ab = new THREE.Vector3().subVectors(vA, vB);
      const faceNormal = cb.cross(ab).normalize();

      // Assign same face normal to all three vertices of this triangle
      for (let j = 0; j < 9; j += 3) {
        normals[i + j] = faceNormal.x;
        normals[i + j + 1] = faceNormal.y;
        normals[i + j + 2] = faceNormal.z;
      }
    }

    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
    return;
  }

  const positions = geometry.attributes.position.array as Float32Array;
  const indices = geometry.index.array;
  const normals = new Float32Array(positions.length);

  // Calculate face normals and assign to vertices (flat shading)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;

    // Get triangle vertices
    const vA = new THREE.Vector3(
      positions[a],
      positions[a + 1],
      positions[a + 2],
    );
    const vB = new THREE.Vector3(
      positions[b],
      positions[b + 1],
      positions[b + 2],
    );
    const vC = new THREE.Vector3(
      positions[c],
      positions[c + 1],
      positions[c + 2],
    );

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

  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
}

/**
 * DEPRECATED - DO NOT USE
 * Throws error to catch any remaining computeVertexNormals() usage
 */
export function computeVertexNormals(): never {
  throw new Error(
    "❌ DEPRECATED: Use computeFlatNormals() instead of computeVertexNormals() to maintain crisp face shading",
  );
}
