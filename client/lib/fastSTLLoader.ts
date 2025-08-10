import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";

export class FastSTLLoader {
  static async loadFile(
    file: File,
    progressCallback?: (
      progress: number,
      stage: string,
      details: string,
    ) => void,
  ): Promise<THREE.BufferGeometry> {
    const fileName = file.name.toLowerCase();
    const isSTL = fileName.endsWith(".stl");
    const isOBJ = fileName.endsWith(".obj");

    if (!isSTL && !isOBJ) {
      throw new Error(
        `Unsupported file format: ${fileName}. Only STL and OBJ files are supported.`,
      );
    }

    progressCallback?.(10, "Loading", "Reading file...");

    try {
      if (isSTL) {
        return await this.loadSTLFast(file, progressCallback);
      } else {
        return await this.loadOBJFast(file, progressCallback);
      }
    } catch (error) {
      throw new Error(
        `Failed to load ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private static async loadSTLFast(
    file: File,
    progressCallback?: (
      progress: number,
      stage: string,
      details: string,
    ) => void,
  ): Promise<THREE.BufferGeometry> {
    progressCallback?.(20, "Reading", "Loading STL data...");

    const arrayBuffer = file.size > 1024 * 1024
      ? await this.loadFileInChunks(file, progressCallback)
      : await file.arrayBuffer();

    progressCallback?.(50, "Parsing", "Processing STL geometry...");

    // Suppress STL loader console errors for malformed faces
    const originalConsoleError = console.error;
    const stlErrors: string[] = [];
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      if (message.includes('THREE.STLLoader: Something isn\'t right')) {
        stlErrors.push(message);
        // Don't spam console with STL validation errors
        return;
      }
      originalConsoleError.apply(console, args);
    };

    try {
      const loader = new STLLoader();
      const geometry = loader.parse(arrayBuffer);

      // Restore console.error
      console.error = originalConsoleError;

      // Log summary of STL issues if any
      if (stlErrors.length > 0) {
        console.warn(`STL file has ${stlErrors.length} malformed faces - normals will be recomputed`);
      }

      progressCallback?.(80, "Preparing", "Finalizing geometry...");

      // Always recompute normals for STL files to fix any malformed faces
      geometry.computeVertexNormals();
    } catch (error) {
      // Restore console.error in case of exception
      console.error = originalConsoleError;
      throw error;
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    progressCallback?.(100, "Ready", "Model loaded successfully");

    return geometry;
  }

  private static async loadOBJFast(
    file: File,
    progressCallback?: (
      progress: number,
      stage: string,
      details: string,
    ) => void,
  ): Promise<THREE.BufferGeometry> {
    progressCallback?.(20, "Reading", "Loading OBJ data...");

    const text = file.size > 1024 * 1024
      ? await this.loadOBJFileInChunks(file, progressCallback)
      : await file.text();

    progressCallback?.(50, "Parsing", "Processing OBJ geometry...");

    const loader = new OBJLoader();
    const object = loader.parse(text);

    let geometry: THREE.BufferGeometry | null = null;
    const geometries: THREE.BufferGeometry[] = [];

    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometries.push(child.geometry.clone());
      }
    });

    if (geometries.length === 0) {
      if (object.children && object.children.length > 0) {
        for (const child of object.children) {
          if ((child as any).geometry) {
            geometries.push((child as any).geometry.clone());
          }
        }
      }
    }

    if (geometries.length === 0) {
      if ((object as any).geometry) {
        geometries.push((object as any).geometry.clone());
      } else {
        throw new Error(
          `No geometry found in OBJ file. Found ${object.children.length} children but no mesh data.`,
        );
      }
    }

    if (geometries.length === 1) {
      geometry = geometries[0];
    } else {
      geometry = this.mergeGeometries(geometries);
    }

    progressCallback?.(80, "Preparing", "Finalizing geometry...");

    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    progressCallback?.(100, "Ready", "Model loaded successfully");

    return geometry;
  }

  private static mergeGeometries(
    geometries: THREE.BufferGeometry[],
  ): THREE.BufferGeometry {
    let totalVertices = 0;

    for (const geo of geometries) {
      totalVertices += geo.attributes.position.count;
    }

    const mergedPositions = new Float32Array(totalVertices * 3);
    const mergedNormals = new Float32Array(totalVertices * 3);

    let offset = 0;

    for (const geo of geometries) {
      const positions = geo.attributes.position.array as Float32Array;
      const normals = geo.attributes.normal?.array as Float32Array;

      mergedPositions.set(positions, offset * 3);
      if (normals) {
        mergedNormals.set(normals, offset * 3);
      }

      offset += geo.attributes.position.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute(
      "position",
      new THREE.BufferAttribute(mergedPositions, 3),
    );

    if (mergedNormals.some((n) => n !== 0)) {
      merged.setAttribute(
        "normal",
        new THREE.BufferAttribute(mergedNormals, 3),
      );
    }

    return merged;
  }

  static canLoadQuickly(file: File): boolean {
    const sizeInMB = file.size / (1024 * 1024);
    return sizeInMB < 15;
  }

  static getEstimatedLoadTime(file: File): string {
    const sizeInMB = file.size / (1024 * 1024);

    if (sizeInMB < 1) return "< 1 second";
    if (sizeInMB < 5) return "< 5 seconds";
    if (sizeInMB < 10) return "5-10 seconds";
    if (sizeInMB < 20) return "10-20 seconds";
    return "20+ seconds";
  }

  private static async loadFileInChunks(
    file: File,
    progressCallback?: (
      progress: number,
      stage: string,
      details: string,
    ) => void,
  ): Promise<ArrayBuffer> {
    const chunkSize = 1024 * 1024;
    const chunks: Uint8Array[] = [];

    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const arrayBuffer = await chunk.arrayBuffer();
      chunks.push(new Uint8Array(arrayBuffer));

      const progress = 20 + (offset / file.size) * 30;
      progressCallback?.(
        progress,
        "Reading",
        `Loading... ${Math.round(progress)}%`,
      );

      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  private static async loadOBJFileInChunks(
    file: File,
    progressCallback?: (
      progress: number,
      stage: string,
      details: string,
    ) => void,
  ): Promise<string> {
    const arrayBuffer = await this.loadFileInChunks(file, progressCallback);

    const decoder = new TextDecoder("utf-8");
    return decoder.decode(arrayBuffer);
  }
}
