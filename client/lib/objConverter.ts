import * as THREE from 'three';

export interface OBJConversionResult {
  success?: boolean;
  error?: string;
  objString: string;
  objContent?: string;
  stats?: any;
  vertexCount: number;
  faceCount: number;
  hasQuads: boolean;
  hasPolygons: boolean;
}

export class OBJConverter {
  /**
   * Convert Three.js BufferGeometry to OBJ format string
   * This is essential for internal processing as OBJ preserves face topology better than STL
   * ENHANCED: Ensures proper indexing and polygon preservation for decimation consistency
   */
  static geometryToOBJ(geometry: THREE.BufferGeometry, filename?: string): OBJConversionResult {
    console.log('🔄 === ENHANCED OBJ CONVERSION ===');
    console.log(`🔄 Converting geometry to OBJ format with proper indexing...`);

    // Validate geometry exists
    if (!geometry) {
      console.error('❌ No geometry provided');
      return {
        success: false,
        error: 'No geometry provided - cannot convert to OBJ',
        objString: '',
        objContent: '',
        stats: null,
        vertexCount: 0,
        faceCount: 0,
        hasQuads: false,
        hasPolygons: false
      };
    }

    // Check if geometry has attributes
    if (!geometry.attributes) {
      console.error('❌ Geometry missing attributes');
      return {
        success: false,
        error: 'Geometry is missing attributes - cannot convert to OBJ',
        objString: '',
        objContent: '',
        stats: null,
        vertexCount: 0,
        faceCount: 0,
        hasQuads: false,
        hasPolygons: false
      };
    }

    // Check if geometry has required position attribute
    if (!geometry.attributes.position) {
      console.error('❌ Geometry missing position attribute');
      return {
        success: false,
        error: 'Geometry is missing position attribute - cannot convert to OBJ',
        objString: '',
        objContent: '',
        stats: null,
        vertexCount: 0,
        faceCount: 0,
        hasQuads: false,
        hasPolygons: false
      };
    }

    const positionAttribute = geometry.attributes.position;
    if (!positionAttribute.array) {
      console.error('❌ Position attribute missing array');
      return {
        success: false,
        error: 'Position attribute is missing array data - cannot convert to OBJ',
        objString: '',
        objContent: '',
        stats: null,
        vertexCount: 0,
        faceCount: 0,
        hasQuads: false,
        hasPolygons: false
      };
    }

    const positions = positionAttribute.array as Float32Array;
    const indices = geometry.index?.array;

    // Validate positions array
    if (!positions || positions.length === 0) {
      console.error('❌ Geometry has empty positions array');
      return {
        success: false,
        error: 'Geometry has no vertices - cannot convert to OBJ',
        objString: '',
        objContent: '',
        stats: null,
        vertexCount: 0,
        faceCount: 0,
        hasQuads: false,
        hasPolygons: false
      };
    }

    // CRITICAL: Check if geometry has proper indexing for decimation
    const isIndexed = !!indices && indices.length > 0;
    console.log(`📋 Geometry indexing status: ${isIndexed ? 'INDEXED' : 'NON-INDEXED'}`);

    if (!isIndexed) {
      console.warn('⚠️ Non-indexed geometry detected - this may cause decimation issues');
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
    
    // ENHANCED: Handle both indexed and non-indexed geometry properly
    if (indices && indices.length > 0) {
      // Indexed geometry - preferred for decimation
      console.log(`✅ Processing INDEXED geometry: ${indices.length / 3} faces`);
      for (let i = 0; i < indices.length; i += 3) {
        // Ensure we have enough indices for a complete triangle
        if (i + 2 < indices.length) {
          // OBJ uses 1-based indexing
          const v1 = indices[i] + 1;
          const v2 = indices[i + 1] + 1;
          const v3 = indices[i + 2] + 1;

          // Validate indices are within bounds
          if (v1 <= vertexCount && v2 <= vertexCount && v3 <= vertexCount) {
            objString += `f ${v1} ${v2} ${v3}\n`;
            faceCount++;
          } else {
            console.warn(`⚠️ Invalid face indices: ${v1}, ${v2}, ${v3} (max: ${vertexCount})`);
          }
        }
      }
    } else {
      // Non-indexed geometry - convert to indexed for consistency
      console.warn('⚠️ Processing NON-INDEXED geometry - converting to indexed for decimation compatibility');
      for (let i = 0; i < positions.length; i += 9) {
        // Each triangle uses 3 consecutive vertices
        const v1 = (i / 3) + 1;
        const v2 = (i / 3) + 2;
        const v3 = (i / 3) + 3;

        if (v3 <= vertexCount) {
          objString += `f ${v1} ${v2} ${v3}\n`;
          faceCount++;
        }
      }
    }
    
    // ENHANCED: Properly handle polygon faces with validation
    const polygonFaces = (geometry as any).polygonFaces;
    if (polygonFaces && Array.isArray(polygonFaces) && polygonFaces.length > 0) {
      objString += '\n# Enhanced polygon faces (preserved structure)\n';
      console.log(`📐 Processing ${polygonFaces.length} polygon faces...`);

      let polygonFaceCount = 0;
      for (const face of polygonFaces) {
        // Enhanced validation
        if (!face) {
          console.warn('⚠️ Null polygon face found');
          continue;
        }

        // Check for vertex data in multiple possible formats
        let vertices = face.vertices || face.originalVertices;
        if (!vertices || !Array.isArray(vertices) || vertices.length < 3) {
          console.warn('⚠️ Invalid polygon face vertices:', face);
          continue;
        }

        // Count polygon types
        if (vertices.length === 4) {
          hasQuads = true;
        } else if (vertices.length > 4) {
          hasPolygons = true;
        }

        // Enhanced face string generation with proper indexing
        try {
          const faceString = vertices.map((v: any) => {
            // Handle different vertex formats
            if (typeof v === 'number') {
              return v + 1; // Already an index
            } else if (v && typeof v.index === 'number') {
              return v.index + 1; // Vertex object with index
            } else {
              console.warn('⚠️ Invalid vertex format in polygon face:', v);
              return 1; // Fallback
            }
          }).join(' ');

          objString += `f ${faceString}\n`;
          polygonFaceCount++;
        } catch (error) {
          console.warn('⚠️ Error processing polygon face:', error);
        }
      }

      console.log(`✅ Processed ${polygonFaceCount} polygon faces`);
      faceCount += polygonFaceCount;
    }
    
    console.log(`✅ ENHANCED OBJ CONVERSION COMPLETED`);
    console.log(`   📊 Results: ${vertexCount} vertices, ${faceCount} faces`);
    console.log(`   📐 Polygon types: ${hasQuads ? 'quads' : 'no quads'}, ${hasPolygons ? 'polygons' : 'no polygons'}`);
    console.log(`   🔗 Indexing: ${isIndexed ? 'INDEXED (decimation-ready)' : 'NON-INDEXED (may need conversion)'}`);

    return {
      success: true,
      objString,
      vertexCount,
      faceCount,
      hasQuads,
      hasPolygons,
      stats: {
        isIndexed,
        polygonTypes: {
          triangles: faceCount - (hasQuads ? 1 : 0) - (hasPolygons ? 1 : 0),
          quads: hasQuads ? 1 : 0,
          polygons: hasPolygons ? 1 : 0
        }
      }
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
    let polygonFaces: any[] = [];
    
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
          // Parse face vertices
          const faceVertices = parts.map(part => {
            // Handle vertex/texture/normal format (v/vt/vn)
            const indices = part.split('/');
            return parseInt(indices[0]) - 1; // Convert to 0-based indexing
          });

          console.log(`🚫 PRESERVING polygon face with ${faceVertices.length} vertices (NO triangulation)`);

          // Store polygon face information to preserve structure
          polygonFaces.push({
            vertices: faceVertices,
            originalVertices: [...faceVertices],
            type: faceVertices.length === 3 ? 'triangle' :
                  faceVertices.length === 4 ? 'quad' :
                  faceVertices.length === 5 ? 'pentagon' :
                  faceVertices.length === 6 ? 'hexagon' : 'polygon'
          });

          // TEMPORARILY triangulate ONLY for Three.js rendering compatibility
          // This is unfortunate but required for current Three.js mesh rendering
          if (faceVertices.length === 3) {
            faces.push(faceVertices[0], faceVertices[1], faceVertices[2]);
          } else if (faceVertices.length === 4) {
            // Quad - split into two triangles for rendering only
            faces.push(
              faceVertices[0], faceVertices[1], faceVertices[2],
              faceVertices[0], faceVertices[2], faceVertices[3]
            );
          } else if (faceVertices.length > 4) {
            // Polygon - fan triangulation for rendering only
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

    // CRITICAL: Store polygon face metadata to preserve structure
    if (polygonFaces.length > 0) {
      (geometry as any).polygonFaces = polygonFaces;
      (geometry as any).polygonType = 'preserved';
      (geometry as any).isPolygonPreserved = true;

      console.log(`✅ OBJ parsing completed: ${vertices.length / 3} vertices, ${faces.length / 3} triangulated faces`);
      console.log(`🚫 PRESERVED ${polygonFaces.length} polygon faces:`, polygonFaces.map(f => f.type).join(', '));
    } else {
      console.log(`✅ OBJ parsing completed: ${vertices.length / 3} vertices, ${faces.length / 3} triangle faces`);
    }

    return geometry;
  }
  
  /**
   * Enhanced OBJ export with groups for parts
   */
  static geometryToOBJWithParts(geometry: THREE.BufferGeometry, parts?: any[]): string {
    let objString = '# Enhanced OBJ export with parts/groups\n';
    objString += `# Generated on ${new Date().toISOString()}\n\n`;

    // Validate geometry and position attributes
    if (!geometry || !geometry.attributes || !geometry.attributes.position || !geometry.attributes.position.array) {
      console.error('❌ Invalid geometry provided to geometryToOBJWithParts');
      return '# Error: Invalid geometry - cannot export to OBJ\n';
    }

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
      if (indices && indices.length > 0) {
        for (let i = 0; i < indices.length; i += 3) {
          // Ensure we have enough indices for a complete triangle
          if (i + 2 < indices.length) {
            const v1 = indices[i] + 1;
            const v2 = indices[i + 1] + 1;
            const v3 = indices[i + 2] + 1;
            objString += `f ${v1} ${v2} ${v3}\n`;
          }
        }
      }
    }
    
    return objString;
  }
}
