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
 * Log geometry stats for debugging (simplified)
 */
export function logGeometryStats(geometry: THREE.BufferGeometry, label: string): void {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    console.log(`📊 ${label}: Invalid`);
    return;
  }

  const vertices = geometry.attributes.position.count;
  const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;

  // Only show if there are issues
  const hasIssues = hasNaNValues(geometry);
  if (hasIssues) {
    console.log(`📊 ${label}: ${vertices} vertices, ${triangles} triangles - HAS ISSUES`);
  }
}
