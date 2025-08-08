import { useContext } from 'react';
import { createContext } from 'react';

// Re-export the STL context type and create a safe accessor
import { useSTL as useSTLOriginal } from '../context/STLContext';

/**
 * Safe STL context hook that provides fallback during development/hot reloading
 */
export const useSafeSTL = () => {
  try {
    return useSTLOriginal();
  } catch (error) {
    // During development, hot reloading can cause temporary context issues
    if (process.env.NODE_ENV === 'development') {
      console.warn('STL Context temporarily unavailable (likely due to hot reload), using fallback');
      
      // Return a minimal fallback object to prevent crashes
      return {
        geometry: null,
        fileName: null,
        isLoading: false,
        loadingProgress: { percentage: 0, stage: '', details: '' },
        error: null,
        errors: [],
        viewerSettings: { randomColors: false, wireframe: false, backgroundColor: '#1a1a1a' },
        processedModel: null,
        originalFormat: null,
        objString: null,
        cleanupResults: null,
        toolMode: 'default' as const,
        isProcessingTool: false,
        highlightedTriangle: null,
        triangleStats: null,
        decimationPainterMode: false,
        setDecimationPainterMode: () => {},
        isDecimating: false,
        decimateEdge: async () => ({ success: false, message: 'Context not available' }),
        loadModelFromFile: async () => {},
        loadDefaultSTL: async () => {},
        updateViewerSettings: () => {},
        exportSTL: () => {},
        exportOBJ: () => {},
        exportParts: async () => {},
        clearError: () => {},
        clearErrorById: () => {},
        addError: () => {},
        setToolMode: () => {},
        reducePoints: async () => ({ success: false, message: 'Context not available' }),
        getGeometryStats: () => ({ vertices: 0, triangles: 0 }),
        getDetailedGeometryStats: () => ({}),
        setHighlightedTriangle: () => {},
        hasBackup: false,
        createBackup: () => {},
        restoreFromBackup: () => {},
      };
    }
    
    // In production, re-throw the error
    throw error;
  }
};

/**
 * Hook to check if STL context is available
 */
export const useSTLAvailable = (): boolean => {
  try {
    useSTLOriginal();
    return true;
  } catch {
    return false;
  }
};
