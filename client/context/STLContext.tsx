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
import { ChamferedPartsExporter } from "../lib/chamferedPartsExporter";
import { STLExporter } from "../lib/stlExporter";
import { OBJConverter } from "../lib/objConverter";
import { PolygonGeometryBuilder } from "../lib/polygonGeometryBuilder";
import { PolygonFaceReconstructor } from "../lib/polygonFaceReconstructor";
import {
  STLGeometryValidator,
  ValidationReport,
} from "../lib/stlGeometryValidator";
import { ModelFileHandler, ProcessedModel } from "../lib/modelFileHandler";
import { ModelCache } from "../lib/modelCache";
import { getTestFileSizeData } from "../lib/fileSizeEstimator";
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
  exportChamferedParts: (options?: {
    format?: "stl" | "obj";
    partThickness?: number;
    chamferDepth?: number;
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
  getDualMeshStats: () => any;
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
    console.error(
      "STL Context Error: Component tried to use STL context outside provider",
    );
    console.error(
      "This usually happens during hot reload or component tree changes",
    );
    console.error("Please refresh the page to fix this issue");
    console.error("Current context value:", context);
    console.error("STLContext:", STLContext);
    throw new Error("useSTL must be used within an STLProvider");
  }
  return context;
};

interface STLProviderProps {
  children: React.ReactNode;
}

// Mesh repair and validation helper
const repairGeometry = (
  geometry: THREE.BufferGeometry,
): THREE.BufferGeometry => {
  const positions = geometry.attributes.position.array as Float32Array;
  const validPositions: number[] = [];

  // Remove degenerate triangles and NaN values
  for (let i = 0; i < positions.length; i += 9) {
    const v1 = new THREE.Vector3(
      positions[i],
      positions[i + 1],
      positions[i + 2],
    );
    const v2 = new THREE.Vector3(
      positions[i + 3],
      positions[i + 4],
      positions[i + 5],
    );
    const v3 = new THREE.Vector3(
      positions[i + 6],
      positions[i + 7],
      positions[i + 8],
    );

    // Check for NaN or infinite values
    if (
      isFinite(v1.x) &&
      isFinite(v1.y) &&
      isFinite(v1.z) &&
      isFinite(v2.x) &&
      isFinite(v2.y) &&
      isFinite(v2.z) &&
      isFinite(v3.x) &&
      isFinite(v3.y) &&
      isFinite(v3.z)
    ) {
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
  // Add safeguard for hot reload issues
  useEffect(() => {
    console.log("🔧 STLProvider initialized/re-initialized");
  }, []);
  // Dual mesh system state
  const [originalMesh, setOriginalMesh] = useState<THREE.BufferGeometry | null>(
    null,
  );
  const [workingMeshTri, setWorkingMeshTri] =
    useState<THREE.BufferGeometry | null>(null);
  const [previewMeshMerged, setPreviewMeshMerged] =
    useState<THREE.BufferGeometry | null>(null);

  // Display geometry (for viewer)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<ErrorMessage[]>([]);
  const [viewerSettings, setViewerSettings] = useState<ViewerSettings>(
    defaultViewerSettings,
  );

  const [loadingProgress, setLoadingProgress] = useState({
    percentage: 0,
    stage: "",
    details: "",
  });

  const [processedModel, setProcessedModel] = useState<ProcessedModel | null>(
    null,
  );
  const [originalFormat, setOriginalFormat] = useState<"stl" | "obj" | null>(
    null,
  );
  const [objString, setObjString] = useState<string | null>(null);
  const [cleanupResults, setCleanupResults] = useState<any | null>(null);

  // Backup state
  const [backupOriginalMesh, setBackupOriginalMesh] =
    useState<THREE.BufferGeometry | null>(null);
  const [backupWorkingMeshTri, setBackupWorkingMeshTri] =
    useState<THREE.BufferGeometry | null>(null);
  const [backupPreviewMeshMerged, setBackupPreviewMeshMerged] =
    useState<THREE.BufferGeometry | null>(null);
  const [hasBackup, setHasBackup] = useState(false);

  // STL Tools state
  const [toolMode, setToolMode] = useState<STLToolMode>(STLToolMode.Highlight);
  const [isProcessingTool, setIsProcessingTool] = useState(false);

  // Highlighting state
  const [highlightedTriangle, setHighlightedTriangleState] = useState<
    number | null
  >(null);
  const [triangleStats, setTriangleStats] = useState<any>(null);

  // Decimation state
  const [decimationPainterMode, setDecimationPainterMode] =
    useState<boolean>(false);
  const [isDecimating, setIsDecimating] = useState<boolean>(false);

  const updateProgress = (
    percentage: number,
    stage: string,
    details: string = "",
  ) => {
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
      (preview as any).isProcedurallyGenerated = (
        loadedGeometry as any
      ).isProcedurallyGenerated;
    }

    // Apply coplanar merging for clean preview if geometry supports it
    if (
      (loadedGeometry as any).isProcedurallyGenerated &&
      (loadedGeometry as any).polygonFaces
    ) {
      // For procedural geometry, polygon structure is already perfect
    } else {
      // For loaded files, apply polygon reconstruction to create merged faces
      const polygonFaces =
        PolygonFaceReconstructor.reconstructPolygonFaces(triangulated);
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
    console.log("✅ Normal processing complete - display geometry prepared", {
      vertices: displayGeometry.attributes.position.count,
      hasNormals: !!displayGeometry.attributes.normal,
      hasGeometry: !!displayGeometry,
    });
    setGeometry(displayGeometry);
  };

  // Minimal setup for very large files (>500KB) - NO heavy processing to prevent timeouts
  const setupMinimalMeshSystem = (loadedGeometry: THREE.BufferGeometry) => {
    // Just set the geometry directly with minimal processing
    // NO cloning, NO repairs, NO polygon reconstruction, NO dual mesh system

    // Basic scaling only
    loadedGeometry.computeBoundingBox();
    if (loadedGeometry.boundingBox) {
      const box = loadedGeometry.boundingBox;
      const maxDimension = Math.max(
        box.max.x - box.min.x,
        box.max.y - box.min.y,
        box.max.z - box.min.z,
      );

      if (maxDimension > 0) {
        const scale = 50 / maxDimension;
        loadedGeometry.scale(scale, scale, scale);
      }
    }

    // Always recompute normals for large files to fix any malformed faces from STL
    loadedGeometry.computeVertexNormals();

    // Use the same geometry for everything - no dual mesh system
    setOriginalMesh(loadedGeometry);
    setWorkingMeshTri(loadedGeometry);
    setPreviewMeshMerged(loadedGeometry);
    setGeometry(loadedGeometry);

    console.log("✅ Minimal processing complete - geometry set directly", {
      vertices: loadedGeometry.attributes.position.count,
      hasNormals: !!loadedGeometry.attributes.normal,
      hasGeometry: !!loadedGeometry,
    });
  };

  // Progressive setup for large models (50k+ triangles)
  const setupDualMeshSystemProgressive = async (
    loadedGeometry: THREE.BufferGeometry,
    updateProgress: (
      percentage: number,
      stage: string,
      details?: string,
    ) => Promise<void>,
  ) => {
    // 1. Store original mesh (minimal memory)
    updateProgress(75, "Tune", "Storing original...");
    setOriginalMesh(loadedGeometry); // Don't clone for large models

    // 2. Create basic working mesh first for immediate display
    updateProgress(80, "Tune", "Creating display mesh...");
    let basicMesh = loadedGeometry.clone();

    // Minimal processing for immediate display
    if (basicMesh.index) {
      basicMesh = basicMesh.toNonIndexed();
    }
    ensureNormals(basicMesh);

    // Set for immediate display
    setWorkingMeshTri(basicMesh);
    setPreviewMeshMerged(basicMesh);

    // 3. Set up basic display geometry immediately
    const displayGeometry = prepareGeometryForViewing(basicMesh, "display");
    setGeometry(displayGeometry);

    updateProgress(90, "Tune", "Finalizing...");

    // 4. Defer heavy operations to background (non-blocking)
    setTimeout(async () => {
      try {
        // Apply repairs and polygon reconstruction in background
        const repairedMesh = repairGeometry(basicMesh.clone());
        setWorkingMeshTri(repairedMesh);

        // Only do polygon reconstruction if needed for parts export
        // This is now deferred and won't block initial loading
      } catch (error) {
        console.warn("Background processing failed:", error);
      }
    }, 100);
  };

  // Helper function to create proper preview mesh after operations
  const createPreviewFromWorkingMesh = (
    workingGeometry: THREE.BufferGeometry,
    operationType: string,
  ) => {
    let preview = workingGeometry.clone();

    // Try to reconstruct polygon faces for better preview
    try {
      const polygonFaces =
        PolygonFaceReconstructor.reconstructPolygonFaces(workingGeometry);
      if (polygonFaces.length > 0) {
        PolygonFaceReconstructor.applyReconstructedFaces(preview, polygonFaces);
        (preview as any).polygonType = `${operationType}_merged`;

        // Ensure colors are still preserved after polygon reconstruction
        if (workingGeometry.attributes.color && !preview.attributes.color) {
          console.log(`🎨 Re-applying colors after polygon reconstruction`);
          preview.setAttribute("color", workingGeometry.attributes.color.clone());
        }
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
    console.log("🚀 loadModelFromFile called with:", file.name, file.size);

    setIsLoading(true);
    setError(null);
    setErrors([]);
    updateProgress(0, "Starting", "Initializing upload...");

    try {
      console.log("✅ Beginning file load process...");
      const { loadModelFile } = await import("../lib/simplifiedSTLLoader");

      setOriginalFormat(
        file.name.toLowerCase().endsWith(".stl") ? "stl" : "obj",
      );

      updateProgress(25, "Loading", "Reading file...");
      let loadedGeometry = await loadModelFile(file, updateProgress);

      // Detect file size and triangle count for loading strategy
      const fileSizeKB = file.size / 1024;
      const triangleCount = Math.floor(
        loadedGeometry.attributes.position.count / 3,
      );
      const isVeryLargeFile = fileSizeKB > 500; // Files >500KB get minimal processing
      const isLargeModel = triangleCount > 50000; // 50k+ triangles = large model

      updateProgress(50, "Build", "Preparing display...");

      console.log(
        `File: ${file.name}, Size: ${fileSizeKB.toFixed(1)}KB, Triangles: ${triangleCount}, Using: ${isVeryLargeFile ? "MINIMAL" : "NORMAL"} processing`,
      );

      if (isVeryLargeFile) {
        // MINIMAL PROCESSING for large files to prevent timeouts
        setupMinimalMeshSystem(loadedGeometry);
      } else {
        // Normal processing for smaller files
        // Scale to reasonable size
        loadedGeometry.computeBoundingBox();
        if (!loadedGeometry.boundingBox) {
          throw new Error("Invalid geometry: no bounding box");
        }

        const box = loadedGeometry.boundingBox;
        const maxDimension = Math.max(
          box.max.x - box.min.x,
          box.max.y - box.min.y,
          box.max.z - box.min.z,
        );

        if (maxDimension > 0) {
          const scale = 50 / maxDimension;
          loadedGeometry.scale(scale, scale, scale);
        }

        // Set up dual mesh system with progressive loading for large models
        if (isLargeModel) {
          await setupDualMeshSystemProgressive(loadedGeometry, updateProgress);
        } else {
          setupDualMeshSystem(loadedGeometry);
        }
      }

      setFileName(file.name);

      updateProgress(100, "Done", "Model loaded successfully!");

      analytics.trackSTLUpload({
        file_name: file.name,
        file_size: file.size,
        vertices: loadedGeometry.attributes.position.count,
        triangles: Math.floor(loadedGeometry.attributes.position.count / 3),
        upload_time: Date.now(),
      });
    } catch (error) {
      console.error("❌ Error in loadModelFromFile:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Error details:", errorMessage);
      setError(`Failed to load ${file.name}: ${errorMessage}`);
      addError(errorMessage);
    } finally {
      console.log(
        "🏁 loadModelFromFile finally block - setting isLoading to false",
      );
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
          polygonGeometry = PolygonGeometryBuilder.createBoxWithQuads(
            10,
            10,
            10,
          );
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
        bufferGeometry =
          PolygonGeometryBuilder.toBufferGeometryWithCenterTriangulation(
            polygonGeometry,
          );
      } else {
        bufferGeometry =
          PolygonGeometryBuilder.toBufferGeometry(polygonGeometry);
      }

      updateProgress(80, "Processing", "Setting up mesh system...");

      // Set up dual mesh system
      setupDualMeshSystem(bufferGeometry);

      setFileName(`${modelName}.stl`);
      setOriginalFormat("stl");

      updateProgress(100, "Complete", "Model generated successfully!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to generate ${modelName}: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDefaultSTL = useCallback(async () => {
    try {
      const randomModel =
        availableModels[Math.floor(Math.random() * availableModels.length)];
      await loadSpecificModel(randomModel.name);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to load random model: ${errorMessage}`);
    }
  }, [loadSpecificModel]);

  const updateViewerSettings = useCallback(
    (settings: Partial<ViewerSettings>) => {
      setViewerSettings((prev) => ({ ...prev, ...settings }));
    },
    [],
  );

  const exportSTL = useCallback(
    (customFilename?: string) => {
      if (!previewMeshMerged) return;

      const filename = customFilename || fileName || "model.stl";
      STLExporter.exportGeometry(previewMeshMerged, filename);
    },
    [previewMeshMerged, fileName],
  );

  const exportOBJ = useCallback(
    (customFilename?: string) => {
      if (!previewMeshMerged) return;

      const filename =
        customFilename || fileName?.replace(/\.[^/.]+$/, ".obj") || "model.obj";
      const result = OBJConverter.geometryToOBJ(previewMeshMerged, filename);

      // Download the OBJ file
      const blob = new Blob([result.objString], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    },
    [previewMeshMerged, fileName],
  );

  const addError = useCallback((message: string) => {
    const error: ErrorMessage = {
      id: Date.now().toString(),
      message,
      timestamp: Date.now(),
    };
    setErrors((prev) => [...prev, error]);
  }, []);

  const exportParts = useCallback(
    async (options?: {
      format?: "stl" | "obj";
      partThickness?: number;
      scale?: number;
      useTriangulated?: boolean;
    }) => {
      if (!previewMeshMerged) {
        console.error("No 3D model loaded for parts export");
        return;
      }

      try {
        await PolygonPartsExporter.exportPartsAsZip(
          previewMeshMerged,
          fileName || "model",
          options,
        );
      } catch (error) {
        console.error("Parts export failed:", error);
      }
    },
    [previewMeshMerged, fileName],
  );

  const exportChamferedParts = useCallback(
    async (options?: {
      format?: "stl" | "obj";
      partThickness?: number;
      chamferDepth?: number;
      scale?: number;
      useTriangulated?: boolean;
    }) => {
      if (!previewMeshMerged) {
        console.error("No 3D model loaded for chamfered parts export");
        addError("No 3D model loaded for chamfered parts export");
        return;
      }

      // Check if geometry has polygon faces (required for chamfering)
      const polygonFaces = (previewMeshMerged as any).polygonFaces;
      if (
        !polygonFaces ||
        !Array.isArray(polygonFaces) ||
        polygonFaces.length === 0
      ) {
        console.error(
          "Chamfered export requires polygon faces. Please ensure model is properly processed.",
        );
        addError(
          "Chamfered export requires polygon faces. Please ensure model is properly processed with merging enabled.",
        );
        return;
      }

      try {
        await ChamferedPartsExporter.exportChamferedPartsAsZip(
          previewMeshMerged,
          fileName || "model",
          options,
        );
      } catch (error) {
        console.error("Chamfered parts export failed:", error);
        addError(
          `Chamfered parts export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [previewMeshMerged, fileName, addError],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearErrorById = useCallback((id: string) => {
    setErrors((prev) => prev.filter((err) => err.id !== id));
  }, []);

  const reducePoints = useCallback(
    async (
      reductionAmount: number,
      method:
        | "quadric_edge_collapse"
        | "vertex_clustering"
        | "adaptive"
        | "random",
    ): Promise<ToolOperationResult> => {
      if (!workingMeshTri) {
        throw new Error("No triangulated mesh available for reduction");
      }

      setIsProcessingTool(true);

      try {
        console.log("🔧 Starting decimation...", {
          reductionAmount,
          method,
          inputVertices: workingMeshTri.attributes.position.count,
        });

        // Colors will be reapplied after decimation based on polygon face structure

        // Call static method directly
        const result = await STLManipulator.reducePoints(
          workingMeshTri,
          reductionAmount,
          method,
        );

        console.log("🔧 Decimation result:", {
          hasGeometry: !!result.geometry,
          originalVertices: result.originalStats.vertices,
          newVertices: result.newStats.vertices,
          reductionAchieved: result.reductionAchieved,
          processingTime: result.processingTime,
        });

        if (result.geometry) {
          console.log("✅ Updating meshes after decimation...");

          // Update working mesh
          setWorkingMeshTri(result.geometry);

          // Create proper preview mesh with reconstructed faces
          const newPreview = createPreviewFromWorkingMesh(
            result.geometry,
            "decimated",
          );
          setPreviewMeshMerged(newPreview);

          // Update display
          const displayGeometry = prepareGeometryForViewing(
            newPreview,
            "decimated",
          );
          setGeometry(displayGeometry);

          console.log("✅ All meshes updated successfully!", {
            displayVertices: displayGeometry.attributes.position.count,
          });

          return {
            success: true,
            message: `Decimation complete: ${result.originalStats.vertices} → ${result.newStats.vertices} vertices (${(result.reductionAchieved * 100).toFixed(1)}% reduction)`,
            geometry: result.geometry,
          };
        } else {
          console.error("❌ Decimation failed: No geometry returned");
          return {
            success: false,
            message: "Decimation failed: No geometry returned",
            geometry: null,
          };
        }
      } finally {
        setIsProcessingTool(false);
      }
    },
    [workingMeshTri],
  );

  const getGeometryStats = useCallback(() => {
    if (!workingMeshTri) return null;

    const positions = workingMeshTri.attributes.position;
    const vertices = positions.count;
    const triangles = Math.floor(vertices / 3);

    return {
      vertices,
      triangles,
      edges: (triangles * 3) / 2, // Approximate for manifold mesh
    };
  }, [workingMeshTri]);

  const getDetailedGeometryStats = useCallback(() => {
    if (!workingMeshTri) return null;

    const positions = workingMeshTri.attributes.position;
    const vertices = positions.count;
    const triangles = Math.floor(vertices / 3);
    const edges = (triangles * 3) / 2; // Approximate for manifold mesh

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
        count,
      }));
    } else {
      // Fallback to triangles
      polygonBreakdown = [{ type: "triangle", count: triangles }];
    }

    return {
      vertices,
      edges,
      triangles,
      polygonBreakdown,
    };
  }, [workingMeshTri]);

  const getDualMeshStats = useCallback(() => {
    if (!workingMeshTri || !previewMeshMerged) return null;

    // Stats for triangulated model
    const triPositions = workingMeshTri.attributes.position;
    const triVertices = triPositions.count;
    const triTriangles = Math.floor(triVertices / 3);
    const triEdges = (triTriangles * 3) / 2;

    // Stats for merged model
    const mergedPositions = previewMeshMerged.attributes.position;
    const mergedVertices = mergedPositions.count;

    // Polygon breakdown from merged model
    const polygonFaces = (previewMeshMerged as any).polygonFaces;
    let polygonBreakdown: Array<{ type: string; count: number }> = [];
    let actualTriangles = 0;
    let totalEdges = 0;

    if (polygonFaces && Array.isArray(polygonFaces)) {
      const typeCount: Record<string, number> = {};
      polygonFaces.forEach((face: any) => {
        const type = face.type || "triangle";
        typeCount[type] = (typeCount[type] || 0) + 1;

        // Count actual triangles only
        if (type === "triangle") {
          actualTriangles++;
          totalEdges += 3;
        } else if (type === "quad") {
          totalEdges += 4;
        } else {
          // For polygons, use originalVertices count if available
          const vertexCount = face.originalVertices?.length || 4;
          totalEdges += vertexCount;
        }
      });

      polygonBreakdown = Object.entries(typeCount)
        .filter(([type]) => type !== "triangle") // Don't show triangles in polygon breakdown
        .map(([type, count]) => ({ type, count }));

      // Only add triangles to breakdown if there are any
      if (actualTriangles > 0) {
        polygonBreakdown.unshift({ type: "triangle", count: actualTriangles });
      }
    } else {
      // Fallback to triangle calculation if no polygon faces
      actualTriangles = Math.floor(mergedVertices / 3);
      totalEdges = actualTriangles * 3;
      polygonBreakdown = [{ type: "triangle", count: actualTriangles }];
    }

    return {
      triangulated: {
        vertices: triVertices,
        edges: triEdges,
        triangles: triTriangles,
      },
      merged: {
        vertices: mergedVertices,
        edges: Math.floor(totalEdges / 2), // Each edge is shared by 2 faces
        actualTriangles, // Only actual triangle faces, not render triangles
        polygonBreakdown,
      },
    };
  }, [workingMeshTri, previewMeshMerged]);

  const setHighlightedTriangle = useCallback(
    (triangleIndex: number | null) => {
      setHighlightedTriangleState(triangleIndex);

      if (triangleIndex !== null && previewMeshMerged) {
        const polygonFaces = (previewMeshMerged as any).polygonFaces;

        if (!polygonFaces || !Array.isArray(polygonFaces)) {
          setTriangleStats(null);
          return;
        }

        // Find the face that contains this triangle
        let targetFace = null;
        let targetFaceIndex = -1;

        for (let faceIndex = 0; faceIndex < polygonFaces.length; faceIndex++) {
          const face = polygonFaces[faceIndex];
          if (
            face.triangleIndices &&
            face.triangleIndices.includes(triangleIndex)
          ) {
            targetFace = face;
            targetFaceIndex = faceIndex;
            break;
          }
        }

        if (!targetFace) {
          setTriangleStats(null);
          return;
        }

        // Get the face vertices
        let faceVertices: THREE.Vector3[] = [];
        if (
          targetFace.originalVertices &&
          Array.isArray(targetFace.originalVertices)
        ) {
          faceVertices = targetFace.originalVertices.map(
            (v: any) => new THREE.Vector3(v.x, v.y, v.z),
          );
        } else {
          setTriangleStats(null);
          return;
        }

        // Calculate perimeter
        let facePerimeter = 0;
        for (let i = 0; i < faceVertices.length; i++) {
          const current = faceVertices[i];
          const next = faceVertices[(i + 1) % faceVertices.length];
          facePerimeter += current.distanceTo(next);
        }

        // Calculate area using shoelace formula for planar polygons
        let faceArea = 0;
        if (faceVertices.length === 3) {
          // Triangle area
          const edge1 = new THREE.Vector3().subVectors(
            faceVertices[1],
            faceVertices[0],
          );
          const edge2 = new THREE.Vector3().subVectors(
            faceVertices[2],
            faceVertices[0],
          );
          const cross = new THREE.Vector3().crossVectors(edge1, edge2);
          faceArea = cross.length() / 2;
        } else if (faceVertices.length === 4) {
          // Quad area using two triangles
          const edge1 = new THREE.Vector3().subVectors(
            faceVertices[1],
            faceVertices[0],
          );
          const edge2 = new THREE.Vector3().subVectors(
            faceVertices[2],
            faceVertices[0],
          );
          const cross1 = new THREE.Vector3().crossVectors(edge1, edge2);

          const edge3 = new THREE.Vector3().subVectors(
            faceVertices[2],
            faceVertices[0],
          );
          const edge4 = new THREE.Vector3().subVectors(
            faceVertices[3],
            faceVertices[0],
          );
          const cross2 = new THREE.Vector3().crossVectors(edge3, edge4);

          faceArea = (cross1.length() + cross2.length()) / 2;
        } else {
          // Polygon area using fan triangulation from first vertex
          for (let i = 1; i < faceVertices.length - 1; i++) {
            const edge1 = new THREE.Vector3().subVectors(
              faceVertices[i],
              faceVertices[0],
            );
            const edge2 = new THREE.Vector3().subVectors(
              faceVertices[i + 1],
              faceVertices[0],
            );
            const cross = new THREE.Vector3().crossVectors(edge1, edge2);
            faceArea += cross.length() / 2;
          }
        }

        // Calculate normal
        let faceNormal = new THREE.Vector3();
        if (targetFace.normal) {
          faceNormal = new THREE.Vector3(
            targetFace.normal.x,
            targetFace.normal.y,
            targetFace.normal.z,
          );
        } else {
          const edge1 = new THREE.Vector3().subVectors(
            faceVertices[1],
            faceVertices[0],
          );
          const edge2 = new THREE.Vector3().subVectors(
            faceVertices[2],
            faceVertices[0],
          );
          faceNormal = new THREE.Vector3()
            .crossVectors(edge1, edge2)
            .normalize();
        }

        setTriangleStats({
          index: triangleIndex,
          vertices: faceVertices,
          area: faceArea,
          perimeter: facePerimeter,
          normal: faceNormal,
          faceType: targetFace.type,
          vertexCount: faceVertices.length,
          parentFaceIndex: targetFaceIndex,
        });
      } else {
        setTriangleStats(null);
      }
    },
    [previewMeshMerged],
  );

  const decimateEdge = useCallback(
    async (
      vertexIndex1: number,
      vertexIndex2: number,
    ): Promise<ToolOperationResult> => {
      if (!workingMeshTri) {
        throw new Error("No triangulated mesh available for edge decimation");
      }

      setIsDecimating(true);

      try {
        // Use static STLManipulator.decimateEdge method
        const result = await STLManipulator.decimateEdge(
          workingMeshTri,
          vertexIndex1,
          vertexIndex2,
        );

        if (result.success && result.geometry) {
          // Update working mesh
          setWorkingMeshTri(result.geometry);

          // Create proper preview mesh with reconstructed faces
          const newPreview = createPreviewFromWorkingMesh(
            result.geometry,
            "edge_decimated",
          );
          setPreviewMeshMerged(newPreview);

          // Update display
          const displayGeometry = prepareGeometryForViewing(
            newPreview,
            "edge_decimated",
          );
          setGeometry(displayGeometry);
        }

        return result;
      } catch (error) {
        console.error("Edge decimation error:", error);
        return {
          success: false,
          message: `Edge decimation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          geometry: null,
        };
      } finally {
        setIsDecimating(false);
      }
    },
    [workingMeshTri],
  );

  const createBackup = useCallback(() => {
    if (originalMesh && workingMeshTri && previewMeshMerged) {
      setBackupOriginalMesh(originalMesh.clone());
      setBackupWorkingMeshTri(workingMeshTri.clone());
      setBackupPreviewMeshMerged(previewMeshMerged.clone());
      setHasBackup(true);
    }
  }, [originalMesh, workingMeshTri, previewMeshMerged]);

  const restoreFromBackup = useCallback(() => {
    if (
      hasBackup &&
      backupOriginalMesh &&
      backupWorkingMeshTri &&
      backupPreviewMeshMerged
    ) {
      setOriginalMesh(backupOriginalMesh.clone());
      setWorkingMeshTri(backupWorkingMeshTri.clone());
      setPreviewMeshMerged(backupPreviewMeshMerged.clone());

      const displayGeometry = prepareGeometryForViewing(
        backupPreviewMeshMerged,
        "restored",
      );
      setGeometry(displayGeometry);
    }
  }, [
    hasBackup,
    backupOriginalMesh,
    backupWorkingMeshTri,
    backupPreviewMeshMerged,
  ]);

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
    exportChamferedParts,
    clearError,
    clearErrorById,
    addError,
    setToolMode,
    reducePoints,
    getGeometryStats,
    getDetailedGeometryStats,
    getDualMeshStats,
    setHighlightedTriangle,
    hasBackup,
    createBackup,
    restoreFromBackup,
  };

  // Ensure contextValue is properly defined before rendering
  if (!contextValue) {
    console.error("❌ STLContext contextValue is undefined during render");
    return null;
  }

  return (
    <STLContext.Provider value={contextValue}>{children}</STLContext.Provider>
  );
};
