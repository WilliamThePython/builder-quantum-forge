# Python Mesh Processing Service

This service provides reliable mesh decimation using Open3D's proven quadric decimation algorithm.

## Features

- **Robust Quadric Decimation**: Uses Open3D's battle-tested implementation
- **Preserve Mesh Integrity**: Maintains solid structure without breaking faces
- **Fast Processing**: Optimized for performance
- **Easy Integration**: REST API compatible with the frontend

## Quick Start

### Option 1: Docker (Recommended)

```bash
cd python_service
docker-compose up -d
```

The service will be available at `http://localhost:8001`

### Option 2: Local Python Environment

```bash
cd python_service

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the service
python mesh_processor.py
```

## Usage

### Health Check

```bash
curl http://localhost:8001/health
```

### Decimate Mesh

```bash
curl -X POST \
  -F "file=@your_mesh.stl" \
  -F "target_reduction=0.5" \
  -F "preserve_boundary=true" \
  http://localhost:8001/decimate \
  --output decimated_mesh.stl
```

## API Documentation

### POST /decimate

**Parameters:**
- `file`: STL or OBJ mesh file (required)
- `target_reduction`: Reduction ratio 0.0-0.95 (default: 0.5)
- `preserve_boundary`: Whether to preserve boundary edges (default: true)

**Response:**
- Decimated mesh in STL format
- Headers with statistics:
  - `X-Original-Vertices`: Original vertex count
  - `X-Final-Vertices`: Final vertex count
  - `X-Original-Triangles`: Original triangle count
  - `X-Final-Triangles`: Final triangle count
  - `X-Reduction-Achieved`: Actual reduction ratio

## Integration with Frontend

The frontend automatically detects and uses the Python service when available:

1. **Python Service Available**: Uses Open3D for reliable decimation
2. **Python Service Unavailable**: Falls back to JavaScript implementation

To check service status in browser console:
```javascript
// Service will show: "🐍 Python service is healthy"
// Or: "🐍 Python service not available"
```

## Why Python/Open3D?

- **Proven Algorithm**: Open3D's quadric decimation is industry-standard
- **Robust Implementation**: Handles edge cases that JavaScript struggles with
- **Preserves Geometry**: Maintains mesh integrity and topology
- **Performance**: Optimized C++ backend with Python interface

## Troubleshooting

### Service Won't Start
- Check Python 3.9+ is installed
- Ensure all dependencies installed correctly
- Check port 8001 is available

### Frontend Can't Connect
- Verify service is running: `curl http://localhost:8001/health`
- Check CORS settings in the service
- Ensure no firewall blocking port 8001

### Poor Decimation Results
- Try lower reduction values (0.1-0.3)
- Enable boundary preservation
- Check input mesh quality

## Development

### Adding New Features

1. Add endpoint to `mesh_processor.py`
2. Add corresponding method to `client/lib/pythonMeshProcessor.ts`
3. Update STL manipulator to use new functionality

### Testing

```bash
# Start service
python mesh_processor.py

# Test with sample STL file
curl -X POST \
  -F "file=@test_mesh.stl" \
  -F "target_reduction=0.3" \
  http://localhost:8001/decimate \
  --output test_decimated.stl
```
