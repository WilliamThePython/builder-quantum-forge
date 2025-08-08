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
import { ModelCache } from '../lib/modelCache';
import { getTestFileSizeData } from '../lib/fileSizeEstimator';
import { OBJConverter } from '../lib/objConverter';
import { computeFlatNormals } from '../lib/flatNormals';
import { prepareGeometryForViewing } from '../lib/geometryPreparer';
import { convertToNonIndexedForFlatColors } from '../lib/flatGeometry';
import { validateAndFixGeometry, hasNaNValues, logGeometryStats } from '../lib/geometryValidator';

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
  loadingProgress: {
    percentage: number;
    stage: string;
    details: string;
  };
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

  // Decimation Painter Mode
  decimationPainterMode: boolean;
  setDecimationPainterMode: (enabled: boolean) => void;
  isDecimating: boolean; // Track when decimation is in progress
  decimateEdge: (vertexIndex1: number, vertexIndex2: number) => Promise<ToolOperationResult>;

  loadModelFromFile: (file: File) => Promise<void>; // Renamed to support both formats
  loadDefaultSTL: () => Promise<void>;
  updateViewerSettings: (settings: Partial<ViewerSettings>) => void;
  exportSTL: (customFilename?: string) => void;
  exportOBJ: (customFilename?: string) => void;
  exportParts: (options?: { format?: 'stl' | 'obj'; partThickness?: number; scale?: number }) => Promise<void>;
  clearError: () => void;
  clearErrorById: (id: string) => void;
  addError: (message: string) => void;

  // STL Tool Methods
  setToolMode: (mode: STLToolMode) => void;
  reducePoints: (reductionAmount: number, method: 'quadric_edge_collapse' | 'vertex_clustering' | 'adaptive' | 'random') => Promise<ToolOperationResult>;
  getGeometryStats: () => any;
  getDetailedGeometryStats: () => any;
  setHighlightedTriangle: (triangleIndex: number | null) => void;

  // Backup and restore functionality
  hasBackup: boolean;
  createBackup: () => void;
  restoreFromBackup: () => void;
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
    // More detailed error with stack trace for debugging
    console.error('useSTL called outside of STLProvider. Stack trace:', new Error().stack);
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
  console.log('��� Ensuring solid object display...');

  // Use flat normals to maintain crisp face shading instead of smooth blending
  computeFlatNormals(geometry);

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

    // Use flat normals to maintain crisp face shading
    computeFlatNormals(geometry);
  }

  // Ensure proper material-side settings will be respected
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  console.log('✅ Solid object display ensured');
};

// Helper function to ensure geometry is properly indexed
const ensureIndexedGeometry = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  console.log('🔧 Ensuring geometry has proper indexing...');

  if (geometry.index) {
    console.log('✅ Geometry already has indices');
    return geometry;
  }

  const positions = geometry.attributes.position.array as Float32Array;
  const vertexMap = new Map<string, number>();
  const newPositions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

    let index = vertexMap.get(key);
    if (index === undefined) {
      index = newPositions.length / 3;
      vertexMap.set(key, index);
      newPositions.push(x, y, z);
    }

    indices.push(index);
  }

  const indexedGeometry = new THREE.BufferGeometry();
  indexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  indexedGeometry.setIndex(indices);

  // Copy other attributes if they exist
  if (geometry.attributes.normal) {
    indexedGeometry.setAttribute('normal', geometry.attributes.normal);
  }
  if (geometry.attributes.uv) {
    indexedGeometry.setAttribute('uv', geometry.attributes.uv);
  }

  // Copy metadata if it exists
  if ((geometry as any).polygonFaces) {
    (indexedGeometry as any).polygonFaces = (geometry as any).polygonFaces;
  }
  if ((geometry as any).polygonType) {
    (indexedGeometry as any).polygonType = (geometry as any).polygonType;
  }

  console.log(`✅ Created indexed geometry: ${newPositions.length / 3} unique vertices, ${indices.length / 3} faces`);
  return indexedGeometry;
};

// Helper function to parse OBJ polygon faces
const parseOBJPolygonFaces = (objString: string): any[] => {
  console.log('🔧 Parsing OBJ polygon faces...');

  const polygonFaces: any[] = [];
  const vertices: THREE.Vector3[] = [];
  const lines = objString.split('\n');

  // First pass: collect vertices
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 4) {
        vertices.push(new THREE.Vector3(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3])
        ));
      }
    }
  }

  // Second pass: collect faces
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('f ')) {
      const parts = trimmed.split(/\s+/).slice(1);

      if (parts.length >= 3) {
        const faceVertices = parts.map(part => {
          const indices = part.split('/');
          const vertexIndex = parseInt(indices[0]) - 1; // Convert to 0-based
          return vertices[vertexIndex];
        }).filter(v => v !== undefined);

        if (faceVertices.length >= 3) {
          // Calculate face normal
          const edge1 = new THREE.Vector3().subVectors(faceVertices[1], faceVertices[0]);
          const edge2 = new THREE.Vector3().subVectors(faceVertices[2], faceVertices[0]);
          const normal = edge1.cross(edge2).normalize();

          polygonFaces.push({
            originalVertices: faceVertices,
            vertices: faceVertices.map((_, idx) => ({ index: idx })), // Placeholder indices
            type: faceVertices.length === 3 ? 'triangle' :
                  faceVertices.length === 4 ? 'quad' :
                  faceVertices.length === 5 ? 'pentagon' :
                  faceVertices.length === 6 ? 'hexagon' : 'polygon',
            normal: normal
          });
        }
      }
    }
  }

  console.log(`✅ Parsed ${polygonFaces.length} polygon faces from OBJ`);
  return polygonFaces;
};

export const STLProvider: React.FC<STLProviderProps> = ({ children }) => {
  // Dual geometry storage approach:
  // - indexedGeometry: Used for operations like decimation (efficient)
  // - geometry: Non-indexed version used for viewing (flat colors)
  const [indexedGeometry, setIndexedGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(defaultViewerSettings);

  // Loading progress state
  const [loadingProgress, setLoadingProgress] = useState({
    percentage: 0,
    stage: '',
    details: ''
  });

  // Dual format support state
  const [processedModel, setProcessedModel] = useState<ProcessedModel | null>(null);
  const [originalFormat, setOriginalFormat] = useState<'stl' | 'obj' | null>(null);
  const [objString, setObjString] = useState<string | null>(null);
  const [cleanupResults, setCleanupResults] = useState<any | null>(null);

  // Backup state for undo functionality (store indexed geometry for operations)
  const [backupIndexedGeometry, setBackupIndexedGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [backupProcessedModel, setBackupProcessedModel] = useState<ProcessedModel | null>(null);
  const [hasBackup, setHasBackup] = useState(false);

  // STL Tools state
  const [toolMode, setToolMode] = useState<STLToolMode>(STLToolMode.Highlight);
  const [isProcessingTool, setIsProcessingTool] = useState(false);

  // Highlighting state
  const [highlightedTriangle, setHighlightedTriangleState] = useState<number | null>(null);
  const [triangleStats, setTriangleStats] = useState<any>(null);

  // Decimation Painter Mode state
  const [decimationPainterMode, setDecimationPainterMode] = useState<boolean>(false);
  const [isDecimating, setIsDecimating] = useState<boolean>(false);

  // Helper function to update loading progress
  const updateProgress = (percentage: number, stage: string, details: string = '') => {
    console.log(`📊 Progress: ${percentage}% - ${stage} - ${details}`);
    setLoadingProgress({ percentage, stage, details });
    // Force a small delay to ensure UI updates are visible
    return new Promise(resolve => setTimeout(resolve, 50));
  };

  // Helper function to set both indexed and non-indexed geometries
  const setDualGeometry = (newIndexedGeometry: THREE.BufferGeometry) => {
    // Quick validation
    if (hasNaNValues(newIndexedGeometry)) {
      console.error('🚨 setDualGeometry received geometry with NaN values!');
      return;
    }

    setIndexedGeometry(newIndexedGeometry);
    const nonIndexedGeometry = convertToNonIndexedForViewing(newIndexedGeometry);
    setGeometry(nonIndexedGeometry);
  };

  // Helper function to convert indexed geometry to non-indexed for viewing
  // CRITICAL: Maintains polygon grouping for proper face coloring
  const convertToNonIndexedForViewing = (indexedGeom: THREE.BufferGeometry): THREE.BufferGeometry => {
    console.log('��� === POLYGON-AWARE NON-INDEXED CONVERSION ===');

    if (!indexedGeom.index) {
      // Already non-indexed, just prepare for viewing
      console.log('   ✅ Already non-indexed, preparing for viewing...');
      return prepareGeometryForViewing(indexedGeom, 'initial_load');
    }

    const indices = indexedGeom.index.array;
    const positions = indexedGeom.attributes.position.array as Float32Array;
    const polygonFaces = (indexedGeom as any).polygonFaces;

    console.log('   📊 Input:', {
      indexedVertices: positions.length / 3,
      indexedTriangles: indices.length / 3,
      polygonFaces: polygonFaces ? polygonFaces.length : 'none'
    });

    // Create new non-indexed arrays
    const newPositions: number[] = [];
    const newPolygonFaces: any[] = [];

    if (polygonFaces && Array.isArray(polygonFaces)) {
      console.log('   🔧 POLYGON-AWARE conversion: Preserving polygon grouping...');

      let triangleOffset = 0;

      // Process each polygon face to maintain grouping
      for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
        const face = polygonFaces[faceIndex];
        const triangleCount = getTriangleCountForPolygon(face);

        // Convert triangles for this polygon face
        const startTriangleIndex = triangleOffset;
        for (let t = 0; t < triangleCount; t++) {
          const triangleIndexStart = (triangleOffset + t) * 3;
          const a = indices[triangleIndexStart];
          const b = indices[triangleIndexStart + 1];
          const c = indices[triangleIndexStart + 2];

          // Copy vertex positions
          newPositions.push(
            positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
            positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
            positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]
          );
        }

        // Create updated polygon face info for non-indexed geometry
        const newFace = {
          type: face.type,
          startVertex: startTriangleIndex * 3, // 3 vertices per triangle
          endVertex: (startTriangleIndex + triangleCount) * 3 - 1,
          originalVertices: face.originalVertices,
          normal: face.normal,
          triangleCount: triangleCount
        };

        newPolygonFaces.push(newFace);
        triangleOffset += triangleCount;
      }

      console.log('   ✅ Polygon grouping preserved:', {
        originalPolygons: polygonFaces.length,
        newPolygons: newPolygonFaces.length,
        totalTriangles: triangleOffset
      });
    } else {
      console.log('   ⚠️ No polygon faces - falling back to triangle duplication');

      // Fallback: Just duplicate vertices for each triangle
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];

        newPositions.push(
          positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2],
          positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2],
          positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]
        );
      }
    }

    // Create new non-indexed geometry
    const nonIndexedGeometry = new THREE.BufferGeometry();
    nonIndexedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));

    // Apply updated polygon metadata for non-indexed structure
    if (newPolygonFaces.length > 0) {
      (nonIndexedGeometry as any).polygonFaces = newPolygonFaces;
      console.log('   ✅ Updated polygon faces for non-indexed geometry');
    }
    if ((indexedGeom as any).polygonType) {
      (nonIndexedGeometry as any).polygonType = (indexedGeom as any).polygonType;
    }

    console.log('   📊 Output:', {
      nonIndexedVertices: newPositions.length / 3,
      nonIndexedTriangles: newPositions.length / 9,
      polygonFaces: newPolygonFaces.length
    });

    // Prepare for viewing (flat normals, etc.)
    const prepared = prepareGeometryForViewing(nonIndexedGeometry, 'initial_load');

    // Validate the converted geometry
    const validatedGeometry = validateAndFixGeometry(prepared, 'non-indexed conversion output');

    console.log('✅ Polygon-aware non-indexed conversion complete');
    return validatedGeometry;
  };

  // Helper function to get triangle count for polygon
  const getTriangleCountForPolygon = (face: any): number => {
    if (!face.originalVertices) return 1;

    const vertexCount = face.originalVertices.length;
    return Math.max(1, vertexCount - 2); // Fan triangulation: n-2 triangles for n vertices
  };

  const loadModelFromFile = useCallback(async (file: File) => {
    console.log('🚀 === UNIFIED MODEL LOADING ===');
    console.log('loadModelFromFile called with:', file.name);
    setIsLoading(true);
    setError(null);
    updateProgress(0, 'Starting', 'Initializing upload...');

    try {
      await updateProgress(5, 'Validating', `Checking ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

      // Enhanced file validation for both STL and OBJ
      const fileName = file.name.toLowerCase();
      const isSTL = fileName.endsWith('.stl');
      const isOBJ = fileName.endsWith('.obj');

      if (!isSTL && !isOBJ) {
        addError(`Invalid file format: "${file.name}". Please select a valid STL or OBJ file.`);
        return;
      }

      setOriginalFormat(isSTL ? 'stl' : 'obj');
      console.log(`📁 File format detected: ${isSTL ? 'STL' : 'OBJ'}`);

      await updateProgress(10, 'Validating', 'File format validated successfully...');

      // Smart file size limits - more generous for better user experience
      const maxSize = 40 * 1024 * 1024; // Increased to 40MB to handle larger models
      if (file.size > maxSize) {
        addError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size: 40MB`);
        return;
      }

      // Enhanced warnings for large files
      if (file.size > 15 * 1024 * 1024) {
        await updateProgress(8, 'Warning', 'Large file detected - this may take longer...');
        console.warn(`⚠️ Large file detected (${(file.size / 1024 / 1024).toFixed(1)}MB). Processing may take longer...`);
        addError(`Large file (${(file.size / 1024 / 1024).toFixed(1)}MB) - loading progress will be shown below. Consider using model reduction after loading.`);

        // Give UI time to update progress bar before heavy processing
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      updateProgress(15, 'Loading', `Preparing ${isSTL ? 'STL' : 'OBJ'} loader...`);

      const uploadStartTime = Date.now();
      updateProgress(20, 'Reading', `Reading ${(file.size / 1024 / 1024).toFixed(1)}MB file...`);

      let geometry: THREE.BufferGeometry;

      if (isSTL) {
        const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader');
        const loader = new STLLoader();

        // Load file with timeout for large files
        const fileSize = file.size;
        const isLargeFile = fileSize > 10 * 1024 * 1024; // 10MB threshold
        const timeoutMs = isLargeFile ? 30000 : 10000; // 30s for large files, 10s for smaller


        updateProgress(25, 'Reading', `Loading ${(fileSize / 1024 / 1024).toFixed(1)}MB into memory...`);

        // Load with timeout protection
        const arrayBuffer = await Promise.race([
          file.arrayBuffer(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`File loading timeout after ${timeoutMs/1000}s`)), timeoutMs)
          )
        ]);

        updateProgress(35, 'Parsing', 'Processing STL geometry...');

        // Analyze STL file content before parsing
        const dataView = new DataView(arrayBuffer);

        // Check if it's binary or ASCII STL
        const header = new TextDecoder().decode(arrayBuffer.slice(0, 80));
        const isBinary = !header.toLowerCase().includes('solid');


        if (isBinary && fileSize >= 84) {
          const triangleCount = dataView.getUint32(80, true); // little endian
          const expectedSize = 80 + 4 + (triangleCount * 50); // header + count + triangles

          if (Math.abs(expectedSize - fileSize) > 2) {
          }

          // For very large files, warn about potential memory issues
          if (triangleCount > 1000000) {
            updateProgress(38, 'Parsing', `Processing ${triangleCount.toLocaleString()} triangles...`);
          }
        }

        try {
          // Parse with timeout and progress updates for large files
          if (isLargeFile) {
            updateProgress(40, 'Parsing', 'Processing large STL file (this may take up to 30 seconds)...');

            geometry = await Promise.race([
              // Wrap synchronous parsing in Promise to add timeout
              new Promise<THREE.BufferGeometry>((resolve, reject) => {
                try {
                  // Use setTimeout to break up the parsing and allow progress updates
                  setTimeout(() => {
                    try {
                      const result = loader.parse(arrayBuffer);
                      resolve(result);
                    } catch (parseErr) {
                      reject(parseErr);
                    }
                  }, 100);
                } catch (err) {
                  reject(err);
                }
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`STL parsing timeout after ${timeoutMs/1000}s - file may be too complex`)), timeoutMs)
              )
            ]);
          } else {
            // Normal parsing for smaller files
            geometry = loader.parse(arrayBuffer);
          }

          console.log('STL loaded successfully');

          // Quick validation of STL loader output
          const rawPositions = geometry.attributes.position.array;
          let nanCount = 0;
          let infCount = 0;

          for (let i = 0; i < rawPositions.length; i++) {
            const val = rawPositions[i];
            if (isNaN(val)) nanCount++;
            else if (!isFinite(val)) infCount++;
          }

          // Only log if there are issues
          if (nanCount > 0 || infCount > 0) {
            console.error(`🚨 STL loader issues: ${nanCount} NaN, ${infCount} infinite values`);

            if (nanCount > rawPositions.length * 0.1) {
              throw new Error(`STL file "${file.name}" appears to be corrupted`);
            }

            // Fix invalid values
            for (let i = 0; i < rawPositions.length; i++) {
              if (isNaN(rawPositions[i])) rawPositions[i] = 0;
              else if (!isFinite(rawPositions[i])) rawPositions[i] = rawPositions[i] > 0 ? 1000 : -1000;
            }

            geometry.attributes.position.needsUpdate = true;
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
          }

        } catch (parseError) {

          // Check available memory and provide helpful error message
          const memoryInfo = (performance as any).memory;
          const memoryContext = memoryInfo ?
            ` (Memory: ${(memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(0)}MB used, ${(memoryInfo.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB limit)` :
            '';

          if (parseError instanceof Error && parseError.message.includes('timeout')) {
            throw new Error(`STL file too complex to parse: ${parseError.message}. Try a smaller file or simpler geometry.${memoryContext}`);
          } else if (isLargeFile) {
            throw new Error(`Failed to parse large STL file (${(fileSize / 1024 / 1024).toFixed(1)}MB): ${parseError instanceof Error ? parseError.message : 'Memory or complexity limit exceeded'}. Try reducing file size or simplifying geometry.${memoryContext}`);
          } else {
            throw new Error(`Failed to parse STL file: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}${memoryContext}`);
          }
        }
      } else {
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader');
        const loader = new OBJLoader();

        const fileSize = file.size;
        const isLargeFile = fileSize > 10 * 1024 * 1024; // 10MB threshold
        const timeoutMs = isLargeFile ? 30000 : 10000;


        updateProgress(25, 'Reading', `Loading ${(fileSize / 1024 / 1024).toFixed(1)}MB OBJ file...`);

        // Load with timeout protection
        const text = await Promise.race([
          file.text(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`OBJ file loading timeout after ${timeoutMs/1000}s`)), timeoutMs)
          )
        ]);

        updateProgress(35, 'Parsing', 'Processing OBJ geometry...');

        try {
          let object;
          if (isLargeFile) {
            updateProgress(40, 'Parsing', 'Processing large OBJ file (this may take up to 30 seconds)...');

            object = await Promise.race([
              new Promise<any>((resolve, reject) => {
                setTimeout(() => {
                  try {
                    const result = loader.parse(text);
                    resolve(result);
                  } catch (parseErr) {
                    reject(parseErr);
                  }
                }, 100);
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`OBJ parsing timeout after ${timeoutMs/1000}s - file may be too complex`)), timeoutMs)
              )
            ]);
          } else {
            object = loader.parse(text);
          }

          // Extract and merge geometries from OBJ
          let mergedGeometry: THREE.BufferGeometry | null = null;
          object.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry) {
              if (!mergedGeometry) {
                mergedGeometry = child.geometry.clone();
              } else {
                // For multiple meshes, we need to merge them properly
                const tempGeometry = mergedGeometry.clone();
                // Note: Three.js merge method deprecated, using manual merge
              }
            }
          });

          if (!mergedGeometry) {
            throw new Error('No valid mesh found in OBJ file');
          }

          geometry = mergedGeometry;

          // CRITICAL: Ensure OBJ files have proper indexing
          if (!geometry.index) {
            console.log('🔧 Converting OBJ to indexed geometry for consistent decimation...');
            geometry = ensureIndexedGeometry(geometry);
          }

          // Store OBJ string for internal processing
          setObjString(text);
          console.log('OBJ loaded successfully');
        } catch (parseError) {

          // Check available memory and provide helpful error message
          const memoryInfo = (performance as any).memory;
          const memoryContext = memoryInfo ?
            ` (Memory: ${(memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(0)}MB used, ${(memoryInfo.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}MB limit)` :
            '';

          if (parseError instanceof Error && parseError.message.includes('timeout')) {
            throw new Error(`OBJ file too complex to parse: ${parseError.message}. Try a smaller file or simpler geometry.${memoryContext}`);
          } else if (isLargeFile) {
            throw new Error(`Failed to parse large OBJ file (${(fileSize / 1024 / 1024).toFixed(1)}MB): ${parseError instanceof Error ? parseError.message : 'Memory or complexity limit exceeded'}. Try reducing file size or simplifying geometry.${memoryContext}`);
          } else {
            throw new Error(`Failed to parse OBJ file: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}${memoryContext}`);
          }
        }
      }

      // Validate parsed geometry
      if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
        throw new Error('STL file contains no valid geometry data');
      }

      // Check vertex count for performance implications
      const vertexCount = geometry.attributes.position.count;
      const triangleCount = Math.floor(vertexCount / 3);

      updateProgress(50, 'Analyzing', `${(vertexCount / 1000).toFixed(0)}K vertices, ${(triangleCount / 1000).toFixed(0)}K triangles`);

      // Handle extremely high-poly models
      const maxRecommendedVertices = 500000; // 500K vertices for smooth performance
      const maxAbsoluteVertices = 2000000; // 2M vertices absolute limit

      if (vertexCount > maxAbsoluteVertices) {
        throw new Error(`Model too complex (${vertexCount.toLocaleString()} vertices). Maximum supported: ${maxAbsoluteVertices.toLocaleString()} vertices. Please use a mesh decimation tool to reduce complexity.`);
      }

      if (vertexCount > maxRecommendedVertices) {
        addError(`High-poly model (${(vertexCount / 1000).toFixed(0)}K vertices). Performance may be impacted. Use "3. REDUCE MODEL" after loading for better performance.`);

        // Add a short delay to prevent UI freezing during processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      updateProgress(60, 'Processing', 'Centering and scaling geometry...');
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

      // Validate geometry after scaling operations
      geometry = validateAndFixGeometry(geometry, 'after centering and scaling');

      updateProgress(70, 'Optimizing', 'Ensuring geometry is indexed for operations...');

      // Debug: Log geometry state before indexing
      console.log('🔍 BEFORE INDEXING:', {
        hasIndex: !!geometry.index,
        vertices: geometry.attributes.position.count,
        triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
        hasNormals: !!geometry.attributes.normal,
        boundingBox: geometry.boundingBox
      });

      // TEMPORARILY DISABLED: Skip indexing for STL files to debug cow loading issue
      console.log('🚨 TEMPORARILY DISABLED: Skipping indexing for STL files to test cow loading');

      // CRITICAL: Ensure geometry is indexed for efficient operations like decimation
      // if (!geometry.index) {
      //   console.log('🔧 Converting STL to indexed geometry for efficient operations...');
      //   const beforeGeometry = geometry.clone(); // Keep a backup for debugging
      //   geometry = ensureIndexedGeometry(geometry);
      //
      //   // Debug: Log geometry state after indexing
      //   console.log('🔍 AFTER INDEXING:', {
      //     hasIndex: !!geometry.index,
      //     vertices: geometry.attributes.position.count,
      //     triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
      //     hasNormals: !!geometry.attributes.normal,
      //     boundingBox: geometry.boundingBox
      //   });
      //
      //   // Sanity check: ensure indexing didn't break the geometry
      //   if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
      //     console.error('🚨 INDEXING BROKE THE GEOMETRY! Reverting...');
      //     geometry = beforeGeometry;
      //   }
      // }

      // Prepare geometry for viewing
      const preparedGeometry = prepareGeometryForViewing(geometry, 'initial_load');
      geometry = preparedGeometry;

      // Final validation before polygon reconstruction
      geometry = validateAndFixGeometry(geometry, 'before polygon reconstruction');

      updateProgress(75, 'Reconstructing', 'Analyzing polygon faces...');

      // Different polygon handling for STL vs OBJ
      if (isSTL) {
        // STL files need polygon reconstruction from triangulation
        if (vertexCount < 100000) {
          try {
            const reconstructionStart = Date.now();
            const reconstructedFaces = PolygonFaceReconstructor.reconstructPolygonFaces(geometry);
            const reconstructionTime = Date.now() - reconstructionStart;

            if (reconstructedFaces.length > 0) {
              PolygonFaceReconstructor.applyReconstructedFaces(geometry, reconstructedFaces);
            }
          } catch (reconstructionError) {
          }
        } else {
          console.log('⏭️ Skipping polygon reconstruction for high-poly model (performance optimization)');
          addError('Polygon reconstruction skipped for high-poly model. Use "3. REDUCE MODEL" first for polygon-based features.');
        }
      } else {
        // OBJ files should preserve their original polygon structure
        console.log('🔍 Preserving original OBJ polygon structure...');
        try {
          // Convert OBJ string to proper polygon faces if not already done
          const objString = await file.text();
          const polygonFaces = parseOBJPolygonFaces(objString);
          if (polygonFaces.length > 0) {
            (geometry as any).polygonFaces = polygonFaces;
            (geometry as any).polygonType = 'obj_preserved';
            (geometry as any).isPolygonPreserved = true;
            console.log(`✅ Preserved ${polygonFaces.length} original OBJ polygon faces`);
          }
        } catch (objError) {
          console.warn('⚠️ Failed to preserve OBJ polygon structure:', objError);
        }
      }

      updateProgress(85, 'Validating', 'Checking geometry quality...');
      // Optimized validation for large models
      let validationReport;
      if (vertexCount < 200000) {
        validationReport = STLGeometryValidator.validateGeometry(geometry);
      } else {
        console.log('��️ Skipping intensive validation for high-poly model');
        // Create a minimal validation report for large models
        validationReport = {
          isValid: true,
          issues: [],
          warnings: [],
          stats: { zeroAreaFaces: 0 }
        };
        addError('Full validation skipped for high-poly model to prevent freezing.');
      }

      // Display only critical validation results (no console spam)
      if (!validationReport.isValid) {
        const criticalIssues = validationReport.issues.map(issue => issue.message).join(', ');
        addError(`STL validation failed: ${criticalIssues}`);
      }

      if (validationReport.stats.zeroAreaFaces > 0) {
        addError(`Found ${validationReport.stats.zeroAreaFaces} zero-area faces that will cause parts export issues`);
      }

      const uploadTime = Date.now() - uploadStartTime;
      const vertices = geometry.attributes.position?.count || 0;
      const triangles = Math.floor(vertices / 3);

      updateProgress(95, 'Finalizing', 'Setting up model for viewing...');

      // Final validation before dual geometry setup
      geometry = validateAndFixGeometry(geometry, 'final validation before dual setup');

      // Geometry ready for dual setup

      // Set up dual geometry storage (indexed for operations, non-indexed for viewing)
      setDualGeometry(geometry);
      setFileName(file.name);

      updateProgress(100, 'Complete', 'Model loaded successfully!');

      // Track STL upload analytics
      try {
        analytics.trackSTLUpload({
          file_name: file.name,
          file_size: file.size,
          vertices: vertices,
          triangles: triangles,
          upload_time: uploadTime
        });
        // Analytics tracking
      } catch (error) {
        // Analytics failed silently
      }

      console.log('Loading completed successfully');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load STL file';
      addError(errorMessage);
      console.error('STL loading error details:', {
        error: err,
        message: errorMessage,
        fileName: file?.name || 'unknown'
      });
    } finally {
      // Keep loading state for a moment to show completion
      setTimeout(() => {
        setIsLoading(false);
        // Reset progress after showing completion
        setTimeout(() => {
          setLoadingProgress({ percentage: 0, stage: '', details: '' });
        }, 1000);
      }, 500);
    }
  }, []);

  const loadDefaultSTL = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress({ percentage: 0, stage: 'Loading model...', details: 'Selecting random model' });

    try {

      // Create a list of working models - gradually adding more complex shapes
      const workingModels = [
        // Basic rectangular shapes (known to work)
        {
          name: 'cube.stl',
          generator: () => PolygonGeometryBuilder.createBoxWithQuads(20, 20, 20),
          description: 'Simple cube with 6 quad faces'
        },
        {
          name: 'wide-block.stl',
          generator: () => PolygonGeometryBuilder.createBoxWithQuads(35, 12, 20),
          description: 'Wide rectangular block'
        },
        {
          name: 'tall-tower.stl',
          generator: () => PolygonGeometryBuilder.createBoxWithQuads(12, 40, 12),
          description: 'Tall tower shape'
        },
        {
          name: 'flat-plate.stl',
          generator: () => PolygonGeometryBuilder.createBoxWithQuads(30, 5, 25),
          description: 'Flat plate'
        },

        // Basic shapes with triangles
        {
          name: 'tetrahedron.stl',
          generator: () => PolygonGeometryBuilder.createTetrahedron(18),
          description: 'Tetrahedron - 4 triangular faces'
        },
        {
          name: 'octahedron.stl',
          generator: () => PolygonGeometryBuilder.createOctahedron(15),
          description: 'Octahedron - 8 triangular faces'
        },
        {
          name: 'icosahedron.stl',
          generator: () => PolygonGeometryBuilder.createIcosahedron(16),
          description: 'Icosahedron - 20 triangular faces'
        },

        // Prisms and cylinders
        {
          name: 'triangular-prism.stl',
          generator: () => PolygonGeometryBuilder.createTriangularPrism(14, 28),
          description: 'Triangular prism with triangle ends'
        },
        {
          name: 'hexagonal-prism.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(15, 15, 22, 6),
          description: 'Hexagonal prism (6-sided)'
        },
        {
          name: 'octagonal-cylinder.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(13, 13, 25, 8),
          description: 'Octagonal cylinder (8-sided)'
        },
        {
          name: 'pentagonal-prism.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(14, 14, 20, 5),
          description: 'Pentagonal prism (5-sided)'
        },
        {
          name: 'dodecagon-cylinder.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(12, 12, 18, 12),
          description: 'Dodecagonal cylinder (12-sided)'
        },

        // Cones
        {
          name: 'octagonal-cone.stl',
          generator: () => PolygonGeometryBuilder.createConeWithPolygons(16, 28, 8),
          description: 'Octagonal cone (8-sided base)'
        },
        {
          name: 'hexagonal-cone.stl',
          generator: () => PolygonGeometryBuilder.createConeWithPolygons(14, 24, 6),
          description: 'Hexagonal cone (6-sided base)'
        },
        {
          name: 'square-pyramid.stl',
          generator: () => PolygonGeometryBuilder.createConeWithPolygons(15, 22, 4),
          description: 'Square pyramid (4-sided base)'
        },

        // Truncated shapes (frustums)
        {
          name: 'truncated-cone.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(8, 16, 20, 8),
          description: 'Truncated octagonal cone'
        },
        {
          name: 'truncated-pyramid.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(6, 18, 22, 4),
          description: 'Truncated square pyramid'
        },

        // Irregular shapes
        {
          name: 'irregular-prism-1.stl',
          generator: () => PolygonGeometryBuilder.createBoxWithQuads(
            15 + Math.random() * 15, 20 + Math.random() * 10, 18 + Math.random() * 12
          ),
          description: 'Irregular rectangular prism'
        },
        {
          name: 'irregular-cylinder.stl',
          generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(
            10 + Math.random() * 8, 14 + Math.random() * 6, 20 + Math.random() * 10,
            6 + Math.floor(Math.random() * 6)
          ),
          description: 'Irregular cylinder shape'
        },
        {
          name: 'random-cone.stl',
          generator: () => PolygonGeometryBuilder.createConeWithPolygons(
            12 + Math.random() * 8, 20 + Math.random() * 15,
            5 + Math.floor(Math.random() * 8)
          ),
          description: 'Random cone variation'
        }
      ];

      // Randomly select a model
      const randomIndex = Math.floor(Math.random() * workingModels.length);
      const selectedModel = workingModels[randomIndex];


      setLoadingProgress({ percentage: 20, stage: 'Creating geometry...', details: selectedModel.description });

      // Generate the model
      const polygonGeometry = selectedModel.generator();

      setLoadingProgress({ percentage: 50, stage: 'Converting geometry...', details: 'Triangulating faces' });

      const bufferGeometry = PolygonGeometryBuilder.toBufferGeometry(polygonGeometry);

      setLoadingProgress({ percentage: 70, stage: 'Validating geometry...', details: 'Checking structure' });

      // Validate the geometry
      if (!bufferGeometry.attributes.position || bufferGeometry.attributes.position.count === 0) {
        throw new Error(`Generated geometry has no vertices: ${selectedModel.name}`);
      }

      setLoadingProgress({ percentage: 90, stage: 'Finalizing...', details: 'Setting up viewer' });

      // Prepare geometry for viewing with unified pipeline
      const preparedGeometry = prepareGeometryForViewing(bufferGeometry, 'initial_load');

      // Set up dual geometry storage
      setDualGeometry(bufferGeometry); // Use original indexed geometry from builder
      setFileName(selectedModel.name);
      setOriginalFormat('stl');

      // Log file size estimation test data for calibration
      const testData = getTestFileSizeData(bufferGeometry);

      setLoadingProgress({ percentage: 100, stage: 'Complete', details: `${selectedModel.name} loaded successfully` });
      console.log('Random model loaded successfully');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addError(`Failed to create random model: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      // Clear progress after a longer delay so you can see the result
      setTimeout(() => {
        setLoadingProgress({ percentage: 0, stage: '', details: '' });
      }, 2000);
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

      console.log('STL exported successfully');

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

  const exportOBJ = useCallback(async (customFilename?: string) => {
    if (!geometry) {
      addError('No model available for export');
      return;
    }

    try {
      console.log('Starting OBJ export...', {
        fileName,
        hasGeometry: !!geometry,
        vertexCount: geometry?.attributes?.position?.count || 0
      });

      const exportFilename = customFilename ||
        (fileName ? fileName.replace(/\.[^/.]+$/, '_exported.obj') : 'exported_model.obj');

      console.log('Converting geometry to OBJ format...');
      console.log('Geometry debug info:', {
        hasGeometry: !!geometry,
        hasAttributes: !!(geometry && geometry.attributes),
        hasPosition: !!(geometry && geometry.attributes && geometry.attributes.position),
        hasPositionArray: !!(geometry && geometry.attributes && geometry.attributes.position && geometry.attributes.position.array),
        positionArrayLength: geometry && geometry.attributes && geometry.attributes.position && geometry.attributes.position.array ? geometry.attributes.position.array.length : 0,
        hasIndex: !!(geometry && geometry.index),
        hasIndexArray: !!(geometry && geometry.index && geometry.index.array),
        indexArrayLength: geometry && geometry.index && geometry.index.array ? geometry.index.array.length : 0
      });

      const objResult = OBJConverter.geometryToOBJ(geometry, exportFilename);

      if (!objResult.success) {
        throw new Error(objResult.error || 'Failed to convert geometry to OBJ');
      }

      // Create and download the OBJ file
      const blob = new Blob([objResult.objContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename;
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('OBJ export completed successfully');

      // Track export event
      try {
        analytics.trackEvent({
          event_name: 'obj_export',
          event_category: '3d_interaction',
          event_label: exportFilename,
          custom_parameters: {
            original_filename: fileName,
            export_filename: exportFilename,
            vertex_count: geometry.attributes.position?.count || 0,
            face_count: objResult.stats?.faces || 0,
            polygon_faces: objResult.stats?.polygonFaces || 0
          }
        });
      } catch (analyticsError) {
        console.warn('Failed to track export event:', analyticsError);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to export OBJ file';
      addError(`OBJ export failed: ${errorMessage}`);
      console.error('OBJ export error details:', error);
    }
  }, [geometry, fileName]);

  const exportParts = useCallback(async (options: {
    format?: 'stl' | 'obj';
    partThickness?: number;
    scale?: number;
  } = {}) => {
    if (!geometry) {
      addError('No model available for parts export');
      return;
    }

    const format = options.format || 'stl';

    try {
      console.log('Starting parts export...', {
        format,
        fileName,
        hasGeometry: !!geometry,
        triangleCount: Math.floor(geometry.attributes.position.count / 3)
      });

      const fileExtension = format === 'obj' ? 'obj' : 'stl';
      const exportFilename = fileName
        ? fileName.replace(/\.[^/.]+$/, `_assembly_kit_${format}.zip`)
        : `assembly_kit_${format}.zip`;

      if (format === 'obj') {
        // Export as OBJ parts
        await PolygonPartsExporter.exportPartsAsZip(geometry, exportFilename, { ...options, format: 'obj' });
      } else {
        // Export as STL parts (default)
        await PolygonPartsExporter.exportPartsAsZip(geometry, exportFilename, options);
      }

      console.log(`${format.toUpperCase()} assembly kit export completed successfully`);

      // Track export event
      try {
        const stats = TriangleExporter.getExportStats(geometry, options.partThickness || 2);
        analytics.trackEvent({
          event_name: `assembly_kit_export_${format}`,
          event_category: '3d_interaction',
          event_label: exportFilename,
          custom_parameters: {
            format: format,
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

  // Backup and restore functions
  const createBackup = useCallback(() => {
    if (indexedGeometry) {
      console.log('🔄 Creating backup of current indexed model with polygon structure...');
      // Clone the indexed geometry to avoid reference issues
      const backup = indexedGeometry.clone();

      // Preserve any polygon/face metadata that might be attached
      if ((indexedGeometry as any).polygonFaces) {
        (backup as any).polygonFaces = JSON.parse(JSON.stringify((indexedGeometry as any).polygonFaces));
      }
      if ((indexedGeometry as any).originalPolygons) {
        (backup as any).originalPolygons = JSON.parse(JSON.stringify((indexedGeometry as any).originalPolygons));
      }
      if ((indexedGeometry as any).reconstructedFaces) {
        (backup as any).reconstructedFaces = JSON.parse(JSON.stringify((indexedGeometry as any).reconstructedFaces));
      }

      setBackupIndexedGeometry(backup);
      setBackupProcessedModel(processedModel);
      setHasBackup(true);
      console.log('✅ Backup created successfully with polygon structure preserved');
    }
  }, [indexedGeometry, processedModel]);

  const restoreFromBackup = useCallback(() => {
    if (backupIndexedGeometry && hasBackup) {
      console.log('🔄 Restoring model from backup with polygon structure...');
      // Clone the backup to avoid reference issues
      const restored = backupIndexedGeometry.clone();

      // Restore polygon/face metadata
      if ((backupIndexedGeometry as any).polygonFaces) {
        (restored as any).polygonFaces = JSON.parse(JSON.stringify((backupIndexedGeometry as any).polygonFaces));
      }
      if ((backupIndexedGeometry as any).originalPolygons) {
        (restored as any).originalPolygons = JSON.parse(JSON.stringify((backupIndexedGeometry as any).originalPolygons));
      }
      if ((backupIndexedGeometry as any).reconstructedFaces) {
        (restored as any).reconstructedFaces = JSON.parse(JSON.stringify((backupIndexedGeometry as any).reconstructedFaces));
      }

      // Use dual geometry setup for restored geometry
      setDualGeometry(restored);
      setProcessedModel(backupProcessedModel);
      console.log('✅ Model restored from backup with polygon structure preserved');
    } else {
      console.warn('⚠️ No backup available to restore from');
    }
  }, [backupIndexedGeometry, backupProcessedModel, hasBackup]);

  // STL Tool Methods
  const reducePoints = useCallback(async (reductionAmount: number, method: 'quadric_edge_collapse' = 'quadric_edge_collapse'): Promise<ToolOperationResult> => {
    if (!indexedGeometry) {
      return { success: false, message: 'No model available for mesh simplification' };
    }

    setIsProcessingTool(true);

    try {
      // Create backup before simplification
      createBackup();

      console.log('��� === DECIMATION DATA FLOW DEBUGGING ===');
      console.log('📥 INPUT INDEXED GEOMETRY for operations:', {
        vertices: indexedGeometry.attributes.position.count,
        faces: indexedGeometry.index ? indexedGeometry.index.count / 3 : 0,
        uuid: indexedGeometry.uuid,
        boundingBox: indexedGeometry.boundingBox
      });

      const inputPositions = indexedGeometry.attributes.position.array;


      // Use indexed geometry for decimation operations
      const result = await STLManipulator.reducePoints(indexedGeometry, reductionAmount, method);


      // CRITICAL: Check if polygon metadata is preserved
      const inputPolygonFaces = (indexedGeometry as any).polygonFaces;
      const outputPolygonFaces = (result.geometry as any).polygonFaces;

      const outputPositions = result.geometry.attributes.position.array;

      // CRITICAL: Fix face orientation after decimation to prevent transparency
      ensureSolidObjectDisplay(result.geometry);

      // CRITICAL: Perform simple coplanar merging after decimation to reconstruct polygons
      if (result.geometry.attributes.position.count < 100000) { // Only for reasonable poly counts
        console.log('🔧 POST-DECIMATION: Running simple coplanar triangle merging...');
        try {
          const { SimpleCoplanarMerger } = await import('../lib/simpleCoplanarMerger');
          const mergedFaces = SimpleCoplanarMerger.mergeCoplanarTriangles(result.geometry);

          if (mergedFaces.length > 0) {
            (result.geometry as any).polygonFaces = mergedFaces;
            (result.geometry as any).polygonType = 'post_decimation_merged';
            (result.geometry as any).isPolygonPreserved = true;
            console.log(`✅ Post-decimation simple coplanar merging completed`);
          }
        } catch (mergeError) {
          console.warn('⚠️ Post-decimation coplanar merging failed:', mergeError);
        }
      } else {
        console.log('⏭️ Skipping post-decimation coplanar merging for high-poly model');
      }

      // Update both indexed (for operations) and non-indexed (for viewing) geometries
      setDualGeometry(result.geometry);

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
        // Analytics tracking failed silently
      }

      console.log('Decimation completed successfully');

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
  }, [indexedGeometry]);



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

  // Single edge decimation function
  const decimateEdge = useCallback(async (vertexIndex1: number, vertexIndex2: number): Promise<ToolOperationResult> => {
    console.log(`🎯 === SINGLE EDGE DECIMATION ===`);
    console.log(`   Decimating edge between vertices: ${vertexIndex1} ↔ ${vertexIndex2}`);

    if (!indexedGeometry) {
      throw new Error('No indexed geometry loaded for edge decimation');
    }

    try {
      setIsProcessingTool(true);
      setIsDecimating(true); // Mark decimation in progress

      // Create backup before operation
      createBackup();

      // Use STLManipulator for single edge decimation on indexed geometry
      const result = await STLManipulator.decimateSingleEdge(indexedGeometry, vertexIndex1, vertexIndex2);

      if (result.success && result.geometry) {
        console.log(`✅ Edge decimation successful`);

        // Reset decimation flag BEFORE geometry update to prevent spinning
        setIsDecimating(false);

        // CRITICAL: Fix face orientation after edge decimation to prevent transparency
        console.log('🔧 POST-EDGE-DECIMATION: Ensuring solid object display...');
        ensureSolidObjectDisplay(result.geometry);

        // CRITICAL: Perform simple coplanar merging after edge decimation
        console.log('🔧 POST-EDGE-DECIMATION: Running simple coplanar triangle merging...');
        try {
          const { SimpleCoplanarMerger } = await import('../lib/simpleCoplanarMerger');
          const mergedFaces = SimpleCoplanarMerger.mergeCoplanarTriangles(result.geometry);

          if (mergedFaces.length > 0) {
            (result.geometry as any).polygonFaces = mergedFaces;
            (result.geometry as any).polygonType = 'post_edge_decimation_merged';
            (result.geometry as any).isPolygonPreserved = true;
            console.log(`✅ Post-edge-decimation simple coplanar merging completed`);
          }
        } catch (mergeError) {
          console.warn('⚠️ Post-edge-decimation coplanar merging failed:', mergeError);
        }

        // Update both indexed and non-indexed geometries using dual geometry approach
        result.geometry.uuid = THREE.MathUtils.generateUUID();
        setDualGeometry(result.geometry);

        console.log('=== VIEWER GEOMETRY UPDATE ===');
        console.log(`🎆 Viewer received geometry: ${result.geometry.attributes.position.count} vertices, ${result.geometry.index ? result.geometry.index.count / 3 : 0} faces`);
        console.log(`🎆 Geometry UUID: ${result.geometry.uuid}`);

        return result;
      } else {
        console.error('❌ Edge decimation failed:', result.message);
        throw new Error(result.message || 'Edge decimation failed');
      }
    } catch (error) {
      console.error('❌ Single edge decimation error:', error);
      throw error;
    } finally {
      setIsProcessingTool(false);
      setIsDecimating(false); // Reset decimation flag (fallback for error cases)
    }
  }, [indexedGeometry, createBackup]);

  const value: STLContextType = {
    geometry,
    fileName,
    isLoading,
    loadingProgress,
    error,
    errors,
    viewerSettings,

    // Model data (dual format support)
    processedModel,
    originalFormat,
    objString,
    cleanupResults,

    toolMode,
    isProcessingTool,
    highlightedTriangle,
    triangleStats,

    // Decimation Painter Mode
    decimationPainterMode,
    setDecimationPainterMode,
    isDecimating,
    decimateEdge,

    loadModelFromFile,
    loadDefaultSTL,
    updateViewerSettings,
    exportSTL,
    exportOBJ,
    exportParts,
    clearError,
    clearErrorById,
    addError,
    setToolMode,
    reducePoints,
    getGeometryStats,
    getDetailedGeometryStats,
    setHighlightedTriangle,

    // Backup and restore functionality
    hasBackup,
    createBackup,
    restoreFromBackup
  };

  return (
    <STLContext.Provider value={value}>
      {children}
    </STLContext.Provider>
  );
};
