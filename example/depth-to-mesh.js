/**
 * Depth-to-Mesh Converter
 * Mengkonversi depth frame langsung ke mesh utuh (seperti Skanect)
 * Bukan point cloud terpisah, tapi surface yang utuh
 */

class DepthToMeshConverter {
    constructor() {
        // Kinect V1 camera parameters
        this.focalLength = 525.0; // Focal length in pixels (Kinect V1)
        this.centerX = 320.0; // Principal point X
        this.centerY = 240.0; // Principal point Y
        this.depthScale = 0.001; // Convert mm to meters
        
        // Depth filtering
        this.minDepth = 850; // 0.85m in mm
        this.maxDepth = 2500; // 2.5m in mm
    }
    
    /**
     * Convert depth frame to mesh directly (no point cloud intermediate)
     * @param {Array} points - Array of {x, y, z, r, g, b} points from depth frame
     * @param {Number} width - Depth frame width
     * @param {Number} height - Depth frame height
     * @returns {THREE.BufferGeometry} Mesh geometry ready for Three.js
     */
    depthToMesh(points, width, height) {
        if (!points || points.length === 0) {
            console.warn('⚠️ No points provided for mesh generation');
            return null;
        }
        
        console.log('🔷 Converting depth frame to mesh directly...', {
            pointCount: points.length,
            width: width,
            height: height
        });
        
        // Step 1: Create depth map from points
        const depthMap = this.createDepthMap(points, width, height);
        
        // Step 2: Generate mesh from depth map using triangulation
        const geometry = this.generateMeshFromDepthMap(depthMap, width, height);
        
        if (geometry) {
            console.log('✅ Mesh generated successfully:', {
                vertices: geometry.attributes.position.count,
                faces: geometry.index ? geometry.index.count / 3 : 0
            });
        }
        
        return geometry;
    }
    
    /**
     * Create depth map (2D grid) from point cloud
     * This allows us to use grid-based triangulation
     */
    createDepthMap(points, width, height) {
        // Create 2D grid to store depth and color data
        const depthMap = [];
        const mapWidth = width || 320; // Default Kinect depth resolution
        const mapHeight = height || 240;
        
        // Initialize grid
        for (let y = 0; y < mapHeight; y++) {
            depthMap[y] = [];
            for (let x = 0; x < mapWidth; x++) {
                depthMap[y][x] = null; // null = no valid depth
            }
        }
        
        // Fill grid with point data
        // We need to map 3D points back to 2D depth map coordinates
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            // Filter by depth range (body parts only)
            // Filter by Z-depth range (NOT euclidean distance!)
            const z = Math.abs(p.z);
            if (z <= 0 || z < 0.3 || z > 8.0) continue; // Wide range, user controls via sliders
            // Filter by Z-depth range (NOT euclidean distance!)
            const z = Math.abs(p.z);
            if (z <= 0 || z < 0.3 || z > 8.0) continue; // Wide range, user controls via sliders
            
            // Convert 3D point back to 2D pixel coordinates
            // Using inverse pinhole camera model
            const z = Math.abs(p.z);
            if (z <= 0) continue;
            
            // Project 3D point to 2D
            const x2d = Math.round((p.x * this.focalLength / z) + this.centerX);
            const y2d = Math.round((-p.y * this.focalLength / z) + this.centerY);
            
            // Check bounds
            if (x2d >= 0 && x2d < mapWidth && y2d >= 0 && y2d < mapHeight) {
                if (!depthMap[y2d][x2d] || depthMap[y2d][x2d].z > z) {
                    // Store point data (keep closest point if multiple map to same pixel)
                    depthMap[y2d][x2d] = {
                        x: p.x,
                        y: p.y,
                        z: z,
                        r: p.r || 128,
                        g: p.g || 128,
                        b: p.b || 128
                    };
                }
            }
        }
        
        return depthMap;
    }
    
    /**
     * Generate mesh from depth map using grid-based triangulation
     * This creates a continuous surface, not separate points
     */
    generateMeshFromDepthMap(depthMap, width, height) {
        const vertices = [];
        const colors = [];
        const indices = [];
        const vertexMap = new Map(); // Map (x,y) -> vertex index
        
        const mapWidth = width || depthMap[0]?.length || 320;
        const mapHeight = height || depthMap.length || 240;
        
        // Step 1: Create vertices from valid depth pixels
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const point = depthMap[y] && depthMap[y][x];
                if (!point) continue;
                
                // Add vertex
                const vertexIndex = vertices.length / 3;
                vertices.push(point.x, point.y, point.z);
                colors.push(point.r / 255, point.g / 255, point.b / 255);
                
                // Store mapping for triangulation
                vertexMap.set(`${x},${y}`, vertexIndex);
            }
        }
        
        if (vertices.length === 0) {
            console.warn('⚠️ No valid vertices for mesh generation');
            return null;
        }
        
        // Step 2: Create triangles using grid-based triangulation
        // Connect neighboring pixels to form triangles
        for (let y = 0; y < mapHeight - 1; y++) {
            for (let x = 0; x < mapWidth - 1; x++) {
                const p00 = depthMap[y] && depthMap[y][x];
                const p01 = depthMap[y] && depthMap[y][x + 1];
                const p10 = depthMap[y + 1] && depthMap[y + 1][x];
                const p11 = depthMap[y + 1] && depthMap[y + 1][x + 1];
                
                // Create two triangles per quad (if all 4 points are valid)
                // Triangle 1: (0,0) - (1,0) - (0,1)
                // Triangle 2: (1,0) - (1,1) - (0,1)
                
                if (p00 && p01 && p10) {
                    // First triangle
                    const v0 = vertexMap.get(`${x},${y}`);
                    const v1 = vertexMap.get(`${x + 1},${y}`);
                    const v2 = vertexMap.get(`${x},${y + 1}`);
                    
                    if (v0 !== undefined && v1 !== undefined && v2 !== undefined) {
                        // Check triangle validity (not degenerate)
                        const valid = this.isValidTriangle(
                            vertices[v0 * 3], vertices[v0 * 3 + 1], vertices[v0 * 3 + 2],
                            vertices[v1 * 3], vertices[v1 * 3 + 1], vertices[v1 * 3 + 2],
                            vertices[v2 * 3], vertices[v2 * 3 + 1], vertices[v2 * 3 + 2]
                        );
                        
                        if (valid) {
                            indices.push(v0, v1, v2);
                        }
                    }
                }
                
                if (p01 && p11 && p10) {
                    // Second triangle
                    const v1 = vertexMap.get(`${x + 1},${y}`);
                    const v3 = vertexMap.get(`${x + 1},${y + 1}`);
                    const v2 = vertexMap.get(`${x},${y + 1}`);
                    
                    if (v1 !== undefined && v3 !== undefined && v2 !== undefined) {
                        // Check triangle validity
                        const valid = this.isValidTriangle(
                            vertices[v1 * 3], vertices[v1 * 3 + 1], vertices[v1 * 3 + 2],
                            vertices[v3 * 3], vertices[v3 * 3 + 1], vertices[v3 * 3 + 2],
                            vertices[v2 * 3], vertices[v2 * 3 + 1], vertices[v2 * 3 + 2]
                        );
                        
                        if (valid) {
                            indices.push(v1, v3, v2);
                        }
                    }
                }
            }
        }
        
        if (indices.length === 0) {
            console.warn('⚠️ No valid triangles generated');
            return null;
        }
        
        // Step 3: Create Three.js geometry
        const geometry = new THREE.BufferGeometry();
        
        // Set vertices
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // Set indices
        geometry.setIndex(indices);
        
        // Compute normals for proper lighting
        geometry.computeVertexNormals();
        
        // Compute bounding box
        geometry.computeBoundingBox();
        
        return geometry;
    }
    
    /**
     * Check if triangle is valid (not degenerate)
     */
    isValidTriangle(x1, y1, z1, x2, y2, z2, x3, y3, z3) {
        // Calculate edge vectors
        const v1x = x2 - x1;
        const v1y = y2 - y1;
        const v1z = z2 - z1;
        
        const v2x = x3 - x1;
        const v2y = y3 - y1;
        const v2z = z3 - z1;
        
        // Calculate cross product (normal)
        const nx = v1y * v2z - v1z * v2y;
        const ny = v1z * v2x - v1x * v2z;
        const nz = v1x * v2y - v1y * v2x;
        
        // Calculate area (magnitude of normal)
        const area = Math.sqrt(nx * nx + ny * ny + nz * nz);
        
        // Triangle is valid if area > threshold
        return area > 0.0001;
    }
    
    /**
     * Merge multiple depth frames into single mesh
     * This accumulates frames during scanning to create complete model
     */
    mergeDepthFrames(frames) {
        if (!frames || frames.length === 0) return null;
        
        console.log('🔷 Merging', frames.length, 'depth frames into single mesh...');
        
        // Combine all points from all frames
        const allPoints = [];
        let maxWidth = 0;
        let maxHeight = 0;
        
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (frame.points && Array.isArray(frame.points)) {
                allPoints.push(...frame.points);
                if (frame.width) maxWidth = Math.max(maxWidth, frame.width);
                if (frame.height) maxHeight = Math.max(maxHeight, frame.height);
            }
        }
        
        if (allPoints.length === 0) return null;
        
        // Create mesh from combined points
        return this.depthToMesh(allPoints, maxWidth, maxHeight);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DepthToMeshConverter;
}







