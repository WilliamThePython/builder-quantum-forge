FROM python:3.9-slim

# Install system dependencies for Open3D
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY mesh_processor.py .

# Expose port
EXPOSE 8001

# Run the service
CMD ["python", "mesh_processor.py"]
