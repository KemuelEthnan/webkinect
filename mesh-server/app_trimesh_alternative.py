"""
Ball Pivoting Alternative - Using Trimesh (Lighter than Open3D)
Gunakan file ini jika Open3D tidak bisa diinstall

Installation:
    pip install flask flask-cors trimesh numpy scipy

Trimesh lebih ringan dan mudah diinstall, tapi hasil mesh mungkin sedikit berbeda.
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import numpy as np
import trimesh
import json
import uuid
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB


def json_to_numpy(json_data):
    """Convert JSON point cloud to numpy arrays"""
    if isinstance(json_data, str):
        data = json.loads(json_data)
    else:
        data = json_data

    points = data.get('points', [])
    if not points:
        raise ValueError("No points in JSON data")

    coords = np.array([[p['x'], p['y'], p['z']] for p in points])
    colors = np.array([
        [p.get('r', 128), p.get('g', 128), p.get('b', 128)] for p in points
    ], dtype=np.uint8)

    return coords, colors


def reconstruct_mesh_alpha_shape(coords, colors, alpha=0.05):
    """
    Reconstruct mesh using Alpha Shape (similar to Ball Pivoting)
    Alpha Shape is a generalization of convex hull

    Args:
        coords: Nx3 numpy array of coordinates
        colors: Nx3 numpy array of colors (0-255)
        alpha: Alpha parameter (similar to ball radius in BPA)
               Smaller = more detail, Larger = smoother

    Returns:
        trimesh.Trimesh object
    """
    print(f" Creating mesh from {len(coords)} points...")
    print(f"   Alpha parameter: {alpha}")

    start_time = datetime.now()

    # Create point cloud
    point_cloud = trimesh.PointCloud(vertices=coords)

    # Compute normals (needed for mesh reconstruction)
    print(" Computing normals...")
    # Use PCA to estimate normals
    from scipy.spatial import cKDTree

    tree = cKDTree(coords)
    normals = []

    for i, point in enumerate(coords):
        # Find k nearest neighbors
        distances, indices = tree.query(point, k=min(20, len(coords)))

        # Get neighbor points
        neighbors = coords[indices]

        # Compute covariance matrix
        cov = np.cov(neighbors.T)

        # Eigendecomposition
        eigenvalues, eigenvectors = np.linalg.eig(cov)

        # Normal is eigenvector with smallest eigenvalue
        normal = eigenvectors[:, np.argmin(eigenvalues)]
        normals.append(normal)

    normals = np.array(normals)

    # Orient normals consistently (point toward viewer/camera)
    # Assume camera is at origin looking at -Z
    camera_pos = np.array([0, 0, 0])
    for i, (point, normal) in enumerate(zip(coords, normals)):
        view_dir = camera_pos - point
        if np.dot(normal, view_dir) < 0:
            normals[i] = -normal

    print(" Normals computed")

    # Ball Pivoting approximation using Delaunay triangulation with alpha shape
    print(" Creating mesh with Alpha Shape...")

    try:
        # Create alpha shape (similar to ball pivoting)
        # This filters triangles from Delaunay based on circumradius
        mesh = trimesh.creation.alpha_shape(coords, alpha=alpha)

        if mesh is None or len(mesh.faces) == 0:
            raise ValueError("Alpha shape failed, trying alternative method...")

    except Exception as e:
        print(f" Alpha shape failed: {e}")
        print(" Trying alternative: Convex Hull...")

        # Fallback to convex hull (simpler, always works)
        mesh = trimesh.convex.convex_hull(coords)

    elapsed = (datetime.now() - start_time).total_seconds()

    # Add vertex colors
    if len(colors) == len(mesh.vertices):
        mesh.visual.vertex_colors = colors
    else:
        # Interpolate colors to match mesh vertices
        from scipy.spatial import cKDTree
        tree = cKDTree(coords)
        distances, indices = tree.query(mesh.vertices, k=1)
        mesh.visual.vertex_colors = colors[indices]

    # Post-processing
    print(" Post-processing mesh...")

    # Remove duplicate vertices
    mesh.merge_vertices()

    # Remove degenerate faces
    mesh.remove_degenerate_faces()

    # Remove unreferenced vertices
    mesh.remove_unreferenced_vertices()

    # Fix normals
    mesh.fix_normals()

    print(f" Mesh created in {elapsed:.2f}s")
    print(f"   Vertices: {len(mesh.vertices):,}")
    print(f"   Faces: {len(mesh.faces):,}")

    return mesh, {
        'num_input_points': len(coords),
        'num_vertices': len(mesh.vertices),
        'num_triangles': len(mesh.faces),
        'processing_time': elapsed,
        'alpha_used': alpha
    }


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Ball Pivoting Mesh Server (Trimesh Alternative)',
        'version': '1.0.0-trimesh',
        'library': 'trimesh'
    })


@app.route('/mesh', methods=['POST'])
def create_mesh():
    """
    Generate mesh from point cloud using Alpha Shape (Trimesh)

    Query Parameters:
    - alpha: float (default: 0.05) - Alpha parameter for mesh reconstruction
           Smaller = more detail, Larger = smoother
    - format: string (default: 'ply') - Output format: 'ply', 'obj', 'stl'
    """
    try:
        file_id = str(uuid.uuid4())

        # Get parameters
        alpha = float(request.args.get('alpha', 0.05))
        # Map radius_multiplier to alpha (for compatibility)
        if 'radius_multiplier' in request.args:
            radius = float(request.args.get('radius_multiplier', 1.5))
            alpha = radius * 0.03  # Approximate conversion

        output_format = request.args.get('format', 'ply')

        print(f"\n{'='*60}")
        print(f" New mesh request: {file_id}")
        print(f"   Alpha: {alpha}, Format: {output_format}")
        print(f"{'='*60}\n")

        # Parse input
        content_type = request.content_type

        if content_type == 'application/json':
            json_data = request.get_json()
            coords, colors = json_to_numpy(json_data)
        else:
            # Try to load as PLY
            input_path = f"uploads/{file_id}.ply"
            with open(input_path, 'wb') as f:
                f.write(request.data)

            # Load with trimesh
            point_cloud = trimesh.load(input_path)
            coords = point_cloud.vertices
            colors = point_cloud.colors[:, :3] if hasattr(point_cloud, 'colors') else np.full(
                (len(coords), 3), 128, dtype=np.uint8)

            os.remove(input_path)

        # Generate mesh
        mesh, stats = reconstruct_mesh_alpha_shape(coords, colors, alpha)

        # Save mesh
        output_ext = output_format.lower()
        output_path = f"outputs/{file_id}.{output_ext}"

        mesh.export(output_path)
        print(f" Mesh saved to: {output_path}\n")

        # Return file
        response = send_file(
            output_path,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=f'mesh_{file_id}.{output_ext}'
        )

        # Add stats to headers
        response.headers['X-Num-Vertices'] = str(stats['num_vertices'])
        response.headers['X-Num-Triangles'] = str(stats['num_triangles'])
        response.headers['X-Processing-Time'] = str(stats['processing_time'])

        return response

    except Exception as e:
        print(f"\n Error: {str(e)}\n")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'type': type(e).__name__
        }), 500


@app.route('/mesh/stats', methods=['POST'])
def get_mesh_stats():
    """Get point cloud statistics"""
    try:
        file_id = str(uuid.uuid4())
        content_type = request.content_type

        if content_type == 'application/json':
            json_data = request.get_json()
            coords, colors = json_to_numpy(json_data)
        else:
            input_path = f"uploads/{file_id}.ply"
            with open(input_path, 'wb') as f:
                f.write(request.data)

            point_cloud = trimesh.load(input_path)
            coords = point_cloud.vertices
            os.remove(input_path)

        # Calculate statistics
        from scipy.spatial import cKDTree
        tree = cKDTree(coords)
        distances = []
        sample_size = min(100, len(coords))
        for i in range(0, len(coords), max(1, len(coords) // sample_size)):
            d, _ = tree.query(coords[i], k=2)  # Find nearest neighbor
            distances.append(d[1])  # [0] is self, [1] is nearest

        avg_dist = np.mean(distances)

        return jsonify({
            'num_points': len(coords),
            'avg_point_distance': float(avg_dist),
            'suggested_alpha': float(avg_dist * 1.5),
            'has_colors': True
        })

    except Exception as e:
        return jsonify({
            'error': str(e),
            'type': type(e).__name__
        }), 500


if __name__ == '__main__':
    print("\n" + "="*60)
    print("Ball Pivoting Alternative Server (Trimesh)")
    print("="*60)
    print("Using Trimesh library (lighter than Open3D)")
    print("Alpha Shape method (similar to Ball Pivoting)")
    print("="*60)
    print("Starting server...\n")

    app.run(host='0.0.0.0', port=5000, debug=True)
