import * as THREE from 'three';

/**
 * Convert indexed geometry to non-indexed for truly flat vertex colors.
 * 
 * In indexed geometry, vertices are shared between triangles, which causes
 * Three.js to interpolate colors between adjacent faces. Non-indexed geometry
 * gives each triangle its own vertices, ensuring flat coloring.
 */
export function convertToNonIndexedForFlatColors(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  console.log('🔧 Converting to non-indexed geometry for flat vertex colors...');
  
  if (!geometry.index) {
    console.log('   ��� Already non-indexed');
    return geometry;
  }

  const indices = geometry.index.array;
  const positions = geometry.attributes.position.array as Float32Array;
  
  // Create new non-indexed arrays
  const newPositions: number[] = [];
  let newColors: number[] | null = null;
  let newNormals: number[] | null = null;
  
  // If there are colors, prepare array
  if (geometry.attributes.color) {
    newColors = [];
    const colors = geometry.attributes.color.array as Float32Array;
    
    // For each triangle, duplicate the vertices and their colors
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      
      // Copy vertex positions
      newPositions.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
        positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]
      );
      
      // Copy vertex colors
      newColors.push(
        colors[a * 3], colors[a * 3 + 1], colors[a * 3 + 2],
        colors[b * 3], colors[b * 3 + 1], colors[b * 3 + 2],
        colors[c * 3], colors[c * 3 + 1], colors[c * 3 + 2]
      );
    }
  } else {
    // Just copy positions if no colors
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      
      newPositions.push(
        positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
        positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
        positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]
      );
    }
  }
  
  // Create new non-indexed geometry
  const nonIndexedGeometry = new THREE.BufferGeometry();
  nonIndexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  
  if (newColors) {
    nonIndexedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(newColors, 3));
  }
  
  // Copy metadata if it exists
  if ((geometry as any).polygonFaces) {
    (nonIndexedGeometry as any).polygonFaces = (geometry as any).polygonFaces;
  }
  
  // Compute flat normals (since it's non-indexed, each triangle will have its own normals)
  nonIndexedGeometry.computeVertexNormals();
  nonIndexedGeometry.uuid = THREE.MathUtils.generateUUID();
  
  const triangleCount = newPositions.length / 9;
  console.log(`   ✅ Converted to non-indexed: ${triangleCount} triangles with independent vertices`);
  
  return nonIndexedGeometry;
}
