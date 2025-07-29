import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSTL } from '../context/STLContext';

function STLMesh() {
  const { geometry, viewerSettings } = useSTL();
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  // Create materials based on settings
  const material = useMemo(() => {
    if (viewerSettings.wireframe) {
      return new THREE.MeshBasicMaterial({ 
        wireframe: true, 
        color: 0x00ff88 
      });
    }
    
    if (viewerSettings.randomColors) {
      return new THREE.MeshStandardMaterial({ 
        vertexColors: true,
        metalness: 0.3,
        roughness: 0.4
      });
    }

    return new THREE.MeshStandardMaterial({ 
      color: 0x606060,
      metalness: 0.3,
      roughness: 0.4
    });
  }, [viewerSettings.wireframe, viewerSettings.randomColors]);

  // Create edges geometry
  const edgesGeometry = useMemo(() => {
    if (!geometry || !viewerSettings.showEdges) return null;
    return new THREE.EdgesGeometry(geometry, 15); // 15 degree threshold
  }, [geometry, viewerSettings.showEdges]);

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
      
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.attributes.color.needsUpdate = true;
    } else if (geometry && geometry.attributes.color) {
      // Remove color attribute if not using random colors
      geometry.deleteAttribute('color');
    }
  }, [geometry, viewerSettings.randomColors, viewerSettings.wireframe]);

  // Subtle rotation animation
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  if (!geometry) return null;

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      {edgesGeometry && viewerSettings.showEdges && (
        <lineSegments ref={edgesRef} geometry={edgesGeometry}>
          <lineBasicMaterial color="#00ff88" linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
}

function Scene() {
  const { viewerSettings } = useSTL();

  // Check if background is a gradient
  const isGradient = viewerSettings.backgroundColor.includes('gradient');

  return (
    <>
      {!isGradient && (
        <color attach="background" args={[viewerSettings.backgroundColor]} />
      )}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />

      <STLMesh />

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
  const { loadDefaultSTL, geometry } = useSTL();

  // Load default model on mount
  useEffect(() => {
    if (!geometry) {
      loadDefaultSTL();
    }
  }, [loadDefaultSTL, geometry]);

  return (
    <div className="w-full h-full relative">
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
