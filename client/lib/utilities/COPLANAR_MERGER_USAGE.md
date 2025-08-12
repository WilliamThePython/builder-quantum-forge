# Unified CoplanarMerger Usage Guide

## Overview

The `CoplanarMerger` class provides a unified, robust methodology for merging coplanar triangles and polygons across the entire application. This ensures consistent behavior regardless of where coplanar merging is needed.

## Key Features

- **Unified Methodology**: Same algorithm used everywhere
- **Iterative Merging**: Multiple passes to merge all possible coplanar faces
- **Strict Validation**: Comprehensive coplanarity checks with automatic repair
- **Robust Configuration**: Optimized tolerances and limits
- **Automatic Repair**: Non-coplanar faces are split into valid triangles

## Configuration

```typescript
// Internal configuration (not user-configurable for consistency)
DISTANCE_TOLERANCE = 0.001        // Vertex/plane distance tolerance
NORMAL_TOLERANCE = 0.999          // Cos of ~2.5 degrees for normal similarity
MAX_MERGE_ITERATIONS = 10         // Maximum iterative merge passes
```

## Main Usage Patterns

### 1. Merge Existing Polygon Faces

```typescript
import { CoplanarMerger, PolygonFace } from './coplanarMerger';

const faces: PolygonFace[] = [/* your polygon faces */];
const mergedFaces = CoplanarMerger.mergeCoplanarFaces(faces);
```

### 2. Merge Triangles from Three.js Geometry

```typescript
import { CoplanarMerger } from './coplanarMerger';

const geometry: THREE.BufferGeometry = /* your geometry */;
const polygonFaces = CoplanarMerger.mergeGeometryTriangles(geometry);
```

## Current Integrations

### 1. Polygon Face Reconstruction (`polygonFaceReconstructor.ts`)
- **Usage**: Primary STL triangle → polygon conversion
- **Method**: `CoplanarMerger.mergeGeometryTriangles(geometry)`
- **Purpose**: Convert triangulated STL meshes to polygon representations

### 2. Post-Decimation Validation (`vertexRemovalStitcher.ts`)
- **Usage**: Validate polygon integrity after vertex decimation
- **Method**: `CoplanarMerger.mergeCoplanarFaces(faces)`
- **Purpose**: Ensure no non-coplanar polygons survive decimation

### 3. Model File Processing (`modelFileHandler.ts`)
- **Usage**: Automatic polygon reconstruction for STL files
- **Integration**: Via `PolygonFaceReconstructor.reconstructPolygonFaces()`
- **Purpose**: Enhance STL files with polygon metadata for better processing

## Process Flow

```
Input Faces
     ↓
1. Iterative Merging (multiple passes)
     ↓
2. Coplanarity Validation
     ↓
3. Automatic Repair (split non-coplanar faces)
     ↓
4. Final Optimization
     ↓
Output: Robust Polygon Faces
```

## Benefits

1. **Consistency**: Same methodology everywhere
2. **Robustness**: Comprehensive validation and repair
3. **Performance**: Optimized iterative algorithm
4. **Maintainability**: Single source of truth for coplanar merging
5. **Reliability**: Extensive error handling and fallbacks

## Type Definitions

```typescript
interface PolygonFace {
  type: 'triangle' | 'quad' | 'polygon';
  originalVertices: THREE.Vector3[];
  normal: THREE.Vector3;
  triangleIndices?: number[];
}

interface Triangle {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  index: number;
}
```

## Best Practices

1. **Always use CoplanarMerger**: Don't implement custom coplanar merging
2. **Trust the validation**: The merger automatically repairs invalid faces
3. **Use appropriate method**: 
   - `mergeCoplanarFaces()` for existing polygon faces
   - `mergeGeometryTriangles()` for Three.js geometries
4. **Monitor console output**: The merger provides detailed logging for debugging

## Error Handling

The merger is designed to be fault-tolerant:
- Invalid faces are automatically repaired by triangulation
- Non-coplanar polygons are split into coplanar triangles
- Edge cases are handled gracefully with fallbacks
- Comprehensive logging helps with debugging

## Migration Guide

If you have existing coplanar merging code:

1. **Replace custom merging logic** with `CoplanarMerger.mergeCoplanarFaces()`
2. **Remove duplicate implementations** of coplanarity checks
3. **Update to use standard PolygonFace interface**
4. **Remove custom tolerance configurations** (use CoplanarMerger's optimized values)

## Future Enhancements

The unified system makes it easy to enhance coplanar merging globally:
- Advanced polygon validation algorithms
- Performance optimizations
- Enhanced repair strategies
- Better handling of complex polygon cases

All enhancements will automatically benefit every part of the application that uses coplanar merging.
