import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useSTL } from "../context/STLContext";
import { STLManipulator, STLToolMode } from "../lib/stlManipulator";
import { computeFlatNormals } from "../lib/flatNormals";
import { computePolygonAwareFlatNormals } from "../lib/polygonFlatNormals";
import { convertToNonIndexedForFlatColors } from "../lib/flatGeometry";

// ENHANCED: Helper function to find the nearest POLYGON PERIMETER edge to a click point
// Supports both STL (reconstructed polygons) and OBJ (preserved polygons) files
function findNearestPolygonEdge(
  geometry: THREE.BufferGeometry,
  intersection: THREE.Intersection,
): { vertexIndex1: number; vertexIndex2: number } | null {
  if (!intersection.face) {
    return null;
  }

  const point = intersection.point;
  const positions = geometry.attributes.position.array as Float32Array;

  // Check if this geometry has polygon face metadata (both STL reconstructed and OBJ preserved)
  const polygonFaces = (geometry as any).polygonFaces;
  const originalFormat = (geometry as any).originalFormat;

  if (!polygonFaces || !Array.isArray(polygonFaces)) {
    return null;
  }

  // Processing polygon faces for edge detection

  // Find which polygon face was clicked
  const clickedPolygonFace = findPolygonFaceFromIntersection(
    geometry,
    intersection,
  );
  if (
    clickedPolygonFace === null ||
    clickedPolygonFace >= polygonFaces.length
  ) {
    return null;
  }

  const polygonFace = polygonFaces[clickedPolygonFace];

  // ENHANCED: Handle different polygon vertex formats (STL reconstructed vs OBJ preserved)
  let polygonVertices;

  if (
    polygonFace.originalVertices &&
    polygonFace.originalVertices.length >= 3
  ) {
    // STL reconstructed format or OBJ with originalVertices
    polygonVertices = polygonFace.originalVertices;
  } else if (polygonFace.vertices && polygonFace.vertices.length >= 3) {
    // OBJ preserved format with indexed vertices
    polygonVertices = polygonFace.vertices.map((v: any) => {
      if (typeof v === "number") {
        // Direct vertex index
        const idx = v * 3;
        return new THREE.Vector3(
          positions[idx],
          positions[idx + 1],
          positions[idx + 2],
        );
      } else if (v && typeof v.index === "number") {
        // Vertex object with index
        const idx = v.index * 3;
        return new THREE.Vector3(
          positions[idx],
          positions[idx + 1],
          positions[idx + 2],
        );
      } else {
        return new THREE.Vector3();
      }
    });
  } else {
    return null;
  }

  if (!polygonVertices || polygonVertices.length < 3) {
    return null;
  }

  // Create perimeter edges of the polygon (not internal triangulation edges)
  const perimeterEdges = [];
  for (let i = 0; i < polygonVertices.length; i++) {
    const currentVertex = polygonVertices[i];
    const nextVertex = polygonVertices[(i + 1) % polygonVertices.length]; // Wrap around to first vertex

    // Ensure vertices are Vector3 objects
    const currentVec3 =
      currentVertex instanceof THREE.Vector3
        ? currentVertex
        : new THREE.Vector3(currentVertex.x, currentVertex.y, currentVertex.z);

    const nextVec3 =
      nextVertex instanceof THREE.Vector3
        ? nextVertex
        : new THREE.Vector3(nextVertex.x, nextVertex.y, nextVertex.z);

    perimeterEdges.push({
      v1: {
        index: findVertexIndex(positions, currentVec3),
        position: currentVec3.clone(),
      },
      v2: {
        index: findVertexIndex(positions, nextVec3),
        position: nextVec3.clone(),
      },
    });
  }

  // Find the closest perimeter edge to the click point
  let nearestEdge = perimeterEdges[0];
  let minDistance = Number.MAX_VALUE;

  perimeterEdges.forEach((edge, edgeIndex) => {
    // Calculate distance from click point to this perimeter edge
    const line = new THREE.Line3(edge.v1.position, edge.v2.position);
    const closestPoint = new THREE.Vector3();
    line.closestPointToPoint(point, true, closestPoint);
    const distance = point.distanceTo(closestPoint);

    if (distance < minDistance) {
      minDistance = distance;
      nearestEdge = edge;
    }
  });

  // VALIDATION: Ensure this edge is a proper polygon boundary
  if (
    nearestEdge &&
    !isValidPolygonBoundaryEdge(
      polygonFaces,
      nearestEdge.v1.position,
      nearestEdge.v2.position,
    )
  ) {
    return null;
  }

  return {
    vertexIndex1: nearestEdge.v1.index,
    vertexIndex2: nearestEdge.v2.index,
  };
}

// Helper function to find which polygon face contains the intersection
function findPolygonFaceFromIntersection(
  geometry: THREE.BufferGeometry,
  intersection: THREE.Intersection,
): number | null {
  if (!intersection.face) return null;

  // Try to use STLManipulator if available, otherwise calculate manually
  try {
    return STLManipulator.getPolygonFaceFromIntersection(
      geometry,
      intersection,
    );
  } catch (error) {
    // Fallback silently
  }

  // Fallback: calculate triangle index and map to polygon face
  const triangleIndex = intersection.faceIndex || 0;
  const polygonFaces = (geometry as any).polygonFaces;

  if (!polygonFaces) return null;

  let currentTriangleOffset = 0;
  for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
    const face = polygonFaces[faceIndex];
    const triangleCount = getTriangleCountForPolygon(face);

    if (
      triangleIndex >= currentTriangleOffset &&
      triangleIndex < currentTriangleOffset + triangleCount
    ) {
      return faceIndex;
    }
    currentTriangleOffset += triangleCount;
  }

  return null;
}

// Helper function to find vertex index from position
function findVertexIndex(
  positions: Float32Array,
  targetVertex: THREE.Vector3,
): number {
  const tolerance = 0.001;

  for (let i = 0; i < positions.length; i += 3) {
    const vertex = new THREE.Vector3(
      positions[i],
      positions[i + 1],
      positions[i + 2],
    );
    if (vertex.distanceTo(targetVertex) < tolerance) {
      return i / 3;
    }
  }

  return 0;
}

// Validate that an edge is a proper polygon boundary (not internal triangulation)
function isValidPolygonBoundaryEdge(
  polygonFaces: any[],
  vertex1: THREE.Vector3,
  vertex2: THREE.Vector3,
): boolean {
  const tolerance = 0.001;
  let faceCount = 0;

  // ENHANCED: Count how many polygon faces contain this edge (supports both STL and OBJ)
  for (const face of polygonFaces) {
    // Handle different polygon vertex formats
    let faceVertices;

    if (face.originalVertices && face.originalVertices.length >= 3) {
      faceVertices = face.originalVertices;
    } else if (face.vertices && face.vertices.length >= 3) {
      // OBJ format may use indexed vertices - convert to positions
      faceVertices = face.vertices
        .map((v: any) => {
          if (v instanceof THREE.Vector3) {
            return v;
          } else if (v && typeof v.x === "number") {
            return new THREE.Vector3(v.x, v.y, v.z);
          }
          return null;
        })
        .filter((v) => v !== null);
    } else {
      continue; // Skip invalid faces
    }

    if (!faceVertices || faceVertices.length < 3) continue;

    let hasVertex1 = false;
    let hasVertex2 = false;

    // Check if this polygon face contains both vertices of the edge
    for (const vertex of faceVertices) {
      const vertexPos =
        vertex instanceof THREE.Vector3
          ? vertex
          : new THREE.Vector3(vertex.x, vertex.y, vertex.z);

      if (vertexPos.distanceTo(vertex1) < tolerance) {
        hasVertex1 = true;
      }
      if (vertexPos.distanceTo(vertex2) < tolerance) {
        hasVertex2 = true;
      }
    }

    // If this face contains both vertices, check if they're consecutive (proper edge)
    if (hasVertex1 && hasVertex2) {
      if (
        areVerticesConsecutiveInPolygon(
          faceVertices,
          vertex1,
          vertex2,
          tolerance,
        )
      ) {
        faceCount++;
      }
    }
  }

  // A valid polygon boundary edge should be shared by exactly 1 or 2 faces
  // (1 = exterior edge, 2 = interior edge between adjacent faces)
  const isValid = faceCount >= 1 && faceCount <= 2;

  if (!isValid) {
  }

  return isValid;
}

// Check if two vertices are consecutive in a polygon perimeter
function areVerticesConsecutiveInPolygon(
  vertices: any[],
  vertex1: THREE.Vector3,
  vertex2: THREE.Vector3,
  tolerance: number,
): boolean {
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    const currentPos =
      current instanceof THREE.Vector3
        ? current
        : new THREE.Vector3(current.x, current.y, current.z);
    const nextPos =
      next instanceof THREE.Vector3
        ? next
        : new THREE.Vector3(next.x, next.y, next.z);

    // Check if current->next matches vertex1->vertex2 or vertex2->vertex1
    if (
      (currentPos.distanceTo(vertex1) < tolerance &&
        nextPos.distanceTo(vertex2) < tolerance) ||
      (currentPos.distanceTo(vertex2) < tolerance &&
        nextPos.distanceTo(vertex1) < tolerance)
    ) {
      return true;
    }
  }

  return false;
}

// Check if a polygon is actually coplanar (all vertices lie in the same plane)
function isCoplanarPolygon(vertices: any[]): boolean {
  if (vertices.length < 4) return true; // Triangles are always coplanar

  const tolerance = 0.001;

  // Convert to Vector3 objects
  const positions = vertices.map((v) =>
    v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z),
  );

  // Calculate plane from first 3 non-collinear vertices
  let planeNormal: THREE.Vector3 | null = null;
  let planePoint: THREE.Vector3 | null = null;

  for (let i = 0; i < positions.length - 2; i++) {
    const v1 = positions[i];
    const v2 = positions[i + 1];
    const v3 = positions[i + 2];

    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);

    const normal = new THREE.Vector3().crossVectors(edge1, edge2);

    if (normal.length() > tolerance) {
      planeNormal = normal.normalize();
      planePoint = v1;
      break;
    }
  }

  if (!planeNormal || !planePoint) return false; // All points are collinear

  // Check if all other vertices lie on this plane
  for (const vertex of positions) {
    const toVertex = new THREE.Vector3().subVectors(vertex, planePoint);
    const distanceToPlane = Math.abs(toVertex.dot(planeNormal));

    if (distanceToPlane > tolerance) {
      return false; // Vertex is not on the plane
    }
  }

  return true;
}

// Check if an edge is a true polygon boundary (not internal triangulation)
function isTruePolygonBoundaryEdge(
  polygonFaces: any[],
  vertex1: THREE.Vector3,
  vertex2: THREE.Vector3,
): boolean {
  const tolerance = 0.001;
  let adjacentFaceCount = 0;

  // Count how many valid, robust polygon faces share this edge
  for (const face of polygonFaces) {
    if (!face.originalVertices || !isRobustPolygonFace(face)) continue;

    let hasVertex1 = false;
    let hasVertex2 = false;

    // Check if this face contains both vertices of the edge
    for (const vertex of face.originalVertices) {
      const vertexPos =
        vertex instanceof THREE.Vector3
          ? vertex
          : new THREE.Vector3(vertex.x, vertex.y, vertex.z);

      if (vertexPos.distanceTo(vertex1) < tolerance) hasVertex1 = true;
      if (vertexPos.distanceTo(vertex2) < tolerance) hasVertex2 = true;
    }

    // If face has both vertices, check if they're consecutive (true boundary edge)
    if (hasVertex1 && hasVertex2) {
      if (
        areVerticesConsecutiveInPolygon(
          face.originalVertices,
          vertex1,
          vertex2,
          tolerance,
        )
      ) {
        adjacentFaceCount++;
      }
    }
  }

  // True boundary edges should be shared by exactly 1 or 2 robust faces
  // 1 = exterior boundary, 2 = interior boundary between adjacent faces
  return adjacentFaceCount >= 1 && adjacentFaceCount <= 2;
}

// Comprehensive validation that a polygon face is robust for decimation
function isRobustPolygonFace(face: any): boolean {
  if (!face.originalVertices || !Array.isArray(face.originalVertices))
    return false;
  if (face.originalVertices.length < 3) return false;

  // Convert to Vector3 objects
  const vertices = face.originalVertices.map((v: any) =>
    v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z),
  );

  // 1. Check coplanarity
  if (!isCoplanarPolygon(vertices)) return false;

  // 2. Check for duplicate vertices
  const tolerance = 0.001;
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      if (vertices[i].distanceTo(vertices[j]) < tolerance) {
        return false; // Duplicate vertices
      }
    }
  }

  // 3. Check for proper vertex ordering (no self-intersections)
  if (!hasValidVertexOrdering(vertices)) return false;

  // 4. Check minimum edge length (prevent degenerate edges)
  for (let i = 0; i < vertices.length; i++) {
    const nextI = (i + 1) % vertices.length;
    if (vertices[i].distanceTo(vertices[nextI]) < tolerance * 10) {
      return false; // Degenerate edge
    }
  }

  // 5. Check polygon area (prevent near-zero area faces)
  const area = calculatePolygonArea(vertices);
  if (area < tolerance * tolerance * 100) {
    return false; // Near-zero area
  }

  return true;
}

// Check if vertices are properly ordered (no self-intersections for simple polygons)
function hasValidVertexOrdering(vertices: THREE.Vector3[]): boolean {
  if (vertices.length < 4) return true; // Triangles are always simple

  // For quads and simple polygons, check that edges don't cross
  // This is a simplified check - for complex polygons, more sophisticated validation needed
  if (vertices.length === 4) {
    // Check if quad edges cross
    const edge1Start = vertices[0];
    const edge1End = vertices[1];
    const edge2Start = vertices[2];
    const edge2End = vertices[3];

    const edge3Start = vertices[1];
    const edge3End = vertices[2];
    const edge4Start = vertices[3];
    const edge4End = vertices[0];

    // Check diagonal intersections (should not intersect for convex quad)
    if (
      doLinesIntersect(edge1Start, edge1End, edge2Start, edge2End) ||
      doLinesIntersect(edge3Start, edge3End, edge4Start, edge4End)
    ) {
      return false; // Self-intersecting quad
    }
  }

  return true;
}

// Calculate polygon area using shoelace formula (projected to best plane)
function calculatePolygonArea(vertices: THREE.Vector3[]): number {
  if (vertices.length < 3) return 0;

  // Calculate polygon normal to determine best projection plane
  let normal = new THREE.Vector3();
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }

  // Project to the plane with largest normal component
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  let area = 0;
  if (absZ >= absX && absZ >= absY) {
    // Project to XY plane
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += curr.x * next.y - next.x * curr.y;
    }
  } else if (absY >= absX) {
    // Project to XZ plane
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += curr.x * next.z - next.x * curr.z;
    }
  } else {
    // Project to YZ plane
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += curr.y * next.z - next.y * curr.z;
    }
  }

  return Math.abs(area) * 0.5;
}

// Check if two line segments intersect in 3D space
function doLinesIntersect(
  line1Start: THREE.Vector3,
  line1End: THREE.Vector3,
  line2Start: THREE.Vector3,
  line2End: THREE.Vector3,
): boolean {
  // Simplified 2D intersection check (project to dominant plane)
  // This is not a complete 3D line intersection, but good enough for basic validation

  const tolerance = 0.001;

  // Check if lines share endpoints (allowed)
  if (
    line1Start.distanceTo(line2Start) < tolerance ||
    line1Start.distanceTo(line2End) < tolerance ||
    line1End.distanceTo(line2Start) < tolerance ||
    line1End.distanceTo(line2End) < tolerance
  ) {
    return false; // Shared endpoints are OK
  }

  // Use a simplified bounding box check for now
  const minX1 = Math.min(line1Start.x, line1End.x);
  const maxX1 = Math.max(line1Start.x, line1End.x);
  const minY1 = Math.min(line1Start.y, line1End.y);
  const maxY1 = Math.max(line1Start.y, line1End.y);

  const minX2 = Math.min(line2Start.x, line2End.x);
  const maxX2 = Math.max(line2Start.x, line2End.x);
  const minY2 = Math.min(line2Start.y, line2End.y);
  const maxY2 = Math.max(line2Start.y, line2End.y);

  // If bounding boxes don't overlap, lines don't intersect
  return !(maxX1 < minX2 || maxX2 < minX1 || maxY1 < minY2 || maxY2 < minY1);
}

// Create fallback edge geometry from triangulated mesh
function createFallbackEdgeGeometry(geometry: THREE.BufferGeometry) {
  const positions = geometry.attributes.position.array as Float32Array;
  const edgeData: any[] = [];

  if (geometry.index) {
    // Indexed geometry - use index to find edges
    const indices = geometry.index.array;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // Create edges for this triangle
      const edges = [
        [a, b],
        [b, c],
        [c, a],
      ];

      edges.forEach(([idx1, idx2]) => {
        const pos1 = new THREE.Vector3(
          positions[idx1 * 3],
          positions[idx1 * 3 + 1],
          positions[idx1 * 3 + 2],
        );
        const pos2 = new THREE.Vector3(
          positions[idx2 * 3],
          positions[idx2 * 3 + 1],
          positions[idx2 * 3 + 2],
        );

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [pos1.x, pos1.y, pos1.z, pos2.x, pos2.y, pos2.z],
            3,
          ),
        );

        const line = new THREE.Line(
          lineGeometry,
          new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0,
          }),
        );

        edgeData.push({
          line,
          vertexIndex1: idx1,
          vertexIndex2: idx2,
          position1: pos1.clone(),
          position2: pos2.clone(),
        });
      });
    }
  } else {
    // Non-indexed geometry - create edges from consecutive triangles
    for (let i = 0; i < positions.length; i += 9) {
      // 9 values per triangle
      const triangle = [
        new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]),
        new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]),
        new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]),
      ];

      // Create edges for this triangle
      const edges = [
        [0, 1],
        [1, 2],
        [2, 0],
      ];

      edges.forEach(([idx1, idx2]) => {
        const pos1 = triangle[idx1];
        const pos2 = triangle[idx2];

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [pos1.x, pos1.y, pos1.z, pos2.x, pos2.y, pos2.z],
            3,
          ),
        );

        const line = new THREE.Line(
          lineGeometry,
          new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0,
          }),
        );

        edgeData.push({
          line,
          vertexIndex1: i / 3 + idx1, // Convert to vertex index
          vertexIndex2: i / 3 + idx2,
          position1: pos1.clone(),
          position2: pos2.clone(),
        });
      });
    }
  }

  return edgeData;
}

// IMPROVED: Enhanced edge detection with precise control and visual feedback
function findNearestEdgeEnhanced(
  edgeGeometry: any[],
  pointer: THREE.Vector2,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  canvasRect: DOMRect,
): any | null {
  if (!edgeGeometry || edgeGeometry.length === 0) return null;

  // IMPROVED Method 1: Precise 2D screen-space detection first (more predictable)
  const screenSpaceEdge = findNearestEdgeScreenSpacePrecise(
    edgeGeometry,
    pointer,
    camera,
    canvasRect,
  );

  if (screenSpaceEdge) {
    return screenSpaceEdge;
  }

  // IMPROVED Method 2: Fallback to 3D raycasting with tighter control
  raycaster.setFromCamera(pointer, camera);
  raycaster.params.Line.threshold = 3; // Tighter threshold for better precision

  let bestEdge = null;
  let minDistance = Number.MAX_VALUE;

  // Try raycasting against all edges
  for (const edgeData of edgeGeometry) {
    const intersects = raycaster.intersectObject(edgeData.line);
    if (intersects.length > 0) {
      const distance = intersects[0].distance;
      if (distance < minDistance) {
        minDistance = distance;
        bestEdge = edgeData;
      }
    }
  }

  return bestEdge;
}

// IMPROVED: Precise 2D screen-space detection with adaptive sensitivity
function findNearestEdgeScreenSpacePrecise(
  edgeGeometry: any[],
  pointer: THREE.Vector2,
  camera: THREE.Camera,
  canvasRect: DOMRect,
): any | null {
  // Convert normalized device coordinates to pixel coordinates
  const mouseScreenPos = new THREE.Vector2(
    (pointer.x + 1) * canvasRect.width * 0.5,
    (-pointer.y + 1) * canvasRect.height * 0.5,
  );

  let nearestEdge = null;
  let minScreenDistance = Number.MAX_VALUE;

  // IMPROVED: Adaptive detection radius based on zoom level
  const cameraDistance = camera.position.length();
  const adaptiveMaxDistance = Math.max(8, Math.min(20, cameraDistance * 2)); // 8-20 pixels based on zoom

  for (const edgeData of edgeGeometry) {
    // Project edge endpoints to screen space
    const screenStart = new THREE.Vector3();
    const screenEnd = new THREE.Vector3();

    screenStart.copy(edgeData.position1).project(camera);
    screenEnd.copy(edgeData.position2).project(camera);

    // Skip edges that are behind the camera or clipped
    if (
      screenStart.z > 1 ||
      screenEnd.z > 1 ||
      screenStart.z < -1 ||
      screenEnd.z < -1
    ) {
      continue;
    }

    // Convert to pixel coordinates
    const startPixel = new THREE.Vector2(
      (screenStart.x + 1) * canvasRect.width * 0.5,
      (-screenStart.y + 1) * canvasRect.height * 0.5,
    );
    const endPixel = new THREE.Vector2(
      (screenEnd.x + 1) * canvasRect.width * 0.5,
      (-screenEnd.y + 1) * canvasRect.height * 0.5,
    );

    // Calculate line length in screen space
    const lineLength = startPixel.distanceTo(endPixel);

    // IMPROVED: Skip very short edges and very long edges (likely artifacts)
    if (lineLength < 2 || lineLength > canvasRect.width * 0.5) continue;

    // Calculate distance from mouse to line segment
    const distance = distanceToLineSegment(
      mouseScreenPos,
      startPixel,
      endPixel,
    );

    // IMPROVED: Prioritize shorter edges when distances are close (more precise selection)
    const weightedDistance = distance + lineLength * 0.001; // Slight bias toward shorter edges

    // Check if this edge is closer and within detection range
    if (
      weightedDistance < minScreenDistance &&
      distance < adaptiveMaxDistance
    ) {
      minScreenDistance = weightedDistance;
      nearestEdge = edgeData;
    }
  }

  return nearestEdge;
}

// IMPROVED: More accurate distance calculation to line segment
function distanceToLineSegment(
  point: THREE.Vector2,
  lineStart: THREE.Vector2,
  lineEnd: THREE.Vector2,
): number {
  const lineVec = new THREE.Vector2().subVectors(lineEnd, lineStart);
  const pointVec = new THREE.Vector2().subVectors(point, lineStart);

  const lineLength = lineVec.length();
  if (lineLength === 0) return pointVec.length(); // Degenerate line

  // Project point onto line
  const projection = pointVec.dot(lineVec) / lineLength;
  const clampedProjection = Math.max(0, Math.min(lineLength, projection));

  // Find closest point on line segment
  const closestPoint = lineStart
    .clone()
    .add(lineVec.normalize().multiplyScalar(clampedProjection));

  return point.distanceTo(closestPoint);
}

// Helper function to count triangles in a polygon face
function getTriangleCountForPolygon(face: any): number {
  if (!face.originalVertices) {
    if (face.type === "triangle") return 1;
    if (face.type === "quad") return 2;
    return 3; // estimate for polygon
  }

  const vertexCount = face.originalVertices.length;
  if (vertexCount === 3) return 1;
  if (vertexCount === 4) return 2;
  return vertexCount - 2; // fan triangulation
}

function HighlightMesh() {
  // No longer needed - highlighting is handled in the main mesh
  return null;
}

function STLMesh() {
  const {
    geometry,
    viewerSettings,
    toolMode,
    highlightedTriangle,
    setHighlightedTriangle,
    decimationPainterMode,
    isDecimating,
    decimateEdge,
  } = useSTL();

  // Debug decimation painter mode and geometry
  useEffect(() => {
    if (geometry) {
      // For non-indexed geometry, calculate face count manually
      if (!geometry.index) {
        const faceCount = geometry.attributes.position.count / 3;
      }
    }
  }, [geometry, decimationPainterMode, isDecimating]);
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster, pointer } = useThree();

  // Edge highlighting state for decimation painter
  const [highlightedEdge, setHighlightedEdge] = useState<{
    vertexIndex1: number;
    vertexIndex2: number;
    position1: THREE.Vector3;
    position2: THREE.Vector3;
  } | null>(null);

  // Spinning animation state
  const spinState = useRef({
    isSpinning: false,
    startTime: 0,
    initialSpeed: 2.5, // radians per second
    duration: 3000, // 3 seconds to die down
  });

  // Auto spin state
  const autoSpinState = useRef({
    rotationAxis: { x: 0.3, y: 1, z: 0.1 }, // Current rotation axis
    targetAxis: { x: 0.3, y: 1, z: 0.1 }, // Target rotation axis
    axisTransitionSpeed: 0.002, // How fast axis changes
    rotationSpeed: 0.8, // Rotation speed in radians per second
    lastTime: 0,
  });

  // Helper method for triangle counting
  const getTriangleCountForPolygon = (face: any): number => {
    if (!face.originalVertices) {
      if (face.type === "triangle") return 1;
      if (face.type === "quad") return 2;
      return 3; // estimate for polygon
    }

    const vertexCount = face.originalVertices.length;
    if (vertexCount === 3) return 1;
    if (vertexCount === 4) return 2;
    return vertexCount - 2; // fan triangulation
  };

  // Create polygon-aware wireframe geometry
  const wireframeGeometry = useMemo(() => {
    if (!viewerSettings.wireframe || !geometry) return null;

    console.log(
      `��� Creating wireframe for geometry: ${geometry.attributes.position.count} vertices, ${geometry.index ? geometry.index.count / 3 : 0} faces`,
    );

    const polygonFaces = (geometry as any).polygonFaces;

    if (!polygonFaces || !Array.isArray(polygonFaces)) {
      // Fallback to standard edge wireframe for non-polygon geometries
      console.log("🔗 Creating standard edge wireframe (no polygon data)");
      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      console.log(
        `🔗 Standard wireframe created with ${edgeGeometry.attributes.position.count / 2} edges`,
      );
      return edgeGeometry;
    }

    console.log("🔗 Creating polygon-aware wireframe");

    const wireframePositions: number[] = [];

    // Create wireframe based on original polygon edges, not triangulated edges
    for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
      const face = polygonFaces[faceIndex];

      if (face.originalVertices && face.originalVertices.length >= 3) {
        // Draw edges around the original polygon perimeter
        const vertices = face.originalVertices;

        for (let i = 0; i < vertices.length; i++) {
          const currentVertex = vertices[i];
          const nextVertex = vertices[(i + 1) % vertices.length];

          // Add line segment (2 vertices per line)
          wireframePositions.push(
            currentVertex.x,
            currentVertex.y,
            currentVertex.z,
            nextVertex.x,
            nextVertex.y,
            nextVertex.z,
          );
        }
      } else {
        // Fallback: if no original vertices, try to reconstruct from face type
        console.warn(
          "⚠️ Face missing original vertices, using fallback for face:",
          faceIndex,
        );
      }
    }

    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(wireframePositions, 3),
    );

    console.log(
      `✅ Created polygon wireframe with ${wireframePositions.length / 6} edge segments`,
    );
    return wireGeometry;
  }, [geometry, viewerSettings.wireframe]);

  // Create materials based on settings - include geometry UUID to force refresh
  const material = useMemo(() => {
    if (viewerSettings.wireframe) {
      return new THREE.MeshBasicMaterial({
        wireframe: false, // We'll handle wireframe with LineSegments
        color: 0x404040,
        transparent: true,
        opacity: 0.1,
      });
    }

    const baseColor = viewerSettings.randomColors ? 0xffffff : 0x606060;

    const mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: viewerSettings.randomColors,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide, // Force double-sided rendering to handle face winding issues
      transparent: false,
      opacity: 1.0,
      flatShading: true, // Maintain crisp face shading instead of smooth interpolation
      depthWrite: true, // Ensure depth buffer writes for solid appearance
      depthTest: true, // Ensure depth testing for proper occlusion
    });

    // Force material to refresh when geometry changes
    if (geometry) {
      mat.needsUpdate = true;
    }

    return mat;
  }, [viewerSettings.wireframe, viewerSettings.randomColors, geometry?.uuid]);

  // Trigger spinning animation when a new model loads (but not during decimation)
  useEffect(() => {
    if (geometry) {
      const positions = geometry.attributes.position.array;

      // Only start spinning animation if NOT currently decimating
      if (!isDecimating) {
        spinState.current = {
          ...spinState.current,
          isSpinning: true,
          startTime: Date.now(),
        };
      } else {
      }
    }
  }, [geometry, isDecimating]);

  // Spinning animation frame loop
  useFrame(() => {
    if (!meshRef.current) return;

    const currentTime = Date.now();
    const deltaTime = autoSpinState.current.lastTime > 0 ? (currentTime - autoSpinState.current.lastTime) / 1000 : 0;
    autoSpinState.current.lastTime = currentTime;

    // Handle temporary spinning animation (on model load)
    if (spinState.current.isSpinning) {
      const elapsed = currentTime - spinState.current.startTime;
      const progress = Math.min(elapsed / spinState.current.duration, 1);

      // Easing function for smooth deceleration (cubic ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentSpeed = spinState.current.initialSpeed * (1 - easeOut);

      if (progress >= 1) {
        // Animation complete, stop spinning
        spinState.current.isSpinning = false;
      } else {
        // Continue spinning with decreasing speed
        meshRef.current.rotation.y += currentSpeed * 0.016; // 60fps approximation
        meshRef.current.rotation.x += currentSpeed * 0.3 * 0.016; // Slight X rotation for 3D effect
      }
    }

    // Handle auto spin (continuous rotation with changing axis)
    if (viewerSettings.autoSpin && deltaTime > 0) {
      // Randomly change target axis occasionally (every 3-8 seconds)
      if (Math.random() < 0.001) { // ~0.1% chance per frame at 60fps = change every ~5 seconds
        autoSpinState.current.targetAxis = {
          x: (Math.random() - 0.5) * 1.5, // Random axis between -0.75 and 0.75
          y: 0.5 + Math.random() * 0.5,   // Mostly vertical with some variation
          z: (Math.random() - 0.5) * 1.5, // Random axis between -0.75 and 0.75
        };
      }

      // Smoothly interpolate current axis toward target axis
      const axisSpeed = autoSpinState.current.axisTransitionSpeed;
      autoSpinState.current.rotationAxis.x += (autoSpinState.current.targetAxis.x - autoSpinState.current.rotationAxis.x) * axisSpeed;
      autoSpinState.current.rotationAxis.y += (autoSpinState.current.targetAxis.y - autoSpinState.current.rotationAxis.y) * axisSpeed;
      autoSpinState.current.rotationAxis.z += (autoSpinState.current.targetAxis.z - autoSpinState.current.rotationAxis.z) * axisSpeed;

      // Apply rotation around the current axis
      const rotationAmount = autoSpinState.current.rotationSpeed * deltaTime;
      meshRef.current.rotation.x += autoSpinState.current.rotationAxis.x * rotationAmount;
      meshRef.current.rotation.y += autoSpinState.current.rotationAxis.y * rotationAmount;
      meshRef.current.rotation.z += autoSpinState.current.rotationAxis.z * rotationAmount;
    }
  });

  // Store original colors for highlighting
  const originalColors = useRef<Float32Array | null>(null);

  // POLYGON-AWARE coloring with enforced flat shading per polygon face
  useEffect(() => {
    if (geometry && viewerSettings.randomColors && !viewerSettings.wireframe) {
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      const polygonFaces = (geometry as any).polygonFaces;

      if (polygonFaces && Array.isArray(polygonFaces)) {
        console.log(`🎨 Coloring ${polygonFaces.length} polygon faces...`);

        for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
          const face = polygonFaces[faceIndex];

          // Generate one color per polygon face
          const color = new THREE.Color();
          color.setHSL(Math.random(), 0.8, 0.6);

          // Use triangleIndices if available (from merged faces)
          if (face.triangleIndices && face.triangleIndices.length > 0) {
            console.log(
              `🎨 Face ${faceIndex} (${face.type}): Using ${face.triangleIndices.length} triangle indices`,
            );
            console.log(
              `   Color: RGB(${color.r.toFixed(3)}, ${color.g.toFixed(3)}, ${color.b.toFixed(3)})`,
            );
            console.log(
              `   Triangle indices: [${face.triangleIndices.slice(0, 5).join(", ")}${face.triangleIndices.length > 5 ? "..." : ""}]`,
            );

            // Color specific triangles identified by triangleIndices
            for (const triangleIndex of face.triangleIndices) {
              const triangleStart = triangleIndex * 9; // 9 values per triangle (3 vertices × 3 components)

              // Apply same color to all 3 vertices of the triangle
              for (let v = 0; v < 9; v += 3) {
                if (triangleStart + v + 2 < colors.length) {
                  colors[triangleStart + v] = color.r;
                  colors[triangleStart + v + 1] = color.g;
                  colors[triangleStart + v + 2] = color.b;
                } else {
                  console.warn(
                    `   ⚠️ Triangle ${triangleIndex}: position ${triangleStart + v} out of bounds (max: ${colors.length})`,
                  );
                }
              }
            }

            console.log(
              `   ✅ Applied color to ${face.triangleIndices.length} triangles for face ${faceIndex}`,
            );
          } else {
            // Fallback to sequential indexing for faces without triangleIndices
            const triangleCount = getTriangleCountForPolygon(face);
            console.log(
              `  Face ${faceIndex}: Fallback sequential coloring for ${triangleCount} triangles`,
            );

            let triangleOffset = 0;
            // Calculate offset by summing previous faces
            for (let i = 0; i < faceIndex; i++) {
              triangleOffset += getTriangleCountForPolygon(polygonFaces[i]);
            }

            for (let t = 0; t < triangleCount; t++) {
              const triangleStart = (triangleOffset + t) * 9;

              for (let v = 0; v < 9; v += 3) {
                if (triangleStart + v + 2 < colors.length) {
                  colors[triangleStart + v] = color.r;
                  colors[triangleStart + v + 1] = color.g;
                  colors[triangleStart + v + 2] = color.b;
                }
              }
            }
          }
        }
      } else {
        // Fallback to triangle-based coloring if no polygon face data
        const color = new THREE.Color();
        for (let i = 0; i < colors.length; i += 9) {
          color.setHSL(Math.random(), 0.7, 0.6);

          for (let j = 0; j < 9; j += 3) {
            colors[i + j] = color.r;
            colors[i + j + 1] = color.g;
            colors[i + j + 2] = color.b;
          }
        }
        console.log(
          "🎨 ❌ Applied TRIANGLE-BASED coloring - this is the problem!",
        );
      }

      // Store original colors for highlighting
      originalColors.current = new Float32Array(colors);

      // Apply colors to geometry
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.attributes.color.needsUpdate = true;

      // Since we now use non-indexed geometry for viewing, just ensure flat normals
      computePolygonAwareFlatNormals(geometry, polygonFaces);

      // Debug: Sample some colors to verify they're applied
      console.log(
        `🎨 Color verification: First few colors [${colors[0].toFixed(3)}, ${colors[1].toFixed(3)}, ${colors[2].toFixed(3)}], [${colors[9].toFixed(3)}, ${colors[10].toFixed(3)}, ${colors[11].toFixed(3)}]`,
      );
      console.log(
        `✅ Applied ${polygonFaces ? "polygon-aware" : "triangle-based"} coloring to ${geometry.attributes.position.count / 3} triangles`,
      );
    } else if (geometry && geometry.attributes.color) {
      // Remove color attribute if not using random colors
      geometry.deleteAttribute("color");
      originalColors.current = null;
    }
  }, [geometry, viewerSettings.randomColors, viewerSettings.wireframe]);

  // Handle highlighting by brightening colors
  useEffect(() => {
    if (!geometry || !viewerSettings.randomColors || !originalColors.current)
      return;

    const colors = geometry.attributes.color?.array as Float32Array;
    if (!colors) return;

    // Only reset and highlight if we're actually highlighting something
    if (highlightedTriangle !== null && toolMode === STLToolMode.Highlight) {
      // Reset all colors to original first
      colors.set(originalColors.current);
      const polygonFaces = (geometry as any).polygonFaces;

      if (
        polygonFaces &&
        Array.isArray(polygonFaces) &&
        highlightedTriangle < polygonFaces.length
      ) {
        // Polygon-based highlighting: highlight entire polygon face
        const currentFace = polygonFaces[highlightedTriangle];

        // Use triangleIndices if available (from merged faces)
        if (
          currentFace.triangleIndices &&
          currentFace.triangleIndices.length > 0
        ) {
          console.log(
            `🔴 Highlighting merged face ${highlightedTriangle} with ${currentFace.triangleIndices.length} triangle indices`,
          );

          // Highlight specific triangles identified by triangleIndices
          for (const triangleIndex of currentFace.triangleIndices) {
            const triangleStart = triangleIndex * 9; // 9 values per triangle (3 vertices × 3 components)

            // Apply red color to all 3 vertices of the triangle
            for (let v = 0; v < 9; v += 3) {
              if (triangleStart + v + 2 < colors.length) {
                colors[triangleStart + v] = 1.0; // Red
                colors[triangleStart + v + 1] = 0.0; // Green
                colors[triangleStart + v + 2] = 0.0; // Blue
              }
            }
          }
        } else {
          // Fallback to sequential indexing for faces without triangleIndices
          console.log(
            `🔴 Highlighting face ${highlightedTriangle} with sequential indexing`,
          );

          let triangleOffset = 0;

          // Calculate which triangles belong to this polygon face
          for (
            let faceIndex = 0;
            faceIndex < highlightedTriangle;
            faceIndex++
          ) {
            const face = polygonFaces[faceIndex];
            triangleOffset += STLManipulator.getTriangleCountForPolygon(face);
          }

          const triangleCount =
            STLManipulator.getTriangleCountForPolygon(currentFace);

          // Highlight all triangles in this polygon face
          for (let t = 0; t < triangleCount; t++) {
            const triangleStart = (triangleOffset + t) * 9; // 3 vertices * 3 color components

            for (let i = 0; i < 9; i += 3) {
              const idx = triangleStart + i;
              if (idx < colors.length) {
                // Set to bright red color
                colors[idx] = 1.0; // Red
                colors[idx + 1] = 0.0; // Green
                colors[idx + 2] = 0.0; // Blue
              }
            }
          }
        }
      } else {
        // Fallback: single triangle highlighting for non-polygon geometries
        const triangleStart = highlightedTriangle * 9; // 3 vertices * 3 color components

        for (let i = 0; i < 9; i += 3) {
          const idx = triangleStart + i;
          if (idx < colors.length) {
            // Set to bright red color
            colors[idx] = 1.0; // Red
            colors[idx + 1] = 0.0; // Green
            colors[idx + 2] = 0.0; // Blue
          }
        }
      }
    }

    geometry.attributes.color.needsUpdate = true;
  }, [geometry, highlightedTriangle, toolMode, viewerSettings.randomColors]);

  // Handle mouse interaction for highlighting
  useEffect(() => {
    if (toolMode !== STLToolMode.Highlight || !meshRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      // Update pointer position
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Perform raycasting
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(meshRef.current!);

      if (intersects.length > 0) {
        const intersection = intersects[0];
        const faceIndex = STLManipulator.getPolygonFaceFromIntersection(
          geometry!,
          intersection,
        );
        setHighlightedTriangle(faceIndex);
      } else {
        // Don't clear highlighted triangle immediately - let it persist
        // This allows users to interact with the info bar (hover for coordinate expansion)
        // The triangle will be cleared when a new face is hovered or other interactions occur
      }
    };

    const handleClick = (event: MouseEvent) => {
      // Clear highlighted triangle when clicking and not hitting any face
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(meshRef.current!);

      if (intersects.length === 0) {
        // Clicked outside model - clear highlight
        setHighlightedTriangle(null);
      }
    };

    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("click", handleClick);
      return () => {
        canvas.removeEventListener("mousemove", handleMouseMove);
        canvas.removeEventListener("click", handleClick);
      };
    }
  }, [toolMode, geometry, camera, raycaster, pointer]);

  // Update canvas cursor and styling for decimation painter mode
  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      if (decimationPainterMode) {
        canvas.style.cursor = "crosshair";
        canvas.style.filter = "brightness(1.1) contrast(1.05)"; // Slight visual enhancement
        canvas.style.transition = "filter 0.2s ease";
      } else {
        canvas.style.cursor = "default";
        canvas.style.filter = "none";
      }
    }

    return () => {
      if (canvas) {
        canvas.style.cursor = "default";
        canvas.style.filter = "none";
      }
    };
  }, [decimationPainterMode]);

  // Create edge geometry for raycasting (polygon perimeter edges only)
  const edgeGeometry = useMemo(() => {
    if (!geometry || !decimationPainterMode) {
      return null;
    }

    const polygonFaces = (geometry as any).polygonFaces;

    if (!polygonFaces || !Array.isArray(polygonFaces)) {
      console.warn(
        "��� No polygon faces found - creating fallback edge detection from triangles",
      );
      return createFallbackEdgeGeometry(geometry);
    }

    const edgeData: {
      line: THREE.Line;
      vertexIndex1: number;
      vertexIndex2: number;
      position1: THREE.Vector3;
      position2: THREE.Vector3;
    }[] = [];
    const positions = geometry.attributes.position.array as Float32Array;

    // Create individual line objects for each polygon perimeter edge
    for (const face of polygonFaces) {
      if (!face.originalVertices || face.originalVertices.length < 3) continue;

      // Validate that this face is actually coplanar
      if (!isCoplanarPolygon(face.originalVertices)) {
        console.warn("⚠️ Skipping non-coplanar polygon face");
        continue;
      }

      const vertices = face.originalVertices;
      for (let i = 0; i < vertices.length; i++) {
        const currentVertex = vertices[i];
        const nextVertex = vertices[(i + 1) % vertices.length];

        const currentPos =
          currentVertex instanceof THREE.Vector3
            ? currentVertex
            : new THREE.Vector3(
                currentVertex.x,
                currentVertex.y,
                currentVertex.z,
              );
        const nextPos =
          nextVertex instanceof THREE.Vector3
            ? nextVertex
            : new THREE.Vector3(nextVertex.x, nextVertex.y, nextVertex.z);

        // Validate this is a true polygon boundary edge (not internal triangulation)
        if (!isTruePolygonBoundaryEdge(polygonFaces, currentPos, nextPos)) {
          continue;
        }

        // Find vertex indices in the buffer
        const vertexIndex1 = findVertexIndex(positions, currentPos);
        const vertexIndex2 = findVertexIndex(positions, nextPos);

        // Create a line object for this edge
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            [
              currentPos.x,
              currentPos.y,
              currentPos.z,
              nextPos.x,
              nextPos.y,
              nextPos.z,
            ],
            3,
          ),
        );

        const line = new THREE.Line(
          lineGeometry,
          new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0, // Invisible - only for raycasting
          }),
        );

        edgeData.push({
          line,
          vertexIndex1,
          vertexIndex2,
          position1: currentPos.clone(),
          position2: nextPos.clone(),
        });
      }
    }

    return edgeData;
  }, [geometry, decimationPainterMode]);

  // IMPROVED: Edge highlighting with precise control and visual feedback
  useEffect(() => {
    if (!decimationPainterMode || !edgeGeometry) {
      setHighlightedEdge(null);
      return;
    }

    let lastUpdate = 0;
    let animationFrameId: number | null = null;
    const throttleMs = 8; // Faster response for better control

    const handleMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastUpdate < throttleMs) return;
      lastUpdate = now;

      // Cancel any pending update
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      // Schedule update on next frame for smoother performance
      animationFrameId = requestAnimationFrame(() => {
        // Update pointer position with higher precision
        const rect = (
          event.target as HTMLCanvasElement
        ).getBoundingClientRect();
        const newPointer = {
          x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
          y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
        };

        pointer.x = newPointer.x;
        pointer.y = newPointer.y;

        // IMPROVED: Enhanced edge detection with better feedback
        const nearestEdge = findNearestEdgeEnhanced(
          edgeGeometry,
          pointer,
          camera,
          raycaster,
          rect,
        );

        if (nearestEdge) {
          setHighlightedEdge({
            vertexIndex1: nearestEdge.vertexIndex1,
            vertexIndex2: nearestEdge.vertexIndex2,
            position1: nearestEdge.position1,
            position2: nearestEdge.position2,
          });

          // IMPROVED: Change cursor to indicate hovering over valid edge
          const canvas = event.target as HTMLCanvasElement;
          canvas.style.cursor = "crosshair";
        } else {
          setHighlightedEdge(null);

          // Reset cursor when no edge is highlighted
          const canvas = event.target as HTMLCanvasElement;
          canvas.style.cursor = decimationPainterMode ? "default" : "grab";
        }

        animationFrameId = null;
      });
    };

    const canvas = document.querySelector("canvas");
    if (canvas) {
      // Set initial cursor style
      canvas.style.cursor = decimationPainterMode ? "default" : "grab";

      canvas.addEventListener("mousemove", handleMouseMove);
      return () => {
        canvas.removeEventListener("mousemove", handleMouseMove);
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        // Reset cursor on cleanup
        canvas.style.cursor = "grab";
      };
    }
  }, [decimationPainterMode, edgeGeometry, camera, raycaster, pointer]);

  // Handle decimation painter mode clicks
  useEffect(() => {
    if (!decimationPainterMode || !meshRef.current) return;

    const handleClick = async (event: MouseEvent) => {
      if (highlightedEdge) {
        try {
          // Perform single edge decimation
          await decimateEdge(
            highlightedEdge.vertexIndex1,
            highlightedEdge.vertexIndex2,
          );

          // Clear the highlighted edge after decimation
          setHighlightedEdge(null);
        } catch (error) {
          console.error("❌ Edge decimation failed:", error);
        }
      } else {
        console.log("   No edge highlighted for decimation");
      }
    };

    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.addEventListener("click", handleClick);
      return () => canvas.removeEventListener("click", handleClick);
    }
  }, [decimationPainterMode, highlightedEdge, decimateEdge]);

  // Subtle rotation animation (disabled when highlighting)
  useFrame((state) => {
    if (meshRef.current && toolMode !== STLToolMode.Highlight) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  if (!geometry) return null;

  return (
    <group ref={meshRef}>
      {/* Main mesh - key forces re-render when geometry changes */}
      <mesh key={geometry.uuid} geometry={geometry} material={material} />

      {/* Polygon-aware wireframe overlay */}
      {viewerSettings.wireframe && wireframeGeometry && (
        <lineSegments
          key={`wireframe-${geometry.uuid}`}
          geometry={wireframeGeometry}
        >
          <lineBasicMaterial color={0x00ff88} linewidth={2} />
        </lineSegments>
      )}

      {/* Enhanced highlighted edge visualization for decimation painter */}
      {decimationPainterMode && highlightedEdge && (
        <group
          key={`highlighted-edge-${highlightedEdge.vertexIndex1}-${highlightedEdge.vertexIndex2}`}
        >
          {/* Outer glow effect - wider, semi-transparent */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={
                  new Float32Array([
                    highlightedEdge.position1.x,
                    highlightedEdge.position1.y,
                    highlightedEdge.position1.z,
                    highlightedEdge.position2.x,
                    highlightedEdge.position2.y,
                    highlightedEdge.position2.z,
                  ])
                }
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color="#00ff00"
              linewidth={15}
              transparent={true}
              opacity={0.2}
            />
          </line>

          {/* Main highlighted edge - bright green */}
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                array={
                  new Float32Array([
                    highlightedEdge.position1.x,
                    highlightedEdge.position1.y,
                    highlightedEdge.position1.z,
                    highlightedEdge.position2.x,
                    highlightedEdge.position2.y,
                    highlightedEdge.position2.z,
                  ])
                }
                count={2}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial
              color="#00ff00"
              linewidth={8}
              transparent={false}
            />
          </line>

          {/* Vertex indicators at edge endpoints */}
          <mesh
            position={[
              highlightedEdge.position1.x,
              highlightedEdge.position1.y,
              highlightedEdge.position1.z,
            ]}
          >
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent={true}
              opacity={0.9}
            />
          </mesh>

          <mesh
            position={[
              highlightedEdge.position2.x,
              highlightedEdge.position2.y,
              highlightedEdge.position2.z,
            ]}
          >
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent={true}
              opacity={0.9}
            />
          </mesh>
        </group>
      )}

      {/* Decimation painter mode indicator */}
      {decimationPainterMode && (
        <group>
          {/* Main visible indicator - positioned above model */}
          <mesh position={[0, 3, 0]}>
            <ringGeometry args={[2.0, 2.5, 32]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent={true}
              opacity={0.8}
              side={THREE.DoubleSide}
              depthTest={false} // Always visible
            />
          </mesh>

          {/* Inner pulsing ring */}
          <mesh position={[0, 3, 0]}>
            <ringGeometry args={[1.5, 1.8, 32]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent={true}
              opacity={Math.sin(Date.now() * 0.005) * 0.4 + 0.6}
              side={THREE.DoubleSide}
              depthTest={false} // Always visible
            />
          </mesh>

          {/* Center indicator */}
          <mesh position={[0, 3, 0]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent={true}
              opacity={0.9}
              depthTest={false} // Always visible
            />
          </mesh>

          {/* Text indicator */}
          <mesh position={[0, 4, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent={true}
              opacity={0.9}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function GradientBackground() {
  const { viewerSettings } = useSTL();

  // Create gradient background for Three.js scene
  if (viewerSettings.backgroundColor.includes("gradient")) {
    return (
      <mesh scale={[200, 200, 1]} position={[0, 0, -100]}>
        <planeGeometry />
        <shaderMaterial
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            varying vec2 vUv;
            void main() {
              // Meadow gradient: light blue sky to soft green grass
              vec3 topColor = vec3(0.722, 0.902, 1.0);    // #B8E6FF
              vec3 midColor = vec3(0.910, 0.961, 0.910);  // #E8F5E8
              vec3 bottomColor = vec3(0.784, 0.902, 0.788); // #C8E6C9

              vec3 color;
              if (vUv.y > 0.5) {
                // Top half: sky to horizon
                color = mix(bottomColor, topColor, (vUv.y - 0.5) * 2.0);
              } else {
                // Bottom half: horizon to grass
                color = mix(bottomColor, midColor, vUv.y * 2.0);
              }

              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>
    );
  }
  return null;
}

function Scene() {
  const { viewerSettings } = useSTL();

  // Check if background is a gradient
  const isGradient = viewerSettings.backgroundColor.includes("gradient");

  return (
    <>
      {!isGradient ? (
        <color attach="background" args={[viewerSettings.backgroundColor]} />
      ) : (
        <GradientBackground />
      )}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 15, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 5, 5]} intensity={0.4} />
      <pointLight position={[0, 0, 50]} intensity={0.3} color="#ffffff" />

      <STLMesh />
      <HighlightMesh />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={15}
        maxDistance={150}
        target={[0, 0, 0]}
        autoRotate={false}
        enableDamping={true}
        dampingFactor={0.05}
      />

      <Environment preset="city" />
    </>
  );
}

export default function STLViewer() {
  const { loadDefaultSTL, geometry, viewerSettings } = useSTL();

  // Load default model on mount
  useEffect(() => {
    if (!geometry) {
      loadDefaultSTL();
    }
  }, [loadDefaultSTL, geometry]);

  // Check if background is a gradient
  const isGradient = viewerSettings.backgroundColor.includes("gradient");

  return (
    <div
      className="w-full h-full relative"
      style={{
        background: isGradient ? viewerSettings.backgroundColor : "transparent",
      }}
    >
      <Canvas
        camera={{
          position: [0, 30, 80],
          fov: 45,
          near: 0.1,
          far: 1000,
        }}
        style={{ background: "transparent" }}
        shadows
        gl={{ antialias: true, alpha: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
