/**
 * STL File Validator - Security and validation utility for STL file uploads
 */

export interface STLValidationResult {
  isValid: boolean;
  error?: string;
  fileInfo?: {
    name: string;
    size: number;
    type: string;
    isBinary: boolean;
    estimatedTriangles?: number;
  };
}

export class STLValidator {
  // Maximum file size: 50MB
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024;
  
  // Minimum file size: 1KB (too small files are likely invalid)
  private static readonly MIN_FILE_SIZE = 1024;
  
  // Maximum triangle count: 2 million triangles
  private static readonly MAX_TRIANGLES = 2_000_000;
  
  // Allowed file extensions
  private static readonly ALLOWED_EXTENSIONS = ['.stl'];
  
  // STL file headers
  private static readonly BINARY_STL_HEADER_SIZE = 80;
  private static readonly ASCII_STL_HEADER = 'solid';

  /**
   * Comprehensive STL file validation
   */
  static async validateSTLFile(file: File): Promise<STLValidationResult> {
    try {
      // Basic file validation
      const basicValidation = this.validateBasicFileProperties(file);
      if (!basicValidation.isValid) {
        return basicValidation;
      }

      // Read file content for deeper validation
      const arrayBuffer = await file.arrayBuffer();
      const contentValidation = this.validateFileContent(arrayBuffer, file.name);
      
      if (!contentValidation.isValid) {
        return contentValidation;
      }

      return {
        isValid: true,
        fileInfo: {
          name: file.name,
          size: file.size,
          type: file.type,
          isBinary: contentValidation.fileInfo!.isBinary,
          estimatedTriangles: contentValidation.fileInfo!.estimatedTriangles
        }
      };

    } catch (error) {
      return {
        isValid: false,
        error: 'Failed to validate file: ' + (error instanceof Error ? error.message : 'Unknown error')
      };
    }
  }

  /**
   * Validate basic file properties
   */
  private static validateBasicFileProperties(file: File): STLValidationResult {
    // Check file name and extension
    if (!file.name || file.name.trim() === '') {
      return { isValid: false, error: 'File name is required' };
    }

    const fileName = file.name.toLowerCase();
    const hasValidExtension = this.ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext));
    
    if (!hasValidExtension) {
      return { 
        isValid: false, 
        error: `Only STL files are allowed. Received: ${this.getFileExtension(file.name)}` 
      };
    }

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File too large. Maximum size: ${this.formatFileSize(this.MAX_FILE_SIZE)}. Your file: ${this.formatFileSize(file.size)}` 
      };
    }

    if (file.size < this.MIN_FILE_SIZE) {
      return { 
        isValid: false, 
        error: `File too small. Minimum size: ${this.formatFileSize(this.MIN_FILE_SIZE)}` 
      };
    }

    // Check MIME type if available (not always reliable, but adds a layer)
    if (file.type && !this.isAllowedMimeType(file.type)) {
      console.warn(`Unexpected MIME type: ${file.type}, but proceeding with content validation`);
    }

    return { isValid: true };
  }

  /**
   * Validate file content structure
   */
  private static validateFileContent(arrayBuffer: ArrayBuffer, fileName: string): STLValidationResult {
    const uint8Array = new Uint8Array(arrayBuffer);
    
    if (uint8Array.length === 0) {
      return { isValid: false, error: 'File is empty' };
    }

    // Check if it's binary or ASCII STL
    const isBinary = this.isBinarySTL(uint8Array);
    
    if (isBinary) {
      return this.validateBinarySTL(uint8Array, fileName);
    } else {
      return this.validateAsciiSTL(uint8Array, fileName);
    }
  }

  /**
   * Determine if STL is binary format
   */
  private static isBinarySTL(uint8Array: Uint8Array): boolean {
    // If file is too small to be binary STL, it must be ASCII
    if (uint8Array.length < this.BINARY_STL_HEADER_SIZE + 4) {
      return false;
    }

    // Check if it starts with "solid" (ASCII indicator)
    const header = new TextDecoder('utf-8', { fatal: false }).decode(uint8Array.slice(0, 5));
    if (header.toLowerCase().startsWith('solid')) {
      // Could still be binary if the header coincidentally starts with "solid"
      // Check triangle count in binary format
      try {
        const triangleCount = new DataView(uint8Array.buffer).getUint32(80, true);
        const expectedSize = 80 + 4 + (triangleCount * 50);
        
        // If file size matches binary format exactly, it's binary
        return uint8Array.length === expectedSize;
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate binary STL format
   */
  private static validateBinarySTL(uint8Array: Uint8Array, fileName: string): STLValidationResult {
    try {
      if (uint8Array.length < this.BINARY_STL_HEADER_SIZE + 4) {
        return { isValid: false, error: 'Invalid binary STL: file too small' };
      }

      // Read triangle count
      const dataView = new DataView(uint8Array.buffer);
      const triangleCount = dataView.getUint32(this.BINARY_STL_HEADER_SIZE, true);

      // Validate triangle count
      if (triangleCount > this.MAX_TRIANGLES) {
        return { 
          isValid: false, 
          error: `Too many triangles: ${triangleCount.toLocaleString()}. Maximum allowed: ${this.MAX_TRIANGLES.toLocaleString()}` 
        };
      }

      if (triangleCount === 0) {
        return { isValid: false, error: 'STL file contains no triangles' };
      }

      // Calculate expected file size
      const expectedSize = this.BINARY_STL_HEADER_SIZE + 4 + (triangleCount * 50);
      
      if (uint8Array.length !== expectedSize) {
        return { 
          isValid: false, 
          error: `Invalid binary STL: file size mismatch. Expected: ${expectedSize}, got: ${uint8Array.length}` 
        };
      }

      // Validate triangle data structure
      let offset = this.BINARY_STL_HEADER_SIZE + 4;
      for (let i = 0; i < Math.min(triangleCount, 100); i++) { // Check first 100 triangles
        if (offset + 50 > uint8Array.length) {
          return { isValid: false, error: 'Invalid binary STL: truncated triangle data' };
        }
        
        // Each triangle: 12 bytes (normal) + 36 bytes (vertices) + 2 bytes (attribute)
        offset += 50;
      }

      return {
        isValid: true,
        fileInfo: {
          name: fileName,
          size: uint8Array.length,
          type: 'application/octet-stream',
          isBinary: true,
          estimatedTriangles: triangleCount
        }
      };

    } catch (error) {
      return { 
        isValid: false, 
        error: 'Failed to parse binary STL: ' + (error instanceof Error ? error.message : 'Unknown error') 
      };
    }
  }

  /**
   * Validate ASCII STL format
   */
  private static validateAsciiSTL(uint8Array: Uint8Array, fileName: string): STLValidationResult {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(uint8Array);
      
      // Basic structure validation
      if (!text.toLowerCase().startsWith('solid')) {
        return { isValid: false, error: 'Invalid ASCII STL: must start with "solid"' };
      }

      if (!text.toLowerCase().includes('endsolid')) {
        return { isValid: false, error: 'Invalid ASCII STL: missing "endsolid"' };
      }

      // Count triangles (rough estimate)
      const facetMatches = text.match(/facet\s+normal/gi);
      const estimatedTriangles = facetMatches ? facetMatches.length : 0;

      if (estimatedTriangles === 0) {
        return { isValid: false, error: 'ASCII STL contains no triangles' };
      }

      if (estimatedTriangles > this.MAX_TRIANGLES) {
        return { 
          isValid: false, 
          error: `Too many triangles: ~${estimatedTriangles.toLocaleString()}. Maximum allowed: ${this.MAX_TRIANGLES.toLocaleString()}` 
        };
      }

      // Check for balanced facet/endfacet pairs
      const endfacetMatches = text.match(/endfacet/gi);
      if (!endfacetMatches || endfacetMatches.length !== estimatedTriangles) {
        return { isValid: false, error: 'Invalid ASCII STL: unmatched facet/endfacet pairs' };
      }

      return {
        isValid: true,
        fileInfo: {
          name: fileName,
          size: uint8Array.length,
          type: 'text/plain',
          isBinary: false,
          estimatedTriangles: estimatedTriangles
        }
      };

    } catch (error) {
      return { 
        isValid: false, 
        error: 'Failed to parse ASCII STL: ' + (error instanceof Error ? error.message : 'Invalid UTF-8 encoding') 
      };
    }
  }

  /**
   * Helper methods
   */
  private static getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot >= 0 ? fileName.substring(lastDot) : '(no extension)';
  }

  private static formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} bytes`;
  }

  private static isAllowedMimeType(mimeType: string): boolean {
    // STL files might have various MIME types depending on the system
    const allowedTypes = [
      'application/octet-stream',
      'application/sla',
      'application/vnd.ms-pki.stl',
      'model/stl',
      'text/plain', // ASCII STL files
      '', // Empty MIME type is common for STL files
    ];
    
    return allowedTypes.includes(mimeType.toLowerCase());
  }
}

/**
 * Quick validation function for simple use cases
 */
export async function validateSTLFile(file: File): Promise<STLValidationResult> {
  return STLValidator.validateSTLFile(file);
}
