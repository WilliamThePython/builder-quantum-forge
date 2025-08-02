import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSTL } from '../context/STLContext';
import { STLManipulator, STLToolMode } from '../lib/stlManipulator';

// Helper function to find the nearest POLYGON PERIMETER edge to a click point
function findNearestPolygonEdge(geometry: THREE.BufferGeometry, intersection: THREE.Intersection): { vertexIndex1: number, vertexIndex2: number } | null {
  if (!intersection.face) {
    return null;
  }

  const point = intersection.point;
  const positions = geometry.attributes.position.array as Float32Array;

  // Check if this geometry has polygon face metadata
  const polygonFaces = (geometry as any).polygonFaces;
  if (!polygonFaces || !Array.isArray(polygonFaces)) {
    return null;
  }

  // Find which polygon face was clicked
  const clickedPolygonFace = findPolygonFaceFromIntersection(geometry, intersection);
  if (clickedPolygonFace === null || clickedPolygonFace >= polygonFaces.length) {
    return null;
  }

  const polygonFace = polygonFaces[clickedPolygonFace];

  // Get the original polygon vertices (perimeter only)
  if (!polygonFace.originalVertices || polygonFace.originalVertices.length < 3) {
    return null;
  }

  const polygonVertices = polygonFace.originalVertices;

  // Create perimeter edges of the polygon (not internal triangulation edges)
  const perimeterEdges = [];
  for (let i = 0; i < polygonVertices.length; i++) {
    const currentVertex = polygonVertices[i];
    const nextVertex = polygonVertices[(i + 1) % polygonVertices.length]; // Wrap around to first vertex

    // Ensure vertices are Vector3 objects
    const currentVec3 = currentVertex instanceof THREE.Vector3
      ? currentVertex
      : new THREE.Vector3(currentVertex.x, currentVertex.y, currentVertex.z);

    const nextVec3 = nextVertex instanceof THREE.Vector3
      ? nextVertex
      : new THREE.Vector3(nextVertex.x, nextVertex.y, nextVertex.z);

    perimeterEdges.push({
      v1: {
        index: findVertexIndex(positions, currentVec3),
        position: currentVec3.clone()
      },
      v2: {
        index: findVertexIndex(positions, nextVec3),
        position: nextVec3.clone()
      }
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
  if (nearestEdge && !isValidPolygonBoundaryEdge(polygonFaces, nearestEdge.v1.position, nearestEdge.v2.position)) {
    console.warn('⚠️ Selected edge is not a valid polygon boundary, skipping');
    return null;
  }

  return {
    vertexIndex1: nearestEdge.v1.index,
    vertexIndex2: nearestEdge.v2.index
  };
}

// Helper function to find which polygon face contains the intersection
function findPolygonFaceFromIntersection(geometry: THREE.BufferGeometry, intersection: THREE.Intersection): number | null {
  if (!intersection.face) return null;

  // Try to use STLManipulator if available, otherwise calculate manually
  try {
    return STLManipulator.getPolygonFaceFromIntersection(geometry, intersection);
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

    if (triangleIndex >= currentTriangleOffset && triangleIndex < currentTriangleOffset + triangleCount) {
      return faceIndex;
    }
    currentTriangleOffset += triangleCount;
  }

  return null;
}

// Helper function to find vertex index from position
function findVertexIndex(positions: Float32Array, targetVertex: THREE.Vector3): number {
  const tolerance = 0.001;

  for (let i = 0; i < positions.length; i += 3) {
    const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
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
  vertex2: THREE.Vector3
): boolean {
  const tolerance = 0.001;
  let faceCount = 0;

  // Count how many polygon faces contain this edge
  for (const face of polygonFaces) {
    if (!face.originalVertices) continue;

    let hasVertex1 = false;
    let hasVertex2 = false;

    // Check if this polygon face contains both vertices of the edge
    for (const vertex of face.originalVertices) {
      const vertexPos = vertex instanceof THREE.Vector3
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
      if (areVerticesConsecutiveInPolygon(face.originalVertices, vertex1, vertex2, tolerance)) {
        faceCount++;
      }
    }
  }

  // A valid polygon boundary edge should be shared by exactly 1 or 2 faces
  // (1 = exterior edge, 2 = interior edge between adjacent faces)
  const isValid = faceCount >= 1 && faceCount <= 2;

  if (!isValid) {
    console.warn(`Invalid edge: found in ${faceCount} faces (expected 1-2)`);
  }

  return isValid;
}

// Check if two vertices are consecutive in a polygon perimeter
function areVerticesConsecutiveInPolygon(
  vertices: any[],
  vertex1: THREE.Vector3,
  vertex2: THREE.Vector3,
  tolerance: number
): boolean {
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    const currentPos = current instanceof THREE.Vector3
      ? current
      : new THREE.Vector3(current.x, current.y, current.z);
    const nextPos = next instanceof THREE.Vector3
      ? next
      : new THREE.Vector3(next.x, next.y, next.z);

    // Check if current->next matches vertex1->vertex2 or vertex2->vertex1
    if ((currentPos.distanceTo(vertex1) < tolerance && nextPos.distanceTo(vertex2) < tolerance) ||
        (currentPos.distanceTo(vertex2) < tolerance && nextPos.distanceTo(vertex1) < tolerance)) {
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
  const positions = vertices.map(v =>
    v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z)
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
  vertex2: THREE.Vector3
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
      const vertexPos = vertex instanceof THREE.Vector3
        ? vertex
        : new THREE.Vector3(vertex.x, vertex.y, vertex.z);

      if (vertexPos.distanceTo(vertex1) < tolerance) hasVertex1 = true;
      if (vertexPos.distanceTo(vertex2) < tolerance) hasVertex2 = true;
    }

    // If face has both vertices, check if they're consecutive (true boundary edge)
    if (hasVertex1 && hasVertex2) {
      if (areVerticesConsecutiveInPolygon(face.originalVertices, vertex1, vertex2, tolerance)) {
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
  if (!face.originalVertices || !Array.isArray(face.originalVertices)) return false;
  if (face.originalVertices.length < 3) return false;

  // Convert to Vector3 objects
  const vertices = face.originalVertices.map((v: any) =>
    v instanceof THREE.Vector3 ? v : new THREE.Vector3(v.x, v.y, v.z)
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
    if (doLinesIntersect(edge1Start, edge1End, edge2Start, edge2End) ||
        doLinesIntersect(edge3Start, edge3End, edge4Start, edge4End)) {
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
      area += (curr.x * next.y - next.x * curr.y);
    }
  } else if (absY >= absX) {
    // Project to XZ plane
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += (curr.x * next.z - next.x * curr.z);
    }
  } else {
    // Project to YZ plane
    for (let i = 0; i < vertices.length; i++) {
      const curr = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += (curr.y * next.z - next.y * curr.z);
    }
  }

  return Math.abs(area) * 0.5;
}

// Check if two line segments intersect in 3D space
function doLinesIntersect(
  line1Start: THREE.Vector3, line1End: THREE.Vector3,
  line2Start: THREE.Vector3, line2End: THREE.Vector3
): boolean {
  // Simplified 2D intersection check (project to dominant plane)
  // This is not a complete 3D line intersection, but good enough for basic validation

  const tolerance = 0.001;

  // Check if lines share endpoints (allowed)
  if (line1Start.distanceTo(line2Start) < tolerance ||
      line1Start.distanceTo(line2End) < tolerance ||
      line1End.distanceTo(line2Start) < tolerance ||
      line1End.distanceTo(line2End) < tolerance) {
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

// Helper function to count triangles in a polygon face
function getTriangleCountForPolygon(face: any): number {
  if (!face.originalVertices) {
    if (face.type === 'triangle') return 1;
    if (face.type === 'quad') return 2;
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
    decimateEdge
  } = useSTL();
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

  // Helper method for triangle counting
  const getTriangleCountForPolygon = (face: any): number => {
    if (!face.originalVertices) {
      if (face.type === 'triangle') return 1;
      if (face.type === 'quad') return 2;
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

    console.log('🔗 === WIREFRAME UPDATE ===');
    console.log(`🔗 Creating wireframe for geometry: ${geometry.attributes.position.count} vertices, ${geometry.index ? geometry.index.count / 3 : 0} faces`);

    const polygonFaces = (geometry as any).polygonFaces;

    if (!polygonFaces || !Array.isArray(polygonFaces)) {
      // Fallback to standard edge wireframe for non-polygon geometries
      console.log('🔗 Creating standard edge wireframe (no polygon data)');
      const edgeGeometry = new THREE.EdgesGeometry(geometry);
      console.log(`🔗 Standard wireframe created with ${edgeGeometry.attributes.position.count / 2} edges`);
      return edgeGeometry;
    }

    console.log('🔗 Creating polygon-aware wireframe');

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
            currentVertex.x, currentVertex.y, currentVertex.z,
            nextVertex.x, nextVertex.y, nextVertex.z
          );
        }
      } else {
        // Fallback: if no original vertices, try to reconstruct from face type
        console.warn('⚠️ Face missing original vertices, using fallback for face:', faceIndex);
      }
    }

    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wireframePositions, 3));

    console.log(`✅ Created polygon wireframe with ${wireframePositions.length / 6} edge segments`);
    return wireGeometry;
  }, [geometry, viewerSettings.wireframe]);

  // Create materials based on settings
  const material = useMemo(() => {
    if (viewerSettings.wireframe) {
      return new THREE.MeshBasicMaterial({
        wireframe: false, // We'll handle wireframe with LineSegments
        color: 0x404040,
        transparent: true,
        opacity: 0.1
      });
    }

    const baseColor = viewerSettings.randomColors ? 0xffffff : 0x606060;

    return new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: viewerSettings.randomColors,
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.FrontSide,
      transparent: false,
      opacity: 1.0
    });
  }, [viewerSettings.wireframe, viewerSettings.randomColors]);

  // Trigger spinning animation when a new model loads
  useEffect(() => {
    if (geometry) {
      console.log('=== VIEWER GEOMETRY UPDATE ===');
      console.log(`🎆 Viewer received geometry: ${geometry.attributes.position.count} vertices, ${geometry.index ? geometry.index.count / 3 : 0} faces`);
      console.log(`🎆 Geometry UUID: ${geometry.uuid}`);

      // Log first few vertices
      const positions = geometry.attributes.position.array;
      console.log('🎆 VIEWER first 3 vertices:', [
        [positions[0], positions[1], positions[2]],
        [positions[3], positions[4], positions[5]],
        [positions[6], positions[7], positions[8]]
      ]);

      console.log('🌀 Starting model spin animation');
      spinState.current = {
        ...spinState.current,
        isSpinning: true,
        startTime: Date.now()
      };
    }
  }, [geometry]);

  // Spinning animation frame loop
  useFrame(() => {
    if (!meshRef.current || !spinState.current.isSpinning) return;

    const elapsed = Date.now() - spinState.current.startTime;
    const progress = Math.min(elapsed / spinState.current.duration, 1);

    // Easing function for smooth deceleration (cubic ease-out)
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentSpeed = spinState.current.initialSpeed * (1 - easeOut);

    if (progress >= 1) {
      // Animation complete, stop spinning
      spinState.current.isSpinning = false;
      console.log('✅ Model spin animation completed');
    } else {
      // Continue spinning with decreasing speed
      meshRef.current.rotation.y += currentSpeed * 0.016; // 60fps approximation
      meshRef.current.rotation.x += currentSpeed * 0.3 * 0.016; // Slight X rotation for 3D effect
    }
  });

  // Store original colors for highlighting
  const originalColors = useRef<Float32Array | null>(null);

  // Add random colors to geometry if enabled - now works with polygon faces
  useEffect(() => {
    if (geometry && viewerSettings.randomColors && !viewerSettings.wireframe) {
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      const polygonFaces = (geometry as any).polygonFaces;

      if (polygonFaces && Array.isArray(polygonFaces)) {
        // Color each polygon face with a unique color
        let triangleOffset = 0;

        for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
          const face = polygonFaces[faceIndex];
          const triangleCount = getTriangleCountForPolygon(face);

          // Generate one color per polygon face
          const color = new THREE.Color();
          color.setHSL(Math.random(), 0.8, 0.6);

          // Apply this color to all triangles that make up this polygon face
          for (let t = 0; t < triangleCount; t++) {
            const triangleStart = (triangleOffset + t) * 9; // 9 values per triangle (3 vertices * 3 color components)

            // Apply same color to all 3 vertices of the triangle
            for (let v = 0; v < 9; v += 3) {
              if (triangleStart + v + 2 < colors.length) {
                colors[triangleStart + v] = color.r;
                colors[triangleStart + v + 1] = color.g;
                colors[triangleStart + v + 2] = color.b;
              }
            }
          }

          triangleOffset += triangleCount;
        }
      } else {
        // Fallback to triangle-based coloring if no polygon face data
        console.log('No polygon faces found, using triangle-based coloring');
        const color = new THREE.Color();
        for (let i = 0; i < colors.length; i += 9) {
          color.setHSL(Math.random(), 0.7, 0.6);

          for (let j = 0; j < 9; j += 3) {
            colors[i + j] = color.r;
            colors[i + j + 1] = color.g;
            colors[i + j + 2] = color.b;
          }
        }
      }

      // Store original colors for highlighting
      originalColors.current = new Float32Array(colors);

      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.attributes.color.needsUpdate = true;
    } else if (geometry && geometry.attributes.color) {
      // Remove color attribute if not using random colors
      geometry.deleteAttribute('color');
      originalColors.current = null;
    }
  }, [geometry, viewerSettings.randomColors, viewerSettings.wireframe]);

  // Handle highlighting by brightening colors
  useEffect(() => {
    if (!geometry || !viewerSettings.randomColors || !originalColors.current) return;

    const colors = geometry.attributes.color?.array as Float32Array;
    if (!colors) return;

    // Reset all colors to original
    colors.set(originalColors.current);

    // Highlight polygon face in bright red
    if (highlightedTriangle !== null && toolMode === STLToolMode.Highlight) {
      const polygonFaces = (geometry as any).polygonFaces;

      if (polygonFaces && Array.isArray(polygonFaces) && highlightedTriangle < polygonFaces.length) {
        // Polygon-based highlighting: highlight entire polygon face
        let triangleOffset = 0;

        // Calculate which triangles belong to this polygon face
        for (let faceIndex = 0; faceIndex < highlightedTriangle; faceIndex++) {
          const face = polygonFaces[faceIndex];
          triangleOffset += STLManipulator.getTriangleCountForPolygon(face);
        }

        const currentFace = polygonFaces[highlightedTriangle];
        const triangleCount = STLManipulator.getTriangleCountForPolygon(currentFace);

        // Highlight all triangles in this polygon face
        for (let t = 0; t < triangleCount; t++) {
          const triangleStart = (triangleOffset + t) * 9; // 3 vertices * 3 color components

          for (let i = 0; i < 9; i += 3) {
            const idx = triangleStart + i;
            if (idx < colors.length) {
              // Set to bright red color
              colors[idx] = 1.0;     // Red
              colors[idx + 1] = 0.0; // Green
              colors[idx + 2] = 0.0; // Blue
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
            colors[idx] = 1.0;     // Red
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
        const faceIndex = STLManipulator.getPolygonFaceFromIntersection(geometry!, intersection);
        setHighlightedTriangle(faceIndex);
      } else {
        setHighlightedTriangle(null);
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      return () => canvas.removeEventListener('mousemove', handleMouseMove);
    }
  }, [toolMode, geometry, camera, raycaster, pointer]);

  // Update canvas cursor for decimation painter mode
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.style.cursor = decimationPainterMode ? 'crosshair' : 'default';
    }

    return () => {
      if (canvas) {
        canvas.style.cursor = 'default';
      }
    };
  }, [decimationPainterMode]);

  // Create edge geometry for raycasting (polygon perimeter edges only)
  const edgeGeometry = useMemo(() => {
    if (!geometry || !decimationPainterMode) return null;

    const polygonFaces = (geometry as any).polygonFaces;
    if (!polygonFaces || !Array.isArray(polygonFaces)) {
      return null;
    }

    const edgeData: {
      line: THREE.Line;
      vertexIndex1: number;
      vertexIndex2: number;
      position1: THREE.Vector3;
      position2: THREE.Vector3
    }[] = [];
    const positions = geometry.attributes.position.array as Float32Array;

    // Create individual line objects for each polygon perimeter edge
    for (const face of polygonFaces) {
      if (!face.originalVertices || face.originalVertices.length < 3) continue;

      // Validate that this face is actually coplanar
      if (!isCoplanarPolygon(face.originalVertices)) {
        console.warn('⚠️ Skipping non-coplanar polygon face');
        continue;
      }

      const vertices = face.originalVertices;
      for (let i = 0; i < vertices.length; i++) {
        const currentVertex = vertices[i];
        const nextVertex = vertices[(i + 1) % vertices.length];

        const currentPos = currentVertex instanceof THREE.Vector3
          ? currentVertex
          : new THREE.Vector3(currentVertex.x, currentVertex.y, currentVertex.z);
        const nextPos = nextVertex instanceof THREE.Vector3
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
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
          currentPos.x, currentPos.y, currentPos.z,
          nextPos.x, nextPos.y, nextPos.z
        ], 3));

        const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
          color: 0x00ff00,
          transparent: true,
          opacity: 0 // Invisible - only for raycasting
        }));

        edgeData.push({
          line,
          vertexIndex1,
          vertexIndex2,
          position1: currentPos.clone(),
          position2: nextPos.clone()
        });
      }
    }

    return edgeData;
  }, [geometry, decimationPainterMode]);

  // Handle edge highlighting on hover in decimation painter mode
  useEffect(() => {
    if (!decimationPainterMode || !edgeGeometry) {
      setHighlightedEdge(null);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Update pointer position
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Perform raycasting directly against polygon edge lines
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Line.threshold = 3; // Increase threshold for easier edge selection

      let nearestEdge = null;
      let minDistance = Number.MAX_VALUE;

      // Test intersection with each polygon perimeter edge line
      for (const edgeData of edgeGeometry) {
        const intersects = raycaster.intersectObject(edgeData.line);

        if (intersects.length > 0) {
          const distance = intersects[0].distance;
          if (distance < minDistance) {
            minDistance = distance;
            nearestEdge = edgeData;
          }
        }
      }

      if (nearestEdge) {
        setHighlightedEdge({
          vertexIndex1: nearestEdge.vertexIndex1,
          vertexIndex2: nearestEdge.vertexIndex2,
          position1: nearestEdge.position1,
          position2: nearestEdge.position2
        });
      } else {
        setHighlightedEdge(null);
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      return () => canvas.removeEventListener('mousemove', handleMouseMove);
    }
  }, [decimationPainterMode, edgeGeometry, camera, raycaster, pointer]);

  // Handle decimation painter mode clicks
  useEffect(() => {
    if (!decimationPainterMode || !meshRef.current) return;

    const handleClick = async (event: MouseEvent) => {
      console.log('🎯 === DECIMATION PAINTER CLICK ===');

      if (highlightedEdge) {
        console.log(`   Decimating highlighted edge: ${highlightedEdge.vertexIndex1} ↔ ${highlightedEdge.vertexIndex2}`);
        console.log(`   Edge positions:`);
        console.log(`     v${highlightedEdge.vertexIndex1}: [${highlightedEdge.position1.x.toFixed(3)}, ${highlightedEdge.position1.y.toFixed(3)}, ${highlightedEdge.position1.z.toFixed(3)}]`);
        console.log(`     v${highlightedEdge.vertexIndex2}: [${highlightedEdge.position2.x.toFixed(3)}, ${highlightedEdge.position2.y.toFixed(3)}, ${highlightedEdge.position2.z.toFixed(3)}]`);

        try {
          // Perform single edge decimation
          await decimateEdge(highlightedEdge.vertexIndex1, highlightedEdge.vertexIndex2);
          console.log('✅ Edge decimation completed successfully');

          // Clear the highlighted edge after decimation
          setHighlightedEdge(null);
        } catch (error) {
          console.error('❌ Edge decimation failed:', error);
        }
      } else {
        console.log('   No edge highlighted for decimation');
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', handleClick);
      return () => canvas.removeEventListener('click', handleClick);
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
      <mesh
        key={geometry.uuid}
        geometry={geometry}
        material={material}
      />

      {/* Polygon-aware wireframe overlay */}
      {viewerSettings.wireframe && wireframeGeometry && (
        <lineSegments
          key={`wireframe-${geometry.uuid}`}
          geometry={wireframeGeometry}
        >
          <lineBasicMaterial color={0x00ff88} linewidth={2} />
        </lineSegments>
      )}

      {/* Highlighted edge for decimation painter */}
      {decimationPainterMode && highlightedEdge && (
        <line key={`highlighted-edge-${highlightedEdge.vertexIndex1}-${highlightedEdge.vertexIndex2}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array([
                highlightedEdge.position1.x, highlightedEdge.position1.y, highlightedEdge.position1.z,
                highlightedEdge.position2.x, highlightedEdge.position2.y, highlightedEdge.position2.z
              ])}
              count={2}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#00ff00"
            linewidth={4}
            transparent={false}
          />
        </line>
      )}
    </group>
  );
}

function GradientBackground() {
  const { viewerSettings } = useSTL();

  // Create gradient background for Three.js scene
  if (viewerSettings.backgroundColor.includes('gradient')) {
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
  const isGradient = viewerSettings.backgroundColor.includes('gradient');

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
  const isGradient = viewerSettings.backgroundColor.includes('gradient');

  return (
    <div
      className="w-full h-full relative"
      style={{
        background: isGradient ? viewerSettings.backgroundColor : 'transparent'
      }}
    >
      <Canvas
        camera={{
          position: [0, 30, 80],
          fov: 45,
          near: 0.1,
          far: 1000
        }}
        style={{ background: 'transparent' }}
        shadows
        gl={{ antialias: true, alpha: true }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
