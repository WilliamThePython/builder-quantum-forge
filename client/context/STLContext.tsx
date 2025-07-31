import React, { createContext, useContext, useState, useCallback } from 'react';
import * as THREE from 'three';
import { analytics } from '../lib/analytics';
import { STLManipulator, STLToolMode, ToolOperationResult } from '../lib/stlManipulator';
import { TriangleExporter } from '../lib/triangleExporter';
import { PolygonPartsExporter } from '../lib/polygonPartsExporter';
import { PolygonGeometryBuilder } from '../lib/polygonGeometryBuilder';
import { PolygonFaceReconstructor } from '../lib/polygonFaceReconstructor';
import { STLGeometryValidator, ValidationReport } from '../lib/stlGeometryValidator';
import { ModelFileHandler, ProcessedModel } from '../lib/modelFileHandler';

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

  // Model data (dual format support)
  processedModel: any | null; // ProcessedModel from ModelFileHandler
  originalFormat: 'stl' | 'obj' | null;
  objString: string | null; // Always maintained for processing
  cleanupResults: any | null;

  // STL Tools
  toolMode: STLToolMode;
  isProcessingTool: boolean;

  // Highlighting
  highlightedTriangle: number | null;
  triangleStats: any;

  loadModelFromFile: (file: File) => Promise<void>; // Renamed to support both formats
  loadDefaultSTL: () => Promise<void>;
  updateViewerSettings: (settings: Partial<ViewerSettings>) => void;
  exportModel: (format: 'stl' | 'obj', customFilename?: string) => void; // Enhanced export
  exportParts: (format: 'stl' | 'obj', options?: any) => Promise<void>; // Enhanced parts export
  clearError: () => void;
  clearErrorById: (id: string) => void;
  addError: (message: string) => void;

  // STL Tool Methods
  setToolMode: (mode: STLToolMode) => void;
  reducePoints: (reductionAmount: number, method: 'quadric_edge_collapse' | 'vertex_clustering' | 'adaptive' | 'random') => Promise<ToolOperationResult>;
  getGeometryStats: () => any;
  getDetailedGeometryStats: () => any;
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

// Helper function to ensure geometries display as solid objects
const ensureSolidObjectDisplay = (geometry: THREE.BufferGeometry) => {
  console.log('🔧 Ensuring solid object display...');

  // First, compute basic vertex normals
  geometry.computeVertexNormals();

  // Check if we need to flip faces by examining face normals
  const positions = geometry.attributes.position.array;
  const normals = geometry.attributes.normal.array;

  // Count how many normals point inward vs outward
  let inwardCount = 0;
  let outwardCount = 0;

  const center = new THREE.Vector3();
  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    geometry.boundingBox.getCenter(center);
  }

  // Sample some vertices to determine overall normal orientation
  const sampleCount = Math.min(300, positions.length / 3); // Sample every few vertices
  for (let i = 0; i < sampleCount; i++) {
    const vertexIndex = Math.floor((i / sampleCount) * (positions.length / 3)) * 3;

    const vertexPos = new THREE.Vector3(
      positions[vertexIndex],
      positions[vertexIndex + 1],
      positions[vertexIndex + 2]
    );

    const vertexNormal = new THREE.Vector3(
      normals[vertexIndex],
      normals[vertexIndex + 1],
      normals[vertexIndex + 2]
    );

    // Vector from center to vertex
    const centerToVertex = vertexPos.clone().sub(center).normalize();

    // If normal and center-to-vertex point in same direction, normal is outward
    if (centerToVertex.dot(vertexNormal) > 0) {
      outwardCount++;
    } else {
      inwardCount++;
    }
  }

  console.log(`🔍 Normal analysis: ${outwardCount} outward, ${inwardCount} inward`);

  // If more normals point inward, flip all faces
  if (inwardCount > outwardCount) {
    console.log('🔄 Flipping face winding for correct display');

    // Flip indices to reverse winding order
    const indices = geometry.index;
    if (indices) {
      const indexArray = indices.array;
      for (let i = 0; i < indexArray.length; i += 3) {
        // Swap second and third vertices to flip winding
        const temp = indexArray[i + 1];
        indexArray[i + 1] = indexArray[i + 2];
        indexArray[i + 2] = temp;
      }
      indices.needsUpdate = true;
    } else {
      // Non-indexed geometry - swap position attributes
      const posArray = new Float32Array(positions);
      for (let i = 0; i < posArray.length; i += 9) {
        // Swap vertices 1 and 2 of each triangle
        for (let j = 0; j < 3; j++) {
          const temp = posArray[i + 3 + j];
          posArray[i + 3 + j] = posArray[i + 6 + j];
          posArray[i + 6 + j] = temp;
        }
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
    }

    // Recompute normals after flipping
    geometry.computeVertexNormals();
  }

  // Ensure proper material-side settings will be respected
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  console.log('✅ Solid object display ensured');
};

export const STLProvider: React.FC<STLProviderProps> = ({ children }) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(defaultViewerSettings);

  // Dual format support state
  const [processedModel, setProcessedModel] = useState<ProcessedModel | null>(null);
  const [originalFormat, setOriginalFormat] = useState<'stl' | 'obj' | null>(null);
  const [objString, setObjString] = useState<string | null>(null);
  const [cleanupResults, setCleanupResults] = useState<any | null>(null);

  // STL Tools state
  const [toolMode, setToolMode] = useState<STLToolMode>(STLToolMode.Highlight);
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

      // Ensure solid object appearance with proper face normals
      ensureSolidObjectDisplay(geometry);

      // Reconstruct polygon faces from triangulated STL
      console.log('Reconstructing polygon faces from uploaded STL...');
      const reconstructedFaces = PolygonFaceReconstructor.reconstructPolygonFaces(geometry);
      if (reconstructedFaces.length > 0) {
        PolygonFaceReconstructor.applyReconstructedFaces(geometry, reconstructedFaces);
        console.log(`Successfully reconstructed ${reconstructedFaces.length} polygon faces`);
      }

      // Validate geometry for printing accuracy issues
      console.log('Validating STL geometry for parts export accuracy...');
      const validationReport = STLGeometryValidator.validateGeometry(geometry);

      // Display validation results
      if (!validationReport.isValid || validationReport.warnings.length > 0) {
        const summary = STLGeometryValidator.generateValidationSummary(validationReport);
        console.log('STL Validation Report:\n', summary);

        // Show critical issues as errors
        if (!validationReport.isValid) {
          const criticalIssues = validationReport.issues.map(issue => issue.message).join(', ');
          addError(`STL validation failed: ${criticalIssues}`);
        }

        // Show warnings as separate messages
        validationReport.warnings.forEach(warning => {
          console.warn(`STL Warning: ${warning.message} - ${warning.details}`);
        });

        if (validationReport.stats.zeroAreaFaces > 0) {
          addError(`Found ${validationReport.stats.zeroAreaFaces} zero-area faces that will cause parts export issues`);
        }
      } else {
        console.log('✅ STL validation passed - ready for accurate parts export');
      }

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
      // Create polygon-based geometries with higher-order faces
      const geometryOptions = [
        // Cube with 6 quadrilateral faces
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createBoxWithQuads(20, 20, 20)
          ),
          name: 'cube-polygon.stl'
        },

        // Irregular rectangular prisms with quadrilateral faces
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createBoxWithQuads(
              5 + Math.random() * 30,   // width: 5-35
              8 + Math.random() * 20,   // height: 8-28
              12 + Math.random() * 25   // depth: 12-37
            )
          ),
          name: 'irregular-prism-1.stl'
        },
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createBoxWithQuads(
              15 + Math.random() * 15,  // width: 15-30
              3 + Math.random() * 40,   // height: 3-43
              6 + Math.random() * 18    // depth: 6-24
            )
          ),
          name: 'irregular-prism-2.stl'
        },
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createBoxWithQuads(
              25 + Math.random() * 10,  // width: 25-35
              20 + Math.random() * 5,   // height: 20-25
              2 + Math.random() * 35    // depth: 2-37
            )
          ),
          name: 'irregular-prism-3.stl'
        },

        // Triangular prisms with triangular ends and rectangular sides
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createTriangularPrism(12, 25)
          ),
          name: 'triangular-prism.stl'
        },
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createTriangularPrism(
              8 + Math.random() * 12,   // radius: 8-20
              15 + Math.random() * 20   // height: 15-35
            )
          ),
          name: 'irregular-triangular-prism.stl'
        },

        // Cylinders with circular ends and rectangular sides
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createCylinderWithPolygons(12, 12, 25, 8)
          ),
          name: 'octagonal-cylinder.stl'
        },
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createCylinderWithPolygons(
              8 + Math.random() * 12,   // top radius: 8-20
              12 + Math.random() * 8,   // bottom radius: 12-20
              15 + Math.random() * 20,  // height: 15-35
              6 + Math.floor(Math.random() * 10) // segments: 6-16
            )
          ),
          name: 'irregular-cylinder.stl'
        },

        // Cones with circular base and triangular sides
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createConeWithPolygons(15, 25, 8)
          ),
          name: 'octagonal-cone.stl'
        },
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createConeWithPolygons(
              8 + Math.random() * 15,   // radius: 8-23
              20 + Math.random() * 20,  // height: 20-40
              6 + Math.floor(Math.random() * 10) // segments: 6-16
            )
          ),
          name: 'irregular-cone.stl'
        },

        // Hexagonal prisms
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createCylinderWithPolygons(15, 15, 20, 6)
          ),
          name: 'hexagonal-prism.stl'
        },

        // Pentagonal prisms
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createCylinderWithPolygons(12, 12, 18, 5)
          ),
          name: 'pentagonal-prism.stl'
        },

        // Truncated pyramids (frustums)
        {
          geometry: PolygonGeometryBuilder.toBufferGeometry(
            PolygonGeometryBuilder.createCylinderWithPolygons(
              5 + Math.random() * 8,    // top radius: 5-13
              12 + Math.random() * 8,   // bottom radius: 12-20
              15 + Math.random() * 15,  // height: 15-30
              4 + Math.floor(Math.random() * 4) // segments: 4-8
            )
          ),
          name: 'truncated-pyramid.stl'
        },

        // Rotated prisms for variety
        {
          geometry: (() => {
            const geom = PolygonGeometryBuilder.toBufferGeometry(
              PolygonGeometryBuilder.createBoxWithQuads(
                12 + Math.random() * 16,
                18 + Math.random() * 12,
                8 + Math.random() * 20
              )
            );
            // Apply rotation
            geom.rotateX((Math.random() - 0.5) * Math.PI * 0.25);
            geom.rotateY((Math.random() - 0.5) * Math.PI * 0.25);
            geom.rotateZ((Math.random() - 0.5) * Math.PI * 0.25);
            return geom;
          })(),
          name: 'rotated-prism.stl'
        }
      ];

      // Randomly select a geometry
      const randomIndex = Math.floor(Math.random() * geometryOptions.length);
      const selected = geometryOptions[randomIndex];

      // Ensure solid object appearance with proper face normals
      ensureSolidObjectDisplay(selected.geometry);

      // Validate the generated geometry
      const validationReport = STLGeometryValidator.validateGeometry(selected.geometry);
      if (!validationReport.isValid) {
        console.warn('Generated geometry has validation issues:', validationReport);
        // Still proceed but log the issues
        validationReport.issues.forEach(issue => {
          console.warn(`Generated geometry issue: ${issue.message}`);
        });
      }

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

  const exportParts = useCallback(async (options: {
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

      await PolygonPartsExporter.exportPartsAsZip(geometry, exportFilename, options);

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

  const getDetailedGeometryStats = useCallback(() => {
    if (!geometry) return null;
    return STLManipulator.getDetailedGeometryStats(geometry);
  }, [geometry]);

  const setHighlightedTriangle = useCallback((faceIndex: number | null) => {
    setHighlightedTriangleState(faceIndex);

    if (faceIndex !== null && geometry) {
      const polygonFaces = (geometry as any).polygonFaces;

      if (polygonFaces && Array.isArray(polygonFaces)) {
        // Use polygon face stats for polygon-based geometries
        const stats = STLManipulator.getPolygonFaceStats(geometry, faceIndex);
        setTriangleStats(stats);
      } else {
        // Fallback to triangle stats for non-polygon geometries
        const stats = STLManipulator.getTriangleStats(geometry, faceIndex);
        setTriangleStats(stats);
      }
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
    exportParts,
    clearError,
    clearErrorById,
    addError,
    setToolMode,
    reducePoints,
    getGeometryStats,
    getDetailedGeometryStats,
    setHighlightedTriangle
  };

  return (
    <STLContext.Provider value={value}>
      {children}
    </STLContext.Provider>
  );
};
