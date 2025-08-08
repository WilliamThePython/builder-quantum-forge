import * as THREE from "three";

interface Triangle {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  index: number;
}

interface PolygonFace {
  type: string;
  originalVertices: THREE.Vector3[];
  normal: THREE.Vector3;
  triangleIndices: number[];
}

/**
 * Simple, reliable coplanar triangle merger
 * Based on the working implementation from polygonFaceReconstructor.ts
 */
export class SimpleCoplanarMerger {
  /**
   * Merge coplanar triangles in a geometry into polygon faces
   */
  static mergeCoplanarTriangles(geometry: THREE.BufferGeometry): PolygonFace[] {
    // Extract triangles from geometry
    const triangles = this.extractTriangles(geometry);

    // Group coplanar triangles
    const polygonFaces = this.groupCoplanarTriangles(triangles);

    // Log type breakdown
    const typeBreakdown = polygonFaces.reduce((acc: any, face: any) => {
      acc[face.type] = (acc[face.type] || 0) + 1;
      return acc;
    }, {});

    return polygonFaces;
  }

  /**
   * Extract triangles from BufferGeometry
   */
  private static extractTriangles(geometry: THREE.BufferGeometry): Triangle[] {
    const triangles: Triangle[] = [];
    const positions = geometry.attributes.position;

    if (geometry.index) {
      // Indexed geometry
      const indices = geometry.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const i1 = indices[i];
        const i2 = indices[i + 1];
        const i3 = indices[i + 2];

        const v1 = new THREE.Vector3(
          positions.getX(i1),
          positions.getY(i1),
          positions.getZ(i1),
        );
        const v2 = new THREE.Vector3(
          positions.getX(i2),
          positions.getY(i2),
          positions.getZ(i2),
        );
        const v3 = new THREE.Vector3(
          positions.getX(i3),
          positions.getY(i3),
          positions.getZ(i3),
        );

        triangles.push(this.createTriangle([v1, v2, v3], i / 3));
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < positions.count; i += 3) {
        const v1 = new THREE.Vector3(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i),
        );
        const v2 = new THREE.Vector3(
          positions.getX(i + 1),
          positions.getY(i + 1),
          positions.getZ(i + 1),
        );
        const v3 = new THREE.Vector3(
          positions.getX(i + 2),
          positions.getY(i + 2),
          positions.getZ(i + 2),
        );

        triangles.push(this.createTriangle([v1, v2, v3], i / 3));
      }
    }

    return triangles;
  }

  /**
   * Create triangle object with computed normal and centroid
   */
  private static createTriangle(
    vertices: THREE.Vector3[],
    index: number,
  ): Triangle {
    const [v1, v2, v3] = vertices;

    // Calculate normal
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const normal = edge1.cross(edge2).normalize();

    // Calculate centroid
    const centroid = new THREE.Vector3()
      .addVectors(v1, v2)
      .add(v3)
      .divideScalar(3);

    return {
      vertices: vertices,
      normal: normal,
      centroid: centroid,
      index: index,
    };
  }

  /**
   * Group coplanar triangles using simple, reliable algorithm
   */
  private static groupCoplanarTriangles(triangles: Triangle[]): PolygonFace[] {
    const faces: PolygonFace[] = [];
    const used = new Set<number>();
    const tolerance = 0.01; // Tolerance for coplanar detection
    const normalTolerance = 0.99; // Cos of ~8 degrees

    for (let i = 0; i < triangles.length; i++) {
      if (used.has(i)) continue;

      const baseTriangle = triangles[i];
      const coplanarTriangles = [baseTriangle];
      used.add(i);

      // Find all triangles coplanar with this one
      for (let j = i + 1; j < triangles.length; j++) {
        if (used.has(j)) continue;

        const testTriangle = triangles[j];

        // Check if normals are similar (coplanar)
        const normalDot = Math.abs(
          baseTriangle.normal.dot(testTriangle.normal),
        );
        if (normalDot < normalTolerance) continue;

        // Check if triangles are on the same plane
        const planeDistance = this.distanceToPlane(
          testTriangle.centroid,
          baseTriangle.centroid,
          baseTriangle.normal,
        );

        if (Math.abs(planeDistance) < tolerance) {
          coplanarTriangles.push(testTriangle);
          used.add(j);
        }
      }

      // Create polygon face from coplanar triangles
      if (coplanarTriangles.length === 1) {
        // Single triangle
        faces.push({
          type: "triangle",
          originalVertices: baseTriangle.vertices,
          normal: baseTriangle.normal,
          triangleIndices: [baseTriangle.index],
        });
      } else {
        // Multiple triangles - try to reconstruct polygon
        const polygonFace =
          this.reconstructPolygonFromTriangles(coplanarTriangles);
        faces.push(polygonFace);
      }
    }

    return faces;
  }

  /**
   * Reconstruct a polygon from multiple coplanar triangles
   */
  private static reconstructPolygonFromTriangles(
    triangles: Triangle[],
  ): PolygonFace {
    // Extract all unique vertices
    const vertices: THREE.Vector3[] = [];
    const vertexMap = new Map<string, THREE.Vector3>();

    triangles.forEach((triangle) => {
      triangle.vertices.forEach((vertex) => {
        const key = `${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`;
        if (!vertexMap.has(key)) {
          vertexMap.set(key, vertex.clone());
          vertices.push(vertex.clone());
        }
      });
    });

    // Determine face type and organize vertices
    let faceType: string;
    let orderedVertices: THREE.Vector3[];

    if (vertices.length === 3) {
      faceType = "triangle";
      orderedVertices = vertices;
    } else if (vertices.length === 4) {
      faceType = "quad";
      orderedVertices = this.orderQuadVertices(vertices, triangles[0].normal);
    } else {
      faceType = "polygon";
      orderedVertices = this.orderPolygonVertices(
        vertices,
        triangles[0].normal,
      );
    }

    return {
      type: faceType,
      originalVertices: orderedVertices,
      normal: triangles[0].normal,
      triangleIndices: triangles.map((t) => t.index),
    };
  }

  /**
   * Order 4 vertices to form a proper quad
   */
  private static orderQuadVertices(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): THREE.Vector3[] {
    if (vertices.length !== 4) return vertices;

    // Find center point
    const center = new THREE.Vector3();
    vertices.forEach((v) => center.add(v));
    center.divideScalar(vertices.length);

    // Create coordinate system on the plane
    const u = new THREE.Vector3().subVectors(vertices[0], center).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();

    // Calculate angles for each vertex
    const vertexAngles = vertices.map((vertex) => {
      const vec = new THREE.Vector3().subVectors(vertex, center);
      const x = vec.dot(u);
      const y = vec.dot(v);
      return { vertex, angle: Math.atan2(y, x) };
    });

    // Sort by angle and return vertices
    vertexAngles.sort((a, b) => a.angle - b.angle);
    return vertexAngles.map((va) => va.vertex);
  }

  /**
   * Order N vertices to form a proper polygon
   */
  private static orderPolygonVertices(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): THREE.Vector3[] {
    if (vertices.length <= 3) return vertices;

    // Find center point
    const center = new THREE.Vector3();
    vertices.forEach((v) => center.add(v));
    center.divideScalar(vertices.length);

    // Create coordinate system on the plane
    const u = new THREE.Vector3().subVectors(vertices[0], center).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();

    // Calculate angles for each vertex
    const vertexAngles = vertices.map((vertex) => {
      const vec = new THREE.Vector3().subVectors(vertex, center);
      const x = vec.dot(u);
      const y = vec.dot(v);
      return { vertex, angle: Math.atan2(y, x) };
    });

    // Sort by angle and return vertices
    vertexAngles.sort((a, b) => a.angle - b.angle);
    return vertexAngles.map((va) => va.vertex);
  }

  /**
   * Calculate distance from point to plane
   */
  private static distanceToPlane(
    point: THREE.Vector3,
    planePoint: THREE.Vector3,
    planeNormal: THREE.Vector3,
  ): number {
    const pointToPlane = new THREE.Vector3().subVectors(point, planePoint);
    return pointToPlane.dot(planeNormal);
  }
}
