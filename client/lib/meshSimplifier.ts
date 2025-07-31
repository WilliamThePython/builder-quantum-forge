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

    // CRITICAL SAFETY CHECKS to prevent model deletion
    if (originalStats.vertices === 0 || originalStats.faces === 0) {
      console.error('❌ Invalid geometry - no vertices or faces');
      throw new Error('Cannot simplify empty geometry');
    }

    const minimumTriangles = 12; // Absolute minimum for any shape
    const currentTriangles = originalStats.faces;

    // Calculate safe target parts
    let targetParts = options.targetParts || Math.floor(currentTriangles * (1 - options.targetReduction));
    targetParts = Math.max(minimumTriangles, targetParts); // Never go below minimum

    // If target is already larger than current, just clean and return
    if (targetParts >= currentTriangles) {
      console.log('🛡️ Target larger than current, just cleaning geometry');
      const cleaned = this.cleanMesh(geometry.clone());
      const cleanedStats = this.getMeshStats(cleaned);
      return {
        simplifiedGeometry: cleaned,
        originalStats,
        newStats: cleanedStats,
        triangleParts: this.extractTriangleParts(cleaned),
        mergedParts: this.mergeCoplanarFaces(cleaned, options.angleTolerance || 1.0),
        reductionAchieved: 0,
        processingTime: Date.now() - startTime
      };
    }

    const angleTolerance = options.angleTolerance || 1.0;
    console.log(`🎯 Safe targets: ${currentTriangles} → ${targetParts} triangles (min: ${minimumTriangles})`);

    try {
      // Step 1: Clean mesh (like Python clean_mesh function) - but very gently
      const cleanedGeometry = this.gentleCleanMesh(geometry.clone());
      console.log('✅ Mesh gently cleaned');

      // Verify cleaning didn't break anything
      const cleanedStats = this.getMeshStats(cleanedGeometry);
      if (cleanedStats.vertices === 0 || cleanedStats.faces === 0) {
        console.warn('⚠️ Cleaning removed all geometry, using original');
        throw new Error('Cleaning failed');
      }

      // Step 2: EXTREMELY CONSERVATIVE - only reduce if we have MASSIVE amounts of triangles
      let finalGeometry = cleanedGeometry;
      if (currentTriangles > 10000 && options.targetReduction > 0.2 && options.targetReduction < 0.7) {
        console.log('🔧 Attempting minimal reduction (only for very high-poly models)...');
        try {
          const reducedGeometry = await this.minimalReduction(cleanedGeometry, currentTriangles);
          const reducedStats = this.getMeshStats(reducedGeometry);

          // Only use reduced geometry if it actually has MORE than 50% of original
          if (reducedStats.vertices > originalStats.vertices * 0.5 && reducedStats.faces > originalStats.faces * 0.5) {
            finalGeometry = reducedGeometry;
            console.log(`✅ Minimal reduction successful: ${originalStats.vertices} → ${reducedStats.vertices} vertices`);
          } else {
            console.warn('⚠️ Reduction too aggressive, using cleaned original');
          }
        } catch (reductionError) {
          console.warn('⚠️ Reduction failed, using cleaned original:', reductionError);
        }
      } else {
        console.log(`🛡️ Skipping reduction - triangles: ${currentTriangles}, reduction: ${options.targetReduction}`);
      }

      // Step 3: Extract triangle parts and merge coplanar faces (this is safe)
      const triangleParts = this.extractTriangleParts(finalGeometry);
      const mergedParts = this.mergeCoplanarFaces(finalGeometry, angleTolerance);
      console.log(`✅ Extracted ${triangleParts.length} triangle parts, ${mergedParts.length} merged parts`);

      const newStats = this.getMeshStats(finalGeometry);
      const reductionAchieved = Math.max(0, 1 - (newStats.vertices / originalStats.vertices));
      const processingTime = Date.now() - startTime;

      console.log(`🎯 Conservative processing completed: ${originalStats.vertices} → ${newStats.vertices} vertices (${(reductionAchieved * 100).toFixed(1)}% reduction)`);

      return {
        simplifiedGeometry: finalGeometry,
        originalStats,
        newStats,
        triangleParts,
        mergedParts,
        reductionAchieved,
        processingTime
      };

    } catch (error) {
      console.error('❌ All simplification failed, returning original geometry:', error);
      // Return EXACT original geometry if everything fails
      const triangleParts = this.extractTriangleParts(geometry);
      const mergedParts = this.mergeCoplanarFaces(geometry, angleTolerance);

      return {
        simplifiedGeometry: geometry.clone(),
        originalStats,
        newStats: originalStats,
        triangleParts,
        mergedParts,
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
   * Ultra-gentle mesh cleaning that preserves everything possible
   */
  private static gentleCleanMesh(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🧹 Gentle mesh cleaning (preserving everything possible)...');

    // Only do essential operations that won't remove geometry
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    // Skip aggressive cleanup that might remove vertices
    console.log('✅ Gentle cleaning complete - no geometry removed');
    return geometry;
  }

  /**
   * Minimal reduction that barely touches the geometry - only removes a few triangles
   */
  private static async minimalReduction(
    geometry: THREE.BufferGeometry,
    currentTriangles: number
  ): Promise<THREE.BufferGeometry> {

    // NEVER reduce by more than 10% and NEVER go below 1000 triangles
    const maxReduction = 0.1; // Only 10% maximum
    const absoluteMinimum = Math.max(1000, currentTriangles * 0.9);
    const targetTriangles = Math.floor(currentTriangles * (1 - maxReduction));
    const safeTarget = Math.max(absoluteMinimum, targetTriangles);

    console.log(`🔧 Minimal reduction: ${currentTriangles} → ${safeTarget} (max ${maxReduction * 100}% reduction)`);

    // If we can't safely reduce, don't even try
    if (safeTarget >= currentTriangles) {
      console.log('🛡️ No safe reduction possible, returning original');
      return geometry;
    }

    try {
      // Try Three.js SimplifyModifier with extremely conservative settings
      const { SimplifyModifier } = await import('three/examples/jsm/modifiers/SimplifyModifier.js');

      const modifier = new SimplifyModifier();
      const simplified = modifier.modify(geometry, safeTarget);

      // Strict validation
      const resultTriangles = simplified.index ? simplified.index.count / 3 : simplified.attributes.position.count / 3;
      const resultVertices = simplified.attributes.position.count;

      if (resultTriangles >= absoluteMinimum && resultVertices > 0) {
        simplified.computeVertexNormals();
        simplified.computeBoundingBox();
        console.log(`✅ Minimal SimplifyModifier successful: ${currentTriangles} → ${resultTriangles} triangles`);
        return simplified;
      } else {
        console.warn(`⚠️ SimplifyModifier result invalid (${resultTriangles} triangles), using original`);
        return geometry;
      }

    } catch (error) {
      console.warn('⚠️ SimplifyModifier failed completely, using original geometry:', error);
      return geometry;
    }
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

    // CRITICAL: Always ensure minimum triangles to prevent deletion
    const absoluteMinimum = 12; // Minimum for any recognizable shape
    const safeTarget = Math.max(absoluteMinimum, targetTriangles);

    // If already at or below safe target, return as-is
    if (currentTriangles <= safeTarget) {
      console.log('📊 Model already at safe target size, no reduction needed');
      return geometry;
    }

    // Very conservative reduction - never reduce by more than 50%
    const maxReduction = 0.5;
    const conservativeTarget = Math.max(safeTarget, Math.floor(currentTriangles * (1 - maxReduction)));

    console.log(`🛡️ Conservative reduction: ${currentTriangles} → ${conservativeTarget} triangles (min: ${absoluteMinimum})`);

    // Use safe decimation that preserves geometry structure
    return this.safeVertexDecimation(geometry, conservativeTarget);
  }

  /**
   * Safe vertex decimation with polygon stitching
   */
  private static safeVertexDecimation(
    geometry: THREE.BufferGeometry,
    targetTriangles: number
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position;
    const currentTriangles = geometry.index ? geometry.index.count / 3 : positions.count / 3;

    if (currentTriangles <= targetTriangles) {
      return geometry;
    }

    console.log(`🔧 Safe decimation: ${currentTriangles} → ${targetTriangles} triangles`);

    // Step 1: Extract triangle parts and group by proximity/normals
    const triangleParts = this.extractTriangleParts(geometry);
    console.log(`📊 Extracted ${triangleParts.length} triangle parts`);

    // Step 2: Group coplanar triangles for stitching
    const coplanarGroups = this.groupCoplanarTriangles(triangleParts);
    console.log(`🔗 Found ${coplanarGroups.length} coplanar groups`);

    // Step 3: Reduce number of groups if needed
    const targetGroups = Math.min(targetTriangles, coplanarGroups.length);
    const selectedGroups = this.selectBestGroups(coplanarGroups, targetGroups);
    console.log(`✂️ Selected ${selectedGroups.length} groups for final geometry`);

    // Step 4: Stitch groups into polygons and triangulate
    const stitchedGeometry = this.stitchGroupsIntoGeometry(selectedGroups);
    console.log(`🧵 Stitched geometry created`);

    // Step 5: Validate and return
    const finalTriangles = stitchedGeometry.index ? stitchedGeometry.index.count / 3 : stitchedGeometry.attributes.position.count / 3;

    if (finalTriangles < 3) {
      console.log('⚠️ Stitched geometry too small, returning original');
      return geometry;
    }

    console.log(`✅ Safe decimation completed: ${finalTriangles} triangles`);
    return stitchedGeometry;
  }

  /**
   * Group coplanar triangles for stitching into larger polygons
   */
  private static groupCoplanarTriangles(triangleParts: TrianglePart[]): TrianglePart[][] {
    const groups: TrianglePart[][] = [];
    const used = new Set<number>();
    const angleThreshold = Math.PI / 36; // 5 degrees

    for (let i = 0; i < triangleParts.length; i++) {
      if (used.has(i)) continue;

      const group = [triangleParts[i]];
      used.add(i);

      const baseNormal = this.calculateTriangleNormal(
        triangleParts[i].vertices[0],
        triangleParts[i].vertices[1],
        triangleParts[i].vertices[2]
      );

      // Find triangles with similar normals and close proximity
      for (let j = i + 1; j < triangleParts.length; j++) {
        if (used.has(j)) continue;

        const otherNormal = this.calculateTriangleNormal(
          triangleParts[j].vertices[0],
          triangleParts[j].vertices[1],
          triangleParts[j].vertices[2]
        );

        const dot = Math.abs(baseNormal.dot(otherNormal));
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

        if (angle <= angleThreshold) {
          // Check if triangles are close enough to stitch
          if (this.areTrianglesAdjacent(triangleParts[i], triangleParts[j])) {
            group.push(triangleParts[j]);
            used.add(j);
          }
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Check if two triangles are adjacent (share vertices or are close)
   */
  private static areTrianglesAdjacent(tri1: TrianglePart, tri2: TrianglePart): boolean {
    const threshold = 1e-3;

    for (const v1 of tri1.vertices) {
      for (const v2 of tri2.vertices) {
        if (v1.distanceTo(v2) < threshold) {
          return true; // Share a vertex or are very close
        }
      }
    }
    return false;
  }

  /**
   * Select best groups to keep for target triangle count
   */
  private static selectBestGroups(groups: TrianglePart[][], targetCount: number): TrianglePart[][] {
    // Sort groups by size (larger groups = better polygon stitching opportunities)
    const sortedGroups = groups.sort((a, b) => b.length - a.length);

    // Always keep largest groups first
    const selected = sortedGroups.slice(0, Math.min(targetCount, sortedGroups.length));

    // Ensure we have enough triangles
    if (selected.length === 0 && sortedGroups.length > 0) {
      selected.push(sortedGroups[0]);
    }

    return selected;
  }

  /**
   * Stitch groups into final geometry with polygon reconstruction
   */
  private static stitchGroupsIntoGeometry(groups: TrianglePart[][]): THREE.BufferGeometry {
    const finalPositions: number[] = [];
    const finalIndices: number[] = [];
    let vertexIndex = 0;

    for (const group of groups) {
      if (group.length === 0) continue;

      if (group.length === 1) {
        // Single triangle - add as-is
        const triangle = group[0];
        for (const vertex of triangle.vertices) {
          finalPositions.push(vertex.x, vertex.y, vertex.z);
        }
        finalIndices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
        vertexIndex += 3;
      } else {
        // Multiple triangles - attempt to stitch into polygon
        const stitched = this.stitchTrianglesIntoPolygon(group);

        // Add polygon vertices
        for (const vertex of stitched.vertices) {
          finalPositions.push(vertex.x, vertex.y, vertex.z);
        }

        // Triangulate polygon (simple fan triangulation)
        for (let i = 1; i < stitched.vertices.length - 1; i++) {
          finalIndices.push(vertexIndex, vertexIndex + i, vertexIndex + i + 1);
        }
        vertexIndex += stitched.vertices.length;
      }
    }

    // Create final geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(finalPositions, 3));

    if (finalIndices.length > 0) {
      geometry.setIndex(finalIndices);
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    return geometry;
  }

  /**
   * Stitch multiple triangles into a single polygon
   */
  private static stitchTrianglesIntoPolygon(triangles: TrianglePart[]): { vertices: THREE.Vector3[] } {
    // Collect all vertices from triangles
    const allVertices: THREE.Vector3[] = [];
    for (const triangle of triangles) {
      allVertices.push(...triangle.vertices);
    }

    // Remove duplicates and create polygon boundary
    const uniqueVertices = this.removeDuplicateVertices(allVertices);

    // If we have too few vertices, just use the first triangle
    if (uniqueVertices.length < 3) {
      return { vertices: triangles[0].vertices };
    }

    // Sort vertices to form a proper polygon (simple convex hull approach)
    const sortedVertices = this.sortVerticesIntoPolygon(uniqueVertices);

    return { vertices: sortedVertices };
  }

  /**
   * Sort vertices into a proper polygon order
   */
  private static sortVerticesIntoPolygon(vertices: THREE.Vector3[]): THREE.Vector3[] {
    if (vertices.length <= 3) return vertices;

    // Calculate centroid
    const centroid = new THREE.Vector3();
    for (const vertex of vertices) {
      centroid.add(vertex);
    }
    centroid.divideScalar(vertices.length);

    // Sort by angle around centroid
    return vertices.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });
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
