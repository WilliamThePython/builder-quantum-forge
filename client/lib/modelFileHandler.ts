import * as THREE from 'three';
import { GeometryCleanup, CleanupResults } from './geometryCleanup';
import { OBJConverter, OBJConversionResult } from './objConverter';
import { PolygonFaceReconstructor } from './polygonFaceReconstructor';
import { STLGeometryValidator } from './stlGeometryValidator';

export interface ProcessedModel {
  geometry: THREE.BufferGeometry;
  originalFormat: 'stl' | 'obj';
  fileName: string;
  objString: string; // Always maintained for internal processing
  stlBuffer?: ArrayBuffer; // Optional, for STL format support
  cleanupResults: CleanupResults;
  validationResults: any;
  processingTime: number;
}

export class ModelFileHandler {
  /**
   * Main entry point for file processing according to specifications:
   * 1. Accept STL or OBJ
   * 2. Mandatory geometry cleanup
   * 3. Convert STL to OBJ for internal processing
   * 4. Maintain both formats
   */
  static async processFile(file: File): Promise<ProcessedModel> {
    console.log(`🚀 Processing file: ${file.name}`);
    const startTime = Date.now();
    
    // Validate file format
    const fileName = file.name.toLowerCase();
    const isSTL = fileName.endsWith('.stl');
    const isOBJ = fileName.endsWith('.obj');
    
    if (!isSTL && !isOBJ) {
      throw new Error('Unsupported file format. Please upload STL or OBJ files only.');
    }
    
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('File too large. Maximum size: 50MB');
    }
    
    let geometry: THREE.BufferGeometry;
    let originalFormat: 'stl' | 'obj';
    
    if (isSTL) {
      geometry = await this.loadSTLFile(file);
      originalFormat = 'stl';
    } else {
      geometry = await this.loadOBJFile(file);
      originalFormat = 'obj';
    }
    
    // MANDATORY: Geometry cleanup routine (as per specifications)
    console.log('🧹 Running mandatory geometry cleanup...');
    const cleanupResults = GeometryCleanup.cleanGeometry(geometry);
    
    // Center and scale the geometry
    this.normalizeGeometry(geometry);
    
    // Polygon face reconstruction (for better part detection)
    if (originalFormat === 'stl') {
      console.log('🔄 Reconstructing polygon faces from STL triangulation...');
      const reconstructedFaces = PolygonFaceReconstructor.reconstructPolygonFaces(geometry);
      if (reconstructedFaces.length > 0) {
        PolygonFaceReconstructor.applyReconstructedFaces(geometry, reconstructedFaces);
        console.log(`✅ Reconstructed ${reconstructedFaces.length} polygon faces`);
      }
    }
    
    // Convert to OBJ format for internal processing (always maintain OBJ)
    console.log('📄 Converting to OBJ format for internal processing...');
    const objConversion = OBJConverter.geometryToOBJ(geometry);
    
    // Validate geometry
    console.log('✅ Validating processed geometry...');
    const validationResults = STLGeometryValidator.validateGeometry(geometry);
    
    const processingTime = Date.now() - startTime;
    
    const result: ProcessedModel = {
      geometry,
      originalFormat,
      fileName: file.name,
      objString: objConversion.objString,
      cleanupResults,
      validationResults,
      processingTime
    };
    
    // Store STL buffer if original was STL (for export purposes)
    if (originalFormat === 'stl') {
      result.stlBuffer = await file.arrayBuffer();
    }
    
    console.log(`🎉 File processing completed in ${processingTime}ms`);
    console.log(GeometryCleanup.generateCleanupSummary(cleanupResults));
    
    return result;
  }
  
  /**
   * Load STL file using Three.js STLLoader
   */
  private static async loadSTLFile(file: File): Promise<THREE.BufferGeometry> {
    console.log('📖 Loading STL file...');
    
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader');
    const loader = new STLLoader();
    
    const arrayBuffer = await file.arrayBuffer();
    const geometry = loader.parse(arrayBuffer);
    
    if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
      throw new Error('STL file contains no valid geometry data');
    }
    
    console.log(`✅ STL loaded: ${geometry.attributes.position.count / 3} vertices`);
    return geometry;
  }
  
  /**
   * Load OBJ file using Three.js OBJLoader
   */
  private static async loadOBJFile(file: File): Promise<THREE.BufferGeometry> {
    console.log('📖 Loading OBJ file...');
    
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader');
    const loader = new OBJLoader();
    
    const text = await file.text();
    const object = loader.parse(text);
    
    // Extract geometry from the loaded object
    let geometry: THREE.BufferGeometry | null = null;
    
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        if (!geometry) {
          geometry = child.geometry.clone();
        } else {
          // Merge multiple geometries if present
          const merged = geometry.clone();
          merged.merge(child.geometry);
          geometry = merged;
        }
      }
    });
    
    if (!geometry || !geometry.attributes.position || geometry.attributes.position.count === 0) {
      throw new Error('OBJ file contains no valid geometry data');
    }
    
    console.log(`✅ OBJ loaded: ${geometry.attributes.position.count / 3} vertices`);
    return geometry;
  }
  
  /**
   * Normalize geometry (center and scale)
   */
  private static normalizeGeometry(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingBox();
    
    if (!geometry.boundingBox) {
      throw new Error('Unable to compute geometry bounds');
    }
    
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    if (maxDimension === 0) {
      throw new Error('Geometry has zero dimensions');
    }
    
    const scale = 50 / maxDimension; // Scale to fit in a 50-unit cube
    geometry.scale(scale, scale, scale);
    
    geometry.computeVertexNormals();
  }
  
  /**
   * Export model in specified format
   */
  static exportModel(
    model: ProcessedModel, 
    format: 'stl' | 'obj', 
    filename?: string
  ): { data: string | ArrayBuffer; filename: string; mimeType: string } {
    
    const baseName = filename || model.fileName.replace(/\.(stl|obj)$/i, '');
    
    if (format === 'obj') {
      const objData = OBJConverter.geometryToOBJ(model.geometry);
      return {
        data: objData.objString,
        filename: `${baseName}_Processed.obj`,
        mimeType: 'text/plain'
      };
    } else {
      // Export as STL
      const exporter = new THREE.STLExporter();
      const stlString = exporter.parse(model.geometry);
      return {
        data: stlString,
        filename: `${baseName}_Processed.stl`,
        mimeType: 'application/octet-stream'
      };
    }
  }
  
  /**
   * Export parts list with proper naming
   */
  static exportParts(
    model: ProcessedModel,
    format: 'stl' | 'obj',
    parts: any[]
  ): { data: string; filename: string; mimeType: string } {
    
    const baseName = model.fileName.replace(/\.(stl|obj)$/i, '');
    
    if (format === 'obj') {
      const objData = OBJConverter.geometryToOBJWithParts(model.geometry, parts);
      return {
        data: objData,
        filename: `${baseName}_PartsList.obj`,
        mimeType: 'text/plain'
      };
    } else {
      // For STL parts, we need individual files (would need ZIP)
      // For now, return combined STL
      const exporter = new THREE.STLExporter();
      const stlString = exporter.parse(model.geometry);
      return {
        data: stlString,
        filename: `${baseName}_PartsList.stl`,
        mimeType: 'application/octet-stream'
      };
    }
  }
}
