import * as THREE from 'three';

/**
 * STL Exporter utility for exporting Three.js geometry to STL format
 */
export class STLExporter {
  /**
   * Export geometry to STL format with specified size constraints
   */
  static exportGeometry(
    geometry: THREE.BufferGeometry, 
    filename: string = 'model.stl',
    targetSize: { min: number; max: number } = { min: 50, max: 100 }
  ): void {
    if (!geometry || !geometry.attributes.position) {
      throw new Error('Invalid geometry provided for export');
    }

    // Clone the geometry to avoid modifying the original
    const exportGeometry = geometry.clone();
    
    // Scale the geometry to target size (50-100mm)
    const scaledGeometry = this.scaleGeometryToSize(exportGeometry, targetSize);
    
    // Generate STL content
    const stlContent = this.generateSTLContent(scaledGeometry);
    
    // Download the file
    this.downloadSTL(stlContent, filename);
    
    // Clean up
    scaledGeometry.dispose();
  }

  /**
   * Scale geometry to fit within target size range (in mm)
   */
  private static scaleGeometryToSize(
    geometry: THREE.BufferGeometry, 
    targetSize: { min: number; max: number }
  ): THREE.BufferGeometry {
    // Compute bounding box
    geometry.computeBoundingBox();
    
    if (!geometry.boundingBox) {
      throw new Error('Could not compute geometry bounding box');
    }

    const boundingBox = geometry.boundingBox;
    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    // Find the largest dimension
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    if (maxDimension === 0) {
      throw new Error('Geometry has zero size');
    }

    // Calculate scale factor to fit within target size
    // Default to middle of range if current size is acceptable
    const targetDimension = (targetSize.min + targetSize.max) / 2;
    const scaleFactor = targetDimension / maxDimension;
    
    // Apply scale
    geometry.scale(scaleFactor, scaleFactor, scaleFactor);
    
    // Center the geometry
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
    }

    return geometry;
  }

  /**
   * Generate STL file content from geometry
   */
  private static generateSTLContent(geometry: THREE.BufferGeometry): string {
    const positions = geometry.attributes.position;
    const triangleCount = positions.count / 3;
    
    // STL Header (80 bytes)
    let stlContent = 'solid exported\n';
    
    // Process each triangle
    for (let i = 0; i < triangleCount; i++) {
      const i3 = i * 3;
      
      // Get triangle vertices
      const v1 = new THREE.Vector3(
        positions.getX(i3),
        positions.getY(i3),
        positions.getZ(i3)
      );
      const v2 = new THREE.Vector3(
        positions.getX(i3 + 1),
        positions.getY(i3 + 1),
        positions.getZ(i3 + 1)
      );
      const v3 = new THREE.Vector3(
        positions.getX(i3 + 2),
        positions.getY(i3 + 2),
        positions.getZ(i3 + 2)
      );
      
      // Calculate normal
      const normal = this.calculateTriangleNormal(v1, v2, v3);
      
      // Write facet
      stlContent += `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
      stlContent += `    outer loop\n`;
      stlContent += `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n`;
      stlContent += `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n`;
      stlContent += `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n`;
      stlContent += `    endloop\n`;
      stlContent += `  endfacet\n`;
    }
    
    stlContent += 'endsolid exported\n';
    
    return stlContent;
  }

  /**
   * Calculate triangle normal vector
   */
  private static calculateTriangleNormal(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): THREE.Vector3 {
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    
    return normal;
  }

  /**
   * Download STL content as file
   */
  private static downloadSTL(content: string, filename: string): void {
    // Ensure filename has .stl extension
    if (!filename.toLowerCase().endsWith('.stl')) {
      filename += '.stl';
    }

    // Create blob and download
    const blob = new Blob([content], { type: 'application/sla' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Get geometry info for display
   */
  static getGeometryInfo(geometry: THREE.BufferGeometry): {
    vertices: number;
    triangles: number;
    boundingBox: THREE.Box3 | null;
    size: THREE.Vector3;
  } {
    geometry.computeBoundingBox();
    
    const vertices = geometry.attributes.position ? geometry.attributes.position.count : 0;
    const triangles = Math.floor(vertices / 3);
    const boundingBox = geometry.boundingBox;
    const size = new THREE.Vector3();
    
    if (boundingBox) {
      boundingBox.getSize(size);
    }
    
    return {
      vertices,
      triangles,
      boundingBox,
      size
    };
  }
}

/**
 * Export current STL with default 50-100mm sizing
 */
export function exportCurrentSTL(
  geometry: THREE.BufferGeometry,
  filename?: string,
  customSize?: { min: number; max: number }
): void {
  const defaultSize = { min: 50, max: 100 }; // 50-100mm default
  const exportSize = customSize || defaultSize;
  const exportFilename = filename || 'exported_model.stl';
  
  try {
    STLExporter.exportGeometry(geometry, exportFilename, exportSize);
    console.log(`STL exported successfully: ${exportFilename}`);
  } catch (error) {
    console.error('Failed to export STL:', error);
    throw error;
  }
}
