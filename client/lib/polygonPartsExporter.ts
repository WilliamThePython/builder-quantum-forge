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
   * ONLY extrude the polygon outline - no interior triangulation!
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

    if (vertices.length < 3) {
      return `solid part_${polygonIndex + 1}_${faceInfo.type}\nendsolid part_${polygonIndex + 1}_${faceInfo.type}\n`;
    }

    const normal = faceInfo.normal.clone().normalize();
    const offset = normal.clone().multiplyScalar(thickness);

    const frontVertices = vertices;
    const backVertices = vertices.map((v: THREE.Vector3) => v.clone().add(offset));

    let stlContent = `solid part_${polygonIndex + 1}_${faceInfo.type}\n`;

    // ONLY create top and bottom faces using the EXACT polygon outline
    // No interior triangulation that creates waterwheel effects
    stlContent += this.createFlatPolygonFace(frontVertices, normal);
    stlContent += this.createFlatPolygonFace([...backVertices].reverse(), normal.clone().negate());

    // Add side walls connecting the perimeter
    stlContent += this.addPerimeterWalls(frontVertices, backVertices);

    stlContent += `endsolid part_${polygonIndex + 1}_${faceInfo.type}\n`;
    return stlContent;
  }

  /**
   * Create a flat polygon face that fills the polygon area properly
   * Uses minimal triangulation to avoid waterwheel effects
   */
  private static createFlatPolygonFace(
    vertices: THREE.Vector3[],
    normal: THREE.Vector3,
  ): string {
    let content = "";

    if (vertices.length < 3) return content;

    if (vertices.length === 3) {
      // Triangle - add directly
      content += this.addTriangleToSTL(vertices[0], vertices[1], vertices[2], normal);
    } else if (vertices.length === 4) {
      // Quad - split into 2 triangles
      content += this.addTriangleToSTL(vertices[0], vertices[1], vertices[2], normal);
      content += this.addTriangleToSTL(vertices[0], vertices[2], vertices[3], normal);
    } else {
      // For complex polygons: use center point method to avoid interior crossing
      // Calculate centroid
      const center = new THREE.Vector3();
      vertices.forEach(v => center.add(v));
      center.divideScalar(vertices.length);

      // Create triangles from center to each edge
      for (let i = 0; i < vertices.length; i++) {
        const next = (i + 1) % vertices.length;
        content += this.addTriangleToSTL(center, vertices[i], vertices[next], normal);
      }
    }

    return content;
  }

  /**
   * Add perimeter walls connecting front and back faces
   * One quad per edge around the perimeter
   */
  private static addPerimeterWalls(
    frontVertices: THREE.Vector3[],
    backVertices: THREE.Vector3[]
  ): string {
    let content = "";

    for (let i = 0; i < frontVertices.length; i++) {
      const next = (i + 1) % frontVertices.length;

      const v1 = frontVertices[i];      // Front current
      const v2 = frontVertices[next];   // Front next
      const v3 = backVertices[next];    // Back next
      const v4 = backVertices[i];       // Back current

      // Calculate normal for this side face
      const edge1 = new THREE.Vector3().subVectors(v2, v1);
      const edge2 = new THREE.Vector3().subVectors(v4, v1);
      const sideNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

      // Add two triangles to form the side quad
      content += this.addTriangleToSTL(v1, v2, v3, sideNormal);
      content += this.addTriangleToSTL(v1, v3, v4, sideNormal);
    }

    return content;
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
