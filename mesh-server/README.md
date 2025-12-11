# Ball Pivoting Mesh Server

Server Python Flask untuk rekonstruksi mesh 3D menggunakan **Ball Pivoting Algorithm (BPA)** dari Open3D.

## 📋 Deskripsi

Ball Pivoting Algorithm adalah metode rekonstruksi surface dari point cloud yang menghasilkan mesh yang lebih terstruktur, utuh, dan watertight dibandingkan metode triangulasi sederhana.

### Kelebihan Ball Pivoting:
- ✅ Mesh lebih terstruktur dan rapi
- ✅ Permukaan lebih halus dan natural
- ✅ Watertight mesh (tidak ada lubang/holes)
- ✅ Lebih mendekati bentuk asli objek
- ✅ Cocok untuk 3D printing

### Workflow:
```
Kinect → Point Cloud → Browser → Python Server (Open3D BPA) → Mesh → Browser (Three.js)
```

## 🔧 Requirements

### Software
- Python 3.8 - 3.12
- pip (Python package manager)

### Python Packages
Semua dependensi ada di file `requirements.txt`:
- Flask 3.0.0
- flask-cors 4.0.0
- open3d 0.18.0
- numpy 1.24.3

## 📦 Instalasi

### 1. Install Python
Pastikan Python 3.8+ sudah terinstall:
```bash
python --version
```

### 2. Install Dependencies
```bash
cd mesh-server
pip install -r requirements.txt
```

**Note untuk Windows:**
Jika ada error saat install Open3D, gunakan:
```bash
pip install --upgrade pip
pip install open3d==0.18.0 --no-cache-dir
```

### 3. Verifikasi Instalasi
```bash
python -c "import open3d; print('Open3D version:', open3d.__version__)"
```

## 🚀 Menjalankan Server

### Start Server
```bash
cd mesh-server
python app.py
```

Server akan berjalan di: `http://localhost:5000`

### Output yang diharapkan:
```
============================================================
🚀 Ball Pivoting Mesh Server
============================================================
📌 Endpoints:
   GET  /health          - Health check
   POST /mesh            - Create mesh from point cloud
   POST /mesh/stats      - Get point cloud statistics
============================================================
🔧 Starting server...

 * Running on http://0.0.0.0:5000
```

## 📡 API Endpoints

### 1. Health Check
**GET** `/health`

Cek apakah server berjalan dengan baik.

**Response:**
```json
{
  "status": "ok",
  "service": "Ball Pivoting Mesh Server",
  "version": "1.0.0"
}
```

### 2. Generate Mesh
**POST** `/mesh?radius_multiplier=1.5&num_radii=2&format=ply`

Generate mesh dari point cloud menggunakan Ball Pivoting Algorithm.

**Query Parameters:**
- `radius_multiplier` (float, default: 1.5) - Multiplier untuk ball radius
- `num_radii` (int, default: 2) - Jumlah radius yang digunakan
- `format` (string, default: 'ply') - Format output: 'ply' atau 'obj'

**Request Body:**
- **Content-Type: application/octet-stream** - Binary PLY file
- **Content-Type: application/json** - JSON point cloud:
  ```json
  {
    "points": [
      {"x": 0.1, "y": 0.2, "z": 0.3, "r": 255, "g": 0, "b": 0},
      ...
    ]
  }
  ```

**Response:**
- Binary PLY/OBJ mesh file
- Headers:
  - `X-Num-Vertices` - Jumlah vertices
  - `X-Num-Triangles` - Jumlah triangles
  - `X-Processing-Time` - Waktu processing (detik)

### 3. Get Statistics
**POST** `/mesh/stats`

Dapatkan statistik point cloud tanpa generate mesh (lebih cepat).

**Response:**
```json
{
  "num_points": 50000,
  "avg_point_distance": 0.015,
  "suggested_radius": 0.0225,
  "has_normals": false,
  "has_colors": true
}
```

## 🎨 Cara Menggunakan dari Frontend

### 1. Gunakan ball-pivoting-mesh.js

```javascript
// Initialize
const meshGenerator = new BallPivotingMeshGenerator('http://localhost:5000');

// Check server
const isHealthy = await meshGenerator.checkServerHealth();

// Configure
meshGenerator.setConfig({
    radiusMultiplier: 1.5,
    numRadii: 2,
    outputFormat: 'ply'
});

// Generate mesh from points
const meshData = await meshGenerator.generateMeshFromPoints(points, useJSON=true);

// Load into Three.js scene
const mesh = await meshGenerator.loadMeshIntoScene(meshData, scene);

// Or do both at once
const mesh = await meshGenerator.processAndLoadMesh(points, scene);
```

### 2. Buka Demo HTML

```bash
# Dari folder example
open ball-pivoting-demo.html
# atau
start ball-pivoting-demo.html  # Windows
```

## ⚙️ Parameter Tuning

### Radius Multiplier
- **Range:** 1.0 - 3.0
- **Default:** 1.5
- **Effect:**
  - Lebih kecil (1.0-1.5): Lebih detail, tapi bisa ada holes
  - Lebih besar (2.0-3.0): Lebih smooth, tapi kehilangan detail kecil

### Number of Radii
- **Range:** 1 - 5
- **Default:** 2
- **Effect:**
  - Lebih banyak: Coverage lebih baik, tapi lebih lambat
  - Lebih sedikit: Lebih cepat, tapi mungkin ada gaps

### Tips untuk Hasil Terbaik:
1. Mulai dengan default settings (1.5, 2 radii)
2. Jika ada holes, **tingkatkan** radius multiplier
3. Jika terlalu smooth dan kehilangan detail, **kurangi** radius multiplier
4. Untuk objek kompleks, tambah num_radii ke 3-4

## 📊 Performance

### Typical Processing Times (pada laptop mid-range):

| Point Count | Processing Time | Mesh Size |
|------------|----------------|-----------|
| 10,000     | ~1-2 sec       | Small     |
| 50,000     | ~3-5 sec       | Medium    |
| 100,000    | ~8-12 sec      | Large     |
| 200,000+   | ~20-30 sec     | Very Large|

**Tips:**
- Untuk real-time: subsample point cloud ke ~30-50k points
- Untuk kualitas terbaik: gunakan full resolution

## 🐛 Troubleshooting

### Server tidak mau start
```
ImportError: No module named 'open3d'
```
**Solusi:** Install ulang Open3D
```bash
pip install open3d==0.18.0
```

### Mesh generation gagal
```
ValueError: Ball Pivoting failed to generate mesh!
```
**Solusi:**
1. Point cloud terlalu sparse - tambahkan lebih banyak points
2. Radius terlalu kecil - tingkatkan `radius_multiplier`
3. Point cloud tidak memiliki normals - server akan auto-estimate

### CORS Error di browser
```
Access to fetch at 'http://localhost:5000/mesh' has been blocked by CORS policy
```
**Solusi:** Server sudah include flask-cors, restart server jika error persist

### Memory Error
```
MemoryError: Unable to allocate array
```
**Solusi:**
1. Reduce point cloud size
2. Increase system RAM
3. Use point cloud downsampling

## 🔄 Perbandingan dengan Metode Lain

| Feature | Ball Pivoting | Watertight (Grid) | Poisson Reconstruction |
|---------|--------------|-------------------|----------------------|
| Mesh Quality | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Speed | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Detail Preservation | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Watertight | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Setup Complexity | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

**Ball Pivoting adalah pilihan terbaik untuk:**
- Scan 3D objects untuk printing
- Aplikasi yang butuh mesh berkualitas tinggi
- Ketika waktu processing bukan prioritas utama

## 📚 Referensi

- [Open3D Documentation - Ball Pivoting](https://www.open3d.org/docs/latest/tutorial/Advanced/surface_reconstruction.html)
- [Ball Pivoting Algorithm Paper](http://mesh.brown.edu/bpa/)
- [Flask Documentation](https://flask.palletsprojects.com/)

## 📝 License

MIT License - Free to use and modify

## 🤝 Support

Jika ada masalah atau pertanyaan, silakan buat issue di repository.
