/**
 * Point Cloud Processing Library
 * Handles ICP, noise filtering, and mesh reconstruction
 */

class PointCloudProcessor {
    constructor() {
        this.pointCloudFrames = []; // Store individual frames for ICP
        this.alignedPointCloud = []; // Final aligned point cloud
    }

    /**
     * Simple ICP (Iterative Closest Point) algorithm
     * Aligns new frame to existing point cloud
     */
    icpAlign(sourcePoints, targetPoints, maxIterations = 20, tolerance = 0.001) {
        if (sourcePoints.length === 0 || targetPoints.length === 0) {
            return { transform: null, alignedPoints: sourcePoints };
        }

        // Subsample for faster computation
        const sampleSize = Math.min(1000, Math.min(sourcePoints.length, targetPoints.length));
        const sourceSample = this.subsample(sourcePoints, sampleSize);
        const targetSample = this.subsample(targetPoints, sampleSize);

        let bestTransform = null;
        let bestError = Infinity;
        let alignedPoints = sourcePoints;

        // Try multiple initial alignments
        for (let init = 0; init < 3; init++) {
            let currentPoints = [...sourceSample];
            let transform = { rotation: { x: 0, y: 0, z: 0 }, translation: { x: 0, y: 0, z: 0 } };

            for (let iter = 0; iter < maxIterations; iter++) {
                // Find correspondences
                const correspondences = this.findCorrespondences(currentPoints, targetSample);
                
                if (correspondences.length < 3) break;

                // Compute transform
                const newTransform = this.computeTransform(correspondences);
                if (!newTransform) break;

                // Apply transform
                currentPoints = this.applyTransform(currentPoints, newTransform);
                
                // Update cumulative transform
                transform = this.composeTransforms(transform, newTransform);

                // Check convergence
                const error = this.computeError(correspondences);
                if (error < tolerance) break;
            }

            const finalError = this.computeAlignmentError(currentPoints, targetSample);
            if (finalError < bestError) {
                bestError = finalError;
                bestTransform = transform;
            }
        }

        // Apply best transform to all source points
        if (bestTransform) {
            alignedPoints = this.applyTransform(sourcePoints, bestTransform);
        }

        return { transform: bestTransform, alignedPoints: alignedPoints };
    }

    /**
     * Find correspondences between two point sets using nearest neighbor
     */
    findCorrespondences(sourcePoints, targetPoints) {
        const correspondences = [];
        const maxDistance = 0.1; // 10cm threshold

        for (const sourcePoint of sourcePoints) {
            let nearest = null;
            let minDist = Infinity;

            for (const targetPoint of targetPoints) {
                const dist = this.distance(sourcePoint, targetPoint);
                if (dist < minDist && dist < maxDistance) {
                    minDist = dist;
                    nearest = targetPoint;
                }
            }

            if (nearest) {
                correspondences.push({ source: sourcePoint, target: nearest });
            }
        }

        return correspondences;
    }

    /**
     * Compute transformation (rotation + translation) from correspondences
     * Using SVD-based method
     */
    computeTransform(correspondences) {
        if (correspondences.length < 3) return null;

        // Compute centroids
        let sourceCentroid = { x: 0, y: 0, z: 0 };
        let targetCentroid = { x: 0, y: 0, z: 0 };

        for (const corr of correspondences) {
            sourceCentroid.x += corr.source.x;
            sourceCentroid.y += corr.source.y;
            sourceCentroid.z += corr.source.z;
            targetCentroid.x += corr.target.x;
            targetCentroid.y += corr.target.y;
            targetCentroid.z += corr.target.z;
        }

        const n = correspondences.length;
        sourceCentroid.x /= n;
        sourceCentroid.y /= n;
        sourceCentroid.z /= n;
        targetCentroid.x /= n;
        targetCentroid.y /= n;
        targetCentroid.z /= n;

        // Center points
        const centeredSource = correspondences.map(c => ({
            x: c.source.x - sourceCentroid.x,
            y: c.source.y - sourceCentroid.y,
            z: c.source.z - sourceCentroid.z
        }));

        const centeredTarget = correspondences.map(c => ({
            x: c.target.x - targetCentroid.x,
            y: c.target.y - targetCentroid.y,
            z: c.target.z - targetCentroid.z
        }));

        // Compute covariance matrix H
        let H = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];

        for (let i = 0; i < n; i++) {
            H[0][0] += centeredSource[i].x * centeredTarget[i].x;
            H[0][1] += centeredSource[i].x * centeredTarget[i].y;
            H[0][2] += centeredSource[i].x * centeredTarget[i].z;
            H[1][0] += centeredSource[i].y * centeredTarget[i].x;
            H[1][1] += centeredSource[i].y * centeredTarget[i].y;
            H[1][2] += centeredSource[i].y * centeredTarget[i].z;
            H[2][0] += centeredSource[i].z * centeredTarget[i].x;
            H[2][1] += centeredSource[i].z * centeredTarget[i].y;
            H[2][2] += centeredSource[i].z * centeredTarget[i].z;
        }

        // Simple rotation estimation (using cross product for axis-angle)
        // For simplicity, we'll use a basic approach
        const translation = {
            x: targetCentroid.x - sourceCentroid.x,
            y: targetCentroid.y - sourceCentroid.y,
            z: targetCentroid.z - sourceCentroid.z
        };

        // Compute rotation using cross product of principal directions
        const sourceDir = this.principalDirection(centeredSource);
        const targetDir = this.principalDirection(centeredTarget);
        
        const rotation = this.rotationFromDirections(sourceDir, targetDir);

        return { rotation, translation };
    }

    /**
     * Compute principal direction using PCA
     */
    principalDirection(points) {
        if (points.length === 0) return { x: 1, y: 0, z: 0 };

        // Compute covariance matrix
        let cov = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];

        for (const p of points) {
            cov[0][0] += p.x * p.x;
            cov[0][1] += p.x * p.y;
            cov[0][2] += p.x * p.z;
            cov[1][1] += p.y * p.y;
            cov[1][2] += p.y * p.z;
            cov[2][2] += p.z * p.z;
        }

        const n = points.length;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                cov[i][j] /= n;
            }
        }

        cov[1][0] = cov[0][1];
        cov[2][0] = cov[0][2];
        cov[2][1] = cov[1][2];

        // Find eigenvector (simplified - use first principal component)
        // For simplicity, use cross product of two random points
        if (points.length >= 2) {
            const v1 = { x: points[0].x, y: points[0].y, z: points[0].z };
            const v2 = { x: points[1].x, y: points[1].y, z: points[1].z };
            return this.normalize(this.crossProduct(v1, v2));
        }

        return { x: 1, y: 0, z: 0 };
    }

    /**
     * Compute rotation from two directions
     */
    rotationFromDirections(sourceDir, targetDir) {
        const axis = this.normalize(this.crossProduct(sourceDir, targetDir));
        const dot = this.dotProduct(sourceDir, targetDir);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

        // Convert to axis-angle representation
        return {
            x: axis.x * angle,
            y: axis.y * angle,
            z: axis.z * angle
        };
    }

    /**
     * Apply transformation to points
     */
    applyTransform(points, transform) {
        return points.map(point => {
            // Apply rotation (simplified - using axis-angle)
            let rotated = { ...point };
            if (transform.rotation) {
                const angle = Math.sqrt(
                    transform.rotation.x ** 2 +
                    transform.rotation.y ** 2 +
                    transform.rotation.z ** 2
                );
                if (angle > 0.001) {
                    const axis = {
                        x: transform.rotation.x / angle,
                        y: transform.rotation.y / angle,
                        z: transform.rotation.z / angle
                    };
                    rotated = this.rotatePoint(point, axis, angle);
                }
            }

            // Apply translation
            return {
                x: rotated.x + (transform.translation?.x || 0),
                y: rotated.y + (transform.translation?.y || 0),
                z: rotated.z + (transform.translation?.z || 0),
                r: point.r,
                g: point.g,
                b: point.b
            };
        });
    }

    /**
     * Rotate point around axis
     */
    rotatePoint(point, axis, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const oneMinusCos = 1 - cos;

        const x = point.x;
        const y = point.y;
        const z = point.z;

        const ux = axis.x;
        const uy = axis.y;
        const uz = axis.z;

        return {
            x: (cos + ux * ux * oneMinusCos) * x +
               (ux * uy * oneMinusCos - uz * sin) * y +
               (ux * uz * oneMinusCos + uy * sin) * z,
            y: (uy * ux * oneMinusCos + uz * sin) * x +
               (cos + uy * uy * oneMinusCos) * y +
               (uy * uz * oneMinusCos - ux * sin) * z,
            z: (uz * ux * oneMinusCos - uy * sin) * x +
               (uz * uy * oneMinusCos + ux * sin) * y +
               (cos + uz * uz * oneMinusCos) * z
        };
    }

    /**
     * Compose two transformations
     */
    composeTransforms(t1, t2) {
        // Simplified composition
        return {
            rotation: {
                x: (t1.rotation?.x || 0) + (t2.rotation?.x || 0),
                y: (t1.rotation?.y || 0) + (t2.rotation?.y || 0),
                z: (t1.rotation?.z || 0) + (t2.rotation?.z || 0)
            },
            translation: {
                x: (t1.translation?.x || 0) + (t2.translation?.x || 0),
                y: (t1.translation?.y || 0) + (t2.translation?.y || 0),
                z: (t1.translation?.z || 0) + (t2.translation?.z || 0)
            }
        };
    }

    /**
     * Statistical Outlier Removal
     * Removes points that are too far from their neighbors
     */
    statisticalOutlierRemoval(points, meanK = 20, stdDevMulThresh = 2.0) {
        if (points.length === 0) return points;

        const filteredPoints = [];
        const distances = [];

        // Compute mean distance for each point
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const neighbors = this.findNeighbors(point, points, meanK);
            
            if (neighbors.length === 0) continue;

            let meanDist = 0;
            for (const neighbor of neighbors) {
                meanDist += this.distance(point, neighbor);
            }
            meanDist /= neighbors.length;
            distances.push(meanDist);
        }

        if (distances.length === 0) return points;

        // Compute global mean and std dev
        const globalMean = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - globalMean, 2), 0) / distances.length;
        const stdDev = Math.sqrt(variance);
        const threshold = globalMean + stdDevMulThresh * stdDev;

        // Filter points
        for (let i = 0; i < points.length; i++) {
            if (distances[i] <= threshold) {
                filteredPoints.push(points[i]);
            }
        }

        return filteredPoints;
    }

    /**
     * Radius-based Outlier Removal
     * Removes points with too few neighbors in radius
     */
    radiusOutlierRemoval(points, radius = 0.05, minNeighbors = 5) {
        const filteredPoints = [];

        for (const point of points) {
            const neighbors = this.findNeighborsInRadius(point, points, radius);
            if (neighbors.length >= minNeighbors) {
                filteredPoints.push(point);
            }
        }

        return filteredPoints;
    }

    /**
     * Find K nearest neighbors
     */
    findNeighbors(point, points, k) {
        const distances = points.map(p => ({
            point: p,
            dist: this.distance(point, p)
        }));

        distances.sort((a, b) => a.dist - b.dist);
        return distances.slice(1, k + 1).map(d => d.point); // Exclude self
    }

    /**
     * Find neighbors within radius
     */
    findNeighborsInRadius(point, points, radius) {
        return points.filter(p => {
            const dist = this.distance(point, p);
            return dist > 0 && dist <= radius; // Exclude self
        });
    }

    /**
     * Subsample point cloud
     */
    subsample(points, targetSize) {
        if (points.length <= targetSize) return points;
        
        const step = Math.floor(points.length / targetSize);
        const sampled = [];
        
        for (let i = 0; i < points.length; i += step) {
            sampled.push(points[i]);
            if (sampled.length >= targetSize) break;
        }
        
        return sampled;
    }

    /**
     * Compute distance between two points
     */
    distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Compute error for correspondences
     */
    computeError(correspondences) {
        if (correspondences.length === 0) return Infinity;
        
        let totalError = 0;
        for (const corr of correspondences) {
            totalError += this.distance(corr.source, corr.target);
        }
        return totalError / correspondences.length;
    }

    /**
     * Compute alignment error
     */
    computeAlignmentError(sourcePoints, targetPoints) {
        if (sourcePoints.length === 0) return Infinity;

        let totalError = 0;
        for (const sourcePoint of sourcePoints) {
            let minDist = Infinity;
            for (const targetPoint of targetPoints) {
                const dist = this.distance(sourcePoint, targetPoint);
                if (dist < minDist) minDist = dist;
            }
            totalError += minDist;
        }
        return totalError / sourcePoints.length;
    }

    /**
     * Cross product
     */
    crossProduct(v1, v2) {
        return {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
    }

    /**
     * Dot product
     */
    dotProduct(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    /**
     * Normalize vector
     */
    normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (len < 0.0001) return { x: 1, y: 0, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    /**
     * Improved mesh reconstruction using better triangulation
     * Creates solid, connected mesh from point cloud with hole filling and consolidation
     */
    createImprovedMesh(points, resolution = 0.05) {
        if (points.length < 3) return { vertices: [], faces: [] };

        console.log('🔧 Creating improved mesh with', points.length, 'points, resolution:', resolution);

        // Step 1: Build spatial hash for faster neighbor lookup
        const grid = new Map();
        const gridSize = resolution;

        points.forEach((point, index) => {
            const gx = Math.floor(point.x / gridSize);
            const gy = Math.floor(point.y / gridSize);
            const gz = Math.floor(point.z / gridSize);
            const key = `${gx},${gy},${gz}`;

            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key).push(index);
        });

        const faces = [];
        const faceSet = new Set(); // Use Set for faster duplicate checking
        const maxDist = resolution * 2.5; // Further increased for better connectivity
        const edgeMap = new Map(); // Track edges for connectivity

        // Step 2: Create initial mesh with better connectivity using improved algorithm
        // Use ball pivoting approach: for each edge, find best third point
        const processedEdges = new Set();
        
        // First pass: create initial triangles from nearest neighbors
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const gx = Math.floor(point.x / gridSize);
            const gy = Math.floor(point.y / gridSize);
            const gz = Math.floor(point.z / gridSize);

            const neighbors = [];
            
            // Check neighboring grid cells (extended range for better connectivity)
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dz = -2; dz <= 2; dz++) {
                        const key = `${gx + dx},${gy + dy},${gz + dz}`;
                        const cellPoints = grid.get(key) || [];
                        
                        for (const idx of cellPoints) {
                            if (idx === i) continue;
                            const dist = this.distance(point, points[idx]);
                            if (dist <= maxDist) {
                                neighbors.push({ idx, dist });
                            }
                        }
                    }
                }
            }

            // Sort neighbors by distance
            neighbors.sort((a, b) => a.dist - b.dist);

            // Create triangles with nearest neighbors (increased count for better coverage)
            const maxNeighbors = Math.min(neighbors.length, 20); // Further increased
            for (let j = 0; j < maxNeighbors; j++) {
                for (let k = j + 1; k < maxNeighbors; k++) {
                    const jIdx = neighbors[j].idx;
                    const kIdx = neighbors[k].idx;

                    // Check if triangle is valid (not too flat)
                    const v1 = { 
                        x: points[jIdx].x - point.x, 
                        y: points[jIdx].y - point.y, 
                        z: points[jIdx].z - point.z 
                    };
                    const v2 = { 
                        x: points[kIdx].x - point.x, 
                        y: points[kIdx].y - point.y, 
                        z: points[kIdx].z - point.z 
                    };
                    const normal = this.crossProduct(v1, v2);
                    const area = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);

                    // More lenient area check for better coverage
                    if (area > 0.00001) {
                        // Create sorted triangle key for duplicate checking
                        const triIndices = [i, jIdx, kIdx].sort((a, b) => a - b);
                        const faceKey = triIndices.join(',');
                        
                        if (!faceSet.has(faceKey)) {
                            faceSet.add(faceKey);
                            faces.push({ key: faceKey, indices: triIndices });
                            
                            // Track edges for connectivity
                            const edges = [
                                [triIndices[0], triIndices[1]],
                                [triIndices[1], triIndices[2]],
                                [triIndices[2], triIndices[0]]
                            ];
                            
                            edges.forEach(edge => {
                                const edgeKey = edge.sort((a, b) => a - b).join(',');
                                if (!edgeMap.has(edgeKey)) {
                                    edgeMap.set(edgeKey, 0);
                                }
                                edgeMap.set(edgeKey, edgeMap.get(edgeKey) + 1);
                                processedEdges.add(edgeKey);
                            });
                        }
                    }
                }
            }
        }

        // Second pass: fill gaps by processing boundary edges
        const boundaryEdges = [];
        edgeMap.forEach((count, edgeKey) => {
            if (count === 1) {
                const [i1, i2] = edgeKey.split(',').map(Number);
                boundaryEdges.push([i1, i2]);
            }
        });

        // Process boundary edges to create additional triangles
        for (const [i1, i2] of boundaryEdges.slice(0, Math.min(boundaryEdges.length, 5000))) { // Limit for performance
            const p1 = points[i1];
            const p2 = points[i2];
            const gx1 = Math.floor(p1.x / gridSize);
            const gy1 = Math.floor(p1.y / gridSize);
            const gz1 = Math.floor(p1.z / gridSize);
            
            let bestPoint = -1;
            let bestScore = Infinity;
            
            // Search for best third point
            for (let dx = -3; dx <= 3; dx++) {
                for (let dy = -3; dy <= 3; dy++) {
                    for (let dz = -3; dz <= 3; dz++) {
                        const key = `${gx1 + dx},${gy1 + dy},${gz1 + dz}`;
                        const cellPoints = grid.get(key) || [];
                        
                        for (const idx of cellPoints) {
                            if (idx === i1 || idx === i2) continue;
                            
                            const p3 = points[idx];
                            const dist1 = this.distance(p1, p3);
                            const dist2 = this.distance(p2, p3);
                            const dist12 = this.distance(p1, p2);
                            
                            if (dist1 <= maxDist && dist2 <= maxDist) {
                                // Calculate triangle quality
                                const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
                                const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
                                const normal = this.crossProduct(v1, v2);
                                const area = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
                                
                                if (area > 0.00001) {
                                    // Prefer triangles with similar edge lengths
                                    const avgDist = (dist1 + dist2 + dist12) / 3;
                                    const variance = (
                                        Math.pow(dist1 - avgDist, 2) +
                                        Math.pow(dist2 - avgDist, 2) +
                                        Math.pow(dist12 - avgDist, 2)
                                    ) / 3;
                                    
                                    const score = variance / (area + 0.0001); // Lower is better
                                    if (score < bestScore) {
                                        bestScore = score;
                                        bestPoint = idx;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Create triangle if good candidate found
            if (bestPoint !== -1) {
                const triIndices = [i1, i2, bestPoint].sort((a, b) => a - b);
                const faceKey = triIndices.join(',');
                
                if (!faceSet.has(faceKey)) {
                    faceSet.add(faceKey);
                    faces.push({ key: faceKey, indices: triIndices });
                    
                    // Update edge map
                    const edges = [
                        [triIndices[0], triIndices[1]],
                        [triIndices[1], triIndices[2]],
                        [triIndices[2], triIndices[0]]
                    ];
                    
                    edges.forEach(edge => {
                        const edgeKey = edge.sort((a, b) => a - b).join(',');
                        if (!edgeMap.has(edgeKey)) {
                            edgeMap.set(edgeKey, 0);
                        }
                        edgeMap.set(edgeKey, edgeMap.get(edgeKey) + 1);
                    });
                }
            }
        }

        console.log('✅ Created', faces.length, 'triangles from', points.length, 'points');

        // Step 3: Fill holes by connecting boundary edges
        let filledFaces = this.fillHoles(points, faces, edgeMap, grid, gridSize, maxDist);
        console.log('✅ After hole filling:', filledFaces.length, 'triangles');

        // Step 4: Rebuild edgeMap after hole filling for consolidation
        const updatedEdgeMap = new Map();
        filledFaces.forEach(face => {
            const indices = face.indices || face;
            const edges = [
                [indices[0], indices[1]],
                [indices[1], indices[2]],
                [indices[2], indices[0]]
            ];
            edges.forEach(edge => {
                const edgeKey = edge.sort((a, b) => a - b).join(',');
                if (!updatedEdgeMap.has(edgeKey)) {
                    updatedEdgeMap.set(edgeKey, 0);
                }
                updatedEdgeMap.set(edgeKey, updatedEdgeMap.get(edgeKey) + 1);
            });
        });

        // Step 5: Consolidate mesh - connect disconnected components
        filledFaces = this.consolidateMesh(points, filledFaces, grid, gridSize, maxDist, updatedEdgeMap);
        console.log('✅ After consolidation:', filledFaces.length, 'triangles');

        return {
            vertices: points.map(p => [p.x, p.y, p.z]),
            faces: filledFaces.map(f => f.indices || f)
        };
    }

    /**
     * Fill holes in mesh by connecting boundary edges
     */
    fillHoles(points, faces, edgeMap, grid, gridSize, maxDist) {
        // Find boundary edges (edges that appear only once)
        const boundaryEdges = [];
        edgeMap.forEach((count, edgeKey) => {
            if (count === 1) {
                const [i1, i2] = edgeKey.split(',').map(Number);
                boundaryEdges.push([i1, i2]);
            }
        });

        if (boundaryEdges.length === 0) {
            console.log('✅ No holes detected, mesh is watertight');
            return faces;
        }

        console.log('🔧 Filling', boundaryEdges.length, 'boundary edges (holes)');

        const newFaces = [...faces];
        const faceSet = new Set(faces.map(f => f.key || [f.indices[0], f.indices[1], f.indices[2]].sort((a, b) => a - b).join(',')));

        // For each boundary edge, try to find a third point to form a triangle
        for (const [i1, i2] of boundaryEdges) {
            const p1 = points[i1];
            const p2 = points[i2];
            
            // Find nearby points that could close the hole
            const gx1 = Math.floor(p1.x / gridSize);
            const gy1 = Math.floor(p1.y / gridSize);
            const gz1 = Math.floor(p1.z / gridSize);
            
            const gx2 = Math.floor(p2.x / gridSize);
            const gy2 = Math.floor(p2.y / gridSize);
            const gz2 = Math.floor(p2.z / gridSize);
            
            let bestPoint = -1;
            let bestScore = Infinity;
            
            // Search in extended cells between the two edge points
            const minGx = Math.min(gx1, gx2) - 2;
            const maxGx = Math.max(gx1, gx2) + 2;
            const minGy = Math.min(gy1, gy2) - 2;
            const maxGy = Math.max(gy1, gy2) + 2;
            const minGz = Math.min(gz1, gz2) - 2;
            const maxGz = Math.max(gz1, gz2) + 2;
            
            for (let gx = minGx; gx <= maxGx; gx++) {
                for (let gy = minGy; gy <= maxGy; gy++) {
                    for (let gz = minGz; gz <= maxGz; gz++) {
                        const key = `${gx},${gy},${gz}`;
                        const cellPoints = grid.get(key) || [];
                        
                        for (const idx of cellPoints) {
                            if (idx === i1 || idx === i2) continue;
                            
                            const p3 = points[idx];
                            const dist1 = this.distance(p1, p3);
                            const dist2 = this.distance(p2, p3);
                            const dist12 = this.distance(p1, p2);
                            
                            // More lenient check for better hole filling
                            if (dist1 <= maxDist * 1.5 && dist2 <= maxDist * 1.5 && dist1 + dist2 < dist12 * 3.0) {
                                // Calculate triangle quality (prefer equilateral triangles)
                                const avgDist = (dist1 + dist2 + dist12) / 3;
                                const variance = (
                                    Math.pow(dist1 - avgDist, 2) +
                                    Math.pow(dist2 - avgDist, 2) +
                                    Math.pow(dist12 - avgDist, 2)
                                ) / 3;
                                
                                if (variance < bestScore) {
                                    bestScore = variance;
                                    bestPoint = idx;
                                }
                            }
                        }
                    }
                }
            }
            
            // Create triangle to fill hole
            if (bestPoint !== -1) {
                const triIndices = [i1, i2, bestPoint].sort((a, b) => a - b);
                const faceKey = triIndices.join(',');
                
                if (!faceSet.has(faceKey)) {
                    faceSet.add(faceKey);
                    newFaces.push({ key: faceKey, indices: triIndices });
                }
            }
        }

        return newFaces;
    }

    /**
     * Consolidate mesh by connecting disconnected components
     * This helps merge fragmented parts into a single solid mesh
     */
    consolidateMesh(points, faces, grid, gridSize, maxDist, edgeMap = null) {
        console.log('🔧 Consolidating mesh to connect fragmented parts...');
        
        // Build connectivity graph from faces
        const vertexConnections = new Map();
        faces.forEach(face => {
            const indices = face.indices || face;
            if (!indices || indices.length !== 3) return;
            const [i1, i2, i3] = indices;
            
            // Add connections
            [i1, i2, i3].forEach((v, idx) => {
                if (!vertexConnections.has(v)) {
                    vertexConnections.set(v, new Set());
                }
                const others = [i1, i2, i3].filter((_, i) => i !== idx);
                others.forEach(other => {
                    vertexConnections.get(v).add(other);
                });
            });
        });

        // Find connected components using BFS (only check vertices that are in faces)
        const visited = new Set();
        const components = [];
        const verticesInFaces = new Set();
        
        faces.forEach(face => {
            const indices = face.indices || face;
            if (indices && indices.length === 3) {
                indices.forEach(v => verticesInFaces.add(v));
            }
        });
        
        for (const v of verticesInFaces) {
            if (visited.has(v)) continue;
            
            const component = [];
            const queue = [v];
            visited.add(v);
            
            while (queue.length > 0) {
                const currentV = queue.shift();
                component.push(currentV);
                
                const neighbors = vertexConnections.get(currentV) || new Set();
                neighbors.forEach(n => {
                    if (!visited.has(n)) {
                        visited.add(n);
                        queue.push(n);
                    }
                });
            }
            
            if (component.length > 0) {
                components.push(component);
            }
        }

        console.log('📊 Found', components.length, 'connected components');

        // If only one component, mesh is already consolidated
        if (components.length <= 1) {
            console.log('✅ Mesh is already consolidated');
            return faces;
        }

        // Sort components by size (largest first)
        components.sort((a, b) => b.length - a.length);
        const mainComponent = components[0];
        const otherComponents = components.slice(1);

        console.log('🔗 Connecting', otherComponents.length, 'fragmented components to main component...');
        console.log('📊 Main component size:', mainComponent.length, 'vertices');
        otherComponents.forEach((comp, idx) => {
            console.log('📊 Component', idx + 1, 'size:', comp.length, 'vertices');
        });

        const newFaces = [...faces];
        const faceSet = new Set(faces.map(f => {
            const indices = f.indices || f;
            return f.key || indices.sort((a, b) => a - b).join(',');
        }));

        // Connect each fragmented component to the main component
        let bridgesCreated = 0;
        otherComponents.forEach((component, compIdx) => {
            // Find closest points between this component and main component
            let minDist = Infinity;
            let closestMain = -1;
            let closestComp = -1;

            // Sample points for performance (check every 10th point)
            const sampleSize = Math.min(50, component.length);
            const step = Math.max(1, Math.floor(component.length / sampleSize));
            const sampledComponent = [];
            for (let i = 0; i < component.length; i += step) {
                sampledComponent.push(component[i]);
            }

            const sampleMainSize = Math.min(100, mainComponent.length);
            const stepMain = Math.max(1, Math.floor(mainComponent.length / sampleMainSize));
            const sampledMain = [];
            for (let i = 0; i < mainComponent.length; i += stepMain) {
                sampledMain.push(mainComponent[i]);
            }

            sampledComponent.forEach(compV => {
                sampledMain.forEach(mainV => {
                    const dist = this.distance(points[compV], points[mainV]);
                    if (dist < minDist && dist <= maxDist * 4) { // Extended range for consolidation
                        minDist = dist;
                        closestMain = mainV;
                        closestComp = compV;
                    }
                });
            });

            // If found close points, create bridge triangles
            if (closestMain !== -1 && closestComp !== -1 && minDist <= maxDist * 4) {
                const p1 = points[closestMain];
                const p2 = points[closestComp];
                
                // Find intermediate points to create smooth bridge
                const bridgePoints = [];
                const numBridgePoints = Math.min(3, Math.ceil(minDist / (maxDist * 0.5)));
                
                for (let b = 1; b <= numBridgePoints; b++) {
                    const t = b / (numBridgePoints + 1);
                    const bridgeX = p1.x + (p2.x - p1.x) * t;
                    const bridgeY = p1.y + (p2.y - p1.y) * t;
                    const bridgeZ = p1.z + (p2.z - p1.z) * t;
                    
                    // Find nearest actual point to this bridge position
                    const gx = Math.floor(bridgeX / gridSize);
                    const gy = Math.floor(bridgeY / gridSize);
                    const gz = Math.floor(bridgeZ / gridSize);
                    
                    let nearestPoint = -1;
                    let nearestDist = Infinity;
                    
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dz = -1; dz <= 1; dz++) {
                                const key = `${gx + dx},${gy + dy},${gz + dz}`;
                                const cellPoints = grid.get(key) || [];
                                
                                cellPoints.forEach(idx => {
                                    if (idx === closestMain || idx === closestComp) return;
                                    const p3 = points[idx];
                                    const dist = Math.hypot(
                                        p3.x - bridgeX,
                                        p3.y - bridgeY,
                                        p3.z - bridgeZ
                                    );
                                    if (dist < nearestDist && dist <= maxDist * 1.5) {
                                        nearestDist = dist;
                                        nearestPoint = idx;
                                    }
                                });
                            }
                        }
                    }
                    
                    if (nearestPoint !== -1) {
                        bridgePoints.push(nearestPoint);
                    }
                }
                
                // Create bridge triangles connecting the components
                const allBridgePoints = [closestMain, ...bridgePoints, closestComp];
                for (let i = 0; i < allBridgePoints.length - 2; i++) {
                    const tri = [
                        allBridgePoints[i],
                        allBridgePoints[i + 1],
                        allBridgePoints[i + 2]
                    ].sort((a, b) => a - b);
                    
                    const faceKey = tri.join(',');
                    if (!faceSet.has(faceKey)) {
                        faceSet.add(faceKey);
                        newFaces.push({ key: faceKey, indices: tri });
                        bridgesCreated++;
                    }
                }
            }
        });

        console.log('✅ Mesh consolidation complete. Created', bridgesCreated, 'bridge triangles');
        return newFaces;
    }

    /**
     * Track coordinate system transformation
     * For now, assumes Kinect is stationary
     * Can be extended to track Kinect movement
     */
    transformToWorldCoordinate(points, kinectTransform = null) {
        if (!kinectTransform) {
            // Kinect is stationary, no transform needed
            return points;
        }

        // Apply transform if Kinect moved
        return this.applyTransform(points, kinectTransform);
    }

    /**
     * Estimate Kinect position from point cloud
     * Uses centroid of point cloud as reference
     */
    estimateKinectPosition(points) {
        if (points.length === 0) return { x: 0, y: 0, z: 0 };

        let sumX = 0, sumY = 0, sumZ = 0;
        for (const point of points) {
            sumX += point.x;
            sumY += point.y;
            sumZ += point.z;
        }

        return {
            x: sumX / points.length,
            y: sumY / points.length,
            z: sumZ / points.length
        };
    }
}

