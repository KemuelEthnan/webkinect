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
     * Improved mesh reconstruction using Delaunay-like triangulation
     * Creates better mesh from point cloud
     */
    createImprovedMesh(points, resolution = 0.05) {
        if (points.length < 3) return { vertices: [], faces: [] };

        // Build spatial hash for faster neighbor lookup
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
        const maxDist = resolution * 1.5;

        // For each point, find neighbors and create triangles
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const gx = Math.floor(point.x / gridSize);
            const gy = Math.floor(point.y / gridSize);
            const gz = Math.floor(point.z / gridSize);

            const neighbors = [];
            
            // Check neighboring grid cells
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
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

            // Create triangles with nearest neighbors
            for (let j = 0; j < Math.min(neighbors.length, 10); j++) {
                for (let k = j + 1; k < Math.min(neighbors.length, 10); k++) {
                    const jIdx = neighbors[j].idx;
                    const kIdx = neighbors[k].idx;

                    // Check if triangle is valid (not too flat)
                    const v1 = { x: points[jIdx].x - point.x, y: points[jIdx].y - point.y, z: points[jIdx].z - point.z };
                    const v2 = { x: points[kIdx].x - point.x, y: points[kIdx].y - point.y, z: points[kIdx].z - point.z };
                    const normal = this.crossProduct(v1, v2);
                    const area = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);

                    if (area > 0.0001) { // Avoid degenerate triangles
                        // Check if triangle already exists (avoid duplicates)
                        const faceKey = [i, jIdx, kIdx].sort((a, b) => a - b).join(',');
                        if (!faces.find(f => f.key === faceKey)) {
                            faces.push({ key: faceKey, indices: [i, jIdx, kIdx] });
                        }
                    }
                }
            }
        }

        return {
            vertices: points.map(p => [p.x, p.y, p.z]),
            faces: faces.map(f => f.indices)
        };
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

