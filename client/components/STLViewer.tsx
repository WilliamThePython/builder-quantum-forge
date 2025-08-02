import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSTL } from '../context/STLContext';
import { STLManipulator, STLToolMode } from '../lib/stlManipulator';

// Helper function to find the nearest edge to a click point
function findNearestEdge(geometry: THREE.BufferGeometry, intersection: THREE.Intersection): { vertexIndex1: number, vertexIndex2: number } {
  if (!intersection.face) {
    return { vertexIndex1: 0, vertexIndex2: 1 };
  }

  const face = intersection.face;
  const point = intersection.point;

  // Get the three vertices of the intersected triangle
  const vertices = [
    { index: face.a, position: new THREE.Vector3() },
    { index: face.b, position: new THREE.Vector3() },
    { index: face.c, position: new THREE.Vector3() }
  ];

  // Get vertex positions
  const positions = geometry.attributes.position.array as Float32Array;
  vertices.forEach(vertex => {
    vertex.position.set(
      positions[vertex.index * 3],
      positions[vertex.index * 3 + 1],
      positions[vertex.index * 3 + 2]
    );
  });

  // Calculate distances from click point to each edge of the triangle
  const edges = [
    { v1: vertices[0], v2: vertices[1] },
    { v1: vertices[1], v2: vertices[2] },
    { v1: vertices[2], v2: vertices[0] }
  ];

  let nearestEdge = edges[0];
  let minDistance = Number.MAX_VALUE;

  edges.forEach(edge => {
    // Calculate distance from point to line segment (edge)
    const line = new THREE.Line3(edge.v1.position, edge.v2.position);
    const closestPoint = new THREE.Vector3();
    line.closestPointToPoint(point, true, closestPoint);
    const distance = point.distanceTo(closestPoint);

    if (distance < minDistance) {
      minDistance = distance;
      nearestEdge = edge;
    }
  });

  console.log(`   Edge distances calculated, nearest: ${nearestEdge.v1.index} ↔ ${nearestEdge.v2.index} (dist: ${minDistance.toFixed(3)})`);

  return {
    vertexIndex1: nearestEdge.v1.index,
    vertexIndex2: nearestEdge.v2.index
  };
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

  // Handle edge highlighting on hover in decimation painter mode
  useEffect(() => {
    if (!decimationPainterMode || !meshRef.current) {
      setHighlightedEdge(null);
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Update pointer position
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Perform raycasting to find intersection
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(meshRef.current!);

      if (intersects.length > 0 && geometry) {
        const intersection = intersects[0];

        if (intersection.face) {
          // Find the nearest edge to the hover point
          const { vertexIndex1, vertexIndex2 } = findNearestEdge(geometry, intersection);

          // Get vertex positions for highlighting
          const positions = geometry.attributes.position.array as Float32Array;
          const position1 = new THREE.Vector3(
            positions[vertexIndex1 * 3],
            positions[vertexIndex1 * 3 + 1],
            positions[vertexIndex1 * 3 + 2]
          );
          const position2 = new THREE.Vector3(
            positions[vertexIndex2 * 3],
            positions[vertexIndex2 * 3 + 1],
            positions[vertexIndex2 * 3 + 2]
          );

          setHighlightedEdge({
            vertexIndex1,
            vertexIndex2,
            position1,
            position2
          });
        }
      } else {
        setHighlightedEdge(null);
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      return () => canvas.removeEventListener('mousemove', handleMouseMove);
    }
  }, [decimationPainterMode, geometry, camera, raycaster, pointer]);

  // Handle decimation painter mode clicks
  useEffect(() => {
    if (!decimationPainterMode || !meshRef.current) return;

    const handleClick = async (event: MouseEvent) => {
      // Update pointer position
      const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      console.log('🎯 === DECIMATION PAINTER CLICK ===');
      console.log(`   Click position: [${pointer.x.toFixed(3)}, ${pointer.y.toFixed(3)}]`);

      // Perform raycasting to find intersection
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(meshRef.current!);

      if (intersects.length > 0) {
        const intersection = intersects[0];

        if (intersection.face && geometry) {
          console.log(`   Face intersected: ${intersection.face.a}, ${intersection.face.b}, ${intersection.face.c}`);

          // Find the nearest edge to the click point
          const { vertexIndex1, vertexIndex2 } = findNearestEdge(geometry, intersection);

          console.log(`   Nearest edge: ${vertexIndex1} ↔ ${vertexIndex2}`);

          try {
            // Perform single edge decimation
            await decimateEdge(vertexIndex1, vertexIndex2);
            console.log('✅ Edge decimation completed successfully');
          } catch (error) {
            console.error('❌ Edge decimation failed:', error);
          }
        }
      } else {
        console.log('   No intersection found');
      }
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', handleClick);
      return () => canvas.removeEventListener('click', handleClick);
    }
  }, [decimationPainterMode, geometry, camera, raycaster, pointer, decimateEdge]);

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
