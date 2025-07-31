import * as THREE from 'three';

export interface OBJConversionResult {
  objString: string;
  vertexCount: number;
  faceCount: number;
  hasQuads: boolean;
  hasPolygons: boolean;
}

export class OBJConverter {
  /**
   * Convert Three.js BufferGeometry to OBJ format string
   * This is essential for internal processing as OBJ preserves face topology better than STL
   */
  static geometryToOBJ(geometry: THREE.BufferGeometry, filename?: string): OBJConversionResult {
    console.log('🔄 Converting geometry to OBJ format...');

    // Check if geometry has required attributes
    if (!geometry.attributes.position) {
      console.error('❌ Geometry missing position attribute');
      throw new Error('Geometry is missing position attribute - cannot convert to OBJ');
    }

    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array;

    // Validate positions array
    if (!positions || positions.length === 0) {
      console.error('❌ Geometry has empty positions array');
      throw new Error('Geometry has no vertices - cannot convert to OBJ');
    }
    
    let objString = '# Generated OBJ file from STL/geometry\n';
    objString += '# Converted for better face topology preservation\n\n';
    
    // Write vertices
    objString += '# Vertices\n';
    const vertexCount = positions.length / 3;
    for (let i = 0; i < positions.length; i += 3) {
      objString += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
    }
    
    objString += '\n# Faces\n';
    
    let faceCount = 0;
    let hasQuads = false;
    let hasPolygons = false;
    
    if (indices) {
      // Indexed geometry
      for (let i = 0; i < indices.length; i += 3) {
        // OBJ uses 1-based indexing
        const v1 = indices[i] + 1;
        const v2 = indices[i + 1] + 1;
        const v3 = indices[i + 2] + 1;
        objString += `f ${v1} ${v2} ${v3}\n`;
        faceCount++;
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < positions.length; i += 9) {
        // Each triangle uses 3 consecutive vertices
        const v1 = (i / 3) + 1;
        const v2 = (i / 3) + 2;
        const v3 = (i / 3) + 3;
        objString += `f ${v1} ${v2} ${v3}\n`;
        faceCount++;
      }
    }
    
    // Check for polygon faces if they exist from reconstruction
    if ((geometry as any).polygonFaces) {
      objString += '\n# Reconstructed polygon faces\n';
      const polygonFaces = (geometry as any).polygonFaces;
      
      for (const face of polygonFaces) {
        if (face.vertices.length === 4) {
          hasQuads = true;
        } else if (face.vertices.length > 4) {
          hasPolygons = true;
        }
        
        const faceString = face.vertices.map((v: any) => v.index + 1).join(' ');
        objString += `f ${faceString}\n`;
        faceCount++;
      }
    }
    
    console.log(`✅ OBJ conversion completed: ${vertexCount} vertices, ${faceCount} faces`);
    
    return {
      objString,
      vertexCount,
      faceCount,
      hasQuads,
      hasPolygons
    };
  }
  
  /**
   * Parse OBJ format string and return Three.js BufferGeometry
   */
  static parseOBJ(objString: string): THREE.BufferGeometry {
    console.log('📖 Parsing OBJ format...');
    
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const faces: number[] = [];
    const normals: number[] = [];
    
    const lines = objString.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('v ')) {
        // Vertex position
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          vertices.push(
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
          );
        }
      } else if (trimmed.startsWith('vn ')) {
        // Vertex normal
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          normals.push(
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
          );
        }
      } else if (trimmed.startsWith('f ')) {
        // Face
        const parts = trimmed.split(/\s+/).slice(1);
        
        if (parts.length >= 3) {
          // Convert to triangles if needed (for quads/polygons)
          const faceVertices = parts.map(part => {
            // Handle vertex/texture/normal format (v/vt/vn)
            const indices = part.split('/');
            return parseInt(indices[0]) - 1; // Convert to 0-based indexing
          });
          
          // Triangulate polygon faces
          if (faceVertices.length === 3) {
            // Triangle
            faces.push(faceVertices[0], faceVertices[1], faceVertices[2]);
          } else if (faceVertices.length === 4) {
            // Quad - split into two triangles
            faces.push(
              faceVertices[0], faceVertices[1], faceVertices[2],
              faceVertices[0], faceVertices[2], faceVertices[3]
            );
          } else if (faceVertices.length > 4) {
            // Polygon - fan triangulation
            for (let i = 1; i < faceVertices.length - 1; i++) {
              faces.push(faceVertices[0], faceVertices[i], faceVertices[i + 1]);
            }
          }
        }
      }
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    if (faces.length > 0) {
      geometry.setIndex(faces);
    }
    
    if (normals.length > 0 && normals.length === vertices.length) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    
    geometry.computeBoundingBox();
    
    console.log(`✅ OBJ parsing completed: ${vertices.length / 3} vertices, ${faces.length / 3} faces`);
    
    return geometry;
  }
  
  /**
   * Enhanced OBJ export with groups for parts
   */
  static geometryToOBJWithParts(geometry: THREE.BufferGeometry, parts?: any[]): string {
    let objString = '# Enhanced OBJ export with parts/groups\n';
    objString += `# Generated on ${new Date().toISOString()}\n\n`;
    
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Write all vertices first
    objString += '# Vertices\n';
    for (let i = 0; i < positions.length; i += 3) {
      objString += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
    }
    
    objString += '\n';
    
    if (parts && parts.length > 0) {
      // Export with groups for each part
      for (let partIndex = 0; partIndex < parts.length; partIndex++) {
        const part = parts[partIndex];
        objString += `g part_${partIndex + 1}\n`;
        objString += `# Part ${partIndex + 1}: ${part.type || 'polygon'}\n`;
        
        if (part.vertices) {
          const faceString = part.vertices.map((v: any) => v.index + 1).join(' ');
          objString += `f ${faceString}\n`;
        }
        
        objString += '\n';
      }
    } else {
      // Export as single group
      objString += 'g model\n';
      objString += '# Faces\n';
      
      const indices = geometry.index?.array;
      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          const v1 = indices[i] + 1;
          const v2 = indices[i + 1] + 1;
          const v3 = indices[i + 2] + 1;
          objString += `f ${v1} ${v2} ${v3}\n`;
        }
      }
    }
    
    return objString;
  }
}
