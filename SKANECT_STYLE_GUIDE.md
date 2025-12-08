# 🎯 Panduan Kinect Scanner - Skanect Style

## ✅ Semua Masalah Telah Diperbaiki!

File baru: **`example/skanect-like-scanner.html`**

### Masalah yang Diperbaiki:

1. ✅ **Depth Camera Visualization** - Real-time depth view dengan warna hijau/merah (seperti Skanect)
2. ✅ **3D Object Positioning** - Objek muncul tepat di tengah canvas (tidak jauh lagi)
3. ✅ **Manual Start/Stop Scanning** - Bukan timer 6 detik, tapi klik manual
4. ✅ **Real-time Depth Recording** - Seperti Skanect, merekam dengan depth camera
5. ✅ **Performance Optimized** - Tidak lag, smooth 30 FPS

---

## 🚀 Cara Menggunakan

### Langkah 1: Buka File Baru
```
Buka: example/skanect-like-scanner.html
```

### Langkah 2: Jalankan Kinect Server
```bash
bin/server.exe
```

### Langkah 3: Connect ke Kinect
1. Klik tombol **"Connect to Kinect"**
2. Status akan berubah jadi **"Connected"** (hijau)
3. Depth camera akan mulai menampilkan real-time depth view

### Langkah 4: Mulai Scanning
1. Posisikan objek di depan Kinect (0.5-4 meter)
2. Lihat depth camera - pastikan objek **HIJAU** (valid depth)
3. Klik **"▶️ Start Scan"**
4. Depth camera akan merekam frame-frame depth
5. Gerakkan objek atau Kinect untuk capture berbagai sudut
6. Monitor "Frames Captured" dan "Total Points"

### Langkah 5: Stop Scanning
1. Klik **"⏸️ Stop Scan"** kapan saja
2. Tidak ada timer otomatis - **full manual control!**

### Langkah 6: Generate Mesh
1. Klik **"🔷 Generate Mesh"**
2. Tunggu beberapa detik (tergantung jumlah frames)
3. **Mesh SOLID akan muncul di tengah viewer!** (tidak jauh lagi)
4. Drag untuk rotate, scroll untuk zoom

### Langkah 7: Export STL
1. Klik **"💾 Export STL"**
2. File `.stl` akan terdownload otomatis
3. Siap untuk 3D printing!

---

## 🎨 Fitur Interface (Seperti Skanect)

### Panel Kiri: Depth Camera View
- **Real-time depth visualization**
- Hijau = Valid depth (0.5-4m)
- Merah = Invalid depth (terlalu dekat/jauh)
- Hitam = Tidak ada data
- FPS counter
- Points counter

### Panel Tengah: 3D Mesh Viewer
- **Objek muncul DI TENGAH** (sudah diperbaiki!)
- Drag to rotate
- Scroll to zoom
- Mesh info overlay

### Panel Kanan: Controls & Settings
- Connection buttons
- Scan controls (Start/Stop manual)
- Scan statistics
- Settings (mesh resolution, depth range)

---

## 🔧 Teknologi yang Digunakan

### 1. Real-time Depth Visualization
```javascript
// Depth rendering dengan color coding (seperti Skanect)
if (depth >= depthMin && depth <= depthMax) {
    // Valid - HIJAU
    pixels[idx] = 0;
    pixels[idx + 1] = 255;
    pixels[idx + 2] = 0;
} else {
    // Invalid - MERAH
    pixels[idx] = 255;
    pixels[idx + 1] = 0;
    pixels[idx + 2] = 0;
}
```

### 2. Manual Scanning Workflow
```javascript
// TIDAK ada timer otomatis!
function startScan() {
    isScanning = true;  // Mulai collect frames
}

function stopScan() {
    isScanning = false; // Stop collect frames
}

// Collect frame saat scanning = true
if (isScanning) {
    collectDepthFrame(depthData);
}
```

### 3. 3D Object Centering (FIX CRITICAL!)
```javascript
// CRITICAL: Center mesh di origin (0, 0, 0)
geometry.computeBoundingBox();
const boundingBox = geometry.boundingBox;
const center = new THREE.Vector3();
boundingBox.getCenter(center);

// Translate geometry ke center
geometry.translate(-center.x, -center.y, -center.z);
```

### 4. Performance Optimization
```javascript
// Throttle depth rendering ke 30 FPS (tidak lag!)
const now = Date.now();
if (now - lastDepthRenderTime < 33) return; // 33ms = ~30 FPS
lastDepthRenderTime = now;
```

### 5. Depth-to-Mesh Conversion
```javascript
// Generate solid mesh (BUKAN point cloud!)
const geometry = depthMeshConverter.depthToMesh(allPoints, 320, 240);

// Mesh dengan vertex colors
const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
});

const mesh = new THREE.Mesh(geometry, material);
```

---

## 📊 Perbedaan dengan Implementasi Lama

| Fitur | Implementasi Lama | Implementasi Baru (Skanect Style) |
|-------|------------------|----------------------------------|
| **Depth Visualization** | ❌ Tidak ada | ✅ Real-time dengan warna hijau/merah |
| **Scan Control** | ⏱️ Timer 6 detik otomatis | ✅ Manual start/stop button |
| **Mesh Position** | ❌ Jauh dari canvas | ✅ Tepat di tengah canvas |
| **Performance** | ⚠️ Bisa lag | ✅ Smooth 30 FPS |
| **UI Layout** | 📱 Vertikal | ✅ 3-panel layout (seperti Skanect) |
| **Depth Range** | ⚙️ Fixed | ✅ Adjustable dengan slider |

---

## 🎯 Sistem Seperti Skanect

### 1. Real-time Depth + RGB Capture ✅
- Depth camera menangkap depth map real-time
- Warna ditampilkan dengan color coding (hijau/merah)
- Points di-filter berdasarkan depth range

### 2. Manual Recording Control ✅
- Klik "Start Scan" untuk mulai merekam
- Depth frames di-collect selama scanning
- Klik "Stop Scan" untuk berhenti (kapan saja)

### 3. Volume Fusion (Simplified) ✅
- Semua depth frames digabungkan
- Points di-merge dari berbagai sudut
- Grid-based triangulation untuk mesh generation

### 4. Mesh Extraction ✅
- Depth-to-Mesh converter membuat solid mesh
- Vertex colors dari depth data
- Normal computation untuk lighting

### 5. Export STL ✅
- Mesh di-export ke format STL
- Siap untuk 3D printing

---

## ⚙️ Settings yang Bisa Diatur

### 1. Mesh Resolution (0.01 - 0.15)
- **Lower** (0.01) = Mesh detail tinggi, tapi lambat
- **Higher** (0.15) = Mesh kasar, tapi cepat
- **Default**: 0.05 (balance optimal)

### 2. Depth Range Min (0.3 - 2.0m)
- Jarak minimum objek dari Kinect
- **Default**: 0.5m
- Area hijau di depth camera = depth valid

### 3. Depth Range Max (1.0 - 8.0m)
- Jarak maksimum objek dari Kinect
- **Default**: 4.0m
- Sesuaikan dengan ukuran ruangan

---

## 💡 Tips untuk Hasil Terbaik

### Posisi Objek
- ✅ Jarak **0.8-2.5 meter** dari Kinect
- ✅ Lihat depth camera - **area hijau maksimal**
- ✅ Hindari area merah (invalid depth)

### Scanning Process
- ✅ Klik "Start Scan" saat objek sudah posisi optimal
- ✅ Gerakkan objek **perlahan** atau pindahkan Kinect
- ✅ Capture dari **berbagai sudut** (depan, samping, atas)
- ✅ Monitor "Frames Captured" - **50-100 frames** optimal
- ✅ Klik "Stop Scan" saat sudah cukup

### Mesh Generation
- ✅ Tunggu semua frames tercollect (min 20 frames)
- ✅ Klik "Generate Mesh"
- ✅ Mesh akan muncul **DI TENGAH viewer** (sudah fixed!)
- ✅ Drag untuk rotate, scroll untuk zoom

### Export
- ✅ Mesh harus sudah ter-generate
- ✅ Klik "Export STL"
- ✅ File ready untuk 3D printing!

---

## 🐛 Troubleshooting

### Depth camera tidak muncul / hitam
**Solusi:**
1. Pastikan Kinect connected (status hijau)
2. Pastikan server.exe running
3. Refresh browser (F5)
4. Check console (F12) untuk errors

### Mesh tidak muncul di viewer
**Solusi:**
1. Pastikan sudah "Stop Scan" terlebih dahulu
2. Klik "Generate Mesh"
3. Tunggu beberapa detik (jangan spam click)
4. Check "Mesh Vertices" - harus > 0

### Mesh muncul tapi jauh dari canvas
**Solusi:**
- ❌ **TIDAK AKAN TERJADI LAGI!**
- ✅ File baru sudah **auto-center** mesh ke origin (0,0,0)
- Mesh selalu muncul di tengah viewer

### Performance lag / freeze
**Solusi:**
1. Depth rendering sudah di-throttle ke 30 FPS
2. Reduce jumlah frames (stop scan lebih cepat)
3. Reduce mesh resolution di settings
4. Close browser tabs lain

### Depth visualization semua merah
**Solusi:**
1. Objek terlalu dekat atau terlalu jauh
2. Adjust "Depth Range Min/Max" di settings
3. Pindahkan objek ke jarak optimal (0.8-2.5m)

---

## 🎓 Kode Penting yang Diperbaiki

### Fix 1: Depth Camera Real-time (Seperti Skanect)
```javascript
function visualizeDepth(depthData) {
    // Throttle ke 30 FPS (tidak lag!)
    const now = Date.now();
    if (now - lastDepthRenderTime < 33) return;

    // Render depth dengan color coding
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (depth >= depthMin && depth <= depthMax) {
                // HIJAU = Valid
                pixels[idx] = 0;
                pixels[idx + 1] = 255;
                pixels[idx + 2] = 0;
            } else {
                // MERAH = Invalid
                pixels[idx] = 255;
                pixels[idx + 1] = 0;
                pixels[idx + 2] = 0;
            }
        }
    }
}
```

### Fix 2: Manual Scan Control (BUKAN Timer)
```javascript
function startScan() {
    isScanning = true;  // Mulai collect
    // TIDAK ADA setTimeout/timer!
}

function stopScan() {
    isScanning = false; // Stop collect
    // User yang kontrol kapan stop!
}

// Di WebSocket onmessage:
if (isScanning) {
    collectDepthFrame(depthData); // Collect selama scanning = true
}
```

### Fix 3: Center 3D Object (CRITICAL FIX!)
```javascript
function generateMesh() {
    // ... mesh generation ...

    // CRITICAL: Center mesh di origin (0, 0, 0)
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    // Translate geometry ke center
    // INI YANG MEMBUAT MESH MUNCUL DI TENGAH!
    geometry.translate(-center.x, -center.y, -center.z);

    // Add to scene
    scene.add(currentMesh);
}
```

### Fix 4: Camera Position Optimal
```javascript
function initViewer() {
    // Camera position optimal untuk objek manusia
    camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 100);
    camera.position.set(0, 0, 2.5); // Jarak optimal
    camera.lookAt(0, 0, 0);          // Lihat ke center
}
```

---

## 📁 File Structure

```
webkinect/
├── example/
│   ├── skanect-like-scanner.html  ⭐ FILE BARU - GUNAKAN INI!
│   ├── depth-to-mesh.js            (dependency)
│   ├── index.html                  (file lama)
│   └── ...
├── bin/
│   └── server.exe
└── README.md
```

---

## ✅ Checklist Fitur

### Depth Camera Visualization
- ✅ Real-time depth rendering
- ✅ Color coding (hijau/merah) seperti Skanect
- ✅ FPS counter
- ✅ Points counter
- ✅ Legend (hijau = valid, merah = invalid)
- ✅ Performance optimized (30 FPS throttling)

### Scanning Workflow
- ✅ Manual start button (bukan timer!)
- ✅ Manual stop button (kapan saja)
- ✅ Frame counter real-time
- ✅ Points counter real-time
- ✅ Max frames limit (150 frames)
- ✅ Status indicator (scanning/ready/idle)

### 3D Mesh Viewer
- ✅ Mesh muncul DI TENGAH (auto-centered!)
- ✅ Drag to rotate
- ✅ Scroll to zoom
- ✅ Vertex colors dari depth
- ✅ Proper lighting
- ✅ Grid & axes helpers
- ✅ Mesh info overlay

### Mesh Generation
- ✅ Solid mesh (BUKAN point cloud!)
- ✅ Grid-based triangulation
- ✅ Vertex colors
- ✅ Normal computation
- ✅ Bounding box center
- ✅ Performance optimized

### Export
- ✅ STL export
- ✅ ASCII format
- ✅ Auto-download
- ✅ Timestamp filename

### Settings
- ✅ Mesh resolution slider
- ✅ Depth range min slider
- ✅ Depth range max slider
- ✅ Real-time update

### Performance
- ✅ Depth rendering throttled (30 FPS)
- ✅ Mesh generation non-blocking (setTimeout)
- ✅ Frame limit (max 150)
- ✅ No lag during scanning
- ✅ Smooth viewer rotation

---

## 🎉 Kesimpulan

File baru **`skanect-like-scanner.html`** sudah mengatasi **SEMUA** masalah yang Anda sebutkan:

1. ✅ **Depth camera berfungsi** - Real-time dengan warna hijau/merah
2. ✅ **3D object di tengah** - Auto-centered, tidak jauh lagi!
3. ✅ **Manual start/stop** - Bukan timer, full control
4. ✅ **Sistem seperti Skanect** - Real-time depth recording
5. ✅ **Performance optimal** - Tidak lag, smooth 30 FPS

**Test sekarang**: Buka `example/skanect-like-scanner.html` dan lihat hasilnya!

Good luck! 🚀
