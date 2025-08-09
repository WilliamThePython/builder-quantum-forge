import * as THREE from 'three';

/**
 * Compute polygon-aware flat normals to maintain crisp polygon face boundaries.
 * 
 * This ensures that all triangles within a polygon face share the same normal,
 * preventing smooth interpolation between coplanar triangles while maintaining
 * sharp edges between different polygon faces.
 */
export function computePolygonAwareFlatNormals(
  geometry: THREE.BufferGeometry, 
  polygonFaces?: any[]
): void {
  if (!geometry.index) {
    // Non-indexed geometry - each triangle already has its own vertices
    geometry.computeVertexNormals();
    return;
  }

  const positions = geometry.attributes.position.array as Float32Array;
  const indices = geometry.index.array;
  const normals = new Float32Array(positions.length);

  if (polygonFaces && Array.isArray(polygonFaces)) {
    
    let triangleOffset = 0;
    
    for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
      const face = polygonFaces[faceIndex];
      const triangleCount = getTriangleCountForPolygon(face);
      
      // Calculate one normal for the entire polygon face
      let polygonNormal: THREE.Vector3;
      
      if (face.normal && face.normal instanceof THREE.Vector3) {
        // Use the stored polygon normal if available
        polygonNormal = face.normal.clone().normalize();
      } else {
        // Calculate normal from the first triangle of this polygon
        const firstTriangleStart = triangleOffset * 3; // Index into indices array
        const a = indices[firstTriangleStart] * 3;
        const b = indices[firstTriangleStart + 1] * 3;
        const c = indices[firstTriangleStart + 2] * 3;

        const vA = new THREE.Vector3(positions[a], positions[a + 1], positions[a + 2]);
        const vB = new THREE.Vector3(positions[b], positions[b + 1], positions[b + 2]);
        const vC = new THREE.Vector3(positions[c], positions[c + 1], positions[c + 2]);

        const cb = new THREE.Vector3().subVectors(vC, vB);
        const ab = new THREE.Vector3().subVectors(vA, vB);
        polygonNormal = cb.cross(ab).normalize();
      }
      
      // Apply the same normal to ALL triangles in this polygon face
      for (let t = 0; t < triangleCount; t++) {
        const triangleIndexStart = (triangleOffset + t) * 3;
        const a = indices[triangleIndexStart] * 3;
        const b = indices[triangleIndexStart + 1] * 3;
        const c = indices[triangleIndexStart + 2] * 3;

        // Assign same polygon normal to all vertices of this triangle
        normals[a] = polygonNormal.x;
        normals[a + 1] = polygonNormal.y;
        normals[a + 2] = polygonNormal.z;

        normals[b] = polygonNormal.x;
        normals[b + 1] = polygonNormal.y;
        normals[b + 2] = polygonNormal.z;

        normals[c] = polygonNormal.x;
        normals[c + 1] = polygonNormal.y;
        normals[c + 2] = polygonNormal.z;
      }
      
      triangleOffset += triangleCount;
    }
    
  } else {
    // Fallback to standard flat normals if no polygon data
    
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

      // Assign same face normal to all three vertices
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
  }

  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
  
}

/**
 * Helper function to get triangle count for a polygon face
 */
function getTriangleCountForPolygon(face: any): number {
  if (!face.originalVertices) return 1;
  
  const vertexCount = face.originalVertices.length;
  return Math.max(1, vertexCount - 2); // Fan triangulation: n-2 triangles for n vertices
}
