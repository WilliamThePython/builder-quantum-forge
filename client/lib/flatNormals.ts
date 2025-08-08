/**
 * Compute flat normals for crisp geometric shading
 * This gives each triangle face its own normal, creating sharp edges
 */

import * as THREE from 'three';

export function computeFlatNormals(geometry: THREE.BufferGeometry): void {
  if (!geometry.attributes.position) {
    return;
  }

  // Force flat shading by removing any shared vertices
  // In flat shading, each triangle has its own vertices with individual normals
  
  const positions = geometry.attributes.position.array as Float32Array;
  const vertexCount = positions.length / 3;
  
  // Build flat normals array - one normal per vertex
  const normals = new Float32Array(positions.length);
  
  // For flat shading, we need normals per triangle, not per vertex
  for (let i = 0; i < vertexCount; i += 3) {
    // Get the three vertices of this triangle
    const v1 = new THREE.Vector3(
      positions[i * 3],
      positions[i * 3 + 1], 
      positions[i * 3 + 2]
    );
    const v2 = new THREE.Vector3(
      positions[(i + 1) * 3],
      positions[(i + 1) * 3 + 1],
      positions[(i + 1) * 3 + 2]
    );
    const v3 = new THREE.Vector3(
      positions[(i + 2) * 3],
      positions[(i + 2) * 3 + 1],
      positions[(i + 2) * 3 + 2]
    );
    
    // Compute face normal using cross product
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    // Apply this normal to all three vertices of the triangle
    for (let j = 0; j < 3; j++) {
      const vertexIndex = (i + j) * 3;
      normals[vertexIndex] = normal.x;
      normals[vertexIndex + 1] = normal.y;
      normals[vertexIndex + 2] = normal.z;
    }
  }
  
  // Apply the computed normals
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
}

export function computePolygonAwareFlatNormals(
  geometry: THREE.BufferGeometry, 
  polygonFaces?: any[]
): void {
  // If no polygon metadata, fall back to standard flat normals
  if (!polygonFaces || !Array.isArray(polygonFaces)) {
    computeFlatNormals(geometry);
    return;
  }

  const positions = geometry.attributes.position.array as Float32Array;
  const normals = new Float32Array(positions.length);
  
  // Apply normals based on polygon grouping
  let triangleIndex = 0;
  
  for (const polygonFace of polygonFaces) {
    // Calculate normal for this polygon
    const polygonNormal = calculatePolygonNormal(polygonFace, positions, triangleIndex);
    
    // Apply this normal to all triangles in this polygon
    const triangleCount = polygonFace.triangleCount || 1;
    
    for (let t = 0; t < triangleCount; t++) {
      const baseIndex = (triangleIndex + t) * 9; // 3 vertices * 3 components per triangle
      
      // Set normal for all 3 vertices of this triangle
      for (let v = 0; v < 3; v++) {
        const normalIndex = baseIndex + v * 3;
        normals[normalIndex] = polygonNormal.x;
        normals[normalIndex + 1] = polygonNormal.y;
        normals[normalIndex + 2] = polygonNormal.z;
      }
    }
    
    triangleIndex += triangleCount;
  }
  
  // Apply the computed normals
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.attributes.normal.needsUpdate = true;
}

function calculatePolygonNormal(polygonFace: any, positions: Float32Array, triangleStartIndex: number): THREE.Vector3 {
  // Use the first triangle of the polygon to determine the normal
  const baseIndex = triangleStartIndex * 9; // 3 vertices * 3 components
  
  const v1 = new THREE.Vector3(
    positions[baseIndex],
    positions[baseIndex + 1],
    positions[baseIndex + 2]
  );
  const v2 = new THREE.Vector3(
    positions[baseIndex + 3],
    positions[baseIndex + 4],
    positions[baseIndex + 5]
  );
  const v3 = new THREE.Vector3(
    positions[baseIndex + 6],
    positions[baseIndex + 7],
    positions[baseIndex + 8]
  );
  
  // Compute face normal using cross product
  const edge1 = new THREE.Vector3().subVectors(v2, v1);
  const edge2 = new THREE.Vector3().subVectors(v3, v1);
  const normal = new THREE.Vector3().crossVectors(edge1, edge2);
  
  // Normalize and return
  return normal.normalize();
}
