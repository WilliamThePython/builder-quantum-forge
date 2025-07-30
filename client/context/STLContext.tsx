import React, { createContext, useContext, useState, useCallback } from 'react';
import * as THREE from 'three';
import { analytics } from '../lib/analytics';
import { STLManipulator, STLToolMode, ToolOperationResult } from '../lib/stlManipulator';
import { TriangleExporter } from '../lib/triangleExporter';
import { PolygonGeometryBuilder } from '../lib/polygonGeometryBuilder';

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

  // STL Tools
  toolMode: STLToolMode;
  isProcessingTool: boolean;

  // Highlighting
  highlightedTriangle: number | null;
  triangleStats: any;

  loadSTLFromFile: (file: File) => Promise<void>;
  loadDefaultSTL: () => Promise<void>;
  updateViewerSettings: (settings: Partial<ViewerSettings>) => void;
  exportSTL: (customFilename?: string) => void;
  exportTriangles: (options?: any) => Promise<void>;
  clearError: () => void;
  clearErrorById: (id: string) => void;
  addError: (message: string) => void;

  // STL Tool Methods
  setToolMode: (mode: STLToolMode) => void;
  reducePoints: (reductionAmount: number, method: 'quadric_edge_collapse' | 'vertex_clustering' | 'adaptive' | 'random') => Promise<ToolOperationResult>;
  getGeometryStats: () => any;
  setHighlightedTriangle: (triangleIndex: number | null) => void;
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

  // STL Tools state
  const [toolMode, setToolMode] = useState<STLToolMode>(STLToolMode.None);
  const [isProcessingTool, setIsProcessingTool] = useState(false);

  // Highlighting state
  const [highlightedTriangle, setHighlightedTriangleState] = useState<number | null>(null);
  const [triangleStats, setTriangleStats] = useState<any>(null);

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
      // Create hollow shell geometries - all models are shells with no internal geometry
      const createCleanShell = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
        // Ensure clean shell by removing duplicate vertices and computing proper normals
        geometry.deleteAttribute('normal');
        geometry.computeVertexNormals();
        geometry.normalizeNormals();
        return geometry;
      };

      const geometryOptions = [
        {
          geometry: createCleanShell(new THREE.BoxGeometry(20, 20, 20)),
          name: 'cube-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.SphereGeometry(15, 32, 16)),
          name: 'sphere-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.CylinderGeometry(12, 12, 25, 32)),
          name: 'cylinder-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.TorusGeometry(15, 6, 16, 100)),
          name: 'torus-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.ConeGeometry(15, 25, 32)),
          name: 'cone-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.OctahedronGeometry(18)),
          name: 'octahedron-shell.stl'
        },
        // Irregular rectangular prism shells
        {
          geometry: createCleanShell(new THREE.BoxGeometry(
            5 + Math.random() * 30,   // width: 5-35
            8 + Math.random() * 20,   // height: 8-28
            12 + Math.random() * 25   // depth: 12-37
          )),
          name: 'irregular-prism-shell-1.stl'
        },
        {
          geometry: createCleanShell(new THREE.BoxGeometry(
            15 + Math.random() * 15,  // width: 15-30
            3 + Math.random() * 40,   // height: 3-43
            6 + Math.random() * 18    // depth: 6-24
          )),
          name: 'irregular-prism-shell-2.stl'
        },
        {
          geometry: createCleanShell(new THREE.BoxGeometry(
            25 + Math.random() * 10,  // width: 25-35
            20 + Math.random() * 5,   // height: 20-25
            2 + Math.random() * 35    // depth: 2-37
          )),
          name: 'irregular-prism-shell-3.stl'
        },
        // Platonic solid shells
        {
          geometry: createCleanShell(new THREE.DodecahedronGeometry(15)),
          name: 'dodecahedron-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.IcosahedronGeometry(16)),
          name: 'icosahedron-shell.stl'
        },
        {
          geometry: createCleanShell(new THREE.TetrahedronGeometry(20)),
          name: 'tetrahedron-shell.stl'
        },
        // Irregular cylinder shell
        {
          geometry: (() => {
            const geom = new THREE.CylinderGeometry(
              8 + Math.random() * 12,   // top radius: 8-20
              12 + Math.random() * 8,   // bottom radius: 12-20
              15 + Math.random() * 20,  // height: 15-35
              Math.max(8, 16 + Math.floor(Math.random() * 16)) // segments: 16-32 (min 8 for clean shell)
            );
            return createCleanShell(geom);
          })(),
          name: 'irregular-cylinder-shell.stl'
        },
        // Capsule shell
        {
          geometry: createCleanShell(new THREE.CapsuleGeometry(8, 20, 4, 8)),
          name: 'capsule-shell.stl'
        },
        // Torus shell with random parameters
        {
          geometry: (() => {
            const geom = new THREE.TorusGeometry(
              10 + Math.random() * 15,  // tube radius: 10-25
              3 + Math.random() * 8,    // tube thickness: 3-11
              Math.max(8, 8 + Math.floor(Math.random() * 16)), // radial segments: 8-24
              Math.max(20, 50 + Math.floor(Math.random() * 50))  // tubular segments: 50-100
            );
            return createCleanShell(geom);
          })(),
          name: 'random-torus-shell.stl'
        },
        // Random cone shell
        {
          geometry: (() => {
            const geom = new THREE.ConeGeometry(
              8 + Math.random() * 15,   // radius: 8-23
              20 + Math.random() * 20,  // height: 20-40
              Math.max(6, 6 + Math.floor(Math.random() * 26)) // segments: 6-32 (min 6)
            );
            return createCleanShell(geom);
          })(),
          name: 'random-cone-shell.stl'
        },
        // Spheroid shell (flattened/stretched sphere)
        {
          geometry: (() => {
            const geom = new THREE.SphereGeometry(15, 32, 16);
            geom.scale(
              0.5 + Math.random() * 1.5,  // x scale: 0.5-2.0
              0.3 + Math.random() * 2.0,  // y scale: 0.3-2.3
              0.7 + Math.random() * 1.0   // z scale: 0.7-1.7
            );
            return createCleanShell(geom);
          })(),
          name: 'spheroid-shell.stl'
        },
        // Rotated box shell (no longer "twisted" - just rotated for clean geometry)
        {
          geometry: (() => {
            const geom = new THREE.BoxGeometry(
              12 + Math.random() * 16,
              18 + Math.random() * 12,
              8 + Math.random() * 20
            );
            // Apply rotation to make it oriented differently
            geom.rotateX((Math.random() - 0.5) * Math.PI * 0.25);
            geom.rotateY((Math.random() - 0.5) * Math.PI * 0.25);
            geom.rotateZ((Math.random() - 0.5) * Math.PI * 0.25);
            return createCleanShell(geom);
          })(),
          name: 'rotated-prism-shell.stl'
        },
        // Ring geometry (hollow donut-like shell)
        {
          geometry: (() => {
            const geom = new THREE.RingGeometry(
              8 + Math.random() * 10,   // inner radius: 8-18
              15 + Math.random() * 10,  // outer radius: 15-25
              Math.max(8, 8 + Math.floor(Math.random() * 24)) // segments: 8-32
            );
            return createCleanShell(geom);
          })(),
          name: 'ring-shell.stl'
        },
        // Plane-based shell (thin rectangular shell)
        {
          geometry: (() => {
            const geom = new THREE.PlaneGeometry(
              20 + Math.random() * 15,  // width: 20-35
              15 + Math.random() * 10   // height: 15-25
            );
            // Make it slightly 3D by extruding a tiny bit
            const positions = geom.attributes.position.array;
            for (let i = 2; i < positions.length; i += 3) {
              positions[i] += (Math.random() - 0.5) * 0.5; // tiny z variation
            }
            geom.attributes.position.needsUpdate = true;
            return createCleanShell(geom);
          })(),
          name: 'thin-shell.stl'
        },
        // Wedge shell
        {
          geometry: (() => {
            const geom = new THREE.CylinderGeometry(
              0,                        // top radius: 0 (point)
              12 + Math.random() * 8,   // bottom radius: 12-20
              15 + Math.random() * 15,  // height: 15-30
              Math.max(6, 6 + Math.floor(Math.random() * 10)), // segments: 6-16
              1,                        // height segments
              false,                    // open ended
              0,                        // theta start
              Math.PI + Math.random() * Math.PI // theta length: π to 2π (wedge)
            );
            return createCleanShell(geom);
          })(),
          name: 'wedge-shell.stl'
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
      console.log('Starting standard STL export...', {
        fileName,
        hasGeometry: !!geometry,
        vertexCount: geometry?.attributes?.position?.count || 0
      });

      const { exportCurrentSTL } = await import('../lib/stlExporter');

      const exportFilename = customFilename ||
        (fileName ? fileName.replace(/\.[^/.]+$/, '_exported.stl') : 'exported_model.stl');

      console.log('Calling exportCurrentSTL with filename:', exportFilename);
      console.log('Geometry details:', {
        vertices: geometry.attributes.position.count,
        hasNormals: !!geometry.attributes.normal,
        boundingBox: geometry.boundingBox
      });

      exportCurrentSTL(geometry, exportFilename);

      console.log('Standard STL export completed successfully');

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

  const exportTriangles = useCallback(async (options: {
    partThickness?: number;
    scale?: number;
  } = {}) => {
    if (!geometry) {
      addError('No model available for triangle export');
      return;
    }

    try {
      console.log('Starting triangle export...', {
        fileName,
        hasGeometry: !!geometry,
        triangleCount: Math.floor(geometry.attributes.position.count / 3)
      });

      const exportFilename = fileName
        ? fileName.replace(/\.[^/.]+$/, '_assembly_kit.zip')
        : 'assembly_kit.zip';

      await TriangleExporter.exportTrianglesAsZip(geometry, exportFilename, options);

      console.log('Assembly kit export completed successfully');

      // Track export event
      try {
        const stats = TriangleExporter.getExportStats(geometry, options.partThickness || 2);
        analytics.trackEvent({
          event_name: 'assembly_kit_export',
          event_category: '3d_interaction',
          event_label: exportFilename,
          custom_parameters: {
            original_filename: fileName,
            export_filename: exportFilename,
            part_count: stats.triangleCount,
            part_thickness: options.partThickness || 2,
            estimated_print_time: stats.estimatedPrintTime,
            estimated_material: stats.estimatedMaterial,
            export_options: options
          }
        });
      } catch (analyticsError) {
        console.warn('Failed to track triangle export event:', analyticsError);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export triangles';
      addError(`Triangle export failed: ${errorMessage}`);
      console.error('Triangle export error details:', error);
    }
  }, [geometry, fileName]);

  // STL Tool Methods
  const reducePoints = useCallback(async (reductionAmount: number, method: 'quadric_edge_collapse' | 'vertex_clustering' | 'adaptive' | 'random' = 'adaptive'): Promise<ToolOperationResult> => {
    if (!geometry) {
      return { success: false, message: 'No model available for mesh simplification' };
    }

    setIsProcessingTool(true);

    try {
      console.log('Starting professional mesh simplification...', { method, reductionAmount });

      const result = await STLManipulator.reducePoints(geometry, reductionAmount, method);

      // Update the geometry
      setGeometry(result.geometry);

      const message = `Mesh simplification (${method}) completed: Reduced from ${result.originalStats.vertices.toLocaleString()} to ${result.newStats.vertices.toLocaleString()} vertices (${(result.reductionAchieved * 100).toFixed(1)}% reduction)`;

      // Track tool usage
      try {
        analytics.trackEvent({
          event_name: 'mesh_simplification',
          event_category: 'stl_tools',
          custom_parameters: {
            original_vertices: result.originalStats.vertices,
            new_vertices: result.newStats.vertices,
            original_faces: result.originalStats.faces,
            new_faces: result.newStats.faces,
            target_reduction: reductionAmount,
            actual_reduction: result.reductionAchieved,
            method: method,
            processing_time: result.processingTime,
            quality_preserved: result.reductionAchieved > 0
          }
        });
      } catch (analyticsError) {
        console.warn('Failed to track simplification event:', analyticsError);
      }

      return {
        success: true,
        message,
        originalStats: result.originalStats,
        newStats: result.newStats,
        processingTime: result.processingTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to simplify mesh';
      addError(`Mesh simplification failed: ${errorMessage}`);
      console.error('Mesh simplification error:', error);
      return { success: false, message: errorMessage };
    } finally {
      setIsProcessingTool(false);
    }
  }, [geometry]);



  const getGeometryStats = useCallback(() => {
    if (!geometry) return null;
    return STLManipulator.getGeometryStats(geometry);
  }, [geometry]);

  const setHighlightedTriangle = useCallback((triangleIndex: number | null) => {
    setHighlightedTriangleState(triangleIndex);

    if (triangleIndex !== null && geometry) {
      const stats = STLManipulator.getTriangleStats(geometry, triangleIndex);
      setTriangleStats(stats);
    } else {
      setTriangleStats(null);
    }
  }, [geometry]);

  const value: STLContextType = {
    geometry,
    fileName,
    isLoading,
    error,
    errors,
    viewerSettings,
    toolMode,
    isProcessingTool,
    highlightedTriangle,
    triangleStats,
    loadSTLFromFile,
    loadDefaultSTL,
    updateViewerSettings,
    exportSTL,
    exportTriangles,
    clearError,
    clearErrorById,
    addError,
    setToolMode,
    reducePoints,
    getGeometryStats,
    setHighlightedTriangle
  };

  return (
    <STLContext.Provider value={value}>
      {children}
    </STLContext.Provider>
  );
};
