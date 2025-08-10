import * as THREE from "three";
import { FastSTLLoader } from "./fastSTLLoader";

export async function loadModelFile(
  file: File,
  updateProgress: (
    percentage: number,
    stage: string,
    details: string,
  ) => Promise<void>,
): Promise<THREE.BufferGeometry> {
  const fileName = file.name.toLowerCase();
  const isSTL = fileName.endsWith(".stl");
  const isOBJ = fileName.endsWith(".obj");

  if (!isSTL && !isOBJ) {
    throw new Error(
      `Invalid file format: "${file.name}". Please select a valid STL or OBJ file.`,
    );
  }

  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size: 50MB`,
    );
  }

  await updateProgress(10, "Loading", "Preparing to load file...");

  try {
    const geometry = await FastSTLLoader.loadFile(
      file,
      (progress, stage, details) => {
        updateProgress(10 + progress * 0.6, stage, details);
      },
    );

    await updateProgress(75, "Finalizing", "Preparing geometry for viewing...");

    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (geometry.boundingBox) {
      const cachedBox = geometry.boundingBox.clone();
      const center = new THREE.Vector3();
      cachedBox.getCenter(center);

      if (center.length() > 0.1) {
        geometry.translate(-center.x, -center.y, -center.z);
        cachedBox.translate(-center.x, -center.y, -center.z);
        geometry.boundingBox = cachedBox;
        geometry.boundingSphere = null;
      }

      const size = new THREE.Vector3();
      cachedBox.getSize(size);
      const maxDimension = Math.max(size.x, size.y, size.z);

      if (maxDimension > 200) {
        const scale = 200 / maxDimension;
        geometry.scale(scale, scale, scale);
        cachedBox.min.multiplyScalar(scale);
        cachedBox.max.multiplyScalar(scale);
        geometry.boundingBox = cachedBox;
        geometry.boundingSphere = null;
      }
    }

    await updateProgress(100, "Complete", "Model loaded successfully");

    return geometry;
  } catch (error) {
    let errorMessage = "Unknown error occurred";

    if (error instanceof Error) {
      errorMessage = error.message;
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
      errorMessage =
        (error as any).message || String(error) || "Object error occurred";
    }

    throw new Error(`Failed to load ${file.name}: ${errorMessage}`);
  }
}
