import * as THREE from "three";
import { FastSTLLoader } from "./fastSTLLoader";

/**
 * Simplified loading function for the STL Context
 * Replaces the complex loading logic with a streamlined approach
 */
export async function loadModelFile(
  file: File,
  updateProgress: (
    percentage: number,
    stage: string,
    details: string,
  ) => Promise<void>,
): Promise<THREE.BufferGeometry> {
  console.log("🚀 Starting simplified file loading:", {
    fileName: file.name,
    fileSize: file.size,
    fileSizeMB: (file.size / 1024 / 1024).toFixed(2),
  });

  // Basic file validation
  const fileName = file.name.toLowerCase();
  const isSTL = fileName.endsWith(".stl");
  const isOBJ = fileName.endsWith(".obj");

  if (!isSTL && !isOBJ) {
    throw new Error(
      `Invalid file format: "${file.name}". Please select a valid STL or OBJ file.`,
    );
  }

  // Basic size check - increased limit for better UX
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size: 50MB`,
    );
  }

  await updateProgress(10, "Loading", "Preparing to load file...");

  try {
    // Use the fast loader
    const geometry = await FastSTLLoader.loadFile(
      file,
      (progress, stage, details) => {
        updateProgress(10 + progress * 0.6, stage, details); // 10-70% range
      },
    );

    await updateProgress(75, "Finalizing", "Preparing geometry for viewing...");

    // Minimal post-processing for viewing
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Ensure bounds are computed
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // Center and scale the geometry (Quick Win 2: Cache bounding box calculations)
    if (geometry.boundingBox) {
      const cachedBox = geometry.boundingBox.clone();
      const center = new THREE.Vector3();
      cachedBox.getCenter(center);

      // Only translate to center if significantly off-center
      if (center.length() > 0.1) {
        geometry.translate(-center.x, -center.y, -center.z);
        // Update cached box instead of recomputing
        cachedBox.translate(-center.x, -center.y, -center.z);
        geometry.boundingBox = cachedBox;
        geometry.boundingSphere = null; // Will be computed when needed
      }

      // Scale to reasonable size if needed
      const size = new THREE.Vector3();
      cachedBox.getSize(size);
      const maxDimension = Math.max(size.x, size.y, size.z);

      if (maxDimension > 200) {
        const scale = 200 / maxDimension;
        geometry.scale(scale, scale, scale);
        // Update cached box with scale instead of recomputing
        cachedBox.min.multiplyScalar(scale);
        cachedBox.max.multiplyScalar(scale);
        geometry.boundingBox = cachedBox;
        geometry.boundingSphere = null; // Will be computed when needed
      }
    }

    await updateProgress(100, "Complete", "Model loaded successfully");

    console.log(
      `✅ File loaded successfully: ${geometry.attributes.position.count.toLocaleString()} vertices`,
    );

    return geometry;
  } catch (error) {
    console.error("❌ File loading failed:", error);

    let errorMessage = "Unknown error occurred";

    if (error instanceof Error) {
      errorMessage = error.message;
      // Provide helpful error messages
      if (errorMessage.includes("timeout")) {
        throw new Error(
          `File loading timeout - try a smaller file or close other browser tabs`,
        );
      } else if (
        errorMessage.includes("memory") ||
        errorMessage.includes("Memory")
      ) {
        throw new Error(
          `Not enough memory to load this file - try a smaller file or restart your browser`,
        );
      } else {
        throw new Error(`Failed to load ${file.name}: ${errorMessage}`);
      }
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error && typeof error === "object") {
      // Handle cases where error might be an object
      errorMessage =
        (error as any).message || String(error) || "Object error occurred";
    }

    throw new Error(`Failed to load ${file.name}: ${errorMessage}`);
  }
}
