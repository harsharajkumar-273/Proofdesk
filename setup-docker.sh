#!/bin/bash
# setup-docker.sh - Set up the MRA Docker build environment

set -e

echo "======================================"
echo "MRA Docker Build Environment Setup"
echo "======================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo ""
    echo "Please install Docker first:"
    echo "  Mac: https://docs.docker.com/desktop/install/mac-install/"
    echo "  Linux: https://docs.docker.com/engine/install/"
    echo "  Windows: https://docs.docker.com/desktop/install/windows-install/"
    exit 1
fi

echo "✅ Docker is installed"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker is running"

# Create docker directory if it doesn't exist
mkdir -p docker
mkdir -p builds

# Copy Docker files if they don't exist
if [ ! -f "docker/Dockerfile" ]; then
    echo "Creating docker/Dockerfile..."
    cat > docker/Dockerfile << 'DOCKERFILE'
# Dockerfile for MRA Build Sandbox
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install base dependencies
RUN apt-get update && apt-get install -y \
    locales \
    build-essential \
    git \
    curl \
    wget \
    unzip \
    python3 \
    python3-pip \
    python3-venv \
    xsltproc \
    libxml2-utils \
    texlive-latex-base \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-xetex \
    inkscape \
    pdf2svg \
    imagemagick \
    ghostscript \
    fontforge \
    python3-fontforge \
    nodejs \
    npm \
    default-jdk \
    make \
    rsync \
    && rm -rf /var/lib/apt/lists/*

# Set up locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8

# Install Python packages
RUN pip3 install --no-cache-dir \
    scons \
    mako \
    jinja2 \
    lxml \
    pretext \
    pygments \
    requests

# Create vagrant user (for ILA compatibility)
RUN useradd -m -s /bin/bash vagrant

WORKDIR /build

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bash"]
DOCKERFILE
fi

if [ ! -f "docker/docker-entrypoint.sh" ]; then
    echo "Creating docker/docker-entrypoint.sh..."
    cat > docker/docker-entrypoint.sh << 'ENTRYPOINT'
#!/bin/bash
set -e

if [ "$1" = "build" ]; then
    REPO_PATH="${2:-/build/repo}"
    OUTPUT_PATH="${3:-/build/output}"
    
    echo "=== MRA Docker Build ==="
    cd "$REPO_PATH"
    
    # Initialize git submodules
    if [ -f ".gitmodules" ]; then
        git submodule update --init --recursive 2>/dev/null || true
    fi
    
    # Detect and run build system
    if [ -f "SConstruct" ]; then
        echo "Running SCons..."
        scons static 2>&1 || scons 2>&1 || true
    elif [ -f "Makefile" ]; then
        echo "Running Make..."
        make html 2>&1 || make 2>&1 || true
    elif [ -f "project.ptx" ]; then
        echo "Running PreTeXt..."
        pretext build web 2>&1 || true
    elif [ -f "package.json" ]; then
        echo "Running npm..."
        npm install && npm run build 2>&1 || true
    fi
    
    # Copy outputs
    mkdir -p "$OUTPUT_PATH"
    for dir in static output build _build dist public; do
        [ -d "$REPO_PATH/$dir" ] && cp -r "$REPO_PATH/$dir"/* "$OUTPUT_PATH/" 2>/dev/null || true
    done
    
    echo "Build complete!"
else
    exec "$@"
fi
ENTRYPOINT
    chmod +x docker/docker-entrypoint.sh
fi

# Build the Docker image
echo ""
echo "Building Docker image (this may take 5-10 minutes on first run)..."
echo ""

docker build -t mra-pretext-builder:latest ./docker

echo ""
echo "======================================"
echo "✅ Setup Complete!"
echo "======================================"
echo ""
echo "The Docker build environment is ready."
echo ""
echo "To test it manually:"
echo "  docker run --rm -v \$(pwd)/test-repo:/repo -v \$(pwd)/builds/output:/output mra-pretext-builder:latest build /repo /output"
echo ""
echo "To start the MRA app with Docker builds:"
echo "  npm run dev"
echo ""
