/**
 * Kinect 3D Scanner - Full Implementation
 * Converts Kinect depth data → Point Cloud → Mesh → STL Export
 * 
 * Requirements:
 * - Three.js (loaded via CDN)
 * - WebKinect server running on ws://127.0.0.1:8181
 */

class Kinect3DScanner {
    constructor() {
        // WebSocket connection
        this.socket = null;
        this.connected = false;
        
        // Three.js setup
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Data storage
        this.depthData = null;
        this.colorData = null;
        this.pointCloud = [];
        this.mesh = null;
        
        // Camera view
        this.cameraMode = 'PointCloud'; // 'Color' or 'PointCloud'
        this.cameraImageUrl = null;
        
        // Server mode tracking
        this.serverMode = 'Unknown'; // 'Color', 'PointCloud', or 'Unknown'
        this.lastDataReceived = null; // Track last data type received
        
        // Settings
        this.settings = {
            minDepth: 0.85,      // meters
            maxDepth: 4.0,       // meters
            pointSkip: 2,        // Skip every N points for performance
            meshResolution: 0.05, // meters
            smoothing: true,
            holeFilling: true,
            simplify: false
        };
        
        // State
        this.isScanning = false;
        this.scanComplete = false;
    }
    
    /**
     * Initialize Three.js scene
     */
    initThreeJS(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Camera
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 0, 3);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);
        
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        // Grid helper
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);
        
        // Axes helper
        const axesHelper = new THREE.AxesHelper(1);
        this.scene.add(axesHelper);
        
        // Simple orbit controls
        this.setupControls();
        
        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize(container));
        
        // Start animation loop
        this.animate();
        
        console.log('✅ Three.js initialized');
    }
    
    /**
     * Setup simple orbit controls
     */
    setupControls() {
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            isDragging = true;
        });
        
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - previousMousePosition.x;
                const deltaY = e.clientY - previousMousePosition.y;
                
                this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
                this.camera.position.applyAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * 0.01);
                this.camera.lookAt(0, 0, 0);
            }
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        this.renderer.domElement.addEventListener('wheel', (e) => {
            const delta = e.deltaY * 0.001;
            this.camera.position.multiplyScalar(1 + delta);
        });
    }
    
    /**
     * Handle window resize
     */
    onWindowResize(container) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    /**
     * Connect to WebKinect server
     */
    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('Already connected');
            return;
        }
        
        console.log('🔗 Connecting to ws://127.0.0.1:8181...');
        this.socket = new WebSocket("ws://127.0.0.1:8181");
        
        this.socket.onopen = () => {
            console.log('✅ Connected to WebKinect server');
            this.connected = true;
            this.updateStatus('Connected');
            this.updateServerMode('Unknown', 'Just connected, waiting for data...');
            // Start with PointCloud mode for scanning
            this.cameraMode = 'PointCloud';
            
            // Send PointCloud mode request multiple times to ensure it's received
            setTimeout(() => {
                this.socket.send("PointCloud");
                console.log('📤 Sent PointCloud mode request (1st)');
            }, 100);
            
            setTimeout(() => {
                this.socket.send("PointCloud");
                console.log('📤 Sent PointCloud mode request (2nd)');
            }, 500);
            
            setTimeout(() => {
                this.socket.send("PointCloud");
                console.log('📤 Sent PointCloud mode request (3rd)');
                console.log('🔍 Current mode:', this.cameraMode);
                console.log('🔍 Socket state:', this.socket.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED');
            }, 1000);
        };
        
        this.socket.onclose = () => {
            console.log('🔌 Disconnected from server');
            this.connected = false;
            this.updateStatus('Disconnected');
            this.updateServerMode('Unknown', 'Disconnected');
        };
        
        this.socket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            this.updateStatus('Connection Error');
        };
        
        // Set up message handler
        // Create message handler
        const messageHandler = (event) => {
            this.handleMessage(event);
        };
        
        this.socket.onmessage = messageHandler;
        
        // Store as original handler for later use in startScan
        this.originalMessageHandler = messageHandler;
    }
    
    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(event) {
        // IMPORTANT: Check string data FIRST, before Blob, to catch JSON point cloud
        // Handle string data (point cloud or JSON) - CHECK THIS FIRST!
        if (typeof event.data === "string") {
            console.log('📦📦📦 RECEIVED STRING DATA! Length:', event.data.length);
            console.log('📦 First 300 chars:', event.data.substring(0, 300));
            
            // Update server mode based on received data type
            this.lastDataReceived = 'JSON';
            this.updateServerMode('PointCloud', 'Received JSON point cloud data');
            
            try {
                // Check if it's valid JSON
                let data;
                try {
                    data = JSON.parse(event.data);
                    console.log('✅✅✅ SUCCESSFULLY PARSED JSON!', {
                        keys: Object.keys(data),
                        hasPoints: !!data.points,
                        pointCount: data.points ? data.points.length : 0,
                        width: data.width,
                        height: data.height,
                        mode: this.cameraMode,
                        isScanning: this.isScanning
                    });
                } catch (parseError) {
                    console.error('❌ JSON Parse Error:', parseError);
                    console.warn('⚠️ Not valid JSON. First 500 chars:', event.data.substring(0, 500));
                    return;
                }
                
                console.log('📦 Processing JSON data:', {
                    keys: Object.keys(data),
                    hasPoints: !!data.points,
                    pointCount: data.points ? data.points.length : 0,
                    width: data.width,
                    height: data.height,
                    mode: this.cameraMode,
                    isScanning: this.isScanning
                });
                
                // Check if it's point cloud data
                if (data.points && Array.isArray(data.points)) {
                    console.log(`✅ Point cloud data: ${data.points.length} points`, {
                        width: data.width,
                        height: data.height,
                        isScanning: this.isScanning,
                        samplePoint: data.points[0] ? {
                            x: data.points[0].x,
                            y: data.points[0].y,
                            z: data.points[0].z
                        } : null
                    });
                    
                    if (this.isScanning) {
                        console.log('📸 Processing point cloud for scan...');
                        this.processPointCloudData(data);
                    } else {
                        // Show preview
                        console.log('👁️ Showing preview...');
                        this.showPreview(data);
                    }
                } else {
                    console.log('⚠️ Received non-point cloud JSON data:', Object.keys(data));
                    console.log('Data sample:', JSON.stringify(data).substring(0, 200));
                }
            } catch (e) {
                console.error('❌ Error parsing data:', e);
                console.error('Raw data preview:', event.data.substring(0, 500));
            }
            return; // Important: return after processing string data
        }
        
        // Handle Blob data (camera feed) - only if not string
        if (event.data instanceof Blob) {
            // Update server mode based on received data type
            this.lastDataReceived = 'Blob';
            // Only update to Color mode if we're receiving Blobs consistently
            // This helps detect when server switches modes
            if (this.serverMode !== 'Color') {
                this.updateServerMode('Color', 'Received Blob (camera feed) data');
            }
            
            // Only log every 10th Blob to reduce spam
            if (!this.blobCounter) this.blobCounter = 0;
            this.blobCounter++;
            if (this.blobCounter % 10 === 0) {
                console.log(`📷 Received Blob #${this.blobCounter} (${event.data.size} bytes) - camera feed`);
            }
            if (this.cameraMode === 'Color') {
                this.displayCameraFeed(event.data);
            } else {
                // Only log warning occasionally to reduce spam
                if (this.blobCounter % 20 === 0) {
                    console.log(`⚠️ Received ${this.blobCounter} Blob messages but not in Color mode (current: ${this.cameraMode})`);
                }
            }
            return;
        }
        
        // Unknown data type
        console.log('📦 Received unknown data type:', typeof event.data, event.data instanceof Blob ? 'Blob' : '');
    }
    
    /**
     * Display camera feed from Kinect
     */
    displayCameraFeed(blob) {
        const cameraView = document.getElementById('cameraView');
        if (!cameraView) return;
        
        // Revoke old URL
        if (this.cameraImageUrl) {
            URL.revokeObjectURL(this.cameraImageUrl);
        }
        
        // Create new URL
        this.cameraImageUrl = URL.createObjectURL(blob);
        
        // Remove placeholder
        const placeholder = cameraView.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        // Create or update image
        let img = cameraView.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.alt = 'Kinect Camera Feed';
            cameraView.appendChild(img);
        }
        
        img.src = this.cameraImageUrl;
        console.log('📷 Camera feed updated');
    }
    
    /**
     * Switch to Color mode to show camera feed
     */
    showCamera() {
        if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
            alert('Please connect to server first!');
            return;
        }
        
        console.log('📷 Switching to Color mode');
        this.cameraMode = 'Color';
        this.updateServerMode('Unknown', 'Requesting Color mode...');
        this.socket.send("Color");
        this.updateStatus('📷 Showing camera feed...');
        
        // Update buttons
        const showBtn = document.getElementById('showCameraBtn');
        const scanModeBtn = document.getElementById('scanModeBtn');
        if (showBtn) {
            showBtn.style.display = 'none';
        }
        if (scanModeBtn) {
            scanModeBtn.style.display = 'inline-block';
            scanModeBtn.disabled = false;
        }
    }
    
    /**
     * Switch back to PointCloud mode for scanning
     */
    switchToScanMode() {
        if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        console.log('📦 Switching to PointCloud mode');
        this.cameraMode = 'PointCloud';
        
        // Send multiple times to ensure server receives it
        this.socket.send("PointCloud");
        setTimeout(() => this.socket.send("PointCloud"), 200);
        setTimeout(() => this.socket.send("PointCloud"), 500);
        
        this.updateStatus('📦 Ready for scanning');
        
        // Update buttons
        const showBtn = document.getElementById('showCameraBtn');
        const scanModeBtn = document.getElementById('scanModeBtn');
        if (showBtn) {
            showBtn.style.display = 'inline-block';
            showBtn.disabled = false;
        }
        if (scanModeBtn) {
            scanModeBtn.style.display = 'none';
        }
        
        // Clear camera view
        const cameraView = document.getElementById('cameraView');
        if (cameraView) {
            const img = cameraView.querySelector('img');
            if (img) {
                img.remove();
            }
            if (!cameraView.querySelector('.placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'placeholder';
                placeholder.textContent = 'Camera feed will appear here';
                cameraView.appendChild(placeholder);
            }
        }
    }
    
    /**
     * Show preview of point cloud
     */
    showPreview(data) {
        if (!data.points || data.points.length === 0) {
            console.log('⚠️ No points for preview');
            return;
        }
        
        console.log(`👁️ Showing preview: ${data.points.length} points`);
        
        // Take sample for preview (less filtering)
        const sampleSize = Math.min(10000, data.points.length);
        let sample = data.points.slice(0, sampleSize);
        
        // Light filtering for preview
        sample = sample.filter(point => {
            if (!point || typeof point.z !== 'number') return false;
            const z = Math.abs(point.z);
            return z >= 0.3 && z <= 5.0; // Wider range for preview
        });
        
        if (sample.length > 0) {
            this.displayPointCloud(sample, 'preview', 0.03, 0.7);
            console.log(`✅ Preview displayed: ${sample.length} points`);
        } else {
            console.warn('⚠️ No points after preview filtering');
        }
    }
    
    /**
     * Start scanning - capture one frame
     */
    startScan() {
        if (!this.connected) {
            alert('Please connect to server first!');
            return;
        }
        
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            alert('WebSocket not connected! Please connect first.');
            return;
        }
        
        console.log('📸 Starting scan...');
        this.isScanning = true;
        this.scanComplete = false;
        this.pointCloud = [];
        
        // Always send PointCloud command to ensure server is in correct mode
        console.log('📦 Ensuring PointCloud mode is active...');
        this.cameraMode = 'PointCloud';
        this.updateServerMode('Unknown', 'Requesting PointCloud mode...');
        
        // Send multiple times to ensure server receives it
        this.socket.send("PointCloud");
        console.log('📤 Sent PointCloud command (1st)');
        
        setTimeout(() => {
            this.socket.send("PointCloud");
            console.log('📤 Sent PointCloud command (2nd)');
        }, 200);
        
        setTimeout(() => {
            this.socket.send("PointCloud");
            console.log('📤 Sent PointCloud command (3rd)');
        }, 500);
        
        this.updateStatus('Switching to scan mode...');
        
        // Update button
        const showBtn = document.getElementById('showCameraBtn');
        const scanModeBtn = document.getElementById('scanModeBtn');
        if (showBtn) {
            showBtn.style.display = 'inline-block';
            showBtn.disabled = false;
        }
        if (scanModeBtn) {
            scanModeBtn.style.display = 'none';
        }
        
        // Wait longer for mode switch to take effect (server needs time to process)
        // Server processes frames in AllFramesReady event, so we need to wait for next frame cycle
        console.log('⏳ Waiting 3 seconds for mode switch and frame processing...');
        setTimeout(() => {
            console.log('✅ Mode switch complete, starting capture...');
            console.log('🔍 Current mode:', this.cameraMode);
            console.log('🔍 Socket ready state:', this.socket.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED');
            this.captureFrame();
        }, 3000);
    }
    
    /**
     * Capture one frame of point cloud data
     */
    captureFrame() {
        console.log('📸 Capturing frame...');
        console.log('🔍 Current state:', {
            cameraMode: this.cameraMode,
            socketState: this.socket ? (this.socket.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED') : 'NULL',
            isScanning: this.isScanning
        });
        
        // Ensure we're in PointCloud mode
        if (this.cameraMode !== 'PointCloud') {
            console.warn('⚠️ Not in PointCloud mode! Switching...');
            this.cameraMode = 'PointCloud';
            this.socket.send("PointCloud");
            // Wait a bit more
            setTimeout(() => this.captureFrame(), 1500);
            return;
        }
        
        // Remove old preview and scan
        const oldPreview = this.scene.getObjectByName('preview');
        const oldScan = this.scene.getObjectByName('scan');
        if (oldPreview) this.scene.remove(oldPreview);
        if (oldScan) this.scene.remove(oldScan);
        
        this.updateStatus('Scanning... Waiting for point cloud data...');
        this.updatePointCount(0);
        
        // Store original handler if not already stored
        if (!this.originalMessageHandler) {
            this.originalMessageHandler = this.socket.onmessage.bind(this);
        }
        
        // Set up one-time capture with longer timeout
        let frameCaptured = false;
        let attempts = 0;
        const maxAttempts = 30; // 15 seconds (30 * 500ms)
        
        console.log('⏳ Waiting for point cloud data (max 15 seconds)...');
        console.log('💡 Make sure Kinect is connected and object is in front of it');
        
        const captureInterval = setInterval(() => {
            attempts++;
            if (attempts % 4 === 0) { // Log every 2 seconds
                console.log(`⏳ Still waiting... (${attempts * 0.5}s)`);
            }
            if (attempts >= maxAttempts) {
                clearInterval(captureInterval);
                if (!frameCaptured) {
                    console.error('❌ No data received within 15 seconds');
                    console.error('🔍 Troubleshooting:');
                    console.error('  1. Check if server.exe is running');
                    console.error('  2. Check if Kinect is connected');
                    console.error('  3. Check server console for errors');
                    console.error('  4. Try clicking "🔍 Test Data" button');
                    this.updateStatus('❌ Timeout: No data received. Try "Test Data" button.');
                    this.isScanning = false;
                    this.socket.onmessage = this.originalMessageHandler;
                }
            }
        }, 500);
        
        // Create capture handler that wraps original handler
        const captureHandler = (event) => {
            console.log('📥 Message received during scan:', {
                type: typeof event.data,
                isBlob: event.data instanceof Blob,
                length: event.data instanceof Blob ? event.data.size : (typeof event.data === 'string' ? event.data.length : 'N/A'),
                frameCaptured: frameCaptured
            });
            
            if (frameCaptured) {
                // Restore original handler and pass through
                clearInterval(captureInterval);
                this.socket.onmessage = this.originalMessageHandler;
                this.originalMessageHandler(event);
                return;
            }
            
            // Skip Blob data during scan (camera feed)
            if (event.data instanceof Blob) {
                console.log('📦 Skipping Blob data during scan (camera feed, size:', event.data.size, 'bytes)');
                return;
            }
            
            // Handle string data (point cloud JSON)
            if (typeof event.data === "string") {
                console.log('📦 Received string data during scan, length:', event.data.length);
                console.log('📦 First 100 chars:', event.data.substring(0, 100));
                
                try {
                    const data = JSON.parse(event.data);
                    console.log('✅✅✅ Parsed JSON successfully!', {
                        hasPoints: !!data.points,
                        pointCount: data.points ? data.points.length : 0,
                        width: data.width,
                        height: data.height,
                        dataType: typeof data,
                        keys: Object.keys(data)
                    });
                    
                    if (data.points && Array.isArray(data.points) && data.points.length > 0) {
                        console.log(`🎉🎉🎉 CAPTURED FRAME with ${data.points.length} points`);
                        clearInterval(captureInterval);
                        frameCaptured = true;
                        this.processPointCloudData(data);
                        this.isScanning = false;
                        this.scanComplete = true;
                        this.updateStatus(`✅ Scan Complete: ${this.pointCloud.length} points`);
                        // Restore original handler
                        this.socket.onmessage = this.originalMessageHandler;
                    } else {
                        console.warn('⚠️ Data received but no valid points array');
                        console.warn('Data structure:', Object.keys(data));
                        console.warn('Full data sample:', JSON.stringify(data).substring(0, 500));
                    }
                } catch (e) {
                    console.error('❌ Error parsing data:', e);
                    console.error('Raw data preview (first 500 chars):', event.data.substring(0, 500));
                    console.error('Data type:', typeof event.data);
                    console.error('Data length:', event.data.length);
                    console.error('Is it valid JSON?', event.data.trim().startsWith('{'));
                }
            } else {
                console.log('📦 Received non-string data during scan:', typeof event.data, event.data instanceof Blob ? 'Blob' : '');
            }
        };
        
        // Override message handler for capture
        console.log('🔧 Setting up capture handler...');
        this.socket.onmessage = captureHandler;
        console.log('✅ Capture handler installed');
        
        // Also log that we're waiting
        console.log('⏳ Waiting for point cloud data... (max 10 seconds)');
    }
    
    /**
     * Process point cloud data from Kinect
     */
    processPointCloudData(data) {
        if (!data.points || data.points.length === 0) {
            console.warn('⚠️ No points in data');
            this.updateStatus('Error: No points in data');
            return;
        }
        
        console.log('📊 Processing point cloud:', {
            totalPoints: data.points.length,
            sampleZ: data.points.slice(0, 10).map(p => p.z).filter(z => z !== undefined),
            zRange: {
                min: Math.min(...data.points.map(p => Math.abs(p.z || 0)).filter(z => z > 0)),
                max: Math.max(...data.points.map(p => Math.abs(p.z || 0)))
            }
        });
        
        // Filter by depth range
        const beforeFilter = data.points.length;
        let filtered = data.points.filter(point => {
            if (!point || typeof point.x !== 'number' || typeof point.y !== 'number' || typeof point.z !== 'number') {
                return false;
            }
            const z = Math.abs(point.z); // Z is distance from sensor
            return z >= this.settings.minDepth && z <= this.settings.maxDepth;
        });
        
        console.log(`📊 Filtered by depth (${this.settings.minDepth}-${this.settings.maxDepth}m): ${beforeFilter} → ${filtered.length} points`);
        
        // If all filtered out, use wider range
        if (filtered.length === 0 && data.points.length > 0) {
            console.warn('⚠️ All points filtered out! Using wider range (0.3-5.0m)');
            filtered = data.points.filter(point => {
                if (!point || typeof point.z !== 'number') return false;
                const z = Math.abs(point.z);
                return z >= 0.3 && z <= 5.0;
            });
            console.log(`📊 Wider filter result: ${filtered.length} points`);
        }
        
        // Apply point skipping for performance
        const skipped = [];
        for (let i = 0; i < filtered.length; i += this.settings.pointSkip) {
            skipped.push(filtered[i]);
        }
        
        this.pointCloud = skipped;
        console.log(`📊 Final: ${data.points.length} → ${filtered.length} → ${this.pointCloud.length} points`);
        
        if (this.pointCloud.length === 0) {
            console.error('❌ No points after processing!');
            this.updateStatus('Error: No points after filtering. Adjust Min/Max Depth settings.');
            this.updatePointCount(0);
            return;
        }
        
        // Display point cloud
        this.displayPointCloud(this.pointCloud, 'scan', 0.05, 1.0);
        
        // Update UI
        this.updatePointCount(this.pointCloud.length);
        this.updateStatus(`✅ Scan Complete: ${this.pointCloud.length} points`);
    }
    
    /**
     * Display point cloud in Three.js
     */
    displayPointCloud(points, name, size, opacity) {
        if (!points || points.length === 0) {
            console.warn(`⚠️ No points to display for ${name}`);
            return;
        }
        
        if (!this.scene || !this.camera || !this.renderer) {
            console.error('❌ Three.js not initialized');
            return;
        }
        
        console.log(`🎨 Displaying ${points.length} points as ${name}...`);
        
        // Remove old point cloud
        const old = this.scene.getObjectByName(name);
        if (old) {
            this.scene.remove(old);
            if (old.geometry) old.geometry.dispose();
            if (old.material) old.material.dispose();
        }
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        
        // Calculate bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let validPoints = 0;
        
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (!p) continue;
            
            const x = parseFloat(p.x) || 0;
            const y = parseFloat(p.y) || 0;
            const z = parseFloat(p.z) || 0;
            
            // Skip invalid points
            if (isNaN(x) || isNaN(y) || isNaN(z) || !isFinite(x) || !isFinite(y) || !isFinite(z)) {
                continue;
            }
            
            positions[validPoints * 3] = x;
            positions[validPoints * 3 + 1] = y;
            positions[validPoints * 3 + 2] = z;
            
            colors[validPoints * 3] = (p.r || 128) / 255;
            colors[validPoints * 3 + 1] = (p.g || 128) / 255;
            colors[validPoints * 3 + 2] = (p.b || 128) / 255;
            
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            validPoints++;
        }
        
        if (validPoints === 0) {
            console.error('❌ No valid points after processing');
            return;
        }
        
        // Resize arrays if needed
        let finalPositions, finalColors;
        if (validPoints < points.length) {
            finalPositions = new Float32Array(validPoints * 3);
            finalColors = new Float32Array(validPoints * 3);
            for (let i = 0; i < validPoints; i++) {
                finalPositions[i * 3] = positions[i * 3];
                finalPositions[i * 3 + 1] = positions[i * 3 + 1];
                finalPositions[i * 3 + 2] = positions[i * 3 + 2];
                finalColors[i * 3] = colors[i * 3];
                finalColors[i * 3 + 1] = colors[i * 3 + 1];
                finalColors[i * 3 + 2] = colors[i * 3 + 2];
            }
        } else {
            finalPositions = positions;
            finalColors = colors;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));
        
        // Material - make points more visible
        const material = new THREE.PointsMaterial({
            size: size,
            vertexColors: true,
            sizeAttenuation: true,
            opacity: opacity,
            transparent: opacity < 1.0
        });
        
        const pointCloud = new THREE.Points(geometry, material);
        pointCloud.name = name;
        this.scene.add(pointCloud);
        
        console.log(`✅ Added ${validPoints} points to scene`);
        console.log(`📐 Bounds: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}] Y[${minY.toFixed(2)}, ${maxY.toFixed(2)}] Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
        
        // Adjust camera
        if (validPoints > 0 && !isNaN(minX) && !isNaN(maxX) && (maxX - minX) > 0) {
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const centerZ = (minZ + maxZ) / 2;
            const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
            
            this.camera.position.set(centerX, centerY + size * 0.3, centerZ + size * 2.5);
            this.camera.lookAt(centerX, centerY, centerZ);
            this.camera.updateProjectionMatrix();
            
            console.log(`📷 Camera adjusted: position(${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)})`);
        }
        
        // Force render
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Generate mesh from point cloud
     */
    generateMesh() {
        if (!this.pointCloud || this.pointCloud.length < 3) {
            alert('Not enough points to generate mesh! Please scan first.');
            return;
        }
        
        console.log('🔨 Generating mesh from', this.pointCloud.length, 'points...');
        this.updateStatus('Generating mesh...');
        
        // Remove old mesh
        const oldMesh = this.scene.getObjectByName('mesh');
        if (oldMesh) {
            this.scene.remove(oldMesh);
            if (oldMesh.geometry) oldMesh.geometry.dispose();
            if (oldMesh.material) oldMesh.material.dispose();
        }
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.pointCloud.length * 3);
        const colors = new Float32Array(this.pointCloud.length * 3);
        
        for (let i = 0; i < this.pointCloud.length; i++) {
            const p = this.pointCloud[i];
            positions[i * 3] = p.x || 0;
            positions[i * 3 + 1] = p.y || 0;
            positions[i * 3 + 2] = p.z || 0;
            
            colors[i * 3] = (p.r || 128) / 255;
            colors[i * 3 + 1] = (p.g || 128) / 255;
            colors[i * 3 + 2] = (p.b || 128) / 255;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Triangulate
        const indices = this.triangulate(this.pointCloud);
        geometry.setIndex(indices);
        
        // Compute normals
        geometry.computeVertexNormals();
        
        // Smoothing
        if (this.settings.smoothing) {
            this.smoothGeometry(geometry);
        }
        
        // Material
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            flatShading: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = 'mesh';
        this.scene.add(this.mesh);
        
        // Hide point cloud
        const pointCloud = this.scene.getObjectByName('scan');
        if (pointCloud) {
            pointCloud.visible = false;
        }
        
        const triangleCount = indices.length / 3;
        console.log(`✅ Mesh generated with ${triangleCount} triangles`);
        this.updateStatus(`✅ Mesh Generated: ${triangleCount} triangles`);
        this.updateTriangleCount(triangleCount);
    }
    
    /**
     * Simple grid-based triangulation
     */
    triangulate(points) {
        const indices = [];
        const resolution = this.settings.meshResolution;
        const grid = new Map();
        
        // Build spatial hash grid
        points.forEach((point, index) => {
            const gx = Math.floor(point.x / resolution);
            const gy = Math.floor(point.y / resolution);
            const gz = Math.floor(point.z / resolution);
            const key = `${gx},${gy},${gz}`;
            
            if (!grid.has(key)) {
                grid.set(key, []);
            }
            grid.get(key).push(index);
        });
        
        // Create triangles from neighboring points
        const processed = new Set();
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const gx = Math.floor(point.x / resolution);
            const gy = Math.floor(point.y / resolution);
            const gz = Math.floor(point.z / resolution);
            
            // Check neighboring cells
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const key = `${gx + dx},${gy + dy},${gz + dz}`;
                        const neighbors = grid.get(key) || [];
                        
                        for (let j = 0; j < neighbors.length; j++) {
                            const jIdx = neighbors[j];
                            if (jIdx <= i) continue;
                            
                            const dist = Math.sqrt(
                                Math.pow(points[jIdx].x - point.x, 2) +
                                Math.pow(points[jIdx].y - point.y, 2) +
                                Math.pow(points[jIdx].z - point.z, 2)
                            );
                            
                            if (dist < resolution * 2) {
                                // Find third point
                                for (let k = j + 1; k < neighbors.length; k++) {
                                    const kIdx = neighbors[k];
                                    if (kIdx <= jIdx) continue;
                                    
                                    const dist2 = Math.sqrt(
                                        Math.pow(points[kIdx].x - point.x, 2) +
                                        Math.pow(points[kIdx].y - point.y, 2) +
                                        Math.pow(points[kIdx].z - point.z, 2)
                                    );
                                    
                                    if (dist2 < resolution * 2) {
                                        const triKey = [i, jIdx, kIdx].sort().join(',');
                                        if (!processed.has(triKey)) {
                                            indices.push(i, jIdx, kIdx);
                                            processed.add(triKey);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Fallback: simple triangulation if not enough triangles
        if (indices.length < points.length) {
            console.log('Using fallback triangulation');
            for (let i = 0; i < points.length - 2; i += 3) {
                if (i + 2 < points.length) {
                    indices.push(i, i + 1, i + 2);
                }
            }
        }
        
        return new Uint32Array(indices);
    }
    
    /**
     * Smooth geometry using Laplacian smoothing
     */
    smoothGeometry(geometry) {
        const positions = geometry.attributes.position.array;
        const indices = geometry.index.array;
        const vertexCount = positions.length / 3;
        
        // Build adjacency list
        const adjacency = new Array(vertexCount).fill(null).map(() => []);
        
        for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i];
            const i2 = indices[i + 1];
            const i3 = indices[i + 2];
            
            adjacency[i1].push(i2, i3);
            adjacency[i2].push(i1, i3);
            adjacency[i3].push(i1, i2);
        }
        
        // Remove duplicates
        adjacency.forEach(neighbors => {
            const unique = [...new Set(neighbors)];
            neighbors.length = 0;
            neighbors.push(...unique);
        });
        
        // Apply Laplacian smoothing (1 iteration)
        const newPositions = new Float32Array(positions);
        
        for (let i = 0; i < vertexCount; i++) {
            const neighbors = adjacency[i];
            if (neighbors.length === 0) continue;
            
            let sumX = 0, sumY = 0, sumZ = 0;
            neighbors.forEach(nIdx => {
                sumX += positions[nIdx * 3];
                sumY += positions[nIdx * 3 + 1];
                sumZ += positions[nIdx * 3 + 2];
            });
            
            const avgX = sumX / neighbors.length;
            const avgY = sumY / neighbors.length;
            const avgZ = sumZ / neighbors.length;
            
            // Blend original with average (0.5 factor)
            newPositions[i * 3] = positions[i * 3] * 0.5 + avgX * 0.5;
            newPositions[i * 3 + 1] = positions[i * 3 + 1] * 0.5 + avgY * 0.5;
            newPositions[i * 3 + 2] = positions[i * 3 + 2] * 0.5 + avgZ * 0.5;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
        geometry.computeVertexNormals();
    }
    
    /**
     * Export mesh to STL
     */
    exportSTL() {
        if (!this.mesh) {
            alert('Please generate mesh first!');
            return;
        }
        
        console.log('💾 Exporting STL...');
        this.updateStatus('Exporting STL...');
        
        try {
            // Use THREE.STLExporter if available, otherwise use custom converter
            if (typeof THREE.STLExporter !== 'undefined') {
                const exporter = new THREE.STLExporter();
                const stlString = exporter.parse(this.mesh);
                this.downloadFile(stlString, 'kinect-scan.stl', 'application/octet-stream');
            } else {
                // Fallback: custom STL converter
                const stlString = this.convertToSTL(this.mesh.geometry);
                this.downloadFile(stlString, 'kinect-scan.stl', 'text/plain');
            }
            
            console.log('✅ STL exported successfully');
            this.updateStatus('STL Exported!');
        } catch (error) {
            console.error('❌ Error exporting STL:', error);
            alert('Error exporting STL: ' + error.message);
            this.updateStatus('Export Error');
        }
    }
    
    /**
     * Convert Three.js geometry to STL format
     */
    convertToSTL(geometry) {
        let stl = 'solid kinect_scan\n';
        
        const positions = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;
        
        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                const i1 = indices[i] * 3;
                const i2 = indices[i + 1] * 3;
                const i3 = indices[i + 2] * 3;
                
                const v1 = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
                const v2 = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);
                const v3 = new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]);
                
                const normal = new THREE.Vector3()
                    .subVectors(v2, v1)
                    .cross(new THREE.Vector3().subVectors(v3, v1))
                    .normalize();
                
                stl += `  facet normal ${normal.x.toFixed(6)} ${normal.y.toFixed(6)} ${normal.z.toFixed(6)}\n`;
                stl += `    outer loop\n`;
                stl += `      vertex ${v1.x.toFixed(6)} ${v1.y.toFixed(6)} ${v1.z.toFixed(6)}\n`;
                stl += `      vertex ${v2.x.toFixed(6)} ${v2.y.toFixed(6)} ${v2.z.toFixed(6)}\n`;
                stl += `      vertex ${v3.x.toFixed(6)} ${v3.y.toFixed(6)} ${v3.z.toFixed(6)}\n`;
                stl += `    endloop\n`;
                stl += `  endfacet\n`;
            }
        }
        
        stl += 'endsolid kinect_scan\n';
        return stl;
    }
    
    /**
     * Download file
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * Update status message
     */
    updateStatus(message) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
        }
        console.log('📊 Status:', message);
    }
    
    /**
     * Update server mode indicator
     */
    updateServerMode(mode, reason = '') {
        this.serverMode = mode;
        const modeEl = document.getElementById('serverMode');
        const indicatorEl = document.getElementById('serverModeIndicator');
        const statusContainer = document.getElementById('serverModeStatus');
        
        if (modeEl) {
            modeEl.textContent = mode;
        }
        
        if (statusContainer) {
            statusContainer.style.display = 'block';
        }
        
        if (indicatorEl) {
            // Remove all classes
            indicatorEl.classList.remove('active', 'inactive', 'unknown');
            
            if (mode === 'PointCloud') {
                indicatorEl.classList.add('active');
                indicatorEl.title = 'Server is in PointCloud mode - sending JSON point cloud data';
            } else if (mode === 'Color') {
                indicatorEl.classList.add('inactive');
                indicatorEl.title = 'Server is in Color mode - sending camera feed (Blob)';
            } else {
                indicatorEl.classList.add('unknown');
                indicatorEl.title = 'Server mode unknown';
            }
        }
        
        if (reason) {
            console.log(`🔄 Server mode updated to: ${mode} (${reason})`);
        } else {
            console.log(`🔄 Server mode updated to: ${mode}`);
        }
    }
    
    /**
     * Update point count in UI
     */
    updatePointCount(count) {
        const pointCountEl = document.getElementById('pointCount');
        if (pointCountEl) {
            pointCountEl.textContent = count.toLocaleString();
        }
    }
    
    /**
     * Update triangle count in UI
     */
    updateTriangleCount(count) {
        const triangleCountEl = document.getElementById('triangleCount');
        if (triangleCountEl) {
            triangleCountEl.textContent = count > 0 ? count.toLocaleString() : '-';
        }
    }
    
    /**
     * Update settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        console.log('Settings updated:', this.settings);
    }
}

// Export for use in HTML
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Kinect3DScanner;
}


