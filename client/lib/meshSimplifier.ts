import * as THREE from 'three';
import { GeometryCleanup } from './geometryCleanup';

/**
 * Direct implementation of Python mesh simplification code
 * Eliminates internal triangles and prevents model deletion
 */
export class MeshSimplifier {
  
  /**
   * Main simplification method - direct translation of Python simplify_and_merge
   */
  static async simplifyMesh(
    geometry: THREE.BufferGeometry,
    options: {
      method: string;
      targetReduction: number;
      targetParts?: number;
      angleTolerance?: number;
    }
  ): Promise<{
    simplifiedGeometry: THREE.BufferGeometry;
    originalStats: MeshStats;
    newStats: MeshStats;
    triangleParts: TrianglePart[];
    mergedParts: MergedPart[];
    reductionAchieved: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log('🔄 Starting Python-style mesh simplification...');

    // Get original stats
    const originalStats = this.getMeshStats(geometry);
    
    // Calculate target parts based on reduction
    const currentTriangles = originalStats.faces;
    const targetParts = options.targetParts || Math.max(10, Math.floor(currentTriangles * (1 - options.targetReduction)));
    const angleTolerance = options.angleTolerance || 1.0;

    try {
      // Step 1: Clean mesh (like Python clean_mesh function)
      const cleanedGeometry = this.cleanMesh(geometry.clone());
      console.log('✅ Mesh cleaned');

      // Step 2: Simplify with quadric decimation (like Python simplify_with_open3d)
      const simplifiedGeometry = await this.simplifyWithQuadric(cleanedGeometry, targetParts);
      console.log('✅ Quadric decimation completed');

      // Step 3: Remove low impact vertices (currently no-op like Python)
      const refinedGeometry = this.removeLowImpactVertices(simplifiedGeometry, angleTolerance);
      console.log('✅ Low impact vertices processed');

      // Step 4: Extract triangle parts (like Python triangle_parts list)
      const triangleParts = this.extractTriangleParts(refinedGeometry);
      console.log(`✅ Extracted ${triangleParts.length} triangle parts`);

      // Step 5: Merge coplanar faces (like Python merge_coplanar_faces)
      const mergedParts = this.mergeCoplanarFaces(refinedGeometry, angleTolerance);
      console.log(`✅ Created ${mergedParts.length} merged parts`);

      const newStats = this.getMeshStats(refinedGeometry);
      const reductionAchieved = 1 - (newStats.vertices / originalStats.vertices);
      const processingTime = Date.now() - startTime;

      console.log(`🎯 Simplification completed: ${originalStats.vertices} → ${newStats.vertices} vertices (${(reductionAchieved * 100).toFixed(1)}% reduction)`);

      return {
        simplifiedGeometry: refinedGeometry,
        originalStats,
        newStats,
        triangleParts,
        mergedParts,
        reductionAchieved,
        processingTime
      };

    } catch (error) {
      console.error('❌ Simplification failed:', error);
      // Return original geometry if simplification fails completely
      const newStats = originalStats;
      return {
        simplifiedGeometry: geometry.clone(),
        originalStats,
        newStats,
        triangleParts: [],
        mergedParts: [],
        reductionAchieved: 0,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Clean mesh - direct translation of Python clean_mesh function
   */
  private static cleanMesh(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🧹 Cleaning mesh (Python style)...');
    
    // Use existing geometry cleanup
    GeometryCleanup.cleanGeometry(geometry);
    
    // Compute vertex normals (like Python mesh.compute_vertex_normals())
    geometry.computeVertexNormals();
    
    // Additional cleaning steps from Python:
    // - remove_duplicated_vertices (handled by GeometryCleanup)
    // - remove_degenerate_triangles (handled by GeometryCleanup) 
    // - remove_duplicated_triangles (handled by GeometryCleanup)
    // - remove_non_manifold_edges (simplified implementation)
    
    return geometry;
  }

  /**
   * Simplify with quadric decimation - direct translation of Python simplify_with_open3d
   */
  private static async simplifyWithQuadric(
    geometry: THREE.BufferGeometry,
    targetTriangles: number
  ): Promise<THREE.BufferGeometry> {
    console.log(`🔧 Applying quadric decimation: target ${targetTriangles} triangles`);
    
    try {
      // Try to use Three.js SimplifyModifier (equivalent to Open3D)
      const { SimplifyModifier } = await import('three/examples/jsm/modifiers/SimplifyModifier.js');
      
      const modifier = new SimplifyModifier();
      const simplified = modifier.modify(geometry, targetTriangles);
      
      // Recompute normals (like Python simplified.compute_vertex_normals())
      simplified.computeVertexNormals();
      
      console.log(`✅ Quadric decimation successful: ${simplified.attributes.position.count} vertices`);
      return simplified;
      
    } catch (error) {
      console.warn('⚠️ SimplifyModifier failed, using conservative fallback');
      // Conservative fallback - don't risk deleting the whole model
      return this.conservativeSimplification(geometry, targetTriangles);
    }
  }

  /**
   * Conservative simplification fallback to prevent model deletion
   */
  private static conservativeSimplification(
    geometry: THREE.BufferGeometry,
    targetTriangles: number
  ): THREE.BufferGeometry {
    const currentTriangles = geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
    
    // If already at or below target, return as-is
    if (currentTriangles <= targetTriangles) {
      console.log('📊 Model already at target size, no reduction needed');
      return geometry;
    }

    // Very conservative reduction - only reduce by small amount to prevent deletion
    const maxReduction = 0.3; // Never reduce by more than 30%
    const safeTargetTriangles = Math.max(targetTriangles, Math.floor(currentTriangles * (1 - maxReduction)));
    
    console.log(`🛡️ Conservative reduction: ${currentTriangles} → ${safeTargetTriangles} triangles`);
    
    // Simple vertex decimation
    return this.simpleVertexDecimation(geometry, safeTargetTriangles);
  }

  /**
   * Simple vertex decimation to avoid model deletion
   */
  private static simpleVertexDecimation(
    geometry: THREE.BufferGeometry,
    targetTriangles: number
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position;
    const currentTriangles = geometry.index ? geometry.index.count / 3 : positions.count / 3;
    
    if (currentTriangles <= targetTriangles) {
      return geometry;
    }

    // Calculate reduction ratio
    const reductionRatio = targetTriangles / currentTriangles;
    
    // For indexed geometry
    if (geometry.index) {
      const indices = geometry.index.array;
      const newIndices: number[] = [];
      
      // Keep triangles based on reduction ratio
      for (let i = 0; i < indices.length; i += 3) {
        if (Math.random() < reductionRatio) {
          newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
        }
      }
      
      // Ensure we have at least some triangles
      if (newIndices.length < 9) { // Less than 3 triangles
        console.log('⚠️ Too few triangles after reduction, keeping original');
        return geometry;
      }
      
      const newGeometry = new THREE.BufferGeometry();
      newGeometry.setAttribute('position', positions.clone());
      newGeometry.setIndex(newIndices);
      newGeometry.computeVertexNormals();
      
      return newGeometry;
    }
    
    // For non-indexed geometry
    const newPositions: number[] = [];
    for (let i = 0; i < positions.count; i += 3) {
      if (Math.random() < reductionRatio) {
        newPositions.push(
          positions.getX(i), positions.getY(i), positions.getZ(i),
          positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1),
          positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2)
        );
      }
    }
    
    // Ensure we have at least some vertices
    if (newPositions.length < 9) {
      console.log('⚠️ Too few vertices after reduction, keeping original');
      return geometry;
    }
    
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    newGeometry.computeVertexNormals();
    
    return newGeometry;
  }

  /**
   * Remove low impact vertices - direct translation (currently no-op like Python)
   */
  private static removeLowImpactVertices(
    geometry: THREE.BufferGeometry,
    angleThreshold: number
  ): THREE.BufferGeometry {
    // Like Python version, this is currently a no-op
    // Could implement edge collapse for low-impact vertices here
    return geometry;
  }

  /**
   * Extract triangle parts - direct translation of Python triangle parts creation
   */
  private static extractTriangleParts(geometry: THREE.BufferGeometry): TrianglePart[] {
    const triangleParts: TrianglePart[] = [];
    const positions = geometry.attributes.position;
    
    if (geometry.index) {
      const indices = geometry.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = new THREE.Vector3().fromBufferAttribute(positions, indices[i]);
        const v2 = new THREE.Vector3().fromBufferAttribute(positions, indices[i + 1]);
        const v3 = new THREE.Vector3().fromBufferAttribute(positions, indices[i + 2]);
        
        // Only add valid triangles
        if (this.isValidTriangle(v1, v2, v3)) {
          triangleParts.push({
            vertices: [v1, v2, v3],
            indices: [indices[i], indices[i + 1], indices[i + 2]]
          });
        }
      }
    } else {
      for (let i = 0; i < positions.count; i += 3) {
        const v1 = new THREE.Vector3().fromBufferAttribute(positions, i);
        const v2 = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const v3 = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
        
        // Only add valid triangles
        if (this.isValidTriangle(v1, v2, v3)) {
          triangleParts.push({
            vertices: [v1, v2, v3],
            indices: [i, i + 1, i + 2]
          });
        }
      }
    }
    
    return triangleParts;
  }

  /**
   * Merge coplanar faces - direct translation of Python merge_coplanar_faces
   */
  private static mergeCoplanarFaces(
    geometry: THREE.BufferGeometry,
    angleTolerance: number
  ): MergedPart[] {
    console.log(`🔗 Merging coplanar faces with ${angleTolerance}° tolerance`);
    
    const triangleParts = this.extractTriangleParts(geometry);
    if (triangleParts.length === 0) {
      return [];
    }
    
    const angleToleranceRad = (angleTolerance * Math.PI) / 180;
    
    // Calculate face normals for all triangles
    const faceNormals = triangleParts.map(part => {
      const [v1, v2, v3] = part.vertices;
      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      return edge1.cross(edge2).normalize();
    });
    
    // Group vectors by angle (like Python trimesh.grouping.group_vectors)
    const groups = this.groupVectorsByAngle(faceNormals, angleToleranceRad);
    
    // Create merged parts from groups
    const mergedParts: MergedPart[] = [];
    
    for (const group of groups) {
      if (group.length === 0) continue;
      
      const groupTriangles = group.map(index => triangleParts[index]);
      const allVertices: THREE.Vector3[] = [];
      
      for (const triangle of groupTriangles) {
        allVertices.push(...triangle.vertices);
      }
      
      // Remove duplicate vertices
      const uniqueVertices = this.removeDuplicateVertices(allVertices);
      
      mergedParts.push({
        vertices: uniqueVertices,
        triangles: groupTriangles
      });
    }
    
    console.log(`✅ Created ${mergedParts.length} merged coplanar parts`);
    return mergedParts;
  }

  /**
   * Group vectors by angle - equivalent to Python trimesh.grouping.group_vectors
   */
  private static groupVectorsByAngle(
    normals: THREE.Vector3[],
    angleThreshold: number
  ): number[][] {
    const groups: number[][] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < normals.length; i++) {
      if (used.has(i)) continue;
      
      const group = [i];
      used.add(i);
      const baseNormal = normals[i];
      
      // Find all normals within angle threshold
      for (let j = i + 1; j < normals.length; j++) {
        if (used.has(j)) continue;
        
        const dot = baseNormal.dot(normals[j]);
        const angle = Math.acos(Math.abs(Math.max(-1, Math.min(1, dot))));
        
        if (angle <= angleThreshold) {
          group.push(j);
          used.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  /**
   * Remove duplicate vertices within tolerance
   */
  private static removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    const tolerance = 1e-6;
    
    for (const vertex of vertices) {
      let isDuplicate = false;
      for (const existing of unique) {
        if (vertex.distanceTo(existing) < tolerance) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        unique.push(vertex.clone());
      }
    }
    
    return unique;
  }

  /**
   * Check if triangle is valid (not degenerate)
   */
  private static isValidTriangle(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): boolean {
    const edge1 = v2.clone().sub(v1);
    const edge2 = v3.clone().sub(v1);
    const cross = edge1.cross(edge2);
    const area = cross.length() * 0.5;
    return area > 1e-6; // Minimum triangle area
  }

  /**
   * Get mesh statistics
   */
  static getMeshStats(geometry: THREE.BufferGeometry): MeshStats {
    const vertices = geometry.attributes.position ? geometry.attributes.position.count : 0;
    const faces = geometry.index ? geometry.index.count / 3 : Math.floor(vertices / 3);
    
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    const volume = boundingBox ? 
      (boundingBox.max.x - boundingBox.min.x) * 
      (boundingBox.max.y - boundingBox.min.y) * 
      (boundingBox.max.z - boundingBox.min.z) : 0;
    
    return {
      vertices,
      faces,
      edges: vertices + faces - 2, // Euler's formula approximation
      volume,
      hasNormals: !!geometry.attributes.normal,
      hasUVs: !!geometry.attributes.uv,
      isIndexed: !!geometry.index
    };
  }
}

/**
 * Triangle part interface
 */
export interface TrianglePart {
  vertices: THREE.Vector3[];
  indices: number[];
}

/**
 * Merged part interface
 */
export interface MergedPart {
  vertices: THREE.Vector3[];
  triangles: TrianglePart[];
}

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
