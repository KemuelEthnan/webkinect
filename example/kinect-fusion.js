/**
 * KinectFusion-like Implementation for Web
 * Converts depth frames to solid mesh in real-time (like Skanect)
 *
 * This approach creates SOLID, CONTINUOUS mesh surfaces
 * NOT scattered point clouds!
 */

class KinectFusion {
    constructor() {
        // Kinect V1 camera parameters
        this.focalLength = 525.0;
        this.centerX = 320.0;
        this.centerY = 240.0;

        // TSDF Volume parameters
        this.volumeSize = { x: 3.0, y: 3.0, z: 3.0 }; // 3x3x3 meters
        this.voxelResolution = 256; // 256^3 voxels
        this.voxelSize = this.volumeSize.x / this.voxelResolution;
        this.truncationDistance = this.voxelSize * 4;

        // TSDF volume (stores signed distance values)
        this.tsdfVolume = null;
        this.weightVolume = null;
        this.colorVolume = null;

        // Accumulated frames
        this.frameCount = 0;
        this.meshGenerated = false;

        // Depth-to-mesh converter for quick mesh generation
        this.depthToMeshConverter = new DepthToMeshConverter();

        console.log('✅ KinectFusion initialized');
        console.log('📦 Volume size:', this.volumeSize);
        console.log('🔲 Voxel resolution:', this.voxelResolution);
        console.log('📏 Voxel size:', this.voxelSize.toFixed(4), 'm');
    }

    /**
     * Initialize TSDF volume
     * This is the core data structure for fusion
     */
    initVolume() {
        const totalVoxels = this.voxelResolution ** 3;
        console.log('🔵 Initializing TSDF volume with', totalVoxels.toLocaleString(), 'voxels...');

        // For performance, we'll use a Map instead of 3D array
        // Only store non-empty voxels (sparse representation)
        this.tsdfVolume = new Map();
        this.weightVolume = new Map();
        this.colorVolume = new Map();

        console.log('✅ TSDF volume initialized (sparse representation)');
    }

    /**
     * Integrate depth frame into TSDF volume
     * This is the CORE of KinectFusion algorithm
     */
    integrateDepthFrame(depthFrame, colorFrame = null) {
        if (!this.tsdfVolume) {
            this.initVolume();
        }

        this.frameCount++;
        console.log(`🔷 Integrating frame ${this.frameCount}...`);

        const startTime = Date.now();

        // Parse depth data
        const { width, height, points } = this.parseDepthData(depthFrame);

        if (!points || points.length === 0) {
            console.warn('⚠️ No valid depth points in frame');
            return false;
        }

        console.log(`📊 Frame has ${points.length} depth points (${width}x${height})`);

        // Create depth map for faster lookup
        const depthMap = this.createDepthMap(points, width, height);

        // Integrate depth map into TSDF volume
        let voxelsUpdated = 0;

        // Sample voxels along camera rays
        // For performance, we only update voxels near the surface
        for (let i = 0; i < points.length; i += 2) { // Skip every other point for performance
            const point = points[i];
            if (!point) continue;

            const depth = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);

            // Skip invalid depths
            if (depth < 0.5 || depth > 4.0) continue;

            // Trace ray and update voxels near surface
            const rayVoxels = this.getRayVoxels(point, depth);

            for (const voxel of rayVoxels) {
                const voxelKey = `${voxel.x},${voxel.y},${voxel.z}`;

                // Compute signed distance to surface
                const voxelDepth = Math.sqrt(
                    voxel.worldX * voxel.worldX +
                    voxel.worldY * voxel.worldY +
                    voxel.worldZ * voxel.worldZ
                );

                const sdf = depth - voxelDepth;

                // Truncate distance
                const truncatedSDF = Math.max(-this.truncationDistance,
                                            Math.min(this.truncationDistance, sdf));

                // Update TSDF with running average
                const currentTSDF = this.tsdfVolume.get(voxelKey) || 0;
                const currentWeight = this.weightVolume.get(voxelKey) || 0;

                const newWeight = currentWeight + 1;
                const newTSDF = (currentTSDF * currentWeight + truncatedSDF) / newWeight;

                this.tsdfVolume.set(voxelKey, newTSDF);
                this.weightVolume.set(voxelKey, Math.min(newWeight, 255)); // Clamp weight

                // Store color if available
                if (point.r !== undefined) {
                    const currentColor = this.colorVolume.get(voxelKey) || { r: 0, g: 0, b: 0 };
                    const newColor = {
                        r: (currentColor.r * currentWeight + point.r) / newWeight,
                        g: (currentColor.g * currentWeight + point.g) / newWeight,
                        b: (currentColor.b * currentWeight + point.b) / newWeight
                    };
                    this.colorVolume.set(voxelKey, newColor);
                }

                voxelsUpdated++;
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ Integrated frame in ${elapsed}ms, updated ${voxelsUpdated} voxels`);
        console.log(`📊 Total voxels in volume: ${this.tsdfVolume.size}`);

        return true;
    }

    /**
     * Parse depth data from various formats
     */
    parseDepthData(depthFrame) {
        if (depthFrame.points && Array.isArray(depthFrame.points)) {
            // Already in point cloud format
            return {
                width: depthFrame.width || 320,
                height: depthFrame.height || 240,
                points: depthFrame.points
            };
        }

        // Handle raw depth array
        console.warn('⚠️ Unexpected depth frame format');
        return { width: 320, height: 240, points: [] };
    }

    /**
     * Create 2D depth map from point cloud
     */
    createDepthMap(points, width, height) {
        const depthMap = [];

        for (let y = 0; y < height; y++) {
            depthMap[y] = [];
            for (let x = 0; x < width; x++) {
                depthMap[y][x] = null;
            }
        }

        for (const point of points) {
            const z = Math.abs(point.z);
            if (z <= 0) continue;

            // Project to 2D
            const x2d = Math.round((point.x * this.focalLength / z) + this.centerX);
            const y2d = Math.round((-point.y * this.focalLength / z) + this.centerY);

            if (x2d >= 0 && x2d < width && y2d >= 0 && y2d < height) {
                if (!depthMap[y2d][x2d] || depthMap[y2d][x2d].z > z) {
                    depthMap[y2d][x2d] = point;
                }
            }
        }

        return depthMap;
    }

    /**
     * Get voxels along camera ray near surface
     */
    getRayVoxels(point, surfaceDepth) {
        const voxels = [];

        // Sample voxels along ray from camera to point
        const numSamples = 5; // Sample 5 voxels near surface
        const startDepth = Math.max(0.5, surfaceDepth - this.truncationDistance);
        const endDepth = Math.min(4.0, surfaceDepth + this.truncationDistance);
        const stepSize = (endDepth - startDepth) / numSamples;

        for (let i = 0; i < numSamples; i++) {
            const depth = startDepth + i * stepSize;
            const scale = depth / surfaceDepth;

            const worldX = point.x * scale;
            const worldY = point.y * scale;
            const worldZ = point.z * scale;

            // Convert world coordinates to voxel indices
            const vx = Math.floor((worldX + this.volumeSize.x / 2) / this.voxelSize);
            const vy = Math.floor((worldY + this.volumeSize.y / 2) / this.voxelSize);
            const vz = Math.floor((worldZ + this.volumeSize.z / 2) / this.voxelSize);

            // Check bounds
            if (vx >= 0 && vx < this.voxelResolution &&
                vy >= 0 && vy < this.voxelResolution &&
                vz >= 0 && vz < this.voxelResolution) {
                voxels.push({ x: vx, y: vy, z: vz, worldX, worldY, worldZ });
            }
        }

        return voxels;
    }

    /**
     * Extract mesh from TSDF volume using Marching Cubes
     * This creates the SOLID mesh surface
     */
    extractMesh() {
        if (!this.tsdfVolume || this.tsdfVolume.size === 0) {
            console.warn('⚠️ TSDF volume is empty, cannot extract mesh');
            return null;
        }

        console.log('🔷 Extracting mesh from TSDF volume using Marching Cubes...');
        const startTime = Date.now();

        const vertices = [];
        const colors = [];
        const indices = [];
        const vertexMap = new Map();

        let vertexCount = 0;
        let faceCount = 0;

        // Simplified marching cubes: find zero-crossing voxels
        this.tsdfVolume.forEach((tsdf, voxelKey) => {
            const [vx, vy, vz] = voxelKey.split(',').map(Number);

            // Only process voxels near surface (tsdf close to 0)
            if (Math.abs(tsdf) > this.truncationDistance * 0.5) return;

            // Convert voxel indices to world coordinates
            const worldX = (vx * this.voxelSize) - this.volumeSize.x / 2;
            const worldY = (vy * this.voxelSize) - this.volumeSize.y / 2;
            const worldZ = (vz * this.voxelSize) - this.volumeSize.z / 2;

            // Add vertex
            const vertexIndex = vertexCount++;
            vertices.push(worldX, worldY, worldZ);

            // Add color
            const color = this.colorVolume.get(voxelKey);
            if (color) {
                colors.push(color.r / 255, color.g / 255, color.b / 255);
            } else {
                colors.push(0.7, 0.7, 0.7);
            }

            vertexMap.set(voxelKey, vertexIndex);

            // Create faces with neighboring voxels
            const neighbors = [
                [vx + 1, vy, vz],
                [vx, vy + 1, vz],
                [vx + 1, vy + 1, vz],
                [vx, vy, vz + 1],
                [vx + 1, vy, vz + 1],
                [vx, vy + 1, vz + 1]
            ];

            for (let i = 0; i < neighbors.length - 2; i++) {
                const n1Key = neighbors[i].join(',');
                const n2Key = neighbors[i + 1].join(',');
                const n3Key = neighbors[i + 2].join(',');

                if (vertexMap.has(n1Key) && vertexMap.has(n2Key) && vertexMap.has(n3Key)) {
                    indices.push(
                        vertexMap.get(voxelKey),
                        vertexMap.get(n1Key),
                        vertexMap.get(n2Key)
                    );
                    faceCount++;
                }
            }
        });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Mesh extracted in ${elapsed}ms`);
        console.log(`📊 Mesh has ${vertexCount} vertices and ${faceCount} faces`);

        if (vertices.length === 0) {
            console.warn('⚠️ No vertices extracted from TSDF');
            return null;
        }

        // Create Three.js geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        if (indices.length > 0) {
            geometry.setIndex(indices);
        }

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        this.meshGenerated = true;
        return geometry;
    }

    /**
     * Quick mesh generation from accumulated depth frames
     * Uses the DepthToMeshConverter for fast results
     * This is MUCH faster than TSDF but still produces solid mesh
     */
    generateQuickMesh(accumulatedFrames) {
        console.log('🚀 Generating quick mesh from', accumulatedFrames.length, 'frames...');

        if (accumulatedFrames.length === 0) {
            console.warn('⚠️ No frames to generate mesh from');
            return null;
        }

        // Merge all frame points
        const allPoints = [];
        for (const frame of accumulatedFrames) {
            if (frame.points && Array.isArray(frame.points)) {
                allPoints.push(...frame.points);
            }
        }

        console.log('📊 Total points:', allPoints.length.toLocaleString());

        // Use DepthToMeshConverter for quick mesh generation
        const geometry = this.depthToMeshConverter.depthToMesh(
            allPoints,
            320, // width
            240  // height
        );

        if (geometry) {
            console.log('✅ Quick mesh generated successfully');
            this.meshGenerated = true;
            return geometry;
        }

        console.warn('⚠️ Quick mesh generation failed');
        return null;
    }

    /**
     * Reset fusion state
     */
    reset() {
        console.log('🔄 Resetting KinectFusion...');
        this.tsdfVolume = null;
        this.weightVolume = null;
        this.colorVolume = null;
        this.frameCount = 0;
        this.meshGenerated = false;
        console.log('✅ KinectFusion reset complete');
    }

    /**
     * Get fusion statistics
     */
    getStats() {
        return {
            frameCount: this.frameCount,
            voxelCount: this.tsdfVolume ? this.tsdfVolume.size : 0,
            meshGenerated: this.meshGenerated,
            volumeSize: this.volumeSize,
            voxelResolution: this.voxelResolution
        };
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KinectFusion;
}
