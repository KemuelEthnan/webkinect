/**
 * NewKinectFusion.js
 *
 * Implements a simplified fusion mechanism for creating a cumulative 3D model.
 * It simulates pose tracking for a rotating object by applying a rotation to each
 * incoming point cloud frame before merging it into a global model.
 */
class NewKinectFusion {
    constructor(scene) {
        this.scene = scene;
        this.fusedGeometry = new THREE.BufferGeometry();
        this.fusedPoints = null;
        this.totalPoints = 0;

        // We will manage a single Points object and update its geometry.
        const material = new THREE.PointsMaterial({
            size: 0.015,
            vertexColors: true
        });
        this.fusedPointsObject = new THREE.Points(this.fusedGeometry, material);
        this.fusedPointsObject.name = "FusedPointCloud";

        this.scene.add(this.fusedPointsObject);

        console.log("NewKinectFusion initialized.");
    }

    /**
     * Adds a new frame of points to the fused model.
     * @param {Array} newPoints - An array of points, where each point is {x, y, z, r, g, b}.
     * @param {number} yAngle - The rotation angle in radians to apply to this frame.
     */
    addFrame(newPoints, yAngle) {
        if (!newPoints || newPoints.length === 0) {
            return;
        }

        // 1. Create a temporary geometry for the new points.
        const tempGeometry = new THREE.BufferGeometry();
        const positions = newPoints.map(p => [p.x, p.y, p.z]).flat();
        const colors = newPoints.map(p => [p.r / 255, p.g / 255, p.b / 255]).flat();
        
        tempGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        if (colors.length > 0) {
            tempGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        }

        // 2. Apply the rotation to the temporary geometry.
        tempGeometry.rotateY(yAngle);
        tempGeometry.computeBoundingBox();

        // 3. Get the transformed positions and colors.
        const transformedPositions = tempGeometry.getAttribute('position').array;
        const transformedColors = tempGeometry.getAttribute('color') ? tempGeometry.getAttribute('color').array : null;

        // 4. Merge with the main geometry.
        const newTotalPoints = this.totalPoints + newPoints.length;
        const newPositionsArray = new Float32Array(newTotalPoints * 3);
        const newColorsArray = transformedColors ? new Float32Array(newTotalPoints * 3) : null;

        // Copy old data
        if (this.totalPoints > 0) {
            newPositionsArray.set(this.fusedGeometry.getAttribute('position').array, 0);
            if (newColorsArray && this.fusedGeometry.getAttribute('color')) {
                newColorsArray.set(this.fusedGeometry.getAttribute('color').array, 0);
            }
        }

        // Add new data
        newPositionsArray.set(transformedPositions, this.totalPoints * 3);
        if (newColorsArray && transformedColors) {
            newColorsArray.set(transformedColors, this.totalPoints * 3);
        }

        // 5. Update the main geometry.
        this.fusedGeometry.setAttribute('position', new THREE.BufferAttribute(newPositionsArray, 3));
        if (newColorsArray) {
            this.fusedGeometry.setAttribute('color', new THREE.BufferAttribute(newColorsArray, 3));
        }
        
        this.totalPoints = newTotalPoints;

        // Tell Three.js to update the geometry
        this.fusedGeometry.attributes.position.needsUpdate = true;
        if (this.fusedGeometry.attributes.color) {
            this.fusedGeometry.attributes.color.needsUpdate = true;
        }

        this.fusedGeometry.computeBoundingSphere();
    }

    /**
     * Clears the fused model.
     */
    reset() {
        this.totalPoints = 0;
        this.fusedGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.fusedGeometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
        this.fusedGeometry.attributes.position.needsUpdate = true;
        this.fusedGeometry.attributes.color.needsUpdate = true;
    }
}
