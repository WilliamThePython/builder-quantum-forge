#!/usr/bin/env python3
"""
Test script to verify the mesh processing service works correctly
"""

import requests
import tempfile
import os

def create_test_obj():
    """Create a simple test OBJ file with quad faces"""
    obj_content = """# Test cube with quad faces
v -1.0 -1.0 -1.0
v  1.0 -1.0 -1.0
v  1.0  1.0 -1.0
v -1.0  1.0 -1.0
v -1.0 -1.0  1.0
v  1.0 -1.0  1.0
v  1.0  1.0  1.0
v -1.0  1.0  1.0

# Quad faces (this preserves polygon structure!)
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 5 1 4 8
"""
    return obj_content

def test_service():
    """Test the mesh processing service"""
    
    # Check service health
    try:
        response = requests.get("http://localhost:8001/health")
        if response.ok:
            health = response.json()
            print(f"✅ Service healthy: {health}")
        else:
            print("❌ Service not healthy")
            return
    except Exception as e:
        print(f"❌ Service not accessible: {e}")
        print("   Make sure to start the service with: python mesh_processor.py")
        return
    
    # Create test OBJ file
    obj_content = create_test_obj()
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.obj', delete=False) as f:
        f.write(obj_content)
        test_file_path = f.name
        
    # Test decimation
    
    try:
        with open(test_file_path, 'rb') as f:
            files = {'file': ('test_cube.obj', f, 'text/plain')}
            data = {
                'target_reduction': '0.3',
                'preserve_boundary': 'true'
            }
            
            response = requests.post(
                "http://localhost:8001/decimate",
                files=files,
                data=data
            )
        
        if response.ok:
            print("✅ Decimation successful!")
            
            # Save result
            output_path = 'decimated_test_cube.obj'
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            # Check if result is valid OBJ
            try:
                result_content = response.content.decode('utf-8')
                if 'f ' in result_content and 'v ' in result_content:
                    
                    # Count faces in result
                    face_lines = [line for line in result_content.split('\n') if line.strip().startswith('f ')]
                else:
                    print("⚠️ Result doesn't appear to be valid OBJ")
            except:
                print("⚠️ Could not decode result as text")
            
        else:
            print(f"❌ Decimation failed: {response.status_code}")
            print(f"   Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
    
    finally:
        # Clean up
        os.unlink(test_file_path)
        # Cleaned up test file

if __name__ == "__main__":
    test_service()
