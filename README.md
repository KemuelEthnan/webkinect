# Web Kinect

Web server untuk menggunakan Microsoft Kinect 360 (Kinect V1) di halaman web melalui [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).

## Fitur Utama

- **Akses ke Kamera Kinect**: Color dan Depth image stream
- **Skeleton Tracking**: Deteksi dan tracking skeleton manusia
- **3D Scanning**: Scan objek 3D dan export ke format STL untuk 3D printing
- **Real-time Visualization**: Visualisasi point cloud dan mesh menggunakan Three.js
- **WebSocket Communication**: Komunikasi real-time antara browser dan server

## Requirements

- **Hardware**: Microsoft Kinect 360 (Kinect V1)
- **Software**: 
  - Microsoft Kinect SDK 1.8 atau lebih baru
  - Visual Studio (untuk build dari source) atau .NET Framework 4.0+
- **Browser**: Browser modern dengan dukungan WebSocket dan WebGL

## Instalasi

1. Install Microsoft Kinect SDK dari [Microsoft Download Center](https://www.microsoft.com/en-us/download/details.aspx?id=44561)
2. Hubungkan Kinect ke komputer via USB
3. Jalankan `server.exe` (atau compile dari source code di folder `source/`)

Server akan berjalan di `ws://127.0.0.1:8181` secara default.



## Struktur Proyek

```
webkinect/
├── source/                 # Source code C# server
│   ├── Program.cs         # Main server application
│   ├── JsonSerializer.cs  # JSON serialization untuk point cloud
│   ├── Mode.cs            # Enum untuk server modes
│   └── ...                # File-file serializer lainnya
├── example/
│   ├── index.html         # Halaman utama dengan fitur 3D scanning
│   └── pointcloud-processor.js  # Utility untuk processing point cloud
├── server.exe             # Compiled server executable
└── README.md              # Dokumentasi ini
```

## Usage Example

Contoh penggunaan dasar untuk komunikasi dengan server:

```javascript
var socket = new WebSocket("ws://127.0.0.1:8181");
var connected = false;

socket.onopen = function() {
	connected = true;
	// Switch ke mode yang diinginkan
	socket.send("PointCloud");  // atau "Color", "Depth", "RawDepth"
};

socket.onclose = function() {
	connected = false;
};

socket.onmessage = function(event) {
	// Point cloud atau skeleton data (JSON string)
	if(typeof event.data === "string") {
		var data = JSON.parse(event.data);
		if(data.mode === "PointCloud" && data.data) {
			// Process point cloud data
			var points = data.data;  // Array of {x, y, z, r, g, b}
		} else if(data.skeletons) {
			// Process skeleton data
		}
	}
	// Camera feed (Blob)
	else if(event.data instanceof Blob) {
		var url = URL.createObjectURL(event.data);
		// Use URL for image display
	}
};
```

## Server Modes

Server mendukung beberapa mode operasi yang dapat di-switch melalui WebSocket:

- **`Color`** - Mengirim color camera feed (JPEG) dan skeleton data
- **`Depth`** - Mengirim depth camera feed (JPEG)
- **`PointCloud`** - Mengirim point cloud data (JSON) untuk 3D scanning
- **`RawDepth`** - Mengirim raw depth data (JSON)

## 3D Scanning & STL Export

Fitur lengkap untuk melakukan 3D scanning objek dan export ke format STL.

### Cara Menggunakan

1. **Jalankan Server:**
   ```
   - Buka server.exe (atau compile dari source/ dengan Visual Studio)
   - Pastikan Kinect terhubung dan terdeteksi
   - Console server akan menampilkan status koneksi
   ```

2. **Buka Halaman Scanning:**
   - Buka file `example/index.html` di browser
   - Atau buka dengan `file:///path/to/webkinect/example/index.html`

3. **Langkah-langkah Scanning:**
   - Klik tab "3D Scanning" di halaman web
   - Klik "Hubungkan" untuk terhubung ke server Kinect
   - Pastikan objek berada dalam range 0.85-4 meter dari Kinect
   - Klik "Mulai Scan" - sistem akan otomatis menangkap objek selama 10 detik
   - Progress bar akan menunjukkan progress 0-100%
   - Pindahkan objek atau Kinect untuk mendapatkan berbagai sudut pandang
   - Setelah scanning selesai (100%), klik "Generate Mesh" untuk membuat model 3D
   - Klik "Export STL" untuk menyimpan file .stl

### Fitur 3D Scanning

- **Auto-Scan Mechanism**: Scanning otomatis selama 10 detik dengan progress bar
- **Real-time Point Cloud Visualization**: Visualisasi point cloud menggunakan Three.js
- **Multiple Frame Capture**: Akumulasi data dari multiple frames untuk detail yang lebih baik
- **Mesh Generation**: Generate 3D mesh dari point cloud dengan konfigurasi resolusi
- **STL Export**: Export model 3D ke format STL untuk 3D printing
- **Interactive 3D Viewer**: Kontrol mouse untuk rotate, zoom, dan pan
- **Settings**: Konfigurasi max points per frame dan mesh resolution

### Tips untuk Hasil Terbaik

- **Posisi Objek**: Objek harus berada dalam range depth 0.85-4 meter dari Kinect
- **Lighting**: Gunakan lighting yang cukup untuk hasil terbaik
- **Permukaan**: Objek dengan permukaan yang tidak terlalu reflektif akan lebih mudah di-scan
- **Multiple Angles**: Pindahkan objek atau Kinect selama scanning untuk mendapatkan berbagai sudut
- **Detail**: Semakin banyak frames yang di-capture, semakin detail hasilnya
- **File STL**: File STL yang dihasilkan dapat dibuka di software 3D seperti Blender, MeshLab, atau slicer untuk 3D printing

## Build dari Source

1. Buka Visual Studio
2. Open project: `source/KinectServer.csproj`
3. Build > Build Solution (Ctrl+Shift+B)
4. Copy executable dari `bin/Release/KinectServer.exe` ke folder root sebagai `server.exe`

## Troubleshooting

### Server tidak terdeteksi
- Pastikan Kinect terhubung ke USB
- Install Microsoft Kinect SDK
- Restart komputer jika perlu

### Server tidak mengirim data point cloud
- **PENTING**: Rebuild server dari source code terbaru
- Cek console server untuk error messages
- Pastikan mode sudah switch ke PointCloud (lihat log server)
- Pastikan objek berada dalam range depth yang benar

### Console Server Logs
Saat menjalankan server, console akan menampilkan log detail:
- `[KINECT]` - Status Kinect sensor
- `[WEBSOCKET]` - Koneksi WebSocket
- `[MODE]` - Mode switching
- `[POINTCLOUD]` - Point cloud processing
- `[SERIALIZE]` - Data serialization

### Debug Mode
- Buka browser console (F12) untuk melihat log frontend
- Buka console server untuk melihat log backend
- Periksa apakah mode benar-benar switch ke PointCloud
- Periksa apakah data benar-benar dikirim dan diterima

## Perbaikan dan Fitur yang Telah Diimplementasikan

### Server Side (C#)
- ✅ **Thread-safe Mode Switching**: Mode switching menggunakan `volatile` dan `lock` untuk thread safety
- ✅ **Detailed Logging**: Logging detail untuk debugging (mode switching, data sending, errors)
- ✅ **Error Handling**: Error handling yang lebih baik dengan try-catch di semua operasi kritis
- ✅ **Empty Response Handling**: Server selalu mengirim response meskipun data kosong untuk feedback ke client
- ✅ **Point Cloud Serialization**: Serialization point cloud dengan color mapping dari depth dan color frames

### Client Side (JavaScript)
- ✅ **Auto-Scan Mechanism**: Scanning otomatis selama 10 detik tanpa perlu tombol Stop
- ✅ **Progress Bar**: Progress bar real-time 0-100% selama scanning
- ✅ **Data Validation**: Validasi dan error handling untuk data yang diterima
- ✅ **Mode Switching**: Force mode switching dengan multiple attempts untuk memastikan server menerima
- ✅ **Point Cloud Visualization**: Visualisasi point cloud real-time menggunakan Three.js
- ✅ **Mesh Generation**: Generate 3D mesh dari point cloud dengan konfigurasi resolusi
- ✅ **STL Export**: Export mesh ke format STL untuk 3D printing
- ✅ **Interactive 3D Viewer**: Kontrol mouse untuk rotate, zoom, dan pan di 3D viewer

### Fitur UI/UX
- ✅ **Tab-based Interface**: Interface dengan tab untuk Normal mode dan 3D Scanning
- ✅ **Real-time Status**: Status indicator dan informasi real-time
- ✅ **Settings Panel**: Konfigurasi max points per frame dan mesh resolution
- ✅ **Debug Information**: Debug panel untuk monitoring data yang diterima

## Catatan Penting

1. **Rebuild Server**: Setelah melakukan perubahan pada source code, **WAJIB rebuild server** dari source untuk menggunakan versi terbaru
2. **Console Logs**: Selalu periksa console server dan browser console untuk debugging
3. **Mode Switching**: Pastikan mode benar-benar switch ke PointCloud sebelum scanning (cek log server)
4. **Range Depth**: Objek harus berada dalam range 0.85-4 meter dari Kinect untuk hasil terbaik

## License

- Project uses a MIT license that allow for commercial usage of the platform without any cost.
- The license is available on the project GitHub page
