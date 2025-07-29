import React, { createContext, useContext, useState, useCallback } from 'react';
import * as THREE from 'three';

interface ViewerSettings {
  showEdges: boolean;
  randomColors: boolean;
  wireframe: boolean;
  backgroundColor: string;
}

interface STLContextType {
  geometry: THREE.BufferGeometry | null;
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  viewerSettings: ViewerSettings;
  
  loadSTLFromFile: (file: File) => Promise<void>;
  loadDefaultSTL: () => Promise<void>;
  updateViewerSettings: (settings: Partial<ViewerSettings>) => void;
  clearError: () => void;
}

const defaultViewerSettings: ViewerSettings = {
  showEdges: false,
  randomColors: false,
  wireframe: false,
  backgroundColor: '#0a0a0a'
};

const STLContext = createContext<STLContextType | undefined>(undefined);

export const useSTL = () => {
  const context = useContext(STLContext);
  if (!context) {
    throw new Error('useSTL must be used within an STLProvider');
  }
  return context;
};

interface STLProviderProps {
  children: React.ReactNode;
}

// Default STL files for random selection
const defaultSTLFiles = [
  '/default-stl/cube.stl',
  '/default-stl/sphere.stl', 
  '/default-stl/torus.stl',
  '/default-stl/cylinder.stl'
];

export const STLProvider: React.FC<STLProviderProps> = ({ children }) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(defaultViewerSettings);

  const loadSTLFromFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.stl')) {
      setError('Please select a valid STL file');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader');
      const loader = new STLLoader();
      
      const arrayBuffer = await file.arrayBuffer();
      const geometry = loader.parse(arrayBuffer);
      
      // Center and scale the geometry
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      
      const size = geometry.boundingBox!.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const scale = 50 / maxDimension; // Scale to fit in a 50-unit cube
      geometry.scale(scale, scale, scale);
      
      geometry.computeVertexNormals();
      
      setGeometry(geometry);
      setFileName(file.name);
    } catch (err) {
      setError('Failed to load STL file');
      console.error('STL loading error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDefaultSTL = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Create random procedural geometries for demo
      const geometryOptions = [
        {
          geometry: new THREE.BoxGeometry(20, 20, 20),
          name: 'cube-model.stl'
        },
        {
          geometry: new THREE.SphereGeometry(15, 32, 16),
          name: 'sphere-model.stl'
        },
        {
          geometry: new THREE.CylinderGeometry(12, 12, 25, 32),
          name: 'cylinder-model.stl'
        },
        {
          geometry: new THREE.TorusGeometry(15, 6, 16, 100),
          name: 'torus-model.stl'
        },
        {
          geometry: new THREE.ConeGeometry(15, 25, 32),
          name: 'cone-model.stl'
        },
        {
          geometry: new THREE.OctahedronGeometry(18),
          name: 'octahedron-model.stl'
        }
      ];

      // Randomly select a geometry
      const randomIndex = Math.floor(Math.random() * geometryOptions.length);
      const selected = geometryOptions[randomIndex];

      selected.geometry.computeVertexNormals();

      setGeometry(selected.geometry);
      setFileName(selected.name);
    } catch (err) {
      setError('Failed to load default model');
      console.error('Default STL loading error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateViewerSettings = useCallback((newSettings: Partial<ViewerSettings>) => {
    setViewerSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: STLContextType = {
    geometry,
    fileName,
    isLoading,
    error,
    viewerSettings,
    loadSTLFromFile,
    loadDefaultSTL,
    updateViewerSettings,
    clearError
  };

  return (
    <STLContext.Provider value={value}>
      {children}
    </STLContext.Provider>
  );
};
