import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import * as THREE from "three";
import { analytics } from "../lib/analytics";
import {
  STLManipulator,
  STLToolMode,
  ToolOperationResult,
} from "../lib/stlManipulator";
import { TriangleExporter } from "../lib/triangleExporter";
import { PolygonPartsExporter } from "../lib/polygonPartsExporter";
import { PolygonGeometryBuilder } from "../lib/polygonGeometryBuilder";
import { PolygonFaceReconstructor } from "../lib/polygonFaceReconstructor";
import {
  STLGeometryValidator,
  ValidationReport,
} from "../lib/stlGeometryValidator";
import { ModelFileHandler, ProcessedModel } from "../lib/modelFileHandler";
import { ModelCache } from "../lib/modelCache";
import { getTestFileSizeData } from "../lib/fileSizeEstimator";
import { OBJConverter } from "../lib/objConverter";
import { computeFlatNormals } from "../lib/flatNormals";
import { prepareGeometryForViewing } from "../lib/geometryPreparer";
import { convertToNonIndexedForFlatColors } from "../lib/flatGeometry";
import {
  validateAndFixGeometry,
  hasNaNValues,
  logGeometryStats,
} from "../lib/geometryValidator";

interface ViewerSettings {
  randomColors: boolean;
  wireframe: boolean;
  backgroundColor: string;
  autoSpin: boolean;
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
  processedModel: any | null;
  originalFormat: "stl" | "obj" | null;
  objString: string | null;
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
  isDecimating: boolean;
  decimateEdge: (
    vertexIndex1: number,
    vertexIndex2: number,
  ) => Promise<ToolOperationResult>;

  loadModelFromFile: (file: File) => Promise<void>;
  loadDefaultSTL: () => Promise<void>;
  loadSpecificModel: (modelName: string) => Promise<void>;
  availableModels: Array<{ name: string; description: string }>;
  updateViewerSettings: (settings: Partial<ViewerSettings>) => void;
  exportSTL: (customFilename?: string) => void;
  exportOBJ: (customFilename?: string) => void;
  exportParts: (options?: {
    format?: "stl" | "obj";
    partThickness?: number;
    scale?: number;
  }) => Promise<void>;
  clearError: () => void;
  clearErrorById: (id: string) => void;
  addError: (message: string) => void;

  // STL Tool Methods
  setToolMode: (mode: STLToolMode) => void;
  reducePoints: (
    reductionAmount: number,
    method:
      | "quadric_edge_collapse"
      | "vertex_clustering"
      | "adaptive"
      | "random",
  ) => Promise<ToolOperationResult>;
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
  backgroundColor: "#0a0a0a",
  autoSpin: false,
};

const STLContext = createContext<STLContextType | undefined>(undefined);

export const useSTL = () => {
  const context = useContext(STLContext);
  if (!context) {
    throw new Error("useSTL must be used within an STLProvider");
  }
  return context;
};

interface STLProviderProps {
  children: React.ReactNode;
}


// Mesh repair and validation helper
const repairGeometry = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  const positions = geometry.attributes.position.array as Float32Array;
  const validPositions: number[] = [];
  
  // Remove degenerate triangles and NaN values
  for (let i = 0; i < positions.length; i += 9) {
    const v1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const v2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const v3 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
    
    // Check for NaN or infinite values
    if (isFinite(v1.x) && isFinite(v1.y) && isFinite(v1.z) &&
        isFinite(v2.x) && isFinite(v2.y) && isFinite(v2.z) &&
        isFinite(v3.x) && isFinite(v3.y) && isFinite(v3.z)) {
      
      // Check triangle area
      const edge1 = new THREE.Vector3().subVectors(v2, v1);
      const edge2 = new THREE.Vector3().subVectors(v3, v1);
      const area = new THREE.Vector3().crossVectors(edge1, edge2).length() / 2;
      
      if (area > 1e-10) {
        validPositions.push(...positions.slice(i, i + 9));
      }
    }
  }
  
  const repairedGeometry = new THREE.BufferGeometry();
  repairedGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(validPositions, 3),
  );
  
  if (geometry.attributes.normal) {
    repairedGeometry.setAttribute("normal", geometry.attributes.normal);
  }
  
  return repairedGeometry;
};

// Ensure normals are computed properly
const ensureNormals = (geometry: THREE.BufferGeometry): void => {
  if (!geometry.attributes.normal) {
    computeFlatNormals(geometry);
  }
};

export const STLProvider: React.FC<STLProviderProps> = ({ children }) => {
  // Dual mesh system state
  const [originalMesh, setOriginalMesh] = useState<THREE.BufferGeometry | null>(null);
  const [workingMeshTri, setWorkingMeshTri] = useState<THREE.BufferGeometry | null>(null);
  const [previewMeshMerged, setPreviewMeshMerged] = useState<THREE.BufferGeometry | null>(null);
  
  // Display geometry (for viewer)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(defaultViewerSettings);

  const [loadingProgress, setLoadingProgress] = useState({
    percentage: 0,
    stage: "",
    details: "",
  });

  const [processedModel, setProcessedModel] = useState<ProcessedModel | null>(null);
  const [originalFormat, setOriginalFormat] = useState<"stl" | "obj" | null>(null);
  const [objString, setObjString] = useState<string | null>(null);
  const [cleanupResults, setCleanupResults] = useState<any | null>(null);

  // Backup state
  const [backupOriginalMesh, setBackupOriginalMesh] = useState<THREE.BufferGeometry | null>(null);
  const [backupWorkingMeshTri, setBackupWorkingMeshTri] = useState<THREE.BufferGeometry | null>(null);
  const [backupPreviewMeshMerged, setBackupPreviewMeshMerged] = useState<THREE.BufferGeometry | null>(null);
  const [hasBackup, setHasBackup] = useState(false);

  // STL Tools state
  const [toolMode, setToolMode] = useState<STLToolMode>(STLToolMode.Highlight);
  const [isProcessingTool, setIsProcessingTool] = useState(false);

  // Highlighting state
  const [highlightedTriangle, setHighlightedTriangleState] = useState<number | null>(null);
  const [triangleStats, setTriangleStats] = useState<any>(null);

  // Decimation state
  const [decimationPainterMode, setDecimationPainterMode] = useState<boolean>(false);
  const [isDecimating, setIsDecimating] = useState<boolean>(false);

  const updateProgress = (percentage: number, stage: string, details: string = "") => {
    setLoadingProgress({ percentage, stage, details });
    return new Promise((resolve) => setTimeout(resolve, 10));
  };

  const availableModels = [
    { name: "cube", description: "Basic cube with 6 quad faces" },
    { name: "tetrahedron", description: "4 triangular faces" },
    { name: "octahedron", description: "8 triangular faces" },
    { name: "icosahedron", description: "20 triangular faces" },
    { name: "gear", description: "Gear wheel with teeth" },
    { name: "star", description: "5-pointed star shape" },
    { name: "cross", description: "Plus/cross shape" },
  ];

  // Set up dual mesh system
  const setupDualMeshSystem = (loadedGeometry: THREE.BufferGeometry) => {
    // 1. Store original mesh (keep untouched)
    const original = loadedGeometry.clone();
    setOriginalMesh(original);
    
    // 2. Create triangulated working mesh for operations
    let triangulated = loadedGeometry.clone();
    
    // Ensure it's triangulated
    if (!triangulated.index) {
      // Already non-indexed triangulated
    } else {
      triangulated = triangulated.toNonIndexed();
    }
    
    // Apply repairs
    triangulated = repairGeometry(triangulated);
    ensureNormals(triangulated);
    
    setWorkingMeshTri(triangulated);
    
    // 3. Create merged preview mesh with coplanar face merging
    let preview = loadedGeometry.clone(); // Start from original, not triangulated

    // CRITICAL: Manually preserve polygon metadata since clone() doesn't copy custom properties
    if ((loadedGeometry as any).polygonFaces) {
      (preview as any).polygonFaces = (loadedGeometry as any).polygonFaces;
    }
    if ((loadedGeometry as any).polygonType) {
      (preview as any).polygonType = (loadedGeometry as any).polygonType;
    }
    if ((loadedGeometry as any).isProcedurallyGenerated) {
      (preview as any).isProcedurallyGenerated = (loadedGeometry as any).isProcedurallyGenerated;
    }

    // Apply coplanar merging for clean preview if geometry supports it
    if ((loadedGeometry as any).isProcedurallyGenerated && (loadedGeometry as any).polygonFaces) {
      // For procedural geometry, polygon structure is already perfect
    } else {
      // For loaded files, apply polygon reconstruction to create merged faces
      const polygonFaces = PolygonFaceReconstructor.reconstructPolygonFaces(triangulated);
      if (polygonFaces.length > 0) {
        PolygonFaceReconstructor.applyReconstructedFaces(preview, polygonFaces);
        (preview as any).polygonType = "reconstructed_merged";
      } else {
        // Fallback: create basic triangle structure
        const positions = preview.attributes.position.array as Float32Array;
        const fallbackFaces: any[] = [];

        for (let i = 0; i < positions.length; i += 9) {
          fallbackFaces.push({
            type: "triangle",
            startVertex: i / 3,
            endVertex: i / 3 + 2,
            triangleCount: 1,
          });
        }

        (preview as any).polygonFaces = fallbackFaces;
        (preview as any).polygonType = "fallback_triangles";
      }
    }

    setPreviewMeshMerged(preview);
    
    // 4. Set display geometry (use preview for viewing)
    const displayGeometry = prepareGeometryForViewing(preview, "display");
    setGeometry(displayGeometry);
  };

  // Helper function to create proper preview mesh after operations
  const createPreviewFromWorkingMesh = (workingGeometry: THREE.BufferGeometry, operationType: string) => {
    let preview = workingGeometry.clone();

    // Try to reconstruct polygon faces for better preview
    try {
      const polygonFaces = PolygonFaceReconstructor.reconstructPolygonFaces(workingGeometry);
      if (polygonFaces.length > 0) {
        PolygonFaceReconstructor.applyReconstructedFaces(preview, polygonFaces);
        (preview as any).polygonType = `${operationType}_merged`;
      } else {
        // Fallback: use triangulated geometry as-is
        (preview as any).polygonType = `${operationType}_triangulated`;
      }
    } catch (error) {
      // Fallback: use triangulated geometry as-is
      (preview as any).polygonType = `${operationType}_triangulated`;
    }

    return preview;
  };

  const loadModelFromFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setErrors([]);
    updateProgress(0, "Starting", "Initializing upload...");

    try {
      const { loadModelFile } = await import("../lib/simplifiedSTLLoader");
      
      setOriginalFormat(file.name.toLowerCase().endsWith(".stl") ? "stl" : "obj");
      
      updateProgress(25, "Loading", "Reading file...");
      let loadedGeometry = await loadModelFile(file, updateProgress);
      
      updateProgress(70, "Processing", "Setting up mesh system...");
      
      // Scale to reasonable size
      loadedGeometry.computeBoundingBox();
      if (!loadedGeometry.boundingBox) {
        throw new Error("Invalid geometry: no bounding box");
      }
      
      const box = loadedGeometry.boundingBox;
      const maxDimension = Math.max(
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z
      );
      
      if (maxDimension > 0) {
        const scale = 50 / maxDimension;
        loadedGeometry.scale(scale, scale, scale);
      }
      
      updateProgress(85, "Optimizing", "Setting up dual mesh system...");
      
      // Set up dual mesh system
      setupDualMeshSystem(loadedGeometry);
      
      setFileName(file.name);
      
      updateProgress(100, "Complete", "Model loaded successfully!");
      
      analytics.trackSTLUpload({
        file_name: file.name,
        file_size: file.size,
        vertices: loadedGeometry.attributes.position.count,
        triangles: Math.floor(loadedGeometry.attributes.position.count / 3),
        upload_time: Date.now(),
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load ${file.name}: ${errorMessage}`);
      addError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSpecificModel = useCallback(async (modelName: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      updateProgress(0, "Loading", `Generating ${modelName}...`);
      
      // Generate preset models using PolygonGeometryBuilder
      let polygonGeometry: any;
      
      switch (modelName) {
        case "cube":
          polygonGeometry = PolygonGeometryBuilder.createBoxWithQuads(10, 10, 10);
          break;
        case "tetrahedron":
          polygonGeometry = PolygonGeometryBuilder.createTetrahedron(10);
          break;
        case "octahedron":
          polygonGeometry = PolygonGeometryBuilder.createOctahedron(10);
          break;
        case "icosahedron":
          polygonGeometry = PolygonGeometryBuilder.createIcosahedron(10);
          break;
        case "gear":
          polygonGeometry = PolygonGeometryBuilder.createGearWheel(5, 8, 2, 8);
          break;
        case "star":
          polygonGeometry = PolygonGeometryBuilder.createStarShape(8, 4, 2, 5);
          break;
        case "cross":
          polygonGeometry = PolygonGeometryBuilder.createCrossShape(8, 8, 2, 2);
          break;
        default:
          throw new Error(`Unknown model: ${modelName}`);
      }
      
      updateProgress(50, "Converting", "Converting to BufferGeometry...");
      
      // Convert to BufferGeometry
      const isGearStarCross = ["gear", "star", "cross"].includes(modelName);
      let bufferGeometry: THREE.BufferGeometry;
      
      if (isGearStarCross) {
        bufferGeometry = PolygonGeometryBuilder.toBufferGeometryWithCenterTriangulation(polygonGeometry);
      } else {
        bufferGeometry = PolygonGeometryBuilder.toBufferGeometry(polygonGeometry);
      }
      
      updateProgress(80, "Processing", "Setting up mesh system...");
      
      // Set up dual mesh system
      setupDualMeshSystem(bufferGeometry);
      
      setFileName(`${modelName}.stl`);
      setOriginalFormat("stl");
      
      updateProgress(100, "Complete", "Model generated successfully!");
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to generate ${modelName}: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDefaultSTL = useCallback(async () => {
    try {
      const randomModel = availableModels[Math.floor(Math.random() * availableModels.length)];
      await loadSpecificModel(randomModel.name);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load random model: ${errorMessage}`);
    }
  }, [loadSpecificModel]);

  const updateViewerSettings = useCallback((settings: Partial<ViewerSettings>) => {
    setViewerSettings(prev => ({ ...prev, ...settings }));
  }, []);

  const exportSTL = useCallback((customFilename?: string) => {
    if (!previewMeshMerged) return;
    
    const filename = customFilename || fileName || "model.stl";
    const exporter = new TriangleExporter();
    exporter.exportSTL(previewMeshMerged, filename);
  }, [previewMeshMerged, fileName]);

  const exportOBJ = useCallback((customFilename?: string) => {
    if (!previewMeshMerged) return;
    
    const filename = customFilename || fileName?.replace(/\.[^/.]+$/, ".obj") || "model.obj";
    const exporter = new TriangleExporter();
    exporter.exportOBJ(previewMeshMerged, filename);
  }, [previewMeshMerged, fileName]);

  const exportParts = useCallback(async (options?: {
    format?: "stl" | "obj";
    partThickness?: number;
    scale?: number;
  }) => {
    if (!previewMeshMerged) return;
    
    const exporter = new PolygonPartsExporter();
    await exporter.exportParts(previewMeshMerged, fileName || "model", options);
  }, [previewMeshMerged, fileName]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearErrorById = useCallback((id: string) => {
    setErrors(prev => prev.filter(err => err.id !== id));
  }, []);

  const addError = useCallback((message: string) => {
    const error: ErrorMessage = {
      id: Date.now().toString(),
      message,
      timestamp: Date.now(),
    };
    setErrors(prev => [...prev, error]);
  }, []);

  const reducePoints = useCallback(async (
    reductionAmount: number,
    method: "quadric_edge_collapse" | "vertex_clustering" | "adaptive" | "random"
  ): Promise<ToolOperationResult> => {
    if (!workingMeshTri) {
      throw new Error("No triangulated mesh available for reduction");
    }
    
    setIsProcessingTool(true);
    
    try {
      const manipulator = new STLManipulator(workingMeshTri);
      const result = await manipulator.reducePoints(reductionAmount, method);
      
      if (result.success && result.geometry) {
        // Update working mesh
        setWorkingMeshTri(result.geometry);

        // Create proper preview mesh with reconstructed faces
        const newPreview = createPreviewFromWorkingMesh(result.geometry, "decimated");
        setPreviewMeshMerged(newPreview);

        // Update display
        const displayGeometry = prepareGeometryForViewing(newPreview, "decimated");
        setGeometry(displayGeometry);
      }
      
      return result;
    } finally {
      setIsProcessingTool(false);
    }
  }, [workingMeshTri]);

  const getGeometryStats = useCallback(() => {
    if (!workingMeshTri) return null;
    
    const positions = workingMeshTri.attributes.position;
    const vertices = positions.count;
    const triangles = Math.floor(vertices / 3);
    
    return {
      vertices,
      triangles,
      edges: triangles * 3 / 2, // Approximate for manifold mesh
    };
  }, [workingMeshTri]);

  const getDetailedGeometryStats = useCallback(() => {
    if (!workingMeshTri) return null;

    const positions = workingMeshTri.attributes.position;
    const vertices = positions.count;
    const triangles = Math.floor(vertices / 3);
    const edges = triangles * 3 / 2; // Approximate for manifold mesh

    // Create polygon breakdown from geometry metadata
    const polygonFaces = (workingMeshTri as any).polygonFaces;
    let polygonBreakdown: Array<{ type: string; count: number }> = [];

    if (polygonFaces && Array.isArray(polygonFaces)) {
      const typeCount: Record<string, number> = {};
      polygonFaces.forEach((face: any) => {
        const type = face.type || "triangle";
        typeCount[type] = (typeCount[type] || 0) + 1;
      });

      polygonBreakdown = Object.entries(typeCount).map(([type, count]) => ({
        type,
        count
      }));
    } else {
      // Fallback to triangles
      polygonBreakdown = [{ type: "triangle", count: triangles }];
    }

    return {
      vertices,
      edges,
      triangles,
      polygonBreakdown
    };
  }, [workingMeshTri]);

  const setHighlightedTriangle = useCallback((triangleIndex: number | null) => {
    setHighlightedTriangleState(triangleIndex);

    if (triangleIndex !== null && previewMeshMerged) {
      // Calculate face stats from preview mesh (merged faces)
      const positions = previewMeshMerged.attributes.position.array as Float32Array;
      const i = triangleIndex * 9;
      
      if (i + 8 < positions.length) {
        const v1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const v2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
        const v3 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);
        
        const edge1 = new THREE.Vector3().subVectors(v2, v1);
        const edge2 = new THREE.Vector3().subVectors(v3, v1);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2);
        const area = normal.length() / 2;
        
        // Calculate perimeter
        const edge1Length = v1.distanceTo(v2);
        const edge2Length = v2.distanceTo(v3);
        const edge3Length = v3.distanceTo(v1);
        const perimeter = edge1Length + edge2Length + edge3Length;

        // Find which polygon face this triangle belongs to
        const polygonFaces = (previewMeshMerged as any).polygonFaces;
        let faceType = "triangle";
        let faceVertices = [v1, v2, v3];
        let facePerimeter = perimeter;
        let parentFaceIndex = triangleIndex;

        if (polygonFaces && Array.isArray(polygonFaces)) {
          // Look for the polygon face that contains this triangle
          for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
            const face = polygonFaces[faceIndex];
            if (face.triangleIndices && face.triangleIndices.includes(triangleIndex)) {
              faceType = face.type || "triangle";
              parentFaceIndex = faceIndex;

              // Use the specific face's vertices based on its type
              if (face.originalVertices && face.type !== "triangle") {
                faceVertices = face.originalVertices.map((v: any) =>
                  new THREE.Vector3(v.x, v.y, v.z)
                );

                // Calculate face perimeter
                facePerimeter = 0;
                for (let i = 0; i < faceVertices.length; i++) {
                  const current = faceVertices[i];
                  const next = faceVertices[(i + 1) % faceVertices.length];
                  facePerimeter += current.distanceTo(next);
                }
              }
              break;
            }
          }
        }

        setTriangleStats({
          index: triangleIndex,
          vertices: faceVertices,
          area,
          perimeter: facePerimeter,
          normal: normal.normalize(),
          faceType,
          vertexCount: faceVertices.length,
          parentFaceIndex,
        });
      }
    } else {
      setTriangleStats(null);
    }
  }, [previewMeshMerged]);

  const decimateEdge = useCallback(async (
    vertexIndex1: number,
    vertexIndex2: number,
  ): Promise<ToolOperationResult> => {
    if (!workingMeshTri) {
      throw new Error("No triangulated mesh available for edge decimation");
    }
    
    setIsDecimating(true);
    
    try {
      const manipulator = new STLManipulator(workingMeshTri);
      const result = await manipulator.decimateEdge(vertexIndex1, vertexIndex2);
      
      if (result.success && result.geometry) {
        // Update working mesh
        setWorkingMeshTri(result.geometry);

        // Create proper preview mesh with reconstructed faces
        const newPreview = createPreviewFromWorkingMesh(result.geometry, "edge_decimated");
        setPreviewMeshMerged(newPreview);

        // Update display
        const displayGeometry = prepareGeometryForViewing(newPreview, "edge_decimated");
        setGeometry(displayGeometry);
      }
      
      return result;
    } finally {
      setIsDecimating(false);
    }
  }, [workingMeshTri]);

  const createBackup = useCallback(() => {
    if (originalMesh && workingMeshTri && previewMeshMerged) {
      setBackupOriginalMesh(originalMesh.clone());
      setBackupWorkingMeshTri(workingMeshTri.clone());
      setBackupPreviewMeshMerged(previewMeshMerged.clone());
      setHasBackup(true);
    }
  }, [originalMesh, workingMeshTri, previewMeshMerged]);

  const restoreFromBackup = useCallback(() => {
    if (hasBackup && backupOriginalMesh && backupWorkingMeshTri && backupPreviewMeshMerged) {
      setOriginalMesh(backupOriginalMesh.clone());
      setWorkingMeshTri(backupWorkingMeshTri.clone());
      setPreviewMeshMerged(backupPreviewMeshMerged.clone());
      
      const displayGeometry = prepareGeometryForViewing(backupPreviewMeshMerged, "restored");
      setGeometry(displayGeometry);
    }
  }, [hasBackup, backupOriginalMesh, backupWorkingMeshTri, backupPreviewMeshMerged]);

  const contextValue: STLContextType = {
    geometry,
    fileName,
    isLoading,
    loadingProgress,
    error,
    errors,
    viewerSettings,
    processedModel,
    originalFormat,
    objString,
    cleanupResults,
    toolMode,
    isProcessingTool,
    highlightedTriangle,
    triangleStats,
    decimationPainterMode,
    setDecimationPainterMode,
    isDecimating,
    decimateEdge,
    loadModelFromFile,
    loadDefaultSTL,
    loadSpecificModel,
    availableModels,
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
    hasBackup,
    createBackup,
    restoreFromBackup,
  };

  return (
    <STLContext.Provider value={contextValue}>
      {children}
    </STLContext.Provider>
  );
};
