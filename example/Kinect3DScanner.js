/**
 * Kinect 3D Scanner Library
 * Converts Kinect depth data to 3D point cloud and mesh, then exports to STL
 */

class Kinect3DScanner {
    constructor() {
        this.pointCloud = [];
        this.mesh = null;
        this.isScanning = false;
        this.scanFrames = [];
        this.maxFrames = 1; // Single frame for now
        
        // Kinect V1 parameters
        this.focalLength = 525.0; // Approximate focal length in pixels
        this.depthWidth = 640;
        this.depthHeight = 480;
        this.centerX = this.depthWidth / 2;
        this.centerY = this.depthHeight / 2;
        
        // Depth filtering
        this.minDepth = 850; // mm
        this.maxDepth = 4095; // mm
        this.depthScale = 0.001; // Convert mm to meters
    }

    /**
     * Convert raw depth data to 3D point cloud
     * @param {Object} depthData - Raw depth data from server
     * @returns {Array} Array of 3D points {x, y, z}
     */
    depthToPointCloud(depthData) {
        const points = [];
        const { width, height, depth } = depthData;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const depthValue = depth[index];
                
                // Filter invalid depth values
                if (depthValue < this.minDepth || depthValue > this.maxDepth || depthValue === 0) {
                    continue;
                }
                
                // Convert depth from mm to meters
                const z = depthValue * this.depthScale;
                
                // Convert pixel coordinates to 3D coordinates
                // Using pinhole camera model
                const x3d = (x - this.centerX) * z / this.focalLength;
                const y3d = (y - this.centerY) * z / this.focalLength;
                
                points.push({
                    x: x3d,
                    y: -y3d, // Flip Y axis (Kinect Y is inverted)
                    z: -z    // Flip Z axis (Kinect Z points toward camera)
                });
            }
        }
        
        return points;
    }

    /**
     * Create mesh from point cloud using simple triangulation
     * @param {Array} pointCloud - Array of 3D points
     * @returns {Object} Mesh object with vertices and faces
     */
    pointCloudToMesh(pointCloud) {
        if (pointCloud.length < 3) {
            return null;
        }
        
        const vertices = pointCloud.map(p => [p.x, p.y, p.z]);
        const faces = [];
        
        // Simple grid-based triangulation
        // This assumes points are organized in a grid (which they are from depth image)
        const width = this.depthWidth;
        const height = this.depthHeight;
        
        // Create triangles from adjacent points
        for (let y = 0; y < height - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const i1 = y * width + x;
                const i2 = y * width + (x + 1);
                const i3 = (y + 1) * width + x;
                const i4 = (y + 1) * width + (x + 1);
                
                // Only create triangles if all points are valid
                if (i1 < pointCloud.length && i2 < pointCloud.length && 
                    i3 < pointCloud.length && i4 < pointCloud.length) {
                    
                    const p1 = pointCloud[i1];
                    const p2 = pointCloud[i2];
                    const p3 = pointCloud[i3];
                    const p4 = pointCloud[i4];
                    
                    // Check if points are valid (not filtered out)
                    if (p1 && p2 && p3 && p4) {
                        // First triangle
                        faces.push([i1, i2, i3]);
                        // Second triangle
                        faces.push([i2, i4, i3]);
                    }
                }
            }
        }
        
        return {
            vertices: vertices,
            faces: faces
        };
    }

    /**
     * Filter point cloud to remove noise and outliers
     * @param {Array} pointCloud - Array of 3D points
     * @returns {Array} Filtered point cloud
     */
    filterPointCloud(pointCloud) {
        // Simple filtering: remove points that are too far from neighbors
        const filtered = [];
        const maxDistance = 0.1; // 10cm threshold
        
        for (let i = 0; i < pointCloud.length; i++) {
            const point = pointCloud[i];
            let neighborCount = 0;
            
            // Check nearby points
            for (let j = 0; j < pointCloud.length; j++) {
                if (i === j) continue;
                
                const distance = Math.sqrt(
                    Math.pow(point.x - pointCloud[j].x, 2) +
                    Math.pow(point.y - pointCloud[j].y, 2) +
                    Math.pow(point.z - pointCloud[j].z, 2)
                );
                
                if (distance < maxDistance) {
                    neighborCount++;
                }
            }
            
            // Keep point if it has at least 3 neighbors
            if (neighborCount >= 3) {
                filtered.push(point);
            }
        }
        
        return filtered;
    }

    /**
     * Process depth data and create 3D model
     * @param {Object} depthData - Raw depth data from server
     * @returns {Object} Mesh object
     */
    processDepthData(depthData) {
        console.log('Processing depth data...', depthData);
        
        // Convert to point cloud
        this.pointCloud = this.depthToPointCloud(depthData);
        console.log(`Generated ${this.pointCloud.length} points`);
        
        // Filter point cloud (optional, can be slow for large point clouds)
        // this.pointCloud = this.filterPointCloud(this.pointCloud);
        
        // Create mesh
        this.mesh = this.pointCloudToMesh(this.pointCloud);
        console.log(`Generated ${this.mesh.faces.length} faces`);
        
        return this.mesh;
    }

    /**
     * Export mesh to STL format (ASCII)
     * @param {Object} mesh - Mesh object with vertices and faces
     * @param {String} filename - Output filename
     */
    exportToSTL(mesh, filename = 'scan.stl') {
        if (!mesh || !mesh.vertices || !mesh.faces) {
            throw new Error('Invalid mesh data');
        }
        
        let stlContent = `solid ${filename.replace('.stl', '')}\n`;
        
        // Process each face
        for (let i = 0; i < mesh.faces.length; i++) {
            const face = mesh.faces[i];
            const v1 = mesh.vertices[face[0]];
            const v2 = mesh.vertices[face[1]];
            const v3 = mesh.vertices[face[2]];
            
            // Calculate normal (cross product)
            const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
            const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
            
            const normal = [
                edge1[1] * edge2[2] - edge1[2] * edge2[1],
                edge1[2] * edge2[0] - edge1[0] * edge2[2],
                edge1[0] * edge2[1] - edge1[1] * edge2[0]
            ];
            
            // Normalize normal
            const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
            if (length > 0) {
                normal[0] /= length;
                normal[1] /= length;
                normal[2] /= length;
            }
            
            // Write facet
            stlContent += `  facet normal ${normal[0].toFixed(6)} ${normal[1].toFixed(6)} ${normal[2].toFixed(6)}\n`;
            stlContent += `    outer loop\n`;
            stlContent += `      vertex ${v1[0].toFixed(6)} ${v1[1].toFixed(6)} ${v1[2].toFixed(6)}\n`;
            stlContent += `      vertex ${v2[0].toFixed(6)} ${v2[1].toFixed(6)} ${v2[2].toFixed(6)}\n`;
            stlContent += `      vertex ${v3[0].toFixed(6)} ${v3[1].toFixed(6)} ${v3[2].toFixed(6)}\n`;
            stlContent += `    endloop\n`;
            stlContent += `  endfacet\n`;
        }
        
        stlContent += `endsolid ${filename.replace('.stl', '')}\n`;
        
        // Create download
        const blob = new Blob([stlContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`Exported STL file: ${filename}`);
        return stlContent;
    }

    /**
     * Clear current scan data
     */
    clear() {
        this.pointCloud = [];
        this.mesh = null;
        this.scanFrames = [];
        this.isScanning = false;
    }
}


