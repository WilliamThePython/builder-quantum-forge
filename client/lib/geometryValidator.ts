import * as THREE from 'three';

/**
 * Validate and fix geometry with NaN/infinite values
 */
export function validateAndFixGeometry(geometry: THREE.BufferGeometry, label: string): THREE.BufferGeometry {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    throw new Error(`Invalid geometry structure for ${label}`);
  }

  const positions = geometry.attributes.position.array as Float32Array;
  let fixedCount = 0;

  // Check for and fix NaN/Infinity values
  for (let i = 0; i < positions.length; i++) {
    if (isNaN(positions[i])) {
      positions[i] = 0;
      fixedCount++;
    } else if (!isFinite(positions[i])) {
      positions[i] = positions[i] > 0 ? 1000 : -1000;
      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    console.warn(`🔧 Fixed ${fixedCount} invalid values in ${label}`);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  // Validate bounding box
  try {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) {
      throw new Error(`Failed to compute bounding box for ${label}`);
    }
  } catch (error) {
    throw new Error(`Bounding box computation failed for ${label}`);
  }

  return geometry;
}

/**
 * Quick check for NaN values without fixing
 */
export function hasNaNValues(geometry: THREE.BufferGeometry): boolean {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    return false;
  }
  
  const positions = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i++) {
    if (isNaN(positions[i]) || !isFinite(positions[i])) {
      return true;
    }
  }
  
  return false;
}

/**
 * Log geometry stats for debugging
 */
export function logGeometryStats(geometry: THREE.BufferGeometry, label: string): void {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    console.log(`📊 ${label}: Invalid geometry`);
    return;
  }
  
  const positions = geometry.attributes.position.array as Float32Array;
  let nanCount = 0;
  let infCount = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;
  
  for (let i = 0; i < positions.length; i++) {
    if (isNaN(positions[i])) {
      nanCount++;
    } else if (!isFinite(positions[i])) {
      infCount++;
    } else {
      minVal = Math.min(minVal, positions[i]);
      maxVal = Math.max(maxVal, positions[i]);
    }
  }
  
  console.log(`📊 ${label}:`, {
    vertices: geometry.attributes.position.count,
    triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
    hasIndex: !!geometry.index,
    nanCount,
    infCount,
    minValue: minVal === Infinity ? 'N/A' : minVal,
    maxValue: maxVal === -Infinity ? 'N/A' : maxVal,
    hasNormals: !!geometry.attributes.normal,
    hasColors: !!geometry.attributes.color
  });
}
