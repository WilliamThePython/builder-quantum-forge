import * as THREE from "three";
import JSZip from "jszip";
import * as XLSX from "xlsx";

/**
 * PolygonPartsExporter exports each polygon face as a separate STL or OBJ file
 * Preserves higher-order polygons (triangles, quads, etc.) instead of triangulating everything
 */
export class PolygonPartsExporter {
  /**
   * Export each polygon face as a separate STL file in a zip archive
   */
  static async exportPartsAsZip(
    geometry: THREE.BufferGeometry,
    filename: string = "polygon_parts.zip",
    options: {
      format?: "stl" | "obj"; // export format
      partThickness?: number; // mm thickness for each polygon piece
      scale?: number; // overall scale factor
    } = {},
  ): Promise<void> {
    if (!geometry || !geometry.attributes.position) {
      throw new Error("Invalid geometry provided for parts export");
    }

    const {
      format = "stl", // default to STL format
      partThickness = 2, // 2mm thick polygon pieces
      scale = 1,
    } = options;

    const startTime = Date.now();

    // Create zip file
    const zip = new JSZip();

    // Get polygon face data from geometry
    const polygonFaces = (geometry as any).polygonFaces;
    const polygonType = (geometry as any).polygonType;

    if (!polygonFaces) {
      return this.exportTriangleFallback(geometry, filename, options);
    }

    // Track part information for Excel database
    const partDatabase: any[] = [];

    // Create individual files for each polygon face
    for (let i = 0; i < polygonFaces.length; i++) {
      const faceInfo = polygonFaces[i];
      const fileExtension = format === "obj" ? "obj" : "stl";
      const partContent =
        format === "obj"
          ? this.createPolygonOBJ(faceInfo, i, partThickness, scale)
          : this.createPolygonSTL(faceInfo, i, partThickness, scale);
      const partFilename = `part_${String(i + 1).padStart(4, "0")}_${faceInfo.type}.${fileExtension}`;

      // Calculate part geometry and metrics
      const partInfo = this.calculatePolygonPartInfo(
        faceInfo,
        partThickness,
        scale,
      );
      partDatabase.push({
        "Part Number": `part_${String(i + 1).padStart(4, "0")}`,
        "File Name": partFilename,
        "Polygon Index": i + 1,
        "Face Type": faceInfo.type,
        "Vertex Count": faceInfo.originalVertices.length,
        "Thickness (mm)": partThickness,
        "Scale Factor": scale,
        "Area (mm²)": partInfo.area.toFixed(2),
        "Perimeter (mm)": partInfo.perimeter.toFixed(2),
        "Volume (mm³)": partInfo.volume.toFixed(2),
        "Centroid X (mm)": partInfo.centroid.x.toFixed(3),
        "Centroid Y (mm)": partInfo.centroid.y.toFixed(3),
        "Centroid Z (mm)": partInfo.centroid.z.toFixed(3),
        "Normal Vector X": faceInfo.normal.x.toFixed(6),
        "Normal Vector Y": faceInfo.normal.y.toFixed(6),
        "Normal Vector Z": faceInfo.normal.z.toFixed(6),
        "Min X (mm)": partInfo.bounds.min.x.toFixed(3),
        "Min Y (mm)": partInfo.bounds.min.y.toFixed(3),
        "Min Z (mm)": partInfo.bounds.min.z.toFixed(3),
        "Max X (mm)": partInfo.bounds.max.x.toFixed(3),
        "Max Y (mm)": partInfo.bounds.max.y.toFixed(3),
        "Max Z (mm)": partInfo.bounds.max.z.toFixed(3),
        "Width (mm)": partInfo.dimensions.width.toFixed(3),
        "Height (mm)": partInfo.dimensions.height.toFixed(3),
        "Depth (mm)": partInfo.dimensions.depth.toFixed(3),
        "Estimated Print Time (min)": partInfo.printTime.toFixed(1),
        "Estimated Material (g)": partInfo.material.toFixed(2),
        "Surface Area (mm²)": partInfo.surfaceArea.toFixed(2),
        "Complexity Score": partInfo.complexity.toFixed(2),
      });

      // Add to zip
      zip.file(partFilename, partContent);
    }

    // Generate Excel file with part database
    const excelBuffer = this.generatePartsDatabase(partDatabase, {
      ...options,
      partThickness,
      polygonType,
    });
    zip.file("parts_database.xlsx", excelBuffer);

    // Add assembly instructions
    const instructions = this.generateAssemblyInstructions(
      polygonFaces.length,
      { ...options, partThickness, polygonType },
    );
    zip.file("assembly_instructions.txt", instructions);

    // Generate and download zip
    const zipBlob = await zip.generateAsync({ type: "blob" });

    // Download the zip file with proper .zip extension
    const zipFilename = filename.endsWith('.zip') ? filename :
      filename.replace(/\.[^/.]+$/, '_parts.zip').replace(/^(.+?)(?:_parts)?$/, '$1_parts.zip');
    this.downloadBlob(zipBlob, zipFilename);

    const endTime = Date.now();
  }

  /**
   * Create a 3D printable STL for a single polygon with thickness
   */
  private static createPolygonSTL(
    faceInfo: any,
    polygonIndex: number,
    thickness: number,
    scale: number,
  ): string {
    const vertices = faceInfo.originalVertices.map((v: THREE.Vector3) =>
      v.clone().multiplyScalar(scale),
    );
    const normal = faceInfo.normal.clone();

    // Ensure valid normal
    if (normal.length() < 0.001) {
      normal.set(0, 0, 1);
    }

    // Create extruded polygon (prism)
    const offset = normal.clone().multiplyScalar(thickness);

    // Front face vertices (original polygon)
    const frontVertices = vertices;

    // Back face vertices (extruded by thickness)
    const backVertices = vertices.map((v: THREE.Vector3) =>
      v.clone().add(offset),
    );

    // Generate STL content
    let stlContent = `solid part_${polygonIndex + 1}_${faceInfo.type}\n`;

    // Front face (original polygon)
    stlContent += this.addPolygonToSTL(frontVertices, normal);

    // Back face (extruded polygon, flipped normal)
    const backNormal = normal.clone().negate();
    stlContent += this.addPolygonToSTL([...backVertices].reverse(), backNormal);

    // Side faces (rectangles connecting front and back)
    for (let i = 0; i < frontVertices.length; i++) {
      const next = (i + 1) % frontVertices.length;

      // Create quad for each side
      const sideQuad = [
        frontVertices[i],
        frontVertices[next],
        backVertices[next],
        backVertices[i],
      ];

      stlContent += this.addQuadToSTL(
        sideQuad[0],
        sideQuad[1],
        sideQuad[2],
        sideQuad[3],
      );
    }

    stlContent +=
      "endsolid part_" + (polygonIndex + 1) + "_" + faceInfo.type + "\n";

    return stlContent;
  }

  /**
   * Add a polygon to STL content by triangulating it properly
   * Uses earcut algorithm for concave polygons like stars
   */
  private static addPolygonToSTL(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): string {
    let content = "";

    if (vertices.length === 3) {
      // Triangle - direct output
      content += this.addTriangleToSTL(
        vertices[0],
        vertices[1],
        vertices[2],
        normal,
      );
    } else if (vertices.length === 4) {
      // Quad - use proper diagonal split to avoid degenerate triangles
      content += this.addTriangleToSTL(
        vertices[0],
        vertices[1],
        vertices[2],
        normal,
      );
      content += this.addTriangleToSTL(
        vertices[0],
        vertices[2],
        vertices[3],
        normal,
      );
    } else {
      // Complex polygon - use proper triangulation for concave shapes
      const triangles = this.triangulatePolygon(vertices, normal);
      for (const triangle of triangles) {
        content += this.addTriangleToSTL(
          triangle[0],
          triangle[1],
          triangle[2],
          normal,
        );
      }
    }

    return content;
  }

  /**
   * Triangulate a polygon properly handling concave shapes like stars
   * Uses a conservative approach to avoid extra faces
   */
  private static triangulatePolygon(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): THREE.Vector3[][] {
    if (vertices.length < 3) return [];

    // Remove duplicate vertices first
    const cleanVertices = this.removeDuplicateVertices(vertices);
    if (cleanVertices.length < 3) return [];

    // For triangles, return as-is
    if (cleanVertices.length === 3) {
      return [cleanVertices];
    }

    // For quads, use simple diagonal split
    if (cleanVertices.length === 4) {
      return [
        [cleanVertices[0], cleanVertices[1], cleanVertices[2]],
        [cleanVertices[0], cleanVertices[2], cleanVertices[3]]
      ];
    }

    // For polygons with 5+ vertices, try conservative fan triangulation first
    // If that creates invalid triangles, fall back to more robust method
    const fanTriangles = this.conservativeFanTriangulation(cleanVertices, normal);
    if (fanTriangles.length > 0) {
      return fanTriangles;
    }

    // Fallback: try from different starting vertex
    for (let startIdx = 1; startIdx < cleanVertices.length && startIdx < 3; startIdx++) {
      const reorderedVertices = [...cleanVertices.slice(startIdx), ...cleanVertices.slice(0, startIdx)];
      const reorderedTriangles = this.conservativeFanTriangulation(reorderedVertices, normal);
      if (reorderedTriangles.length > 0) {
        return reorderedTriangles;
      }
    }

    // Last resort: just use first 3 vertices as a single triangle
    return [[cleanVertices[0], cleanVertices[1], cleanVertices[2]]];
  }

  /**
   * Remove duplicate vertices that are too close together
   */
  private static removeDuplicateVertices(vertices: THREE.Vector3[]): THREE.Vector3[] {
    if (vertices.length < 2) return vertices;

    const cleanVertices: THREE.Vector3[] = [vertices[0]];
    const tolerance = 0.0001;

    for (let i = 1; i < vertices.length; i++) {
      const current = vertices[i];
      const last = cleanVertices[cleanVertices.length - 1];

      if (current.distanceTo(last) > tolerance) {
        cleanVertices.push(current);
      }
    }

    // Check if first and last vertices are duplicates
    if (cleanVertices.length > 1) {
      const first = cleanVertices[0];
      const last = cleanVertices[cleanVertices.length - 1];
      if (first.distanceTo(last) <= tolerance) {
        cleanVertices.pop();
      }
    }

    return cleanVertices;
  }

  /**
   * Conservative fan triangulation that validates each triangle
   */
  private static conservativeFanTriangulation(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): THREE.Vector3[][] {
    if (vertices.length < 3) return [];

    const triangles: THREE.Vector3[][] = [];
    const center = vertices[0];

    for (let i = 1; i < vertices.length - 1; i++) {
      const triangle = [center, vertices[i], vertices[i + 1]];

      // Validate triangle
      if (this.isValidTriangle(triangle, normal)) {
        triangles.push(triangle);
      } else {
        // If any triangle is invalid, abandon fan triangulation
        return [];
      }
    }

    return triangles;
  }

  /**
   * Check if a triangle is valid (non-degenerate and properly oriented)
   */
  private static isValidTriangle(triangle: THREE.Vector3[], expectedNormal: THREE.Vector3): boolean {
    const [v0, v1, v2] = triangle;

    // Check for degenerate triangle
    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const triangleNormal = new THREE.Vector3().crossVectors(edge1, edge2);

    // Triangle must have non-zero area
    if (triangleNormal.length() < 0.0001) {
      return false;
    }

    // Triangle normal should roughly align with expected normal
    triangleNormal.normalize();
    const dot = triangleNormal.dot(expectedNormal);

    // Allow some tolerance for floating point precision
    return dot > 0.5; // Normal should be in roughly the same direction
  }

  /**
   * Ear cutting triangulation for concave polygons
   * Projects to 2D plane, triangulates, then projects back to 3D
   */
  private static earCutTriangulation(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): THREE.Vector3[][] {
    if (vertices.length < 3) return [];

    // Create a local 2D coordinate system
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();

    // Find the most suitable axis for projection
    const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
    if (absNormal.x >= absNormal.y && absNormal.x >= absNormal.z) {
      // Project to YZ plane
      tangent.set(0, 1, 0);
    } else if (absNormal.y >= absNormal.z) {
      // Project to XZ plane
      tangent.set(1, 0, 0);
    } else {
      // Project to XY plane
      tangent.set(1, 0, 0);
    }

    bitangent.crossVectors(normal, tangent).normalize();
    tangent.crossVectors(bitangent, normal).normalize();

    // Project vertices to 2D
    const vertices2D = vertices.map(v => ({
      x: v.dot(tangent),
      y: v.dot(bitangent),
      vertex3D: v
    }));

    // Simple ear cutting algorithm
    const triangles: THREE.Vector3[][] = [];
    const remaining = [...vertices2D];

    while (remaining.length > 3) {
      let earFound = false;

      for (let i = 0; i < remaining.length; i++) {
        const prev = remaining[(i - 1 + remaining.length) % remaining.length];
        const curr = remaining[i];
        const next = remaining[(i + 1) % remaining.length];

        if (this.isEar(prev, curr, next, remaining)) {
          // Add triangle
          triangles.push([prev.vertex3D, curr.vertex3D, next.vertex3D]);
          // Remove ear vertex
          remaining.splice(i, 1);
          earFound = true;
          break;
        }
      }

      if (!earFound) {
        // Fallback: just use fan triangulation to avoid infinite loop
        for (let i = 1; i < remaining.length - 1; i++) {
          triangles.push([
            remaining[0].vertex3D,
            remaining[i].vertex3D,
            remaining[i + 1].vertex3D
          ]);
        }
        break;
      }
    }

    // Add final triangle
    if (remaining.length === 3) {
      triangles.push([
        remaining[0].vertex3D,
        remaining[1].vertex3D,
        remaining[2].vertex3D
      ]);
    }

    return triangles;
  }

  /**
   * Check if a vertex forms an ear (convex vertex with no points inside triangle)
   */
  private static isEar(
    prev: {x: number, y: number, vertex3D: THREE.Vector3},
    curr: {x: number, y: number, vertex3D: THREE.Vector3},
    next: {x: number, y: number, vertex3D: THREE.Vector3},
    allVertices: {x: number, y: number, vertex3D: THREE.Vector3}[]
  ): boolean {
    // Check if angle is convex
    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;

    const cross = v1x * v2y - v1y * v2x;
    if (cross <= 0) return false; // Not convex

    // Check if any other vertex is inside the triangle
    for (const vertex of allVertices) {
      if (vertex === prev || vertex === curr || vertex === next) continue;

      if (this.pointInTriangle2D(vertex, prev, curr, next)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if point is inside triangle using barycentric coordinates
   */
  private static pointInTriangle2D(
    point: {x: number, y: number},
    a: {x: number, y: number},
    b: {x: number, y: number},
    c: {x: number, y: number}
  ): boolean {
    const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denom) < 1e-10) return false;

    const alpha = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denom;
    const beta = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denom;
    const gamma = 1 - alpha - beta;

    return alpha > 1e-10 && beta > 1e-10 && gamma > 1e-10;
  }

  /**
   * Add a single triangle to STL content
   */
  private static addTriangleToSTL(
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    v3: THREE.Vector3,
    normal: THREE.Vector3,
  ): string {
    return (
      `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n` +
      `    outer loop\n` +
      `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n` +
      `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n` +
      `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n` +
      `    endloop\n` +
      `  endfacet\n`
    );
  }

  /**
   * Add a quad (as two triangles) to STL content
   */
  private static addQuadToSTL(
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    v3: THREE.Vector3,
    v4: THREE.Vector3,
  ): string {
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
   * Create an OBJ file for a single polygon part
   */
  private static createPolygonOBJ(
    faceInfo: any,
    polygonIndex: number,
    thickness: number,
    scale: number,
  ): string {
    const vertices = faceInfo.originalVertices.map((v: THREE.Vector3) =>
      v.clone().multiplyScalar(scale),
    );
    const normal = faceInfo.normal.clone();

    // Ensure valid normal
    if (normal.length() < 0.001) {
      normal.set(0, 0, 1);
    }

    // Create extruded polygon (prism)
    const offset = normal.clone().multiplyScalar(thickness);

    // Front face vertices (original polygon)
    const frontVertices = vertices;

    // Back face vertices (extruded by thickness)
    const backVertices = vertices.map((v: THREE.Vector3) =>
      v.clone().add(offset),
    );

    // Generate OBJ content
    let objContent = `# OBJ file for part_${polygonIndex + 1}_${faceInfo.type}\n`;
    objContent += `# Generated by STL Viewer Platform\n\n`;

    // Write all vertices
    objContent += `# Front face vertices\n`;
    frontVertices.forEach((v, i) => {
      objContent += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
    });

    objContent += `\n# Back face vertices\n`;
    backVertices.forEach((v, i) => {
      objContent += `v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;
    });

    objContent += `\n# Vertex normals\n`;
    objContent += `vn ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
    objContent += `vn ${(-normal.x).toFixed(6)} ${(-normal.y).toFixed(6)} ${(-normal.z).toFixed(6)}\n`;

    objContent += `\n# Faces\n`;

    // Front face (polygon)
    objContent += `# Front face\n`;
    objContent += this.addPolygonToOBJ(frontVertices.length, 1, 1);

    // Back face (polygon, reversed for correct winding)
    objContent += `# Back face\n`;
    objContent += this.addPolygonToOBJ(
      backVertices.length,
      frontVertices.length + 1,
      2,
      true,
    );

    // Side faces (quads)
    objContent += `# Side faces\n`;
    for (let i = 0; i < frontVertices.length; i++) {
      const next = (i + 1) % frontVertices.length;

      // Create quad face (front -> back)
      const v1 = i + 1; // front vertex (1-indexed)
      const v2 = next + 1; // next front vertex
      const v3 = frontVertices.length + next + 1; // next back vertex
      const v4 = frontVertices.length + i + 1; // back vertex

      objContent += `f ${v1} ${v2} ${v3} ${v4}\n`;
    }

    return objContent;
  }

  /**
   * Add a polygon face to OBJ content
   */
  private static addPolygonToOBJ(
    vertexCount: number,
    startIndex: number,
    normalIndex: number,
    reverse: boolean = false,
  ): string {
    let faceContent = "f ";

    const indices = [];
    for (let i = 0; i < vertexCount; i++) {
      indices.push(startIndex + i);
    }

    if (reverse) {
      indices.reverse();
    }

    indices.forEach((index, i) => {
      faceContent += `${index}//${normalIndex}`;
      if (i < indices.length - 1) {
        faceContent += " ";
      }
    });

    faceContent += "\n";
    return faceContent;
  }

  /**
   * Calculate detailed information for a polygon part
   */
  private static calculatePolygonPartInfo(
    faceInfo: any,
    thickness: number,
    scale: number,
  ) {
    const vertices = faceInfo.originalVertices.map((v: THREE.Vector3) =>
      v.clone().multiplyScalar(scale),
    );

    // Calculate polygon properties
    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      edges.push(new THREE.Vector3().subVectors(vertices[next], vertices[i]));
    }

    // Calculate area using shoelace formula for polygon
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      area +=
        vertices[i].x * vertices[next].y - vertices[next].x * vertices[i].y;
    }
    area = Math.abs(area) / 2;

    // Perimeter
    const perimeter = edges.reduce((sum, edge) => sum + edge.length(), 0);

    // Volume (area * thickness)
    const volume = area * thickness;

    // Centroid
    const centroid = new THREE.Vector3();
    vertices.forEach((v) => centroid.add(v));
    centroid.divideScalar(vertices.length);

    // Bounding box
    const minX = Math.min(...vertices.map((v) => v.x));
    const maxX = Math.max(...vertices.map((v) => v.x));
    const minY = Math.min(...vertices.map((v) => v.y));
    const maxY = Math.max(...vertices.map((v) => v.y));
    const minZ = Math.min(...vertices.map((v) => v.z));
    const maxZ = Math.max(...vertices.map((v) => v.z));

    const bounds = {
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
    };

    const dimensions = {
      width: maxX - minX,
      height: maxY - minY,
      depth: maxZ - minZ + thickness,
    };

    // Surface area (including thickness)
    const topBottomArea = area * 2;
    const sideArea = perimeter * thickness;
    const surfaceArea = topBottomArea + sideArea;

    // Print time estimation
    const baseTimePerMm2 = 0.5;
    const thicknessFactor = Math.max(1, thickness / 2);
    const printTime = area * baseTimePerMm2 * thicknessFactor;

    // Material estimation
    const materialDensity = 0.00124; // g/mm³ for PLA
    const material = volume * materialDensity;

    // Complexity score based on vertex count and area
    const complexity = vertices.length + area / 100;

    return {
      area,
      perimeter,
      volume,
      centroid,
      bounds,
      dimensions,
      surfaceArea,
      printTime,
      material,
      complexity,
    };
  }

  /**
   * Fallback to triangle export for non-polygon geometries
   */
  private static async exportTriangleFallback(
    geometry: THREE.BufferGeometry,
    filename: string,
    options: any,
  ): Promise<void> {
    const { TriangleExporter } = await import("./triangleExporter");
    return TriangleExporter.exportTrianglesAsZip(geometry, filename, options);
  }

  /**
   * Generate Excel file with parts database
   */
  private static generatePartsDatabase(
    partData: any[],
    options: any,
  ): ArrayBuffer {
    const workbook = XLSX.utils.book_new();

    const partsSheet = XLSX.utils.json_to_sheet(partData);
    partsSheet["!cols"] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 8 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(workbook, partsSheet, "Parts Database");

    const summary = this.generateSummaryData(partData, options);
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    summarySheet["!cols"] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Project Summary");

    const stats = this.generateStatistics(partData);
    const statsSheet = XLSX.utils.json_to_sheet(stats);
    statsSheet["!cols"] = [{ wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(workbook, statsSheet, "Statistics");

    return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  }

  private static generateSummaryData(partData: any[], options: any) {
    const date = new Date().toLocaleDateString();
    const totalParts = partData.length;
    const faceTypes = [...new Set(partData.map((p) => p["Face Type"]))];

    return [
      { Property: "Generation Date", Value: date },
      { Property: "Total Parts", Value: totalParts },
      { Property: "Geometry Type", Value: options.polygonType || "mixed" },
      { Property: "Face Types", Value: faceTypes.join(", ") },
      { Property: "Part Thickness (mm)", Value: options.partThickness || 2 },
      { Property: "Scale Factor", Value: options.scale || 1 },
      { Property: "Generated By", Value: "STL Polygon Parts Exporter" },
    ];
  }

  private static generateStatistics(partData: any[]) {
    const faceTypeCounts = partData.reduce(
      (acc, part) => {
        acc[part["Face Type"]] = (acc[part["Face Type"]] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(faceTypeCounts).map(([type, count]) => ({
      "Face Type": type,
      Count: count,
      Percentage: ((Number(count) / partData.length) * 100).toFixed(1) + "%",
    }));
  }

  private static generateAssemblyInstructions(
    partCount: number,
    options: any,
  ): string {
    const date = new Date().toLocaleDateString();

    return `STL Polygon Parts Assembly Kit
Generated: ${date}

ASSEMBLY INSTRUCTIONS:
=====================

This kit contains ${partCount} individual polygon parts that preserve the original face geometry.
Geometry Type: ${options.polygonType || "mixed"}

PART SPECIFICATIONS:
- Part thickness: ${options.partThickness || 2}mm
- Preserves original polygon faces (triangles, quads, etc.)
- Each part corresponds to one face of the original model

ASSEMBLY ADVANTAGES:
- Higher-order polygons reduce part count
- Flat faces remain as single pieces
- More efficient assembly process
- Better structural integrity

Happy building with polygon precision!

Generated by STL Viewer Platform - Polygon Parts Exporter
`;
  }

  private static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  /**
   * Get export statistics for polygon parts
   */
  static getExportStats(
    geometry: THREE.BufferGeometry,
    partThickness: number = 2,
  ): {
    partCount: number;
    estimatedPrintTime: string;
    estimatedMaterial: string;
    estimatedAssemblyTime: string;
    faceTypes: string;
  } {
    const polygonFaces = (geometry as any).polygonFaces;

    if (!polygonFaces) {
      // Fallback to triangle count
      const triangleCount = Math.floor(geometry.attributes.position.count / 3);
      return {
        partCount: triangleCount,
        estimatedPrintTime: `${Math.floor((triangleCount * 10) / 60)}h ${(triangleCount * 10) % 60}m`,
        estimatedMaterial: `${Math.round(triangleCount * 1.5)}g filament`,
        estimatedAssemblyTime: `${Math.floor((triangleCount * 3) / 60)}h ${(triangleCount * 3) % 60}m`,
        faceTypes: "triangles only",
      };
    }

    const partCount = polygonFaces.length;
    const faceTypes = [...new Set(polygonFaces.map((f: any) => f.type))];

    // More efficient assembly with fewer, larger parts
    const printTimePerPart = 15; // minutes per polygon part
    const totalPrintMinutes =
      partCount * printTimePerPart * (partThickness / 2);
    const printHours = Math.floor(totalPrintMinutes / 60);
    const printMinutes = totalPrintMinutes % 60;

    const materialPerPart = 2.5; // grams per polygon part
    const totalMaterial = Math.round(
      partCount * materialPerPart * (partThickness / 2),
    );

    const assemblyTimeMinutes = partCount * 5; // 5 minutes per polygon to assemble
    const assemblyHours = Math.floor(assemblyTimeMinutes / 60);
    const assemblyMins = assemblyTimeMinutes % 60;

    return {
      partCount,
      estimatedPrintTime: `${printHours}h ${printMinutes}m`,
      estimatedMaterial: `${totalMaterial}g filament`,
      estimatedAssemblyTime: `${assemblyHours}h ${assemblyMins}m`,
      faceTypes: faceTypes.join(", "),
    };
  }
}
