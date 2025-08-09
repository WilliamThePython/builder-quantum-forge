import { EdgeAdjacentMerger, PolygonFace } from "./edgeAdjacentMerger";
import { FlatSurfaceMerger } from "./flatSurfaceMerger";
import { ProceduralFaceMerger } from "./proceduralFaceMerger";

/**
 * Hybrid Coplanar Merger
 * Two-stage approach:
 * 1. Edge-adjacent merging for safe boundary-respecting merging
 * 2. Flat surface detection for large planar areas (gear faces, etc.)
 */
export class HybridCoplanarMerger {
  
  /**
   * Apply both edge-adjacent merging and flat surface merging
   */
  static mergeCoplanarTriangles(geometry: THREE.BufferGeometry): PolygonFace[] {
    console.log('🔗 HYBRID COPLANAR MERGER - Two-stage approach');
    
    // Stage 1: Extract faces from geometry
    const faces = EdgeAdjacentMerger.extractTrianglesFromGeometry(geometry);
    console.log(`   Stage 1: Extracted ${faces.length} faces from geometry`);
    
    // Stage 2: Edge-adjacent merging (safe boundary-respecting merging)
    const edgeMergedFaces = EdgeAdjacentMerger.groupEdgeAdjacentTriangles(faces);
    console.log(`   Stage 2: Edge-adjacent merging → ${edgeMergedFaces.length} faces`);
    
    // Stage 3: Flat surface merging (for large planar areas)
    const finalFaces = FlatSurfaceMerger.mergeFlatsurfaces(edgeMergedFaces);
    console.log(`   Stage 3: Flat surface merging → ${finalFaces.length} faces`);
    
    console.log(`✅ Hybrid merging complete: ${faces.length} → ${finalFaces.length} faces`);
    return finalFaces;
  }
  
  /**
   * Apply only flat surface merging (skip edge-adjacent)
   */
  static mergeFlatSurfacesOnly(geometry: THREE.BufferGeometry): PolygonFace[] {
    const faces = EdgeAdjacentMerger.extractTrianglesFromGeometry(geometry);
    return FlatSurfaceMerger.mergeFlatsurfaces(faces);
  }
}
