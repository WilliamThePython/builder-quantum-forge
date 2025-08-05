import * as THREE from 'three';

/**
 * Validate and fix geometry with NaN/infinite values
 */
export function validateAndFixGeometry(geometry: THREE.BufferGeometry, label: string): THREE.BufferGeometry {
  console.log(`🔍 Validating geometry: ${label}`);
  
  if (!geometry || !geometry.attributes || !geometry.attributes.position) {
    console.error(`🚨 Invalid geometry structure for ${label}`);
    throw new Error(`Invalid geometry structure for ${label}`);
  }
  
  const positions = geometry.attributes.position.array as Float32Array;
  let nanCount = 0;
  let infCount = 0;
  let fixedCount = 0;
  
  // Check for and fix NaN/Infinity values
  for (let i = 0; i < positions.length; i++) {
    if (isNaN(positions[i])) {
      nanCount++;
      positions[i] = 0; // Replace NaN with 0
      fixedCount++;
    } else if (!isFinite(positions[i])) {
      infCount++;
      positions[i] = positions[i] > 0 ? 1000 : -1000; // Clamp infinite values
      fixedCount++;
    }
  }
  
  if (nanCount > 0 || infCount > 0) {
    console.warn(`🔧 Fixed geometry ${label}: ${nanCount} NaN values, ${infCount} infinite values`);
    geometry.attributes.position.needsUpdate = true;
    
    // Force recompute attributes
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  
  // Additional validation - check if all values are reasonable
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (let i = 0; i < positions.length; i++) {
    minVal = Math.min(minVal, positions[i]);
    maxVal = Math.max(maxVal, positions[i]);
  }
  
  if (minVal === Infinity || maxVal === -Infinity) {
    console.error(`🚨 Geometry ${label} has invalid min/max values: ${minVal}, ${maxVal}`);
    throw new Error(`Geometry ${label} has invalid min/max values`);
  }
  
  // Validate bounding box can be computed
  try {
    geometry.computeBoundingBox();
    if (!geometry.boundingBox) {
      console.error(`🚨 Failed to compute bounding box for ${label}`);
      throw new Error(`Failed to compute bounding box for ${label}`);
    }
    
    // Check if bounding box values are valid
    const box = geometry.boundingBox;
    if (isNaN(box.min.x) || isNaN(box.min.y) || isNaN(box.min.z) ||
        isNaN(box.max.x) || isNaN(box.max.y) || isNaN(box.max.z)) {
      console.error(`🚨 Bounding box contains NaN values for ${label}`);
      throw new Error(`Bounding box contains NaN values for ${label}`);
    }
  } catch (error) {
    console.error(`🚨 Bounding box computation failed for ${label}:`, error);
    throw error;
  }
  
  if (fixedCount > 0) {
    console.log(`✅ Geometry validation completed for ${label} - fixed ${fixedCount} values`);
  } else {
    console.log(`✅ Geometry validation passed for ${label} - no issues found`);
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
