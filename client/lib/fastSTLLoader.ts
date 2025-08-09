import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";

/**
 * Fast STL/OBJ loader that prioritizes speed over optimization
 * Focus: Import, Convert, Basic Process, View - no heavy optimization during load
 */
export class FastSTLLoader {
  /**
   * Load a file with minimal processing - just get it viewable quickly
   */
  static async loadFile(
    file: File,
    progressCallback?: (progress: number, stage: string, details: string) => void
  ): Promise<THREE.BufferGeometry> {
    const fileName = file.name.toLowerCase();
    const isSTL = fileName.endsWith(".stl");
    const isOBJ = fileName.endsWith(".obj");

    if (!isSTL && !isOBJ) {
      throw new Error(`Unsupported file format: ${fileName}`);
    }

    progressCallback?.(10, "Loading", "Reading file...");

    try {
      if (isSTL) {
        return await this.loadSTLFast(file, progressCallback);
      } else {
        return await this.loadOBJFast(file, progressCallback);
      }
    } catch (error) {
      console.error("FastSTLLoader error:", error);
      throw new Error(`Failed to load ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fast STL loading - minimal processing
   */
  private static async loadSTLFast(
    file: File,
    progressCallback?: (progress: number, stage: string, details: string) => void
  ): Promise<THREE.BufferGeometry> {
    progressCallback?.(20, "Reading", "Loading STL data...");

    // Simple file read - no chunking or complex optimization
    const arrayBuffer = await file.arrayBuffer();
    
    progressCallback?.(50, "Parsing", "Processing STL geometry...");

    // Basic STL parsing
    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer);

    progressCallback?.(80, "Preparing", "Finalizing geometry...");

    // Only essential processing
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Ensure we have a bounding box for the viewer
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    progressCallback?.(100, "Ready", "Model loaded successfully");

    return geometry;
  }

  /**
   * Fast OBJ loading - minimal processing
   */
  private static async loadOBJFast(
    file: File,
    progressCallback?: (progress: number, stage: string, details: string) => void
  ): Promise<THREE.BufferGeometry> {
    progressCallback?.(20, "Reading", "Loading OBJ data...");

    // Read as text for OBJ
    const text = await file.text();
    
    progressCallback?.(50, "Parsing", "Processing OBJ geometry...");

    // Basic OBJ parsing
    const loader = new OBJLoader();
    const object = loader.parse(text);

    // Extract geometry from the first mesh found
    let geometry: THREE.BufferGeometry | null = null;
    const geometries: THREE.BufferGeometry[] = [];

    console.log("🔍 Searching for geometry in OBJ object...");

    object.traverse((child) => {
      console.log("🔍 Found child:", child.type, child.constructor.name);

      if (child instanceof THREE.Mesh && child.geometry) {
        console.log("✅ Found mesh with geometry:", {
          vertices: child.geometry.attributes.position?.count || 0,
          hasNormals: !!child.geometry.attributes.normal,
          geometryType: child.geometry.constructor.name
        });

        geometries.push(child.geometry.clone());
      }
    });

    console.log(`🔍 Found ${geometries.length} geometries in OBJ file`);

    if (geometries.length === 0) {
      // Try to get geometry directly from the object
      if (object.children && object.children.length > 0) {
        for (const child of object.children) {
          if ((child as any).geometry) {
            console.log("✅ Found geometry in child object");
            geometries.push((child as any).geometry.clone());
          }
        }
      }
    }

    if (geometries.length === 0) {
      throw new Error("No geometry found in OBJ file. The file may be empty or contain no mesh data.");
    }

    // Use first geometry or merge multiple
    if (geometries.length === 1) {
      geometry = geometries[0];
    } else {
      console.log(`🔧 Merging ${geometries.length} geometries...`);
      geometry = this.mergeGeometries(geometries);
    }

    progressCallback?.(80, "Preparing", "Finalizing geometry...");

    // Only essential processing
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    progressCallback?.(100, "Ready", "Model loaded successfully");

    return geometry;
  }

  /**
   * Simple geometry merger - no optimization
   */
  private static mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    
    if (mergedNormals.some(n => n !== 0)) {
      merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    }

    return merged;
  }

  /**
   * Check if a file is likely to load quickly
   */
  static canLoadQuickly(file: File): boolean {
    const sizeInMB = file.size / (1024 * 1024);
    
    // Files under 5MB should load very quickly
    // Files under 15MB should load reasonably fast
    return sizeInMB < 15;
  }

  /**
   * Get estimated load time for user feedback
   */
  static getEstimatedLoadTime(file: File): string {
    const sizeInMB = file.size / (1024 * 1024);
    
    if (sizeInMB < 1) return "< 1 second";
    if (sizeInMB < 5) return "< 5 seconds";
    if (sizeInMB < 10) return "5-10 seconds";
    if (sizeInMB < 20) return "10-20 seconds";
    return "20+ seconds";
  }
}
