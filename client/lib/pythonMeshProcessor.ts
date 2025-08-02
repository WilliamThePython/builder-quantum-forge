/**
 * Python mesh processing client using Open3D backend
 */
import * as THREE from 'three';

export interface PythonDecimationResult {
  geometry: THREE.BufferGeometry;
  originalVertices: number;
  finalVertices: number;
  originalTriangles: number;
  finalTriangles: number;
  reductionAchieved: number;
  processingTime: number;
}

export class PythonMeshProcessor {
  private static readonly SERVICE_URL = 'http://localhost:8001';

  /**
   * Check if Python service is available
   */
  static async checkServiceHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.SERVICE_URL}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const health = await response.json();
        console.log('🐍 Python service is healthy:', health);
        return true;
      }
      return false;
    } catch (error) {
      console.log('🐍 Python service not available:', error);
      return false;
    }
  }

  /**
   * Decimate mesh using Python Open3D service
   */
  static async decimateMesh(
    geometry: THREE.BufferGeometry,
    targetReduction: number,
    preserveBoundary: boolean = true
  ): Promise<PythonDecimationResult> {
    const startTime = Date.now();

    console.log('🐍 === PYTHON OPEN3D DECIMATION ===');
    console.log(`   Target reduction: ${(targetReduction * 100).toFixed(1)}%`);
    console.log(`   Preserve boundary: ${preserveBoundary}`);

    // Check service health first
    const isHealthy = await this.checkServiceHealth();
    if (!isHealthy) {
      throw new Error('Python mesh processing service is not available. Please start the service.');
    }

    // Check if geometry has polygon structure
    const polygonFaces = (geometry as any).polygonFaces;
    let formData: FormData;

    if (polygonFaces && Array.isArray(polygonFaces)) {
      console.log(`   🔸 PRESERVING POLYGON STRUCTURE: Converting to OBJ format with ${polygonFaces.length} polygon faces`);

      // Convert to OBJ format to preserve polygon structure
      const objData = await this.geometryToOBJ(geometry, polygonFaces);
      console.log(`   Generated OBJ data: ${objData.length} bytes`);

      // Create form data for upload
      formData = new FormData();
      const objBlob = new Blob([objData], { type: 'text/plain' });
      formData.append('file', objBlob, 'mesh.obj');
    } else {
      console.log(`   Converting triangle mesh to STL format`);

      // Convert Three.js geometry to STL format for triangle meshes
      const stlData = await this.geometryToSTL(geometry);
      console.log(`   Generated STL data: ${stlData.length} bytes`);

      // Create form data for upload
      formData = new FormData();
      const stlBlob = new Blob([stlData], { type: 'application/octet-stream' });
      formData.append('file', stlBlob, 'mesh.stl');
    }
    formData.append('target_reduction', targetReduction.toString());
    formData.append('preserve_boundary', preserveBoundary.toString());

    console.log('📤 Sending mesh to Python service...');

    try {
      const response = await fetch(`${this.SERVICE_URL}/decimate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      // Get response headers with statistics
      const originalVertices = parseInt(response.headers.get('X-Original-Vertices') || '0');
      const finalVertices = parseInt(response.headers.get('X-Final-Vertices') || '0');
      const originalTriangles = parseInt(response.headers.get('X-Original-Triangles') || '0');
      const finalTriangles = parseInt(response.headers.get('X-Final-Triangles') || '0');
      const reductionAchieved = parseFloat(response.headers.get('X-Reduction-Achieved') || '0');

      console.log('📥 Received decimated mesh from Python service');
      console.log(`   Vertices: ${originalVertices} → ${finalVertices} (${(reductionAchieved * 100).toFixed(1)}% reduction)`);
      console.log(`   Triangles: ${originalTriangles} → ${finalTriangles}`);

      // Get decimated mesh data
      const contentType = response.headers.get('content-type') || '';
      const filename = response.headers.get('content-disposition')?.includes('.obj') || false;
      const isOBJ = contentType.includes('text') || filename || polygonFaces; // Check if we sent OBJ

      let decimatedGeometry: THREE.BufferGeometry;

      if (isOBJ) {
        console.log('   📥 Receiving OBJ format (polygon structure preserved)');
        const decimatedOBJData = await response.text();
        decimatedGeometry = await this.objToGeometry(decimatedOBJData);
      } else {
        console.log('   📥 Receiving STL format');
        const decimatedSTLData = await response.arrayBuffer();
        decimatedGeometry = await this.stlToGeometry(decimatedSTLData);
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`✅ Python decimation complete in ${processingTime}ms`);

      return {
        geometry: decimatedGeometry,
        originalVertices,
        finalVertices,
        originalTriangles,
        finalTriangles,
        reductionAchieved,
        processingTime
      };

    } catch (error) {
      console.error('❌ Python decimation failed:', error);
      throw new Error(`Python mesh processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert Three.js BufferGeometry to OBJ format preserving polygon faces
   */
  private static async geometryToOBJ(
    geometry: THREE.BufferGeometry,
    polygonFaces: any[]
  ): Promise<string> {
    const positions = geometry.attributes.position.array;
    let objContent = '# OBJ file generated by Intellimesh\n';
    objContent += '# Preserving polygon face structure\n\n';

    // Write vertices
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i].toFixed(6);
      const y = positions[i + 1].toFixed(6);
      const z = positions[i + 2].toFixed(6);
      objContent += `v ${x} ${y} ${z}\n`;
    }

    objContent += '\n';

    // Write polygon faces (this preserves the solid structure!)
    for (const face of polygonFaces) {
      if (face.vertices && face.vertices.length >= 3) {
        // OBJ uses 1-based indexing
        const faceIndices = face.vertices.map((v: number) => v + 1).join(' ');
        objContent += `f ${faceIndices}\n`;
      }
    }

    console.log(`   ✅ Generated OBJ with ${polygonFaces.length} polygon faces (NO triangulation!)`);
    return objContent;
  }

  /**
   * Convert Three.js BufferGeometry to STL format
   */
  private static async geometryToSTL(geometry: THREE.BufferGeometry): Promise<ArrayBuffer> {
    // Ensure geometry is indexed
    if (!geometry.index) {
      const indices = [];
      for (let i = 0; i < geometry.attributes.position.count; i++) {
        indices.push(i);
      }
      geometry.setIndex(indices);
    }

    const positions = geometry.attributes.position.array;
    const indices = geometry.index!.array;
    const triangleCount = indices.length / 3;

    // STL binary format
    const headerSize = 80;
    const triangleSize = 50; // 12 floats (4 bytes each) + 2 bytes attribute
    const totalSize = headerSize + 4 + (triangleCount * triangleSize);

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header (80 bytes)
    const header = 'Generated by Intellimesh';
    for (let i = 0; i < Math.min(header.length, 80); i++) {
      view.setUint8(offset + i, header.charCodeAt(i));
    }
    offset += 80;

    // Write triangle count
    view.setUint32(offset, triangleCount, true);
    offset += 4;

    // Write triangles
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i] * 3;
      const i2 = indices[i + 1] * 3;
      const i3 = indices[i + 2] * 3;

      // Get vertices
      const v1 = [positions[i1], positions[i1 + 1], positions[i1 + 2]];
      const v2 = [positions[i2], positions[i2 + 1], positions[i2 + 2]];
      const v3 = [positions[i3], positions[i3 + 1], positions[i3 + 2]];

      // Calculate normal
      const u = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
      const v = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
      ];

      // Normalize
      const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
      if (length > 0) {
        normal[0] /= length;
        normal[1] /= length;
        normal[2] /= length;
      }

      // Write normal (3 floats)
      view.setFloat32(offset, normal[0], true); offset += 4;
      view.setFloat32(offset, normal[1], true); offset += 4;
      view.setFloat32(offset, normal[2], true); offset += 4;

      // Write vertices (9 floats)
      view.setFloat32(offset, v1[0], true); offset += 4;
      view.setFloat32(offset, v1[1], true); offset += 4;
      view.setFloat32(offset, v1[2], true); offset += 4;
      view.setFloat32(offset, v2[0], true); offset += 4;
      view.setFloat32(offset, v2[1], true); offset += 4;
      view.setFloat32(offset, v2[2], true); offset += 4;
      view.setFloat32(offset, v3[0], true); offset += 4;
      view.setFloat32(offset, v3[1], true); offset += 4;
      view.setFloat32(offset, v3[2], true); offset += 4;

      // Write attribute byte count (2 bytes)
      view.setUint16(offset, 0, true); offset += 2;
    }

    return buffer;
  }

  /**
   * Convert OBJ data to Three.js BufferGeometry preserving polygon structure
   */
  private static async objToGeometry(objData: string): Promise<THREE.BufferGeometry> {
    const lines = objData.split('\n');
    const vertices: number[] = [];
    const polygonFaces: any[] = [];
    const triangleIndices: number[] = [];

    console.log('   🔍 Parsing OBJ data...');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);

      if (parts[0] === 'v') {
        // Vertex: v x y z
        vertices.push(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        );
      } else if (parts[0] === 'f') {
        // Face: f v1 v2 v3 v4... (1-based indexing)
        const faceVertices = parts.slice(1).map(v => {
          // Handle v/vt/vn format by taking only vertex index
          return parseInt(v.split('/')[0]) - 1; // Convert to 0-based
        });

        // Store polygon face information
        polygonFaces.push({
          vertices: faceVertices,
          type: faceVertices.length === 3 ? 'triangle' :
                faceVertices.length === 4 ? 'quad' :
                faceVertices.length === 5 ? 'pentagon' : 'polygon'
        });

        // Triangulate for Three.js rendering (but keep polygon metadata)
        if (faceVertices.length >= 3) {
          for (let i = 1; i < faceVertices.length - 1; i++) {
            triangleIndices.push(
              faceVertices[0],
              faceVertices[i],
              faceVertices[i + 1]
            );
          }
        }
      }
    }

    console.log(`   ✅ Parsed OBJ: ${vertices.length / 3} vertices, ${polygonFaces.length} polygon faces`);
    console.log(`   🔸 Polygon types: ${polygonFaces.map(f => f.type).join(', ')}`);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(triangleIndices);

    // CRITICAL: Preserve polygon face information
    (geometry as any).polygonFaces = polygonFaces;
    (geometry as any).polygonType = 'mixed';

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    console.log(`   ✅ Created geometry with PRESERVED polygon structure!`);
    return geometry;
  }

  /**
   * Convert STL data to Three.js BufferGeometry
   */
  private static async stlToGeometry(stlData: ArrayBuffer): Promise<THREE.BufferGeometry> {
    const view = new DataView(stlData);
    let offset = 80; // Skip header

    const triangleCount = view.getUint32(offset, true);
    offset += 4;

    const positions: number[] = [];
    const normals: number[] = [];

    for (let i = 0; i < triangleCount; i++) {
      // Skip normal (we'll compute our own)
      offset += 12;

      // Read vertices
      for (let v = 0; v < 3; v++) {
        positions.push(view.getFloat32(offset, true)); offset += 4; // x
        positions.push(view.getFloat32(offset, true)); offset += 4; // y
        positions.push(view.getFloat32(offset, true)); offset += 4; // z
      }

      // Skip attribute byte count
      offset += 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Compute normals
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  }
}
