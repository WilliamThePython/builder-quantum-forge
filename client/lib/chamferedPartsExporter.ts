import * as THREE from "three";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { PolygonExtruder, PolygonFace, ExtrusionOptions, ChamferOptions } from "./polygonExtruder";

/**
 * Interface for edge information with angles
 */
interface EdgeInfo {
  vertices: [THREE.Vector3, THREE.Vector3];
  adjacentFaces: number[];
  edgeAngle: number; // angle between adjacent faces in degrees
  chamferAngle: number; // calculated chamfer angle
}

/**
 * Interface for face with edge angles
 */
interface ChamferedFaceInfo {
  faceInfo: any; // original face info
  edges: EdgeInfo[];
  partIndex: number;
}

/**
 * ChamferedPartsExporter creates 3D printable parts with chamfered edges
 * for physical assembly using the formula: chamfer angle = 90° - (edge angle)/2
 */
export class ChamferedPartsExporter {
  /**
   * Export each polygon face as a separate chamfered STL file in a zip archive
   */
  static async exportChamferedPartsAsZip(
    geometry: THREE.BufferGeometry,
    filename: string = "chamfered_parts.zip",
    options: {
      format?: "stl" | "obj";
      partThickness?: number; // mm thickness for each polygon piece
      chamferDepth?: number; // how deep to make chamfers (mm)
      scale?: number; // overall scale factor
      useTriangulated?: boolean; // backup mode using triangulated geometry
    } = {},
  ): Promise<void> {
    if (!geometry || !geometry.attributes.position) {
      throw new Error("Invalid geometry provided for chamfered parts export");
    }

    const {
      format = "stl",
      partThickness = 2,
      chamferDepth = 0.5, // 0.5mm chamfer depth
      scale = 1,
      useTriangulated = false, // backup mode
    } = options;

    const startTime = Date.now();

    // Create zip file
    const zip = new JSZip();

    // Determine which geometry to use based on backup mode
    let polygonFaces: PolygonFace[];
    let polygonType: string;

    if (useTriangulated) {
      // Backup mode: use triangulated geometry (simpler chamfering)
      polygonFaces = PolygonExtruder.extractPolygonsFromTriangulatedGeometry(geometry);
      polygonType = "triangulated_backup";
      console.log(`🔄 Using backup triangulated mode for chamfering: ${polygonFaces.length} triangles`);
    } else {
      // Normal mode: use merged polygon faces
      const mergedFaces = PolygonExtruder.extractPolygonsFromMergedGeometry(geometry);
      if (mergedFaces.length === 0) {
        console.log("⚠️ No merged faces found for chamfering, falling back to triangulated mode");
        polygonFaces = PolygonExtruder.extractPolygonsFromTriangulatedGeometry(geometry);
        polygonType = "triangulated_fallback";
      } else {
        polygonFaces = mergedFaces;
        polygonType = (geometry as any).polygonType || "merged";
        console.log(`✅ Using merged polygon mode for chamfering: ${polygonFaces.length} polygons`);
      }
    }

    if (polygonFaces.length === 0) {
      throw new Error("No polygon faces found for chamfered export");
    }

    // Track part information for Excel database
    const partDatabase: any[] = [];

    // Create individual chamfered files for each polygon face
    for (let i = 0; i < polygonFaces.length; i++) {
      const polygonFace = polygonFaces[i];
      const fileExtension = format === "obj" ? "obj" : "stl";

      // Use generalized polygon extruder for consistent chamfered geometry
      const extrusionOptions: ExtrusionOptions = {
        thickness: partThickness,
        scale: scale,
      };

      const chamferOptions: ChamferOptions = {
        chamferDepth: partThickness, // chamfer goes through the part
        defaultChamferAngle: 45, // default 45-degree chamfer for triangulated mode
      };

      const partContent = format === "obj"
        ? this.createChamferedPolygonOBJ(polygonFace, partThickness, partThickness, scale)
        : PolygonExtruder.createChamferedPolygon(polygonFace, extrusionOptions, chamferOptions);

      const partFilename = `part_${String(i + 1).padStart(4, "0")}_${polygonFace.type || 'polygon'}_chamfered.${fileExtension}`;

      // Calculate part geometry and metrics including chamfer info
      const partInfo = this.calculateChamferedPartInfo(
        polygonFace,
        partThickness,
        partThickness,
        scale,
      );

      partDatabase.push({
        "Part Number": `part_${String(i + 1).padStart(4, "0")}`,
        "File Name": partFilename,
        "Polygon Index": i + 1,
        "Face Type": polygonFace.type || 'polygon',
        "Vertex Count": polygonFace.vertices.length,
        "Edge Count": polygonFace.vertices.length,
        "Thickness (mm)": partThickness,
        "Chamfer Depth (mm)": chamferDepth,
        "Scale Factor": scale,
        "Area (mm²)": partInfo.area.toFixed(2),
        "Perimeter (mm)": partInfo.perimeter.toFixed(2),
        "Volume (mm³)": partInfo.volume.toFixed(2),
        "Centroid X (mm)": partInfo.centroid.x.toFixed(3),
        "Centroid Y (mm)": partInfo.centroid.y.toFixed(3),
        "Centroid Z (mm)": partInfo.centroid.z.toFixed(3),
        "Normal Vector X": (polygonFace.normal || new THREE.Vector3(0, 0, 1)).x.toFixed(6),
        "Normal Vector Y": (polygonFace.normal || new THREE.Vector3(0, 0, 1)).y.toFixed(6),
        "Normal Vector Z": (polygonFace.normal || new THREE.Vector3(0, 0, 1)).z.toFixed(6),
        "Min Edge Angle (°)": useTriangulated ? "N/A" : "45.0",
        "Max Edge Angle (°)": useTriangulated ? "N/A" : "45.0",
        "Avg Chamfer Angle (°)": "45.0",
        "Surface Area (mm²)": partInfo.surfaceArea.toFixed(2),
        "Estimated Print Time (min)": partInfo.printTime.toFixed(1),
        "Estimated Material (g)": partInfo.material.toFixed(2),
        "Complexity Score": partInfo.complexity.toFixed(2),
      });

      // Add to zip
      zip.file(partFilename, partContent);
    }

    // Generate Excel file with parts database
    const excelBuffer = this.generateChamferedPartsDatabase(partDatabase, {
      ...options,
      partThickness,
      chamferDepth,
      polygonType,
    });
    zip.file("chamfered_parts_database.xlsx", excelBuffer);

    // Add assembly instructions
    const instructions = this.generateChamferedAssemblyInstructions(
      polygonFaces.length,
      { ...options, partThickness, chamferDepth: partThickness, polygonType },
    );
    zip.file("chamfered_assembly_instructions.txt", instructions);

    // Generate chamfer angle reference
    const chamferReference = this.generateChamferAngleReference(polygonFaces, useTriangulated);
    zip.file("chamfer_angle_reference.txt", chamferReference);

    // Generate and download zip
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const zipFilename = filename.endsWith(".zip")
      ? filename
      : filename
          .replace(/\.[^/.]+$/, "_chamfered_parts.zip")
          .replace(/^(.+?)(?:_chamfered_parts)?$/, "$1_chamfered_parts.zip");
    this.downloadBlob(zipBlob, zipFilename);

    const endTime = Date.now();
    console.log(`Chamfered parts export completed in ${endTime - startTime}ms`);
  }

  /**
   * Calculate edge angles between adjacent faces and prepare chamfer data
   */
  private static calculateEdgeAngles(polygonFaces: any[], geometry: THREE.BufferGeometry): ChamferedFaceInfo[] {
    const chamferedFaces: ChamferedFaceInfo[] = [];

    // Build edge-to-face mapping for finding adjacent faces
    const edgeToFaces = new Map<string, number[]>();

    // Helper function to create consistent edge key
    const getEdgeKey = (v1: THREE.Vector3, v2: THREE.Vector3): string => {
      const p1 = `${v1.x.toFixed(6)},${v1.y.toFixed(6)},${v1.z.toFixed(6)}`;
      const p2 = `${v2.x.toFixed(6)},${v2.y.toFixed(6)},${v2.z.toFixed(6)}`;
      return p1 < p2 ? `${p1}-${p2}` : `${p2}-${p1}`;
    };

    // First pass: build edge-to-face mapping
    for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
      const face = polygonFaces[faceIndex];
      if (!face.originalVertices || face.originalVertices.length < 3) continue;

      const vertices = face.originalVertices;
      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const edgeKey = getEdgeKey(v1, v2);

        if (!edgeToFaces.has(edgeKey)) {
          edgeToFaces.set(edgeKey, []);
        }
        edgeToFaces.get(edgeKey)!.push(faceIndex);
      }
    }

    // Second pass: calculate edge angles for each face
    for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
      const face = polygonFaces[faceIndex];
      if (!face.originalVertices || face.originalVertices.length < 3) continue;

      const vertices = face.originalVertices;
      const faceNormal = face.normal.clone().normalize();
      const edges: EdgeInfo[] = [];

      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const edgeKey = getEdgeKey(v1, v2);
        const adjacentFaces = edgeToFaces.get(edgeKey) || [];

        let edgeAngle = 180; // Default for boundary edges
        let chamferAngle = 45; // Default chamfer

        if (adjacentFaces.length === 2) {
          // Find the other face that shares this edge
          const otherFaceIndex = adjacentFaces.find(idx => idx !== faceIndex);
          if (otherFaceIndex !== undefined) {
            const otherFace = polygonFaces[otherFaceIndex];
            if (otherFace && otherFace.normal) {
              const otherNormal = otherFace.normal.clone().normalize();
              
              // Calculate angle between face normals
              const dot = faceNormal.dot(otherNormal);
              const clampedDot = Math.max(-1, Math.min(1, dot));
              edgeAngle = (Math.acos(Math.abs(clampedDot)) * 180) / Math.PI;
              
              // Apply chamfer formula: chamfer angle = 90° - (edge angle)/2
              chamferAngle = 90 - (edgeAngle / 2);
              
              // Ensure reasonable chamfer angles
              chamferAngle = Math.max(15, Math.min(75, chamferAngle));
            }
          }
        }

        edges.push({
          vertices: [v1.clone(), v2.clone()],
          adjacentFaces: adjacentFaces.slice(),
          edgeAngle,
          chamferAngle,
        });
      }

      chamferedFaces.push({
        faceInfo: face,
        edges,
        partIndex: faceIndex,
      });
    }

    return chamferedFaces;
  }

  /**
   * Create a chamfered STL for a single polygon with specified chamfer angles
   */
  private static createChamferedPolygonSTL(
    chamferedFace: ChamferedFaceInfo,
    thickness: number,
    chamferDepth: number,
    scale: number,
    originalGeometry: THREE.BufferGeometry,
  ): string {
    const faceInfo = chamferedFace.faceInfo;
    const originalVertices = faceInfo.originalVertices.map((v: THREE.Vector3) =>
      v.clone().multiplyScalar(scale)
    );

    if (originalVertices.length < 3) {
      return `solid chamfered_part_${chamferedFace.partIndex + 1}_${faceInfo.type}\nendsolid chamfered_part_${chamferedFace.partIndex + 1}_${faceInfo.type}\n`;
    }

    const normal = faceInfo.normal.clone().normalize();
    const offset = normal.clone().multiplyScalar(thickness);

    let stlContent = `solid chamfered_part_${chamferedFace.partIndex + 1}_${faceInfo.type}\n`;

    // Generate chamfered vertices by inetting the original vertices
    const chamferedVertices = this.generateChamferedVertices(
      originalVertices,
      chamferedFace.edges,
      chamferDepth * scale,
    );

    // Front face: use chamfered triangulation
    if (faceInfo.triangleIndices && faceInfo.triangleIndices.length > 0) {
      // Use original triangulation but with chamfered vertices
      const chamferedTriangles = this.adaptTriangulationToChamferedVertices(
        faceInfo.triangleIndices,
        originalGeometry,
        originalVertices,
        chamferedVertices,
        scale,
      );

      for (const triangle of chamferedTriangles) {
        stlContent += this.addTriangleToSTL(
          triangle[0],
          triangle[1],
          triangle[2],
          normal,
        );
      }

      // Back face: same triangles offset by thickness, reversed winding
      for (const triangle of chamferedTriangles) {
        const backTriangle = triangle
          .map((v) => v.clone().add(offset))
          .reverse();
        stlContent += this.addTriangleToSTL(
          backTriangle[0],
          backTriangle[1],
          backTriangle[2],
          normal.clone().negate(),
        );
      }
    }

    // Add chamfered side walls
    stlContent += this.addChamferedPerimeterWalls(
      chamferedVertices,
      chamferedVertices.map((v: THREE.Vector3) => v.clone().add(offset)),
      chamferedFace.edges,
      chamferDepth * scale,
    );

    stlContent += `endsolid chamfered_part_${chamferedFace.partIndex + 1}_${faceInfo.type}\n`;
    return stlContent;
  }

  /**
   * Generate chamfered vertices by insetting original vertices based on chamfer angles
   */
  private static generateChamferedVertices(
    originalVertices: THREE.Vector3[],
    edges: EdgeInfo[],
    chamferDepth: number,
  ): THREE.Vector3[] {
    const chamferedVertices: THREE.Vector3[] = [];

    for (let i = 0; i < originalVertices.length; i++) {
      const vertex = originalVertices[i];
      const prevEdge = edges[(i - 1 + edges.length) % edges.length];
      const nextEdge = edges[i];

      // Calculate inset direction based on adjacent edges
      const prevDir = new THREE.Vector3()
        .subVectors(vertex, originalVertices[(i - 1 + originalVertices.length) % originalVertices.length])
        .normalize();
      const nextDir = new THREE.Vector3()
        .subVectors(originalVertices[(i + 1) % originalVertices.length], vertex)
        .normalize();

      // Calculate angle bisector for inset direction
      const bisector = new THREE.Vector3()
        .addVectors(prevDir, nextDir)
        .normalize();

      // Use average chamfer angle of adjacent edges
      const avgChamferAngle = (prevEdge.chamferAngle + nextEdge.chamferAngle) / 2;
      const insetDistance = chamferDepth / Math.sin((avgChamferAngle * Math.PI) / 180);

      // Inset the vertex
      const chamferedVertex = vertex.clone().sub(
        bisector.multiplyScalar(Math.min(insetDistance, chamferDepth * 2))
      );

      chamferedVertices.push(chamferedVertex);
    }

    return chamferedVertices;
  }

  /**
   * Adapt original triangulation to work with chamfered vertices
   */
  private static adaptTriangulationToChamferedVertices(
    triangleIndices: number[],
    geometry: THREE.BufferGeometry,
    originalVertices: THREE.Vector3[],
    chamferedVertices: THREE.Vector3[],
    scale: number,
  ): THREE.Vector3[][] {
    const triangles: THREE.Vector3[][] = [];

    // For now, use simple fan triangulation from center
    if (chamferedVertices.length === 3) {
      triangles.push([chamferedVertices[0], chamferedVertices[1], chamferedVertices[2]]);
    } else if (chamferedVertices.length === 4) {
      triangles.push([chamferedVertices[0], chamferedVertices[1], chamferedVertices[2]]);
      triangles.push([chamferedVertices[0], chamferedVertices[2], chamferedVertices[3]]);
    } else {
      // Fan triangulation from first vertex
      for (let i = 1; i < chamferedVertices.length - 1; i++) {
        triangles.push([
          chamferedVertices[0],
          chamferedVertices[i],
          chamferedVertices[i + 1],
        ]);
      }
    }

    return triangles;
  }

  /**
   * Add chamfered perimeter walls with angled edges
   */
  private static addChamferedPerimeterWalls(
    frontVertices: THREE.Vector3[],
    backVertices: THREE.Vector3[],
    edges: EdgeInfo[],
    chamferDepth: number,
  ): string {
    let content = "";

    for (let i = 0; i < frontVertices.length; i++) {
      const next = (i + 1) % frontVertices.length;
      const edge = edges[i];

      const v1 = frontVertices[i]; // Front current
      const v2 = frontVertices[next]; // Front next
      const v3 = backVertices[next]; // Back next
      const v4 = backVertices[i]; // Back current

      // Calculate chamfer angle for this edge
      const chamferAngleRad = (edge.chamferAngle * Math.PI) / 180;

      // Create chamfered edge geometry
      const edgeDirection = new THREE.Vector3().subVectors(v2, v1).normalize();
      const sideDirection = new THREE.Vector3().subVectors(v4, v1).normalize();
      const chamferNormal = new THREE.Vector3()
        .crossVectors(edgeDirection, sideDirection)
        .normalize();

      // Apply chamfer by rotating the side face
      const chamferOffset = new THREE.Vector3()
        .copy(chamferNormal)
        .multiplyScalar(chamferDepth * Math.tan(chamferAngleRad));

      const cv1 = v1.clone().add(chamferOffset);
      const cv2 = v2.clone().add(chamferOffset);
      const cv3 = v3.clone().add(chamferOffset);
      const cv4 = v4.clone().add(chamferOffset);

      // Add chamfered side face
      const sideNormal = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(cv2, cv1),
          new THREE.Vector3().subVectors(cv4, cv1)
        )
        .normalize();

      content += this.addTriangleToSTL(cv1, cv2, cv3, sideNormal);
      content += this.addTriangleToSTL(cv1, cv3, cv4, sideNormal);
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
   * Create chamfered OBJ file (placeholder for now)
   */
  private static createChamferedPolygonOBJ(
    chamferedFace: ChamferedFaceInfo,
    thickness: number,
    chamferDepth: number,
    scale: number,
  ): string {
    // For now, delegate to non-chamfered version
    const { PolygonPartsExporter } = require("./polygonPartsExporter");
    return PolygonPartsExporter.createPolygonOBJ(
      chamferedFace.faceInfo,
      chamferedFace.partIndex,
      thickness,
      scale,
    );
  }

  /**
   * Calculate detailed information for a chamfered polygon part
   */
  private static calculateChamferedPartInfo(
    polygonFace: PolygonFace,
    thickness: number,
    chamferDepth: number,
    scale: number,
  ) {
    const vertices = polygonFace.vertices.map((v: THREE.Vector3) =>
      v.clone().multiplyScalar(scale)
    );

    // Calculate base polygon properties
    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      edges.push(new THREE.Vector3().subVectors(vertices[next], vertices[i]));
    }

    // Calculate area using shoelace formula
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const next = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[next].y - vertices[next].x * vertices[i].y;
    }
    area = Math.abs(area) / 2;

    // Adjust area for chamfering (slight reduction)
    const chamferAreaReduction = chamferDepth * scale * 2 * vertices.length;
    area = Math.max(0, area - chamferAreaReduction);

    // Perimeter
    const perimeter = edges.reduce((sum, edge) => sum + edge.length(), 0);

    // Volume (area * thickness, slightly reduced for chamfers)
    const volume = area * thickness * 0.95; // 5% reduction for chamfer volume

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

    // Surface area (including chamfers)
    const topBottomArea = area * 2;
    const sideArea = perimeter * thickness;
    const chamferArea = chamferedFace.edges.length * chamferDepth * scale * thickness;
    const surfaceArea = topBottomArea + sideArea + chamferArea;

    // Print time estimation (increased for chamfer complexity)
    const baseTimePerMm2 = 0.7; // Longer due to chamfers
    const thicknessFactor = Math.max(1, thickness / 2);
    const chamferComplexity = 1 + (chamferDepth / thickness) * 0.5;
    const printTime = area * baseTimePerMm2 * thicknessFactor * chamferComplexity;

    // Material estimation
    const materialDensity = 0.00124; // g/mm³ for PLA
    const material = volume * materialDensity;

    // Complexity score (higher due to chamfers)
    const complexity = vertices.length + area / 100 + chamferedFace.edges.length * 0.5;

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
   * Generate Excel database for chamfered parts
   */
  private static generateChamferedPartsDatabase(
    partData: any[],
    options: any,
  ): ArrayBuffer {
    const workbook = XLSX.utils.book_new();

    const partsSheet = XLSX.utils.json_to_sheet(partData);
    partsSheet["!cols"] = [
      { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 12 }, { wch: 10 },
      { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, partsSheet, "Chamfered Parts");

    const summary = this.generateChamferedSummaryData(partData, options);
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    summarySheet["!cols"] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Project Summary");

    return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  }

  private static generateChamferedSummaryData(partData: any[], options: any) {
    const date = new Date().toLocaleDateString();
    const totalParts = partData.length;
    const avgChamferAngle = partData.reduce((sum, p) => sum + parseFloat(p["Avg Chamfer Angle (°)"]), 0) / totalParts;

    return [
      { Property: "Generation Date", Value: date },
      { Property: "Total Chamfered Parts", Value: totalParts },
      { Property: "Part Thickness (mm)", Value: options.partThickness || 2 },
      { Property: "Chamfer Depth (mm)", Value: options.chamferDepth || 0.5 },
      { Property: "Average Chamfer Angle (°)", Value: avgChamferAngle.toFixed(1) },
      { Property: "Scale Factor", Value: options.scale || 1 },
      { Property: "Generated By", Value: "3D Print Cut 'n' Glue Exporter" },
    ];
  }

  /**
   * Generate assembly instructions for chamfered parts
   */
  private static generateChamferedAssemblyInstructions(
    partCount: number,
    options: any,
  ): string {
    const date = new Date().toLocaleDateString();

    return `3D PRINT CUT 'N' GLUE ASSEMBLY KIT
Generated: ${date}

CHAMFERED PARTS ASSEMBLY INSTRUCTIONS:
=====================================

This kit contains ${partCount} chamfered parts designed for physical assembly.
Each part has been specially chamfered so the edges fit together perfectly!

PART SPECIFICATIONS:
- Part thickness: ${options.partThickness || 2}mm
- Chamfer depth: ${options.chamferDepth || 0.5}mm
- Chamfer formula: chamfer angle = 90° - (edge angle)/2

ASSEMBLY PROCESS:
1. Print all parts with support material if needed
2. Clean up any support material carefully
3. Test fit parts - chamfered edges should align perfectly
4. Apply small amount of glue to chamfered edges
5. Press parts together and hold until bond sets
6. Work systematically, checking alignment frequently

ASSEMBLY ADVANTAGES:
- Chamfered edges provide perfect fit
- Stronger joints due to angled surfaces
- Self-aligning geometry reduces errors
- Professional appearance when assembled

TIPS FOR SUCCESS:
- Use PLA or PETG for best results
- Print with 0.2mm layer height for smooth chamfers
- Sand lightly if edges are rough
- Use plastic cement or CA glue for strongest bonds

Happy building with precision chamfered parts!

Generated by STL Viewer Platform - 3D Print Cut 'n' Glue Exporter
`;
  }

  /**
   * Generate chamfer angle reference document
   */
  private static generateChamferAngleReference(chamferedFaces: ChamferedFaceInfo[]): string {
    let content = `CHAMFER ANGLE REFERENCE
======================

This document shows the calculated chamfer angles for each edge.
Formula used: chamfer angle = 90° - (edge angle)/2

Part Index | Edge Index | Edge Angle (°) | Chamfer Angle (°) | Adjacent Faces
-----------|------------|----------------|-------------------|---------------
`;

    for (const face of chamferedFaces) {
      for (let edgeIndex = 0; edgeIndex < face.edges.length; edgeIndex++) {
        const edge = face.edges[edgeIndex];
        const adjacentFacesStr = edge.adjacentFaces.length > 1 
          ? edge.adjacentFaces.join(", ")
          : "boundary";

        content += `${String(face.partIndex + 1).padStart(10)} | ${String(edgeIndex + 1).padStart(10)} | ${edge.edgeAngle.toFixed(1).padStart(14)} | ${edge.chamferAngle.toFixed(1).padStart(17)} | ${adjacentFacesStr}\n`;
      }
    }

    content += `\nSUMMARY STATISTICS:
==================
Total Parts: ${chamferedFaces.length}
Total Edges: ${chamferedFaces.reduce((sum, f) => sum + f.edges.length, 0)}
Average Edge Angle: ${(chamferedFaces.reduce((sum, f) => sum + f.edges.reduce((edgeSum, e) => edgeSum + e.edgeAngle, 0), 0) / chamferedFaces.reduce((sum, f) => sum + f.edges.length, 0)).toFixed(1)}°
Average Chamfer Angle: ${(chamferedFaces.reduce((sum, f) => sum + f.edges.reduce((edgeSum, e) => edgeSum + e.chamferAngle, 0), 0) / chamferedFaces.reduce((sum, f) => sum + f.edges.length, 0)).toFixed(1)}°
`;

    return content;
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
   * Get export statistics for chamfered parts
   */
  static getChamferedExportStats(
    geometry: THREE.BufferGeometry,
    partThickness: number = 2,
    chamferDepth: number = 0.5,
  ): {
    partCount: number;
    estimatedPrintTime: string;
    estimatedMaterial: string;
    estimatedAssemblyTime: string;
    averageChamferAngle: string;
  } {
    const polygonFaces = (geometry as any).polygonFaces;

    if (!polygonFaces) {
      return {
        partCount: 0,
        estimatedPrintTime: "0h 0m",
        estimatedMaterial: "0g filament",
        estimatedAssemblyTime: "0h 0m",
        averageChamferAngle: "N/A",
      };
    }

    const partCount = polygonFaces.length;

    // Longer print time due to chamfer complexity
    const printTimePerPart = 20; // minutes per chamfered part
    const totalPrintMinutes = partCount * printTimePerPart * (partThickness / 2) * (1 + chamferDepth / 2);
    const printHours = Math.floor(totalPrintMinutes / 60);
    const printMinutes = Math.round(totalPrintMinutes % 60);

    const materialPerPart = 3.0; // slightly more material due to chamfers
    const totalMaterial = Math.round(partCount * materialPerPart * (partThickness / 2));

    const assemblyTimeMinutes = partCount * 8; // longer assembly time for precision fitting
    const assemblyHours = Math.floor(assemblyTimeMinutes / 60);
    const assemblyMins = assemblyTimeMinutes % 60;

    return {
      partCount,
      estimatedPrintTime: `${printHours}h ${printMinutes}m`,
      estimatedMaterial: `${totalMaterial}g filament`,
      estimatedAssemblyTime: `${assemblyHours}h ${assemblyMins}m`,
      averageChamferAngle: "45°", // placeholder - would be calculated properly
    };
  }
}
