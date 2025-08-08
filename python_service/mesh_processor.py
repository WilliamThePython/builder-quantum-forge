#!/usr/bin/env python3
"""
Mesh processing service using Open3D for reliable quadric decimation
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

app = FastAPI(title="Mesh Processing Service", version="1.0.0")

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Mesh Processing Service using Open3D", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "open3d_version": o3d.__version__}

@app.post("/decimate")
async def decimate_mesh(
    file: UploadFile = File(...),
    target_reduction: float = 0.5,
    preserve_boundary: bool = True
):
    """
    Decimate a mesh using Open3D's quadric decimation algorithm
    
    Args:
        file: STL or OBJ mesh file
        target_reduction: Reduction ratio (0.0 to 1.0, where 0.5 = 50% reduction)
        preserve_boundary: Whether to preserve boundary edges
    
    Returns:
        Decimated mesh in STL format
    """
    
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    if target_reduction < 0.0 or target_reduction > 0.95:
        raise HTTPException(status_code=400, detail="Target reduction must be between 0.0 and 0.95")
    
    # Determine file format
    file_extension = file.filename.lower().split('.')[-1]
    if file_extension not in ['stl', 'obj']:
        raise HTTPException(status_code=400, detail="Only STL and OBJ files are supported")

    preserve_polygon_structure = file_extension == 'obj'
    
    try:
        # Read uploaded file
        file_content = await file.read()
        
        # Create temporary file for Open3D to read
        with tempfile.NamedTemporaryFile(suffix=f'.{file_extension}', delete=False) as temp_input:
            temp_input.write(file_content)
            temp_input_path = temp_input.name
        
        
        # Load mesh using Open3D
        if file_extension == 'stl':
            mesh = o3d.io.read_triangle_mesh(temp_input_path)
        else:  # obj
            mesh = o3d.io.read_triangle_mesh(temp_input_path)
        
        # Clean up temporary input file
        os.unlink(temp_input_path)
        
        if len(mesh.vertices) == 0:
            raise HTTPException(status_code=400, detail="Failed to load mesh - file may be corrupted")
        
        original_vertices = len(mesh.vertices)
        original_triangles = len(mesh.triangles)


        # Calculate target triangle count
        target_triangles = max(4, int(original_triangles * (1 - target_reduction)))

        
        # Apply quadric decimation using Open3D

        decimated_mesh = mesh.simplify_quadric_decimation(
            target_number_of_triangles=target_triangles,
            maximum_error=1e30,  # Allow any error to reach target count
            boundary_weight=1.0 if preserve_boundary else 0.1
        )

        # For polygon-preserving mode, try to merge coplanar triangles back into polygons
            # Note: This is a complex operation and may not perfectly restore original polygons
            # but will attempt to reduce triangulation
        
        final_vertices = len(decimated_mesh.vertices)
        final_triangles = len(decimated_mesh.triangles)
        actual_reduction = 1 - (final_vertices / original_vertices)
        
        
        # Ensure mesh has vertex normals for proper rendering
        if not decimated_mesh.has_vertex_normals():
            decimated_mesh.compute_vertex_normals()
        
        # Export in same format as input to preserve structure
        output_extension = file_extension
        with tempfile.NamedTemporaryFile(suffix=f'.{output_extension}', delete=False) as temp_output:
            temp_output_path = temp_output.name

        success = o3d.io.write_triangle_mesh(temp_output_path, decimated_mesh)

        if not success:
            raise HTTPException(status_code=500, detail="Failed to export decimated mesh")

        # Read the output file
        if output_extension == 'obj':
            with open(temp_output_path, 'r') as f:
                output_content = f.read().encode('utf-8')
            media_type = "text/plain"
        else:
            with open(temp_output_path, 'rb') as f:
                output_content = f.read()
            media_type = "application/octet-stream"

        # Clean up temporary output file
        os.unlink(temp_output_path)

        output_filename = f"decimated_{file.filename}"

        # Return the decimated mesh
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
        # Log error for debugging if needed
        pass
        raise HTTPException(status_code=500, detail=f"Decimation failed: {str(e)}")

if __name__ == "__main__":
    # Starting Mesh Processing Service
    uvicorn.run(app, host="0.0.0.0", port=8001)
