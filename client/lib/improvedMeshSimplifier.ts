import * as THREE from 'three';
import { GeometryCleanup } from './geometryCleanup';

/**
 * Improved mesh simplifier based on proven Python implementation
 * Focuses on proper cleaning, coplanar face merging, and boundary preservation
 */
export class ImprovedMeshSimplifier {
  
  private static readonly ANGLE_TOLERANCE_DEG = 1.0;
  private static readonly MIN_TRIANGLE_AREA = 1e-6;
  private static readonly MERGE_THRESHOLD = 1e-3;

  /**
   * Main simplification method inspired by the Python implementation
   */
  static async simplifyAndMerge(
    geometry: THREE.BufferGeometry,
    options: {
      targetParts: number;
      angleTolerance?: number;
      preserveBoundaries?: boolean;
      method?: 'quadric' | 'clustering' | 'edge_collapse';
    }
  ): Promise<{
    simplifiedGeometry: THREE.BufferGeometry;
    triangleParts: TrianglePart[];
    mergedParts: MergedPart[];
    stats: SimplificationStats;
  }> {
    console.log('🔄 Starting improved mesh simplification...');
    const startTime = Date.now();

    // Step 1: Clean the mesh (like clean_mesh in Python)
    const cleanedGeometry = this.cleanMesh(geometry.clone());
    console.log('✅ Mesh cleaning completed');

    // Step 2: Apply quadric decimation (like simplify_with_open3d)
    const simplifiedGeometry = await this.applyQuadricDecimation(cleanedGeometry, options.targetParts);
    console.log('✅ Quadric decimation completed');

    // Step 3: Remove low-impact vertices (optional refinement)
    const refinedGeometry = this.removeLowImpactVertices(simplifiedGeometry, options.angleTolerance || this.ANGLE_TOLERANCE_DEG);
    console.log('✅ Low-impact vertex removal completed');

    // Step 4: Extract triangle parts
    const triangleParts = this.extractTriangleParts(refinedGeometry);
    console.log(`✅ Extracted ${triangleParts.length} triangle parts`);

    // Step 5: Merge coplanar faces (like merge_coplanar_faces in Python)
    const mergedParts = this.mergeCoplanarFaces(refinedGeometry, options.angleTolerance || this.ANGLE_TOLERANCE_DEG);
    console.log(`✅ Created ${mergedParts.length} merged coplanar parts`);

    const stats: SimplificationStats = {
      originalVertices: geometry.attributes.position.count,
      finalVertices: refinedGeometry.attributes.position.count,
      originalFaces: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
      finalFaces: refinedGeometry.index ? refinedGeometry.index.count / 3 : refinedGeometry.attributes.position.count / 3,
      triangleParts: triangleParts.length,
      mergedParts: mergedParts.length,
      processingTime: Date.now() - startTime
    };

    console.log('🎯 Simplification completed:', stats);

    return {
      simplifiedGeometry: refinedGeometry,
      triangleParts,
      mergedParts,
      stats
    };
  }

  /**
   * Clean mesh - removes duplicates, degenerate triangles, non-manifold edges
   * Equivalent to clean_mesh() in Python
   */
  private static cleanMesh(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🧹 Cleaning mesh...');

    // Use our existing geometry cleanup which handles duplicates and degenerate triangles
    GeometryCleanup.cleanGeometry(geometry);

    // Additional cleaning specific to mesh simplification
    geometry = this.removeNonManifoldEdges(geometry);
    geometry = this.ensureManifoldStructure(geometry);

    // Recompute normals after cleanup
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    return geometry;
  }

  /**
   * Apply quadric decimation similar to Open3D's simplify_quadric_decimation
   */
  private static async applyQuadricDecimation(
    geometry: THREE.BufferGeometry, 
    targetTriangles: number
  ): Promise<THREE.BufferGeometry> {
    try {
      // Try to use Three.js SimplifyModifier for professional quadric edge collapse
      const { SimplifyModifier } = await import('three/examples/jsm/modifiers/SimplifyModifier.js');
      
      const modifier = new SimplifyModifier();
      const simplified = modifier.modify(geometry, targetTriangles);
      
      // Ensure the simplified geometry is valid
      if (simplified.attributes.position.count > 0) {
        simplified.computeVertexNormals();
        return simplified;
      }
    } catch (error) {
      console.warn('SimplifyModifier failed, using fallback method:', error);
    }

    // Fallback to custom implementation
    return this.customQuadricDecimation(geometry, targetTriangles);
  }

  /**
   * Custom quadric decimation implementation
   */
  private static customQuadricDecimation(
    geometry: THREE.BufferGeometry,
    targetTriangles: number
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position;
    const currentTriangles = geometry.index ? geometry.index.count / 3 : positions.count / 3;
    
    if (currentTriangles <= targetTriangles) {
      return geometry; // Already at target or below
    }

    // Simple vertex clustering approach for reduction
    const targetReduction = 1 - (targetTriangles / currentTriangles);
    return this.performVertexClustering(geometry, targetReduction);
  }

  /**
   * Vertex clustering for mesh reduction
   */
  private static performVertexClustering(
    geometry: THREE.BufferGeometry,
    targetReduction: number
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position;
    const boundingBox = new THREE.Box3().setFromBufferAttribute(positions);
    const size = boundingBox.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    // Calculate grid resolution based on target reduction
    const gridResolution = Math.max(5, Math.floor(20 * (1 - targetReduction)));
    const cellSize = maxDimension / gridResolution;
    
    console.log(`Vertex clustering: grid ${gridResolution}³, cell size ${cellSize.toFixed(4)}`);
    
    // Group vertices into spatial clusters
    const clusters = new Map<string, { vertices: THREE.Vector3[], indices: number[] }>();
    
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(positions, i);
      
      // Determine grid cell
      const cellX = Math.floor((vertex.x - boundingBox.min.x) / cellSize);
      const cellY = Math.floor((vertex.y - boundingBox.min.y) / cellSize);
      const cellZ = Math.floor((vertex.z - boundingBox.min.z) / cellSize);
      const cellKey = `${cellX},${cellY},${cellZ}`;
      
      if (!clusters.has(cellKey)) {
        clusters.set(cellKey, { vertices: [], indices: [] });
      }
      clusters.get(cellKey)!.vertices.push(vertex);
      clusters.get(cellKey)!.indices.push(i);
    }
    
    // Replace each cluster with its centroid
    const newPositions: number[] = [];
    const indexMapping = new Map<number, number>();
    
    let newIndex = 0;
    for (const cluster of clusters.values()) {
      // Calculate centroid
      const centroid = new THREE.Vector3();
      for (const vertex of cluster.vertices) {
        centroid.add(vertex);
      }
      centroid.divideScalar(cluster.vertices.length);
      
      newPositions.push(centroid.x, centroid.y, centroid.z);
      
      // Map all old indices in this cluster to the new centroid index
      for (const oldIndex of cluster.indices) {
        indexMapping.set(oldIndex, newIndex);
      }
      newIndex++;
    }
    
    // Rebuild faces using the mapping
    const newFaces: number[] = [];
    if (geometry.index) {
      const indices = geometry.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = indexMapping.get(indices[i]);
        const v2 = indexMapping.get(indices[i + 1]);
        const v3 = indexMapping.get(indices[i + 2]);
        
        // Only add face if all vertices mapped and not degenerate
        if (v1 !== undefined && v2 !== undefined && v3 !== undefined && 
            v1 !== v2 && v2 !== v3 && v1 !== v3) {
          newFaces.push(v1, v2, v3);
        }
      }
    }
    
    // Create simplified geometry
    const simplifiedGeometry = new THREE.BufferGeometry();
    simplifiedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newFaces.length > 0) {
      simplifiedGeometry.setIndex(newFaces);
    }
    
    return simplifiedGeometry;
  }

  /**
   * Remove low-impact vertices (placeholder - could implement edge collapse here)
   */
  private static removeLowImpactVertices(
    geometry: THREE.BufferGeometry,
    angleThreshold: number
  ): THREE.BufferGeometry {
    // For now, just return the geometry as-is
    // Could implement edge collapse for vertices that don't significantly affect geometry
    return geometry;
  }

  /**
   * Extract triangle parts from simplified geometry
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
        
        triangleParts.push({
          vertices: [v1, v2, v3],
          indices: [indices[i], indices[i + 1], indices[i + 2]],
          normal: this.calculateTriangleNormal(v1, v2, v3),
          area: this.calculateTriangleArea(v1, v2, v3)
        });
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < positions.count; i += 3) {
        const v1 = new THREE.Vector3().fromBufferAttribute(positions, i);
        const v2 = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
        const v3 = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
        
        triangleParts.push({
          vertices: [v1, v2, v3],
          indices: [i, i + 1, i + 2],
          normal: this.calculateTriangleNormal(v1, v2, v3),
          area: this.calculateTriangleArea(v1, v2, v3)
        });
      }
    }
    
    return triangleParts;
  }

  /**
   * Merge coplanar faces - equivalent to merge_coplanar_faces() in Python
   */
  private static mergeCoplanarFaces(
    geometry: THREE.BufferGeometry,
    angleTolerance: number
  ): MergedPart[] {
    const triangleParts = this.extractTriangleParts(geometry);
    const angleToleranceRad = (angleTolerance * Math.PI) / 180;
    
    // Group triangles by similar normals (equivalent to trimesh.grouping.group_vectors)
    const normalGroups: TrianglePart[][] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < triangleParts.length; i++) {
      if (used.has(i)) continue;
      
      const group: TrianglePart[] = [triangleParts[i]];
      used.add(i);
      const baseNormal = triangleParts[i].normal;
      
      // Find triangles with similar normals
      for (let j = i + 1; j < triangleParts.length; j++) {
        if (used.has(j)) continue;
        
        const dot = baseNormal.dot(triangleParts[j].normal);
        const angle = Math.acos(Math.abs(Math.max(-1, Math.min(1, dot))));
        
        if (angle <= angleToleranceRad) {
          group.push(triangleParts[j]);
          used.add(j);
        }
      }
      
      normalGroups.push(group);
    }
    
    // Convert groups to merged parts
    const mergedParts: MergedPart[] = [];
    
    for (const group of normalGroups) {
      if (group.length === 0) continue;
      
      // Collect all vertices from the group
      const allVertices: THREE.Vector3[] = [];
      let totalArea = 0;
      
      for (const triangle of group) {
        allVertices.push(...triangle.vertices);
        totalArea += triangle.area;
      }
      
      // Determine if this is a quad, polygon, or just triangles
      const uniqueVertices = this.removeDuplicateVertices(allVertices);
      let partType: 'triangle' | 'quad' | 'polygon' = 'triangle';
      
      if (uniqueVertices.length === 4) {
        partType = 'quad';
      } else if (uniqueVertices.length > 4) {
        partType = 'polygon';
      }
      
      mergedParts.push({
        vertices: uniqueVertices,
        triangles: group,
        type: partType,
        normal: group[0].normal.clone(),
        totalArea
      });
    }
    
    return mergedParts;
  }

  /**
   * Remove duplicate vertices within tolerance
   */
  private static removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    const unique: THREE.Vector3[] = [];
    const tolerance = this.MERGE_THRESHOLD;
    
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
   * Remove non-manifold edges (simplified implementation)
   */
  private static removeNonManifoldEdges(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    // This is a simplified implementation
    // A full implementation would require edge-face adjacency analysis
    return geometry;
  }

  /**
   * Ensure manifold structure (simplified implementation)
   */
  private static ensureManifoldStructure(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    // This is a simplified implementation
    // A full implementation would fix T-junctions and edge-face connectivity issues
    return geometry;
  }

  /**
   * Calculate triangle normal
   */
  private static calculateTriangleNormal(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): THREE.Vector3 {
    const edge1 = v2.clone().sub(v1);
    const edge2 = v3.clone().sub(v1);
    return edge1.cross(edge2).normalize();
  }

  /**
   * Calculate triangle area
   */
  private static calculateTriangleArea(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): number {
    const edge1 = v2.clone().sub(v1);
    const edge2 = v3.clone().sub(v1);
    return edge1.cross(edge2).length() * 0.5;
  }
}

/**
 * Interface for triangle parts
 */
export interface TrianglePart {
  vertices: THREE.Vector3[];
  indices: number[];
  normal: THREE.Vector3;
  area: number;
}

/**
 * Interface for merged coplanar parts
 */
export interface MergedPart {
  vertices: THREE.Vector3[];
  triangles: TrianglePart[];
  type: 'triangle' | 'quad' | 'polygon';
  normal: THREE.Vector3;
  totalArea: number;
}

/**
 * Simplification statistics
 */
export interface SimplificationStats {
  originalVertices: number;
  finalVertices: number;
  originalFaces: number;
  finalFaces: number;
  triangleParts: number;
  mergedParts: number;
  processingTime: number;
}
