import * as THREE from "three";

/**
 * PolygonGeometryBuilder creates geometries with higher-order polygon faces
 * instead of triangulating everything. Flat faces are preserved as polygons.
 */
export class PolygonGeometryBuilder {
  /**
   * Face represents a polygon face with vertices and metadata
   */
  static createFace(
    vertices: THREE.Vector3[],
    faceType: "triangle" | "quad" | "polygon",
  ): PolygonFace {
    return {
      vertices,
      faceType,
      normal: this.calculateFaceNormal(vertices),
    };
  }

  /**
   * Calculate normal for a polygon face with improved robustness
   */
  static calculateFaceNormal(vertices: THREE.Vector3[]): THREE.Vector3 {
    if (vertices.length < 3) return new THREE.Vector3(0, 0, 1);

    // Use cross product of two edges to get normal
    const edge1 = new THREE.Vector3().subVectors(vertices[1], vertices[0]);
    const edge2 = new THREE.Vector3().subVectors(vertices[2], vertices[0]);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2);

    // Ensure the normal has reasonable magnitude
    if (normal.length() < 1e-6) {
      // If the normal is too small, try different vertices
      if (vertices.length > 3) {
        const edge3 = new THREE.Vector3().subVectors(vertices[3], vertices[0]);
        normal.crossVectors(edge1, edge3);
      }
      if (normal.length() < 1e-6) {
        return new THREE.Vector3(0, 1, 0); // Default upward normal
      }
    }

    return normal.normalize();
  }

  /**
   * Ensure face winding is consistent for outward normals
   */
  static ensureOutwardFaceWinding(
    face: PolygonFace,
    geometryCenter?: THREE.Vector3,
  ): PolygonFace {
    if (!geometryCenter) {
      // Calculate geometry center from face vertices
      geometryCenter = new THREE.Vector3();
      face.vertices.forEach((v) => geometryCenter!.add(v));
      geometryCenter.divideScalar(face.vertices.length);
    }

    // Calculate face center
    const faceCenter = new THREE.Vector3();
    face.vertices.forEach((v) => faceCenter.add(v));
    faceCenter.divideScalar(face.vertices.length);

    // Vector from geometry center to face center
    const toFace = new THREE.Vector3().subVectors(faceCenter, geometryCenter);

    // Check if normal points outward (away from center)
    const dot = face.normal.dot(toFace);

    if (dot < 0) {
      // Normal points inward, reverse the vertex order
      return {
        vertices: [...face.vertices].reverse(),
        faceType: face.faceType,
        normal: face.normal.clone().negate(),
      };
    }

    return face;
  }

  /**
   * Create a rectangular prism with 6 quadrilateral faces
   */
  static createBoxWithQuads(
    width: number,
    height: number,
    depth: number,
  ): PolygonGeometry {
    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;

    // 8 vertices of the box
    const vertices = [
      new THREE.Vector3(-w, -h, -d), // 0
      new THREE.Vector3(w, -h, -d), // 1
      new THREE.Vector3(w, h, -d), // 2
      new THREE.Vector3(-w, h, -d), // 3
      new THREE.Vector3(-w, -h, d), // 4
      new THREE.Vector3(w, -h, d), // 5
      new THREE.Vector3(w, h, d), // 6
      new THREE.Vector3(-w, h, d), // 7
    ];

    // 6 quadrilateral faces - consistent counter-clockwise winding for outward normals
    const faces = [
      this.createFace(
        [vertices[0], vertices[1], vertices[2], vertices[3]],
        "quad",
      ), // front
      this.createFace(
        [vertices[5], vertices[4], vertices[7], vertices[6]],
        "quad",
      ), // back
      this.createFace(
        [vertices[4], vertices[0], vertices[3], vertices[7]],
        "quad",
      ), // left
      this.createFace(
        [vertices[1], vertices[5], vertices[6], vertices[2]],
        "quad",
      ), // right
      this.createFace(
        [vertices[3], vertices[2], vertices[6], vertices[7]],
        "quad",
      ), // top
      this.createFace(
        [vertices[0], vertices[4], vertices[5], vertices[1]],
        "quad",
      ), // bottom - fixed winding
    ];

    return { vertices, faces, type: "box" };
  }

  /**
   * Create a triangular prism with 2 triangular faces and 3 rectangular faces
   */
  static createTriangularPrism(
    radius: number,
    height: number,
  ): PolygonGeometry {
    const h = height / 2;

    // Create triangle vertices (equilateral triangle)
    const angle1 = 0;
    const angle2 = (2 * Math.PI) / 3;
    const angle3 = (4 * Math.PI) / 3;

    // Front triangle vertices
    const v0 = new THREE.Vector3(
      radius * Math.cos(angle1),
      radius * Math.sin(angle1),
      -h,
    );
    const v1 = new THREE.Vector3(
      radius * Math.cos(angle2),
      radius * Math.sin(angle2),
      -h,
    );
    const v2 = new THREE.Vector3(
      radius * Math.cos(angle3),
      radius * Math.sin(angle3),
      -h,
    );

    // Back triangle vertices
    const v3 = new THREE.Vector3(
      radius * Math.cos(angle1),
      radius * Math.sin(angle1),
      h,
    );
    const v4 = new THREE.Vector3(
      radius * Math.cos(angle2),
      radius * Math.sin(angle2),
      h,
    );
    const v5 = new THREE.Vector3(
      radius * Math.cos(angle3),
      radius * Math.sin(angle3),
      h,
    );

    const vertices = [v0, v1, v2, v3, v4, v5];

    const faces = [
      this.createFace([v0, v1, v2], "triangle"), // front triangle
      this.createFace([v5, v4, v3], "triangle"), // back triangle
      this.createFace([v0, v3, v4, v1], "quad"), // side rectangle 1
      this.createFace([v1, v4, v5, v2], "quad"), // side rectangle 2
      this.createFace([v2, v5, v3, v0], "quad"), // side rectangle 3
    ];

    return { vertices, faces, type: "triangular_prism" };
  }

  /**
   * Create a cylinder with circular top/bottom and rectangular sides
   */
  static createCylinderWithPolygons(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number = 8,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    // Create vertices for top and bottom circles
    const topVertices: THREE.Vector3[] = [];
    const bottomVertices: THREE.Vector3[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;

      // Top circle - Y is up
      const topX = radiusTop * Math.cos(angle);
      const topZ = radiusTop * Math.sin(angle);
      const topVertex = new THREE.Vector3(topX, h, topZ);
      topVertices.push(topVertex);

      // Bottom circle - Y is up
      const bottomX = radiusBottom * Math.cos(angle);
      const bottomZ = radiusBottom * Math.sin(angle);
      const bottomVertex = new THREE.Vector3(bottomX, -h, bottomZ);
      bottomVertices.push(bottomVertex);
    }

    // Add all vertices to main array
    vertices.push(...topVertices, ...bottomVertices);

    // Calculate geometry center for outward normal validation
    const geometryCenter = new THREE.Vector3(0, 0, 0);

    // Top and bottom faces (polygons) - ensure correct winding for outward normals
    let topFace = this.createFace([...topVertices], "polygon");
    let bottomFace = this.createFace([...bottomVertices], "polygon");

    // Ensure outward normals
    topFace = this.ensureOutwardFaceWinding(topFace, geometryCenter);
    bottomFace = this.ensureOutwardFaceWinding(bottomFace, geometryCenter);

    faces.push(topFace);
    faces.push(bottomFace);

    // Side faces (rectangles) - ensure correct winding for outward normals
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      let sideFace = this.createFace(
        [
          bottomVertices[i],
          bottomVertices[next],
          topVertices[next],
          topVertices[i],
        ],
        "quad",
      );

      sideFace = this.ensureOutwardFaceWinding(sideFace, geometryCenter);
      faces.push(sideFace);
    }

    return { vertices, faces, type: "cylinder" };
  }

  /**
   * Create a cone with circular base and triangular sides
   */
  static createConeWithPolygons(
    radius: number,
    height: number,
    segments: number = 8,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    // Apex of the cone - Y is up
    const apex = new THREE.Vector3(0, h, 0);

    // Base circle vertices - Y is up
    const baseVertices: THREE.Vector3[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const baseVertex = new THREE.Vector3(x, -h, z);
      baseVertices.push(baseVertex);
    }

    // Add all vertices
    vertices.push(apex, ...baseVertices);

    // Calculate geometry center for outward normal validation
    const geometryCenter = new THREE.Vector3(0, 0, 0);

    // Base face (polygon) - ensure outward normal
    let baseFace = this.createFace([...baseVertices], "polygon");
    baseFace = this.ensureOutwardFaceWinding(baseFace, geometryCenter);
    faces.push(baseFace);

    // Side faces (triangles) - ensure outward normals
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      let sideFace = this.createFace(
        [apex, baseVertices[next], baseVertices[i]],
        "triangle",
      );

      sideFace = this.ensureOutwardFaceWinding(sideFace, geometryCenter);
      faces.push(sideFace);
    }

    return { vertices, faces, type: "cone" };
  }

  /**
   * Create a tetrahedron with 4 triangular faces - simplest 3D shape
   */
  static createTetrahedron(size: number): PolygonGeometry {
    const s = size / 2;
    const h = s * Math.sqrt(2 / 3); // Height for regular tetrahedron

    const vertices = [
      new THREE.Vector3(0, h, 0), // apex
      new THREE.Vector3(-s, -h / 3, s), // base vertex 1
      new THREE.Vector3(s, -h / 3, s), // base vertex 2
      new THREE.Vector3(0, -h / 3, -s), // base vertex 3
    ];

    const faces = [
      this.createFace([vertices[0], vertices[1], vertices[2]], "triangle"), // front face - fixed winding
      this.createFace([vertices[0], vertices[2], vertices[3]], "triangle"), // right face - fixed winding
      this.createFace([vertices[0], vertices[3], vertices[1]], "triangle"), // left face - fixed winding
      this.createFace([vertices[3], vertices[2], vertices[1]], "triangle"), // base - fixed winding
    ];

    return { vertices, faces, type: "tetrahedron" };
  }

  /**
   * Create an octahedron with 8 triangular faces - diamond shape
   */
  static createOctahedron(size: number): PolygonGeometry {
    const s = size / 2;

    const vertices = [
      new THREE.Vector3(0, s, 0), // top
      new THREE.Vector3(0, -s, 0), // bottom
      new THREE.Vector3(s, 0, 0), // right
      new THREE.Vector3(-s, 0, 0), // left
      new THREE.Vector3(0, 0, s), // front
      new THREE.Vector3(0, 0, -s), // back
    ];

    const faces = [
      // Top pyramid faces - consistent outward winding
      this.createFace([vertices[0], vertices[4], vertices[2]], "triangle"),
      this.createFace([vertices[0], vertices[2], vertices[5]], "triangle"),
      this.createFace([vertices[0], vertices[5], vertices[3]], "triangle"),
      this.createFace([vertices[0], vertices[3], vertices[4]], "triangle"),
      // Bottom pyramid faces - reversed winding for outward normals
      this.createFace([vertices[1], vertices[2], vertices[4]], "triangle"),
      this.createFace([vertices[1], vertices[5], vertices[2]], "triangle"),
      this.createFace([vertices[1], vertices[3], vertices[5]], "triangle"),
      this.createFace([vertices[1], vertices[4], vertices[3]], "triangle"),
    ];

    return { vertices, faces, type: "octahedron" };
  }

  /**
   * Create a proper dodecahedron with 12 pentagonal faces
   */
  static createDodecahedron(size: number): PolygonGeometry {
    // Use icosahedron dual to create proper dodecahedron
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
    const s = size / 3;

    // Create the 20 vertices of a dodecahedron using proper coordinates
    const vertices = [
      // Cube vertices scaled by 1
      new THREE.Vector3(s, s, s),
      new THREE.Vector3(s, s, -s),
      new THREE.Vector3(s, -s, s),
      new THREE.Vector3(s, -s, -s),
      new THREE.Vector3(-s, s, s),
      new THREE.Vector3(-s, s, -s),
      new THREE.Vector3(-s, -s, s),
      new THREE.Vector3(-s, -s, -s),

      // Golden rectangles in XY plane
      new THREE.Vector3(0, s * phi, s / phi),
      new THREE.Vector3(0, s * phi, -s / phi),
      new THREE.Vector3(0, -s * phi, s / phi),
      new THREE.Vector3(0, -s * phi, -s / phi),

      // Golden rectangles in YZ plane
      new THREE.Vector3(s / phi, 0, s * phi),
      new THREE.Vector3(-s / phi, 0, s * phi),
      new THREE.Vector3(s / phi, 0, -s * phi),
      new THREE.Vector3(-s / phi, 0, -s * phi),

      // Golden rectangles in XZ plane
      new THREE.Vector3(s * phi, s / phi, 0),
      new THREE.Vector3(s * phi, -s / phi, 0),
      new THREE.Vector3(-s * phi, s / phi, 0),
      new THREE.Vector3(-s * phi, -s / phi, 0),
    ];

    // Define the 12 pentagonal faces with correct vertex ordering
    const faces = [
      this.createFace(
        [vertices[0], vertices[8], vertices[4], vertices[12], vertices[16]],
        "polygon",
      ),
      this.createFace(
        [vertices[1], vertices[16], vertices[14], vertices[9], vertices[5]],
        "polygon",
      ),
      this.createFace(
        [vertices[2], vertices[17], vertices[16], vertices[0], vertices[12]],
        "polygon",
      ),
      this.createFace(
        [vertices[3], vertices[14], vertices[16], vertices[17], vertices[11]],
        "polygon",
      ),
      this.createFace(
        [vertices[4], vertices[8], vertices[9], vertices[5], vertices[18]],
        "polygon",
      ),
      this.createFace(
        [vertices[5], vertices[9], vertices[14], vertices[3], vertices[15]],
        "polygon",
      ),
      this.createFace(
        [vertices[6], vertices[13], vertices[12], vertices[0], vertices[19]],
        "polygon",
      ),
      this.createFace(
        [vertices[7], vertices[15], vertices[3], vertices[11], vertices[10]],
        "polygon",
      ),
      this.createFace(
        [vertices[8], vertices[0], vertices[19], vertices[18], vertices[9]],
        "polygon",
      ),
      this.createFace(
        [vertices[10], vertices[6], vertices[19], vertices[18], vertices[13]],
        "polygon",
      ),
      this.createFace(
        [vertices[11], vertices[17], vertices[2], vertices[6], vertices[10]],
        "polygon",
      ),
      this.createFace(
        [vertices[12], vertices[13], vertices[18], vertices[4], vertices[2]],
        "polygon",
      ),
    ];

    return { vertices, faces, type: "dodecahedron" };
  }

  /**
   * Create an icosahedron with 20 triangular faces - sphere-like
   */
  static createIcosahedron(size: number): PolygonGeometry {
    const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
    const s = size / 2;

    const vertices = [
      // Rectangle in XY plane
      new THREE.Vector3(-s, s * phi, 0),
      new THREE.Vector3(s, s * phi, 0),
      new THREE.Vector3(-s, -s * phi, 0),
      new THREE.Vector3(s, -s * phi, 0),
      // Rectangle in YZ plane
      new THREE.Vector3(0, -s, s * phi),
      new THREE.Vector3(0, s, s * phi),
      new THREE.Vector3(0, -s, -s * phi),
      new THREE.Vector3(0, s, -s * phi),
      // Rectangle in XZ plane
      new THREE.Vector3(s * phi, 0, -s),
      new THREE.Vector3(s * phi, 0, s),
      new THREE.Vector3(-s * phi, 0, -s),
      new THREE.Vector3(-s * phi, 0, s),
    ];

    const faces = [
      // Top cap triangles
      this.createFace([vertices[0], vertices[11], vertices[5]], "triangle"),
      this.createFace([vertices[0], vertices[5], vertices[1]], "triangle"),
      this.createFace([vertices[0], vertices[1], vertices[7]], "triangle"),
      this.createFace([vertices[0], vertices[7], vertices[10]], "triangle"),
      this.createFace([vertices[0], vertices[10], vertices[11]], "triangle"),
      // Upper belt triangles
      this.createFace([vertices[1], vertices[5], vertices[9]], "triangle"),
      this.createFace([vertices[5], vertices[11], vertices[4]], "triangle"),
      this.createFace([vertices[11], vertices[10], vertices[2]], "triangle"),
      this.createFace([vertices[10], vertices[7], vertices[6]], "triangle"),
      this.createFace([vertices[7], vertices[1], vertices[8]], "triangle"),
      // Lower belt triangles
      this.createFace([vertices[3], vertices[9], vertices[4]], "triangle"),
      this.createFace([vertices[3], vertices[4], vertices[2]], "triangle"),
      this.createFace([vertices[3], vertices[2], vertices[6]], "triangle"),
      this.createFace([vertices[3], vertices[6], vertices[8]], "triangle"),
      this.createFace([vertices[3], vertices[8], vertices[9]], "triangle"),
      // Bottom cap triangles
      this.createFace([vertices[4], vertices[9], vertices[5]], "triangle"),
      this.createFace([vertices[2], vertices[4], vertices[11]], "triangle"),
      this.createFace([vertices[6], vertices[2], vertices[10]], "triangle"),
      this.createFace([vertices[8], vertices[6], vertices[7]], "triangle"),
      this.createFace([vertices[9], vertices[8], vertices[1]], "triangle"),
    ];

    return { vertices, faces, type: "icosahedron" };
  }

  /**
   * Create a stepped pyramid with multiple levels - ensure minimum spacing
   */
  static createSteppedPyramid(
    baseSize: number,
    levels: number,
    height: number,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const levelHeight = height / levels;

    // Ensure minimum size difference between levels to prevent vertex merging
    const minSizeReduction = Math.max(0.8, (baseSize * 0.1) / levels);

    for (let level = 0; level <= levels; level++) {
      // Use a more aggressive size reduction to ensure distinct levels
      const levelSize = baseSize * Math.max(0.2, 1 - (level * 0.7) / levels);
      const y = -height / 2 + level * levelHeight;
      const s = levelSize / 2;

      // Add 4 vertices for this level with unique positions
      const levelStart = vertices.length;
      vertices.push(
        new THREE.Vector3(-s, y, -s),
        new THREE.Vector3(s, y, -s),
        new THREE.Vector3(s, y, s),
        new THREE.Vector3(-s, y, s),
      );

      if (level === 0) {
        // Bottom face
        faces.push(
          this.createFace(
            [
              vertices[levelStart + 3],
              vertices[levelStart + 2],
              vertices[levelStart + 1],
              vertices[levelStart],
            ],
            "quad",
          ),
        );
      } else {
        // Connect to previous level with side faces
        const prevStart = levelStart - 4;

        // Create step faces (horizontal)
        for (let i = 0; i < 4; i++) {
          const next = (i + 1) % 4;
          // Side wall of this step
          faces.push(
            this.createFace(
              [
                vertices[prevStart + i],
                vertices[prevStart + next],
                vertices[levelStart + next],
                vertices[levelStart + i],
              ],
              "quad",
            ),
          );
        }

        // Create horizontal step surfaces
        if (level < levels) {
          // Top of this level (will be covered by next level, creating the step)
          const stepWidth = vertices[prevStart].x - vertices[levelStart].x; // Size difference
          if (stepWidth > 0.1) {
            // Only create step surface if there's significant size difference
            for (let i = 0; i < 4; i++) {
              const next = (i + 1) % 4;
              // Create the horizontal step surface around the smaller level
              const outerPrev = vertices[prevStart + i];
              const outerNext = vertices[prevStart + next];
              const innerThis = vertices[levelStart + i];
              const innerNext = vertices[levelStart + next];

              // Create L-shaped step surface
              faces.push(
                this.createFace(
                  [outerPrev, outerNext, innerNext, innerThis],
                  "quad",
                ),
              );
            }
          }
        }

        if (level === levels) {
          // Top face of pyramid
          faces.push(
            this.createFace(
              [
                vertices[levelStart],
                vertices[levelStart + 1],
                vertices[levelStart + 2],
                vertices[levelStart + 3],
              ],
              "quad",
            ),
          );
        }
      }
    }

    return { vertices, faces, type: "stepped_pyramid" };
  }

  /**
   * Create an L-bracket - common mechanical part
   */
  static createLBracket(
    width: number,
    height: number,
    depth: number,
    thickness: number,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];

    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;
    const t = thickness / 2;

    // Define the L-shape vertices
    const outerVertices = [
      // Bottom outer rectangle
      new THREE.Vector3(-w, -h, -d),
      new THREE.Vector3(w, -h, -d),
      new THREE.Vector3(w, -h + thickness, -d),
      new THREE.Vector3(-w + thickness, -h + thickness, -d),
      new THREE.Vector3(-w + thickness, h, -d),
      new THREE.Vector3(-w, h, -d),
      // Top outer rectangle
      new THREE.Vector3(-w, -h, d),
      new THREE.Vector3(w, -h, d),
      new THREE.Vector3(w, -h + thickness, d),
      new THREE.Vector3(-w + thickness, -h + thickness, d),
      new THREE.Vector3(-w + thickness, h, d),
      new THREE.Vector3(-w, h, d),
    ];

    vertices.push(...outerVertices);

    // Create faces for the L-bracket
    // Split the L into two separate rectangular arms to avoid connecting faces across the void

    // Bottom face - create two separate rectangles for horizontal and vertical arms
    // Horizontal arm rectangle (bottom strip)
    faces.push(
      this.createFace(
        [vertices[0], vertices[1], vertices[7], vertices[6]],
        "quad",
      ),
    );

    // Vertical arm rectangle (left strip)
    faces.push(
      this.createFace(
        [vertices[4], vertices[5], vertices[11], vertices[10]],
        "quad",
      ),
    );

    // Top face - create two separate rectangles for horizontal and vertical arms
    // Horizontal arm rectangle (bottom strip) - reversed for proper normal
    faces.push(
      this.createFace(
        [vertices[6], vertices[7], vertices[1], vertices[0]],
        "quad",
      ),
    );

    // Vertical arm rectangle (left strip) - reversed for proper normal
    faces.push(
      this.createFace(
        [vertices[10], vertices[11], vertices[5], vertices[4]],
        "quad",
      ),
    );

    // Side faces - only for actual L-bracket exterior edges
    // L-bracket vertices form a complex profile, need to map correctly
    const lBracketEdges = [
      [0, 1], // bottom horizontal edge
      [1, 2], // right short vertical
      [2, 3], // inner horizontal
      [3, 4], // inner vertical
      [4, 5], // top horizontal
      [5, 0], // left vertical (closing the L)
    ];

    for (const [i, next] of lBracketEdges) {
      faces.push(
        this.createFace(
          [vertices[i], vertices[next], vertices[next + 6], vertices[i + 6]],
          "quad",
        ),
      );
    }

    return { vertices, faces, type: "l_bracket" };
  }

  /**
   * Create a washer/ring - torus-like shape
   */
  static createWasher(
    outerRadius: number,
    innerRadius: number,
    height: number,
    segments: number = 16,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    // Create vertices for outer and inner circles, top and bottom
    const topOuterVertices: THREE.Vector3[] = [];
    const topInnerVertices: THREE.Vector3[] = [];
    const bottomOuterVertices: THREE.Vector3[] = [];
    const bottomInnerVertices: THREE.Vector3[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Top vertices
      topOuterVertices.push(
        new THREE.Vector3(outerRadius * cos, outerRadius * sin, h),
      );
      topInnerVertices.push(
        new THREE.Vector3(innerRadius * cos, innerRadius * sin, h),
      );

      // Bottom vertices
      bottomOuterVertices.push(
        new THREE.Vector3(outerRadius * cos, outerRadius * sin, -h),
      );
      bottomInnerVertices.push(
        new THREE.Vector3(innerRadius * cos, innerRadius * sin, -h),
      );
    }

    vertices.push(
      ...topOuterVertices,
      ...topInnerVertices,
      ...bottomOuterVertices,
      ...bottomInnerVertices,
    );

    // Top and bottom faces (rings)
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      // Top ring segment
      faces.push(
        this.createFace(
          [
            topOuterVertices[i],
            topOuterVertices[next],
            topInnerVertices[next],
            topInnerVertices[i],
          ],
          "quad",
        ),
      );

      // Bottom ring segment
      faces.push(
        this.createFace(
          [
            bottomOuterVertices[i],
            bottomInnerVertices[i],
            bottomInnerVertices[next],
            bottomOuterVertices[next],
          ],
          "quad",
        ),
      );

      // Outer side face
      faces.push(
        this.createFace(
          [
            bottomOuterVertices[i],
            bottomOuterVertices[next],
            topOuterVertices[next],
            topOuterVertices[i],
          ],
          "quad",
        ),
      );

      // Inner side face
      faces.push(
        this.createFace(
          [
            bottomInnerVertices[i],
            topInnerVertices[i],
            topInnerVertices[next],
            bottomInnerVertices[next],
          ],
          "quad",
        ),
      );
    }

    return { vertices, faces, type: "washer" };
  }

  /**
   * Create a simple house - cube base with triangular roof
   */
  static createSimpleHouse(
    width: number,
    height: number,
    depth: number,
    roofHeight: number,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];

    const w = width / 2;
    const h = height / 2;
    const d = depth / 2;
    const rh = roofHeight;

    // Base cube vertices
    const baseVertices = [
      new THREE.Vector3(-w, -h, -d),
      new THREE.Vector3(w, -h, -d),
      new THREE.Vector3(w, h, -d),
      new THREE.Vector3(-w, h, -d),
      new THREE.Vector3(-w, -h, d),
      new THREE.Vector3(w, -h, d),
      new THREE.Vector3(w, h, d),
      new THREE.Vector3(-w, h, d),
    ];

    // Roof peak vertices
    const roofVertices = [
      new THREE.Vector3(-w, h + rh, 0), // peak front
      new THREE.Vector3(w, h + rh, 0), // peak back
    ];

    vertices.push(...baseVertices, ...roofVertices);

    // Base faces (bottom and 4 walls)
    faces.push(
      this.createFace(
        [baseVertices[4], baseVertices[5], baseVertices[1], baseVertices[0]],
        "quad",
      ),
    ); // bottom
    faces.push(
      this.createFace(
        [baseVertices[0], baseVertices[1], baseVertices[2], baseVertices[3]],
        "quad",
      ),
    ); // front
    faces.push(
      this.createFace(
        [baseVertices[5], baseVertices[4], baseVertices[7], baseVertices[6]],
        "quad",
      ),
    ); // back
    faces.push(
      this.createFace(
        [baseVertices[4], baseVertices[0], baseVertices[3], baseVertices[7]],
        "quad",
      ),
    ); // left
    faces.push(
      this.createFace(
        [baseVertices[1], baseVertices[5], baseVertices[6], baseVertices[2]],
        "quad",
      ),
    ); // right

    // Roof faces
    faces.push(
      this.createFace(
        [baseVertices[3], baseVertices[2], roofVertices[1], roofVertices[0]],
        "quad",
      ),
    ); // front roof
    faces.push(
      this.createFace(
        [baseVertices[7], roofVertices[0], roofVertices[1], baseVertices[6]],
        "quad",
      ),
    ); // back roof
    faces.push(
      this.createFace(
        [baseVertices[3], roofVertices[0], baseVertices[7]],
        "triangle",
      ),
    ); // left gable
    faces.push(
      this.createFace(
        [baseVertices[2], baseVertices[6], roofVertices[1]],
        "triangle",
      ),
    ); // right gable

    return { vertices, faces, type: "simple_house" };
  }

  /**
   * Create a gear wheel - circle with teeth around edge
   */
  static createGearWheel(
    innerRadius: number,
    outerRadius: number,
    height: number,
    teeth: number,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    const topVertices: THREE.Vector3[] = [];
    const bottomVertices: THREE.Vector3[] = [];

    // Create gear profile with clear tooth pattern
    for (let i = 0; i < teeth; i++) {
      const baseAngle = (i / teeth) * Math.PI * 2;
      const toothHalfWidth = (Math.PI / teeth) * 0.3; // 30% of segment for tooth width

      // Add 4 points per tooth for clear gear shape
      const angles = [
        baseAngle - toothHalfWidth, // valley 1 (inner)
        baseAngle - toothHalfWidth * 0.5, // tip 1 (outer)
        baseAngle + toothHalfWidth * 0.5, // tip 2 (outer)
        baseAngle + toothHalfWidth, // valley 2 (inner)
      ];

      const radii = [innerRadius, outerRadius, outerRadius, innerRadius];

      for (let j = 0; j < 4; j++) {
        const x = radii[j] * Math.cos(angles[j]);
        const z = radii[j] * Math.sin(angles[j]);

        topVertices.push(new THREE.Vector3(x, h, z));
        bottomVertices.push(new THREE.Vector3(x, -h, z));
      }
    }

    vertices.push(...topVertices, ...bottomVertices);

    // Split top and bottom faces into smaller polygons to avoid unwanted triangulation
    // Create center vertices for star pattern
    const topCenter = new THREE.Vector3(0, h, 0);
    const bottomCenter = new THREE.Vector3(0, -h, 0);
    vertices.push(topCenter, bottomCenter);
    const topCenterIndex = vertices.length - 2;
    const bottomCenterIndex = vertices.length - 1;

    // Top face - create triangular faces from center to each edge
    for (let i = 0; i < topVertices.length; i++) {
      const next = (i + 1) % topVertices.length;
      faces.push(
        this.createFace(
          [
            vertices[topCenterIndex], // center
            topVertices[i],
            topVertices[next],
          ],
          "triangle",
        ),
      );
    }

    // Bottom face - create triangular faces from center to each edge (reversed)
    for (let i = 0; i < bottomVertices.length; i++) {
      const next = (i + 1) % bottomVertices.length;
      faces.push(
        this.createFace(
          [
            vertices[bottomCenterIndex], // bottom center
            bottomVertices[next],
            bottomVertices[i],
          ],
          "triangle",
        ),
      );
    }

    // Create side faces - only for actual gear profile edges
    // Each tooth has 4 vertices: valley1, tip1, tip2, valley2
    // We need faces for: valley1->tip1, tip1->tip2, tip2->valley2, valley2->next_valley1
    for (let tooth = 0; tooth < teeth; tooth++) {
      const baseIndex = tooth * 4;

      // Faces for each tooth (4 edges per tooth)
      const toothEdges = [
        [baseIndex, baseIndex + 1], // valley to tip (rising edge)
        [baseIndex + 1, baseIndex + 2], // tip to tip (tooth top)
        [baseIndex + 2, baseIndex + 3], // tip to valley (falling edge)
        [baseIndex + 3, (baseIndex + 4) % topVertices.length], // valley to next valley
      ];

      for (const [i, next] of toothEdges) {
        faces.push(
          this.createFace(
            [
              bottomVertices[i],
              bottomVertices[next],
              topVertices[next],
              topVertices[i],
            ],
            "quad",
          ),
        );
      }
    }

    return { vertices, faces, type: "gear_wheel" };
  }

  /**
   * Create an ellipsoid - stretched sphere
   */
  static createEllipsoid(
    radiusX: number,
    radiusY: number,
    radiusZ: number,
    segments: number = 12,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];

    // Create vertices using spherical coordinates
    for (let i = 0; i <= segments; i++) {
      const phi = (i / segments) * Math.PI; // 0 to PI
      for (let j = 0; j < segments * 2; j++) {
        const theta = (j / (segments * 2)) * Math.PI * 2; // 0 to 2PI

        const x = radiusX * Math.sin(phi) * Math.cos(theta);
        const y = radiusY * Math.cos(phi);
        const z = radiusZ * Math.sin(phi) * Math.sin(theta);

        vertices.push(new THREE.Vector3(x, y, z));
      }
    }

    // Create faces
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments * 2; j++) {
        const current = i * (segments * 2) + j;
        const next = i * (segments * 2) + ((j + 1) % (segments * 2));
        const below = (i + 1) * (segments * 2) + j;
        const belowNext = (i + 1) * (segments * 2) + ((j + 1) % (segments * 2));

        if (i < segments) {
          faces.push(
            this.createFace(
              [
                vertices[current],
                vertices[next],
                vertices[belowNext],
                vertices[below],
              ],
              "quad",
            ),
          );
        }
      }
    }

    return { vertices, faces, type: "ellipsoid" };
  }

  /**
   * Create a wedge - half of a cylinder cut diagonally
   */
  static createWedge(
    radius: number,
    height: number,
    segments: number = 8,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    // Create half-circle vertices
    const topVertices: THREE.Vector3[] = [];
    const bottomVertices: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI; // Half circle (0 to PI)
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);

      topVertices.push(new THREE.Vector3(x, h, z));
      bottomVertices.push(new THREE.Vector3(x, -h, z));
    }

    vertices.push(...topVertices, ...bottomVertices);

    // Curved face - side of the half cylinder
    for (let i = 0; i < segments; i++) {
      faces.push(
        this.createFace(
          [
            bottomVertices[i],
            bottomVertices[i + 1],
            topVertices[i + 1],
            topVertices[i],
          ],
          "quad",
        ),
      );
    }

    // Top half-circle face
    faces.push(this.createFace([...topVertices], "polygon"));

    // Bottom half-circle face
    faces.push(this.createFace([...bottomVertices].reverse(), "polygon"));

    // Flat side 1 (at angle 0)
    faces.push(
      this.createFace(
        [
          bottomVertices[0],
          topVertices[0],
          topVertices[segments],
          bottomVertices[segments],
        ],
        "quad",
      ),
    );

    // The wedge should also have the flat cut face - this was missing!
    // Create the diagonal cut face that makes it a "wedge"
    const cutFaceVertices = [
      bottomVertices[0], // Start of bottom arc
      bottomVertices[segments], // End of bottom arc
      topVertices[segments], // End of top arc
      topVertices[0], // Start of top arc
    ];
    faces.push(this.createFace(cutFaceVertices, "quad"));

    return { vertices, faces, type: "wedge" };
  }

  /**
   * Create a star shape - extruded star polygon with proper triangulation
   */
  static createStarShape(
    outerRadius: number,
    innerRadius: number,
    height: number,
    points: number = 5,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    const topVertices: THREE.Vector3[] = [];
    const bottomVertices: THREE.Vector3[] = [];

    // Create star vertices with proper ordering
    for (let i = 0; i < points * 2; i++) {
      const angle = (i / (points * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);

      topVertices.push(new THREE.Vector3(x, h, z));
      bottomVertices.push(new THREE.Vector3(x, -h, z));
    }

    vertices.push(...topVertices, ...bottomVertices);

    // For star shapes, break into triangular faces instead of complex polygon
    // This ensures better triangulation
    const center = new THREE.Vector3(0, h, 0);
    const bottomCenter = new THREE.Vector3(0, -h, 0);
    vertices.push(center, bottomCenter);
    const centerIndex = topVertices.length * 2;
    const bottomCenterIndex = centerIndex + 1;

    // Top star face - triangulate from center
    for (let i = 0; i < topVertices.length; i++) {
      const next = (i + 1) % topVertices.length;
      faces.push(
        this.createFace(
          [
            vertices[centerIndex], // center
            topVertices[i],
            topVertices[next],
          ],
          "triangle",
        ),
      );
    }

    // Bottom star face - triangulate from center
    for (let i = 0; i < bottomVertices.length; i++) {
      const next = (i + 1) % bottomVertices.length;
      faces.push(
        this.createFace(
          [
            vertices[bottomCenterIndex], // bottom center
            bottomVertices[next],
            bottomVertices[i],
          ],
          "triangle",
        ),
      );
    }

    // Side faces - rectangular strips
    for (let i = 0; i < topVertices.length; i++) {
      const next = (i + 1) % topVertices.length;
      faces.push(
        this.createFace(
          [
            bottomVertices[i],
            bottomVertices[next],
            topVertices[next],
            topVertices[i],
          ],
          "quad",
        ),
      );
    }

    return { vertices, faces, type: "star_shape" };
  }

  /**
   * Create a cross shape - plus sign extruded
   */
  static createCrossShape(
    width: number,
    length: number,
    thickness: number,
    height: number,
  ): PolygonGeometry {
    const vertices: THREE.Vector3[] = [];
    const faces: PolygonFace[] = [];
    const h = height / 2;

    const w = width / 2;
    const l = length / 2;
    const t = thickness / 2;

    // Create cross profile vertices (plus sign) - correct Z coordinate
    const crossProfile = [
      new THREE.Vector3(-t, -l, 0), // bottom center
      new THREE.Vector3(t, -l, 0),
      new THREE.Vector3(t, -t, 0), // bottom right inner
      new THREE.Vector3(w, -t, 0), // right bottom
      new THREE.Vector3(w, t, 0), // right top
      new THREE.Vector3(t, t, 0), // top right inner
      new THREE.Vector3(t, l, 0), // top center right
      new THREE.Vector3(-t, l, 0), // top center left
      new THREE.Vector3(-t, t, 0), // top left inner
      new THREE.Vector3(-w, t, 0), // left top
      new THREE.Vector3(-w, -t, 0), // left bottom
      new THREE.Vector3(-t, -t, 0), // bottom left inner
    ];

    // Create top and bottom vertices - correct Y coordinates for height
    const topVertices = crossProfile.map((v) => new THREE.Vector3(v.x, h, v.y));
    const bottomVertices = crossProfile.map(
      (v) => new THREE.Vector3(v.x, -h, v.y),
    );

    vertices.push(...topVertices, ...bottomVertices);

    // Top and bottom faces - create two large polygon faces for the entire cross shape
    // Top face - entire cross polygon
    faces.push(this.createFace([...topVertices], "polygon"));

    // Bottom face - entire cross polygon (reversed for correct orientation)
    faces.push(this.createFace([...bottomVertices].reverse(), "polygon"));

    // Side faces - only create faces for actual exterior edges
    // Cross shape has 12 vertices, but we need to skip the interior connections
    const exteriorEdges = [
      [0, 1], // bottom center edge
      [1, 2], // bottom right vertical
      [2, 3], // bottom right horizontal
      [3, 4], // right vertical
      [4, 5], // top right horizontal
      [5, 6], // top right vertical
      [6, 7], // top center edge
      [7, 8], // top left vertical
      [8, 9], // top left horizontal
      [9, 10], // left vertical
      [10, 11], // bottom left horizontal
      [11, 0], // bottom left vertical
    ];

    for (const [i, next] of exteriorEdges) {
      faces.push(
        this.createFace(
          [
            bottomVertices[i],
            bottomVertices[next],
            topVertices[next],
            topVertices[i],
          ],
          "quad",
        ),
      );
    }

    return { vertices, faces, type: "cross_shape" };
  }

  /**
   * Convert PolygonGeometry to Three.js BufferGeometry by triangulating
   */
  static toBufferGeometry(
    polygonGeometry: PolygonGeometry,
  ): THREE.BufferGeometry {
    console.log(
      `🔧 Converting ${polygonGeometry.type} to BufferGeometry with ${polygonGeometry.faces.length} faces`,
    );

    const positions: number[] = [];
    const normals: number[] = [];
    const faceData: FaceInfo[] = [];

    for (
      let faceIndex = 0;
      faceIndex < polygonGeometry.faces.length;
      faceIndex++
    ) {
      const face = polygonGeometry.faces[faceIndex];
      console.log(
        `  Face ${faceIndex}: ${face.faceType} with ${face.vertices.length} vertices`,
      );

      const triangulatedVertices = this.triangulateFace(face);
      console.log(
        `    Triangulated into ${triangulatedVertices.length / 3} triangles`,
      );

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
        normal: face.normal,
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );

    // Store face information for export
    (geometry as any).polygonFaces = faceData;
    (geometry as any).polygonType = polygonGeometry.type;
    // Mark as procedurally generated to indicate it's already clean
    (geometry as any).isProcedurallyGenerated = true;

    return geometry;
  }

  /**
   * Triangulate a polygon face - simplified version
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
      // Polygon - simple fan triangulation from first vertex
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
  faceType: "triangle" | "quad" | "polygon";
  normal: THREE.Vector3;
}

export interface PolygonGeometry {
  vertices: THREE.Vector3[];
  faces: PolygonFace[];
  type: string;
}

export interface FaceInfo {
  type: "triangle" | "quad" | "polygon";
  startVertex: number;
  endVertex: number;
  originalVertices: THREE.Vector3[];
  normal: THREE.Vector3;
}
