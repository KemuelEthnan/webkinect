@echo off
echo ============================================================
echo Open3D Fix Script
echo ============================================================
echo.
echo This script will try to fix Open3D DLL error
echo.

echo [Step 1] Checking Python version...
python --version
if %errorlevel% neq 0 (
    echo ERROR: Python not found!
    pause
    exit /b 1
)
echo.

echo [Step 2] Checking Python architecture...
python -c "import struct; arch = struct.calcsize('P') * 8; print('Python Architecture:', arch, 'bit'); exit(0 if arch == 64 else 1)"
if %errorlevel% neq 0 (
    echo ERROR: You need 64-bit Python!
    echo Please install Python 64-bit from python.org
    pause
    exit /b 1
)
echo.

echo [Step 3] Uninstalling current Open3D...
pip uninstall open3d -y
echo.

echo [Step 4] Upgrading pip...
python -m pip install --upgrade pip
echo.

echo [Step 5] Installing compatible Open3D version...
echo Trying Open3D 0.16.0 (more stable on Windows)...
pip install open3d==0.16.0
echo.

echo [Step 6] Testing Open3D...
python -c "import open3d as o3d; print('✅ Open3D version:', o3d.__version__); pcd = o3d.geometry.PointCloud(); print('✅ Open3D works!')"
if %errorlevel% neq 0 (
    echo.
    echo ❌ Open3D 0.16.0 still failed!
    echo.
    echo Trying Open3D 0.13.0 (older but more compatible)...
    pip uninstall open3d -y
    pip install open3d==0.13.0
    echo.
    python -c "import open3d as o3d; print('✅ Open3D version:', o3d.__version__)"
    if %errorlevel% neq 0 (
        echo.
        echo ============================================================
        echo ❌ All Open3D versions failed!
        echo ============================================================
        echo.
        echo Please try these solutions:
        echo.
        echo 1. Install Visual C++ Redistributable:
        echo    https://aka.ms/vs/17/release/vc_redist.x64.exe
        echo.
        echo 2. Or use Anaconda/Miniconda:
        echo    conda create -n open3d python=3.9
        echo    conda activate open3d
        echo    conda install -c open3d-admin open3d
        echo.
        echo 3. See FIX_OPEN3D_ERROR.md for more solutions
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo ✅ Open3D fixed successfully!
echo ============================================================
echo.
echo You can now run:
echo     python app.py
echo.
pause
