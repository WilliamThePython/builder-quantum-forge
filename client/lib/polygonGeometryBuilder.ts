import * as THREE from 'three';

/**
 * PolygonGeometryBuilder creates geometries with higher-order polygon faces
 * instead of triangulating everything. Flat faces are preserved as polygons.
 */
export class PolygonGeometryBuilder {
  
  /**
   * Face represents a polygon face with vertices and metadata
   */
  static createFace(vertices: THREE.Vector3[], faceType: 'triangle' | 'quad' | 'polygon'): PolygonFace {
    return {
      vertices,
      faceType,
      normal: this.calculateFaceNormal(vertices)
    };
  }

  /**
   * Calculate normal for a polygon face
   */
  static calculateFaceNormal(vertices: THREE.Vector3[]): THREE.Vector3 {
    if (vertices.length < 3) return new THREE.Vector3(0, 0, 1);
    
    const edge1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
    const edge2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
    return new THREE.Vector3().crossVectors(edge1, edge2).normalize();
  }

  /**
   * Create a rectangular prism with 6 quadrilateral faces
   */
  static createBoxWithQuads(width: number, height: number, depth: number): PolygonGeometry {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    // 8 vertices of the box
    const vertices = [
      new THREE.Vector3(-w, -h, -d), // 0
      new THREE.Vector3(w, -h, -d),  // 1
      new THREE.Vector3(w, h, -d),   // 2
      new THREE.Vector3(-w, h, -d),  // 3
      new THREE.Vector3(-w, -h, d),  // 4
      new THREE.Vector3(w, -h, d),   // 5
      new THREE.Vector3(w, h, d),    // 6
      new THREE.Vector3(-w, h, d)    // 7
    ];

    // 6 quadrilateral faces
    const faces = [
      this.createFace([vertices[0], vertices[1], vertices[2], vertices[3]], 'quad'), // front
      this.createFace([vertices[5], vertices[4], vertices[7], vertices[6]], 'quad'), // back
      this.createFace([vertices[4], vertices[0], vertices[3], vertices[7]], 'quad'), // left
      this.createFace([vertices[1], vertices[5], vertices[6], vertices[2]], 'quad'), // right
      this.createFace([vertices[3], vertices[2], vertices[6], vertices[7]], 'quad'), // top
      this.createFace([vertices[4], vertices[5], vertices[1], vertices[0]], 'quad')  // bottom
    ];

    return { vertices, faces, type: 'box' };
  }

  /**
   * Create a triangular prism with 2 triangular faces and 3 rectangular faces
   */
  static createTriangularPrism(radius: number, height: number): PolygonGeometry {
    const h = height / 2;
    
    // Create triangle vertices (equilateral triangle)
    const angle1 = 0;
    const angle2 = (2 * Math.PI) / 3;
    const angle3 = (4 * Math.PI) / 3;
    
    // Front triangle vertices
    const v0 = new THREE.Vector3(radius * Math.cos(angle1), radius * Math.sin(angle1), -h);
    const v1 = new THREE.Vector3(radius * Math.cos(angle2), radius * Math.sin(angle2), -h);
    const v2 = new THREE.Vector3(radius * Math.cos(angle3), radius * Math.sin(angle3), -h);
    
    // Back triangle vertices
    const v3 = new THREE.Vector3(radius * Math.cos(angle1), radius * Math.sin(angle1), h);
    const v4 = new THREE.Vector3(radius * Math.cos(angle2), radius * Math.sin(angle2), h);
    const v5 = new THREE.Vector3(radius * Math.cos(angle3), radius * Math.sin(angle3), h);

    const vertices = [v0, v1, v2, v3, v4, v5];

    const faces = [
      this.createFace([v0, v1, v2], 'triangle'),           // front triangle
      this.createFace([v5, v4, v3], 'triangle'),           // back triangle
      this.createFace([v0, v3, v4, v1], 'quad'),           // side rectangle 1
      this.createFace([v1, v4, v5, v2], 'quad'),           // side rectangle 2
      this.createFace([v2, v5, v3, v0], 'quad')            // side rectangle 3
    ];

    return { vertices, faces, type: 'triangular_prism' };
  }

  /**
   * Create a cylinder with circular top/bottom and rectangular sides
   */
  static createCylinderWithPolygons(radiusTop: number, radiusBottom: number, height: number, segments: number = 8): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    // Create vertices for top and bottom circles
    const topVertices: THREE.Vector3[] = [];
    const bottomVertices: THREE.Vector3[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      
      // Top circle
      const topX = radiusTop * Math.cos(angle);
      const topY = radiusTop * Math.sin(angle);
      const topVertex = new THREE.Vector3(topX, topY, h);
      topVertices.push(topVertex);
      vertices.push(topVertex);
      
      // Bottom circle
      const bottomX = radiusBottom * Math.cos(angle);
      const bottomY = radiusBottom * Math.sin(angle);
      const bottomVertex = new THREE.Vector3(bottomX, bottomY, -h);
      bottomVertices.push(bottomVertex);
      vertices.push(bottomVertex);
    }

    // Top and bottom faces (polygons)
    faces.push(this.createFace([...topVertices], 'polygon'));
    faces.push(this.createFace([...bottomVertices].reverse(), 'polygon'));

    // Side faces (rectangles)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const sideQuad = [
        bottomVertices[i],
        bottomVertices[next],
        topVertices[next],
        topVertices[i]
      ];
      faces.push(this.createFace(sideQuad, 'quad'));
    }

    return { vertices, faces, type: 'cylinder' };
  }

  /**
   * Create a cone with circular base and triangular sides
   */
  static createConeWithPolygons(radius: number, height: number, segments: number = 8): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    // Apex of the cone
    const apex = new THREE.Vector3(0, 0, h);
    vertices.push(apex);

    // Base circle vertices
    const baseVertices: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const baseVertex = new THREE.Vector3(x, y, -h);
      baseVertices.push(baseVertex);
      vertices.push(baseVertex);
    }

    // Base face (polygon)
    faces.push(this.createFace([...baseVertices].reverse(), 'polygon'));

    // Side faces (triangles)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const sideTriangle = [
        apex,
        baseVertices[i],
        baseVertices[next]
      ];
      faces.push(this.createFace(sideTriangle, 'triangle'));
    }

    return { vertices, faces, type: 'cone' };
  }

  /**
   * Convert PolygonGeometry to Three.js BufferGeometry by triangulating
   */
  static toBufferGeometry(polygonGeometry: PolygonGeometry): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const faceData: FaceInfo[] = [];

    for (const face of polygonGeometry.faces) {
      const triangulatedVertices = this.triangulateFace(face);
      const startIndex = positions.length / 3;
      
      for (const vertex of triangulatedVertices) {
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
      }

      const endIndex = positions.length / 3;
      faceData.push({
        type: face.faceType,
        startVertex: startIndex,
        endVertex: endIndex - 1,
        originalVertices: face.vertices,
        normal: face.normal
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    
    // Store face information for export
    (geometry as any).polygonFaces = faceData;
    (geometry as any).polygonType = polygonGeometry.type;

    return geometry;
  }

  /**
   * Triangulate a polygon face for Three.js rendering
   */
  static triangulateFace(face: PolygonFace): THREE.Vector3[] {
    const vertices = face.vertices;
    const triangulated: THREE.Vector3[] = [];

    if (vertices.length === 3) {
      // Already a triangle
      triangulated.push(...vertices);
    } else if (vertices.length === 4) {
      // Quad - split into 2 triangles
      triangulated.push(vertices[0], vertices[1], vertices[2]);
      triangulated.push(vertices[0], vertices[2], vertices[3]);
    } else {
      // Polygon - fan triangulation from first vertex
      for (let i = 1; i < vertices.length - 1; i++) {
        triangulated.push(vertices[0], vertices[i], vertices[i + 1]);
      }
    }

    return triangulated;
  }
}

// Types for polygon geometry
export interface PolygonFace {
  vertices: THREE.Vector3[];
  faceType: 'triangle' | 'quad' | 'polygon';
  normal: THREE.Vector3;
}

export interface PolygonGeometry {
  vertices: THREE.Vector3[];
  faces: PolygonFace[];
  type: string;
}

export interface FaceInfo {
  type: 'triangle' | 'quad' | 'polygon';
  startVertex: number;
  endVertex: number;
  originalVertices: THREE.Vector3[];
  normal: THREE.Vector3;
}
