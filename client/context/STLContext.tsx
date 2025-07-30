import React, { createContext, useContext, useState, useCallback } from 'react';
import * as THREE from 'three';
import { analytics } from '../lib/analytics';

interface ViewerSettings {
  randomColors: boolean;
  wireframe: boolean;
  backgroundColor: string;
}

interface ErrorMessage {
  id: string;
  message: string;
  timestamp: number;
}

interface STLContextType {
  geometry: THREE.BufferGeometry | null;
  fileName: string | null;
  isLoading: boolean;
  error: string | null;
  errors: ErrorMessage[];
  viewerSettings: ViewerSettings;

  loadSTLFromFile: (file: File) => Promise<void>;
  loadDefaultSTL: () => Promise<void>;
  updateViewerSettings: (settings: Partial<ViewerSettings>) => void;
  exportSTL: (customFilename?: string) => void;
  clearError: () => void;
  clearErrorById: (id: string) => void;
  addError: (message: string) => void;
}

const defaultViewerSettings: ViewerSettings = {
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
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(defaultViewerSettings);

  const loadSTLFromFile = useCallback(async (file: File) => {
    console.log('loadSTLFromFile called with:', file.name);
    setIsLoading(true);
    setError(null);

    try {
      // Basic file validation first
      if (!file.name.toLowerCase().endsWith('.stl')) {
        addError('Please select a valid STL file');
        return;
      }

      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        addError('File too large. Maximum size: 50MB');
        return;
      }

      console.log('Basic validation passed, proceeding with STL loading...');

      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader');
      const loader = new STLLoader();

      const uploadStartTime = Date.now();
      console.log('Reading file as array buffer...');
      const arrayBuffer = await file.arrayBuffer();
      console.log('Array buffer size:', arrayBuffer.byteLength);

      let geometry: THREE.BufferGeometry;
      try {
        console.log('Parsing STL with Three.js STLLoader...');
        geometry = loader.parse(arrayBuffer);
        console.log('STL parsed successfully');
      } catch (parseError) {
        console.error('STL parsing error:', parseError);
        throw new Error(`Failed to parse STL file: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
      }

      // Validate parsed geometry
      if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
        throw new Error('STL file contains no valid geometry data');
      }

      // Center and scale the geometry
      geometry.computeBoundingBox();

      if (!geometry.boundingBox) {
        throw new Error('Unable to compute geometry bounds');
      }

      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);

      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);

      if (maxDimension === 0) {
        throw new Error('STL geometry has zero dimensions');
      }

      const scale = 50 / maxDimension; // Scale to fit in a 50-unit cube
      geometry.scale(scale, scale, scale);

      geometry.computeVertexNormals();

      const uploadTime = Date.now() - uploadStartTime;
      const vertices = geometry.attributes.position?.count || 0;
      const triangles = Math.floor(vertices / 3);

      // Set the new geometry and filename
      setGeometry(geometry);
      setFileName(file.name);

      // Track STL upload analytics
      try {
        analytics.trackSTLUpload({
          file_name: file.name,
          file_size: file.size,
          vertices: vertices,
          triangles: triangles,
          upload_time: uploadTime
        });
        console.log('STL upload tracked successfully');
      } catch (error) {
        console.warn('Failed to track STL upload:', error);
      }

      console.log(`STL loaded successfully: ${file.name} (${triangles.toLocaleString()} triangles)`);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load STL file';
      addError(errorMessage);
      console.error('STL loading error details:', {
        error: err,
        message: errorMessage,
        fileName: file?.name || 'unknown'
      });
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
      addError('Failed to load default model');
      console.error('Default STL loading error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateViewerSettings = useCallback((newSettings: Partial<ViewerSettings>) => {
    setViewerSettings(prev => {
      const updated = { ...prev, ...newSettings };

      // Track visualization changes
      analytics.trackSTLVisualization('settings_change', {
        previous_settings: prev,
        new_settings: newSettings,
        final_settings: updated
      });

      return updated;
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const addError = useCallback((message: string) => {
    const newError: ErrorMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      message,
      timestamp: Date.now()
    };

    setErrors(prev => [...prev, newError]);

    // Auto-remove error after 10 seconds
    setTimeout(() => {
      setErrors(prev => prev.filter(error => error.id !== newError.id));
    }, 10000);
  }, []);

  const clearErrorById = useCallback((id: string) => {
    setErrors(prev => prev.filter(error => error.id !== id));
  }, []);

  const exportSTL = useCallback(async (customFilename?: string) => {
    if (!geometry) {
      addError('No model available for export');
      return;
    }

    try {
      console.log('Starting STL export...', {
        fileName,
        hasGeometry: !!geometry,
        vertexCount: geometry?.attributes?.position?.count || 0
      });

      const { exportCurrentSTL } = await import('../lib/stlExporter');

      const exportFilename = customFilename ||
        (fileName ? fileName.replace(/\.[^/.]+$/, '_exported.stl') : 'exported_model.stl');

      console.log('Calling exportCurrentSTL with filename:', exportFilename);

      exportCurrentSTL(geometry, exportFilename);

      console.log('STL export completed successfully');

      // Track export event
      try {
        analytics.trackEvent({
          event_name: 'stl_export',
          event_category: '3d_interaction',
          event_label: exportFilename,
          custom_parameters: {
            original_filename: fileName,
            export_filename: exportFilename,
            vertex_count: geometry.attributes.position?.count || 0,
            triangle_count: Math.floor((geometry.attributes.position?.count || 0) / 3)
          }
        });
      } catch (analyticsError) {
        console.warn('Failed to track export event:', analyticsError);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export STL file';
      addError(`Export failed: ${errorMessage}`);
      console.error('STL export error details:', error);
    }
  }, [geometry, fileName]);

  const value: STLContextType = {
    geometry,
    fileName,
    isLoading,
    error,
    errors,
    viewerSettings,
    loadSTLFromFile,
    loadDefaultSTL,
    updateViewerSettings,
    exportSTL,
    clearError,
    clearErrorById,
    addError
  };

  return (
    <STLContext.Provider value={value}>
      {children}
    </STLContext.Provider>
  );
};
