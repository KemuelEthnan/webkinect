/**
 * Mesh Scanner - Integrates KinectFusion for solid mesh generation
 * This replaces the point cloud approach with direct mesh generation
 *
 * Usage:
 * 1. Include this file AFTER kinect-fusion.js in your HTML
 * 2. Replace the scanning workflow in your main code
 */

class MeshScanner {
    constructor() {
        this.kinectFusion = new KinectFusion();
        this.depthFrames = [];
        this.isScanning = false;
        this.maxFrames = 100; // Limit number of frames
        this.useQuickMode = true; // Use quick mesh generation by default

        console.log('✅ MeshScanner initialized');
        console.log('📌 Quick mode:', this.useQuickMode ? 'ENABLED (fast mesh)' : 'DISABLED (TSDF fusion)');
    }

    /**
     * Start scanning session
     */
    startScanning() {
        console.log('🔵 Starting mesh scanning...');
        this.isScanning = true;
        this.depthFrames = [];

        if (!this.useQuickMode) {
            this.kinectFusion.reset();
        }

        console.log('✅ Scanning started');
    }

    /**
     * Process incoming depth frame
     * This is called for each frame received from Kinect
     */
    processDepthFrame(depthData) {
        if (!this.isScanning) {
            return false;
        }

        // Store frame for quick mode
        if (this.useQuickMode) {
            this.depthFrames.push(depthData);

            // Limit number of frames
            if (this.depthFrames.length > this.maxFrames) {
                this.depthFrames.shift(); // Remove oldest frame
            }

            console.log(`📊 Frames collected: ${this.depthFrames.length}/${this.maxFrames}`);
        } else {
            // TSDF fusion mode (slower but more accurate)
            this.kinectFusion.integrateDepthFrame(depthData);
        }

        return true;
    }

    /**
     * Stop scanning and generate mesh
     */
    stopScanning() {
        console.log('🛑 Stopping scan...');
        this.isScanning = false;

        console.log(`✅ Scan stopped. Collected ${this.depthFrames.length} frames`);
    }

    /**
     * Generate solid mesh from collected frames
     * This is the KEY function that creates solid mesh instead of point cloud!
     */
    generateMesh() {
        console.log('🔷 Generating SOLID MESH (not point cloud)...');
        console.log('📌 Mode:', this.useQuickMode ? 'Quick Mesh' : 'TSDF Fusion');

        const startTime = Date.now();
        let geometry = null;

        if (this.useQuickMode) {
            // Quick mode: Use depth-to-mesh converter
            // This is MUCH faster and produces good results
            geometry = this.kinectFusion.generateQuickMesh(this.depthFrames);
        } else {
            // TSDF fusion mode (slower)
            geometry = this.kinectFusion.extractMesh();
        }

        const elapsed = Date.now() - startTime;

        if (geometry) {
            console.log(`✅ SOLID MESH generated in ${elapsed}ms`);
            console.log(`📊 Vertices: ${geometry.attributes.position.count.toLocaleString()}`);
            console.log(`📊 Faces: ${geometry.index ? (geometry.index.count / 3).toLocaleString() : 'N/A'}`);
            return geometry;
        } else {
            console.error('❌ Failed to generate mesh');
            return null;
        }
    }

    /**
     * Create Three.js mesh object from geometry
     */
    createMeshObject(geometry, options = {}) {
        const {
            color = 0x00aaff,
            wireframe = false,
            vertexColors = true
        } = options;

        const material = new THREE.MeshPhongMaterial({
            color: vertexColors ? 0xffffff : color,
            vertexColors: vertexColors,
            side: THREE.DoubleSide,
            flatShading: false,
            wireframe: wireframe,
            shininess: 30
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Add shadows if needed
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * Export mesh to STL format
     */
    exportToSTL(geometry, filename = 'kinect_mesh.stl') {
        console.log('📤 Exporting mesh to STL...');

        let stlContent = 'solid KinectMesh\n';

        const positions = geometry.attributes.position;
        const indices = geometry.index ? geometry.index.array : null;

        if (indices) {
            // Indexed geometry
            for (let i = 0; i < indices.length; i += 3) {
                const i1 = indices[i] * 3;
                const i2 = indices[i + 1] * 3;
                const i3 = indices[i + 2] * 3;

                const v1 = new THREE.Vector3(
                    positions.array[i1],
                    positions.array[i1 + 1],
                    positions.array[i1 + 2]
                );
                const v2 = new THREE.Vector3(
                    positions.array[i2],
                    positions.array[i2 + 1],
                    positions.array[i2 + 2]
                );
                const v3 = new THREE.Vector3(
                    positions.array[i3],
                    positions.array[i3 + 1],
                    positions.array[i3 + 2]
                );

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

                const v1 = new THREE.Vector3(
                    positions.array[i1],
                    positions.array[i1 + 1],
                    positions.array[i1 + 2]
                );
                const v2 = new THREE.Vector3(
                    positions.array[i2],
                    positions.array[i2 + 1],
                    positions.array[i2 + 2]
                );
                const v3 = new THREE.Vector3(
                    positions.array[i3],
                    positions.array[i3 + 1],
                    positions.array[i3 + 2]
                );

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

        stlContent += 'endsolid KinectMesh\n';

        // Download file
        const blob = new Blob([stlContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);

        console.log('✅ STL file exported successfully');
    }

    /**
     * Get scanning statistics
     */
    getStats() {
        return {
            isScanning: this.isScanning,
            frameCount: this.depthFrames.length,
            maxFrames: this.maxFrames,
            mode: this.useQuickMode ? 'Quick Mesh' : 'TSDF Fusion',
            fusionStats: this.kinectFusion.getStats()
        };
    }

    /**
     * Reset scanner
     */
    reset() {
        console.log('🔄 Resetting scanner...');
        this.isScanning = false;
        this.depthFrames = [];
        this.kinectFusion.reset();
        console.log('✅ Scanner reset complete');
    }

    /**
     * Set scanning mode
     */
    setMode(useQuickMode) {
        this.useQuickMode = useQuickMode;
        console.log('⚙️ Mode changed to:', useQuickMode ? 'Quick Mesh' : 'TSDF Fusion');
    }

    /**
     * Set maximum frames to collect
     */
    setMaxFrames(maxFrames) {
        this.maxFrames = maxFrames;
        console.log('⚙️ Max frames set to:', maxFrames);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MeshScanner;
}
