#!/usr/bin/env python3
"""
Mesh Processing Service using Open3D

This service provides high-quality mesh decimation using Open3D's quadric edge collapse algorithm.
It's designed specifically for processing user-uploaded STL and OBJ files while preserving
important geometric features and avoiding common artifacts.

Key Features:
- Conservative quadric decimation to avoid crimped features
- Flat shading preservation (no vertex normals) for crisp face appearance
- Support for both STL and OBJ formats
- Robust error handling and validation
- RESTful API with CORS support for web integration

Author: Builder.io STL Processing Pipeline
Version: 1.0.0
"""

import io
import numpy as np
import open3d as o3d
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
from typing import Optional
import tempfile
import os

# Initialize FastAPI application with metadata
app = FastAPI(
    title="Mesh Processing Service",
    version="1.0.0",
    description="Open3D-powered mesh decimation service for STL and OBJ files"
)

# Configure CORS middleware to allow frontend communication
# This enables the JavaScript client to make requests to this Python service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Note: In production, specify your exact domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """
    Root endpoint providing service information.
    Used by clients to verify the service is running and accessible.
    """
    return {"message": "Mesh Processing Service using Open3D", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """
    Health check endpoint for service monitoring.
    Returns service status and Open3D version for debugging.
    Used by the frontend to determine if Python decimation is available.
    """
    return {"status": "healthy", "open3d_version": o3d.__version__}

@app.post("/decimate")
async def decimate_mesh(
    file: UploadFile = File(...),
    target_reduction: float = 0.5
):
    """
    Decimate a mesh using Open3D's quadric edge collapse algorithm.

    This endpoint performs high-quality mesh decimation while preserving important
    geometric features. The algorithm uses conservative settings to avoid common
    artifacts like crimped legs, holes, or severe shape distortion.

    Process:
    1. Upload validation and format detection
    2. Temporary file creation for Open3D processing
    3. Mesh loading and validation
    4. Conservative quadric decimation with error control
    5. Export without vertex normals (preserves flat shading)
    6. Return processed mesh with statistics headers

    Args:
        file: Uploaded mesh file (STL or OBJ format)
        target_reduction: Reduction ratio (0.0 to 0.95)
                         0.5 = 50% reduction in triangle count
                         Higher values = more aggressive reduction

    Returns:
        Response containing the decimated mesh file with statistics in headers:
        - X-Original-Vertices: Original vertex count
        - X-Final-Vertices: Final vertex count after decimation
        - X-Original-Triangles: Original triangle count
        - X-Final-Triangles: Final triangle count
        - X-Reduction-Achieved: Actual reduction ratio achieved
        - X-Format: Output file format (STL or OBJ)

    Raises:
        HTTPException: If file is invalid, reduction ratio out of bounds, or processing fails
    """
    
    # Input validation: Ensure file was provided
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate reduction ratio: 0.95 max to prevent over-decimation
    if target_reduction < 0.0 or target_reduction > 0.95:
        raise HTTPException(status_code=400, detail="Target reduction must be between 0.0 and 0.95")

    # Extract and validate file format from extension
    file_extension = file.filename.lower().split('.')[-1]
    if file_extension not in ['stl', 'obj']:
        raise HTTPException(status_code=400, detail="Only STL and OBJ files are supported")

    # OBJ files may contain polygon data that should be preserved when possible
    preserve_polygon_structure = file_extension == 'obj'
    
    try:
        # Read uploaded file content into memory
        file_content = await file.read()

        # Create temporary file for Open3D processing
        # Open3D requires file paths, so we create a temporary file on disk
        with tempfile.NamedTemporaryFile(suffix=f'.{file_extension}', delete=False) as temp_input:
            temp_input.write(file_content)
            temp_input_path = temp_input.name
        
        
        # Load mesh using Open3D's triangle mesh reader
        # Both STL and OBJ files are loaded as triangle meshes
        # Note: OBJ polygons are automatically triangulated by Open3D
        if file_extension == 'stl':
            mesh = o3d.io.read_triangle_mesh(temp_input_path)
        else:  # obj
            mesh = o3d.io.read_triangle_mesh(temp_input_path)

        # Clean up temporary input file immediately after loading
        os.unlink(temp_input_path)
        
        # Validate mesh was loaded successfully
        if len(mesh.vertices) == 0:
            raise HTTPException(status_code=400, detail="Failed to load mesh - file may be corrupted")

        # Record original mesh statistics for comparison
        original_vertices = len(mesh.vertices)
        original_triangles = len(mesh.triangles)

        # Calculate target triangle count based on reduction ratio
        # Ensure minimum of 4 triangles to maintain a valid 3D shape (tetrahedron)
        target_triangles = max(4, int(original_triangles * (1 - target_reduction)))

        
        # Apply quadric edge collapse decimation with conservative settings
        # These parameters are tuned to avoid common artifacts in user-uploaded models:
        # - Crimped features (legs, arms, thin parts)
        # - Holes or topology changes
        # - Severe shape distortion
        decimated_mesh = mesh.simplify_quadric_decimation(
            target_number_of_triangles=target_triangles,
            maximum_error=0.01,  # Low error threshold to preserve shape fidelity
            boundary_weight=0.3   # Moderate boundary preservation to maintain edges
        )

        # Calculate final mesh statistics
        final_vertices = len(decimated_mesh.vertices)
        final_triangles = len(decimated_mesh.triangles)

        # Calculate actual reduction achieved (may differ from target due to constraints)
        actual_reduction = 1 - (final_vertices / original_vertices)
        
        
        # IMPORTANT: Do not compute vertex normals
        # The frontend expects flat shading for crisp per-face colors
        # Vertex normals would cause smooth shading and color blending artifacts

        # Prepare output file in same format as input to maintain compatibility
        output_extension = file_extension
        with tempfile.NamedTemporaryFile(suffix=f'.{output_extension}', delete=False) as temp_output:
            temp_output_path = temp_output.name

        # Write decimated mesh to temporary output file
        success = o3d.io.write_triangle_mesh(temp_output_path, decimated_mesh)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to export decimated mesh")

        # Read output file content with appropriate encoding
        # OBJ files are text format, STL files are binary
        if output_extension == 'obj':
            with open(temp_output_path, 'r') as f:
                output_content = f.read().encode('utf-8')
            media_type = "text/plain"
        else:  # STL binary format
            with open(temp_output_path, 'rb') as f:
                output_content = f.read()
            media_type = "application/octet-stream"

        # Clean up temporary output file
        os.unlink(temp_output_path)

        # Generate output filename with decimation prefix
        output_filename = f"decimated_{file.filename}"

        # Return decimated mesh with comprehensive statistics in response headers
        # These headers allow the frontend to track decimation effectiveness
        return Response(
            content=output_content,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={output_filename}",
                "X-Original-Vertices": str(original_vertices),
                "X-Final-Vertices": str(final_vertices),
                "X-Original-Triangles": str(original_triangles),
                "X-Final-Triangles": str(final_triangles),
                "X-Reduction-Achieved": f"{actual_reduction:.3f}",
                "X-Format": output_extension.upper()
            }
        )
        
    except Exception as e:
        # Handle any unexpected errors during processing
        # In production, you might want to log these errors for debugging
        raise HTTPException(status_code=500, detail=f"Decimation failed: {str(e)}")

if __name__ == "__main__":
    """
    Start the mesh processing service when run directly.

    Configuration:
    - Host: 0.0.0.0 (accept connections from any IP)
    - Port: 8001 (default port for the mesh processing service)

    The service will be available at http://localhost:8001
    Health check endpoint: http://localhost:8001/health
    Decimation endpoint: http://localhost:8001/decimate
    """
    print("Starting Mesh Processing Service...")
    print("Service will be available at http://localhost:8001")
    print("Health check: http://localhost:8001/health")
    uvicorn.run(app, host="0.0.0.0", port=8001)
