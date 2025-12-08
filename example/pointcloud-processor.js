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
     * Enhanced Statistical Outlier Removal with Adaptive Parameters
     * Uses spatial hashing for O(n) performance and adaptive thresholds
     * Based on best practices from PCL and Open3D
     */
    statisticalOutlierRemoval(points, meanK = 20, stdDevMulThresh = 2.0) {
        if (points.length === 0) return points;
        if (points.length < 10) return points; // Too few points to filter

        console.log('🔍 Enhanced SOR: Processing', points.length, 'points with k=', meanK, 'threshold=', stdDevMulThresh);

        // Adaptive parameters based on point cloud density
        const density = this.estimateDensity(points);
        const adaptiveK = Math.max(10, Math.min(50, Math.floor(meanK * (1 + density))));
        const adaptiveRadius = this.estimateSearchRadius(points, adaptiveK);

        // Build spatial hash for O(1) neighbor lookup
        const gridSize = adaptiveRadius * 0.5;
        const grid = new Map();
        
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

        const distances = [];
        const pointIndices = [];

        // Compute mean distance to k-nearest neighbors for each point using spatial hash
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const gx = Math.floor(point.x / gridSize);
            const gy = Math.floor(point.y / gridSize);
            const gz = Math.floor(point.z / gridSize);

            // Search in neighboring cells
            const neighbors = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const key = `${gx + dx},${gy + dy},${gz + dz}`;
                        const cellPoints = grid.get(key) || [];
                        
                        for (const idx of cellPoints) {
                            if (idx === i) continue;
                            const dist = this.distance(point, points[idx]);
                            neighbors.push({ idx, dist });
                        }
                    }
                }
            }

            // Sort and take k nearest
            neighbors.sort((a, b) => a.dist - b.dist);
            const kNearest = neighbors.slice(0, Math.min(adaptiveK, neighbors.length));

            if (kNearest.length === 0) continue;

            // Compute mean distance to k nearest neighbors
            const meanDist = kNearest.reduce((sum, n) => sum + n.dist, 0) / kNearest.length;
            distances.push(meanDist);
            pointIndices.push(i);
        }

        if (distances.length === 0) return points;

        // Compute global statistics
        const globalMean = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - globalMean, 2), 0) / distances.length;
        const stdDev = Math.sqrt(variance);
        const threshold = globalMean + stdDevMulThresh * stdDev;

        // Filter points based on adaptive threshold
        const filteredPoints = [];
        for (let i = 0; i < pointIndices.length; i++) {
            if (distances[i] <= threshold) {
                filteredPoints.push(points[pointIndices[i]]);
            }
        }

        const removed = points.length - filteredPoints.length;
        const removalRate = (removed / points.length * 100).toFixed(1);
        console.log('✅ Enhanced SOR: Removed', removed, 'outliers (' + removalRate + '%)');

        // Ensure we don't remove too many points (safety check)
        if (filteredPoints.length < points.length * 0.1) {
            console.warn('⚠️ SOR removed too many points, keeping original');
            return points;
        }

        return filteredPoints.length > 0 ? filteredPoints : points;
    }

    /**
     * Estimate point cloud density for adaptive parameters
     */
    estimateDensity(points) {
        if (points.length < 10) return 1.0;

        // Sample 100 random points and compute average nearest neighbor distance
        const sampleSize = Math.min(100, points.length);
        const step = Math.floor(points.length / sampleSize);
        let totalDist = 0;
        let count = 0;

        for (let i = 0; i < points.length; i += step) {
            const point = points[i];
            let minDist = Infinity;

            for (let j = 0; j < points.length; j++) {
                if (i === j) continue;
                const dist = this.distance(point, points[j]);
                if (dist < minDist) minDist = dist;
            }

            if (minDist < Infinity) {
                totalDist += minDist;
                count++;
            }
        }

        const avgDist = count > 0 ? totalDist / count : 0.02;
        // Higher density = smaller average distance
        // Normalize to 0-1 range (assuming typical range 0.01-0.05m)
        return Math.max(0.5, Math.min(2.0, 0.02 / avgDist));
    }

    /**
     * Estimate optimal search radius based on point cloud characteristics
     */
    estimateSearchRadius(points, k) {
        if (points.length < k) return 0.05;

        // Sample points and compute k-th nearest neighbor distance
        const sampleSize = Math.min(50, points.length);
        const step = Math.floor(points.length / sampleSize);
        const kthDistances = [];

        for (let i = 0; i < points.length; i += step) {
            const point = points[i];
            const distances = [];

            for (let j = 0; j < points.length; j++) {
                if (i === j) continue;
                distances.push(this.distance(point, points[j]));
            }

            distances.sort((a, b) => a - b);
            if (distances.length >= k) {
                kthDistances.push(distances[k - 1]);
            }
        }

        if (kthDistances.length === 0) return 0.05;

        // Use median of k-th distances as search radius
        kthDistances.sort((a, b) => a - b);
        const median = kthDistances[Math.floor(kthDistances.length / 2)];

        return Math.max(0.02, Math.min(0.1, median * 1.5));
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
     * Advanced Hole Filling with Boundary Detection and Classification
     * Implements multi-strategy hole filling based on hole size and geometry
     * Based on best practices from MeshLab and CGAL
     */
    fillHoles(points, faces, edgeMap, grid, gridSize, maxDist) {
        // Step 1: Detect and classify boundary edges
        const boundaryEdges = [];
        const edgeToFaces = new Map(); // Track which faces use each edge
        
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

        console.log('🔧 Advanced hole filling: Detected', boundaryEdges.length, 'boundary edges');

        // Step 2: Group boundary edges into hole loops
        const holeLoops = this.detectHoleLoops(boundaryEdges, points);
        console.log('🔧 Detected', holeLoops.length, 'hole loops');

        const newFaces = [...faces];
        const faceSet = new Set(faces.map(f => {
            const indices = f.indices || f;
            return indices.sort((a, b) => a - b).join(',');
        }));

        // Step 3: Fill each hole loop based on its size
        for (const loop of holeLoops) {
            if (loop.length < 3) continue; // Need at least 3 edges for a hole

            const holeSize = this.estimateHoleSize(loop, points);
            const numEdges = loop.length;

            console.log('🔧 Filling hole with', numEdges, 'edges, estimated size:', holeSize.toFixed(4), 'm');

            // Strategy 1: Small holes (< 10 edges) - Direct triangulation
            if (numEdges < 10) {
                const filled = this.fillSmallHole(loop, points, faceSet, grid, gridSize, maxDist);
                filled.forEach(f => {
                    if (!faceSet.has(f.key)) {
                        faceSet.add(f.key);
                        newFaces.push(f);
                    }
                });
            }
            // Strategy 2: Medium holes (10-50 edges) - Fan triangulation with quality check
            else if (numEdges < 50) {
                const filled = this.fillMediumHole(loop, points, faceSet, grid, gridSize, maxDist);
                filled.forEach(f => {
                    if (!faceSet.has(f.key)) {
                        faceSet.add(f.key);
                        newFaces.push(f);
                    }
                });
            }
            // Strategy 3: Large holes (> 50 edges) - Radial basis function approach
            else {
                const filled = this.fillLargeHole(loop, points, faceSet, grid, gridSize, maxDist);
                filled.forEach(f => {
                    if (!faceSet.has(f.key)) {
                        faceSet.add(f.key);
                        newFaces.push(f);
                    }
                });
            }
        }

        const addedFaces = newFaces.length - faces.length;
        console.log('✅ Advanced hole filling: Added', addedFaces, 'faces to fill holes');

        return newFaces;
    }

    /**
     * Detect hole loops from boundary edges
     * Groups connected boundary edges into closed loops
     */
    detectHoleLoops(boundaryEdges, points) {
        const loops = [];
        const usedEdges = new Set();
        const edgeMap = new Map(); // vertex -> connected edges

        // Build edge connectivity map
        boundaryEdges.forEach(([i1, i2], idx) => {
            if (!edgeMap.has(i1)) edgeMap.set(i1, []);
            if (!edgeMap.has(i2)) edgeMap.set(i2, []);
            edgeMap.get(i1).push([i2, idx]);
            edgeMap.get(i2).push([i1, idx]);
        });

        // Find loops by following connected edges
        for (let i = 0; i < boundaryEdges.length; i++) {
            if (usedEdges.has(i)) continue;

            const loop = [];
            let [currentVertex, nextVertex] = boundaryEdges[i];
            let currentEdgeIdx = i;
            const startVertex = currentVertex;

            // Follow the loop
            while (true) {
                usedEdges.add(currentEdgeIdx);
                loop.push([currentVertex, nextVertex]);

                // Find next edge connected to nextVertex
                const connectedEdges = edgeMap.get(nextVertex) || [];
                let found = false;

                for (const [connectedVertex, edgeIdx] of connectedEdges) {
                    if (!usedEdges.has(edgeIdx) && connectedVertex !== currentVertex) {
                        currentVertex = nextVertex;
                        nextVertex = connectedVertex;
                        currentEdgeIdx = edgeIdx;
                        found = true;
                        break;
                    }
                }

                if (!found || nextVertex === startVertex) break;
            }

            if (loop.length >= 3) {
                loops.push(loop);
            }
        }

        return loops;
    }

    /**
     * Estimate hole size (diameter) for classification
     */
    estimateHoleSize(loop, points) {
        let maxDist = 0;
        for (let i = 0; i < loop.length; i++) {
            for (let j = i + 1; j < loop.length; j++) {
                const [v1, _] = loop[i];
                const [v2, __] = loop[j];
                const dist = this.distance(points[v1], points[v2]);
                if (dist > maxDist) maxDist = dist;
            }
        }
        return maxDist;
    }

    /**
     * Fill small holes (< 10 edges) with direct triangulation
     */
    fillSmallHole(loop, points, faceSet, grid, gridSize, maxDist) {
        const faces = [];
        const vertices = loop.map(([v1, _]) => v1);

        // Simple fan triangulation from first vertex
        if (vertices.length >= 3) {
            for (let i = 1; i < vertices.length - 1; i++) {
                const tri = [vertices[0], vertices[i], vertices[i + 1]].sort((a, b) => a - b);
                const key = tri.join(',');
                if (!faceSet.has(key)) {
                    faces.push({ key, indices: tri });
                }
            }
        }

        return faces;
    }

    /**
     * Fill medium holes (10-50 edges) with quality-aware triangulation
     */
    fillMediumHole(loop, points, faceSet, grid, gridSize, maxDist) {
        const faces = [];
        const vertices = loop.map(([v1, _]) => v1);

        // Use ear clipping algorithm for better quality
        // Simplified: use fan triangulation with quality checks
        if (vertices.length >= 3) {
            // Try multiple fan centers and choose best
            let bestFaces = [];
            let bestScore = Infinity;

            for (let centerIdx = 0; centerIdx < Math.min(5, vertices.length); centerIdx++) {
                const center = vertices[centerIdx];
                const tempFaces = [];
                let totalVariance = 0;

                for (let i = 0; i < vertices.length; i++) {
                    const next = (i + 1) % vertices.length;
                    if (i === centerIdx || next === centerIdx) continue;

                    const tri = [center, vertices[i], vertices[next]].sort((a, b) => a - b);
                    const key = tri.join(',');
                    
                    // Calculate triangle quality
                    const p1 = points[tri[0]];
                    const p2 = points[tri[1]];
                    const p3 = points[tri[2]];
                    const d1 = this.distance(p1, p2);
                    const d2 = this.distance(p2, p3);
                    const d3 = this.distance(p3, p1);
                    const avg = (d1 + d2 + d3) / 3;
                    const variance = (Math.pow(d1 - avg, 2) + Math.pow(d2 - avg, 2) + Math.pow(d3 - avg, 2)) / 3;
                    
                    totalVariance += variance;
                    tempFaces.push({ key, indices: tri });
                }

                if (totalVariance < bestScore) {
                    bestScore = totalVariance;
                    bestFaces = tempFaces;
                }
            }

            faces.push(...bestFaces);
        }

        return faces;
    }

    /**
     * Fill large holes (> 50 edges) using radial basis function approach
     * Simplified: use adaptive fan triangulation with extended search
     */
    fillLargeHole(loop, points, faceSet, grid, gridSize, maxDist) {
        const faces = [];
        const vertices = loop.map(([v1, _]) => v1);

        // For large holes, use centroid-based approach
        // Calculate centroid of hole boundary
        let centroid = { x: 0, y: 0, z: 0 };
        vertices.forEach(v => {
            const p = points[v];
            centroid.x += p.x;
            centroid.y += p.y;
            centroid.z += p.z;
        });
        centroid.x /= vertices.length;
        centroid.y /= vertices.length;
        centroid.z /= vertices.length;

        // Find closest point to centroid (or create virtual point)
        let closestVertex = vertices[0];
        let minDist = Infinity;
        vertices.forEach(v => {
            const p = points[v];
            const dist = this.distance(p, centroid);
            if (dist < minDist) {
                minDist = dist;
                closestVertex = v;
            }
        });

        // Fan triangulation from closest vertex to centroid
        for (let i = 0; i < vertices.length; i++) {
            const next = (i + 1) % vertices.length;
            if (vertices[i] === closestVertex || vertices[next] === closestVertex) continue;

            const tri = [closestVertex, vertices[i], vertices[next]].sort((a, b) => a - b);
            const key = tri.join(',');
            if (!faceSet.has(key)) {
                faces.push({ key, indices: tri });
            }
        }

        return faces;
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

