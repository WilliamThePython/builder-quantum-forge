#!/bin/bash

echo "🐍 Setting up Python Mesh Processing Service..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Start the service
echo "🚀 Starting Mesh Processing Service on port 8001..."
python mesh_processor.py
