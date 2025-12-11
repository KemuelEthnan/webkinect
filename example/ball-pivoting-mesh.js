/**
 * Ball Pivoting Mesh Generator
 * Integrasi dengan Python Open3D server untuk rekonstruksi mesh menggunakan Ball Pivoting Algorithm
 *
 * Workflow:
 * 1. Kumpulkan point cloud dari Kinect
 * 2. Export ke format PLY
 * 3. Kirim ke Python server
 * 4. Terima mesh hasil Ball Pivoting
 * 5. Load dan tampilkan di Three.js
 *
 * Kelebihan Ball Pivoting:
 * - Mesh lebih terstruktur dan utuh
 * - Permukaan lebih halus
 * - Hasil lebih mendekati bentuk asli objek
 * - Watertight mesh (tidak ada lubang)
 */

class BallPivotingMeshGenerator {
    constructor(serverUrl = 'http://localhost:5000') {
        this.serverUrl = serverUrl;
        this.pointCloud = [];
        this.isProcessing = false;
        this.lastMesh = null;

        // Configuration
        this.config = {
            radiusMultiplier: 1.5,  // Multiplier untuk ball radius
            numRadii: 2,            // Jumlah radius yang digunakan
            outputFormat: 'ply'     // Format output: 'ply' atau 'obj'
        };

        console.log('✅ Ball Pivoting Mesh Generator initialized');
        console.log('📡 Server URL:', this.serverUrl);
    }

    /**
     * Set configuration parameters
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        console.log('⚙️ Configuration updated:', this.config);
    }

    /**
     * Check if server is running
     */
    async checkServerHealth() {
        try {
            const response = await fetch(`${this.serverUrl}/health`);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            const data = await response.json();
            console.log('✅ Server is healthy:', data);
            return true;
        } catch (error) {
            console.error('❌ Server health check failed:', error);
            return false;
        }
    }

    /**
     * Convert Three.js points to PLY format
     */
    pointsToPLY(points) {
        if (!points || points.length === 0) {
            throw new Error('No points provided');
        }

        console.log('🔧 Converting', points.length, 'points to PLY format...');

        // PLY header
        let ply = 'ply\n';
        ply += 'format ascii 1.0\n';
        ply += `element vertex ${points.length}\n`;
        ply += 'property float x\n';
        ply += 'property float y\n';
        ply += 'property float z\n';
        ply += 'property uchar red\n';
        ply += 'property uchar green\n';
        ply += 'property uchar blue\n';
        ply += 'end_header\n';

        // Vertex data
        for (const point of points) {
            const x = point.x || 0;
            const y = point.y || 0;
            const z = point.z || 0;
            const r = Math.floor((point.r || 128) * (point.r > 1 ? 1 : 255));
            const g = Math.floor((point.g || 128) * (point.g > 1 ? 1 : 255));
            const b = Math.floor((point.b || 128) * (point.b > 1 ? 1 : 255));

            ply += `${x} ${y} ${z} ${r} ${g} ${b}\n`;
        }

        console.log('✅ PLY conversion complete');
        return ply;
    }

    /**
     * Convert Three.js points to JSON format
     */
    pointsToJSON(points) {
        if (!points || points.length === 0) {
            throw new Error('No points provided');
        }

        console.log('🔧 Converting', points.length, 'points to JSON format...');

        const jsonData = {
            points: points.map(p => ({
                x: p.x || 0,
                y: p.y || 0,
                z: p.z || 0,
                r: p.r || 128,
                g: p.g || 128,
                b: p.b || 128
            }))
        };

        console.log('✅ JSON conversion complete');
        return JSON.stringify(jsonData);
    }

    /**
     * Send point cloud to server and get mesh back
     */
    async generateMeshFromPoints(points, useJSON = false) {
        if (this.isProcessing) {
            console.warn('⚠️ Already processing a mesh request');
            return null;
        }

        this.isProcessing = true;

        try {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 Starting Ball Pivoting mesh generation...');
            console.log('   Points:', points.length);
            console.log('   Config:', this.config);
            console.log('='.repeat(60) + '\n');

            // Convert points to PLY or JSON
            let requestBody;
            let contentType;

            if (useJSON) {
                requestBody = this.pointsToJSON(points);
                contentType = 'application/json';
            } else {
                requestBody = this.pointsToPLY(points);
                contentType = 'application/octet-stream';
            }

            // Build query parameters
            const params = new URLSearchParams({
                radius_multiplier: this.config.radiusMultiplier,
                num_radii: this.config.numRadii,
                format: this.config.outputFormat,
                input_format: 'ply'
            });

            // Send to server
            console.log('📤 Sending point cloud to server...');
            const startTime = Date.now();

            const response = await fetch(`${this.serverUrl}/mesh?${params}`, {
                method: 'POST',
                headers: {
                    'Content-Type': contentType
                },
                body: requestBody
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Server error: ${errorData.error || response.statusText}`);
            }

            // Get mesh blob
            const meshBlob = await response.blob();
            const elapsed = Date.now() - startTime;

            // Get statistics from headers
            const stats = {
                numVertices: parseInt(response.headers.get('X-Num-Vertices') || '0'),
                numTriangles: parseInt(response.headers.get('X-Num-Triangles') || '0'),
                processingTime: parseFloat(response.headers.get('X-Processing-Time') || '0')
            };

            console.log('\n✅ Mesh received successfully!');
            console.log('   Total time:', elapsed, 'ms');
            console.log('   Server processing time:', stats.processingTime.toFixed(2), 's');
            console.log('   Vertices:', stats.numVertices.toLocaleString());
            console.log('   Triangles:', stats.numTriangles.toLocaleString());
            console.log('');

            // Create object URL for the mesh
            const meshUrl = URL.createObjectURL(meshBlob);

            return {
                url: meshUrl,
                blob: meshBlob,
                stats: stats,
                format: this.config.outputFormat
            };

        } catch (error) {
            console.error('❌ Ball Pivoting mesh generation failed:', error);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Load mesh into Three.js scene
     */
    async loadMeshIntoScene(meshData, scene, options = {}) {
        const {
            color = 0x00aaff,
            wireframe = false,
            vertexColors = true,
            metalness = 0.3,
            roughness = 0.7
        } = options;

        console.log('🔷 Loading mesh into Three.js scene...');

        return new Promise((resolve, reject) => {
            // Choose loader based on format
            const loader = meshData.format === 'obj'
                ? new THREE.OBJLoader()
                : new THREE.PLYLoader();

            loader.load(
                meshData.url,
                (geometry) => {
                    console.log('✅ Mesh loaded into Three.js');

                    // Create material
                    const material = new THREE.MeshStandardMaterial({
                        color: vertexColors ? 0xffffff : color,
                        vertexColors: vertexColors,
                        side: THREE.DoubleSide,
                        flatShading: false,
                        wireframe: wireframe,
                        metalness: metalness,
                        roughness: roughness
                    });

                    // Create mesh object
                    let mesh;
                    if (geometry.isBufferGeometry) {
                        mesh = new THREE.Mesh(geometry, material);
                    } else if (geometry.isGroup) {
                        // OBJ loader returns Group
                        mesh = geometry;
                        mesh.traverse((child) => {
                            if (child.isMesh) {
                                child.material = material;
                            }
                        });
                    }

                    // Enable shadows
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    // Add to scene
                    scene.add(mesh);

                    // Store reference
                    this.lastMesh = mesh;

                    console.log('✅ Mesh added to scene');

                    resolve(mesh);
                },
                (progress) => {
                    // Progress callback
                    if (progress.lengthComputable) {
                        const percent = (progress.loaded / progress.total * 100).toFixed(0);
                        console.log(`📥 Loading: ${percent}%`);
                    }
                },
                (error) => {
                    console.error('❌ Failed to load mesh:', error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Complete workflow: Generate mesh from points and load into scene
     */
    async processAndLoadMesh(points, scene, options = {}) {
        try {
            // Step 1: Check server health
            const serverHealthy = await this.checkServerHealth();
            if (!serverHealthy) {
                throw new Error('Server is not available. Please start the mesh server.');
            }

            // Step 2: Generate mesh from points
            const meshData = await this.generateMeshFromPoints(points, options.useJSON);

            if (!meshData) {
                throw new Error('Failed to generate mesh');
            }

            // Step 3: Load mesh into scene
            const mesh = await this.loadMeshIntoScene(meshData, scene, options);

            // Clean up blob URL
            URL.revokeObjectURL(meshData.url);

            return mesh;

        } catch (error) {
            console.error('❌ Process and load mesh failed:', error);
            throw error;
        }
    }

    /**
     * Get point cloud statistics from server (without full processing)
     */
    async getPointCloudStats(points, useJSON = false) {
        try {
            console.log('📊 Getting point cloud statistics...');

            // Convert points
            let requestBody;
            let contentType;

            if (useJSON) {
                requestBody = this.pointsToJSON(points);
                contentType = 'application/json';
            } else {
                requestBody = this.pointsToPLY(points);
                contentType = 'application/octet-stream';
            }

            // Send to server
            const response = await fetch(`${this.serverUrl}/mesh/stats`, {
                method: 'POST',
                headers: {
                    'Content-Type': contentType
                },
                body: requestBody
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const stats = await response.json();
            console.log('✅ Statistics received:', stats);

            return stats;

        } catch (error) {
            console.error('❌ Failed to get statistics:', error);
            throw error;
        }
    }

    /**
     * Download mesh file
     */
    downloadMesh(meshData, filename = 'kinect_mesh') {
        const ext = meshData.format || 'ply';
        const link = document.createElement('a');
        link.href = meshData.url;
        link.download = `${filename}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log(`✅ Mesh downloaded: ${filename}.${ext}`);
    }

    /**
     * Remove last mesh from scene
     */
    removeLastMesh(scene) {
        if (this.lastMesh) {
            scene.remove(this.lastMesh);
            this.lastMesh.geometry?.dispose();
            this.lastMesh.material?.dispose();
            this.lastMesh = null;
            console.log('✅ Last mesh removed from scene');
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BallPivotingMeshGenerator;
}
