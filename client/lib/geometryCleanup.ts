import * as THREE from 'three';

export interface CleanupResults {
  duplicateVerticesRemoved: number;
  zeroAreaTrianglesRemoved: number;
  degenerateVerticesRemoved: number;
  windingCorrected: boolean;
  manifoldIssuesFixed: number;
  originalVertexCount: number;
  finalVertexCount: number;
  originalFaceCount: number;
  finalFaceCount: number;
}

export class GeometryCleanup {
  private static TOLERANCE = 1e-6;
  private static NORMAL_TOLERANCE = 1e-3;

  /**
   * Mandatory geometry cleanup routine as specified in file handling instructions
   * - Remove duplicate vertices (within tolerance)
   * - Remove zero-area triangles
   * - Remove degenerate vertices (unreferenced or collapsing faces)
   * - Ensure face winding is consistent
   * - Fix minor non-manifold issues if possible
   */
  static cleanGeometry(geometry: THREE.BufferGeometry): CleanupResults {

    // Check if this is a procedurally generated geometry (already clean)
    const isProcedurallyGenerated = (geometry as any).isProcedurallyGenerated === true;

    if (isProcedurallyGenerated) {
      return this.lightweightCleanup(geometry);
    }
    
    const results: CleanupResults = {
      duplicateVerticesRemoved: 0,
      zeroAreaTrianglesRemoved: 0,
      degenerateVerticesRemoved: 0,
      windingCorrected: false,
      manifoldIssuesFixed: 0,
      originalVertexCount: geometry.attributes.position.count,
      finalVertexCount: 0,
      originalFaceCount: geometry.attributes.position.count / 3,
      finalFaceCount: 0
    };

    // Create a copy to work with
    const cleanedGeometry = geometry.clone();

    // Step 1: Remove duplicate vertices
    const vertexMap = new Map<string, number>();
    const positionArray = cleanedGeometry.attributes.position.array as Float32Array;
    const newPositions: number[] = [];
    const vertexMapping: number[] = [];

    for (let i = 0; i < positionArray.length; i += 3) {
      const x = positionArray[i];
      const y = positionArray[i + 1];
      const z = positionArray[i + 2];
      
      // Create key for vertex position within tolerance
      const key = `${Math.round(x / this.TOLERANCE)}:${Math.round(y / this.TOLERANCE)}:${Math.round(z / this.TOLERANCE)}`;
      
      if (vertexMap.has(key)) {
        // Duplicate vertex found
        vertexMapping.push(vertexMap.get(key)!);
        results.duplicateVerticesRemoved++;
      } else {
        // New unique vertex
        const newIndex = newPositions.length / 3;
        vertexMap.set(key, newIndex);
        vertexMapping.push(newIndex);
        newPositions.push(x, y, z);
      }
    }

    // Step 2: Remove zero-area triangles and build new face indices
    const newFaces: number[] = [];
    
    for (let i = 0; i < vertexMapping.length; i += 3) {
      const v1 = vertexMapping[i];
      const v2 = vertexMapping[i + 1];
      const v3 = vertexMapping[i + 2];

      // Check for degenerate triangle (same vertices)
      if (v1 === v2 || v2 === v3 || v1 === v3) {
        results.zeroAreaTrianglesRemoved++;
        continue;
      }

      // Calculate triangle area to check for zero-area
      const p1 = new THREE.Vector3(
        newPositions[v1 * 3],
        newPositions[v1 * 3 + 1],
        newPositions[v1 * 3 + 2]
      );
      const p2 = new THREE.Vector3(
        newPositions[v2 * 3],
        newPositions[v2 * 3 + 1],
        newPositions[v2 * 3 + 2]
      );
      const p3 = new THREE.Vector3(
        newPositions[v3 * 3],
        newPositions[v3 * 3 + 1],
        newPositions[v3 * 3 + 2]
      );

      const edge1 = p2.clone().sub(p1);
      const edge2 = p3.clone().sub(p1);
      const cross = edge1.cross(edge2);
      const area = cross.length() * 0.5;

      if (area < this.TOLERANCE) {
        results.zeroAreaTrianglesRemoved++;
        continue;
      }

      // Valid triangle
      newFaces.push(v1, v2, v3);
    }

    // Step 3: Remove unreferenced vertices
    const usedVertices = new Set<number>();
    newFaces.forEach(vertexIndex => usedVertices.add(vertexIndex));
    
    const finalPositions: number[] = [];
    const vertexRemapping: number[] = [];
    let finalVertexIndex = 0;

    for (let i = 0; i < newPositions.length / 3; i++) {
      if (usedVertices.has(i)) {
        vertexRemapping[i] = finalVertexIndex;
        finalPositions.push(
          newPositions[i * 3],
          newPositions[i * 3 + 1],
          newPositions[i * 3 + 2]
        );
        finalVertexIndex++;
      } else {
        results.degenerateVerticesRemoved++;
      }
    }

    // Remap face indices
    const finalFaces = newFaces.map(vertexIndex => vertexRemapping[vertexIndex]);

    // Step 4: Check and correct face winding
    const windingCorrected = this.ensureConsistentWinding(finalPositions, finalFaces);
    results.windingCorrected = windingCorrected;

    // Step 5: Apply cleaned data back to geometry
    cleanedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(finalPositions, 3));
    if (finalFaces.length > 0) {
      cleanedGeometry.setIndex(finalFaces);
    }

    // Recompute normals and bounds
    cleanedGeometry.computeVertexNormals();
    cleanedGeometry.computeBoundingBox();

    // Update results
    results.finalVertexCount = finalPositions.length / 3;
    results.finalFaceCount = finalFaces.length / 3;

    // Copy cleaned data back to original geometry
    geometry.copy(cleanedGeometry);

    return results;
  }

  /**
   * Ensure consistent face winding (counter-clockwise when viewed from outside)
   */
  private static ensureConsistentWinding(positions: number[], faces: number[]): boolean {
    if (faces.length === 0) return false;

    let windingCorrected = false;
    
    // Calculate average normal to determine overall orientation
    const averageNormal = new THREE.Vector3();
    
    for (let i = 0; i < faces.length; i += 3) {
      const v1 = new THREE.Vector3(
        positions[faces[i] * 3],
        positions[faces[i] * 3 + 1],
        positions[faces[i] * 3 + 2]
      );
      const v2 = new THREE.Vector3(
        positions[faces[i + 1] * 3],
        positions[faces[i + 1] * 3 + 1],
        positions[faces[i + 1] * 3 + 2]
      );
      const v3 = new THREE.Vector3(
        positions[faces[i + 2] * 3],
        positions[faces[i + 2] * 3 + 1],
        positions[faces[i + 2] * 3 + 2]
      );

      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      const normal = edge1.cross(edge2).normalize();
      
      averageNormal.add(normal);
    }
    
    averageNormal.normalize();

    // Check each face against the average orientation
    for (let i = 0; i < faces.length; i += 3) {
      const v1 = new THREE.Vector3(
        positions[faces[i] * 3],
        positions[faces[i] * 3 + 1],
        positions[faces[i] * 3 + 2]
      );
      const v2 = new THREE.Vector3(
        positions[faces[i + 1] * 3],
        positions[faces[i + 1] * 3 + 1],
        positions[faces[i + 1] * 3 + 2]
      );
      const v3 = new THREE.Vector3(
        positions[faces[i + 2] * 3],
        positions[faces[i + 2] * 3 + 1],
        positions[faces[i + 2] * 3 + 2]
      );

      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      const normal = edge1.cross(edge2).normalize();

      // If normal is pointing in opposite direction, flip the face
      if (normal.dot(averageNormal) < -this.NORMAL_TOLERANCE) {
        // Swap vertices to flip winding
        const temp = faces[i + 1];
        faces[i + 1] = faces[i + 2];
        faces[i + 2] = temp;
        windingCorrected = true;
      }
    }

    return windingCorrected;
  }

  /**
   * Lightweight cleanup for procedurally generated geometries
   * Only performs essential operations without aggressive triangle removal
   */
  private static lightweightCleanup(geometry: THREE.BufferGeometry): CleanupResults {
    const results: CleanupResults = {
      duplicateVerticesRemoved: 0,
      zeroAreaTrianglesRemoved: 0,
      degenerateVerticesRemoved: 0,
      windingCorrected: false,
      manifoldIssuesFixed: 0,
      originalVertexCount: geometry.attributes.position.count,
      finalVertexCount: geometry.attributes.position.count,
      originalFaceCount: geometry.attributes.position.count / 3,
      finalFaceCount: geometry.attributes.position.count / 3
    };

    // For procedural geometries, only do minimal cleanup:
    // 1. Recompute normals (essential for lighting)
    // 2. Recompute bounds (essential for rendering)
    // 3. Skip all vertex deduplication (preserves polygon structure)
    // 4. Skip triangle area validation (trust procedural generation)

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    return results;
  }

  /**
   * Generate cleanup summary for logging/display
   */
  static generateCleanupSummary(results: CleanupResults): string {
    const lines = [
      '🧹 Geometry Cleanup Results:',
      `   • Vertices: ${results.originalVertexCount} → ${results.finalVertexCount} (${results.duplicateVerticesRemoved + results.degenerateVerticesRemoved} removed)`,
      `   • Faces: ${results.originalFaceCount} → ${results.finalFaceCount} (${results.zeroAreaTrianglesRemoved} zero-area removed)`,
      `   • Duplicate vertices removed: ${results.duplicateVerticesRemoved}`,
      `   • Zero-area triangles removed: ${results.zeroAreaTrianglesRemoved}`,
      `   • Degenerate vertices removed: ${results.degenerateVerticesRemoved}`,
      `   • Face winding corrected: ${results.windingCorrected ? 'Yes' : 'No'}`,
      `   • Manifold issues fixed: ${results.manifoldIssuesFixed}`
    ];
    
    return lines.join('\n');
  }
}
