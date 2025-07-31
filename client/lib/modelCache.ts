import * as THREE from 'three';
import { PolygonGeometryBuilder } from './polygonGeometryBuilder';
import { OBJConverter } from './objConverter';

/**
 * Model cache system for pre-generated procedural models
 * Saves models as OBJ strings to preserve polygon structure
 */
export class ModelCache {
  private static cache = new Map<string, { objString: string; geometry: THREE.BufferGeometry }>();
  
  /**
   * Pre-generate all random models and cache them as OBJ
   */
  static initializeCache(): void {
    console.log('🏗️ Pre-generating and caching random models...');
    
    const models = this.getModelDefinitions();
    
    models.forEach(model => {
      try {
        // Generate geometry
        const polygonGeometry = model.generator();
        const bufferGeometry = PolygonGeometryBuilder.toBufferGeometry(polygonGeometry);
        
        // Convert to OBJ to preserve polygon structure
        const objString = OBJConverter.geometryToOBJ(bufferGeometry, model.name);
        
        // Cache both OBJ string and geometry
        this.cache.set(model.name, {
          objString,
          geometry: bufferGeometry.clone()
        });
        
        console.log(`✅ Cached ${model.name} (${bufferGeometry.attributes.position.count} vertices)`);
      } catch (error) {
        console.error(`❌ Failed to cache ${model.name}:`, error);
      }
    });
    
    console.log(`🎉 Model cache initialized with ${this.cache.size} models`);
  }
  
  /**
   * Get a random model from cache
   */
  static getRandomModel(): { name: string; geometry: THREE.BufferGeometry; objString: string } | null {
    if (this.cache.size === 0) {
      console.warn('Model cache not initialized, generating on demand');
      this.initializeCache();
    }
    
    const modelNames = Array.from(this.cache.keys());
    const randomName = modelNames[Math.floor(Math.random() * modelNames.length)];
    const cached = this.cache.get(randomName);
    
    if (!cached) return null;
    
    return {
      name: randomName,
      geometry: cached.geometry.clone(), // Clone to avoid mutations
      objString: cached.objString
    };
  }
  
  /**
   * Get specific model from cache
   */
  static getModel(name: string): { geometry: THREE.BufferGeometry; objString: string } | null {
    const cached = this.cache.get(name);
    if (!cached) return null;
    
    return {
      geometry: cached.geometry.clone(),
      objString: cached.objString
    };
  }
  
  /**
   * Get all available model names
   */
  static getAvailableModels(): string[] {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Define all the random models to cache
   */
  private static getModelDefinitions() {
    return [
      // Basic geometric shapes
      {
        name: 'cube-polygon.stl',
        generator: () => PolygonGeometryBuilder.createBoxWithQuads(20, 20, 20)
      },
      {
        name: 'tetrahedron.stl',
        generator: () => PolygonGeometryBuilder.createTetrahedron(18)
      },
      {
        name: 'octahedron.stl',
        generator: () => PolygonGeometryBuilder.createOctahedron(15)
      },
      {
        name: 'dodecahedron.stl',
        generator: () => PolygonGeometryBuilder.createDodecahedron(12)
      },
      {
        name: 'icosahedron.stl',
        generator: () => PolygonGeometryBuilder.createIcosahedron(16)
      },
      
      // Prisms and cylinders
      {
        name: 'triangular-prism.stl',
        generator: () => PolygonGeometryBuilder.createTriangularPrism(12, 25)
      },
      {
        name: 'hexagonal-prism.stl',
        generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(15, 15, 20, 6)
      },
      {
        name: 'pentagonal-prism.stl',
        generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(12, 12, 18, 5)
      },
      {
        name: 'octagonal-cylinder.stl',
        generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(12, 12, 25, 8)
      },
      
      // Cones
      {
        name: 'octagonal-cone.stl',
        generator: () => PolygonGeometryBuilder.createConeWithPolygons(15, 25, 8)
      },
      {
        name: 'irregular-cone.stl',
        generator: () => PolygonGeometryBuilder.createConeWithPolygons(12, 25, 10)
      },
      
      // Complex shapes
      {
        name: 'stepped-pyramid.stl',
        generator: () => PolygonGeometryBuilder.createSteppedPyramid(25, 4, 20)
      },
      {
        name: 'l-bracket.stl',
        generator: () => PolygonGeometryBuilder.createLBracket(25, 20, 10, 4)
      },
      {
        name: 'washer-ring.stl',
        generator: () => PolygonGeometryBuilder.createWasher(15, 8, 5, 16)
      },
      {
        name: 'simple-house.stl',
        generator: () => PolygonGeometryBuilder.createSimpleHouse(20, 15, 25, 10)
      },
      {
        name: 'gear-wheel.stl',
        generator: () => PolygonGeometryBuilder.createGearWheel(10, 16, 6, 12)
      },
      {
        name: 'wedge.stl',
        generator: () => PolygonGeometryBuilder.createWedge(15, 15, 10)
      },
      {
        name: 'star-shape.stl',
        generator: () => PolygonGeometryBuilder.createStarShape(18, 10, 8, 6)
      },
      {
        name: 'cross-shape.stl',
        generator: () => PolygonGeometryBuilder.createCrossShape(16, 20, 6, 10)
      },
      {
        name: 'ellipsoid.stl',
        generator: () => PolygonGeometryBuilder.createEllipsoid(12, 18, 15, 10)
      },
      
      // Irregular variants
      {
        name: 'irregular-prism-1.stl',
        generator: () => PolygonGeometryBuilder.createBoxWithQuads(25, 15, 20)
      },
      {
        name: 'irregular-prism-2.stl',
        generator: () => PolygonGeometryBuilder.createBoxWithQuads(30, 25, 12)
      },
      {
        name: 'irregular-prism-3.stl',
        generator: () => PolygonGeometryBuilder.createBoxWithQuads(18, 22, 25)
      },
      {
        name: 'irregular-triangular-prism.stl',
        generator: () => PolygonGeometryBuilder.createTriangularPrism(15, 28)
      },
      {
        name: 'irregular-cylinder.stl',
        generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(14, 16, 22, 12)
      },
      {
        name: 'truncated-pyramid.stl',
        generator: () => PolygonGeometryBuilder.createCylinderWithPolygons(8, 18, 20, 6)
      }
    ];
  }
}
