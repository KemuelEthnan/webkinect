// WebSocket connection
var socket = null;
var connected = false;
var scanning = false;

// Three.js scene
var scene, camera, renderer, controls;
var pointCloud = null;
var meshObject = null;

// Point cloud data
var allPoints = [];
var currentFrameCount = 0;
var pointSize = 2;
var downsample = 1;
var minDepth = 850;
var maxDepth = 2000;

// Initialize Three.js scene
function initScene() {
    const container = document.getElementById('canvas-container');
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    
    // Camera
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
    camera.position.set(0, 0, 5);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);
    
    // Axes helper
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);
    
    // Simple orbit controls (manual implementation)
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    
    renderer.domElement.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    renderer.domElement.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
            camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * 0.01);
            camera.lookAt(0, 0, 0);
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    
    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const scale = e.deltaY > 0 ? 1.1 : 0.9;
        camera.position.multiplyScalar(scale);
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
    
    // Start render loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// WebSocket functions
function updateStatus(isConnected) {
    connected = isConnected;
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const startScanBtn = document.getElementById('startScanBtn');
    
    if (isConnected) {
        indicator.classList.add('connected');
        statusText.textContent = 'Terhubung ke server';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        startScanBtn.disabled = false;
    } else {
        indicator.classList.remove('connected');
        statusText.textContent = 'Tidak terhubung';
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        startScanBtn.disabled = true;
        stopScan();
    }
}

function connect() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Already connected');
        return;
    }
    
    console.log('Connecting to ws://127.0.0.1:8181...');
    socket = new WebSocket("ws://127.0.0.1:8181");
    
    socket.onopen = function() {
        console.log('Connected to server');
        updateStatus(true);
        // Request raw depth data mode
        socket.send("RawDepth");
    };
    
    socket.onclose = function() {
        console.log('Disconnected from server');
        updateStatus(false);
    };
    
    socket.onerror = function(error) {
        console.error('WebSocket error:', error);
        updateStatus(false);
        alert('Error: Tidak dapat terhubung ke server. Pastikan server.exe sudah berjalan.');
    };
    
    socket.onmessage = function(event) {
        // Raw depth data (JSON string)
        if (typeof event.data === "string") {
            try {
                const data = JSON.parse(event.data);
                if (data.points && scanning) {
                    processPointCloud(data);
                }
            } catch (e) {
                console.error('Error parsing depth data:', e);
            }
        }
    };
}

function disconnect() {
    if (socket) {
        socket.close();
        socket = null;
    }
    updateStatus(false);
    stopScan();
}

function startScan() {
    if (!connected) {
        alert('Harap hubungkan ke server terlebih dahulu!');
        return;
    }
    
    scanning = true;
    allPoints = [];
    currentFrameCount = 0;
    
    document.getElementById('scanStatus').textContent = 'Scanning...';
    document.getElementById('startScanBtn').disabled = true;
    document.getElementById('stopScanBtn').disabled = false;
    document.getElementById('generateMeshBtn').disabled = true;
    document.getElementById('exportBtn').disabled = true;
    document.getElementById('clearBtn').disabled = false;
    
    // Clear previous point cloud
    if (pointCloud) {
        scene.remove(pointCloud);
        pointCloud = null;
    }
    if (meshObject) {
        scene.remove(meshObject);
        meshObject = null;
    }
}

function stopScan() {
    scanning = false;
    document.getElementById('scanStatus').textContent = 'Selesai';
    document.getElementById('startScanBtn').disabled = false;
    document.getElementById('stopScanBtn').disabled = true;
    
    if (allPoints.length > 0) {
        document.getElementById('generateMeshBtn').disabled = false;
    }
}

function processPointCloud(data) {
    if (!scanning) return;
    
    currentFrameCount++;
    document.getElementById('frameCount').textContent = currentFrameCount;
    
    // Filter and downsample points
    const filteredPoints = [];
    for (let i = 0; i < data.points.length; i += downsample) {
        const point = data.points[i];
        const depth = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) * 1000; // Convert to mm
        
        if (depth >= minDepth && depth <= maxDepth) {
            filteredPoints.push(new THREE.Vector3(point.x, point.y, point.z));
        }
    }
    
    allPoints = allPoints.concat(filteredPoints);
    document.getElementById('pointCount').textContent = allPoints.length.toLocaleString();
    
    // Update point cloud visualization
    updatePointCloudVisualization();
}

function updatePointCloudVisualization() {
    if (allPoints.length === 0) return;
    
    // Limit visualization to last 50000 points for performance
    const pointsToShow = allPoints.slice(-50000);
    
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pointsToShow.length * 3);
    
    for (let i = 0; i < pointsToShow.length; i++) {
        positions[i * 3] = pointsToShow[i].x;
        positions[i * 3 + 1] = pointsToShow[i].y;
        positions[i * 3 + 2] = pointsToShow[i].z;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0x00ff00,
        size: pointSize,
        sizeAttenuation: true
    });
    
    if (pointCloud) {
        scene.remove(pointCloud);
    }
    
    pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);
}

function generateMesh() {
    if (allPoints.length === 0) {
        alert('Tidak ada point cloud data! Silakan scan terlebih dahulu.');
        return;
    }
    
    document.getElementById('generateMeshBtn').disabled = true;
    document.getElementById('scanStatus').textContent = 'Generating mesh...';
    
    // Use simple mesh generation method
    setTimeout(() => {
        generateSimpleMesh();
        document.getElementById('generateMeshBtn').disabled = false;
    }, 100);
}

function generateSimpleMesh() {
    // Simple mesh generation: create triangles from nearby points
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    
    // Sample points for mesh generation (limit to 5000 for performance)
    const maxPoints = 5000;
    const samplePoints = allPoints.length > maxPoints 
        ? allPoints.filter((_, i) => i % Math.floor(allPoints.length / maxPoints) === 0)
        : allPoints;
    
    // Create vertices
    for (let point of samplePoints) {
        vertices.push(point.x, point.y, point.z);
    }
    
    // Improved triangulation: use spatial hashing for better performance
    const threshold = 0.15; // Distance threshold for connecting points (in meters)
    const maxTriangles = 10000; // Limit number of triangles
    
    // Create spatial grid for faster neighbor lookup
    const gridSize = 0.2;
    const grid = new Map();
    
    // Add points to grid
    samplePoints.forEach((point, idx) => {
        const gx = Math.floor(point.x / gridSize);
        const gy = Math.floor(point.y / gridSize);
        const gz = Math.floor(point.z / gridSize);
        const key = `${gx},${gy},${gz}`;
        
        if (!grid.has(key)) {
            grid.set(key, []);
        }
        grid.get(key).push(idx);
    });
    
    // Generate triangles from nearby points
    for (let i = 0; i < samplePoints.length - 2 && indices.length < maxTriangles * 3; i++) {
        const p1 = samplePoints[i];
        const gx = Math.floor(p1.x / gridSize);
        const gy = Math.floor(p1.y / gridSize);
        const gz = Math.floor(p1.z / gridSize);
        
        // Check neighboring grid cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${gx + dx},${gy + dy},${gz + dz}`;
                    const neighbors = grid.get(key) || [];
                    
                    for (let j of neighbors) {
                        if (j <= i) continue;
                        const p2 = samplePoints[j];
                        const dist12 = p1.distanceTo(p2);
                        
                        if (dist12 < threshold) {
                            for (let k of neighbors) {
                                if (k <= j || indices.length >= maxTriangles * 3) continue;
                                const p3 = samplePoints[k];
                                const dist13 = p1.distanceTo(p3);
                                const dist23 = p2.distanceTo(p3);
                                
                                if (dist13 < threshold && dist23 < threshold) {
                                    // Check if triangle is valid (not too flat)
                                    const v1 = new THREE.Vector3().subVectors(p2, p1);
                                    const v2 = new THREE.Vector3().subVectors(p3, p1);
                                    const normal = new THREE.Vector3().crossVectors(v1, v2);
                                    
                                    if (normal.length() > 0.001) { // Avoid degenerate triangles
                                        indices.push(i, j, k);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    if (indices.length > 0) {
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
    } else {
        // Fallback: create simple mesh from all points as vertices
        console.warn('No triangles generated, creating point-based mesh');
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    }
    
    const material = new THREE.MeshPhongMaterial({
        color: 0x00aaff,
        side: THREE.DoubleSide,
        flatShading: true,
        wireframe: false
    });
    
    if (meshObject) {
        scene.remove(meshObject);
    }
    
    meshObject = new THREE.Mesh(geometry, material);
    scene.add(meshObject);
    
    const vertexCount = vertices.length / 3;
    const faceCount = indices.length / 3;
    
    document.getElementById('meshVertices').textContent = vertexCount.toLocaleString();
    document.getElementById('meshFaces').textContent = faceCount.toLocaleString();
    document.getElementById('exportBtn').disabled = false;
    document.getElementById('scanStatus').textContent = faceCount > 0 ? 'Mesh generated' : 'Mesh generated (no triangles)';
    
    if (pointCloud) {
        pointCloud.visible = false;
    }
}

function exportSTL() {
    if (!meshObject) {
        alert('Tidak ada mesh untuk di-export! Silakan generate mesh terlebih dahulu.');
        return;
    }
    
    const geometry = meshObject.geometry;
    
    // Convert Three.js geometry to STL format
    let stlContent = 'solid KinectScan\n';
    
    const positions = geometry.attributes.position;
    const indices = geometry.index ? geometry.index.array : null;
    
    if (indices) {
        // Indexed geometry
        for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3;
            const i2 = indices[i + 1] * 3;
            const i3 = indices[i + 2] * 3;
            
            const v1 = new THREE.Vector3(positions.array[i1], positions.array[i1 + 1], positions.array[i1 + 2]);
            const v2 = new THREE.Vector3(positions.array[i2], positions.array[i2 + 1], positions.array[i2 + 2]);
            const v3 = new THREE.Vector3(positions.array[i3], positions.array[i3 + 1], positions.array[i3 + 2]);
            
            const normal = new THREE.Vector3()
                .subVectors(v2, v1)
                .cross(new THREE.Vector3().subVectors(v3, v1))
                .normalize();
            
            stlContent += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
            stlContent += `    outer loop\n`;
            stlContent += `      vertex ${v1.x} ${v1.y} ${v1.z}\n`;
            stlContent += `      vertex ${v2.x} ${v2.y} ${v2.z}\n`;
            stlContent += `      vertex ${v3.x} ${v3.y} ${v3.z}\n`;
            stlContent += `    endloop\n`;
            stlContent += `  endfacet\n`;
        }
    } else {
        // Non-indexed geometry
        for (let i = 0; i < positions.count; i += 3) {
            const i1 = i * 3;
            const i2 = (i + 1) * 3;
            const i3 = (i + 2) * 3;
            
            const v1 = new THREE.Vector3(positions.array[i1], positions.array[i1 + 1], positions.array[i1 + 2]);
            const v2 = new THREE.Vector3(positions.array[i2], positions.array[i2 + 1], positions.array[i2 + 2]);
            const v3 = new THREE.Vector3(positions.array[i3], positions.array[i3 + 1], positions.array[i3 + 2]);
            
            const normal = new THREE.Vector3()
                .subVectors(v2, v1)
                .cross(new THREE.Vector3().subVectors(v3, v1))
                .normalize();
            
            stlContent += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
            stlContent += `    outer loop\n`;
            stlContent += `      vertex ${v1.x} ${v1.y} ${v1.z}\n`;
            stlContent += `      vertex ${v2.x} ${v2.y} ${v2.z}\n`;
            stlContent += `      vertex ${v3.x} ${v3.y} ${v3.z}\n`;
            stlContent += `    endloop\n`;
            stlContent += `  endfacet\n`;
        }
    }
    
    stlContent += 'endsolid KinectScan\n';
    
    // Download file
    const blob = new Blob([stlContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kinect_scan_${new Date().getTime()}.stl`;
    link.click();
    URL.revokeObjectURL(url);
    
    document.getElementById('scanStatus').textContent = 'STL exported!';
}

function clearScan() {
    allPoints = [];
    currentFrameCount = 0;
    
    if (pointCloud) {
        scene.remove(pointCloud);
        pointCloud = null;
    }
    
    if (meshObject) {
        scene.remove(meshObject);
        meshObject = null;
    }
    
    document.getElementById('pointCount').textContent = '0';
    document.getElementById('frameCount').textContent = '0';
    document.getElementById('meshVertices').textContent = '0';
    document.getElementById('meshFaces').textContent = '0';
    document.getElementById('scanStatus').textContent = 'Cleared';
    document.getElementById('generateMeshBtn').disabled = true;
    document.getElementById('exportBtn').disabled = true;
}

// Settings functions
function updatePointSize(value) {
    pointSize = parseFloat(value);
    document.getElementById('pointSizeValue').textContent = value;
    if (pointCloud) {
        pointCloud.material.size = pointSize;
    }
}

function updateDownsample(value) {
    downsample = parseInt(value);
    document.getElementById('downsampleValue').textContent = value;
}

function updateMinDepth(value) {
    minDepth = parseInt(value);
    document.getElementById('minDepthValue').textContent = value;
}

function updateMaxDepth(value) {
    maxDepth = parseInt(value);
    document.getElementById('maxDepthValue').textContent = value;
}

// Initialize on page load
window.addEventListener('load', function() {
    initScene();
    connect();
});

window.addEventListener('beforeunload', function() {
    disconnect();
});

