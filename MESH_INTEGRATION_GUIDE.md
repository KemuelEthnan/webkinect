# Panduan Integrasi Mesh Solid (Seperti Skanect)

## Masalah yang Dipecahkan

Sebelumnya, aplikasi menghasilkan **point cloud terpisah** (titik-titik kecil yang tidak terhubung).
Sekarang, dengan implementasi KinectFusion, Anda bisa menghasilkan **mesh solid yang utuh** seperti Skanect!

## File-File yang Ditambahkan

1. **kinect-fusion.js** - Implementasi KinectFusion algorithm (TSDF volume fusion)
2. **mesh-scanner.js** - Interface yang mudah digunakan untuk scanning dengan mesh generation
3. **depth-to-mesh.js** - Sudah ada, converter cepat dari depth ke mesh

## Cara Integrasi

### 1. Tambahkan Script ke index.html

Tambahkan script ini setelah `depth-to-mesh.js`:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="pointcloud-processor.js"></script>
<script src="depth-to-mesh.js"></script>
<script src="kinect-fusion.js"></script>
<script src="mesh-scanner.js"></script>
```

### 2. Inisialisasi MeshScanner

Ganti kode scanning lama dengan MeshScanner:

```javascript
// === KODE BARU ===
// Inisialisasi MeshScanner
var meshScanner = new MeshScanner();
var currentMesh = null;

// Mulai scanning
function startScan() {
    console.log('🔵 Starting mesh scan...');

    // Reset scanner
    meshScanner.reset();

    // Mulai scanning
    meshScanner.startScanning();

    // Update UI
    document.getElementById('scanStatus').textContent = 'Scanning (collecting depth frames)...';
    document.getElementById('startScanBtn').disabled = true;
    document.getElementById('stopScanBtn').disabled = false;

    // Clear previous mesh from scene
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh = null;
    }
}

// Proses frame depth dari Kinect
socket.onmessage = function(event) {
    if (typeof event.data === "string") {
        try {
            const data = JSON.parse(event.data);

            // Jika sedang scanning dan ada data point cloud
            if (data.points && meshScanner.isScanning) {
                meshScanner.processDepthFrame(data);

                // Update UI
                const stats = meshScanner.getStats();
                document.getElementById('frameCount').textContent = stats.frameCount;
            }
        } catch (e) {
            console.error('Error parsing data:', e);
        }
    }
};

// Stop scanning
function stopScan() {
    console.log('🛑 Stopping scan...');
    meshScanner.stopScanning();

    // Update UI
    document.getElementById('scanStatus').textContent = 'Scan stopped. Ready to generate mesh.';
    document.getElementById('stopScanBtn').disabled = true;
    document.getElementById('generateMeshBtn').disabled = false;
}

// Generate mesh solid (BUKAN point cloud!)
function generateMesh() {
    console.log('🔷 Generating SOLID MESH...');

    document.getElementById('scanStatus').textContent = 'Generating solid mesh...';
    document.getElementById('generateMeshBtn').disabled = true;

    // Generate mesh geometry
    const geometry = meshScanner.generateMesh();

    if (geometry) {
        // Buat mesh object untuk Three.js
        currentMesh = meshScanner.createMeshObject(geometry, {
            vertexColors: true,  // Gunakan warna dari Kinect
            wireframe: false     // Set true untuk melihat wireframe
        });

        // Tambahkan ke scene
        scene.add(currentMesh);

        // Update UI
        const vertexCount = geometry.attributes.position.count;
        const faceCount = geometry.index ? geometry.index.count / 3 : 0;

        document.getElementById('meshVertices').textContent = vertexCount.toLocaleString();
        document.getElementById('meshFaces').textContent = faceCount.toLocaleString();
        document.getElementById('scanStatus').textContent = 'Solid mesh generated!';
        document.getElementById('exportBtn').disabled = false;

        console.log('✅ SOLID MESH created successfully!');
    } else {
        document.getElementById('scanStatus').textContent = 'Failed to generate mesh';
        document.getElementById('generateMeshBtn').disabled = false;
        console.error('❌ Mesh generation failed');
    }
}

// Export STL
function exportSTL() {
    if (!currentMesh || !currentMesh.geometry) {
        alert('No mesh to export!');
        return;
    }

    meshScanner.exportToSTL(currentMesh.geometry, 'kinect_solid_mesh.stl');
    document.getElementById('scanStatus').textContent = 'STL exported!';
}
```

### 3. Update UI Buttons

Pastikan Anda memiliki button-button ini di HTML:

```html
<div class="controls">
    <button id="startScanBtn" onclick="startScan()">Start Scan</button>
    <button id="stopScanBtn" onclick="stopScan()" disabled>Stop Scan</button>
    <button id="generateMeshBtn" onclick="generateMesh()" disabled>Generate Solid Mesh</button>
    <button id="exportBtn" onclick="exportSTL()" disabled>Export STL</button>
    <button id="clearBtn" onclick="clearScan()">Clear</button>
</div>

<div class="panel">
    <h2>📊 Scan Info</h2>
    <div class="info-item">
        <label>Status:</label>
        <span id="scanStatus">Ready</span>
    </div>
    <div class="info-item">
        <label>Frames Collected:</label>
        <span id="frameCount">0</span>
    </div>
    <div class="info-item">
        <label>Mesh Vertices:</label>
        <span id="meshVertices">0</span>
    </div>
    <div class="info-item">
        <label>Mesh Faces:</label>
        <span id="meshFaces">0</span>
    </div>
</div>
```

## Fitur Depth Camera Visualization (Seperti Skanect)

Untuk menambahkan visualisasi depth camera dengan warna hijau (valid) dan merah (invalid) seperti Skanect:

### 1. Tambahkan Canvas untuk Depth Visualization

```html
<div class="depth-viz-container" style="position: relative; width: 320px; height: 240px;">
    <canvas id="depthCanvas" width="320" height="240"
            style="border: 2px solid #667eea; border-radius: 5px;"></canvas>
    <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7);
                color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px;">
        <span style="color: #00ff00;">🟢 Valid Depth</span> |
        <span style="color: #ff0000;">🔴 Invalid</span>
    </div>
</div>
```

### 2. Implementasi Depth Visualization

```javascript
// Initialize depth canvas
const depthCanvas = document.getElementById('depthCanvas');
const depthCtx = depthCanvas.getContext('2d');

// Visualize depth frame (seperti Skanect)
function visualizeDepthFrame(depthData) {
    if (!depthData || !depthData.points) return;

    const width = depthData.width || 320;
    const height = depthData.height || 240;

    // Create image data
    const imageData = depthCtx.createImageData(width, height);
    const pixels = imageData.data;

    // Create depth map
    const depthMap = new Array(height);
    for (let y = 0; y < height; y++) {
        depthMap[y] = new Array(width).fill(null);
    }

    // Fill depth map from point cloud
    for (const point of depthData.points) {
        const z = Math.abs(point.z);
        if (z <= 0) continue;

        // Project to 2D
        const focalLength = 525.0;
        const centerX = width / 2;
        const centerY = height / 2;

        const x2d = Math.round((point.x * focalLength / z) + centerX);
        const y2d = Math.round((-point.y * focalLength / z) + centerY);

        if (x2d >= 0 && x2d < width && y2d >= 0 && y2d < height) {
            depthMap[y2d][x2d] = z;
        }
    }

    // Render depth map dengan warna (hijau = valid, merah = invalid)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const depth = depthMap[y][x];

            if (depth === null) {
                // No depth data - hitam
                pixels[idx] = 0;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 255;
            } else if (depth >= 0.5 && depth <= 4.0) {
                // Valid depth - HIJAU (seperti Skanect)
                pixels[idx] = 0;
                pixels[idx + 1] = 255;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 255;
            } else {
                // Invalid depth - MERAH (seperti Skanect)
                pixels[idx] = 255;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
                pixels[idx + 3] = 255;
            }
        }
    }

    depthCtx.putImageData(imageData, 0, 0);
}

// Panggil di socket.onmessage
socket.onmessage = function(event) {
    if (typeof event.data === "string") {
        try {
            const data = JSON.parse(event.data);

            // Visualize depth frame
            if (data.points) {
                visualizeDepthFrame(data);
            }

            // Process untuk scanning
            if (meshScanner.isScanning) {
                meshScanner.processDepthFrame(data);
            }
        } catch (e) {
            console.error('Error:', e);
        }
    }
};
```

## Mode Scanning

MeshScanner mendukung 2 mode:

### 1. Quick Mode (DEFAULT - RECOMMENDED)
```javascript
meshScanner.setMode(true); // Quick mode ON
```
- ✅ CEPAT - generate mesh dalam hitungan detik
- ✅ Menggunakan depth-to-mesh.js (grid-based triangulation)
- ✅ Hasil bagus untuk kebanyakan kasus
- ⚡ Cocok untuk real-time scanning

### 2. TSDF Fusion Mode (Advanced)
```javascript
meshScanner.setMode(false); // TSDF mode ON
```
- 🐌 LAMBAT - membutuhkan waktu lebih lama
- 🔬 Menggunakan volumetric fusion (seperti KinectFusion asli)
- 📈 Hasil lebih smooth untuk multi-view scanning
- 🎯 Cocok untuk scanning detail tinggi

## Pengaturan Tambahan

```javascript
// Set maximum frames to collect
meshScanner.setMaxFrames(100); // Default: 100 frames

// Get statistics
const stats = meshScanner.getStats();
console.log('Scanning stats:', stats);

// Reset scanner
meshScanner.reset();
```

## Perbedaan dengan Implementasi Lama

### ❌ IMPLEMENTASI LAMA (Point Cloud)
```javascript
// Menghasilkan titik-titik terpisah
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
const points = new THREE.Points(geometry, material); // POINTS, bukan mesh!
```

### ✅ IMPLEMENTASI BARU (Solid Mesh)
```javascript
// Menghasilkan mesh solid dengan triangles
const geometry = meshScanner.generateMesh(); // Returns BufferGeometry with triangles
const mesh = new THREE.Mesh(geometry, material); // MESH dengan permukaan solid!
```

## Troubleshooting

### Mesh tidak terbentuk solid?
- Pastikan Anda mengumpulkan cukup banyak frames (minimal 20-30 frames)
- Coba tingkatkan `maxFrames` ke 150-200 untuk hasil lebih baik
- Pastikan objek ada di range depth yang valid (0.5-4.0 meter)

### Performance lambat?
- Gunakan Quick Mode (default)
- Kurangi `maxFrames` jadi 50-70
- Pastikan tidak ada throttling di browser console

### Hasil mesh masih ada lubang?
- Gunakan fungsi `generateWatertight()` dari pointcloud-processor.js
- Atau gunakan TSDF mode untuk hasil lebih smooth

## Kesimpulan

Dengan implementasi ini, Anda sekarang bisa:
1. ✅ Menghasilkan **mesh solid** seperti Skanect (bukan point cloud terpisah)
2. ✅ Visualisasi **depth camera real-time** dengan warna hijau/merah
3. ✅ Export ke **STL format** untuk 3D printing
4. ✅ **Performance cepat** dengan Quick Mode

Selamat mencoba! 🎉
