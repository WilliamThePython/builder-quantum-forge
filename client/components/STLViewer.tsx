import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSTL } from '../context/STLContext';
import { STLManipulator, STLToolMode } from '../lib/stlManipulator';

function HighlightMesh() {
  // No longer needed - highlighting is handled in the main mesh
  return null;
}

function STLMesh() {
  const { geometry, viewerSettings, toolMode, highlightedTriangle, setHighlightedTriangle } = useSTL();
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster, pointer } = useThree();

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

  // Create materials based on settings
  const material = useMemo(() => {
    if (viewerSettings.wireframe) {
      return new THREE.MeshBasicMaterial({
        wireframe: true,
        color: 0x00ff88
      });
    }

    const baseColor = viewerSettings.randomColors ? 0xffffff : 0x606060;

    return new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: viewerSettings.randomColors,
      metalness: 0.3,
      roughness: 0.4
    });
  }, [viewerSettings.wireframe, viewerSettings.randomColors]);



  // Store original colors for highlighting
  const originalColors = useRef<Float32Array | null>(null);

  // Add random colors to geometry if enabled
  useEffect(() => {
    if (geometry && viewerSettings.randomColors && !viewerSettings.wireframe) {
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      const color = new THREE.Color();

      for (let i = 0; i < colors.length; i += 9) { // 9 values per triangle (3 vertices * 3 color components)
        color.setHSL(Math.random(), 0.7, 0.6);

        // Apply same color to all 3 vertices of the triangle
        for (let j = 0; j < 9; j += 3) {
          colors[i + j] = color.r;
          colors[i + j + 1] = color.g;
          colors[i + j + 2] = color.b;
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
          triangleOffset += STLManipulator.getTriangleCountForPolygon ?
            (STLManipulator as any).getTriangleCountForPolygon(face) :
            this.getTriangleCountForPolygon(face);
        }

        const currentFace = polygonFaces[highlightedTriangle];
        const triangleCount = STLManipulator.getTriangleCountForPolygon ?
          (STLManipulator as any).getTriangleCountForPolygon(currentFace) :
          this.getTriangleCountForPolygon(currentFace);

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

  // Subtle rotation animation (disabled when highlighting)
  useFrame((state) => {
    if (meshRef.current && toolMode !== STLToolMode.Highlight) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry} material={material} />
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
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />

      <STLMesh />
      <HighlightMesh />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={10}
        maxDistance={200}
        target={[0, 0, 0]}
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
          position: [50, 50, 50],
          fov: 50,
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
