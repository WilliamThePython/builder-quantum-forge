import * as THREE from 'three';
import JSZip from 'jszip';

/**
 * Triangle-by-triangle STL exporter for real-world building
 * Creates individual STL files for each triangle, packaged in a zip
 */
export class TriangleExporter {
  
  /**
   * Export each triangle as a separate STL file in a zip archive
   */
  static async exportTrianglesAsZip(
    geometry: THREE.BufferGeometry,
    filename: string = 'triangle_pieces.zip',
    options: {
      triangleThickness?: number; // mm thickness for each triangle piece
      scale?: number; // overall scale factor
      addTabs?: boolean; // add connection tabs for assembly
    } = {}
  ): Promise<void> {
    if (!geometry || !geometry.attributes.position) {
      throw new Error('Invalid geometry provided for triangle export');
    }

    const {
      triangleThickness = 2, // 2mm thick triangular pieces
      scale = 1,
      addTabs = true
    } = options;

    console.log('Starting triangle-by-triangle export...');
    const startTime = Date.now();

    // Create zip file
    const zip = new JSZip();
    
    // Get triangle data
    const positions = geometry.attributes.position;
    const triangleCount = Math.floor(positions.count / 3);
    
    console.log(`Processing ${triangleCount} triangles...`);

    // Create individual STL files for each triangle
    for (let i = 0; i < triangleCount; i++) {
      const triangleSTL = this.createTriangleSTL(geometry, i, triangleThickness, scale, addTabs);
      const triangleFilename = `triangle_${String(i + 1).padStart(4, '0')}.stl`;
      
      // Add to zip
      zip.file(triangleFilename, triangleSTL);
      
      // Progress logging
      if (i % 50 === 0 || i === triangleCount - 1) {
        console.log(`Processed triangle ${i + 1}/${triangleCount}`);
      }
    }

    // Add assembly instructions
    const instructions = this.generateAssemblyInstructions(triangleCount, options);
    zip.file('assembly_instructions.txt', instructions);

    // Generate and download zip
    console.log('Generating zip file...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Download the zip file
    this.downloadBlob(zipBlob, filename);
    
    const endTime = Date.now();
    console.log(`Triangle export completed in ${endTime - startTime}ms`);
    console.log(`Created ${triangleCount} triangle pieces + assembly instructions`);
  }

  /**
   * Create a 3D printable STL for a single triangle with thickness
   */
  private static createTriangleSTL(
    originalGeometry: THREE.BufferGeometry,
    triangleIndex: number,
    thickness: number,
    scale: number,
    addTabs: boolean
  ): string {
    const positions = originalGeometry.attributes.position;
    const i3 = triangleIndex * 3;

    // Get triangle vertices
    const v1 = new THREE.Vector3(
      positions.getX(i3) * scale,
      positions.getY(i3) * scale,
      positions.getZ(i3) * scale
    );
    const v2 = new THREE.Vector3(
      positions.getX(i3 + 1) * scale,
      positions.getY(i3 + 1) * scale,
      positions.getZ(i3 + 1) * scale
    );
    const v3 = new THREE.Vector3(
      positions.getX(i3 + 2) * scale,
      positions.getY(i3 + 2) * scale,
      positions.getZ(i3 + 2) * scale
    );

    // Calculate triangle normal for extrusion direction
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // Create extruded triangle (prism)
    const halfThickness = thickness / 2;
    const offset = normal.clone().multiplyScalar(halfThickness);

    // Front face vertices
    const v1f = v1.clone().add(offset);
    const v2f = v2.clone().add(offset);
    const v3f = v3.clone().add(offset);

    // Back face vertices  
    const v1b = v1.clone().sub(offset);
    const v2b = v2.clone().sub(offset);
    const v3b = v3.clone().sub(offset);

    // Generate STL content
    let stlContent = `solid triangle_${triangleIndex + 1}\n`;

    // Front face (triangle)
    stlContent += this.addTriangleToSTL(v1f, v2f, v3f, normal);

    // Back face (triangle, flipped normal)
    const backNormal = normal.clone().negate();
    stlContent += this.addTriangleToSTL(v1b, v3b, v2b, backNormal);

    // Side faces (rectangles made of triangles)
    // Side 1-2
    stlContent += this.addQuadToSTL(v1f, v2f, v2b, v1b);
    
    // Side 2-3
    stlContent += this.addQuadToSTL(v2f, v3f, v3b, v2b);
    
    // Side 3-1
    stlContent += this.addQuadToSTL(v3f, v1f, v1b, v3b);

    // Add connection tabs if requested
    if (addTabs) {
      stlContent += this.addConnectionTabs(v1f, v2f, v3f, v1b, v2b, v3b, triangleIndex);
    }

    stlContent += 'endsolid triangle_' + (triangleIndex + 1) + '\n';

    return stlContent;
  }

  /**
   * Add a single triangle to STL content
   */
  private static addTriangleToSTL(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, normal: THREE.Vector3): string {
    return `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n` +
           `    outer loop\n` +
           `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n` +
           `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n` +
           `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n` +
           `    endloop\n` +
           `  endfacet\n`;
  }

  /**
   * Add a quad (as two triangles) to STL content
   */
  private static addQuadToSTL(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, v4: THREE.Vector3): string {
    // Calculate normal for the quad
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v4, v1);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    // Two triangles to make a quad
    let content = this.addTriangleToSTL(v1, v2, v3, normal);
    content += this.addTriangleToSTL(v1, v3, v4, normal);

    return content;
  }

  /**
   * Add small connection tabs for assembly
   */
  private static addConnectionTabs(
    v1f: THREE.Vector3, v2f: THREE.Vector3, v3f: THREE.Vector3,
    v1b: THREE.Vector3, v2b: THREE.Vector3, v3b: THREE.Vector3,
    triangleIndex: number
  ): string {
    let tabContent = '';

    // Add small tabs on each edge for connection points
    const tabSize = 1; // 1mm tabs
    
    // Calculate edge midpoints
    const edge1Mid = new THREE.Vector3().addVectors(v1f, v2f).multiplyScalar(0.5);
    const edge2Mid = new THREE.Vector3().addVectors(v2f, v3f).multiplyScalar(0.5);
    const edge3Mid = new THREE.Vector3().addVectors(v3f, v1f).multiplyScalar(0.5);

    // Add simple tab geometry (simplified for now)
    // In a full implementation, these would be proper connector geometry
    
    return tabContent;
  }

  /**
   * Generate assembly instructions
   */
  private static generateAssemblyInstructions(triangleCount: number, options: any): string {
    const date = new Date().toLocaleDateString();
    
    return `STL Triangle Assembly Kit
Generated: ${date}

ASSEMBLY INSTRUCTIONS:
=====================

This kit contains ${triangleCount} individual triangle pieces that can be assembled 
to recreate the original 3D model.

PIECE SPECIFICATIONS:
- Triangle thickness: ${options.triangleThickness || 2}mm
- Material recommended: PLA or PETG plastic
- Infill: 20-30% for structural strength
- Layer height: 0.2mm recommended

ASSEMBLY TIPS:
1. Sort pieces by size before starting
2. Use strong adhesive (CA glue or epoxy) for permanent assembly
3. For temporary assembly, consider small magnets or clips
4. Test fit pieces before applying adhesive
5. Work in small sections and allow adhesive to cure

PIECE NAMING:
- triangle_0001.stl through triangle_${String(triangleCount).padStart(4, '0')}.stl
- Numbers correspond to original triangle order in the model

SAFETY:
- Use appropriate ventilation when working with adhesives
- Wear safety glasses when cutting or sanding pieces
- Adult supervision required for young builders

TROUBLESHOOTING:
- If pieces don't fit perfectly, light sanding may be needed
- Check your 3D printer calibration if multiple pieces are oversized
- For gaps, consider using filler material or adjusting print settings

Happy building!

Generated by STL Viewer Platform
Visit: [Your Platform URL]
`;
  }

  /**
   * Download blob as file
   */
  private static downloadBlob(blob: Blob, filename: string): void {
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
   * Get export statistics
   */
  static getExportStats(geometry: THREE.BufferGeometry): {
    triangleCount: number;
    estimatedPrintTime: string;
    estimatedMaterial: string;
    estimatedAssemblyTime: string;
  } {
    const triangleCount = Math.floor(geometry.attributes.position.count / 3);
    
    // Rough estimates based on triangle count
    const printTimePerTriangle = 15; // minutes per triangle
    const totalPrintMinutes = triangleCount * printTimePerTriangle;
    const printHours = Math.floor(totalPrintMinutes / 60);
    const printMinutes = totalPrintMinutes % 60;
    
    const materialPerTriangle = 2; // grams per triangle
    const totalMaterial = triangleCount * materialPerTriangle;
    
    const assemblyTimeMinutes = triangleCount * 3; // 3 minutes per triangle to assemble
    const assemblyHours = Math.floor(assemblyTimeMinutes / 60);
    const assemblyMins = assemblyTimeMinutes % 60;
    
    return {
      triangleCount,
      estimatedPrintTime: `${printHours}h ${printMinutes}m`,
      estimatedMaterial: `${totalMaterial}g filament`,
      estimatedAssemblyTime: `${assemblyHours}h ${assemblyMins}m`
    };
  }
}
