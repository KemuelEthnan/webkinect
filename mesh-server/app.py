"""
Ball Pivoting Mesh Server
Server Python Flask untuk rekonstruksi mesh menggunakan Open3D Ball Pivoting Algorithm

Workflow:
1. Menerima point cloud dari browser (format PLY/JSON)
2. Memproses menggunakan Ball Pivoting Open3D
3. Mengembalikan mesh ke browser (format PLY/OBJ)

Requirements:
- Flask
- Open3D
- NumPy
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import open3d as o3d
import numpy as np
import os
import uuid
import json
import tempfile
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for browser access

# Create directories
os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

# Configuration
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
ALLOWED_FORMATS = ['ply', 'pcd', 'json']


def reconstruct_mesh_ball_pivoting(input_path, output_path, params=None):
    """
    Rekonstruksi mesh menggunakan Ball Pivoting Algorithm dari Open3D

    Args:
        input_path: Path ke file point cloud input (PLY/PCD)
        output_path: Path ke file mesh output (PLY/OBJ)
        params: Dictionary parameter untuk Ball Pivoting
            - radius_multiplier: Multiplier untuk radius ball (default: 1.5)
            - num_radii: Jumlah radius yang digunakan (default: 2)
            - estimate_normals: Apakah perlu estimate normals (default: True)
            - normal_radius: Radius untuk estimasi normals (default: None, auto)
            - normal_max_nn: Max nearest neighbors untuk normals (default: 30)

    Returns:
        dict: Statistik mesh yang dihasilkan
    """
    if params is None:
        params = {}

    # Default parameters
    radius_multiplier = params.get('radius_multiplier', 1.5)
    num_radii = params.get('num_radii', 2)
    estimate_normals = params.get('estimate_normals', True)
    normal_radius = params.get('normal_radius', None)
    normal_max_nn = params.get('normal_max_nn', 30)

    print(f"📂 Loading point cloud from: {input_path}")

    # Load point cloud
    pcd = o3d.io.read_point_cloud(input_path)

    if not pcd.has_points():
        raise ValueError("Point cloud is empty!")

    num_points = len(pcd.points)
    print(f"✅ Loaded {num_points:,} points")

    # Estimate normals if not present or if requested
    if estimate_normals or not pcd.has_normals():
        print("🔧 Estimating normals...")

        # Auto-calculate normal radius if not provided
        if normal_radius is None:
            # Calculate average distance to nearest neighbor
            distances = pcd.compute_nearest_neighbor_distance()
            avg_dist = np.mean(distances)
            normal_radius = avg_dist * 2.0
            print(f"   Auto-calculated normal radius: {normal_radius:.4f}")

        pcd.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(
                radius=normal_radius,
                max_nn=normal_max_nn
            )
        )

        # Orient normals consistently (toward camera/viewer)
        pcd.orient_normals_consistent_tangent_plane(k=15)
        print("✅ Normals estimated and oriented")

    # Calculate ball radii based on point cloud density
    print("🔧 Calculating ball radii...")
    distances = pcd.compute_nearest_neighbor_distance()
    avg_dist = np.mean(distances)

    # Create multiple radii for better coverage
    radii = []
    for i in range(num_radii):
        multiplier = radius_multiplier * (1 + i * 0.5)
        radii.append(avg_dist * multiplier)

    print(f"   Average point distance: {avg_dist:.4f}")
    print(f"   Ball radii: {[f'{r:.4f}' for r in radii]}")

    # Ball Pivoting Algorithm
    print("🔷 Running Ball Pivoting Algorithm...")
    start_time = datetime.now()

    mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_ball_pivoting(
        pcd,
        o3d.utility.DoubleVector(radii)
    )

    elapsed = (datetime.now() - start_time).total_seconds()

    if not mesh.has_triangles():
        raise ValueError("Ball Pivoting failed to generate mesh!")

    num_vertices = len(mesh.vertices)
    num_triangles = len(mesh.triangles)

    print(f"✅ Ball Pivoting completed in {elapsed:.2f}s")
    print(f"   Vertices: {num_vertices:,}")
    print(f"   Triangles: {num_triangles:,}")

    # Post-processing
    print("🔧 Post-processing mesh...")

    # Remove duplicated vertices
    mesh.remove_duplicated_vertices()

    # Remove duplicated triangles
    mesh.remove_duplicated_triangles()

    # Remove degenerate triangles
    mesh.remove_degenerate_triangles()

    # Remove unreferenced vertices
    mesh.remove_unreferenced_vertices()

    print(f"   After cleanup: {len(mesh.vertices):,} vertices, {len(mesh.triangles):,} triangles")

    # Compute normals for better rendering
    mesh.compute_vertex_normals()

    # Save mesh
    print(f"💾 Saving mesh to: {output_path}")
    success = o3d.io.write_triangle_mesh(output_path, mesh)

    if not success:
        raise IOError(f"Failed to save mesh to {output_path}")

    print("✅ Mesh saved successfully")

    # Return statistics
    return {
        'num_input_points': num_points,
        'num_vertices': len(mesh.vertices),
        'num_triangles': len(mesh.triangles),
        'processing_time': elapsed,
        'radii_used': radii,
        'avg_point_distance': avg_dist
    }


def json_to_ply(json_data, output_path):
    """
    Convert JSON point cloud data to PLY format

    Expected JSON format:
    {
        "points": [
            {"x": 0.1, "y": 0.2, "z": 0.3, "r": 255, "g": 0, "b": 0},
            ...
        ]
    }
    """
    if isinstance(json_data, str):
        data = json.loads(json_data)
    else:
        data = json_data

    points = data.get('points', [])
    if not points:
        raise ValueError("No points in JSON data")

    # Extract coordinates and colors
    coords = []
    colors = []

    for p in points:
        coords.append([p['x'], p['y'], p['z']])
        # Normalize color to 0-1 range if needed
        r = p.get('r', 128) / 255.0 if p.get('r', 128) > 1 else p.get('r', 0.5)
        g = p.get('g', 128) / 255.0 if p.get('g', 128) > 1 else p.get('g', 0.5)
        b = p.get('b', 128) / 255.0 if p.get('b', 128) > 1 else p.get('b', 0.5)
        colors.append([r, g, b])

    # Create Open3D point cloud
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(coords))
    pcd.colors = o3d.utility.Vector3dVector(np.array(colors))

    # Save as PLY
    o3d.io.write_point_cloud(output_path, pcd)
    print(f"✅ Converted {len(points)} points from JSON to PLY")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Ball Pivoting Mesh Server',
        'version': '1.0.0'
    })


@app.route('/mesh', methods=['POST'])
def create_mesh():
    """
    Main endpoint untuk Ball Pivoting mesh reconstruction

    Accepts:
    - Binary PLY/PCD file (Content-Type: application/octet-stream)
    - JSON point cloud data (Content-Type: application/json)

    Returns:
    - PLY mesh file
    """
    try:
        # Generate unique file IDs
        file_id = str(uuid.uuid4())

        # Get parameters from query string or headers
        radius_multiplier = float(request.args.get('radius_multiplier', 1.5))
        num_radii = int(request.args.get('num_radii', 2))
        output_format = request.args.get('format', 'ply')  # ply or obj

        params = {
            'radius_multiplier': radius_multiplier,
            'num_radii': num_radii,
            'estimate_normals': True
        }

        print(f"\n{'='*60}")
        print(f"🆕 New mesh request: {file_id}")
        print(f"   Parameters: {params}")
        print(f"{'='*60}\n")

        # Determine input format and save
        content_type = request.content_type

        if content_type == 'application/json':
            # JSON input
            input_path = f"uploads/{file_id}.ply"
            json_data = request.get_json()
            json_to_ply(json_data, input_path)
        else:
            # Binary PLY/PCD input
            input_ext = request.args.get('input_format', 'ply')
            input_path = f"uploads/{file_id}.{input_ext}"

            with open(input_path, 'wb') as f:
                f.write(request.data)

            print(f"📂 Saved input file: {input_path} ({len(request.data)} bytes)")

        # Output path
        output_ext = 'ply' if output_format == 'ply' else 'obj'
        output_path = f"outputs/{file_id}.{output_ext}"

        # Run Ball Pivoting reconstruction
        stats = reconstruct_mesh_ball_pivoting(input_path, output_path, params)

        # Clean up input file
        try:
            os.remove(input_path)
        except:
            pass

        print(f"\n✅ Request completed successfully\n")

        # Return mesh file with statistics in headers
        response = send_file(
            output_path,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=f'mesh_{file_id}.{output_ext}'
        )

        # Add statistics to response headers
        response.headers['X-Num-Vertices'] = str(stats['num_vertices'])
        response.headers['X-Num-Triangles'] = str(stats['num_triangles'])
        response.headers['X-Processing-Time'] = str(stats['processing_time'])

        return response

    except Exception as e:
        print(f"\n❌ Error: {str(e)}\n")
        return jsonify({
            'error': str(e),
            'type': type(e).__name__
        }), 500


@app.route('/mesh/stats', methods=['POST'])
def get_mesh_stats():
    """
    Get statistics about the generated mesh without downloading it
    Useful for previewing before full processing
    """
    try:
        file_id = str(uuid.uuid4())

        # Save input
        content_type = request.content_type

        if content_type == 'application/json':
            input_path = f"uploads/{file_id}.ply"
            json_data = request.get_json()
            json_to_ply(json_data, input_path)
        else:
            input_ext = request.args.get('input_format', 'ply')
            input_path = f"uploads/{file_id}.{input_ext}"

            with open(input_path, 'wb') as f:
                f.write(request.data)

        # Load point cloud to get stats
        pcd = o3d.io.read_point_cloud(input_path)

        # Calculate distances
        distances = pcd.compute_nearest_neighbor_distance()
        avg_dist = np.mean(distances)

        # Clean up
        try:
            os.remove(input_path)
        except:
            pass

        return jsonify({
            'num_points': len(pcd.points),
            'avg_point_distance': float(avg_dist),
            'suggested_radius': float(avg_dist * 1.5),
            'has_normals': pcd.has_normals(),
            'has_colors': pcd.has_colors()
        })

    except Exception as e:
        return jsonify({
            'error': str(e),
            'type': type(e).__name__
        }), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 Ball Pivoting Mesh Server")
    print("="*60)
    print("📌 Endpoints:")
    print("   GET  /health          - Health check")
    print("   POST /mesh            - Create mesh from point cloud")
    print("   POST /mesh/stats      - Get point cloud statistics")
    print("="*60)
    print("🔧 Starting server...\n")

    # Run server
    app.run(host='0.0.0.0', port=5000, debug=True)
