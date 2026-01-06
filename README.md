# Web Kinect

Sistem 3D scanning profesional menggunakan Microsoft Kinect 360 (Kinect V1) dengan interface web modern bergaya Skanect. Menggabungkan C# server dan WebSocket untuk komunikasi real-time dengan browser.

## Fitur Utama

- **5-Step Professional Workflow**: Prepare → Record → Reconstruct → Process → Share (terinspirasi dari Skanect)
- **Real-time 3D Scanning**: Scan objek 3D dengan visualisasi point cloud real-time
- **Multi-Phase Scanning**: Mode 2-fase untuk scan 360° objek (depan + belakang)
- **Advanced Mesh Generation**: Watertight meshing (local) dan Ball Pivoting (Python server)
- **STL Export**: Export model 3D ke format STL untuk 3D printing
- **Interactive 3D Viewer**: Visualisasi Three.js dengan OrbitControls
- **Depth Camera Preview**: Real-time colorized depth map dengan statistik
- **Point Cloud Processing**: ICP alignment, noise filtering, voxel deduplication, background removal
- **Configurable Parameters**: Bounding box, aspect ratio, size control, position control
- **Skeleton Tracking**: Mode normal untuk deteksi dan tracking skeleton manusia
- **WebSocket Communication**: Komunikasi real-time antara browser dan server

## Requirements

### Hardware
- **Microsoft Kinect 360 (Kinect V1)** - Sensor untuk depth + color camera

### Software
- **Microsoft Kinect SDK 1.8** atau lebih baru - [Download dari Microsoft](https://www.microsoft.com/en-us/download/details.aspx?id=44561)
- **Visual Studio** (untuk build dari source) atau **.NET Framework 4.0+** (untuk running executable)
- **Browser Modern** dengan dukungan WebSocket dan WebGL (Chrome, Edge, Firefox recommended)

### Optional (untuk Ball Pivoting mesh)
- **Python 3.7+** dengan libraries:
  - Flask
  - Open3D
  - NumPy
- **Mesh Server** berjalan di `http://localhost:5000`

## Instalasi

### Quick Start
1. Install Microsoft Kinect SDK dari [Microsoft Download Center](https://www.microsoft.com/en-us/download/details.aspx?id=44561)
2. Hubungkan Kinect ke komputer via USB dan AC adapter
3. Jalankan `server.exe` (atau compile dari source code di folder `source/`)
4. Buka `example/index.html` di browser (atau gunakan local web server)

Server akan berjalan di `ws://127.0.0.1:8181` secara default.

### Build dari Source
1. Buka Visual Studio
2. Open solution: `source/KinectServer.sln`
3. Build > Build Solution (Ctrl+Shift+B)
4. Copy executable dari `bin/Debug/KinectServer.exe` atau `bin/Release/KinectServer.exe` ke folder root sebagai `server.exe`



## Struktur Proyek

```
webkinect/
├── source/                          # Source code C# server
│   ├── Program.cs                   # Main server application + WebSocket handler
│   ├── FusionEngine.cs              # Fusion engine simulator (PLY output)
│   ├── Mode.cs                      # Enum untuk server modes
│   ├── PointCloudSerializer.cs      # Point cloud serialization dengan color mapping
│   ├── ColorSerializer.cs           # Color camera JPEG serializer
│   ├── DepthSerializer.cs           # Depth camera JPEG serializer
│   ├── SkeletonSerializer.cs        # Skeleton data JSON serializer
│   ├── JsonSerializer.cs            # JSON utilities
│   └── KinectServer.sln             # Visual Studio solution
├── example/
│   ├── index.html                   # Halaman utama - Skanect-style 5-step workflow
│   ├── pointcloud-processor.js      # ICP alignment, noise filtering, voxel dedup
│   ├── depth-to-mesh.js             # Direct depth-to-mesh conversion
│   ├── ball-pivoting-mesh.js        # Ball Pivoting meshing dengan Python server
│   ├── KinectDevice.js              # Kinect device abstraction
│   ├── Kinect3DScanner.js           # 3D scanner logic
│   ├── NewKinectFusion.js           # Kinect Fusion implementation
│   └── ...                          # File-file demo lainnya
├── server.exe                       # Compiled server executable (build dari source/)
└── README.md                        # Dokumentasi ini
```

## Quick Start Guide

### Langkah-langkah Scanning 3D Objek

1. **Jalankan Server**
   ```bash
   # Double-click server.exe atau run dari command line
   server.exe
   ```
   Console akan menampilkan: `Server started successfully! Listening on ws://127.0.0.1:8181`

2. **Buka Interface Web**
   - Buka file `example/index.html` di browser
   - Interface akan otomatis connect ke server
   - Status indicator akan menjadi biru ketika connected

3. **STEP 1 - PREPARE** (Persiapan)
   - Pilih scene type: **Object** (untuk scan objek)
   - Set bounding box: **1.0m - 3.0m** (sesuai ukuran objek)
   - Set aspect ratio: **Normal** (atau Height x2 untuk objek tinggi)
   - Klik **"Start"** untuk lanjut ke Record step

4. **STEP 2 - RECORD** (Scanning) 🔴
   - Posisikan objek di depan Kinect (jarak **0.5m - 4.0m**)
   - Klik tombol **Record** (tombol play besar)
   - **Auto-scan 45 detik** - putar objek 360° atau keliling objek
   - Progress bar akan menunjukkan progress scanning
   - Lihat real-time point cloud di 3D viewer (kiri)
   - Lihat depth camera preview (kanan) untuk memastikan objek terdeteksi
   - **Auto-stop** setelah 45 detik atau klik **Stop** manual

5. **STEP 3 - PROCESS** (Mesh Generation)
   - Klik **"Generate Mesh"** untuk membuat 3D mesh dari point cloud
   - Pilih metode meshing:
     - **Watertight** (default, lokal, cepat)
     - **Ball Pivoting** (advanced, butuh Python server, hasil lebih halus)
   - Mesh akan ditampilkan di 3D viewer

6. **STEP 4 - SHARE** (Export)
   - Adjust **Object Scale** (0.1x - 3.0x) jika diperlukan
   - Adjust **Position** (X, Y, Z) jika diperlukan
   - Klik **"Export STL"** untuk download file `.stl`
   - File STL siap untuk 3D printing!

### Mode Scanning

**Mode Normal (Single Scan)**
- Duration: **45 detik** auto-stop
- Use case: Scan 360° objek dengan keliling atau turntable
- Max points: **2,000,000** points

**Mode Multi-Phase (2 Fase)**
- **Fase 1 (Depan)**: 15 detik - scan sisi depan objek
- **Fase 2 (Belakang)**: 15 detik - scan sisi belakang objek
- Otomatis merge kedua point cloud untuk hasil 360° sempurna
- Total duration: **30 detik**

## Usage Example - API

Contoh penggunaan dasar untuk komunikasi WebSocket dengan server:

```javascript
// 1. Connect ke server
const socket = new WebSocket("ws://127.0.0.1:8181");
let connected = false;

socket.onopen = function() {
    connected = true;
    console.log("Connected to Kinect server");

    // Switch ke mode PointCloud untuk scanning
    socket.send("PointCloud");
};

socket.onclose = function() {
    connected = false;
    console.log("Disconnected from server");
};

socket.onmessage = function(event) {
    // Point cloud data (JSON string)
    if (typeof event.data === "string") {
        const data = JSON.parse(event.data);

        if (data.mode === "PointCloud" && data.data) {
            // Array of points: [{x, y, z, r, g, b}, ...]
            const points = data.data;
            console.log(`Received ${points.length} points`);

            // Add to your point cloud accumulator
            points.forEach(point => {
                // Filter by depth range
                if (point.z >= 0.5 && point.z <= 4.0) {
                    // Add to scene or process
                    addPointToScene(point);
                }
            });
        }
        else if (data.skeletons) {
            // Skeleton data (mode Color)
            console.log(`Detected ${data.skeletons.length} skeletons`);
        }
    }
    // Camera feed (Blob) - untuk mode Color atau Depth
    else if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        document.getElementById('cameraImage').src = url;
    }
};

// 2. Start scanning
function startScan() {
    if (connected) {
        socket.send("StartScan");  // atau "PointCloud"
        console.log("Scan started");
    }
}

// 3. Stop scanning dan request mesh
function stopScan() {
    if (connected) {
        socket.send("StopScan");
        // Server akan mengirim PLY file sebagai binary data
    }
}

// 4. Switch mode
function switchMode(mode) {
    // mode: "Color", "Depth", "PointCloud"
    if (connected) {
        socket.send(mode);
    }
}
```

## Server Modes

Server mendukung beberapa mode operasi yang dapat di-switch melalui WebSocket:

| Mode | Output | Data Type | Use Case |
|------|--------|-----------|----------|
| **`Color`** | Color camera feed (JPEG) + Skeleton data (JSON) | Blob + String | Skeleton tracking, gesture recognition |
| **`Depth`** | Depth camera feed (JPEG grayscale) | Blob | Depth visualization |
| **`PointCloud`** | Point cloud data (JSON) `[{x,y,z,r,g,b}]` | String | 3D scanning |
| **`RawDepth`** | Raw depth values (JSON) | String | Custom depth processing |

### Command Messages (Client → Server)

| Command | Description |
|---------|-------------|
| `"Color"` | Switch ke Color mode |
| `"Depth"` | Switch ke Depth mode |
| `"PointCloud"` | Switch ke PointCloud mode (start scanning) |
| `"StartScan"` | Alias untuk PointCloud mode |
| `"StopScan"` | Stop scanning dan trigger mesh extraction (server mengirim PLY file) |

## Arsitektur Sistem

```
┌────────────────────┐
│  Kinect Sensor     │  Color: 640x480 RGB
│  (V1)              │  Depth: 640x480 16-bit
└─────────┬──────────┘
          │ USB
          ▼
┌────────────────────────────┐
│  C# Server (Program.cs)    │
│  - Kinect SDK 1.8          │  Port: 8181
│  - WebSocket Server        │  Protocol: ws://
│  - FusionEngine Simulator  │
└─────────┬──────────────────┘
          │ WebSocket
          ▼
┌────────────────────────────┐
│  Browser (index.html)      │
│  - Three.js 3D Viewer      │
│  - Point Cloud Processor   │
│  - Mesh Generator          │
└─────────┬──────────────────┘
          │
          ▼
┌────────────────────────────┐
│  STL File Export           │
│  - Binary/ASCII format     │
│  - Ready for 3D printing   │
└────────────────────────────┘
```

## 5-Step Workflow (Skanect Style)

Interface menggunakan workflow profesional 5 langkah:

### 1. PREPARE (Persiapan)
**Konfigurasi scanning parameters sebelum mulai scan**

- **Scene Selection**:
  - Body (0.5m box) - untuk scan manusia
  - Object (1.0m box) - untuk scan objek kecil-menengah
  - Room (3.0m box) - untuk scan ruangan
  - Half Room (6.0m box) - untuk scan ruangan besar

- **Bounding Box**: Slider 0.1m - 12m untuk ukuran area scan
- **Aspect Ratio**:
  - Normal (1:1:1)
  - Height x2 (1:2:1) - untuk objek tinggi
  - Height x3 (1:3:1) - untuk objek sangat tinggi
  - Width x2 (2:1:1) - untuk objek lebar

- **Save Path**: Konfigurasi lokasi penyimpanan
- **Config File**: Load/save konfigurasi custom

### 2. RECORD (Scanning) 🔴
**Scan objek secara real-time**

- **Record Button**: Tombol play/stop besar untuk start/stop recording
- **Auto-stop**: 45 detik (normal mode) atau 2x15 detik (multi-phase)
- **Progress Bar**: Real-time progress 0-100%
- **Delay Setting**: 3 detik countdown sebelum mulai
- **Limit Setting**: Batasi durasi maksimum
- **Multi-Phase Mode**: Scan 2 fase untuk objek 360° (depan + belakang)

**Real-time Display:**
- **3D Viewer (Left)**: Point cloud visualization dengan Three.js
- **Depth Preview (Right)**: Colorized depth map dengan legend
- **Scan Info**: Frames captured, total points, vertices, faces
- **Connection Status**: Indicator hijau/merah

### 3. RECONSTRUCT (Reconstruction)
**Align dan merge multiple scans** (under development)

- Reconstruct mesh dari point cloud
- Align multiple scans menggunakan ICP
- Merge point clouds dari berbagai angle

### 4. PROCESS (Mesh Editing)
**Edit dan optimize mesh**

**Mesh Tools:**
- Reset - Reset mesh ke state awal
- Watertight - Buat mesh watertight
- External Edit - Export untuk edit di software external

**Geometry Tools:**
- Simplify - Reduce poly count
- Fill Holes - Tutup lubang di mesh
- Move & Crop - Reposition dan crop mesh
- Remove Parts - Hapus bagian mesh tertentu

**Color Tools:**
- Colorize - Apply color ke mesh
- Remove Colors - Hapus vertex colors

### 5. SHARE (Export & Upload)
**Export dan share hasil scan**

**Local:**
- Save - Save project (.webkinect format)
- Export Model - Download STL file untuk 3D printing

**Web:**
- Upload to Sketchfab - Share online

**3D Print:**
- Upload to Sculpteo - Order 3D print
- Upload to Shapeways - Order 3D print

## Fitur-Fitur Advanced

### Point Cloud Processing
**File: `example/pointcloud-processor.js`**

1. **Voxel Deduplication**
   - Voxel size: 1.5cm (0.015m)
   - Prevents layering dan double surfaces
   - Keeps only one point per voxel

2. **Depth Range Filtering**
   - Min depth: 0.3m - 2.0m (default: 0.5m)
   - Max depth: 1.0m - 8.0m (default: 4.0m)
   - Filter out background dan noise

3. **Background Removal**
   - Cluster analysis (median distance threshold)
   - Y-axis filtering (remove floor/ceiling)
   - Statistical outlier removal

4. **ICP Alignment** (optional, disabled by default)
   - Iterative Closest Point algorithm
   - 20 iterations, 0.001 tolerance
   - Align new frames ke existing point cloud
   - CPU intensive, not recommended for real-time

5. **Noise Filtering** (optional, disabled by default)
   - Statistical outlier removal
   - Temporal filtering across frames

### Mesh Generation Methods

**1. Watertight Mesh (Default - Local)**
**File: `example/depth-to-mesh.js`**

- Algorithm: Marching Cubes
- Max points: 100,000 (auto-downsampling)
- Voxel size: 0.8cm (0.008m)
- Output: Triangular mesh dengan vertex colors
- Speed: Fast (client-side, JavaScript)
- Quality: Good untuk most objects

```javascript
// Settings
maxPointsForMesh: 100000
meshResolution: 0.02  // 2cm
voxelSize: 0.008      // 8mm
```

**2. Ball Pivoting (Advanced - Python Server)**
**File: `example/ball-pivoting-mesh.js`**

- Algorithm: Ball Pivoting Surface Reconstruction (Open3D)
- Max points: 150,000
- Requires: Python server di `http://localhost:5000`
- Libraries: Flask, Open3D, NumPy
- Output: High-quality PLY mesh dengan colors
- Speed: Slower (external process)
- Quality: Excellent untuk detailed objects

```bash
# Install Python dependencies
pip install flask open3d numpy flask-cors

# Run mesh server
python mesh-server.py
```

### Size & Position Control

**Object Scale** (applied saat STL export)
- Range: 0.1x - 3.0x
- Default: 1.0x
- Untuk resize objek tanpa re-scan

**Position Control**
- X-axis: -5m to +5m
- Y-axis: -5m to +5m
- Z-axis: -5m to +5m
- Untuk reposition objek di 3D space

### Depth Camera Preview

**Real-time colorized depth map**
- Color coding: Near (Red/Orange) → Far (Blue/Purple)
- Legend: Visual depth scale
- Statistics: Min/Max/Avg depth values
- Resolution: 640x480 pixels

### Tips untuk Hasil Terbaik

**Hardware Setup:**
- Kinect position: 0.5m - 1.5m dari ground level
- Object distance: **0.5m - 4.0m** dari Kinect (sweet spot: 1.0m - 2.5m)
- AC adapter: HARUS terpasang (Kinect tidak bisa via USB power saja)

**Lighting:**
- Gunakan lighting yang cukup dan merata
- Hindari direct sunlight (interferes dengan IR depth sensor)
- Avoid shadows yang berubah-ubah

**Objek:**
- Permukaan: Avoid terlalu reflektif (kaca, metal mengkilap)
- Warna: Semua warna OK (depth sensor menggunakan IR, bukan color)
- Ukuran: 10cm - 2m (optimal untuk Kinect V1)
- Tekstur: Textured surfaces lebih mudah di-scan daripada smooth surfaces

**Scanning Technique:**
- **Turntable method**: Objek di turntable, Kinect stationary, rotate objek 360°
- **Orbit method**: Objek stationary, keliling objek dengan Kinect
- **Speed**: Gerak lambat dan smooth (avoid fast movement)
- **Coverage**: Scan dari berbagai angle dan heights untuk coverage lengkap
- **Overlap**: Pastikan ada overlap 30-50% antar frames

**Processing:**
- **Points count**: 50k - 500k points optimal untuk meshing
- **Too few points** (<20k): Hasil kurang detail
- **Too many points** (>1M): Meshing lambat, bisa crash browser
- **Mesh resolution**: Start dengan 0.02 (2cm), turunkan untuk more detail

**Export:**
- **STL Binary**: Lebih kecil filesize (recommended)
- **STL ASCII**: Lebih besar, tapi human-readable
- **Scale**: Check scale sebelum export (1.0x = real-world size dalam meters)

## Troubleshooting

### Kinect Hardware Issues

**Kinect tidak terdeteksi**
- ✅ Pastikan AC adapter terpasang (Kinect V1 butuh external power)
- ✅ Check USB connection (gunakan USB 2.0 port, bukan USB 3.0)
- ✅ Install/reinstall Microsoft Kinect SDK 1.8
- ✅ Cek Device Manager → Kinect Camera, Kinect Audio, Kinect Motor
- ✅ Restart komputer setelah install SDK
- ✅ Green LED on Kinect = powered and detected

**Kinect detected tapi no depth/color stream**
- Check di Kinect SDK Browser → Device Settings
- Test dengan "Kinect Studio" tool (bagian dari SDK)
- Update Kinect firmware via SDK tools

### Server Issues

**Server tidak start / crash saat startup**
```
[ERROR] No Kinect sensor found!
```
- Pastikan Kinect detected di Device Manager
- Run server as Administrator
- Check apakah ada aplikasi lain yang menggunakan Kinect
- Rebuild server dari source terbaru

**WebSocket connection failed**
```
WebSocket connection to 'ws://127.0.0.1:8181' failed
```
- Check firewall tidak blocking port 8181
- Pastikan server.exe berjalan (lihat console window)
- Cek port tidak digunakan aplikasi lain: `netstat -ano | findstr :8181`
- Try different port di Program.cs dan index.html

**Server tidak mengirim data point cloud**
- ✅ Cek console server untuk error messages
- ✅ Pastikan mode sudah switch ke PointCloud (lihat log `[WEBSOCKET] Received message: "PointCloud"`)
- ✅ Pastikan objek berada dalam range depth 0.5m - 4.0m
- ✅ Check depth camera working (switch ke Depth mode dan lihat preview)
- ✅ Rebuild server dari source terbaru

### Browser Issues

**Interface tidak connect ke server**
- Open browser console (F12) → Console tab
- Look for error messages
- Check WebSocket connection status
- Try reload halaman (Ctrl+F5)
- Try different browser (Chrome recommended)

**Point cloud tidak muncul di 3D viewer**
```javascript
// Check browser console untuk errors
Received X points  // Should see this message
Points in scene: Y // Should increase
```
- Check depth range settings (default: 0.5m - 4.0m)
- Check max points per frame tidak terlalu rendah
- Objek mungkin diluar bounding box
- Try reset camera view (scroll mouse wheel)

**Mesh generation failed / crash**
```
Too many points for meshing!
```
- Reduce max points: Settings → Max Points per Frame → 50,000
- Increase mesh resolution: Settings → Mesh Resolution → 0.03
- Clear point cloud dan re-scan dengan fewer points
- Try Ball Pivoting method (requires Python server)

**STL export empty / corrupted**
- Generate mesh first sebelum export
- Check mesh ada di scene (should see triangles, not just points)
- Check browser console untuk export errors
- Try export ASCII STL instead of Binary

### Performance Issues

**Laggy / slow 3D viewer**
- Reduce max points per frame (default: 50,000)
- Disable ICP alignment (CPU intensive)
- Close other browser tabs
- Use dedicated GPU (check WebGL settings)
- Reduce mesh resolution untuk faster meshing

**Browser crash / freeze saat meshing**
- Too many points (>1M points)
- Clear point cloud: Stop scan → Clear → Start new scan
- Increase mesh resolution (bigger voxels = fewer triangles)
- Use Ball Pivoting with Python server (offload to backend)

### Console Server Logs

Saat menjalankan server, console akan menampilkan log detail:

```
[KINECT] Sensor started successfully!
[WEBSOCKET] Client connected. Total: 1
[WEBSOCKET] Received message: "PointCloud"
[FusionEngine] SIMULATION: Scan started. Now accumulating frames...
.................  (dots = frames being processed)
[WEBSOCKET] Received message: "StopScan"
[FusionEngine] SIMULATION: Scan stopped. Triggering mesh extraction...
[FusionEngine] SIMULATION: Fake mesh file generated at 'D:\...\output.ply'
[WEBSOCKET] Sent mesh file (12345 bytes) to 1 client(s).
```

**Log Tags:**
- `[KINECT]` - Kinect sensor status
- `[WEBSOCKET]` - WebSocket connection dan messages
- `[FusionEngine]` - Fusion engine simulator (currently FAKE)
- `[ERROR]` - Error messages
- `[WARNING]` - Warning messages

### Debug Mode

**Server Side (C# Console):**
- Console window shows all logs automatically
- Look for `[ERROR]` tags untuk identify problems
- Check mode switching logs: `Received message: "PointCloud"`

**Client Side (Browser):**
- Open Developer Tools (F12)
- **Console tab**: JavaScript logs, errors, point cloud stats
- **Network tab**: Check WebSocket connection (ws://127.0.0.1:8181)
  - Status: 101 Switching Protocols = good
  - Messages tab: See real-time WebSocket traffic
- **Performance tab**: Check FPS, memory usage jika laggy

**Common Debug Checks:**
```javascript
// Browser console commands untuk debugging
console.log(pointCloudData);        // Check point cloud array
console.log(scene.children);        // Check Three.js scene objects
console.log(renderer.info.render);  // Check rendering stats
```

## Fitur-Fitur yang Telah Diimplementasikan

### Backend (C# Server)

**Core Features:**
- ✅ **WebSocket Server** (Fleck library) - Port 8181
- ✅ **Thread-safe Mode Switching** - `volatile` + `lock` untuk concurrent access
- ✅ **Kinect SDK Integration** - Color, Depth, Skeleton streams
- ✅ **FusionEngine Simulator** - Placeholder untuk real fusion (currently generates fake cube PLY)
- ✅ **Point Cloud Serialization** - JSON format dengan color mapping dari depth + color frames
- ✅ **Multiple Serializers** - Color, Depth, PointCloud, RawDepth, Skeleton
- ✅ **Detailed Logging** - Tag-based logging untuk debugging (`[KINECT]`, `[WEBSOCKET]`, dll)
- ✅ **Error Handling** - Try-catch di semua operasi kritis

**Communication Protocol:**
- ✅ Command handling: `Color`, `Depth`, `PointCloud`, `StartScan`, `StopScan`
- ✅ Binary data: JPEG images, PLY mesh files
- ✅ JSON data: Point cloud, skeleton, metadata
- ✅ Multi-client support

### Frontend (HTML/JavaScript)

**UI/UX:**
- ✅ **Skanect-Style 5-Step Workflow** - Prepare → Record → Reconstruct → Process → Share
- ✅ **Workflow Navigation Bar** - Professional step indicator
- ✅ **3-Panel Layout** - Control panel (left) + 3D Viewer (center) + Preview (right)
- ✅ **Record Button** - Large play/stop button (Skanect style)
- ✅ **Progress Bar** - Real-time 0-100% progress dengan info detail
- ✅ **Status Indicators** - Connection status, scan status, stats
- ✅ **Settings Panel** - Collapsible settings dengan sliders
- ✅ **Depth Camera Preview** - Colorized depth map dengan legend
- ✅ **Responsive Design** - Adaptive layout untuk different screen sizes

**3D Visualization:**
- ✅ **Three.js Integration** - WebGL-based 3D rendering
- ✅ **OrbitControls** - Mouse rotate, zoom, pan
- ✅ **Point Cloud Rendering** - Real-time point cloud dengan colors
- ✅ **Mesh Rendering** - Triangular mesh dengan vertex colors
- ✅ **Grid Background** - Reference grid untuk scale
- ✅ **Multiple Viewers** - Separate viewers untuk each workflow step

**Scanning Features:**
- ✅ **Auto-Scan** - 45 detik auto-stop (configurable)
- ✅ **Multi-Phase Scanning** - 2-phase mode (front + back, 2x15 sec)
- ✅ **Delay Timer** - 3 second countdown sebelum start
- ✅ **Frame Counting** - Track jumlah frames captured
- ✅ **Point Accumulation** - Accumulate points dari multiple frames
- ✅ **Max Points Limit** - Auto-stop at 2M points

**Point Cloud Processing:**
- ✅ **Voxel Deduplication** - 1.5cm voxel grid untuk prevent doubles
- ✅ **Depth Range Filtering** - Configurable min/max depth (0.5m - 4.0m)
- ✅ **Background Removal** - Cluster analysis, Y-axis filtering
- ✅ **Statistical Outlier Removal** - Remove noise points
- ✅ **ICP Alignment** (optional) - Iterative Closest Point untuk frame alignment
- ✅ **Noise Filtering** (optional) - Temporal filtering

**Mesh Generation:**
- ✅ **Watertight Meshing** - Local, JavaScript-based (Marching Cubes)
- ✅ **Ball Pivoting** - Python server integration (Open3D)
- ✅ **Auto-downsampling** - Optimize point count untuk meshing
- ✅ **Vertex Coloring** - Transfer colors dari point cloud ke mesh
- ✅ **Mesh Statistics** - Vertex count, face count, memory usage

**Export & Share:**
- ✅ **STL Export** - Binary dan ASCII format
- ✅ **PLY Export** - With vertex colors
- ✅ **OBJ Export** - With MTL material file
- ✅ **Object Scale** - 0.1x - 3.0x scaling
- ✅ **Position Control** - X/Y/Z positioning
- ✅ **Sketchfab Integration** (planned)
- ✅ **3D Print Services** (planned)

**Configuration:**
- ✅ **Scene Types** - Body, Object, Room, Half Room (preset bounding boxes)
- ✅ **Bounding Box** - Adjustable 0.1m - 12m
- ✅ **Aspect Ratio** - Normal, Height x2, Height x3, Width x2
- ✅ **Mesh Resolution** - 0.005 - 0.1 (voxel size)
- ✅ **Max Points per Frame** - 1k - 200k (default: 50k)
- ✅ **Depth Range** - Independent min/max sliders
- ✅ **Save/Load Config** - JSON config files

### JavaScript Modules

**`pointcloud-processor.js`** - Point cloud processing utilities
- ICP alignment algorithm
- Voxel-based deduplication
- Statistical outlier removal
- Noise filtering
- Background removal

**`depth-to-mesh.js`** - Watertight mesh generation
- 2D depth map creation
- Grid-based triangulation
- Edge length filtering
- Marching Cubes algorithm

**`ball-pivoting-mesh.js`** - Advanced meshing
- Python Flask server integration
- Open3D Ball Pivoting algorithm
- HTTP POST for point cloud data
- PLY mesh response parsing

**`KinectDevice.js`** - Kinect abstraction layer
- WebSocket connection management
- Mode switching
- Data parsing
- Event callbacks

**`Kinect3DScanner.js`** - 3D scanner logic
- Scan control (start/stop)
- Point cloud accumulation
- Frame processing pipeline
- Multi-phase scan coordination

**`NewKinectFusion.js`** - Kinect Fusion implementation
- Volume integration
- TSDF (Truncated Signed Distance Function)
- Raycasting
- Mesh extraction

## Status Implementasi & Roadmap

### ✅ Implemented & Working
- WebSocket komunikasi client-server
- Point cloud streaming dari Kinect
- Real-time 3D visualization
- Watertight mesh generation (local)
- STL export untuk 3D printing
- Multi-phase scanning
- 5-step Skanect-style workflow
- Depth camera preview
- Configurable parameters

### ⚠️ Partially Implemented
- **FusionEngine** - Currently SIMULATOR (generates fake cube PLY)
  - Need to integrate real C++ fusion library (InfiniTAM, KinectFusion, etc.)
  - Or implement JavaScript-based TSDF volume integration

- **ICP Alignment** - Implemented tapi disabled (too CPU intensive)
  - Need GPU acceleration atau backend processing

- **Ball Pivoting** - Requires external Python server
  - Works tapi not included in default package

### 🔜 Planned / Not Yet Implemented
- **Real Fusion Engine** - Replace simulator dengan real TSDF reconstruction
- **GPU Acceleration** - Offload meshing ke GPU via WebGL compute shaders
- **Reconstruct Step** - Align dan merge multiple scans
- **Mesh Editing Tools** - Simplify, Fill Holes, Remove Parts (UI ada, logic belum)
- **Sketchfab Upload** - Direct upload API integration
- **3D Print Services** - Sculpteo, Shapeways API integration
- **Save/Load Project** - .webkinect project file format
- **Undo/Redo** - Operation history
- **Kinect V2 Support** - Support untuk Kinect for Xbox One
- **Multi-Kinect Setup** - Scan dari berbagai angle simultaneously

## Catatan Penting

### 1. FusionEngine Status ⚠️
**PENTING:** FusionEngine saat ini adalah **SIMULATOR** yang hanya generate fake cube PLY file untuk testing workflow. Untuk real 3D reconstruction:

**Option A - Integrate C++ Fusion Library:**
```
Integrate: InfiniTAM, Open3D, KinectFusion DLL
Method: C# wrapper → Call C++ DLL → Return mesh
Pros: High quality, real-time fusion
Cons: Complex build setup, large dependencies
```

**Option B - Client-Side TSDF (JavaScript):**
```
Implement: TSDF volume integration di browser
Method: Accumulate frames → Build volume → Extract mesh
Pros: No server dependency, portable
Cons: Memory intensive, slower
```

**Current Workaround:**
- Client-side point cloud accumulation (working)
- Client-side mesh generation dari point cloud (working)
- Results are decent untuk static objects

### 2. Rebuild Server
Setelah modifikasi source code C#, **WAJIB rebuild dan restart server:**
```bash
1. Build Solution di Visual Studio (Ctrl+Shift+B)
2. Copy bin/Debug/KinectServer.exe ke root sebagai server.exe
3. Close old server.exe console window
4. Run new server.exe
5. Refresh browser (Ctrl+F5)
```

### 3. Console Monitoring
**Selalu monitor dua console:**
- **Server Console** - Lihat mode switching, data sending, errors
- **Browser Console** - Lihat point count, mesh generation, WebSocket status

### 4. Depth Range Critical
**Objek HARUS berada dalam depth range:**
- Minimum: 0.5m (default) - adjust via slider jika objek lebih dekat
- Maximum: 4.0m (default) - adjust via slider jika objek lebih jauh
- Sweet spot: **1.0m - 2.5m** untuk best quality

Jika objek diluar range → no points captured → empty scan.

### 5. Performance Considerations
- **Max 500k points** untuk smooth browser performance
- **Max 100k points** untuk fast meshing (<5 seconds)
- **Over 1M points** → risk browser freeze/crash
- Use **voxel downsampling** jika points terlalu banyak

### 6. Python Server (Optional)
Ball Pivoting meshing butuh Python server:
```bash
cd mesh-server/
pip install flask open3d numpy flask-cors
python mesh-server.py
# Server runs on http://localhost:5000
```
Tapi Watertight meshing (default) works tanpa Python server.

## Technical Specifications

### Kinect V1 Sensor Specs
- **Color Camera**: 640x480 @ 30fps, RGB
- **Depth Camera**: 640x480 @ 30fps, 16-bit depth values (11-bit precision)
- **Depth Range**: 0.4m - 4.0m (near mode: 0.4m - 3.0m, default: 0.8m - 4.0m)
- **Field of View**: 57° horizontal, 43° vertical
- **Tilt Motor**: ±27° vertical adjustment
- **Skeleton Tracking**: Up to 6 people, 2 active skeletons
- **Interface**: USB 2.0 + External power adapter (12V)

### WebSocket Protocol

**Server → Client Messages:**

```javascript
// Point Cloud Data (JSON)
{
  "mode": "PointCloud",
  "data": [
    {"x": 0.5, "y": 0.2, "z": 1.5, "r": 255, "g": 128, "b": 64},
    ...
  ],
  "width": 640,
  "height": 480,
  "timestamp": 123456789
}

// Skeleton Data (JSON)
{
  "skeletons": [
    {
      "trackingId": 1,
      "trackingState": "Tracked",
      "joints": [
        {"type": "Head", "x": 0.1, "y": 0.5, "z": 2.0, "state": "Tracked"},
        ...
      ]
    }
  ]
}

// Camera Image (Blob)
Blob {type: "image/jpeg", size: 12345}

// Mesh File (Blob)
Blob {type: "application/octet-stream", size: 67890}  // PLY format
```

**Client → Server Commands:**

```javascript
socket.send("Color");        // Switch to Color mode
socket.send("Depth");        // Switch to Depth mode
socket.send("PointCloud");   // Switch to PointCloud mode
socket.send("StartScan");    // Start scanning (alias for PointCloud)
socket.send("StopScan");     // Stop scan and request mesh extraction
```

### File Formats

**STL (Export dari browser)**
- **Binary STL**: Compact format (recommended)
  - Header: 80 bytes
  - Triangle count: 4 bytes
  - Triangles: (normal + 3 vertices) × 50 bytes each
- **ASCII STL**: Human-readable format
  - Larger file size
  - Better for debugging

**PLY (Server output dari FusionEngine)**
- **ASCII PLY**: Text format dengan vertices dan faces
- **Binary PLY**: Compact format untuk large meshes
- **Vertex properties**: x, y, z, r, g, b (position + color)
- **Face properties**: vertex_indices (triangle list)

**OBJ (Optional export)**
- Geometry file (.obj)
- Material file (.mtl)
- Support untuk textures dan materials

## FAQ

**Q: Apakah Kinect V2 supported?**
A: Tidak untuk saat ini. Sistem ini menggunakan Kinect SDK 1.8 untuk Kinect V1. Kinect V2 membutuhkan Kinect SDK 2.0 dan berbeda API.

**Q: Berapa lama scanning untuk objek kecil?**
A: 45 detik auto-scan (default), tapi bisa stop manual lebih cepat. Untuk objek kecil, 15-20 detik biasanya cukup.

**Q: Kenapa mesh generation lambat?**
A: Terlalu banyak points. Reduce "Max Points per Frame" ke 50k atau increase "Mesh Resolution" untuk voxels lebih besar.

**Q: Apakah bisa scan objek transparan atau reflektif?**
A: Tidak recommended. IR depth sensor tidak bekerja baik dengan kaca, cermin, atau metal mengkilap. Gunakan objek dengan permukaan matte/diffuse.

**Q: Hasil scan tidak smooth, banyak noise?**
A: Enable "Remove Background" dan pastikan objek dalam depth range yang tepat (1.0m - 2.5m sweet spot). Gunakan lighting yang stabil.

**Q: Bisa scan ruangan/indoor spaces?**
A: Ya, pilih scene type "Room" atau "Half Room" di Prepare step. Set bounding box 3m - 6m.

**Q: Format STL bisa langsung print di 3D printer?**
A: Ya, tapi biasanya perlu post-processing di slicer software (Cura, PrusaSlicer, dll) untuk:
  - Scale checking
  - Support generation
  - Orientation optimization
  - Wall thickness check

**Q: Apakah scan berwarna (colored)?**
A: Point cloud berwarna (RGB dari color camera). Mesh juga berwarna via vertex colors. STL export tidak support color (STL format limitation), tapi PLY dan OBJ export support colors.

**Q: Server tidak start, error "No Kinect sensor found"?**
A: Checklist:
  1. Kinect terhubung via USB + power adapter
  2. Green LED on Kinect menyala
  3. Device Manager shows "Kinect Camera", "Kinect Audio", "Kinect Motor"
  4. Kinect SDK 1.8 installed
  5. No other app using Kinect (close Kinect Studio, Skype, dll)

**Q: FusionEngine itu apa? Kenapa hasil scan bukan cube?**
A: FusionEngine di server adalah **simulator** untuk testing workflow. Real scanning menggunakan client-side point cloud accumulation + meshing. Hasil scan adalah real object yang di-scan, bukan cube.

**Q: Kenapa ada delay/lag saat scanning?**
A: Normal untuk point cloud streaming. Untuk reduce lag:
  - Lower "Max Points per Frame" (50k → 30k)
  - Disable ICP alignment (already disabled by default)
  - Close other browser tabs
  - Check GPU usage (WebGL rendering)

**Q: Bisa export ke format 3MF atau 3DS?**
A: Tidak secara native. Export STL/PLY/OBJ dulu, lalu convert menggunakan:
  - MeshLab (free, powerful mesh processing)
  - Blender (free, full 3D suite)
  - Online converters

## Credits & References

**Libraries & Frameworks:**
- [Three.js](https://threejs.org/) - 3D rendering library
- [Fleck](https://github.com/statianzo/Fleck) - C# WebSocket server
- [Microsoft Kinect SDK 1.8](https://www.microsoft.com/en-us/download/details.aspx?id=40278) - Kinect hardware interface
- [Open3D](http://www.open3d.org/) - Point cloud processing (optional Python server)

**Inspired By:**
- [Skanect](https://skanect.occipital.com/) - Professional 3D scanning software
- [KinectFusion](https://www.microsoft.com/en-us/research/project/kinectfusion-project-page/) - Real-time 3D reconstruction research

**Algorithms:**
- Marching Cubes - Surface reconstruction
- Ball Pivoting - High-quality meshing
- ICP (Iterative Closest Point) - Point cloud alignment
- TSDF (Truncated Signed Distance Function) - Volume integration

## Contributing

Contributions are welcome! Areas yang bisa di-improve:

1. **Real FusionEngine** - Integrate actual C++ fusion library
2. **GPU Acceleration** - WebGL compute shaders untuk meshing
3. **Kinect V2 Support** - Port ke Kinect SDK 2.0
4. **Mobile Support** - Responsive design untuk tablet
5. **Multi-language** - Internationalization (i18n)
6. **Mesh Editing** - Implement simplify, fill holes, remove parts
7. **Cloud Storage** - Save/load scans to cloud
8. **Better Meshing** - Poisson reconstruction, screened Poisson

**How to contribute:**
1. Fork repository
2. Create feature branch
3. Make changes
4. Test thoroughly (server + browser)
5. Submit pull request dengan clear description

## License

**MIT License**

- Project uses MIT license yang mengizinkan commercial usage tanpa biaya
- Free untuk modify, distribute, dan use commercially
- Attribution appreciated tapi tidak required
- License details available di project repository

## Support & Contact

**Issues & Bug Reports:**
- GitHub Issues - Report bugs, request features

**Documentation:**
- README.md - This file
- Code comments - Inline documentation di source files
- Browser console - Real-time logs dan errors

**Community:**
- GitHub Discussions - Ask questions, share scans
- Examples - Check `example/` folder untuk demo files

---

**Made with ❤️ for the maker community. Happy scanning!**

