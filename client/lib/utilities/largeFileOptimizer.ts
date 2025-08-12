import * as THREE from "three";

/**
 * Optimizations for handling large 3D files (20MB+)
 */
export class LargeFileOptimizer {
  /**
   * Process large files with memory management and progress tracking
   */
  static async processLargeFile(
    file: File,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    const fileSize = file.size;
    const isLargeFile = fileSize > 15 * 1024 * 1024; // 15MB+

    progressCallback?.(0, "Analyzing file...");

    // Check memory before starting
    const initialMemory = this.getMemoryUsage();
    if (initialMemory.isLowMemory) {
      console.warn(
        "⚠️ Low memory detected before processing - suggesting garbage collection",
      );
      this.suggestGarbageCollection();
      await new Promise((resolve) => setTimeout(resolve, 100)); // Brief pause for GC
    }

    if (isLargeFile) {
      console.log(
        `⚡ Large file optimization activated for ${(fileSize / 1024 / 1024).toFixed(1)}MB file`,
      );

      try {
        // Request more time for processing
        if ("scheduler" in window && (window.scheduler as any).postTask) {
          return await this.processWithScheduler(file, progressCallback);
        } else {
          return await this.processWithChunking(file, progressCallback);
        }
      } catch (error) {
        // Memory cleanup on error
        this.suggestGarbageCollection();
        throw error;
      }
    } else {
      // Standard processing for smaller files
      return await this.processStandard(file, progressCallback);
    }
  }

  /**
   * Use Scheduler API for better performance on large files
   */
  private static async processWithScheduler(
    file: File,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    progressCallback?.(10, "Loading file data...");

    // Load file in chunks to avoid blocking UI
    const arrayBuffer = await this.loadFileInChunks(file, progressCallback);

    progressCallback?.(50, "Parsing geometry...");

    // Parse with yield points for better responsiveness
    const geometry = await this.parseWithYields(
      arrayBuffer,
      file.name,
      progressCallback,
    );

    progressCallback?.(90, "Optimizing geometry...");

    // Optimize the loaded geometry
    const optimized = await this.optimizeGeometry(geometry);

    progressCallback?.(100, "Loading complete");

    return optimized;
  }

  /**
   * Chunked processing for browsers without Scheduler API
   */
  private static async processWithChunking(
    file: File,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    progressCallback?.(10, "Loading file...");

    // Load file with progress tracking
    const arrayBuffer = await file.arrayBuffer();

    progressCallback?.(40, "Parsing geometry...");

    // Parse with manual yield points
    const geometry = await this.parseWithManualYields(
      arrayBuffer,
      file.name,
      progressCallback,
    );

    progressCallback?.(80, "Optimizing...");

    // Basic optimization
    this.basicOptimization(geometry);

    progressCallback?.(100, "Complete");

    return geometry;
  }

  /**
   * Standard processing for smaller files
   */
  private static async processStandard(
    file: File,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".stl")) {
      progressCallback?.(30, "Parsing STL...");
      const { STLLoader } = await import(
        "three/examples/jsm/loaders/STLLoader"
      );
      const loader = new STLLoader();
      const arrayBuffer = await file.arrayBuffer();
      const geometry = loader.parse(arrayBuffer);

      progressCallback?.(80, "Validating...");
      this.validateGeometry(geometry);

      return geometry;
    } else if (fileName.endsWith(".obj")) {
      progressCallback?.(30, "Parsing OBJ...");
      const text = await file.text();

      // Use faster OBJ parsing for large files
      const geometry = await this.fastOBJParse(text, progressCallback);
      return geometry;
    }

    throw new Error("Unsupported file format");
  }

  /**
   * Load file in chunks to show progress and avoid blocking
   */
  private static async loadFileInChunks(
    file: File,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<ArrayBuffer> {
    const chunkSize = 1024 * 1024; // 1MB chunks
    const chunks: Uint8Array[] = [];

    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const arrayBuffer = await chunk.arrayBuffer();
      chunks.push(new Uint8Array(arrayBuffer));

      const progress = 10 + (offset / file.size) * 30; // 10-40% for file loading
      progressCallback?.(progress, `Loading... ${Math.round(progress)}%`);

      // Yield to browser
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // Combine chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  /**
   * Parse with yields to prevent browser freezing
   */
  private static async parseWithYields(
    arrayBuffer: ArrayBuffer,
    fileName: string,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    if (fileName.toLowerCase().endsWith(".stl")) {
      const { STLLoader } = await import(
        "three/examples/jsm/loaders/STLLoader"
      );
      const loader = new STLLoader();

      // STL parsing is atomic, but we can yield before/after
      await new Promise((resolve) => setTimeout(resolve, 1));
      progressCallback?.(60, "Processing STL data...");

      const geometry = loader.parse(arrayBuffer);

      await new Promise((resolve) => setTimeout(resolve, 1));
      progressCallback?.(80, "Validating STL...");

      this.validateGeometry(geometry);
      return geometry;
    }

    throw new Error("Advanced parsing only supports STL currently");
  }

  /**
   * Manual yields for older browsers
   */
  private static async parseWithManualYields(
    arrayBuffer: ArrayBuffer,
    fileName: string,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    // Add manual yield points during processing
    await new Promise((resolve) => setTimeout(resolve, 10));

    if (fileName.toLowerCase().endsWith(".stl")) {
      const { STLLoader } = await import(
        "three/examples/jsm/loaders/STLLoader"
      );
      const loader = new STLLoader();

      progressCallback?.(60, "Processing STL...");
      const geometry = loader.parse(arrayBuffer);

      return geometry;
    }

    throw new Error("File format not supported in chunked mode");
  }

  /**
   * Fast OBJ parsing optimized for large files
   */
  private static async fastOBJParse(
    text: string,
    progressCallback?: (progress: number, message: string) => void,
  ): Promise<THREE.BufferGeometry> {
    const lines = text.split("\n");
    const vertices: number[] = [];
    const faces: number[] = [];

    progressCallback?.(40, "Parsing vertices...");

    let lineCount = 0;
    const totalLines = lines.length;

    for (const line of lines) {
      lineCount++;

      // Show progress every 10000 lines
      if (lineCount % 10000 === 0) {
        const progress = 40 + (lineCount / totalLines) * 30;
        progressCallback?.(
          progress,
          `Processing line ${lineCount}/${totalLines}`,
        );

        // Yield every 10000 lines to prevent freezing
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      const trimmed = line.trim();

      if (trimmed.startsWith("v ")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 4) {
          vertices.push(
            parseFloat(parts[1]) || 0,
            parseFloat(parts[2]) || 0,
            parseFloat(parts[3]) || 0,
          );
        }
      } else if (trimmed.startsWith("f ")) {
        const parts = trimmed.split(/\s+/).slice(1);

        // Convert to triangles (simple fan triangulation)
        if (parts.length >= 3) {
          const indices = parts.map((part) => {
            const idx = parseInt(part.split("/")[0]) - 1; // OBJ is 1-indexed
            return Math.max(0, idx);
          });

          // Fan triangulation for polygons
          for (let i = 1; i < indices.length - 1; i++) {
            faces.push(indices[0], indices[i], indices[i + 1]);
          }
        }
      }
    }

    progressCallback?.(75, "Building geometry...");

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );

    if (faces.length > 0) {
      geometry.setIndex(faces);
    }

    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Optimize geometry for better performance
   */
  private static async optimizeGeometry(
    geometry: THREE.BufferGeometry,
  ): Promise<THREE.BufferGeometry> {
    // Basic optimizations
    this.basicOptimization(geometry);

    // Additional optimizations for large models
    if (geometry.attributes.position.count > 100000) {
      console.log("⚡ Applying large model optimizations...");

      // Merge duplicate vertices if not already indexed
      if (!geometry.index) {
        geometry = this.mergeVertices(geometry);
      }
    }

    return geometry;
  }

  /**
   * Basic geometry optimization
   */
  private static basicOptimization(geometry: THREE.BufferGeometry): void {
    // Compute bounding box and sphere for faster culling
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // Ensure normals are computed
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
  }

  /**
   * Merge duplicate vertices for better performance
   */
  private static mergeVertices(
    geometry: THREE.BufferGeometry,
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const vertices: Map<string, number> = new Map();
    const newPositions: number[] = [];
    const indexMap: number[] = [];

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Create a key for the vertex (with some tolerance)
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

      if (vertices.has(key)) {
        // Reuse existing vertex
        indexMap.push(vertices.get(key)!);
      } else {
        // Add new vertex
        const newIndex = newPositions.length / 3;
        vertices.set(key, newIndex);
        indexMap.push(newIndex);

        newPositions.push(x, y, z);
      }
    }

    // Create new geometry with merged vertices
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(newPositions, 3),
    );

    // Create index array
    const indices: number[] = [];
    for (let i = 0; i < indexMap.length; i += 3) {
      indices.push(indexMap[i], indexMap[i + 1], indexMap[i + 2]);
    }
    newGeometry.setIndex(indices);

    console.log(
      `⚡ Vertex optimization: ${positions.length / 3} → ${newPositions.length / 3} vertices`,
    );

    return newGeometry;
  }

  /**
   * Validate geometry has valid data
   */
  private static validateGeometry(geometry: THREE.BufferGeometry): void {
    if (
      !geometry.attributes.position ||
      geometry.attributes.position.count === 0
    ) {
      throw new Error("Geometry contains no valid vertex data");
    }

    const vertexCount = geometry.attributes.position.count;
    console.log(
      `✅ Geometry validated: ${vertexCount} vertices, ${geometry.index ? geometry.index.count / 3 : vertexCount / 3} triangles`,
    );
  }

  /**
   * Get current memory usage information
   */
  private static getMemoryUsage(): {
    used: number;
    available: number;
    isLowMemory: boolean;
  } {
    if ("memory" in performance && (performance as any).memory) {
      const memory = (performance as any).memory;
      const used = memory.usedJSHeapSize;
      const available = memory.jsHeapSizeLimit - used;

      return {
        used,
        available,
        isLowMemory: available < 100 * 1024 * 1024, // Less than 100MB available
      };
    }

    return {
      used: 0,
      available: 200 * 1024 * 1024, // Assume 200MB available
      isLowMemory: false,
    };
  }

  /**
   * Suggest garbage collection to browser
   */
  private static suggestGarbageCollection(): void {
    // Force garbage collection if possible (Chrome DevTools)
    if ((window as any).gc) {
      console.log("🗑️ Forcing garbage collection");
      (window as any).gc();
    }

    // Create temporary objects to trigger GC
    const temp = new Array(1000).fill(0).map(() => new Array(1000).fill(0));
    temp.length = 0; // Clear reference

    console.log("💾 Suggested garbage collection to free memory");
  }

  /**
   * Monitor memory during processing and warn if low
   */
  private static checkMemoryDuringProcessing(): void {
    const memory = this.getMemoryUsage();
    if (memory.isLowMemory) {
      console.warn(
        `⚠️ Low memory warning: ${(memory.available / 1024 / 1024).toFixed(1)}MB available`,
      );
      console.warn(
        "💡 Consider closing other browser tabs or restarting the browser",
      );
    }
  }
}
