import * as THREE from 'three';

/**
 * STLGeometryValidator validates uploaded STL files for issues that could
 * affect parts list accuracy or 3D printing quality
 */
export class STLGeometryValidator {
  
  /**
   * Validate geometry and return comprehensive report
   */
  static validateGeometry(geometry: THREE.BufferGeometry): ValidationReport {
    console.log('Starting STL geometry validation...');
    
    const issues: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];
    const stats: ValidationStats = {
      totalTriangles: 0,
      totalPolygonFaces: 0,
      zeroAreaFaces: 0,
      degenerateTriangles: 0,
      duplicateVertices: 0,
      nonManifoldEdges: 0,
      invalidNormals: 0,
      minArea: Infinity,
      maxArea: 0,
      avgArea: 0
    };

    // Basic geometry checks
    if (!geometry || !geometry.attributes.position) {
      issues.push({
        type: 'critical',
        category: 'geometry',
        message: 'Invalid or empty geometry',
        details: 'Geometry has no position attributes'
      });
      return { issues, warnings, stats, isValid: false };
    }

    // Validate triangulated mesh
    this.validateTriangles(geometry, issues, warnings, stats);
    
    // Validate polygon faces if they exist
    const polygonFaces = (geometry as any).polygonFaces;
    if (polygonFaces && Array.isArray(polygonFaces)) {
      this.validatePolygonFaces(polygonFaces, issues, warnings, stats);
    }
    
    // Check for manifold geometry
    this.validateManifoldness(geometry, issues, warnings, stats);
    
    // Validate normals
    this.validateNormals(geometry, issues, warnings, stats);
    
    // Check for duplicate vertices
    this.validateVertices(geometry, issues, warnings, stats);
    
    // Calculate final stats
    stats.avgArea = stats.totalTriangles > 0 ? stats.avgArea / stats.totalTriangles : 0;
    
    const isValid = issues.length === 0;
    
    console.log(`Validation complete: ${isValid ? 'PASSED' : 'FAILED'}`);
    console.log(`Issues: ${issues.length}, Warnings: ${warnings.length}`);
    
    return { issues, warnings, stats, isValid };
  }

  /**
   * Validate triangle mesh for degenerate triangles and zero areas
   */
  private static validateTriangles(
    geometry: THREE.BufferGeometry, 
    issues: ValidationIssue[], 
    warnings: ValidationIssue[], 
    stats: ValidationStats
  ): void {
    const positions = geometry.attributes.position;
    const triangleCount = Math.floor(positions.count / 3);
    stats.totalTriangles = triangleCount;
    
    let totalArea = 0;
    const areaThreshold = 1e-10; // Very small area threshold
    
    for (let i = 0; i < triangleCount; i++) {
      const i3 = i * 3;
      
      // Get triangle vertices
      const v1 = new THREE.Vector3(
        positions.getX(i3 * 3),
        positions.getY(i3 * 3),
        positions.getZ(i3 * 3)
      );
      const v2 = new THREE.Vector3(
        positions.getX(i3 * 3 + 3),
        positions.getY(i3 * 3 + 3),
        positions.getZ(i3 * 3 + 3)
      );
      const v3 = new THREE.Vector3(
        positions.getX(i3 * 3 + 6),
        positions.getY(i3 * 3 + 6),
        positions.getZ(i3 * 3 + 6)
      );
      
      // Calculate area
      const edge1 = new THREE.Vector3().subVectors(v2, v1);
      const edge2 = new THREE.Vector3().subVectors(v3, v1);
      const area = edge1.cross(edge2).length() / 2;
      
      // Check for zero/tiny area
      if (area < areaThreshold) {
        stats.zeroAreaFaces++;
        if (area === 0) {
          issues.push({
            type: 'error',
            category: 'geometry',
            message: `Triangle ${i + 1} has zero area`,
            details: `This triangle is degenerate and will cause issues in parts export`
          });
        } else {
          warnings.push({
            type: 'warning',
            category: 'geometry',
            message: `Triangle ${i + 1} has very small area (${area.toExponential(2)})`,
            details: `This may cause precision issues in parts calculation`
          });
        }
      }
      
      // Check for degenerate triangles (identical vertices)
      if (v1.distanceTo(v2) < 1e-6 || v2.distanceTo(v3) < 1e-6 || v3.distanceTo(v1) < 1e-6) {
        stats.degenerateTriangles++;
        issues.push({
          type: 'error',
          category: 'geometry',
          message: `Triangle ${i + 1} is degenerate (duplicate vertices)`,
          details: `This triangle has vertices that are too close together`
        });
      }
      
      // Track area statistics
      if (area > 0) {
        stats.minArea = Math.min(stats.minArea, area);
        stats.maxArea = Math.max(stats.maxArea, area);
        totalArea += area;
      }
    }
    
    stats.avgArea = totalArea;
    
    if (stats.minArea === Infinity) stats.minArea = 0;
  }

  /**
   * Validate polygon faces for accuracy issues
   */
  private static validatePolygonFaces(
    polygonFaces: any[], 
    issues: ValidationIssue[], 
    warnings: ValidationIssue[], 
    stats: ValidationStats
  ): void {
    stats.totalPolygonFaces = polygonFaces.length;
    
    polygonFaces.forEach((face, index) => {
      if (!face.originalVertices || !Array.isArray(face.originalVertices)) {
        issues.push({
          type: 'error',
          category: 'polygon_face',
          message: `Polygon face ${index + 1} missing vertex data`,
          details: `Face cannot be processed for parts export`
        });
        return;
      }
      
      const vertices = face.originalVertices;
      
      // Check for sufficient vertices
      if (vertices.length < 3) {
        issues.push({
          type: 'error',
          category: 'polygon_face',
          message: `Polygon face ${index + 1} has only ${vertices.length} vertices`,
          details: `Minimum 3 vertices required for a valid face`
        });
        return;
      }
      
      // Calculate polygon area
      let area = 0;
      if (vertices.length === 3) {
        // Triangle area
        const edge1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
        const edge2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
        area = edge1.cross(edge2).length() / 2;
      } else {
        // Polygon area using triangulation
        const centroid = new THREE.Vector3();
        vertices.forEach((v: THREE.Vector3) => centroid.add(v));
        centroid.divideScalar(vertices.length);
        
        for (let i = 0; i < vertices.length; i++) {
          const next = (i + 1) % vertices.length;
          const edge1 = new THREE.Vector3().subVectors(vertices[i], centroid);
          const edge2 = new THREE.Vector3().subVectors(vertices[next], centroid);
          area += edge1.cross(edge2).length() / 2;
        }
      }
      
      // Check for zero area
      if (area < 1e-10) {
        stats.zeroAreaFaces++;
        issues.push({
          type: 'error',
          category: 'polygon_face',
          message: `Polygon face ${index + 1} (${face.type}) has zero or near-zero area`,
          details: `Area: ${area.toExponential(2)}. This face will not export properly.`
        });
      }
      
      // Check for invalid normal
      if (!face.normal || face.normal.length() < 0.1) {
        stats.invalidNormals++;
        warnings.push({
          type: 'warning',
          category: 'polygon_face',
          message: `Polygon face ${index + 1} has invalid normal vector`,
          details: `This may affect face orientation in exported parts`
        });
      }
      
      // Check for self-intersecting polygon (basic check)
      if (vertices.length > 4) {
        const isConvex = this.checkPolygonConvexity(vertices);
        if (!isConvex) {
          warnings.push({
            type: 'warning',
            category: 'polygon_face',
            message: `Polygon face ${index + 1} may be non-convex or self-intersecting`,
            details: `This could cause issues during parts export triangulation`
          });
        }
      }
    });
  }

  /**
   * Check if polygon is convex (basic check)
   */
  private static checkPolygonConvexity(vertices: THREE.Vector3[]): boolean {
    if (vertices.length < 4) return true;
    
    // Simple convexity check using cross products
    let sign = 0;
    for (let i = 0; i < vertices.length; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % vertices.length];
      const p3 = vertices[(i + 2) % vertices.length];
      
      const edge1 = new THREE.Vector3().subVectors(p2, p1);
      const edge2 = new THREE.Vector3().subVectors(p3, p2);
      const cross = edge1.cross(edge2);
      
      const currentSign = cross.z > 0 ? 1 : -1;
      if (sign === 0) {
        sign = currentSign;
      } else if (sign !== currentSign) {
        return false; // Non-convex
      }
    }
    
    return true;
  }

  /**
   * Validate manifold geometry
   */
  private static validateManifoldness(
    geometry: THREE.BufferGeometry, 
    issues: ValidationIssue[], 
    warnings: ValidationIssue[], 
    stats: ValidationStats
  ): void {
    // Basic manifold check - each edge should be shared by exactly 2 faces
    const edgeMap = new Map<string, number>();
    const positions = geometry.attributes.position;
    const triangleCount = Math.floor(positions.count / 3);
    
    for (let i = 0; i < triangleCount; i++) {
      const i3 = i * 3;
      
      // Get triangle vertices
      const vertices = [
        new THREE.Vector3(positions.getX(i3 * 3), positions.getY(i3 * 3), positions.getZ(i3 * 3)),
        new THREE.Vector3(positions.getX(i3 * 3 + 3), positions.getY(i3 * 3 + 3), positions.getZ(i3 * 3 + 3)),
        new THREE.Vector3(positions.getX(i3 * 3 + 6), positions.getY(i3 * 3 + 6), positions.getZ(i3 * 3 + 6))
      ];
      
      // Check each edge
      for (let j = 0; j < 3; j++) {
        const v1 = vertices[j];
        const v2 = vertices[(j + 1) % 3];
        
        const edge = this.createEdgeKey(v1, v2);
        edgeMap.set(edge, (edgeMap.get(edge) || 0) + 1);
      }
    }
    
    // Count non-manifold edges
    for (const [edge, count] of edgeMap) {
      if (count !== 2) {
        stats.nonManifoldEdges++;
      }
    }
    
    if (stats.nonManifoldEdges > 0) {
      warnings.push({
        type: 'warning',
        category: 'topology',
        message: `Found ${stats.nonManifoldEdges} non-manifold edges`,
        details: `The geometry may have holes or non-manifold topology that could affect printing`
      });
    }
  }

  /**
   * Validate vertex normals
   */
  private static validateNormals(
    geometry: THREE.BufferGeometry, 
    issues: ValidationIssue[], 
    warnings: ValidationIssue[], 
    stats: ValidationStats
  ): void {
    const normals = geometry.attributes.normal;
    if (!normals) {
      warnings.push({
        type: 'warning',
        category: 'normals',
        message: 'Geometry has no normal vectors',
        details: 'Normals will be computed automatically'
      });
      return;
    }
    
    // Check for invalid normals
    for (let i = 0; i < normals.count; i++) {
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);
      
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
      
      if (length < 0.1 || !isFinite(length)) {
        stats.invalidNormals++;
      }
    }
    
    if (stats.invalidNormals > 0) {
      warnings.push({
        type: 'warning',
        category: 'normals',
        message: `Found ${stats.invalidNormals} invalid normal vectors`,
        details: 'Some normals may be zero or non-finite'
      });
    }
  }

  /**
   * Validate vertices for duplicates and issues
   */
  private static validateVertices(
    geometry: THREE.BufferGeometry, 
    issues: ValidationIssue[], 
    warnings: ValidationIssue[], 
    stats: ValidationStats
  ): void {
    const positions = geometry.attributes.position;
    const vertexMap = new Map<string, number>();
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      
      // Check for invalid coordinates
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
        issues.push({
          type: 'error',
          category: 'vertices',
          message: `Vertex ${i + 1} has invalid coordinates`,
          details: `Coordinates: (${x}, ${y}, ${z})`
        });
        continue;
      }
      
      // Count duplicates
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      vertexMap.set(key, (vertexMap.get(key) || 0) + 1);
    }
    
    // Count total duplicates
    for (const [key, count] of vertexMap) {
      if (count > 1) {
        stats.duplicateVertices += count - 1;
      }
    }
    
    if (stats.duplicateVertices > 0) {
      warnings.push({
        type: 'warning',
        category: 'vertices',
        message: `Found ${stats.duplicateVertices} duplicate vertices`,
        details: 'This may affect geometry optimization but is usually not critical'
      });
    }
  }

  /**
   * Create a consistent edge key for manifold checking
   */
  private static createEdgeKey(v1: THREE.Vector3, v2: THREE.Vector3): string {
    const key1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)},${v1.z.toFixed(6)}`;
    const key2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)},${v2.z.toFixed(6)}`;
    return key1 < key2 ? `${key1}|${key2}` : `${key2}|${key1}`;
  }

  /**
   * Generate a user-friendly validation summary
   */
  static generateValidationSummary(report: ValidationReport): string {
    const { issues, warnings, stats, isValid } = report;
    
    let summary = `STL Validation ${isValid ? '✅ PASSED' : '❌ FAILED'}\n\n`;
    
    // Statistics
    summary += `📊 Geometry Statistics:\n`;
    summary += `• Triangles: ${stats.totalTriangles.toLocaleString()}\n`;
    if (stats.totalPolygonFaces > 0) {
      summary += `• Polygon Faces: ${stats.totalPolygonFaces.toLocaleString()}\n`;
    }
    summary += `• Area Range: ${stats.minArea.toFixed(6)} - ${stats.maxArea.toFixed(6)}\n`;
    summary += `• Average Area: ${stats.avgArea.toFixed(6)}\n\n`;
    
    // Issues
    if (issues.length > 0) {
      summary += `🚨 Critical Issues (${issues.length}):\n`;
      issues.forEach((issue, i) => {
        summary += `${i + 1}. ${issue.message}\n   ${issue.details}\n`;
      });
      summary += '\n';
    }
    
    // Warnings
    if (warnings.length > 0) {
      summary += `⚠️ Warnings (${warnings.length}):\n`;
      warnings.forEach((warning, i) => {
        summary += `${i + 1}. ${warning.message}\n   ${warning.details}\n`;
      });
      summary += '\n';
    }
    
    if (isValid) {
      summary += `✅ This STL is ready for accurate parts export!`;
    } else {
      summary += `❌ Please fix critical issues before exporting parts.`;
    }
    
    return summary;
  }
}

// Types
export interface ValidationReport {
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: ValidationStats;
  isValid: boolean;
}

export interface ValidationIssue {
  type: 'critical' | 'error' | 'warning';
  category: 'geometry' | 'polygon_face' | 'topology' | 'normals' | 'vertices';
  message: string;
  details: string;
}

export interface ValidationStats {
  totalTriangles: number;
  totalPolygonFaces: number;
  zeroAreaFaces: number;
  degenerateTriangles: number;
  duplicateVertices: number;
  nonManifoldEdges: number;
  invalidNormals: number;
  minArea: number;
  maxArea: number;
  avgArea: number;
}
